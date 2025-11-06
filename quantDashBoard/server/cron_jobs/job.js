/**
 * Cron job(node-schedule): fetch all accounts from SnapTrade for all users that have
 * SnapTrade credentials, and store/update them in our MongoDB collection.
 *
 * Behavior:
 *  - Queries `users` collection for documents with a non-empty `userSecret`.
 *  - For each user, calls SnapTrade via the existing AccountServiceClientService
 *    to list accounts (snaptrade.accountInformation.listUserAccounts -> GET /accounts).
 *  - Upserts each account into the `SnapTradeAccount` model (server/src/models/AccountsList.js).
 *  - Performs basic error handling and logging.
 *
 * Run: node server/cron_jobs/job.js
 */

import mongoose from "mongoose";
import { config } from "../src/config/environment.js";
import User from "../src/models/Users.js";
import AccountModel from "../src/models/AccountsList.js";
import AccountServiceClientService from "../src/clients/accountClient.js";
import schedule from "node-schedule";

// Small delay helper to avoid tight loops (milliseconds)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function upsertAccount(user, rawAccount) {
  try {
    if (!rawAccount || !rawAccount.id) return null;

    const mapped = {
      userId: user.userId,
      brokerageAuthorizationId:
        rawAccount.authorizationId ||
        rawAccount.authorization_id ||
        rawAccount.brokerage?.id ||
        null,
      accountId: rawAccount.id,
      accountName: rawAccount.name || rawAccount.accountName || "Unknown",
      number: rawAccount.number || rawAccount.account_number || null,
      currency: rawAccount.currency?.code || rawAccount.currency || "USD",
      institutionName:
        rawAccount.institution_name || rawAccount.brokerage?.name || "Unknown",
      createdDate: rawAccount.created_at
        ? new Date(rawAccount.created_at)
        : rawAccount.createdDate
        ? new Date(rawAccount.createdDate)
        : null,
      raw_type: rawAccount.type || rawAccount.account_type || null,
      status: rawAccount.status || rawAccount.state || null,
    };

    // upsert by accountId - AccountsList has unique index on accountId
    const updated = await AccountModel.findOneAndUpdate(
      { accountId: mapped.accountId },
      { $set: mapped },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return updated;
  } catch (err) {
    console.error(
      `Failed to upsert account ${rawAccount?.id} for user ${user.userId}:`,
      err?.message || err
    );
    return null;
  }
}

async function processAllUsers() {
  console.log("SnapTrade accounts job starting...");

  // Connect (we connect/disconnect per run to keep the implementation simple)
  try {
    await mongoose.connect(config.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    throw err;
  }

  try {
    // Find users with a stored SnapTrade userSecret
    const users = await User.find({
      userSecret: { $exists: true, $ne: null, $ne: "" },
    }).lean();
    console.log(`Found ${users.length} users with SnapTrade credentials.`);

    const accountService = new AccountServiceClientService();

    for (const user of users) {
      if (!user.userId || !user.userSecret) {
        console.log(
          `Skipping user (missing userId/secret): ${user.email || user._id}`
        );
        continue;
      }

      console.log(
        `Fetching accounts for user ${user.userId} (${
          user.email || "no-email"
        })`
      );

      let accounts = [];
      try {
        accounts = await accountService.listAccounts(
          user.userId,
          user.userSecret
        );
      } catch (apiErr) {
        console.error(
          `SnapTrade API error for user ${user.userId}:`,
          apiErr?.message || apiErr
        );
        continue;
      }

      if (!Array.isArray(accounts) || accounts.length === 0) {
        console.log(`No accounts returned for user ${user.userId}`);
        await delay(200);
        continue;
      }

      for (const acc of accounts) {
        const saved = await upsertAccount(user, acc);
        if (saved)
          console.log(
            `Upserted account ${saved.accountId} for user ${user.userId}`
          );
      }

      await delay(200);
    }

    console.log("SnapTrade accounts job finished.");
  } finally {
    // Always disconnect to keep the run simple and stateless
    try {
      await mongoose.disconnect();
    } catch (err) {
      console.warn("Error disconnecting mongoose:", err);
    }
  }
}

// Scheduling configuration (no .env reads here per request)
// Always schedule daily at 06:00 local time
const CRON_EXPR = "0 6 * * *";
// Always run immediately on start (unless the user passes --run-once)
const RUN_ON_START = true;
// RUN_ONCE is controllable via command-line only (no .env reads)
const RUN_ONCE =
  process.argv.includes("--run-once") || process.argv.includes("--runonce");

// If RUN_ONCE set, run once and exit. Keep it tiny and explicit.
if (RUN_ONCE) {
  (async () => {
    try {
      await processAllUsers();
      console.log("Run-once job completed.");
      process.exit(0);
    } catch (err) {
      console.error("Run-once job failed:", err);
      process.exit(1);
    }
  })();
} else {
  // Schedule the job using node-schedule and keep process alive
  console.log(`Scheduling SnapTrade accounts job with cron: "${CRON_EXPR}"`);
  schedule.scheduleJob(CRON_EXPR, async () => {
    console.log(`Scheduled job triggered at ${new Date().toISOString()}`);
    try {
      await processAllUsers();
      console.log(`Scheduled job finished at ${new Date().toISOString()}`);
    } catch (err) {
      console.error("Scheduled job error:", err);
    }
  });

  // Optionally run once immediately on start
  if (RUN_ON_START) {
    console.log("RUN_ON_START enabled — running job immediately on start");
    (async () => {
      try {
        await processAllUsers();
      } catch (err) {
        console.error("Immediate run error:", err);
      }
    })();
  }

  // Keep process alive if this file is executed directly
  if (process.argv[1] && process.argv[1].endsWith("job.js")) {
    console.log(
      "Cron scheduler active — process will continue running to allow scheduled jobs."
    );
  }
}
