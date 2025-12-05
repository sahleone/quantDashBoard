/**
 * clearPortfolioTables.js
 *
 * Clears portfolio-related tables (portfoliotimeseries and snaptrademetrics)
 * and runs the pipeline to rebuild them
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { runMetricsPipeline } from "./runMetricsPipeline.js";

// Load .env file if it exists
dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL || "mongodb://localhost:27017/quantDashboard";

// Collections to clear (portfolio-related, downstream from activities/positions/prices)
const COLLECTIONS_TO_CLEAR = [
  "portfoliotimeseries", // Portfolio valuations (depends on activities, positions, prices)
  "snaptrademetrics", // Calculated metrics (depends on portfolio timeseries)
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

    console.log("\n=== Clearing Portfolio-Related Collections ===");
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

    // If any collection failed to clear, throw an error
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

async function runPipeline() {
  console.log("=== Running Metrics Pipeline ===\n");
  try {
    const pipelineResult = await runMetricsPipeline({
      databaseUrl,
      fullSync: true,
      steps: ["price", "valuation", "returns", "metrics", "validate"],
    });
    console.log("\n✓ Pipeline completed");

    if (pipelineResult.errors && pipelineResult.errors.length > 0) {
      console.log(
        `  Warnings: ${pipelineResult.errors.length} errors occurred`
      );
      pipelineResult.errors.forEach((err) => {
        console.log(`    - ${err.step}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error("  ✗ Error running pipeline:", error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log("Starting clear portfolio tables and pipeline process...\n");

    // Clear collections
    await clearCollections();

    // Run pipeline
    await runPipeline();

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
  process.argv[1].endsWith("clearPortfolioTables.js")
) {
  main();
}

export { clearCollections, runPipeline };
