/**
 * Script to test complete timeseries pipeline
 *
 * Core Pipeline Steps (9 steps):
 * 1. Get all account IDs
 * 2. Fetch and sync activities for accounts
 * 3. Get date range from activities
 * 4. Get all symbols from activities
 * 5. Normalize crypto symbols
 * 6. Fetch and store stock splits
 * 7. Fetch and store price history
 * 8. Build daily cash series from activities
 * 9. Build daily units series from activities (with split adjustments)
 *
 * Optional Additional Steps (not included in this script):
 * - Build daily securities values series (from units × prices)
 * - Build daily portfolio series (cash + securities values)
 * See chartPortfolioSeries.js for an example of the full pipeline including these steps.
 *
 * Usage:
 *   node archive/test/timeseries.js
 *
 * Or with a custom database URL:
 *   DATABASE_URL=mongodb://... node archive/test/timeseries.js
 */

import { getAllAccountIds } from "./functions/getAccountIds.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import { getActivityDateRange } from "./functions/getActivityDateRange.js";
import { getActivitySymbols } from "./functions/getActivitySymbols.js";
import { normalizeCryptoSymbols } from "./functions/normalizeCryptoSymbols.js";
import { fetchStockSplits } from "./functions/fetchStockSplits.js";
import { fetchPriceHistory } from "./functions/fetchPriceHistory.js";
import {
  buildDailyCashSeries,
  storeCashSeries,
} from "./functions/buildDailyCashSeries.js";
import { buildDailyUnitsSeries } from "./functions/buildDailyUnitsSeries.js";
import { disconnectDb } from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";

