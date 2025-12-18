/**
 * Unified Timeseries Builder
 * 
 * This module provides a unified approach to building portfolio timeseries
 * by combining cash, units, and price data. It replaces the separate
 * buildDailyCashSeries, buildDailyUnitsSeries, and buildDailyPortfolioSeries functions.
 * 
 * The unified approach:
 * 1. Creates date mappings for all dates (min date to today, including weekends)
 * 2. Processes activities to build cash and units time series simultaneously
 * 3. Fetches prices for all symbols
 * 4. Calculates portfolio values (cash + securities)
 * 5. Can save to database models (PortfolioTimeseries, PriceHistory)
 */

import { fetchHistoricalPrices } from "../../../quantDashBoard/server/src/utils/yahooFinanceClient.js";

/**
 * Get the minimum date from an array of activities
 * @param {Array} activities - Array of activity objects
 * @returns {Date|null} - Minimum date or null if no valid dates found
 */
export function getMinDate(activities) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return null;
  }

  const dates = activities
    .map((activity) => {
      const dateValue = activity.trade_date || activity.date;
      return dateValue ? new Date(dateValue) : null;
    })
    .filter((date) => date !== null && !isNaN(date.getTime()));

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

/**
 * Get the maximum date from an array of activities
 * @param {Array} activities - Array of activity objects
 * @returns {Date|null} - Maximum date or null if no valid dates found
 */
export function getMaxDate(activities) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return null;
  }

  const dates = activities
    .map((activity) => {
      const dateValue = activity.trade_date || activity.date;
      return dateValue ? new Date(dateValue) : null;
    })
    .filter((date) => date !== null && !isNaN(date.getTime()));

  if (dates.length === 0) {
    return null;
  }

  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

/**
 * Generate all dates between startDate and endDate (inclusive), including weekends
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array<string>} - Array of date strings in YYYY-MM-DD format
 */
export function generateDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return [];
  }

  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  // Normalize to midnight
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Create a date mapping object with all dates between minDate and today
 * Format: { "YYYY-MM-DD": {} }
 * @param {Date|null} minDate - Minimum date
 * @param {Date} today - Today's date
 * @returns {Object} - Object with date keys and empty object values
 */
export function createDateMapping(minDate, today) {
  if (!minDate) {
    return {};
  }

  const dateStrings = generateDateRange(minDate, today);
  const mapping = {};

  dateStrings.forEach((dateStr) => {
    mapping[dateStr] = {};
  });

  return mapping;
}

/**
 * Check if a symbol is a cryptocurrency
 * @param {string} symbol - Symbol to check
 * @returns {boolean} - True if crypto symbol
 */
export function isCryptoSymbol(symbol) {
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
    "CBETH", "BAND", "NMR",
  ]);

  return CRYPTO_SYMBOLS.has(cleanSymbol) && !cleanSymbol.endsWith("-USD");
}

/**
 * Normalize symbol for Yahoo Finance API
 * @param {string} symbol - Original symbol
 * @returns {string} - Normalized symbol
 */
export function normalizeSymbolForYahoo(symbol) {
  if (!symbol) return symbol;

  // Remove spaces (for options)
  let cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();

  // Add -USD suffix for crypto
  if (isCryptoSymbol(cleanSymbol)) {
    cleanSymbol = `${cleanSymbol}-USD`;
  }

  return cleanSymbol;
}

/**
 * Build cash time series and units tracking for an account
 * Tracks cash balance and units of each security (stock/ETF) per day
 * Accumulates cash and units day by day starting at 0
 *
 * IMPORTANT: Activities are applied on their trade_date/date.
 * If an activity has date "2020-01-15", it appears in cash flow for "2020-01-15", not the next day.
 *
 * @param {Array} activities - Array of activity objects
 * @param {Object} dateMapping - Date mapping object {date: {}}
 * @returns {Object} - Updated date mapping with cash and units {date: {cash: number, cashFlow: number, activityCount: number, units: {SYMBOL: quantity}}}
 */
