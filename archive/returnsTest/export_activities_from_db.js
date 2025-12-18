import { ensureDbConnection, getDb, disconnectDb } from "../test/utils/dbConnection.js";
import fs from "fs";

const DATABASE_URL = process.env.DATABASE_URL || "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

async function exportActivities() {
  try {
    await ensureDbConnection(DATABASE_URL);
    const db = getDb();
    const activitiesCollection = db.collection("snaptradeaccountactivities");

    // Get all activities
    console.log("Fetching activities from MongoDB...");
    const activities = await activitiesCollection.find({}).toArray();
    console.log(`Found ${activities.length} activities`);

    // Transform to format expected by Python script
    // Python script expects symbol to be an object with a "symbol" field
    const output = {
      activities: activities.map(activity => {
        const symbolStr = activity.symbol || activity.symbolObj?.symbol;
        const symbolObj = symbolStr ? { symbol: symbolStr } : null;
        
        return {
          activityId: activity.activityId || activity.id,
          accountId: activity.accountId,
          date: activity.date || activity.trade_date,
          trade_date: activity.trade_date || activity.date,
          type: activity.type,
          symbol: symbolObj, // Python expects {symbol: "MAIN"} format
          units: activity.units || activity.quantity || 0,
          quantity: activity.quantity || activity.units || 0,
          amount: activity.amount || 0,
          price: activity.price,
          currency: activity.currency,
          description: activity.description,
        };
      })
    };

    // Write to JSON file
    const outputPath = "./activities.json";
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`✓ Exported ${activities.length} activities to ${outputPath}`);

    await disconnectDb();
  } catch (error) {
    console.error("Error exporting activities:", error);
    process.exit(1);
  }
}

exportActivities();

