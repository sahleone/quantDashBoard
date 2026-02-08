/**
 * updatePriceData.js
 *
 * Fetches and stores daily price data (adjusted close prices) for all unique symbols
 * in EquitiesWeightTimeseries.
 * Uses Yahoo Finance API via yahooFinanceClient.js.
 *
 * Processes by symbol (across all users), not by user - each symbol is fetched once
 * even if multiple users hold it. This is more efficient because price data is
 * symbol-based, not user-based.
 *
 * Note: Uses adjusted close prices from Yahoo Finance, which automatically account
 * for stock splits and dividends, eliminating the need to manually process corporate actions.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's symbols
 *  - accountId: optional; when set only process that account's symbols
 *  - fullSync: boolean; if true, fetch all historical prices; if false, only fetch missing dates (default: false)
 *  - forceRefresh: boolean; if true, re-fetch even if price exists (default: false)
 */

import mongoose from "mongoose";
import PriceHistory from "../../models/PriceHistory.js";
import EquitiesWeightTimeseries from "../../models/EquitiesWeightTimeseries.js";
import {
  fetchHistoricalPrices,
  fetchMultipleSymbols,
} from "../../utils/yahooFinanceClient.js";

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

  const endDate = new Date();
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
    const dates = [];
    const current = new Date(requiredDateRange.startDate);
    const end = new Date(requiredDateRange.endDate);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  const existingDates = await getExistingPriceDates(symbol);
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
 * Check if a symbol is an option ticker (contains spaces)
 * Options are treated like stocks but use price 0 when API access is not available
 */
function isOptionSymbol(symbol) {
  return symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "");
}

/**
 * Check if a symbol is a crypto symbol that needs "-USD" suffix
 * Uses the same CRYPTO_SYMBOLS set as yahooFinanceClient
 */
function isCryptoSymbol(symbol) {
  // Remove spaces first (for option tickers that might have spaces)
  const cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();
  
  // Common cryptocurrency symbols that need "-USD" suffix for Yahoo Finance
  const CRYPTO_SYMBOLS = new Set([
    "BTC", "ETH", "LTC", "XRP", "BCH", "EOS", "XLM", "XTZ", "ADA", "DOT",
    "LINK", "UNI", "AAVE", "SOL", "MATIC", "AVAX", "ATOM", "ALGO", "FIL",
    "DOGE", "SHIB", "USDC", "USDT", "DAI", "BAT", "ZEC", "XMR", "DASH",
    "ETC", "TRX", "VET", "THETA", "ICP", "FTM", "NEAR", "APT", "ARB",
    "OP", "SUI", "SEI", "TIA", "INJ", "MKR", "COMP", "SNX", "CRV", "YFI",
    "SUSHI", "1INCH", "ENJ", "MANA", "SAND", "AXS", "GALA", "CHZ", "FLOW",
    "GRT", "ANKR", "SKL", "NU", "CGLD", "OXT", "UMA", "FORTH", "ETH2",
    "CBETH", "BAND", "NMR"
  ]);
  
  return CRYPTO_SYMBOLS.has(cleanSymbol) && !cleanSymbol.endsWith("-USD");
}

/**
 * Process a single symbol: fetch missing prices and store them
 * For options, uses price 0 instead of fetching from API
 */
async function processSymbol(symbol, opts = {}) {
  try {
    const dateRange = await getSymbolDateRange(symbol, opts);
    if (!dateRange) {
      return { symbol, status: "skipped", reason: "no_positions" };
    }

    const missingDates = await getMissingDates(symbol, dateRange, opts);

    if (missingDates.length === 0 && !opts.forceRefresh) {
      return { symbol, status: "skipped", reason: "no_missing_dates" };
    }

    let prices = [];

    // Check if this is an option symbol - if so, use price 0 instead of fetching
    if (isOptionSymbol(symbol)) {
      // Generate price entries with price 0 for all missing dates
      prices = missingDates.map((date) => ({
        date: new Date(date),
        close: 0,
        open: 0,
        high: 0,
        low: 0,
        volume: 0,
      }));
    } else {
      // Regular stock or crypto - fetch prices from API
      // Note: fetchHistoricalPrices will automatically normalize crypto symbols (e.g., ETH -> ETH-USD)
      const isCrypto = isCryptoSymbol(symbol);
      prices = await fetchHistoricalPrices(
        symbol,
        dateRange.startDate,
        dateRange.endDate
      );

      if (prices.length === 0) {
        return { symbol, status: "error", reason: "no_price_data" };
      }

      // Filter to only missing dates if not forcing refresh
      if (!opts.forceRefresh && missingDates.length > 0) {
        const missingDateKeys = new Set(
          missingDates.map((d) => d.toISOString().split("T")[0])
        );
        prices = prices.filter((p) => {
          const dateKey = p.date.toISOString().split("T")[0];
          return missingDateKeys.has(dateKey);
        });
      }
    }

    const db = mongoose.connection.db;
    const priceHistoryCollection = db.collection("pricehistories");

    const ops = prices.map((price) => ({
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
      pricesStored: prices.length,
      isOption: isOptionSymbol(symbol),
      isCrypto: isCryptoSymbol(symbol),
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

    // Process symbols in parallel batches for 5-10x speedup
    // Yahoo Finance rate limit: 2000/hour = ~33/min = ~1 every 2 seconds
    // With batch size 15, each batch takes ~2 seconds, so we stay within limits
    const BATCH_SIZE = opts.batchSize || 15;
    const startTime = Date.now();

    console.log(`Using parallel batch processing (batch size: ${BATCH_SIZE})`);

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(symbols.length / BATCH_SIZE);

      console.log(
        `\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} symbols in parallel...`
      );

      const batchStartTime = Date.now();

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            // Process price data
            const priceResult = await processSymbol(symbol, {
              userId,
              accountId,
              fullSync,
              forceRefresh,
            });

            return { symbol, priceResult };
          } catch (error) {
            return {
              symbol,
              priceResult: {
                symbol,
                status: "error",
                reason: error.message || String(error),
              },
            };
          }
        })
      );

      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      console.log(
        `  Batch ${batchNum} completed in ${batchDuration}s (${batch.length} symbols)`
      );

      // Process results and update summary
      for (const { symbol, priceResult } of batchResults) {
        if (priceResult.status === "success") {
          summary.processed++;
          summary.newPrices += priceResult.pricesStored || 0;
          const optionNote = priceResult.isOption ? " (option, price=0)" : "";
          const cryptoNote = priceResult.isCrypto ? " (crypto, normalized to -USD)" : "";
          console.log(
            `  ✓ ${symbol}: stored ${priceResult.pricesStored} prices${optionNote}${cryptoNote}`
          );
        } else if (priceResult.status === "skipped") {
          summary.skipped++;
          console.log(`  - ${symbol} (prices): ${priceResult.reason}`);
        } else {
          summary.errors.push({ ...priceResult, type: "price" });
          console.error(`  ✗ ${symbol} (prices): ${priceResult.reason}`);
        }
      }

      // Log progress
      const processed = Math.min(i + BATCH_SIZE, symbols.length);
      const progress = ((processed / symbols.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(
        `  Overall progress: ${processed}/${symbols.length} (${progress}%) - Elapsed: ${elapsed} min`
      );

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
      }
    }

    console.log("\n=== Summary ===");
    console.log(`Total symbols: ${summary.totalSymbols}`);
    console.log(
      `Prices - Processed: ${summary.processed}, Skipped: ${summary.skipped}`
    );
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

/**
 * CLI entry point when run directly
 */
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
