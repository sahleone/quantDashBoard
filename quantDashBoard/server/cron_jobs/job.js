/**
 * Cron job(node-schedule): Comprehensive database sync for all users with SnapTrade credentials.
 *
 * Behavior:
 *  - Queries `users` collection for documents with a non-empty `userSecret`.
 *  - For each user, performs comprehensive sync:
 *    - Accounts (via updateAccountsForUser)
 *    - Holdings, positions, balances, activities (via updateAccountHoldingsForUser)
 *    - Options (via OptionsServiceClientService)
 *  - Runs at 10am and 4pm daily
 *  - Performs incremental updates (last 30 days) by default
 *
 * Run: node server/cron_jobs/job.js
 */

import mongoose from "mongoose";
import { config } from "../src/config/environment.js";
import User from "../src/models/Users.js";
import syncAllUserData from "../src/utils/syncAllUserData.js";
import schedule from "node-schedule";

// Small delay helper to avoid tight loops (milliseconds)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processAllUsers() {
  console.log("Comprehensive database sync job starting...");
  const startTime = new Date().toISOString();

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

    const syncResults = [];

    for (const user of users) {
      if (!user.userId || !user.userSecret) {
        console.log(
          `Skipping user (missing userId/secret): ${user.email || user._id}`
        );
        continue;
      }

      console.log(
        `\n[${user.userId}] Starting comprehensive sync for user ${
          user.email || "no-email"
        }`
      );

      try {
        // Perform comprehensive sync with incremental updates (fullSync: false)
        const result = await syncAllUserData(user.userId, user.userSecret, {
          fullSync: false,
        });

        // Calculate accurate counts
        const accountsCount = result.accounts?.length || 0;
        
        // Sum up actual holdings count from all account results
        let holdingsCount = 0;
        if (Array.isArray(result.holdings)) {
          holdingsCount = result.holdings.reduce((sum, accountResult) => {
            if (accountResult.status === "success" && accountResult.holdings) {
              return sum + (accountResult.holdings.total || 0);
            }
            return sum;
          }, 0);
        }
        
        // Sum up actual options count from all account results
        let optionsCount = 0;
        if (Array.isArray(result.options)) {
          optionsCount = result.options.reduce((sum, accountResult) => {
            if (accountResult.status === "success" && accountResult.count) {
              return sum + accountResult.count;
            }
            return sum;
          }, 0);
        }

        syncResults.push({
          userId: user.userId,
          success: result.success,
          accountsCount,
          holdingsCount,
          optionsCount,
          accountsProcessed: result.holdings?.length || 0,
          optionsAccountsProcessed: result.options?.length || 0,
          errors: result.errors,
        });

        console.log(
          `[${user.userId}] Sync completed: ${accountsCount} accounts, ${holdingsCount} holdings, ${optionsCount} options`
        );
      } catch (err) {
        console.error(
          `[${user.userId}] Error during comprehensive sync:`,
          err?.message || err
        );
        syncResults.push({
          userId: user.userId,
          success: false,
          error: err?.message || String(err),
        });
      }

      // Small delay between users to avoid rate limiting
      await delay(200);
    }

    const endTime = new Date().toISOString();
    const successful = syncResults.filter((r) => r.success).length;
    const failed = syncResults.filter((r) => !r.success).length;

    console.log("\n" + "=".repeat(80));
    console.log("Comprehensive database sync job finished.");
    console.log(`Started: ${startTime}`);
    console.log(`Finished: ${endTime}`);
    console.log(`Total users: ${users.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log("=".repeat(80));
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
// Schedule daily at 10:00 AM and 4:00 PM local time
const CRON_EXPR_10AM = "0 10 * * *";
const CRON_EXPR_4PM = "0 16 * * *";
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
  // Schedule the jobs using node-schedule and keep process alive
  console.log(
    `Scheduling comprehensive database sync jobs:`
  );
  console.log(`  - Daily at 10:00 AM (cron: "${CRON_EXPR_10AM}")`);
  console.log(`  - Daily at 4:00 PM (cron: "${CRON_EXPR_4PM}")`);

  // Schedule 10am job
  schedule.scheduleJob(CRON_EXPR_10AM, async () => {
    console.log(
      `\n[10AM JOB] Scheduled job triggered at ${new Date().toISOString()}`
    );
    try {
      await processAllUsers();
      console.log(
        `[10AM JOB] Scheduled job finished at ${new Date().toISOString()}`
      );
    } catch (err) {
      console.error("[10AM JOB] Scheduled job error:", err);
    }
  });

  // Schedule 4pm job
  schedule.scheduleJob(CRON_EXPR_4PM, async () => {
    console.log(
      `\n[4PM JOB] Scheduled job triggered at ${new Date().toISOString()}`
    );
    try {
      await processAllUsers();
      console.log(
        `[4PM JOB] Scheduled job finished at ${new Date().toISOString()}`
      );
    } catch (err) {
      console.error("[4PM JOB] Scheduled job error:", err);
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
