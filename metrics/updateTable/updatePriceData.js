/**
 * updatePriceData.js
 *
 * Fetches and stores daily price data for all symbols in EquitiesWeightTimeseries.
 * Uses Yahoo Finance API via yahooFinanceClient.js.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's symbols
 *  - accountId: optional; when set only process that account's symbols
 *  - fullSync: boolean; if true, fetch all historical prices; if false, only fetch missing dates (default: false)
 *  - forceRefresh: boolean; if true, re-fetch even if price exists (default: false)
 */

import mongoose from "mongoose";
import PriceHistory from "../../quantDashBoard/server/src/models/PriceHistory.js";
import EquitiesWeightTimeseries from "../../quantDashBoard/server/src/models/EquitiesWeightTimeseries.js";
import {
  fetchHistoricalPrices,
  fetchMultipleSymbols,
} from "../../quantDashBoard/server/src/utils/yahooFinanceClient.js";

/**
 * Get all unique symbols from EquitiesWeightTimeseries
 */
async function getUniqueSymbols(opts = {}) {
  const db = mongoose.connection.db;
  const timeseriesCollection = db.collection("equitiesweighttimeseries");

  const query = {};
  if (opts.userId) {
    query.userId = opts.userId;
  }
  if (opts.accountId) {
    query.accountId = opts.accountId;
  }

  const symbols = await timeseriesCollection.distinct("symbol", query);
  return symbols.filter((s) => s && s.trim().length > 0);
}

/**
 * Get date range needed for a symbol
 */
async function getSymbolDateRange(symbol, opts = {}) {
  const db = mongoose.connection.db;
  const timeseriesCollection = db.collection("equitiesweighttimeseries");

  const query = { symbol };
  if (opts.userId) {
    query.userId = opts.userId;
  }
  if (opts.accountId) {
    query.accountId = opts.accountId;
  }

  const dates = await timeseriesCollection
    .find(query, { projection: { date: 1 } })
    .sort({ date: 1 })
    .toArray();

  if (dates.length === 0) {
    return null;
  }

  const minDate = new Date(dates[0].date);
  const maxDate = new Date(dates[dates.length - 1].date);

  // For fullSync, fetch from first position date to today
  // For incremental, only fetch missing dates
  const endDate = new Date(); // Today
  endDate.setHours(23, 59, 59, 999);

  return { startDate: minDate, endDate };
}

/**
 * Get existing price dates for a symbol from PriceHistory
 */
async function getExistingPriceDates(symbol) {
  const db = mongoose.connection.db;
  const priceHistoryCollection = db.collection("pricehistories");

  const prices = await priceHistoryCollection
    .find({ symbol }, { projection: { date: 1 } })
    .sort({ date: 1 })
    .toArray();

  return new Set(prices.map((p) => p.date.toISOString().split("T")[0]));
}

/**
 * Determine which dates need to be fetched for a symbol
 */
