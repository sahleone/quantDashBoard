/**
 * Script to clear all pipeline-related data from MongoDB
 * 
 * Clears:
 * - snaptradeaccountactivities (activities)
 * - pricehistories (price data)
 * - corporateactions (stock splits)
 * - portfoliotimeseries (cash/portfolio series)
 * 
 * Usage:
 *   DATABASE_URL=mongodb://... node archive/test/clearPipelineData.js
 */

import dotenv from "dotenv";
import { ensureDbConnection, getDb, disconnectDb } from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";

// Load environment variables from .env file
dotenv.config();

async function clearPipelineData() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    await ensureDbConnection(databaseUrl);
    const db = getDb();

    console.log("Clearing pipeline data from MongoDB...\n");

    // Collections to clear
    const collections = [
      "snaptradeaccountactivities",
      "pricehistories",
      "corporateactions",
      "portfoliotimeseries",
    ];

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        
        if (count > 0) {
          const result = await collection.deleteMany({});
          console.log(`✓ Cleared ${result.deletedCount} documents from ${collectionName}`);
        } else {
          console.log(`- ${collectionName} is already empty`);
        }
      } catch (error) {
        console.error(`✗ Error clearing ${collectionName}:`, error.message);
      }
    }

    console.log("\n✓ Pipeline data cleared successfully!");
  } catch (error) {
    await handleError(error);
  } finally {
    await disconnectDb();
  }
}

clearPipelineData()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

