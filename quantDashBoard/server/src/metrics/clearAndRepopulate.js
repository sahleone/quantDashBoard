/**
 * clearAndRepopulate.js
 * 
 * Clears all pipeline collections and repopulates them by running the full pipeline
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { updateAccountActivitiesTable } from "./updateTable/updateActivitiesTable.js";
import { updateEquitiesWeightTable } from "./updateTable/updateEquitiesWeightTable.js";
import { runMetricsPipeline } from "./runMetricsPipeline.js";

// Load .env file if it exists
dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ||
  (() => {
    throw new Error(
      "DATABASE_URL environment variable is required. Please set it in your .env file."
    );
  })();

// Collections to clear (pipeline-generated data)
const COLLECTIONS_TO_CLEAR = [
  "snaptradeaccountactivities", // Activities
  "equitiesweighttimeseries",   // Position weights
  "pricehistory",               // Price data
  "corporateactions",           // Corporate actions (splits, dividends)
  "portfoliotimeseries",        // Portfolio valuations
  "snaptrademetrics",           // Calculated metrics
];

async function clearCollections() {
  try {
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB");
    const db = mongoose.connection.db;

    console.log("\n=== Clearing Collections ===");
    const errors = [];
    
    for (const collectionName of COLLECTIONS_TO_CLEAR) {
      try {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        console.log(`  Clearing ${collectionName} (${count} documents)...`);
        await collection.deleteMany({});
        console.log(`  ✓ Cleared ${collectionName}`);
      } catch (error) {
        const errorMsg = `Error clearing ${collectionName}: ${error.message}`;
        console.error(`  ✗ ${errorMsg}`);
        errors.push({ collection: collectionName, error: error.message });
      }
    }

    // If any collection failed to clear, throw an error to prevent repopulation
    if (errors.length > 0) {
      const errorSummary = errors
        .map((e) => `${e.collection}: ${e.error}`)
        .join("; ");
      throw new Error(
        `Failed to clear ${errors.length} collection(s): ${errorSummary}`
      );
    }

    console.log("\n=== Collections Cleared ===\n");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error clearing collections:", error);
    // Ensure we disconnect even on error
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    throw error;
  }
}

async function repopulate() {
  console.log("=== Repopulating Data ===\n");

  // Step 1: Update Activities
  console.log("Step 1: Updating Activities...");
  try {
    const activitiesResult = await updateAccountActivitiesTable({
      databaseUrl,
      activityTypes:
        "BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER",
    });
    console.log("  ✓ Activities updated");
    console.log(`    Processed: ${activitiesResult.processed}`);
    console.log(`    Upserted: ${activitiesResult.upsertedDocs}`);
  } catch (error) {
    console.error("  ✗ Error updating activities:", error.message);
    throw error;
  }

  // Step 2: Update Equities Weight Table
  console.log("\nStep 2: Updating Equities Weight Table...");
  try {
    const equitiesResult = await updateEquitiesWeightTable({
      databaseUrl,
      fullSync: true,
    });
    console.log("  ✓ Equities weight table updated");
    console.log(`    Processed: ${equitiesResult.processed}`);
    console.log(`    Total records: ${equitiesResult.totalRecords}`);
  } catch (error) {
    console.error("  ✗ Error updating equities weight:", error.message);
    throw error;
  }

  // Step 3: Run Full Pipeline (Price Data, Portfolio Timeseries, Metrics)
  console.log("\nStep 3: Running Full Metrics Pipeline...");
  try {
    const pipelineResult = await runMetricsPipeline({
      databaseUrl,
      fullSync: true,
      steps: ["price", "valuation", "returns", "metrics", "validate"],
    });
    console.log("  ✓ Pipeline completed");
    
    if (pipelineResult.errors && pipelineResult.errors.length > 0) {
      console.log(`    Warnings: ${pipelineResult.errors.length} errors occurred`);
    }
  } catch (error) {
    console.error("  ✗ Error running pipeline:", error.message);
    throw error;
  }

  console.log("\n=== Repopulation Complete ===");
}

async function main() {
  try {
    console.log("Starting clear and repopulate process...\n");

    // Clear collections
    await clearCollections();

    // Repopulate
    await repopulate();

    console.log("\n✓ All done!");
    process.exit(0);
  } catch (error) {
    console.error("\n✗ Process failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("clearAndRepopulate.js")
) {
  main();
}

export { clearCollections, repopulate };

