/**
 * updateActivitiesTable.js
 *
 * Fetches activities from SnapTrade for accounts listed in `AccountsList` and
 * upserts them into the `AccountActivities` collection. For each account the
 * script determines the last known activity date (via `getLastActivityDate`) and
 * requests activities from that date onward.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - activityTypes: comma-separated list of activity types to request
 *  - userId: optional; when set only process that user
 *  - userSecret: optional; used for the single-user flow when provided
 *
 * In bulk mode (no userId) the script iterates the `Users` collection and uses
 * each user record's `userSecret` to call the SnapTrade endpoints.
 */

import mongoose from "mongoose";

// Project models and client - paths are relative to this metrics folder
import AccountsList from "../../quantDashBoard/server/src/models/AccountsList.js";
import Activities from "../../quantDashBoard/server/src/models/AccountActivities.js";
import AccountServiceClientService from "../../quantDashBoard/server/src/clients/accountClient.js";
import getLastActivityDate from "../helper/helper.js";
import Users from "../../quantDashBoard/server/src/models/Users.js";

/**
 * Update the AccountActivities collection from SnapTrade for all accounts.
 *
 * Behavior / assumptions:
 * - Connects to MongoDB using DATABASE_URL or the provided databaseUrl option.
 * - For each account in `AccountsList` determine the last activity
 *   date (prefer `trade_date`/`date` from existing Activities entries 'AccountActivities'). If a
 *   last activity date is present the script requests activities from that date
 *   onward (inclusive and deduplicate). If no date exists, it will request all activities.
 * - Activities are transformed by the existing AccountServiceClientService helper
 *   and upserted into the `AccountActivities` collection by `accountId` + `activityId`.
 *
 * Options:
 *  - databaseUrl: MongoDB connection string
 *  - activityTypes: comma-separated activity types to request
 *  - userId: optional string to process only a specific userId
 *  - userSecret: optional string to use as the SnapTrade userSecret for the specified userId
 *  Note: input will be a userId or userId and userSecret pair or nothing(bulk mode)
 */
