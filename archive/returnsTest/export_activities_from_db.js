/**
 * Export all AccountActivities from database to JSON file
 * Compatible with Python activities.py script format
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

const outputPath = path.join(__dirname, "activities.json");

async function exportActivities() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(DATABASE_URL, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    await db.admin().ping();
    console.log("Database connection verified");

    const activitiesCollection = db.collection("snaptradeaccountactivities");

    console.log("Fetching all activities from MongoDB...");
    const activities = await activitiesCollection.find({}).toArray();
    console.log(`Found ${activities.length} activities`);

    if (activities.length === 0) {
      console.log("No activities found in database.");
      await mongoose.disconnect();
      return;
    }

    const output = {
      activities: activities.map((activity) => {
        const symbolStr = activity.symbol || activity.symbolObj?.symbol;
        const symbolObj = symbolStr ? { symbol: symbolStr } : null;

        return {
          activityId: activity.activityId || activity.id,
          accountId: activity.accountId,
          userId: activity.userId,
          date: activity.date || activity.trade_date,
          trade_date: activity.trade_date || activity.date,
          settlement_date: activity.settlement_date,
          type: activity.type,
          symbol: symbolObj,
          units: activity.units || activity.quantity || 0,
          quantity: activity.quantity || activity.units || 0,
          amount: activity.amount || 0,
          price: activity.price,
          currency: activity.currency,
          fee: activity.fee,
          description: activity.description,
          option_symbol: activity.option_symbol,
          option_type: activity.option_type,
          institution: activity.institution,
          raw: activity.raw,
        };
      }),
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
    console.log(`✓ Exported ${activities.length} activities to ${outputPath}`);
    console.log(
      `File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`
    );

    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("Error exporting activities:", error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  }
}

exportActivities();