async function run() {
  try {
    console.log("=== Complete Timeseries Pipeline ===\n");

    // Step 1: Get all account IDs
    console.log("Step 1: Fetching all account IDs from the database...\n");
    const accountIds = await getAllAccountIds();
    console.log(`Found ${accountIds.length} account IDs\n`);

    if (accountIds.length === 0) {
      console.log("No account IDs found in the database.");
      return;
    }

    // Step 2: Fetch and sync activities for all accounts
    console.log(
      "Step 2: Fetching and syncing activities for all accounts...\n"
    );
    const activitiesResults = [];
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      console.log(
        `Processing account ${i + 1}/${accountIds.length}: ${accountId}`
      );
      try {
        const activities = await getAccountActivities({
          accountId: accountId,
        });
        activitiesResults.push({
          accountId,
          count: activities.length,
          success: true,
        });
        console.log(`  ✓ ${accountId}: ${activities.length} activities`);
      } catch (error) {
        activitiesResults.push({
          accountId,
          error: error.message,
          success: false,
        });
        console.log(`  ✗ ${accountId}: ${error.message}`);
      }
    }

    // Step 3: Get date range from activities
    console.log("\nStep 3: Getting date range from activities...\n");
    const dateRange = await getActivityDateRange();
    if (!dateRange.minDate || !dateRange.maxDate) {
      console.log("No activities with valid dates found. Exiting.");
      return;
    }
    console.log(
      `Date range: ${dateRange.minDateString} to ${dateRange.maxDateString}`
    );

    // Step 4: Get all symbols from activities
    console.log("\nStep 4: Getting all symbols from activities...\n");
    const symbols = await getActivitySymbols();
    console.log(`Found ${symbols.length} unique symbols`);

    if (symbols.length === 0) {
      console.log("No symbols found in activities. Exiting.");
      return;
    }

    // Step 5: Normalize crypto symbols
    console.log("\nStep 5: Normalizing crypto symbols...\n");
    const normalizedSymbols = await normalizeCryptoSymbols({ symbols });
    const cryptoCount = normalizedSymbols.filter(
      (s, i) => s !== symbols[i]
    ).length;
    console.log(
      `Normalized ${normalizedSymbols.length} symbols (${cryptoCount} crypto symbols normalized)`
    );

    // Step 6: Fetch and store stock splits
    console.log("\nStep 6: Fetching and storing stock splits...\n");
    const splitsResult = await fetchStockSplits({
      symbols: normalizedSymbols,
      forceRefresh: false, // Only fetch missing splits
    });

    if (splitsResult.success) {
      console.log(
        `Processed ${splitsResult.summary.symbolsProcessed} symbols, found splits for ${splitsResult.summary.symbolsWithSplits} symbols`
      );
      console.log(
        `Upserted ${splitsResult.summary.splitsUpserted} split records`
      );
      if (splitsResult.summary.symbolsErrored > 0) {
        console.log(
          `Errors: ${splitsResult.summary.symbolsErrored} symbols failed`
        );
      }
    } else {
      console.log(`Stock splits fetch failed: ${splitsResult.error}`);
    }

    // Step 7: Fetch and store price history
    console.log("\nStep 7: Fetching and storing price history...\n");
    const priceHistoryResult = await fetchPriceHistory({
      forceRefresh: false, // Only fetch missing dates
    });

    // Step 8: Build daily cash series for each account
    console.log("\nStep 8: Building daily cash series for all accounts...\n");
    const cashSeriesResults = [];
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      console.log(
        `Building cash series for account ${i + 1}/${
          accountIds.length
        }: ${accountId}`
      );
      try {
        // Get activities for this account (already fetched, but get fresh copy)
        const activities = await getAccountActivities({
          accountId: accountId,
        });

        if (activities.length === 0) {
          console.log(`  - ${accountId}: No activities, skipping cash series`);
          cashSeriesResults.push({
            accountId,
            days: 0,
            success: true,
            skipped: true,
          });
          continue;
        }

        // Determine base currency from first activity or default to USD
        const firstActivity = activities[0];
        const baseCurrency =
          firstActivity.currency?.code ||
          firstActivity.currency ||
          firstActivity.currencyObj?.code ||
          "USD";

        const cashSeries = await buildDailyCashSeries({
          activities,
          baseCurrency,
          initialCash: 0,
        });

        // Store cash series in database
        const storeResult = await storeCashSeries({
          accountId,
          cashSeries,
        });

        cashSeriesResults.push({
          accountId,
          days: cashSeries.length,
          success: true,
          currency: baseCurrency,
          firstDate: cashSeries[0]?.date || null,
          lastDate: cashSeries[cashSeries.length - 1]?.date || null,
          lastCash: cashSeries[cashSeries.length - 1]?.cash || 0,
          stored: storeResult.stored,
        });

        console.log(
          `  ✓ ${accountId}: ${
            cashSeries.length
          } days (${baseCurrency}), last cash: ${
            cashSeries[cashSeries.length - 1]?.cash || 0
          }, stored: ${storeResult.stored} records`
        );
      } catch (error) {
        cashSeriesResults.push({
          accountId,
          error: error.message,
          success: false,
        });
        console.log(`  ✗ ${accountId}: ${error.message}`);
      }
    }

    // Step 9: Build daily units series for each account
    console.log("\nStep 9: Building daily units series for all accounts...\n");
    const unitsSeriesResults = [];
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      console.log(
        `Building units series for account ${i + 1}/${
          accountIds.length
        }: ${accountId}`
      );
      try {
        // Get activities for this account (already fetched, but get fresh copy)
        const activities = await getAccountActivities({
          accountId: accountId,
        });

        if (activities.length === 0) {
          console.log(`  - ${accountId}: No activities, skipping units series`);
          unitsSeriesResults.push({
            accountId,
            days: 0,
            success: true,
            skipped: true,
          });
          continue;
        }

        const unitsSeries = await buildDailyUnitsSeries({
          activities,
          databaseUrl: process.env.DATABASE_URL,
          applySplits: true,
        });

        if (unitsSeries.length === 0) {
          console.log(
            `  - ${accountId}: No unit-related activities, skipping units series`
          );
          unitsSeriesResults.push({
            accountId,
            days: 0,
            success: true,
            skipped: true,
          });
          continue;
        }

        // Count unique symbols across all dates
        const allSymbols = new Set();
        unitsSeries.forEach((entry) => {
          Object.keys(entry.positions).forEach((sym) => allSymbols.add(sym));
        });

        unitsSeriesResults.push({
          accountId,
          days: unitsSeries.length,
          success: true,
          uniqueSymbols: allSymbols.size,
          firstDate: unitsSeries[0]?.date || null,
          lastDate: unitsSeries[unitsSeries.length - 1]?.date || null,
          lastPositions: unitsSeries[unitsSeries.length - 1]?.positions || {},
        });

        console.log(
          `  ✓ ${accountId}: ${unitsSeries.length} days, ${
            allSymbols.size
          } unique symbols (${unitsSeries[0]?.date} to ${
            unitsSeries[unitsSeries.length - 1]?.date
          })`
        );
      } catch (error) {
        unitsSeriesResults.push({
          accountId,
          error: error.message,
          success: false,
        });
        console.log(`  ✗ ${accountId}: ${error.message}`);
      }
    }

    // Final summary
    console.log("\n=== Final Summary ===");
    console.log(`Accounts processed: ${accountIds.length}`);
    console.log(
      `Activities synced: ${
        activitiesResults.filter((r) => r.success).length
      }/${accountIds.length}`
    );
    console.log(
      `Date range: ${dateRange.minDateString} to ${dateRange.maxDateString}`
    );
    console.log(`Total symbols: ${symbols.length}`);
    console.log(`Crypto symbols normalized: ${cryptoCount}`);
    if (priceHistoryResult.success) {
      console.log(
        `Price history: ${priceHistoryResult.summary.symbolsSucceeded}/${priceHistoryResult.summary.symbolsProcessed} symbols succeeded`
      );
      console.log(
        `Total prices stored: ${priceHistoryResult.summary.totalPricesStored}`
      );
    } else {
      console.log(`Price history: ${priceHistoryResult.message}`);
    }
    console.log(
      `Cash series: ${
        cashSeriesResults.filter((r) => r.success && !r.skipped).length
      }/${accountIds.length} accounts processed`
    );
    const totalCashDays = cashSeriesResults.reduce(
      (sum, r) => sum + (r.days || 0),
      0
    );
    const totalStored = cashSeriesResults.reduce(
      (sum, r) => sum + (r.stored || 0),
      0
    );
    console.log(`Total cash series days: ${totalCashDays}`);
    console.log(`Total cash records stored: ${totalStored}`);
    console.log(
      `Units series: ${
        unitsSeriesResults.filter((r) => r.success && !r.skipped).length
      }/${accountIds.length} accounts processed`
    );
    const totalUnitsDays = unitsSeriesResults.reduce(
      (sum, r) => sum + (r.days || 0),
      0
    );
    const totalUniqueSymbols = unitsSeriesResults.reduce(
      (sum, r) => sum + (r.uniqueSymbols || 0),
      0
    );
    console.log(`Total units series days: ${totalUnitsDays}`);
    console.log(`Total unique symbols tracked: ${totalUniqueSymbols}`);

    // Disconnect from MongoDB
    await disconnectDb();
  } catch (error) {
    await handleError(error);
  }
}

run();
