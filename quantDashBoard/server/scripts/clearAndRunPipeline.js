/**
 * Clear portfoliotimeseries collection and run attempt.js pipeline
 * to recalculate TWR metrics
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ||
  "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

async function clearPortfolioTimeseries() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB");
    const db = mongoose.connection.db;

    console.log("\n=== Clearing portfoliotimeseries Collection ===");
    const collection = db.collection("portfoliotimeseries");
    const count = await collection.countDocuments();
    console.log(`  Found ${count} documents in portfoliotimeseries`);
    
    if (count > 0) {
      await collection.deleteMany({});
      console.log(`  ✓ Cleared ${count} documents from portfoliotimeseries`);
    } else {
      console.log(`  - portfoliotimeseries is already empty`);
    }

    console.log("\n=== Collection Cleared ===\n");
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error clearing collection:", error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    throw error;
  }
}

async function main() {
  try {
    console.log("Starting clear and pipeline process...\n");

    // Clear portfoliotimeseries collection
    await clearPortfolioTimeseries();

    console.log("✓ Database cleared successfully!");
    console.log("\nNext step: Run the attempt.js script to recalculate TWR metrics:");
    console.log("  cd archive/test && node attempt.js\n");

    process.exit(0);
  } catch (error) {
    console.error("\n✗ Process failed:", error);
    process.exit(1);
  }
}

main();

