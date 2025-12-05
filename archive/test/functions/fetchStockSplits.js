import { ensureDbConnection, getDb } from "../utils/dbConnection.js";
import { getActivitySymbols } from "./getActivitySymbols.js";
import { getActivityDateRange } from "./getActivityDateRange.js";
import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";

// Dynamic import for yahoo-finance2 to work from archive/test location
let YahooFinanceModule = null;
let yahooFinanceInstance = null;

async function getYahooFinance() {
  if (!YahooFinanceModule) {
    const mod = await import("yahoo-finance2");
    YahooFinanceModule = mod.default || mod;
  }
  if (!yahooFinanceInstance) {
    yahooFinanceInstance = new YahooFinanceModule({
      suppressNotices: ["ripHistorical"],
    });
  }
  return yahooFinanceInstance;
}

// Rate limiting: max 2000 requests/hour = ~33 requests/minute = ~1 request every 2 seconds
const RATE_LIMIT_DELAY_MS = 2000;
let lastRequestTime = 0;

async function rateLimitDelay() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    const delay = RATE_LIMIT_DELAY_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

/**
 * Normalizes Yahoo split ratio to factor and ratioFrom/ratioTo
 * @param {string|number} ratio - Split ratio from Yahoo (e.g., "2:1", "1:2", or numeric)
 * @returns {Object} - { ratioFrom, ratioTo, factor }
 */
function normalizeSplitRatio(ratio) {
  if (typeof ratio === "string" && ratio.includes(":")) {
    const parts = ratio.split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] > 0) {
      return {
        ratioFrom: parts[1], // denominator (before split)
        ratioTo: parts[0],   // numerator (after split)
        factor: parts[0] / parts[1],
      };
    }
  } else if (typeof ratio === "number" && ratio > 0) {
    // If it's a numeric factor (e.g., 2.0 for 2:1 split)
    return {
      ratioFrom: 1,
      ratioTo: ratio,
      factor: ratio,
    };
  }
  
  // Default: no split
  return {
    ratioFrom: 1,
    ratioTo: 1,
    factor: 1.0,
  };
}

/**
 * Fetches stock splits from Yahoo Finance for a single symbol
 * @param {string} symbol - Ticker symbol
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of split objects with date, factor, ratio, ratioFrom, ratioTo
 */
