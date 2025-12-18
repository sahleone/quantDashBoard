import { ensureDbConnection, getDb } from "../utils/dbConnection.js";
import AccountServiceClientService from "../../../quantDashBoard/server/src/clients/accountClient.js";
import mongoose from "mongoose";

/**
 * Gets all account activities for a given account from MongoDB.
 * If the last activity date is not today, fetches missing data from SnapTrade,
 * updates MongoDB, and returns the complete sorted array.
 *
 * @param {Object} opts - Options object
 * @param {string} opts.accountId - Account ID to fetch activities for
 * @param {string} opts.databaseUrl - MongoDB connection string (defaults to DATABASE_URL env var)
 * @param {string} opts.userId - Optional userId (will be fetched from account if not provided)
 * @param {string} opts.userSecret - Optional userSecret (will be fetched from user if not provided)
 * @returns {Promise<Array>} Sorted array of account activities
 */
export async function getAccountActivities(opts = {}) {
  const {
    accountId,
    databaseUrl,
    userId: providedUserId,
    userSecret: providedUserSecret,
  } = opts;

  if (!accountId) {
    throw new Error("accountId is required");
  }

  // Ensure MongoDB connection
  await ensureDbConnection(databaseUrl);

  const db = getDb();
  const accountsCollection = db.collection("snaptradeaccounts");
  const activitiesCollection = db.collection("snaptradeaccountactivities");
  const usersCollection = db.collection("users");

  try {
    const account = await accountsCollection.findOne({ accountId });
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const userId = providedUserId || account.userId;
    if (!userId) {
      throw new Error(`No userId found for account: ${accountId}`);
    }

    let userSecret = providedUserSecret;
    if (!userSecret) {
      const user = await usersCollection.findOne({ userId });
      if (!user || !user.userSecret) {
        throw new Error(`No userSecret found for userId: ${userId}`);
      }
      userSecret = user.userSecret;
    }

    // Use native MongoDB driver to query activities (with timeout handling)
    let activities;
    try {
      // First try: full query with longer timeout
      activities = await Promise.race([
        activitiesCollection.find({ accountId }).toArray(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Query timeout after 120s")), 120000)
        ),
      ]);
    } catch (queryError) {
      if (queryError.message.includes("timeout")) {
        console.error(
          `Query timeout for account ${accountId}, trying with limit and no sort...`
        );
        // Try with a limit and no sort (faster)
        try {
          activities = await Promise.race([
            activitiesCollection
              .find({ accountId })
              .limit(50000) // Larger limit
              .toArray(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Limited query timeout after 90s")),
                90000
              )
            ),
          ]);
          // Sort in memory after fetching
          activities.sort((a, b) => {
            const dateA = a.trade_date || a.date;
            const dateB = b.trade_date || b.date;
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            return new Date(dateA) - new Date(dateB);
          });
          console.log(
            `  Retrieved ${activities.length} activities (limited query, sorted in memory)`
          );
        } catch (limitError) {
          if (limitError.message.includes("timeout")) {
            console.error(
              `  Still timing out, trying with smaller limit and projection...`
            );
            // Last resort: smaller limit with projection to reduce data transfer
            try {
              activities = await activitiesCollection
                .find(
                  { accountId },
                  {
                    projection: {
                      accountId: 1,
                      activityId: 1,
                      date: 1,
                      trade_date: 1,
                      type: 1,
                      symbol: 1,
                      units: 1,
                      quantity: 1,
                      amount: 1,
                      price: 1,
                      currency: 1,
                    },
                  }
                )
                .limit(20000)
                .toArray();
              // Sort in memory
              activities.sort((a, b) => {
                const dateA = a.trade_date || a.date;
                const dateB = b.trade_date || b.date;
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                return new Date(dateA) - new Date(dateB);
              });
              console.log(
                `  Retrieved ${activities.length} activities (projection query)`
              );
            } catch (projectionError) {
              throw new Error(
                `Failed to query activities: ${projectionError.message}`
              );
            }
          } else {
            throw new Error(
              `Failed to query activities even with limit: ${limitError.message}`
            );
          }
        }
      } else {
        throw queryError;
      }
    }

    activities.sort((a, b) => {
      const dateA = a.trade_date || a.date;
      const dateB = b.trade_date || b.date;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateA) - new Date(dateB);
    });

    let lastActivityDate = null;
    if (activities.length > 0) {
      const lastActivity = activities[activities.length - 1];
      const dateValue = lastActivity.trade_date || lastActivity.date;
      if (dateValue) {
        lastActivityDate = new Date(dateValue);
        lastActivityDate.setHours(0, 0, 0, 0);
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isUpToDate =
      lastActivityDate && lastActivityDate.getTime() === today.getTime();

    if (!isUpToDate) {
      const startDate = lastActivityDate ? new Date(lastActivityDate) : null;

      if (startDate) {
        startDate.setDate(startDate.getDate() + 1);
      }

      try {
        const accountService = new AccountServiceClientService();
        const activityTypes =
          "BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER";

        const rawActivities = await accountService.listAllAccountActivities(
          userId,
          userSecret,
          accountId,
          1000,
          startDate ? startDate.toISOString().split("T")[0] : null,
          null,
          activityTypes
        );

        if (Array.isArray(rawActivities) && rawActivities.length > 0) {
          const transformed = accountService.transformActivitiesForMongoDB(
            rawActivities,
            accountId,
            userId
          );

          // Use native MongoDB driver to upsert activities
          const ops = transformed.map((doc) => ({
            updateOne: {
              filter: { accountId: doc.accountId, activityId: doc.activityId },
              update: { $set: doc },
              upsert: true,
            },
          }));

          if (ops.length > 0) {
            await activitiesCollection.bulkWrite(ops, { ordered: false });

            // Use native MongoDB driver to query updated activities
            const updatedActivities = await activitiesCollection
              .find({ accountId })
              .toArray();

            updatedActivities.sort((a, b) => {
              const dateA = a.trade_date || a.date;
              const dateB = b.trade_date || b.date;
              if (!dateA && !dateB) return 0;
              if (!dateA) return 1;
              if (!dateB) return -1;
              return new Date(dateA) - new Date(dateB);
            });

            return updatedActivities;
          }
        }
      } catch (syncError) {
        // If sync fails (e.g., timeout, API error), log but return cached activities
        console.error(
          `Warning: Failed to sync activities from SnapTrade for account ${accountId}: ${syncError.message}`
        );
        console.error(
          `  Returning cached activities from database (${activities.length} activities)`
        );
        // Return the cached activities we already have
        return activities;
      }
    }

    return activities;
  } catch (err) {
    console.error("Error fetching account activities:", err?.message || err);
    throw err;
  }
}
