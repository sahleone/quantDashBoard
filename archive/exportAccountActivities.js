/**
 * Export all AccountActivities from all accounts in the database to a JSON file
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const outputFile = path.join(__dirname, "accountActivities_all.json");

async function exportAllAccountActivities() {
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

    console.log("\nFetching all account activities from database...");

    const activitiesCollection = db.collection("snaptradeaccountactivities");

    const totalCount = await activitiesCollection.countDocuments({});
    console.log(`Total activities in collection: ${totalCount}`);

    if (totalCount === 0) {
      console.log("No activities found in database.");
      await mongoose.disconnect();
      return;
    }

    const activities = await activitiesCollection
      .find({})
      .sort({ userId: 1, accountId: 1, date: 1, createdAt: 1 })
      .toArray();

    console.log(`\n✓ Fetched ${activities.length} activities`);

    const userIds = [
      ...new Set(activities.map((a) => a.userId).filter(Boolean)),
    ];
    const accountIds = [
      ...new Set(activities.map((a) => a.accountId).filter(Boolean)),
    ];

    console.log(`\nSummary:`);
    console.log(`  - Total activities: ${activities.length}`);
    console.log(`  - Unique userIds: ${userIds.length}`);
    console.log(`  - Unique accountIds: ${accountIds.length}`);

    const activitiesByUser = {};
    const activitiesByAccount = {};

    activities.forEach((activity) => {
      const userId = activity.userId || "unknown";
      const accountId = activity.accountId || "unknown";

      if (!activitiesByUser[userId]) {
        activitiesByUser[userId] = [];
      }
      activitiesByUser[userId].push(activity);

      if (!activitiesByAccount[accountId]) {
        activitiesByAccount[accountId] = [];
      }
      activitiesByAccount[accountId].push(activity);
    });

    const summary = {
      userIds: Object.keys(activitiesByUser).map((userId) => ({
        userId,
        count: activitiesByUser[userId].length,
      })),
      accounts: Object.keys(activitiesByAccount).map((accountId) => ({
        accountId,
        count: activitiesByAccount[accountId].length,
      })),
    };

    const output = {
      exportDate: new Date().toISOString(),
      totalActivities: activities.length,
      uniqueUserIds: userIds.length,
      uniqueAccountIds: accountIds.length,
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

    console.log(`\nBreakdown by userId:`);
    Object.entries(activitiesByUser)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([userId, userActivities]) => {
        console.log(`  - ${userId}: ${userActivities.length} activities`);
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

exportAllAccountActivities();
