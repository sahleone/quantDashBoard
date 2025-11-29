#!/usr/bin/env node
/*
 Simple helper script to pull a single record from a server-side model and
 print it. Useful for quick connectivity and debugging from the `metrics/`
 folder.

 Usage:
   node metrics/pull_record.js --model=AccountsList
   node metrics/pull_record.js --model=Users

 It prefers DATABASE_URL from environment and falls back to the repository
 connection string (present in other scripts). Adjust as needed.
*/

import mongoose from "mongoose";
import AccountsList from "../quantDashBoard/server/src/models/AccountsList.js";
import Users from "../quantDashBoard/server/src/models/Users.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const a of args) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq === -1) opts[a.slice(2)] = true;
    else opts[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return opts;
}

(async function main() {
  const argv = parseArgs();
  const modelName = argv.model || "AccountsList";

  const databaseUrl =
    process.env.DATABASE_URL ||
    "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

  console.log(
    `Using DB: ${
      databaseUrl.includes("@") ? databaseUrl.split("@")[1] : databaseUrl
    }`
  );
  try {
    mongoose.set("bufferCommands", false);
    await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 30000 });
    console.log("mongoose readyState:", mongoose.connection.readyState);
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err?.message || err);
    process.exit(2);
  }

  try {
    let doc = null;
    if (modelName === "AccountsList") {
      doc = await AccountsList.findOne({}).lean();
    } else if (modelName === "Users") {
      doc = await Users.findOne({}).lean();
    } else {
      console.error(
        `Unknown model: ${modelName}. Supported: AccountsList, Users`
      );
      await mongoose.disconnect();
      process.exit(3);
    }

    if (!doc) console.log(`No documents found in ${modelName}`);
    else console.log(`${modelName} sample:`, JSON.stringify(doc, null, 2));
  } catch (err) {
    console.error("Error querying model:", err?.message || err);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore
    }
  }
})();
