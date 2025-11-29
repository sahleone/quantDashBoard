#!/usr/bin/env node
/*
  Create or refresh a SnapTrade user via the application's UserServiceClientService
  and update the local MongoDB record with the returned userSecret.

  Usage:
    node test/createSnapUser.js <userId>

  Note: This will call the SnapTrade API using the SnapTrade client configured
  in the app (ensure SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are
  available in your environment when running).
*/

import mongoose from "mongoose";
import { config } from "../src/config/environment.js";
import UserServiceClientService from "../src/clients/userClient.js";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: node test/createSnapUser.js <userId>");
    process.exit(1);
  }

  try {
    await mongoose.connect(config.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err.message || err);
    process.exit(2);
  }

  const userService = new UserServiceClientService();

  try {
    console.log(`Creating/refreshing SnapTrade user for: ${userId}`);
    const created = await userService.createUser(userId);
    console.log("createUser response:", JSON.stringify(created, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error creating SnapTrade user:", err?.message || err);
    if (err.response) {
      console.error(
        "SDK response:",
        JSON.stringify(err.response.data, null, 2)
      );
    }
    process.exit(3);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {}
  }
}

main();