export function buildCashTimeSeries(activities, dateMapping) {
  // Activity types that affect cash balance
  const CASH_ACTIVITY_TYPES = new Set([
    "CONTRIBUTION",
    "DEPOSIT",
    "WITHDRAWAL",
    "FEE",
    "DIVIDEND",
    "INTEREST",
    "BUY",
    "SELL",
  ]);

  // Activity types that affect security units
  const UNITS_ACTIVITY_TYPES = new Set([
    "BUY",
    "SELL",
    "REI", // Dividend reinvestment adds units
  ]);

  // Filter activities to cash-affecting types
  const cashActivities = activities.filter((activity) => {
    const type = String(activity.type || "").toUpperCase();
    return CASH_ACTIVITY_TYPES.has(type);
  });

  // Filter activities that affect units
  const unitsActivities = activities.filter((activity) => {
    const type = String(activity.type || "").toUpperCase();
    return UNITS_ACTIVITY_TYPES.has(type);
  });

  // Group all activities by date (for cash and units processing)
  const activitiesByDate = new Map();

  // Process cash activities
  cashActivities.forEach((activity) => {
    const dateValue = activity.trade_date || activity.date;
    if (!dateValue) return;

    let dateStr;
    if (dateValue instanceof Date) {
      dateStr = dateValue.toISOString().split("T")[0];
    } else {
      const dateObj = new Date(dateValue);
      dateStr = dateObj.toISOString().split("T")[0];
    }

    if (!activitiesByDate.has(dateStr)) {
      activitiesByDate.set(dateStr, []);
    }
    activitiesByDate.get(dateStr).push(activity);
  });

  // Process units activities (may overlap with cash activities)
  unitsActivities.forEach((activity) => {
    const dateValue = activity.trade_date || activity.date;
    if (!dateValue) return;

    let dateStr;
    if (dateValue instanceof Date) {
      dateStr = dateValue.toISOString().split("T")[0];
    } else {
      const dateObj = new Date(dateValue);
      dateStr = dateObj.toISOString().split("T")[0];
    }

    if (!activitiesByDate.has(dateStr)) {
      activitiesByDate.set(dateStr, []);
    }
    // Only add if not already present (avoid duplicates for BUY/SELL)
    const existing = activitiesByDate.get(dateStr);
    if (!existing.some((a) => a.activityId === activity.activityId)) {
      existing.push(activity);
    }
  });

  // Sort dates chronologically
  const sortedDates = Object.keys(dateMapping).sort();

  // Build cash time series and units tracking
  let cash = 0; // Start at 0
  const units = {}; // Track units per symbol: {SYMBOL: quantity}

  for (const dateStr of sortedDates) {
    // Get activities for this date
    const dayActivities = activitiesByDate.get(dateStr) || [];

    // Process cash flow
    let dayCashFlow = 0;
    dayActivities.forEach((activity) => {
      const type = String(activity.type || "").toUpperCase();
      if (CASH_ACTIVITY_TYPES.has(type)) {
        const amount = parseFloat(activity.amount || 0);
        if (!isNaN(amount)) {
          dayCashFlow += amount; // Use amount as-is (with its sign)
        }
      }
    });

    // Process units changes
    dayActivities.forEach((activity) => {
      const type = String(activity.type || "").toUpperCase();
      if (UNITS_ACTIVITY_TYPES.has(type)) {
        const symbol = activity.symbol || activity.symbolObj?.symbol || null;
        if (!symbol) return;

        const quantity = parseFloat(activity.quantity || activity.units || 0);
        if (isNaN(quantity)) return;

        // Initialize symbol if not present
        if (!units[symbol]) {
          units[symbol] = 0;
        }

        // Update units based on activity type
        if (type === "BUY" || type === "REI") {
          // BUY and REI add units
          units[symbol] += Math.abs(quantity);
        } else if (type === "SELL") {
          // SELL subtracts units
          units[symbol] -= Math.abs(quantity);
        }
      }
    });

    // Add previous day's cash to today's cash flow
    cash += dayCashFlow;

    // Create a copy of current units state for this date
    const unitsSnapshot = { ...units };

    // Store cash and units for this date
    dateMapping[dateStr] = {
      cash: cash,
      cashFlow: dayCashFlow, // Store daily cash flow for reference
      activityCount: dayActivities.length,
      units: unitsSnapshot, // Snapshot of units per symbol at end of day
    };
  }

  return dateMapping;
}

