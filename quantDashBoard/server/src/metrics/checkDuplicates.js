/**
 * checkDuplicates.js
 * 
 * Checks for duplicate activities in the snaptradeaccountactivities collection
 */

import mongoose from "mongoose";

const databaseUrl =
  process.env.DATABASE_URL ||
  (() => {
    throw new Error(
      "DATABASE_URL environment variable is required. Please set it in your .env file."
    );
  })();

async function checkDuplicates() {
  try {
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB");
    const db = mongoose.connection.db;
    const activitiesCollection = db.collection("snaptradeaccountactivities");

    // 1. Check for duplicate activityId + accountId (should be unique)
    console.log("\n=== Checking for duplicate activityId + accountId ===");
    const duplicateActivityIds = await activitiesCollection
      .aggregate([
        {
          $group: {
            _id: { accountId: "$accountId", activityId: "$activityId" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    console.log(`Found ${duplicateActivityIds.length} duplicate activityId+accountId pairs`);
    if (duplicateActivityIds.length > 0) {
      console.log("Sample duplicates:");
      duplicateActivityIds.slice(0, 10).forEach((dup) => {
        console.log(
          `  Account: ${dup._id.accountId}, ActivityId: ${dup._id.activityId}, Count: ${dup.count}`
        );
      });
    }

    // 2. Check for duplicate activities by content (same accountId, date, type, amount, symbol)
    console.log("\n=== Checking for duplicate activities by content ===");
    const duplicateContent = await activitiesCollection
      .aggregate([
        {
          $group: {
            _id: {
              accountId: "$accountId",
              trade_date: "$trade_date",
              date: "$date",
              type: "$type",
              amount: "$amount",
              symbol: "$symbol.symbol",
            },
            count: { $sum: 1 },
            activityIds: { $push: "$activityId" },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    console.log(`Found ${duplicateContent.length} sets of duplicate activities by content`);
    if (duplicateContent.length > 0) {
      console.log("Sample duplicates:");
      duplicateContent.slice(0, 10).forEach((dup) => {
        console.log(
          `  Account: ${dup._id.accountId}, Date: ${dup._id.trade_date || dup._id.date}, Type: ${dup._id.type}, Amount: ${dup._id.amount}, Symbol: ${dup._id.symbol}, Count: ${dup.count}`
        );
        console.log(`    ActivityIds: ${dup.activityIds.join(", ")}`);
      });
    }

    // 3. Check total count vs unique activityId count
    console.log("\n=== Checking total vs unique counts ===");
    const totalCount = await activitiesCollection.countDocuments();
    const uniqueActivityIdCount = await activitiesCollection.distinct(
      "activityId",
      {}
    );
    console.log(`Total activities: ${totalCount}`);
    console.log(`Unique activityIds: ${uniqueActivityIdCount.length}`);
    console.log(
      `Difference: ${totalCount - uniqueActivityIdCount.length} potential duplicates`
    );

    // 4. Check for same activityId across different accounts (might be valid)
    console.log("\n=== Checking for same activityId across different accounts ===");
    const crossAccountDuplicates = await activitiesCollection
      .aggregate([
        {
          $group: {
            _id: "$activityId",
            accounts: { $addToSet: "$accountId" },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    console.log(
      `Found ${crossAccountDuplicates.length} activityIds appearing in multiple accounts`
    );
    if (crossAccountDuplicates.length > 0) {
      console.log("Sample cross-account duplicates:");
      crossAccountDuplicates.slice(0, 5).forEach((dup) => {
        console.log(
          `  ActivityId: ${dup._id}, Accounts: ${dup.accounts.join(", ")}, Total count: ${dup.count}`
        );
      });
    }

    // 5. Check for duplicate accountId + activityId specifically
    console.log("\n=== Detailed duplicate accountId + activityId check ===");
    const detailedDups = await activitiesCollection
      .aggregate([
        {
          $group: {
            _id: { accountId: "$accountId", activityId: "$activityId" },
            count: { $sum: 1 },
            docs: { $push: "$$ROOT" },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 5 },
      ])
      .toArray();

    if (detailedDups.length > 0) {
      console.log("Detailed view of duplicates:");
      for (const dup of detailedDups) {
        console.log(
          `\n  Account: ${dup._id.accountId}, ActivityId: ${dup._id.activityId}, Count: ${dup.count}`
        );
        dup.docs.slice(0, 2).forEach((doc, idx) => {
          console.log(`    Doc ${idx + 1}:`);
          console.log(`      Type: ${doc.type}`);
          console.log(`      Date: ${doc.trade_date || doc.date}`);
          console.log(`      Amount: ${doc.amount}`);
          console.log(`      Symbol: ${doc.symbol?.symbol || "N/A"}`);
        });
      }
    }

    await mongoose.disconnect();
    console.log("\n=== Check complete ===");
  } catch (error) {
    console.error("Error checking duplicates:", error);
    process.exit(1);
  }
}

// Run if called directly
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("checkDuplicates.js")
) {
  checkDuplicates();
}

export { checkDuplicates };

