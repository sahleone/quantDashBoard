#!/usr/bin/env node
/*
  Validate a SnapTrade user stored in MongoDB using the application's
  UserServiceClientService.validateUser() method.

  Usage:
    node test/validateSnapUser.js <userId>

  It will connect to the DB using `config.DATABASE_URL` and print the
  validation result (including whether the SDK can access SnapTrade with
  the stored `userSecret`).
*/

import mongoose from "mongoose";
import { config } from "../src/config/environment.js";
import UserServiceClientService from "../src/clients/userClient.js";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: node test/validateSnapUser.js <userId>");
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
    const result = await userService.validateUser(userId);
    console.log("validateUser result:", JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Validation failed:", err?.message || err);
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
