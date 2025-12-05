/**
 * inspectDuplicates.js
 * 
 * Inspects duplicate activities in detail
 */

import mongoose from "mongoose";

const databaseUrl =
  process.env.DATABASE_URL ||
  (() => {
    throw new Error(
      "DATABASE_URL environment variable is required. Please set it in your .env file."
    );
  })();

async function inspectDuplicates() {
  try {
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB");
    const db = mongoose.connection.db;
    const activitiesCollection = db.collection("snaptradeaccountactivities");

    // Find all duplicate activities by content
    const duplicates = await activitiesCollection
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
            docs: { $push: "$$ROOT" },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    console.log(`\n=== Found ${duplicates.length} sets of duplicate activities ===\n`);

    for (const dup of duplicates) {
      console.log(`\nDuplicate Set:`);
      console.log(`  Account: ${dup._id.accountId}`);
      console.log(`  Date: ${dup._id.trade_date || dup._id.date}`);
      console.log(`  Type: ${dup._id.type}`);
      console.log(`  Amount: ${dup._id.amount}`);
      console.log(`  Symbol: ${dup._id.symbol || "undefined"}`);
      console.log(`  Count: ${dup.count}`);
      console.log(`  ActivityIds: ${dup.activityIds.join(", ")}`);
      
      console.log(`\n  Full documents:`);
      dup.docs.forEach((doc, idx) => {
        console.log(`\n    Document ${idx + 1}:`);
        console.log(`      _id: ${doc._id}`);
        console.log(`      activityId: ${doc.activityId}`);
        console.log(`      type: ${doc.type}`);
        console.log(`      amount: ${doc.amount}`);
        console.log(`      trade_date: ${doc.trade_date}`);
        console.log(`      date: ${doc.date}`);
        console.log(`      symbol: ${JSON.stringify(doc.symbol)}`);
        console.log(`      units: ${doc.units}`);
        console.log(`      price: ${doc.price}`);
        console.log(`      description: ${doc.description}`);
        console.log(`      createdAt: ${doc.createdAt}`);
        console.log(`      updatedAt: ${doc.updatedAt}`);
      });
    }

    // Check if these duplicates are causing issues in cash flow
    console.log(`\n\n=== Checking impact on cash flow ===`);
    const accountId = duplicates[0]?._id.accountId;
    if (accountId) {
      const accountActivities = await activitiesCollection
        .find({ accountId })
        .sort({ trade_date: 1, date: 1 })
        .toArray();

      const cashFlowByDate = new Map();
      for (const activity of accountActivities) {
        const dateRaw = activity.trade_date || activity.date;
        if (!dateRaw) continue;
        const date = new Date(dateRaw);
        date.setHours(0, 0, 0, 0);
        const dateKey = date.toISOString().split("T")[0];
        const amount = parseFloat(activity.amount || 0);
        if (isNaN(amount)) continue;

        cashFlowByDate.set(
          dateKey,
          (cashFlowByDate.get(dateKey) || 0) + amount
        );
      }

      // Check dates with duplicate activities
      console.log(`\nCash flow for dates with duplicates:`);
      for (const dup of duplicates) {
        const dateRaw = dup._id.trade_date || dup._id.date;
        if (!dateRaw) continue;
        const date = new Date(dateRaw);
        date.setHours(0, 0, 0, 0);
        const dateKey = date.toISOString().split("T")[0];
        const cashFlow = cashFlowByDate.get(dateKey) || 0;
        console.log(
          `  ${dateKey}: ${dup._id.type} ${dup._id.amount} x ${dup.count} = Cash flow: ${cashFlow}`
        );
      }
    }

    await mongoose.disconnect();
    console.log("\n=== Inspection complete ===");
  } catch (error) {
    console.error("Error inspecting duplicates:", error);
    process.exit(1);
  }
}

// Run if called directly
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("inspectDuplicates.js")
) {
  inspectDuplicates();
}

export { inspectDuplicates };