/**
 * Extract all unique symbols from date mappings
 * @param {Object} dateMappingsObject - Object mapping accountId -> {date: {units: {SYMBOL: qty}}}
 * @returns {Set<string>} - Set of all unique symbols
 */
export function extractAllSymbols(dateMappingsObject) {
  const symbols = new Set();

  Object.values(dateMappingsObject).forEach((dateMapping) => {
    Object.values(dateMapping).forEach((dayData) => {
      if (dayData.units) {
        Object.keys(dayData.units).forEach((symbol) => {
          if (symbol && symbol.trim()) {
            symbols.add(symbol);
          }
        });
      }
    });
  });

  return symbols;
}

/**
 * Fetch prices for all symbols and forward fill for all dates
 * @param {Set<string>} symbols - Set of symbols to fetch
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {Array<string>} allDates - All dates in YYYY-MM-DD format
 * @returns {Promise<Object>} - Object mapping SYMBOL -> {date: price}
 */
export async function fetchAllPrices(symbols, startDate, endDate, allDates) {
  const priceData = {}; // {SYMBOL: {date: price}}
  const symbolsArray = Array.from(symbols);

  console.log(`\nFetching prices for ${symbolsArray.length} symbols...`);
  console.log(
    `Date range: ${startDate.toISOString().split("T")[0]} to ${
      endDate.toISOString().split("T")[0]
    }`
  );

  // Fetch prices for all symbols in parallel (with some batching to avoid rate limits)
  const batchSize = 10; // Process 10 symbols at a time
  const totalBatches = Math.ceil(symbolsArray.length / batchSize);
  let successfulFetches = 0;
  let failedFetches = 0;
  let skippedSymbols = 0;

  for (let i = 0; i < symbolsArray.length; i += batchSize) {
    const batch = symbolsArray.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    const progressPercent = Math.round((i / symbolsArray.length) * 100);

    console.log(
      `  [${progressPercent}%] Processing batch ${currentBatch}/${totalBatches} (${batch.length} symbols)...`
    );
    console.log(
      `      Progress: ${i}/${symbolsArray.length} symbols | ✓ ${successfulFetches} | ✗ ${failedFetches} | ⚠ ${skippedSymbols} skipped`
    );

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          // Skip symbols with spaces (likely options)
          if (symbol.includes(" ")) {
            return { symbol, status: "skipped", reason: "contains space" };
          }

          const normalizedSymbol = normalizeSymbolForYahoo(symbol);
          const prices = await fetchHistoricalPrices(
            symbol,
            startDate,
            endDate
          );

          if (prices.length === 0) {
            priceData[symbol] = {};
            return { symbol, status: "failed", reason: "no data" };
          }

          // Convert to date -> price mapping
          const priceMap = {};
          prices.forEach((price) => {
            const dateStr = price.date.toISOString().split("T")[0];
            priceMap[dateStr] = price.close;
          });

          // Forward fill prices for all dates
          let lastPrice = null;
          const filledPrices = {};
          allDates.forEach((dateStr) => {
            if (priceMap[dateStr] !== undefined && priceMap[dateStr] !== null) {
              lastPrice = priceMap[dateStr];
            }
            filledPrices[dateStr] = lastPrice;
          });

          priceData[symbol] = filledPrices;
          return { symbol, status: "success", pricesCount: prices.length };
        } catch (error) {
          priceData[symbol] = {}; // Empty price data
          return { symbol, status: "error", error: error.message };
        }
      })
    );

    // Update counters and log batch results
    batchResults.forEach((result) => {
      if (result) {
        if (result.status === "success") {
          successfulFetches++;
          console.log(
            `    ✓ ${result.symbol}: ${result.pricesCount} prices fetched`
          );
        } else if (result.status === "skipped") {
          skippedSymbols++;
          console.log(`    ⚠ ${result.symbol}: ${result.reason}`);
        } else if (result.status === "failed") {
          failedFetches++;
          console.log(`    ✗ ${result.symbol}: ${result.reason}`);
        } else if (result.status === "error") {
          failedFetches++;
          console.log(`    ✗ ${result.symbol}: ${result.error}`);
        }
      }
    });

    // Small delay between batches to respect rate limits
    if (i + batchSize < symbolsArray.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Final summary
  const finalProgress = 100;
  console.log(`\n  [${finalProgress}%] Price fetching complete!`);
  console.log(
    `      Summary: ✓ ${successfulFetches} successful | ✗ ${failedFetches} failed | ⚠ ${skippedSymbols} skipped`
  );
  console.log(`      Total symbols processed: ${symbolsArray.length}`);

  return priceData;
}

