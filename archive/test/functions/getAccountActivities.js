import { ensureDbConnection, getDb } from "../utils/dbConnection.js";
import AccountServiceClientService from "../../../quantDashBoard/server/src/clients/accountClient.js";

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

    const activities = await activitiesCollection.find({ accountId }).toArray();

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

        const ops = transformed.map((doc) => ({
          updateOne: {
            filter: { accountId: doc.accountId, activityId: doc.activityId },
            update: { $set: doc },
            upsert: true,
          },
        }));

        if (ops.length > 0) {
          await activitiesCollection.bulkWrite(ops, { ordered: false });

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
    }

    return activities;
  } catch (err) {
    console.error("Error fetching account activities:", err?.message || err);
    throw err;
  }
}
