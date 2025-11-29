import dotenv from "dotenv";
import mongoose from "mongoose";
import { config } from "../quantDashBoard/server/src/config/environment.js";

// load same .env used by other scripts
dotenv.config({ path: "../quantDashBoard/server/src/.env" });

async function testConnect() {
  const mongoUrl = config.DATABASE_URL;
  console.log(
    "Attempting mongoose connect to:",
    mongoUrl.replace(/:[^:@]+@/, ":<password>@")
  );
  try {
    // small timeouts and verbose connect events
    mongoose.set("debug", true);
    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
    });

    console.log("Mongoose connected:", mongoose.connection.readyState);
    await mongoose.disconnect();
    console.log("Disconnected cleanly");
    process.exit(0);
  } catch (err) {
    console.error("Connection test failed:", err);
    process.exit(1);
  }
}

testConnect();
