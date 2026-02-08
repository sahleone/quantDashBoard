/**
 * Export all AccountActivities for a specific account ID to a JSON file
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const ACCOUNT_ID = "b199b32e-a5c2-44ab-b646-06901040df0c";
const outputFile = path.join(__dirname, `accountActivities_${ACCOUNT_ID}.json`);

async function exportAccountActivities() {
  try {
    const databaseUrl =
      process.env.DATABASE_URL ||
      (() => {
        throw new Error(
          "DATABASE_URL environment variable is required. Please set it in your .env file."
        );
      })();

    console.log("Connecting to MongoDB...");
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    await db.admin().ping();
    console.log("Database connection verified");

    console.log(`\nFetching account activities for account: ${ACCOUNT_ID}...`);

    const activitiesCollection = db.collection("snaptradeaccountactivities");

    const totalCount = await activitiesCollection.countDocuments({
      accountId: ACCOUNT_ID,
    });
    console.log(`Total activities found for this account: ${totalCount}`);

    if (totalCount === 0) {
      console.log("No activities found for this account.");
      await mongoose.disconnect();
      return;
    }

    const activities = await activitiesCollection
      .find({ accountId: ACCOUNT_ID })
      .sort({ date: 1, createdAt: 1 })
      .toArray();

    console.log(`\n✓ Fetched ${activities.length} activities`);

    // Get unique userIds from the activities
    const userIds = [
      ...new Set(activities.map((a) => a.userId).filter(Boolean)),
    ];

    // Get activity type breakdown
    const activityTypes = {};
    activities.forEach((activity) => {
      const type = activity.type || "UNKNOWN";
      activityTypes[type] = (activityTypes[type] || 0) + 1;
    });

    // Get date range
    const dates = activities
      .map((a) => a.date)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b));
    const earliestDate = dates.length > 0 ? dates[0] : null;
    const latestDate = dates.length > 0 ? dates[dates.length - 1] : null;

    const summary = {
      accountId: ACCOUNT_ID,
      totalActivities: activities.length,
      uniqueUserIds: userIds,
      dateRange: {
        earliest: earliestDate,
        latest: latestDate,
      },
      activityTypes: activityTypes,
    };

    const output = {
      exportDate: new Date().toISOString(),
      accountId: ACCOUNT_ID,
      summary: summary,
      activities: activities,
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf8");

    console.log(`\n✓ Successfully exported ${activities.length} activities`);
    console.log(`✓ Saved to: ${outputFile}`);
    console.log(
      `\nFile size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(
        2
      )} MB`
    );

    console.log(`\nSummary:`);
    console.log(`  - Account ID: ${ACCOUNT_ID}`);
    console.log(`  - Total activities: ${activities.length}`);
    console.log(`  - User IDs: ${userIds.join(", ") || "None"}`);
    console.log(`  - Date range: ${earliestDate || "N/A"} to ${latestDate || "N/A"}`);
    console.log(`\nActivity types breakdown:`);
    Object.entries(activityTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });

    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("Error exporting account activities:", error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  }
}

exportAccountActivities();