async function getMissingDates(symbol, requiredDateRange, opts = {}) {
  if (opts.forceRefresh) {
    // Fetch all dates in range
    const dates = [];
    const current = new Date(requiredDateRange.startDate);
    const end = new Date(requiredDateRange.endDate);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  // Get existing dates
  const existingDates = await getExistingPriceDates(symbol);

  // Find missing dates
  const missingDates = [];
  const current = new Date(requiredDateRange.startDate);
  const end = new Date(requiredDateRange.endDate);

  while (current <= end) {
    const dateKey = current.toISOString().split("T")[0];
    if (!existingDates.has(dateKey)) {
      missingDates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return missingDates;
}

/**
 * Process a single symbol: fetch missing prices and store them
 */
async function processSymbol(symbol, opts = {}) {
  try {
    // Get date range needed for this symbol
    const dateRange = await getSymbolDateRange(symbol, opts);
    if (!dateRange) {
      return { symbol, status: "skipped", reason: "no_positions" };
    }

    // Determine which dates to fetch
    const missingDates = await getMissingDates(symbol, dateRange, opts);

    if (missingDates.length === 0 && !opts.forceRefresh) {
      return { symbol, status: "skipped", reason: "no_missing_dates" };
    }

    // Fetch prices for the date range
    const prices = await fetchHistoricalPrices(
      symbol,
      dateRange.startDate,
      dateRange.endDate
    );

    if (prices.length === 0) {
      return { symbol, status: "error", reason: "no_price_data" };
    }

    // Filter to only missing dates if not forceRefresh
    let pricesToStore = prices;
    if (!opts.forceRefresh && missingDates.length > 0) {
      const missingDateKeys = new Set(
        missingDates.map((d) => d.toISOString().split("T")[0])
      );
      pricesToStore = prices.filter((p) => {
        const dateKey = p.date.toISOString().split("T")[0];
        return missingDateKeys.has(dateKey);
      });
    }

    // Store prices in database
    const db = mongoose.connection.db;
    const priceHistoryCollection = db.collection("pricehistories");

    const ops = pricesToStore.map((price) => ({
      updateOne: {
        filter: {
          symbol: symbol,
          date: price.date,
        },
        update: {
          $set: {
            symbol: symbol,
            date: price.date,
            close: price.close,
            open: price.open || null,
            high: price.high || null,
            low: price.low || null,
            volume: price.volume || null,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (ops.length > 0) {
      await priceHistoryCollection.bulkWrite(ops, { ordered: false });
    }

    return {
      symbol,
      status: "success",
      pricesFetched: prices.length,
      pricesStored: pricesToStore.length,
    };
  } catch (error) {
    return {
      symbol,
      status: "error",
      reason: error.message || String(error),
    };
  }
}

/**
 * Main function to update price data
 */
export async function updatePriceData(opts = {}) {
  const databaseUrl =
    opts.databaseUrl ||
    process.env.DATABASE_URL ||
    (() => {
      throw new Error(
        "DATABASE_URL environment variable is required. Please set it in your .env file."
      );
    })();

  const userId = opts.userId || null;
  const accountId = opts.accountId || null;
  const fullSync = opts.fullSync === true;
  const forceRefresh = opts.forceRefresh === true;

  // Connect to MongoDB if not already connected
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(databaseUrl, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      });
      console.log("Connected to MongoDB");
    } catch (err) {
      console.error("Failed to connect to MongoDB:", err?.message || err);
      throw err;
    }
  }

  const summary = {
    totalSymbols: 0,
    processed: 0,
    skipped: 0,
    newPrices: 0,
    errors: [],
  };

  try {
    // Get all unique symbols
    const symbols = await getUniqueSymbols({ userId, accountId });
    summary.totalSymbols = symbols.length;

    if (symbols.length === 0) {
      console.log("No symbols found in EquitiesWeightTimeseries");
      await mongoose.disconnect();
      return summary;
    }

    console.log(
      `Processing ${symbols.length} symbol(s) (fullSync: ${fullSync}, forceRefresh: ${forceRefresh})`
    );

    // Process each symbol
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      console.log(`[${i + 1}/${symbols.length}] Processing ${symbol}...`);

      const result = await processSymbol(symbol, {
        userId,
        accountId,
        fullSync,
        forceRefresh,
      });

      if (result.status === "success") {
        summary.processed++;
        summary.newPrices += result.pricesStored || 0;
        console.log(
          `  ✓ ${symbol}: stored ${result.pricesStored} prices (fetched ${result.pricesFetched})`
        );
      } else if (result.status === "skipped") {
        summary.skipped++;
        console.log(`  - ${symbol}: ${result.reason}`);
      } else {
        summary.errors.push(result);
        console.error(`  ✗ ${symbol}: ${result.reason}`);
      }
    }

    console.log("\n=== Summary ===");
    console.log(`Total symbols: ${summary.totalSymbols}`);
    console.log(`Processed: ${summary.processed}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`New prices stored: ${summary.newPrices}`);
    console.log(`Errors: ${summary.errors.length}`);
  } catch (error) {
    console.error("Error in updatePriceData:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }

  return summary;
}

// CLI runner
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("updatePriceData.js")
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const opts = {};
      if (args.includes("--fullSync")) {
        opts.fullSync = true;
      }
      if (args.includes("--forceRefresh")) {
        opts.forceRefresh = true;
      }

      console.log("Starting updatePriceData...");
      const result = await updatePriceData(opts);
      console.log("updatePriceData result:", JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("updatePriceData failed:", err);
      process.exit(2);
    }
  })();
}

