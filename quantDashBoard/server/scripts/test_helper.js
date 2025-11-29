import mongoose from "mongoose";
import Activities from "../src/models/AccountActivities.js";
import getLastActivityDate from "../../../../metrics/helper/helper.js";
import { config } from "../src/config/environment.js";

async function run() {
  const mongoUrl = config.DATABASE_URL;
  console.log("Connecting to MongoDB at", mongoUrl);
  await mongoose.connect(mongoUrl, { connectTimeoutMS: 5000 });

  const accountId = "test-account-1";

  // Clean any old test docs
  await Activities.deleteMany({ accountId });

  // Insert sample activity
  const sample = {
    accountId,
    activityId: "2f7dc9b3-5c33-4668-3440-2b31e056ebe6",
    externalReferenceId: "2f7dc9b3-5c33-4668-3440-2b31e056ebe6",
    type: "BUY",
    trade_date: new Date("2024-03-22T16:27:55.000Z"),
    date: new Date("2024-03-22T16:27:55.000Z"),
    description: "Sample activity for test",
    price: 0.4,
    units: 5.2,
    quantity: 5.2,
    amount: 263.82,
    currency: "USD",
    fee: 0,
    fx_rate: 1.032,
    institution: "Robinhood",
    symbol: "VAB.TO",
    symbolObj: { symbol: "VAB.TO" },
    raw: {},
    createdAt: new Date(),
  };

  console.log("Inserting sample activity...");
  await Activities.create(sample);

  console.log("Calling getLastActivityDate...");
  const lastDate = await getLastActivityDate(accountId);
  console.log("getLastActivityDate result:", lastDate);

  // Cleanup
  await Activities.deleteMany({ accountId });
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
