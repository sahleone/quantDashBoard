/**
 * Sync source data (balances, positions, options) from SnapTrade for sanity check
 * Uses existing sync utilities to fetch and store data
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import updateAccountHoldingsForUser from "../src/utils/updateAccountHoldings.js";
import OptionsServiceClientService from "../src/clients/optionsClient.js";

dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ||
  "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

async function syncSourceData() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB\n");

    const db = mongoose.connection.db;

    // Get all unique userIds from PortfolioTimeseries
    const PortfolioTimeseries = db.collection("portfoliotimeseries");
    const userIds = await PortfolioTimeseries.distinct("userId");
    const accountIds = await PortfolioTimeseries.distinct("accountId");

    console.log(`Found ${userIds.length} users and ${accountIds.length} accounts\n`);
    console.log("=".repeat(80));

    for (const userId of userIds) {
      console.log(`\n📋 Syncing data for User: ${userId}`);
      console.log("-".repeat(80));

      // Get user secret from Users collection
      const Users = db.collection("users");
      const user = await Users.findOne({ userId });
      if (!user || !user.userSecret) {
        console.log(`  ⚠️  No userSecret found for user ${userId}, skipping...`);
        continue;
      }

      // Get accounts for this user
      const userAccountIds = await PortfolioTimeseries.distinct("accountId", {
        userId,
      });

      console.log(`  Found ${userAccountIds.length} accounts for this user`);

      // Sync balances, positions, holdings using existing utility
      try {
        console.log(`  🔄 Syncing balances, positions, holdings...`);
        const syncResults = await updateAccountHoldingsForUser(
          userId,
          user.userSecret,
          { fullSync: false } // Use recent data (30 days)
        );

        console.log(`  ✅ Synced ${syncResults.length} accounts`);
        syncResults.forEach((result) => {
          console.log(
            `    - Account ${result.accountId}: ${result.status || "success"}`
          );
        });
      } catch (error) {
        console.error(`  ❌ Error syncing account data:`, error.message);
      }

      // Sync options for each account
      const optionsService = new OptionsServiceClientService();
      for (const accountId of userAccountIds) {
        try {
          console.log(`  🎯 Syncing options for account ${accountId}...`);

          // Fetch options from SnapTrade
          const optionHoldings = await optionsService.listOptionHoldings(
            userId,
            user.userSecret,
            accountId
          );

          if (!Array.isArray(optionHoldings) || optionHoldings.length === 0) {
            console.log(`    No options found for account ${accountId}`);
            continue;
          }

          console.log(`    Found ${optionHoldings.length} option positions`);

          // Transform and save options
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          for (const option of optionHoldings) {
            try {
              const optionData = {
                accountId: accountId,
                userId: userId,
                asOfDate: today,
                symbol: option.symbol || null,
                option_symbol: option.option_symbol || null,
                units: option.units || 0,
                price: option.price || 0,
                market_value: option.market_value || option.marketValue || null,
                currency: option.currency || null,
                createdAt: new Date(),
              };

              // Upsert option (update if exists for today, otherwise insert)
              // Use option_symbol.id as unique identifier if available
              const Options = db.collection("options");
              const query = {
                accountId: accountId,
                asOfDate: { $gte: today, $lt: tomorrow },
              };

              if (option.option_symbol?.id) {
                query["option_symbol.id"] = option.option_symbol.id;
              } else {
                // Fallback: use symbol and units as identifier
                query.symbol = option.symbol;
                query.units = option.units;
              }

              await Options.findOneAndUpdate(
                query,
                { $set: optionData },
                { upsert: true }
              );
            } catch (optError) {
              console.error(
                `    ⚠️  Error saving option:`,
                optError.message
              );
            }
          }

          console.log(
            `    ✅ Saved ${optionHoldings.length} option positions`
          );
        } catch (error) {
          console.error(
            `    ❌ Error syncing options for account ${accountId}:`,
            error.message
          );
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ Sync complete!");
    console.log("=".repeat(80));
    console.log("\nNext step: Run sanityCheckValuation.js to compare values\n");

    await mongoose.disconnect();
    console.log("✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("Error:", error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  }
}

syncSourceData();

