import { ensureDbConnection, getDb } from "../utils/dbConnection.js";
import { getActivityDateRange } from "./getActivityDateRange.js";
import { getActivitySymbols } from "./getActivitySymbols.js";
import { normalizeCryptoSymbols } from "./normalizeCryptoSymbols.js";
import { fetchHistoricalPrices } from "../../../quantDashBoard/server/src/utils/yahooFinanceClient.js";

/**
 * Checks if a symbol is an option symbol (contains spaces)
 * Options are treated like stocks but use price 0 when API access is not available
 */
function isOptionSymbol(symbol) {
  if (!symbol) return false;
  return symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "");
}

/**
 * Gets existing price dates for a symbol from PriceHistory
 *
 * @param {string} symbol - Symbol to check
 * @returns {Promise<Set>} Set of date strings in "yyyy-mm-dd" format
 */
async function getExistingPriceDates(symbol) {
  const db = getDb();
  const priceHistoryCollection = db.collection("pricehistories");

  const prices = await priceHistoryCollection
    .find({ symbol }, { projection: { date: 1 } })
    .sort({ date: 1 })
    .toArray();

  return new Set(
    prices.map((p) => {
      const date = new Date(p.date);
      return date.toISOString().split("T")[0];
    })
  );
}

/**
 * Generates array of dates between start and end (inclusive)
 *
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Date[]} Array of dates
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  // Set to start of day
  current.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Processes a single symbol: checks existing prices and fetches missing ones
 *
 * @param {string} symbol - Symbol to process
 * @param {Date} startDate - Start date for price history
 * @param {Date} endDate - End date for price history
 * @param {Object} opts - Options
 * @returns {Promise<Object>} Result object with status and details
 */
async function processSymbol(symbol, startDate, endDate, opts = {}) {
  try {
    const { forceRefresh = false } = opts;

    // Check existing prices
    const existingDates = await getExistingPriceDates(symbol);
    const requiredDates = generateDateRange(startDate, endDate);

    // Determine missing dates
    let missingDates = [];
    if (forceRefresh) {
      missingDates = requiredDates;
    } else {
      missingDates = requiredDates.filter((date) => {
        const dateKey = date.toISOString().split("T")[0];
        return !existingDates.has(dateKey);
      });
    }

    if (missingDates.length === 0) {
      return {
        symbol,
        status: "skipped",
        reason: "no_missing_dates",
        existingCount: existingDates.size,
      };
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
      prices = await fetchHistoricalPrices(symbol, startDate, endDate);

      if (prices.length === 0) {
        return {
          symbol,
          status: "error",
          reason: "no_price_data",
          missingDatesCount: missingDates.length,
        };
      }

      // Filter to only missing dates if not forcing refresh
      if (!forceRefresh) {
        const missingDateKeys = new Set(
          missingDates.map((d) => d.toISOString().split("T")[0])
        );
        prices = prices.filter((p) => {
          const dateKey = p.date.toISOString().split("T")[0];
          return missingDateKeys.has(dateKey);
        });
      }
    }

    // Store prices in database
    const db = getDb();
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
      missingDatesCount: missingDates.length,
      existingCount: existingDates.size,
      isOption: isOptionSymbol(symbol),
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
 * Fetches and stores price history for all symbols from activities
 * Uses min/max dates from activities and checks database to only fetch missing dates
 *
 * @param {Object} opts - Options object
 * @param {string} opts.databaseUrl - MongoDB connection string (defaults to DATABASE_URL env var)
 * @param {string} opts.accountId - Optional accountId to filter by specific account
 * @param {boolean} opts.forceRefresh - If true, re-fetch all prices even if they exist (default: false)
 * @returns {Promise<Object>} Summary object with results
 */
export async function fetchPriceHistory(opts = {}) {
  const { databaseUrl, accountId, forceRefresh = false } = opts;

  await ensureDbConnection(databaseUrl);

  try {
    // Get date range from activities
    console.log("Step 1: Getting date range from activities...");
    const dateRange = await getActivityDateRange({ accountId });
    
    if (!dateRange.minDate || !dateRange.maxDate) {
      return {
        success: false,
        message: "No activities with valid dates found",
        summary: {
          symbolsProcessed: 0,
          symbolsSucceeded: 0,
          symbolsSkipped: 0,
          symbolsErrored: 0,
          totalPricesStored: 0,
        },
      };
    }

    const startDate = new Date(dateRange.minDate);
    const endDate = new Date(dateRange.maxDate);
    
    // Extend end date to today to ensure we have latest prices
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (endDate < today) {
      endDate.setTime(today.getTime());
    }

    console.log(
      `Date range: ${dateRange.minDateString} to ${dateRange.maxDateString} (extended to today if needed)`
    );

    // Get all symbols from activities
    console.log("\nStep 2: Getting symbols from activities...");
    const symbols = await getActivitySymbols({ accountId });
    console.log(`Found ${symbols.length} unique symbols`);

    if (symbols.length === 0) {
      return {
        success: false,
        message: "No symbols found in activities",
        summary: {
          symbolsProcessed: 0,
          symbolsSucceeded: 0,
          symbolsSkipped: 0,
          symbolsErrored: 0,
          totalPricesStored: 0,
        },
      };
    }

    // Normalize crypto symbols
    console.log("\nStep 3: Normalizing crypto symbols...");
    const normalizedSymbols = await normalizeCryptoSymbols({ symbols });
    console.log(`Processing ${normalizedSymbols.length} symbols`);

    // Process each symbol
    console.log("\nStep 4: Fetching price history for each symbol...");
    const results = [];
    let totalPricesStored = 0;

    for (let i = 0; i < normalizedSymbols.length; i++) {
      const symbol = normalizedSymbols[i];
      console.log(`Processing ${i + 1}/${normalizedSymbols.length}: ${symbol}`);

      const result = await processSymbol(symbol, startDate, endDate, {
        forceRefresh,
      });

      results.push(result);

      if (result.status === "success") {
        totalPricesStored += result.pricesStored;
        console.log(
          `  ✓ ${symbol}: Stored ${result.pricesStored} prices (${result.existingCount} already existed)`
        );
      } else if (result.status === "skipped") {
        console.log(`  - ${symbol}: ${result.reason}`);
      } else {
        console.log(`  ✗ ${symbol}: ${result.reason || "error"}`);
      }
    }

    // Summary
    const summary = {
      symbolsProcessed: results.length,
      symbolsSucceeded: results.filter((r) => r.status === "success").length,
      symbolsSkipped: results.filter((r) => r.status === "skipped").length,
      symbolsErrored: results.filter((r) => r.status === "error").length,
      totalPricesStored,
      dateRange: {
        startDate: dateRange.minDateString,
        endDate: dateRange.maxDateString,
      },
    };

    console.log("\n=== Summary ===");
    console.log(`Symbols processed: ${summary.symbolsProcessed}`);
    console.log(`Symbols succeeded: ${summary.symbolsSucceeded}`);
    console.log(`Symbols skipped: ${summary.symbolsSkipped}`);
    console.log(`Symbols errored: ${summary.symbolsErrored}`);
    console.log(`Total prices stored: ${summary.totalPricesStored}`);

    return {
      success: true,
      summary,
      results,
    };
  } catch (err) {
    console.error("Error fetching price history:", err?.message || err);
    throw err;
  }
}

