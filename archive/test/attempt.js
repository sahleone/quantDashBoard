import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAllAccountIds } from "./functions/getAccountIds.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import {
  disconnectDb,
  ensureDbConnection,
  getDb,
} from "./utils/dbConnection.js";
import AccountServiceClientService from "../../quantDashBoard/server/src/clients/accountClient.js";
import { fetchHistoricalPrices } from "../../quantDashBoard/server/src/utils/yahooFinanceClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

/**
 * Get the minimum date from an array of activities
 * @param {Array} activities - Array of activity objects
 * @returns {Date|null} - Minimum date or null if no valid dates found
 */
function getMinDate(activities) {
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
function getMaxDate(activities) {
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
function generateDateRange(startDate, endDate) {
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
function createDateMapping(minDate, today) {
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
function buildCashTimeSeries(activities, dateMapping) {
  // Activity types that affect cash balance
  // - CONTRIBUTION, DEPOSIT: Money deposited into account (positive)
  // - WITHDRAWAL: Money withdrawn from account (negative)
  // - DIVIDEND: Dividend income (positive) - adds to cash
  // - INTEREST: Interest on cash balances (positive)
  // - FEE: Account fees, margin interest (negative)
  // - BUY: Purchase of securities (negative cash flow)
  // - SELL: Sale of securities (positive cash flow)
  //
  // Excluded activity types:
  // - REI (dividend reinvestment): Uses DIVIDEND cash to buy stock/ETF, adds to security units.
  //   The DIVIDEND itself is already counted as cash income. REI is a securities transaction,
  //   not a direct cash flow (it would be represented as a BUY transaction if tracked separately).
  const CASH_ACTIVITY_TYPES = new Set([
    "CONTRIBUTION",
    "DEPOSIT",
    "WITHDRAWAL",
    "FEE",
    "DIVIDEND",
    "INTEREST",
    "BUY",
    "SELL",
    "TRANSFER",
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

  // External cash flow types (for TWR calculation): CONTRIBUTION, DEPOSIT, WITHDRAWAL, TRANSFER
  const EXTERNAL_CASH_FLOW_TYPES = new Set([
    "CONTRIBUTION",
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER",
  ]);

  for (const dateStr of sortedDates) {
    // Get activities for this date
    const dayActivities = activitiesByDate.get(dateStr) || [];

    // Process cash flow (all cash-affecting activities)
    let dayCashFlow = 0;
    // Process external cash flow (only CONTRIBUTION, DEPOSIT, WITHDRAWAL for TWR)
    let dayExternalCashFlow = 0;
    dayActivities.forEach((activity) => {
      const type = String(activity.type || "").toUpperCase();
      if (CASH_ACTIVITY_TYPES.has(type)) {
        const amount = parseFloat(activity.amount || 0);
        if (!isNaN(amount)) {
          dayCashFlow += amount; // Use amount as-is (with its sign)
        }
      }
      // Track external cash flows separately for TWR calculation
      if (EXTERNAL_CASH_FLOW_TYPES.has(type)) {
        const amount = parseFloat(activity.amount || 0);
        if (!isNaN(amount)) {
          dayExternalCashFlow += amount; // Use amount as-is (with its sign)
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
      cashFlow: dayCashFlow, // Store daily cash flow for reference (all cash-affecting activities)
      externalCashFlow: dayExternalCashFlow, // Store external cash flow (CONTRIBUTION, DEPOSIT, WITHDRAWAL only)
      activityCount: dayActivities.length,
      units: unitsSnapshot, // Snapshot of units per symbol at end of day
    };
  }

  return dateMapping;
}

/**
 * Check if a symbol is a cryptocurrency
 * @param {string} symbol - Symbol to check
 * @returns {boolean} - True if crypto symbol
 */
function isCryptoSymbol(symbol) {
  const cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();

  // Common cryptocurrency symbols that need "-USD" suffix for Yahoo Finance
  const CRYPTO_SYMBOLS = new Set([
    "BTC",
    "ETH",
    "LTC",
    "XRP",
    "BCH",
    "EOS",
    "XLM",
    "XTZ",
    "ADA",
    "DOT",
    "LINK",
    "UNI",
    "AAVE",
    "SOL",
    "MATIC",
    "AVAX",
    "ATOM",
    "ALGO",
    "FIL",
    "DOGE",
    "SHIB",
    "USDC",
    "USDT",
    "DAI",
    "BAT",
    "ZEC",
    "XMR",
    "DASH",
    "ETC",
    "TRX",
    "VET",
    "THETA",
    "ICP",
    "FTM",
    "NEAR",
    "APT",
    "ARB",
    "OP",
    "SUI",
    "SEI",
    "TIA",
    "INJ",
    "MKR",
    "COMP",
    "SNX",
    "CRV",
    "YFI",
    "SUSHI",
    "1INCH",
    "ENJ",
    "MANA",
    "SAND",
    "AXS",
    "GALA",
    "CHZ",
    "FLOW",
    "GRT",
    "ANKR",
    "SKL",
    "NU",
    "CGLD",
    "OXT",
    "UMA",
    "FORTH",
    "ETH2",
    "CBETH",
    "BAND",
    "NMR",
  ]);

  return CRYPTO_SYMBOLS.has(cleanSymbol) && !cleanSymbol.endsWith("-USD");
}

/**
 * Normalize symbol for Yahoo Finance API
 * @param {string} symbol - Original symbol
 * @returns {string} - Normalized symbol
 */
function normalizeSymbolForYahoo(symbol) {
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
 * Extract all unique symbols from date mappings
 * @param {Object} dateMappingsObject - Object mapping accountId -> {date: {units: {SYMBOL: qty}}}
 * @returns {Set<string>} - Set of all unique symbols
 */
function extractAllSymbols(dateMappingsObject) {
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
async function fetchAllPrices(symbols, startDate, endDate, allDates) {
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
            normalizedSymbol,
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
 * Calculate portfolio value and TWR returns for each day
 * TWR calculation is done in the same loop right after calculating portfolio value
 * @param {Object} dateMappingsObject - Date mappings with units
 * @param {Object} priceData - Price data {SYMBOL: {date: price}}
 * @returns {Object} - Updated date mappings with portfolioValue and dailyTWRReturn
 */
function calculatePortfolioValue(dateMappingsObject, priceData) {
  const updated = { ...dateMappingsObject };

  Object.keys(updated).forEach((accountId) => {
    const dateMapping = updated[accountId];
    const sortedDates = Object.keys(dateMapping).sort();

    // Track previous day's portfolio value for TWR calculation
    let prevPortfolioValue = null;

    sortedDates.forEach((dateStr, index) => {
      const dayData = dateMapping[dateStr];
      let securitiesValue = 0;

      // Calculate value of all securities for this day (weights * price)
      // Allow both long (positive) and short (negative) positions
      if (dayData.units) {
        Object.entries(dayData.units).forEach(([symbol, units]) => {
          if (
            units !== 0 &&
            priceData[symbol] &&
            priceData[symbol][dateStr] !== undefined &&
            priceData[symbol][dateStr] !== null
          ) {
            const price = priceData[symbol][dateStr];
            securitiesValue += units * price;
          }
        });
      }

      // Total portfolio value = cash + securities value
      dayData.portfolioValue = (dayData.cash || 0) + securitiesValue;
      dayData.securitiesValue = securitiesValue;

      // Calculate daily TWR return
      // Treat net external cash flow as if it occurs at the *start* of the day
      const externalCashFlow = dayData.externalCashFlow || 0;
      const currentPortfolioValue = dayData.portfolioValue;

      if (index === 0) {
        // First day: no prior portfolio to compare against
        dayData.dailyTWRReturn = 0;
      } else if (
        prevPortfolioValue === null ||
        prevPortfolioValue === undefined
      ) {
        dayData.dailyTWRReturn = 0;
      } else {
        // Standard daily TWR approximation:
        // Treat cash flow as happening at start of day
        // Return = (End Value Before CF) / (Start Value With CF) - 1
        const portfolioValueBeforeCashFlow =
          currentPortfolioValue - externalCashFlow;
        const startOfDayValue = prevPortfolioValue + externalCashFlow;

        if (Math.abs(startOfDayValue) < 1e-6) {
          // Avoid division by ~0 when portfolio basically starts from nothing
          dayData.dailyTWRReturn = 0;
        } else {
          const twrReturn = portfolioValueBeforeCashFlow / startOfDayValue - 1;

          // Validate result (handle NaN, Infinity, or extremely large values)
          if (
            isNaN(twrReturn) ||
            !isFinite(twrReturn) ||
            Math.abs(twrReturn) > 10 // guard against crazy outliers
          ) {
            dayData.dailyTWRReturn = 0;
          } else {
            dayData.dailyTWRReturn = twrReturn;
          }
        }
      }

      // Carry forward current portfolio value for next iteration
      prevPortfolioValue = currentPortfolioValue;
    });
  });

  return updated;
}

/**
 * Calculate rolling TWR returns for different periods
 * Geometrically links daily TWR returns over the specified period
 *
 * Formula: TWR = (1 + r₁) × (1 + r₂) × ... × (1 + rₙ) - 1
 * where rᵢ are the daily TWR returns
 *
 * @param {Object} dateMappingsObject - Date mappings with dailyTWRReturn already calculated
 * @returns {Object} - Updated date mappings with twr1Day, twr3Months, twrYearToDate, twrAllTime
 */
function calculatePeriodTWRReturns(dateMappingsObject) {
  const updated = { ...dateMappingsObject };

  Object.keys(updated).forEach((accountId) => {
    const dateMapping = updated[accountId];
    const sortedDates = Object.keys(dateMapping).sort();

    if (sortedDates.length === 0) return;

    // Get the first date (inception date)
    const firstDate = sortedDates[0];
    // Parse first date string to get year (using UTC to avoid timezone issues)
    const [firstYear] = firstDate.split("-").map(Number);

    // Process each date
    for (let i = 0; i < sortedDates.length; i++) {
      const currentDate = sortedDates[i];
      const currentData = dateMapping[currentDate];

      // twr1Day: Same as dailyTWRReturn
      currentData.twr1Day =
        currentData.dailyTWRReturn !== undefined
          ? currentData.dailyTWRReturn
          : null;

      // Calculate 3 months ago date (using UTC to avoid timezone issues)
      // Parse currentDate string (YYYY-MM-DD) and work with UTC
      const [currentYear, currentMonth, currentDay] = currentDate
        .split("-")
        .map(Number);

      // Calculate target year and month (subtract 3 months)
      let targetYear = currentYear;
      let targetMonth = currentMonth - 3;

      // Handle year rollover
      while (targetMonth < 1) {
        targetMonth += 12;
        targetYear -= 1;
      }

      // Get the last day of the target month to handle month-end dates correctly
      // (e.g., May 31 -> Feb 28/29, not Mar 3)
      const lastDayOfTargetMonth = new Date(
        Date.UTC(targetYear, targetMonth, 0)
      ).getUTCDate();

      // Use the minimum of original day and last day of target month
      // This prevents rollover (e.g., May 31 -> Feb 28/29, not Mar 3)
      const targetDay = Math.min(currentDay, lastDayOfTargetMonth);

      // Format as YYYY-MM-DD string
      const threeMonthsAgoStr = `${targetYear}-${String(targetMonth).padStart(
        2,
        "0"
      )}-${String(targetDay).padStart(2, "0")}`;

      // Calculate year start (Jan 1 of current year) using UTC
      const yearStartStr = `${currentYear}-01-01`;

      // Helper function to geometrically link returns
      const geometricLink = (startDateStr, endDateStr) => {
        const periodDates = sortedDates.filter(
          (d) => d >= startDateStr && d <= endDateStr
        );

        if (periodDates.length === 0) return null;

        // Get the first date in the period (might be before our data starts)
        const actualStartDate = periodDates[0];
        const actualStartData = dateMapping[actualStartDate];

        // If we don't have data for the start date, return null
        if (
          !actualStartData ||
          actualStartData.dailyTWRReturn === undefined ||
          actualStartData.dailyTWRReturn === null
        ) {
          return null;
        }

        // Start with 1 and multiply by (1 + daily return) for each day
        let cumulative = 1;
        let hasValidReturns = false;

        for (const dateStr of periodDates) {
          const dayData = dateMapping[dateStr];
          if (
            dayData &&
            dayData.dailyTWRReturn !== undefined &&
            dayData.dailyTWRReturn !== null
          ) {
            cumulative *= 1 + dayData.dailyTWRReturn;
            hasValidReturns = true;
          }
        }

        if (!hasValidReturns) return null;

        return cumulative - 1;
      };

      // twr3Months: Rolling 3-month TWR
      const start3M =
        threeMonthsAgoStr > firstDate ? threeMonthsAgoStr : firstDate;
      currentData.twr3Months = geometricLink(start3M, currentDate);

      // twrYearToDate: YTD TWR (from Jan 1 of current year)
      const startYTD = yearStartStr > firstDate ? yearStartStr : firstDate;
      // Only calculate if we're in the same year or later (use parsed year from date string)
      if (currentYear >= firstYear) {
        currentData.twrYearToDate = geometricLink(startYTD, currentDate);
      } else {
        currentData.twrYearToDate = null;
      }

      // twrAllTime: All-time TWR (from inception)
      currentData.twrAllTime = geometricLink(firstDate, currentDate);
    }
  });

  return updated;
}

/**
 * Save portfolio timeseries data to database
 * @param {Object} dateMappingsObject - Date mappings with portfolio values and TWR returns
 * @param {Map<string, string>} accountIdToUserIdMap - Map of accountId -> userId
 * @returns {Promise<void>}
 */
async function savePortfolioTimeseriesToDatabase(
  dateMappingsObject,
  accountIdToUserIdMap
) {
  await ensureDbConnection();
  const db = getDb();
  const portfolioCollection = db.collection("portfoliotimeseries");

  console.log("\nSaving portfolio timeseries to database...");

  const ops = [];
  let totalRecords = 0;

  Object.entries(dateMappingsObject).forEach(([accountId, dateMapping]) => {
    const userId = accountIdToUserIdMap.get(accountId);
    if (!userId) {
      console.warn(`⚠ No userId found for accountId ${accountId}, skipping...`);
      return;
    }

    const sortedDates = Object.keys(dateMapping).sort();
    // Use a running total for cumulative external flows (O(N) instead of O(N²))
    let externalFlowCumulative = 0;
    sortedDates.forEach((dateStr) => {
      const dayData = dateMapping[dateStr];
      const date = new Date(dateStr);

      // Accumulate external flows as we iterate (running total)
      externalFlowCumulative += dayData.externalCashFlow || 0;

      // Build positions array from units (include both long and short positions)
      const positions = [];
      if (dayData.units) {
        Object.entries(dayData.units).forEach(([symbol, units]) => {
          if (units !== 0) {
            // Note: price would need to be fetched from priceData if available
            // For now, we'll just store units
            positions.push({
              symbol,
              units,
              price: null, // Could be populated if priceData is passed
              value: null, // Could be calculated if price is available
            });
          }
        });
      }

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
              depositWithdrawal: dayData.externalCashFlow || 0,
              externalFlowCumulative,
              dailyTWRReturn:
                dayData.dailyTWRReturn !== undefined
                  ? dayData.dailyTWRReturn
                  : null,
              twr1Day: dayData.twr1Day !== undefined ? dayData.twr1Day : null,
              twr3Months:
                dayData.twr3Months !== undefined ? dayData.twr3Months : null,
              twrYearToDate:
                dayData.twrYearToDate !== undefined
                  ? dayData.twrYearToDate
                  : null,
              twrAllTime:
                dayData.twrAllTime !== undefined ? dayData.twrAllTime : null,
              positions,
            },
          },
          upsert: true,
        },
      });
      totalRecords++;
    });
  });

  if (ops.length > 0) {
    console.log(`  Preparing to save ${totalRecords} records...`);
    const result = await portfolioCollection.bulkWrite(ops, { ordered: false });
    console.log(
      `  ✓ Saved ${result.upsertedCount + result.modifiedCount} records`
    );
    console.log(`    - Upserted: ${result.upsertedCount}`);
    console.log(`    - Modified: ${result.modifiedCount}`);
  } else {
    console.log("  ⚠ No records to save");
  }
}

/**
 * Save price data to CSV and JSON files
 * @param {Object} priceData - Price data {SYMBOL: {date: price}}
 * @param {string} outputDir - Output directory
 */
function savePriceData(priceData, outputDir) {
  const symbols = Object.keys(priceData).sort();

  // Save as JSON
  const jsonPath = path.join(outputDir, "priceData.json");
  fs.writeFileSync(jsonPath, JSON.stringify(priceData, null, 2));
  console.log(`\n✓ Price data saved to JSON: ${jsonPath}`);

  // Save as CSV (one row per symbol-date)
  const csvRows = ["Symbol,Date,Price"];
  symbols.forEach((symbol) => {
    const dates = Object.keys(priceData[symbol]).sort();
    dates.forEach((dateStr) => {
      const price = priceData[symbol][dateStr];
      csvRows.push(
        `${symbol},${dateStr},${
          price !== null && price !== undefined ? price.toFixed(4) : ""
        }`
      );
    });
  });

  const csvPath = path.join(outputDir, "priceData.csv");
  fs.writeFileSync(csvPath, csvRows.join("\n"));
  console.log(`✓ Price data saved to CSV: ${csvPath}`);
}

/**
 * Generate HTML chart for cash time series
 * @param {Object} dateMappingsObject - Object mapping accountId -> {date: {cash, cashFlow, units}}
 * @param {Array} accountIds - Array of account IDs
 * @returns {string} - HTML string for the chart
 */
function generateCashChartHTML(dateMappingsObject, accountIds) {
  const accountData = accountIds.map((accountId) => {
    const dateMapping = dateMappingsObject[accountId] || {};
    const sortedDates = Object.keys(dateMapping).sort();

    return {
      accountId,
      label: `Account ${accountId.substring(0, 8)}...`,
      dates: sortedDates,
      cash: sortedDates.map((date) => dateMapping[date]?.cash || 0),
      cashFlow: sortedDates.map((date) => dateMapping[date]?.cashFlow || 0),
      portfolioValue: sortedDates.map(
        (date) => dateMapping[date]?.portfolioValue || 0
      ),
      securitiesValue: sortedDates.map(
        (date) => dateMapping[date]?.securitiesValue || 0
      ),
    };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portfolio & Cash Time Series Chart</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .account-selector {
            margin-bottom: 20px;
        }
        .account-selector label {
            font-weight: 600;
            margin-right: 10px;
        }
        .account-selector select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: 10px;
        }
        .checkbox-group input[type="checkbox"] {
            margin: 0;
        }
        .checkbox-group label {
            font-size: 14px;
            cursor: pointer;
        }
        .chart-container {
            position: relative;
            height: 600px;
            margin-top: 30px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #007bff;
        }
        .stat-card h3 {
            margin: 0 0 8px 0;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
        .stat-card .value {
            font-size: 20px;
            font-weight: bold;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Portfolio & Cash Time Series Chart</h1>
        <div class="account-selector">
            <label for="accountSelect">Account:</label>
            <select id="accountSelect">
                ${accountIds
                  .map(
                    (accountId, index) =>
                      `<option value="${index}">${accountId.substring(
                        0,
                        8
                      )}...</option>`
                  )
                  .join("")}
            </select>
            <div class="checkbox-group">
                <input type="checkbox" id="showCashFlow" checked>
                <label for="showCashFlow">Show Daily Cash Flow</label>
                <input type="checkbox" id="showPortfolioValue" checked>
                <label for="showPortfolioValue">Show Portfolio Value</label>
                <input type="checkbox" id="showSecuritiesValue">
                <label for="showSecuritiesValue">Show Securities Value</label>
            </div>
        </div>
        <div class="stats" id="stats"></div>
        <div class="chart-container">
            <canvas id="cashChart"></canvas>
        </div>
    </div>

    <script>
        const accountData = ${JSON.stringify(accountData)};
        let chart = null;

        function updateChart(accountIndex) {
            const data = accountData[accountIndex];
            if (!data) return;

            const ctx = document.getElementById('cashChart').getContext('2d');
            const showCashFlow = document.getElementById('showCashFlow').checked;
            const showPortfolioValue = document.getElementById('showPortfolioValue').checked;
            const showSecuritiesValue = document.getElementById('showSecuritiesValue').checked;

            // Destroy existing chart
            if (chart) {
                chart.destroy();
            }

            // Calculate stats
            const cashValues = data.cash;
            const cashFlows = data.cashFlow;
            const portfolioValues = data.portfolioValue || [];
            const securitiesValues = data.securitiesValue || [];
            const maxCash = Math.max(...cashValues);
            const minCash = Math.min(...cashValues);
            const lastCash = cashValues[cashValues.length - 1] || 0;
            const firstCash = cashValues[0] || 0;
            const totalCashFlow = cashFlows.reduce((a, b) => a + b, 0);
            const lastPortfolioValue = portfolioValues[portfolioValues.length - 1] || 0;
            const firstPortfolioValue = portfolioValues[0] || 0;
            const maxPortfolioValue = portfolioValues.length > 0 ? Math.max(...portfolioValues) : 0;

            // Update stats
            document.getElementById('stats').innerHTML = \`
                <div class="stat-card">
                    <h3>Starting Cash</h3>
                    <div class="value">$\${firstCash.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Ending Cash</h3>
                    <div class="value">$\${lastCash.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Starting Portfolio Value</h3>
                    <div class="value">$\${firstPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Ending Portfolio Value</h3>
                    <div class="value">$\${lastPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Max Portfolio Value</h3>
                    <div class="value">$\${maxPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Cash Flow</h3>
                    <div class="value">$\${totalCashFlow.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Days</h3>
                    <div class="value">\${data.dates.length}</div>
                </div>
            \`;

            // Create datasets
            const datasets = [
                {
                    label: 'Cash Balance',
                    data: cashValues,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y',
                }
            ];

            if (showPortfolioValue && portfolioValues.length > 0) {
                datasets.push({
                    label: 'Portfolio Value',
                    data: portfolioValues,
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y',
                });
            }

            if (showSecuritiesValue && securitiesValues.length > 0) {
                datasets.push({
                    label: 'Securities Value',
                    data: securitiesValues,
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y',
                });
            }

            if (showCashFlow) {
                datasets.push({
                    label: 'Daily Cash Flow',
                    data: cashFlows,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 1,
                    fill: false,
                    tension: 0.1,
                    yAxisID: 'y1',
                });
            }

            // Create chart
            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.dates,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    label += '$' + context.parsed.y.toFixed(2);
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Date'
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Value ($)'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: showCashFlow,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Daily Cash Flow ($)'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                }
            });
        }

        // Initialize with first account
        updateChart(0);

        // Handle account selection change
        document.getElementById('accountSelect').addEventListener('change', (e) => {
            updateChart(parseInt(e.target.value));
        });

        // Handle toggles
        document.getElementById('showCashFlow').addEventListener('change', () => {
            const accountIndex = parseInt(document.getElementById('accountSelect').value);
            updateChart(accountIndex);
        });
        document.getElementById('showPortfolioValue').addEventListener('change', () => {
            const accountIndex = parseInt(document.getElementById('accountSelect').value);
            updateChart(accountIndex);
        });
        document.getElementById('showSecuritiesValue').addEventListener('change', () => {
            const accountIndex = parseInt(document.getElementById('accountSelect').value);
            updateChart(accountIndex);
        });
    </script>
</body>
</html>`;
}

async function main() {
  try {
    console.log("Fetching account IDs...");
    const accountIds = await getAllAccountIds();

    console.log(`\nFound ${accountIds.length} account ID(s):`);
    accountIds.forEach((id, index) => {
      console.log(`  ${index + 1}. ${id}`);
    });

    // Create a mapping to store activities for each account
    const activitiesMap = new Map();
    // Create a mapping to store accountId -> userId
    const accountIdToUserIdMap = new Map();

    console.log("\n" + "=".repeat(60));
    console.log("Fetching activities for each account...");
    console.log("=".repeat(60));

    // Fetch activities for each account
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      console.log(
        `\n[${i + 1}/${
          accountIds.length
        }] Fetching activities for account: ${accountId}`
      );

      try {
        // First, try to get activities from database
        const activities = await getAccountActivities({ accountId });
        console.log(
          `  ✓ Retrieved ${activities.length} activities from database`
        );

        // Fetch userId for this account (needed for database storage)
        try {
          await ensureDbConnection();
          const db = getDb();
          const accountsCollection = db.collection("snaptradeaccounts");
          const account = await accountsCollection.findOne({ accountId });
          if (account && account.userId) {
            accountIdToUserIdMap.set(accountId, account.userId);
          }
        } catch (err) {
          console.warn(
            `  ⚠ Could not fetch userId for account ${accountId}: ${err.message}`
          );
        }

        // If no activities found, explicitly fetch from SnapTrade API
        if (activities.length === 0) {
          console.log(
            `  ⚠ No activities in database, fetching directly from SnapTrade API...`
          );

          try {
            await ensureDbConnection();
            const db = getDb();
            const accountsCollection = db.collection("snaptradeaccounts");
            const activitiesCollection = db.collection(
              "snaptradeaccountactivities"
            );
            const usersCollection = db.collection("users");

            const account = await accountsCollection.findOne({ accountId });
            if (!account) {
              throw new Error(`Account not found: ${accountId}`);
            }

            const userId = account.userId;
            if (!userId) {
              throw new Error(`No userId found for account: ${accountId}`);
            }

            // Store userId mapping for later use
            accountIdToUserIdMap.set(accountId, userId);

            const user = await usersCollection.findOne({ userId });
            if (!user || !user.userSecret) {
              throw new Error(`No userSecret found for userId: ${userId}`);
            }

            const accountService = new AccountServiceClientService();
            const activityTypes =
              "BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER";

            console.log(
              `  → Calling SnapTrade API for account ${accountId}...`
            );
            const rawActivities = await accountService.listAllAccountActivities(
              userId,
              user.userSecret,
              accountId,
              1000,
              null, // startDate = null means fetch all
              null, // endDate
              activityTypes
            );

            console.log(
              `  → SnapTrade API returned ${
                rawActivities?.length || 0
              } activities`
            );

            if (Array.isArray(rawActivities) && rawActivities.length > 0) {
              const transformed = accountService.transformActivitiesForMongoDB(
                rawActivities,
                accountId,
                userId
              );

              // Upsert into database
              const ops = transformed.map((doc) => ({
                updateOne: {
                  filter: {
                    accountId: doc.accountId,
                    activityId: doc.activityId,
                  },
                  update: { $set: doc },
                  upsert: true,
                },
              }));

              if (ops.length > 0) {
                await activitiesCollection.bulkWrite(ops, { ordered: false });
                console.log(
                  `  ✓ Saved ${transformed.length} activities to database`
                );

                // Fetch the updated activities
                const updatedActivities = await activitiesCollection
                  .find({ accountId })
                  .toArray();

                updatedActivities.sort((a, b) => {
                  const dateA = a.trade_date || a.date;
                  const dateB = b.trade_date || b.date;
                  if (!dateA && !dateB) return 0;
                  if (!dateA) return 1;
                  if (!dateB) return -1;
                  return new Date(dateA) - new Date(dateB);
                });

                activitiesMap.set(accountId, updatedActivities);
                console.log(
                  `  ✓ Total activities after SnapTrade fetch: ${updatedActivities.length}`
                );
              } else {
                activitiesMap.set(accountId, []);
                console.log(
                  `  ⚠ No activities to save (transformation returned empty)`
                );
              }
            } else {
              activitiesMap.set(accountId, []);
              console.log(
                `  ℹ SnapTrade API returned no activities for this account`
              );
            }
          } catch (snapError) {
            console.error(
              `  ✗ Error fetching from SnapTrade API:`,
              snapError.message
            );
            activitiesMap.set(accountId, []); // Store empty array on error
          }
        } else {
          activitiesMap.set(accountId, activities);
        }
      } catch (error) {
        console.error(
          `  ✗ Error fetching activities for ${accountId}:`,
          error.message
        );
        activitiesMap.set(accountId, []); // Store empty array on error
      }
    }

    // Calculate date ranges for each account
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateRanges = new Map();
    const dateMappings = new Map(); // Map of accountId -> {date: {}}

    activitiesMap.forEach((activities, accountId) => {
      const minDate = getMinDate(activities);
      const maxDate = getMaxDate(activities);
      dateRanges.set(accountId, {
        minDate,
        maxDate,
        today: new Date(today),
      });

      // Create date mapping for this account (minDate to today, including weekends)
      const dateMapping = createDateMapping(minDate, today);

      // Build cash time series for this account (modifies dateMapping in place)
      buildCashTimeSeries(activities, dateMapping);
      dateMappings.set(accountId, dateMapping);
    });

    // Display summary
    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    console.log("=".repeat(60));
    let totalActivities = 0;
    activitiesMap.forEach((activities, accountId) => {
      const count = activities.length;
      totalActivities += count;
      const dateRange = dateRanges.get(accountId);
      const minDateStr = dateRange.minDate
        ? dateRange.minDate.toISOString().split("T")[0]
        : "N/A";
      const maxDateStr = dateRange.maxDate
        ? dateRange.maxDate.toISOString().split("T")[0]
        : "N/A";
      const todayStr = dateRange.today.toISOString().split("T")[0];

      const dateMapping = dateMappings.get(accountId);
      const dateCount = Object.keys(dateMapping).length;

      const cashTimeSeries = dateMappings.get(accountId);
      const sortedDates = Object.keys(cashTimeSeries).sort();
      const firstDateCash =
        sortedDates.length > 0 ? cashTimeSeries[sortedDates[0]]?.cash ?? 0 : 0;
      const lastDateCash =
        sortedDates.length > 0
          ? cashTimeSeries[sortedDates[sortedDates.length - 1]]?.cash ?? 0
          : 0;

      console.log(`  ${accountId}:`);
      console.log(`    Activities: ${count}`);
      console.log(`    Min Date: ${minDateStr}`);
      console.log(`    Max Date: ${maxDateStr}`);
      console.log(`    Today: ${todayStr}`);
      console.log(
        `    Date Range Days: ${dateCount} days (including weekends)`
      );
      console.log(`    Cash Time Series:`);
      console.log(`      Starting Cash: ${firstDateCash.toFixed(2)}`);
      console.log(`      Ending Cash: ${lastDateCash.toFixed(2)}`);
    });
    console.log(`\nTotal accounts: ${activitiesMap.size}`);
    console.log(`Total activities: ${totalActivities}`);

    // Convert Map to plain object if needed (for easier JSON serialization)
    const activitiesObject = Object.fromEntries(activitiesMap);
    const dateRangesObject = Object.fromEntries(
      Array.from(dateRanges.entries()).map(([accountId, range]) => [
        accountId,
        {
          minDate: range.minDate ? range.minDate.toISOString() : null,
          maxDate: range.maxDate ? range.maxDate.toISOString() : null,
          today: range.today.toISOString(),
        },
      ])
    );
    const dateMappingsObject = Object.fromEntries(dateMappings);

    // Extract all symbols and fetch prices
    console.log("\n" + "=".repeat(60));
    console.log("Fetching price data for all securities...");
    console.log("=".repeat(60));

    const allSymbols = extractAllSymbols(dateMappingsObject);
    console.log(`Found ${allSymbols.size} unique symbols across all accounts`);

    let savedPriceData = {};
    if (allSymbols.size > 0) {
      // Check if price data file exists
      const priceDataPath = path.join(__dirname, "priceData.json");
      const priceDataExists = fs.existsSync(priceDataPath);

      if (priceDataExists) {
        console.log(`\n⚠ Price data file exists at ${priceDataPath}`);
        console.log(
          `  The script will fetch fresh prices and overwrite the existing file.`
        );
        console.log(
          `  If you want to reuse existing prices, you'll need to modify the script.`
        );
      }
      // Get date range from all accounts
      let globalMinDate = null;
      let globalMaxDate = today;

      dateRanges.forEach((range) => {
        if (range.minDate) {
          if (!globalMinDate || range.minDate < globalMinDate) {
            globalMinDate = range.minDate;
          }
        }
        if (range.maxDate) {
          if (!globalMaxDate || range.maxDate > globalMaxDate) {
            globalMaxDate = range.maxDate;
          }
        }
      });

      if (!globalMinDate) {
        globalMinDate = today; // Fallback to today if no min date
      }

      // Get all unique dates across all accounts
      const allDatesSet = new Set();
      Object.values(dateMappingsObject).forEach((dateMapping) => {
        Object.keys(dateMapping).forEach((dateStr) => allDatesSet.add(dateStr));
      });
      const allDates = Array.from(allDatesSet).sort();

      // Fetch prices for all symbols
      const priceData = await fetchAllPrices(
        allSymbols,
        globalMinDate,
        globalMaxDate,
        allDates
      );

      // Save price data
      savePriceData(priceData, __dirname);

      // Calculate portfolio value for each day
      console.log("\n" + "=".repeat(60));
      console.log("Calculating portfolio values...");
      console.log("=".repeat(60));
      const updatedDateMappingsObject = calculatePortfolioValue(
        dateMappingsObject,
        priceData
      );

      // Update both dateMappingsObject and dateMappings Map with portfolio values
      Object.keys(updatedDateMappingsObject).forEach((accountId) => {
        dateMappingsObject[accountId] = updatedDateMappingsObject[accountId];
        // Also sync back to the Map
        dateMappings.set(accountId, updatedDateMappingsObject[accountId]);
      });

      console.log(
        "✓ Portfolio values and daily TWR returns calculated for all accounts"
      );

      // Calculate period TWR returns (1 day, 3 months, YTD, all time)
      console.log("\n" + "=".repeat(60));
      console.log("Calculating period TWR returns (1D, 3M, YTD, ITD)...");
      console.log("=".repeat(60));
      const periodTWRUpdatedDateMappingsObject =
        calculatePeriodTWRReturns(dateMappingsObject);

      // Update both dateMappingsObject and dateMappings Map with period TWR returns
      Object.keys(periodTWRUpdatedDateMappingsObject).forEach((accountId) => {
        dateMappingsObject[accountId] =
          periodTWRUpdatedDateMappingsObject[accountId];
        // Also sync back to the Map
        dateMappings.set(
          accountId,
          periodTWRUpdatedDateMappingsObject[accountId]
        );
      });

      console.log("✓ Period TWR returns calculated for all accounts");

      // Save portfolio timeseries to database
      console.log("\n" + "=".repeat(60));
      console.log("Saving portfolio timeseries to database...");
      console.log("=".repeat(60));
      await savePortfolioTimeseriesToDatabase(
        dateMappingsObject,
        accountIdToUserIdMap
      );
      console.log("✓ Portfolio timeseries saved to database");

      // Store priceData for return
      savedPriceData = priceData;
    } else {
      console.log("No symbols found, skipping price fetching");
    }

    // Generate cash chart
    console.log("\n" + "=".repeat(60));
    console.log("Generating cash time series chart...");
    console.log("=".repeat(60));
    const chartHtml = generateCashChartHTML(dateMappingsObject, accountIds);
    const chartPath = path.join(__dirname, "cashTimeSeriesChart.html");
    fs.writeFileSync(chartPath, chartHtml);
    console.log(`\n✓ Chart created: ${chartPath}`);
    console.log(
      `  Open this file in your browser to view the cash time series chart`
    );

    return {
      accountIds,
      activitiesMap,
      activitiesObject,
      dateRanges,
      dateRangesObject,
      dateMappings, // Map of accountId -> {date: {cash, cashFlow, activityCount, units, portfolioValue, securitiesValue}}
      dateMappingsObject, // Plain object version
      cashTimeSeries: dateMappings, // Alias for clarity
      cashTimeSeriesObject: dateMappingsObject, // Alias for clarity
      priceData: savedPriceData || {},
      summary: {
        totalAccounts: activitiesMap.size,
        totalActivities,
        accountsWithActivities: Array.from(activitiesMap.entries()).filter(
          ([_, activities]) => activities.length > 0
        ).length,
        uniqueSymbols: allSymbols.size,
      },
    };
  } catch (error) {
    console.error("Error:", error.message);
    throw error;
  } finally {
    await disconnectDb();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log("\nDone!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed:", error);
      process.exit(1);
    });
}

export default main;