/**
 * Calculate portfolio value for each day
 * @param {Object} dateMappingsObject - Date mappings with units
 * @param {Object} priceData - Price data {SYMBOL: {date: price}}
 * @returns {Object} - Updated date mappings with portfolioValue
 */
export function calculatePortfolioValue(dateMappingsObject, priceData) {
  const updated = { ...dateMappingsObject };

  Object.keys(updated).forEach((accountId) => {
    const dateMapping = updated[accountId];
    const sortedDates = Object.keys(dateMapping).sort();
    const missingPriceWarnings = new Set(); // Track symbols with missing prices to warn once
    
    // Track last known price per symbol for forward-filling missing prices
    // Initialize per account to prevent cross-contamination between accounts
    const lastKnownPricePerSymbol = new Map();

    sortedDates.forEach((dateStr) => {
      const dayData = dateMapping[dateStr];
      let securitiesValue = 0;
      const positions = []; // Array for position breakdown

      // Calculate value of all securities for this day
      // Include both long positions (units > 0) and short positions (units < 0)
      if (dayData.units) {
        Object.entries(dayData.units).forEach(([symbol, units]) => {
          // Include all positions, whether long or short (units can be positive, negative, or zero)
          // Zero units are excluded as they represent no position
          if (units !== 0 && !isNaN(units)) {
            // Try to get price for this date
            let price =
              priceData[symbol] && priceData[symbol][dateStr] !== undefined && priceData[symbol][dateStr] !== null
                ? priceData[symbol][dateStr]
                : null;

            // Forward-fill: If price is missing, use last known price for this symbol
            if (price === null || price === undefined || isNaN(price)) {
              const lastKnownPrice = lastKnownPricePerSymbol.get(symbol);
              if (
                lastKnownPrice !== null &&
                lastKnownPrice !== undefined &&
                !isNaN(lastKnownPrice)
              ) {
                price = lastKnownPrice;
              } else {
                // No price data available at all for this symbol
                // Log warning once per symbol
                if (!missingPriceWarnings.has(symbol)) {
                  console.warn(
                    `⚠️  Missing price data for symbol ${symbol} on ${dateStr}. Position excluded from portfolio value calculation.`
                  );
                  missingPriceWarnings.add(symbol);
                }
                // Exclude from calculation - position value is unknown
                return;
              }
            }

            // Update last known price for forward-filling future dates
            if (price !== null && price !== undefined && !isNaN(price)) {
              lastKnownPricePerSymbol.set(symbol, price);
            }

            // Calculate value (price is guaranteed to be non-null here)
            const value = units * price; // Negative units * price = negative value (short position liability)
            securitiesValue += value;
            positions.push({
              symbol,
              units,
              price,
              value,
            });
          }
        });
      }

      // Total portfolio value = cash + securities value
      dayData.portfolioValue = (dayData.cash || 0) + securitiesValue;
      dayData.securitiesValue = securitiesValue;
      dayData.positions = positions; // Store position breakdown
    });
  });

  return updated;
}

