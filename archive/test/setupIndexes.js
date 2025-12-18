/**
 * Script to create MongoDB indexes for preventing query timeouts
 * 
 * Usage:
 *   DATABASE_URL=mongodb://... node archive/test/setupIndexes.js
 */

import { ensureDbConnection, getDb, disconnectDb } from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";

async function setupIndexes() {
  const databaseUrl = process.env.DATABASE_URL;

  try {
    console.log("Connecting to MongoDB...");
    await ensureDbConnection(databaseUrl);
    const db = getDb();

    console.log("\n=== Setting up indexes for snaptradeaccountactivities ===\n");

    const activitiesCollection = db.collection("snaptradeaccountactivities");

    // Check existing indexes
    const existingIndexes = await activitiesCollection.indexes();
    console.log("Existing indexes:");
    existingIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log("\nCreating/updating indexes...\n");

    // Create indexes (MongoDB will skip if they already exist)
    try {
      await activitiesCollection.createIndex(
        { accountId: 1, trade_date: 1 },
        { name: "accountId_trade_date_idx", background: true }
      );
      console.log("✓ Created index: accountId + trade_date");
    } catch (err) {
      if (err.code === 85) {
        console.log("✓ Index already exists: accountId + trade_date");
      } else {
        console.log(`  ⚠ Error creating accountId + trade_date index: ${err.message}`);
      }
    }

    try {
      await activitiesCollection.createIndex(
        { accountId: 1, date: 1 },
        { name: "accountId_date_idx", background: true }
      );
      console.log("✓ Created index: accountId + date");
    } catch (err) {
      if (err.code === 85) {
        console.log("✓ Index already exists: accountId + date");
      } else {
        console.log(`  ⚠ Error creating accountId + date index: ${err.message}`);
      }
    }

    try {
      await activitiesCollection.createIndex(
        { accountId: 1 },
        { name: "accountId_idx", background: true }
      );
      console.log("✓ Created index: accountId");
    } catch (err) {
      if (err.code === 85) {
        console.log("✓ Index already exists: accountId");
      } else {
        console.log(`  ⚠ Error creating accountId index: ${err.message}`);
      }
    }

    try {
      await activitiesCollection.createIndex(
        { accountId: 1, activityId: 1 },
        { name: "accountId_activityId_idx", unique: true, background: true }
      );
      console.log("✓ Created unique index: accountId + activityId");
    } catch (err) {
      if (err.code === 85) {
        console.log("✓ Index already exists: accountId + activityId");
      } else {
        console.log(`  ⚠ Error creating accountId + activityId index: ${err.message}`);
      }
    }

    console.log("\n=== Final index list ===\n");
    const finalIndexes = await activitiesCollection.indexes();
    finalIndexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log("\n✓ Index setup complete!\n");
    console.log("These indexes will significantly speed up queries and prevent timeouts.");
    console.log("Queries filtering by accountId should now complete in milliseconds instead of minutes.\n");

  } catch (err) {
    handleError(err, "Error setting up indexes");
  } finally {
    await disconnectDb();
  }
}

setupIndexes().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