async function fetchSplitsFromYahoo(symbol, startDate, endDate) {
  await rateLimitDelay();

  // Skip option tickers that contain spaces (they don't have splits)
  if (symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "")) {
    return [];
  }

  // Normalize symbol (remove spaces, append -USD for crypto if needed)
  let cleanSymbol = symbol.replace(/\s+/g, "");
  const originalSymbol = symbol;

  try {
    const yahooFinance = await getYahooFinance();
    const end = endDate || new Date();
    const start = startDate || new Date(0);

    // Fetch chart data with split events
    const chart = await yahooFinance.chart(cleanSymbol, {
      period1: start,
      period2: end,
      interval: "1d",
      events: "split",
    });

    if (!chart || !chart.quotes || !Array.isArray(chart.quotes)) {
      return [];
    }

    const splits = [];
    const seenDates = new Set();

    // Check chart.events.splits if available
    if (
      chart.events &&
      chart.events.splits &&
      Array.isArray(chart.events.splits)
    ) {
      for (const split of chart.events.splits) {
        if (split.date) {
          const dateKey = new Date(split.date).toISOString().split("T")[0];
          if (!seenDates.has(dateKey)) {
            seenDates.add(dateKey);
            
            let ratioStr = "1:1";
            if (split.numerator && split.denominator) {
              ratioStr = `${split.numerator}:${split.denominator}`;
            } else if (split.ratio) {
              ratioStr = split.ratio;
            }
            
            const normalized = normalizeSplitRatio(ratioStr);
            const factor = split.numerator && split.denominator
              ? split.numerator / split.denominator
              : normalized.factor;

            splits.push({
              date: new Date(split.date),
              factor: factor,
              ratio: ratioStr,
              ratioFrom: normalized.ratioFrom,
              ratioTo: normalized.ratioTo,
            });
          }
        }
      }
    }

    // Also check quotes array for split information
    for (const row of chart.quotes) {
      if (row.split && row.date) {
        const dateKey = new Date(row.date).toISOString().split("T")[0];
        if (!seenDates.has(dateKey)) {
          seenDates.add(dateKey);
          
          const splitRatio = row.split;
          const normalized = normalizeSplitRatio(splitRatio);
          
          splits.push({
            date: new Date(row.date),
            factor: normalized.factor,
            ratio: typeof splitRatio === "string" ? splitRatio : `${normalized.ratioTo}:${normalized.ratioFrom}`,
            ratioFrom: normalized.ratioFrom,
            ratioTo: normalized.ratioTo,
          });
        }
      }
    }

    // Sort by date (oldest first)
    splits.sort((a, b) => a.date - b.date);

    return splits;
  } catch (error) {
    // Handle missing symbol or no split data gracefully
    if (
      error.message &&
      (error.message.includes("Invalid symbol") ||
        error.message.includes("Not found") ||
        error.message.includes("No such event type"))
    ) {
      // Try without events parameter as fallback
      try {
        await rateLimitDelay();
        const yahooFinance = await getYahooFinance();
        const chart = await yahooFinance.chart(cleanSymbol, {
          period1: start,
          period2: end,
          interval: "1d",
        });

        if (chart && chart.quotes && Array.isArray(chart.quotes)) {
          const splits = [];
          const seenDates = new Set();
          for (const row of chart.quotes) {
            if (row.split && row.date) {
              const dateKey = new Date(row.date).toISOString().split("T")[0];
              if (!seenDates.has(dateKey)) {
                seenDates.add(dateKey);
                const normalized = normalizeSplitRatio(row.split);
                splits.push({
                  date: new Date(row.date),
                  factor: normalized.factor,
                  ratio: typeof row.split === "string" ? row.split : `${normalized.ratioTo}:${normalized.ratioFrom}`,
                  ratioFrom: normalized.ratioFrom,
                  ratioTo: normalized.ratioTo,
                });
              }
            }
          }
          splits.sort((a, b) => a.date - b.date);
          return splits;
        }
      } catch (fallbackError) {
        // If fallback also fails, return empty array
      }
      return [];
    }
    console.warn(`Error fetching splits for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Upserts a stock split into the CorporateActions collection
 * @param {Object} splitRecord - Normalized split record
 * @param {boolean} forceRefresh - Whether to force update even if exists
 * @returns {Promise<Object>} Status object { inserted, updated, skipped }
 */
async function upsertStockSplit(splitRecord, forceRefresh = false) {
  const db = getDb();
  const corporateActionsCollection = db.collection("corporateactions");

  const { symbol, date, factor, ratio, ratioFrom, ratioTo } = splitRecord;

  // Build query key
  const query = {
    symbol: symbol,
    "splits.date": date,
    "splits.ratioFrom": ratioFrom,
    "splits.ratioTo": ratioTo,
  };

  if (!forceRefresh) {
    // Check if this exact split already exists
    const existing = await corporateActionsCollection.findOne(query);
    if (existing) {
      // Update the split if needed
      await corporateActionsCollection.updateOne(
        query,
        {
          $set: {
            "splits.$[elem].factor": factor,
            "splits.$[elem].ratio": ratio,
            lastUpdated: new Date(),
          },
        },
        {
          arrayFilters: [{ "elem.date": date }],
        }
      );
      return { inserted: false, updated: true, skipped: false };
    }
  }

  // Upsert: add split to symbol's splits array or create new document
  const result = await corporateActionsCollection.updateOne(
    { symbol: symbol },
    {
      $setOnInsert: {
        symbol: symbol,
        splits: [],
        dividends: [],
        source: "yahoo_finance",
      },
      $set: {
        lastUpdated: new Date(),
      },
      $addToSet: {
        splits: {
          date: date,
          factor: factor,
          ratio: ratio,
          ratioFrom: ratioFrom,
          ratioTo: ratioTo,
        },
      },
    },
    { upsert: true }
  );

  return {
    inserted: result.upsertedCount > 0,
    updated: result.modifiedCount > 0,
    skipped: result.matchedCount > 0 && result.modifiedCount === 0,
  };
}

/**
 * Fetches stock splits from Yahoo Finance and stores them in MongoDB
 * 
 * @param {Object} opts - Options object
 * @param {Array<string>} opts.symbols - Optional array of symbols to process (if not provided, fetches from activities)
 * @param {string} opts.accountId - Optional accountId to filter activities
 * @param {Date|string} opts.startDate - Optional start date (defaults to activity min date)
 * @param {Date|string} opts.endDate - Optional end date (defaults to activity max date or today)
 * @param {string} opts.databaseUrl - Optional MongoDB connection string
 * @param {boolean} opts.forceRefresh - If true, re-fetch all splits even if already in DB (default: false)
 * @returns {Promise<Object>} Summary object with success, summary stats, and per-symbol results
 */
export async function fetchStockSplits(opts = {}) {
  const {
    symbols: providedSymbols,
    accountId,
    startDate: providedStartDate,
    endDate: providedEndDate,
    databaseUrl,
    forceRefresh = false,
  } = opts;

  await ensureDbConnection(databaseUrl);
  const db = getDb();

  try {
    // Step 1: Determine symbols to process
    let symbols = providedSymbols;
    if (!symbols || symbols.length === 0) {
      symbols = await getActivitySymbols({ accountId, databaseUrl });
    }

    if (symbols.length === 0) {
      return {
        success: true,
        summary: {
          symbolsProcessed: 0,
          symbolsWithSplits: 0,
          splitsUpserted: 0,
          symbolsErrored: 0,
        },
        results: [],
        message: "No symbols to process",
      };
    }

    // Remove duplicates and sort
    symbols = [...new Set(symbols)].sort();

    // Step 2: Determine date range
    let startDate = providedStartDate
      ? new Date(providedStartDate)
      : null;
    let endDate = providedEndDate ? new Date(providedEndDate) : null;

    if (!startDate || !endDate) {
      const dateRange = await getActivityDateRange({ accountId, databaseUrl });
      if (dateRange.minDate && dateRange.maxDate) {
        startDate = startDate || dateRange.minDate;
        endDate = endDate || dateRange.maxDate;
      } else {
        // Default to all-time if no activity dates
        startDate = startDate || new Date("1970-01-01");
        endDate = endDate || new Date();
      }
    }

    // Ensure dates are Date objects
    startDate = new Date(startDate);
    endDate = new Date(endDate);

    console.log(
      `Fetching stock splits for ${symbols.length} symbols from ${formatDateToYYYYMMDD(startDate)} to ${formatDateToYYYYMMDD(endDate)}`
    );

    // Step 3: Initialize counters
    let symbolsProcessed = 0;
    let symbolsWithSplits = 0;
    let splitsUpserted = 0;
    let symbolsErrored = 0;
    const results = [];

    // Step 4: Process each symbol
    for (const symbol of symbols) {
      try {
        symbolsProcessed++;

        // Fetch splits from Yahoo Finance
        const rawSplits = await fetchSplitsFromYahoo(symbol, startDate, endDate);

        if (rawSplits.length === 0) {
          results.push({
            symbol,
            splitsCount: 0,
            status: "no_splits",
            error: null,
          });
          continue;
        }

        // Normalize and upsert each split
        let symbolSplitsUpserted = 0;
        for (const rawSplit of rawSplits) {
          const normalizedSplit = {
            symbol: symbol,
            date: rawSplit.date,
            factor: rawSplit.factor,
            ratio: rawSplit.ratio,
            ratioFrom: rawSplit.ratioFrom,
            ratioTo: rawSplit.ratioTo,
          };

          const upsertResult = await upsertStockSplit(normalizedSplit, forceRefresh);
          if (upsertResult.inserted || upsertResult.updated) {
            symbolSplitsUpserted++;
            splitsUpserted++;
          }
        }

        if (symbolSplitsUpserted > 0) {
          symbolsWithSplits++;
          results.push({
            symbol,
            splitsCount: rawSplits.length,
            splitsUpserted: symbolSplitsUpserted,
            status: "success",
            error: null,
          });
        } else {
          results.push({
            symbol,
            splitsCount: rawSplits.length,
            splitsUpserted: 0,
            status: "already_exists",
            error: null,
          });
        }
      } catch (error) {
        symbolsErrored++;
        results.push({
          symbol,
          splitsCount: 0,
          status: "error",
          error: error.message,
        });
        console.error(`Error processing splits for ${symbol}:`, error.message);
      }
    }

    // Step 5: Build summary
    return {
      success: true,
      summary: {
        symbolsProcessed,
        symbolsWithSplits,
        splitsUpserted,
        symbolsErrored,
      },
      results,
    };
  } catch (error) {
    console.error("Error in fetchStockSplits:", error);
    return {
      success: false,
      error: error.message,
      summary: {
        symbolsProcessed: 0,
        symbolsWithSplits: 0,
        splitsUpserted: 0,
        symbolsErrored: 0,
      },
      results: [],
    };
  }
}