/**
 * Save price data to PriceHistory model in database
 * @param {Object} priceData - Price data {SYMBOL: {date: price}}
 * @param {Object} opts - Options
 * @param {string} opts.databaseUrl - Database URL (optional)
 * @returns {Promise<void>}
 */
export async function savePriceDataToDatabase(priceData, opts = {}) {
  const { databaseUrl } = opts;
  const { ensureDbConnection, getDb } = await import("../utils/dbConnection.js");
  const PriceHistory = (await import("../../../quantDashBoard/server/src/models/PriceHistory.js")).default;

  await ensureDbConnection(databaseUrl);
  const db = getDb();

  const symbols = Object.keys(priceData).sort();
  console.log(`\nSaving ${symbols.length} symbols to PriceHistory collection...`);

  const collection = db.collection("pricehistories");
  const ops = [];

  symbols.forEach((symbol) => {
    const dates = Object.keys(priceData[symbol]).sort();
    dates.forEach((dateStr) => {
      const price = priceData[symbol][dateStr];
      if (price !== null && price !== undefined) {
        ops.push({
          updateOne: {
            filter: { symbol, date: new Date(dateStr) },
            update: {
              $set: {
                symbol,
                date: new Date(dateStr),
                close: price,
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }
    });
  });

  if (ops.length > 0) {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = ops.slice(i, i + BATCH_SIZE);
      await collection.bulkWrite(batch, { ordered: false });
    }
    console.log(`✓ Saved ${ops.length} price records to PriceHistory collection`);
  }
}

/**
 * Save portfolio timeseries data to PortfolioTimeseries model in database
 * @param {Object} dateMappingsObject - Date mappings with portfolio values
 * @param {Object} opts - Options
 * @param {string} opts.databaseUrl - Database URL (optional)
 * @param {Object} opts.userIdMap - Map of accountId -> userId (required)
 * @returns {Promise<void>}
 */
export async function savePortfolioTimeseriesToDatabase(
  dateMappingsObject,
  opts = {}
) {
  const { databaseUrl, userIdMap } = opts;
  const { ensureDbConnection, getDb } = await import("../utils/dbConnection.js");
  const PortfolioTimeseries = (await import("../../../quantDashBoard/server/src/models/PortfolioTimeseries.js")).default;

  await ensureDbConnection(databaseUrl);
  const db = getDb();

  console.log(`\nSaving portfolio timeseries to PortfolioTimeseries collection...`);

  const collection = db.collection("portfoliotimeseries");
  const ops = [];

  Object.entries(dateMappingsObject).forEach(([accountId, dateMapping]) => {
    const userId = userIdMap?.[accountId];
    if (!userId) {
      console.warn(`⚠ No userId found for accountId ${accountId}, skipping...`);
      return;
    }

    const sortedDates = Object.keys(dateMapping).sort();
    sortedDates.forEach((dateStr) => {
      const dayData = dateMapping[dateStr];
      const date = new Date(dateStr);

      // Calculate depositWithdrawal (external flows: CONTRIBUTION, DEPOSIT, WITHDRAWAL)
      let depositWithdrawal = 0;
      // This would need to be calculated from activities, but for now we'll use cashFlow
      // as a proxy (though it includes all cash flows, not just external)
      // TODO: Filter cashFlow to only external flows
      depositWithdrawal = dayData.cashFlow || 0;

      ops.push({
        updateOne: {
          filter: {
            userId,
            accountId,
            date,
          },
          update: {
            $set: {
              userId,
              accountId,
              date,
              stockValue: dayData.securitiesValue || 0,
              cashValue: dayData.cash || 0,
              totalValue: dayData.portfolioValue || 0,
              depositWithdrawal,
              externalFlowCumulative: 0, // TODO: Calculate cumulative external flows
              positions: dayData.positions || [],
              createdAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    });
  });

  if (ops.length > 0) {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = ops.slice(i, i + BATCH_SIZE);
      await collection.bulkWrite(batch, { ordered: false });
    }
    console.log(`✓ Saved ${ops.length} portfolio timeseries records to database`);
  }
}