export async function updateAccountActivitiesTable(opts = {}) {
  const databaseUrl =
    opts.databaseUrl ||
    process.env.DATABASE_URL ||
    (() => {
      throw new Error(
        "DATABASE_URL environment variable is required. Please set it in your .env file."
      );
    })();
  const activityTypes =
    opts.activityTypes ||
    "BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER";
  const userSecrets = opts.userSecrets || {};
  // userSecrets may be provided by callers but are not used in bulk mode.
  const userId = opts.userId || null;

  // Connect to MongoDB if not already connected
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(databaseUrl, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      });

      console.log(
        "Connected to MongoDB (readyState:",
        mongoose.connection.readyState,
        ")"
      );

      // Test connection with a ping to ensure it's actually working
      try {
        await mongoose.connection.db.admin().ping();
        console.log("Database ping successful - connection is ready");

        // Test a direct query to see if the connection works for queries
        const db = mongoose.connection.db;
        const usersCollection = db.collection("users");
        const userCount = await usersCollection.countDocuments({});
        console.log(
          `Direct query test successful - found ${userCount} users in collection`
        );
      } catch (pingErr) {
        console.error("Connection test failed:", pingErr?.message || pingErr);
        throw new Error(
          `Connection test failed: ${pingErr?.message || pingErr}`
        );
      }
    } catch (err) {
      console.error("Failed to connect to MongoDB:", err?.message || err);
      throw err;
    }
  }

  const summary = {
    totalAccounts: 0,
    processed: 0,
    skipped: 0,
    upsertedDocs: 0,
    errors: [],
  };

  const accountService = new AccountServiceClientService();

  // Process accounts for a single user using provided userSecret
  async function processAccountsForUser(userId, userSecret) {
    // Use direct connection query since model queries are timing out
    const db = mongoose.connection.db;
    const accountsCollection = db.collection("snaptradeaccounts");
    const accounts = await accountsCollection.find({ userId }).toArray();
    summary.totalAccounts += accounts.length;

    for (const acct of accounts) {
      try {
        const accountId = acct.accountId;

        const lastActivityDate = await getLastActivityDate(
          Activities,
          accountId
        );
        const startDate = lastActivityDate || null;

        console.log(
          `Fetching activities for account ${accountId} (user ${userId}) from ${
            startDate || "beginning"
          }`
        );

        const rawActivities = await accountService.listAllAccountActivities(
          userId,
          userSecret,
          accountId,
          10000,
          startDate,
          null,
          activityTypes
        );

        if (!Array.isArray(rawActivities) || rawActivities.length === 0) {
          console.log(`No new activities for account ${accountId}`);
          summary.processed++;
          continue;
        }

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
          // Use direct connection bulkWrite since model queries are timing out
          const db = mongoose.connection.db;
          const activitiesCollection = db.collection(
            "snaptradeaccountactivities"
          );
          const res = await activitiesCollection.bulkWrite(ops, {
            ordered: false,
          });
          const upserted = res.upsertedCount || res.nUpserted || 0;
          const modified = res.modifiedCount || res.nModified || 0;
          summary.upsertedDocs += upserted + modified;
          console.log(
            `Upserted/modified ${
              upserted + modified
            } activities for account ${accountId}`
          );
        }

        summary.processed++;
      } catch (err) {
        console.error(
          `Error processing account ${acct?.accountId}:`,
          err?.message || err
        );
        summary.errors.push({
          accountId: acct?.accountId,
          error: err?.message || String(err),
        });
      }
    }
  }

  // Decide which users to process based on opts
  const passedUserSecret = opts.userSecret || null; // optional secret when caller provides userId + userSecret
  const targetUserId = opts.userId || null;

  // If a specific userId is provided, only update that user's accounts.
  // If userSecret isn't provided, look it up in the Users collection.
  if (targetUserId) {
    let userSecretToUse = opts.userSecret || null;

    if (!userSecretToUse) {
      // Use direct connection query since model queries are timing out
      const db = mongoose.connection.db;
      const usersCollection = db.collection("users");
      const userDoc = await usersCollection.findOne({ userId: targetUserId });
      userSecretToUse = userDoc?.userSecret || null;
    }

    if (!userSecretToUse) {
      console.warn(
        `opts.userId provided but no userSecret found for userId=${targetUserId}; aborting.`
      );
      await mongoose.disconnect();
      return summary;
    }

    console.log(`Processing only userId=${targetUserId}`);
    try {
      await processAccountsForUser(targetUserId, userSecretToUse);
    } catch (err) {
      console.error(
        `Error processing accounts for user ${targetUserId}:`,
        err?.message || err
      );
      summary.errors.push({
        userId: targetUserId,
        error: err?.message || String(err),
      });
    }

    await mongoose.disconnect();
    return summary;
  }

  // Bulk mode: iterate all users and use the `userSecret` stored in Users.
  console.log("Running bulk update for all users");
  // Use direct connection query since model queries are timing out
  const db = mongoose.connection.db;
  const usersCollection = db.collection("users");
  const users = await usersCollection.find({}).toArray();

  for (const user of users) {
    const uid = String(user.userId || user._id || "");

    // Use the userSecret from the user record in Users.
    let userSecretToUse = user.userSecret || null;

    if (!userSecretToUse) {
      console.warn(
        `No SnapTrade userSecret available for user ${uid}; skipping user.`
      );
      summary.skipped++;
      continue;
    }

    try {
      await processAccountsForUser(uid, userSecretToUse);
    } catch (err) {
      console.error(
        `Error processing accounts for user ${uid}:`,
        err?.message || err
      );
      summary.errors.push({ userId: uid, error: err?.message || String(err) });
    }
  }

  // Close connection
  await mongoose.disconnect();

  return summary;
}

// CLI runner
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("updateActivitiesTable.js")
) {
  (async () => {
    try {
      console.log("Starting updateAccountActivitiesTable...");
      const result = await updateAccountActivitiesTable();
      console.log(
        "updateAccountActivitiesTable result:",
        JSON.stringify(result, null, 2)
      );
      process.exit(0);
    } catch (err) {
      console.error("updateAccountActivitiesTable failed:", err);
      process.exit(2);
    }
  })();
}
