import { formatDateToYYYYMMDD, isWeekend, getPreviousFriday } from "../utils/dateHelpers.js";
import { ensureDbConnection, getDb } from "../utils/dbConnection.js";

/**
 * Generates array of dates between start and end (inclusive)
 *
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Date[]} Array of Date objects
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Set to start of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Normalizes and sorts activities for processing
 * - Reverses the list (SnapTrade returns reverse chronological)
 * - Extracts date-only from trade_date
 * - Sorts by trade_date ascending
 *
 * @param {Array} activities - Array of activity objects from SnapTrade
 * @returns {Array} Normalized and sorted activities
 */
function normalizeAndSortActivities(activities) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return [];
  }

  // Reverse the list (SnapTrade returns latest → oldest)
  const reversed = [...activities].reverse();

  // Normalize dates and add date_only field
  const normalized = reversed.map((activity) => {
    const tradeDate = activity.trade_date || activity.date;
    const dateOnly = tradeDate ? formatDateToYYYYMMDD(tradeDate) : null;

    return {
      ...activity,
      date_only: dateOnly,
      // Preserve original trade_date for sorting
      _sortDate: tradeDate ? new Date(tradeDate) : null,
    };
  });

  // Sort by trade_date ascending (oldest → newest)
  normalized.sort((a, b) => {
    if (!a._sortDate && !b._sortDate) return 0;
    if (!a._sortDate) return 1;
    if (!b._sortDate) return -1;
    return a._sortDate - b._sortDate;
  });

  return normalized;
}

/**
 * Filters activities to only those in the target currency
 *
 * @param {Array} activities - Array of normalized activities
 * @param {string} targetCurrency - Currency code to filter by (e.g., "USD")
 * @returns {Array} Filtered activities
 */
function filterByCurrency(activities, targetCurrency) {
  if (!targetCurrency) {
    return activities;
  }

  return activities.filter((activity) => {
    // Handle different possible currency field structures
    const currencyCode =
      activity.currency?.code ||
      activity.currency ||
      activity.currencyObj?.code;

    return currencyCode === targetCurrency;
  });
}

/**
 * Extracts symbol identifier from an activity
 * Handles both symbol objects and string symbols
 *
 * @param {Object} activity - Activity object
 * @returns {string|null} Symbol identifier or null
 */
function extractSymbol(activity) {
  // Check for option symbol first
  const optionSym = activity.option_symbol;
  if (optionSym && typeof optionSym === "object" && optionSym.ticker) {
    return String(optionSym.ticker).trim();
  }

  // Check for symbol object (from symbolObj or symbol field)
  const sym = activity.symbolObj || activity.symbol;
  if (sym && typeof sym === "object") {
    const ticker = sym.symbol || sym.raw_symbol;
    if (ticker) {
      return String(ticker).trim();
    }
  }

  // Check for string symbol
  if (activity.symbol && typeof activity.symbol === "string") {
    return activity.symbol.trim();
  }

  return null;
}

/**
 * Groups activities by date
 *
 * @param {Array} activities - Array of normalized activities
 * @returns {Map<string, Array>} Map of date (YYYY-MM-DD) to activities array
 */
function groupActivitiesByDate(activities) {
  const grouped = new Map();

  for (const activity of activities) {
    const dateKey = activity.date_only;
    if (!dateKey) {
      continue; // Skip activities without valid dates
    }

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey).push(activity);
  }

  return grouped;
}

/**
 * Checks if a symbol is an option symbol (contains spaces)
 */
function isOptionSymbol(symbol) {
  if (!symbol) return false;
  return symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "");
}

/**
 * Maps historical symbol names to current symbol names
 * Handles stock rebrands (e.g., FB -> META)
 */
function mapSymbolForPriceLookup(symbol) {
  if (!symbol) return symbol;

  const SYMBOL_MAP = {
    FB: "META", // Facebook rebranded to Meta in June 2022
  };

  return SYMBOL_MAP[symbol.toUpperCase()] || symbol;
}

/**
 * Loads prices from database for given symbols and date range
 */
async function loadPricesForSymbols(symbols, startDate, endDate, databaseUrl) {
  if (!symbols || symbols.length === 0) {
    return new Map();
  }

  try {
    await ensureDbConnection(databaseUrl);
    const db = getDb();
    const priceHistoryCollection = db.collection("pricehistories");

    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const BATCH_SIZE = 50;
    const pricesBySymbolDate = new Map();

    // Build set of all symbols to query (including mapped versions)
    const allSymbolsToQuery = new Set(symbols);
    for (const symbol of symbols) {
      const mapped = mapSymbolForPriceLookup(symbol);
      if (mapped !== symbol) {
        allSymbolsToQuery.add(mapped);
      }
    }
    const symbolsArray = Array.from(allSymbolsToQuery);

    for (let i = 0; i < symbolsArray.length; i += BATCH_SIZE) {
      const symbolBatch = symbolsArray.slice(i, i + BATCH_SIZE);

      const prices = await priceHistoryCollection
        .find({
          symbol: { $in: symbolBatch },
          date: { $gte: start, $lte: end },
        })
        .sort({ symbol: 1, date: 1 })
        .toArray();

      for (const priceDoc of prices) {
        const symbol = priceDoc.symbol;
        const dateKey = formatDateToYYYYMMDD(priceDoc.date);
        const price = priceDoc.close;

        if (!symbol || !dateKey || price === null || price === undefined) {
          continue;
        }

        if (!pricesBySymbolDate.has(symbol)) {
          pricesBySymbolDate.set(symbol, new Map());
        }
        pricesBySymbolDate.get(symbol).set(dateKey, price);

        // Also store under reverse-mapped symbols (e.g., if we have META, also store under FB)
        for (const [originalSymbol, mappedSymbol] of Object.entries({
          FB: "META",
        })) {
          if (
            symbol === mappedSymbol &&
            !pricesBySymbolDate.has(originalSymbol)
          ) {
            if (!pricesBySymbolDate.has(originalSymbol)) {
              pricesBySymbolDate.set(originalSymbol, new Map());
            }
            pricesBySymbolDate.get(originalSymbol).set(dateKey, price);
          }
        }
      }
    }

    return pricesBySymbolDate;
  } catch (error) {
    console.warn("Error loading prices from database:", error.message);
    return new Map();
  }
}

/**
 * Gets the latest available price for a symbol on or before a given date
 */
function getPriceForSymbolOnDate(pricesBySymbolDate, symbol, dateKey) {
  const symbolPrices = pricesBySymbolDate.get(symbol);
  if (!symbolPrices) {
    return null;
  }

  // Try exact date first
  if (symbolPrices.has(dateKey)) {
    return symbolPrices.get(dateKey);
  }

  // For weekends, use Friday's price for stocks/ETFs
  if (isWeekend(dateKey) && !isOptionSymbol(symbol)) {
    const fridayDate = getPreviousFriday(dateKey);
    if (fridayDate && fridayDate !== dateKey && symbolPrices.has(fridayDate)) {
      return symbolPrices.get(fridayDate);
    }
  }

  // Look back to find the latest available price before this date
  const date = new Date(dateKey);
  const availableDates = Array.from(symbolPrices.keys())
    .map((d) => new Date(d))
    .filter((d) => d <= date)
    .sort((a, b) => b - a); // Sort descending (most recent first)

  if (availableDates.length > 0) {
    const latestDateKey = formatDateToYYYYMMDD(availableDates[0]);
    return symbolPrices.get(latestDateKey);
  }

  return null;
}

/**
 * Computes unit adjustment for an activity based on its type
 */
function computeUnitAdjustment(activity) {
  const type = String(activity.type || "").toUpperCase();
  const units = parseFloat(activity.units ?? activity.quantity ?? 0);

  if (isNaN(units) || Math.abs(units) < 1e-10) {
    return 0;
  }

  if (type === "BUY") {
    return Math.abs(units);
  }

  if (type === "SELL") {
    return -Math.abs(units);
  }

  if (type === "REI") {
    return Math.abs(units);
  }

  if (type === "STOCK_DIVIDEND") {
    return Math.abs(units);
  }

  if (type === "EXTERNAL_ASSET_TRANSFER_IN") {
    return Math.abs(units);
  }

  if (type === "EXTERNAL_ASSET_TRANSFER_OUT") {
    return -Math.abs(units);
  }

  if (type === "TRANSFER") {
    return units;
  }

  if (type === "SPLIT") {
    return units;
  }

  if (
    type === "OPTIONASSIGNMENT" ||
    type === "OPTIONEXERCISE" ||
    type === "OPTIONEXPIRATION"
  ) {
    return 0; // Option activities don't change units directly
  }

  if (type === "ADJUSTMENT") {
    return units;
  }

  return 0;
}

/**
 * Builds a daily portfolio series by calculating cash and securities weights simultaneously from activities
 *
 * This is a unified approach that processes activities once to calculate both:
 * - Cash balance (from cash-affecting activities)
 * - Securities positions (from unit-affecting activities)
 * - Securities values (from positions * prices)
 * - Portfolio values (cash + securities)
 *
 * This function is designed for debugging and comparison with the separate calculation methods.
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.activities - Array of activity objects from SnapTrade API
 * @param {string} opts.baseCurrency - Base currency code to track (e.g., "USD")
 * @param {Date|string} opts.endDate - End date for the series (defaults to last activity date or today)
 * @param {number} opts.initialCash - Starting cash balance (default: 0)
 * @param {string} opts.databaseUrl - Optional database URL for loading prices
 * @returns {Promise<Array>} Array of objects with { date, cash, securitiesValue, portfolioValue, positions, cashWeight, securitiesWeight }
 */
export async function buildDailyPortfolioSeriesFromActivities(opts = {}) {
  const {
    activities,
    baseCurrency,
    endDate,
    initialCash = 0,
    databaseUrl,
  } = opts;

  if (!Array.isArray(activities) || activities.length === 0) {
    return [];
  }

  // Step 0: Deduplicate activities by activityId
  const seenActivityIds = new Set();
  const deduplicatedActivities = activities.filter((activity) => {
    const activityId = activity.activityId || activity.id;
    if (!activityId) {
      return true;
    }
    if (seenActivityIds.has(activityId)) {
      console.warn(
        `[Unified] Duplicate activity detected and removed: ${activityId} (type: ${activity.type})`
      );
      return false;
    }
    seenActivityIds.add(activityId);
    return true;
  });

  if (deduplicatedActivities.length !== activities.length) {
    console.log(
      `[Unified] Removed ${
        activities.length - deduplicatedActivities.length
      } duplicate activities`
    );
  }

  // Step 1: Normalize and sort activities
  const normalized = normalizeAndSortActivities(deduplicatedActivities);

  if (normalized.length === 0) {
    return [];
  }

  // Step 2: Determine target currency
  let targetCurrency = baseCurrency;
  if (!targetCurrency) {
    const firstActivity = normalized[0];
    targetCurrency =
      firstActivity.currency?.code ||
      firstActivity.currency ||
      firstActivity.currencyObj?.code ||
      "USD";
  }

  // Step 3: Filter to target currency only
  const filtered = filterByCurrency(normalized, targetCurrency);

  if (filtered.length === 0) {
    console.warn(
      `[Unified] No activities found in currency ${targetCurrency}. Returning empty series.`
    );
    return [];
  }

  // Step 4: Determine date range
  const firstActivity = filtered[0];
  const lastActivity = filtered[filtered.length - 1];

  const startDate = firstActivity.date_only;
  if (!startDate) {
    throw new Error("Cannot determine start date from activities");
  }

  const endDateStr = endDate
    ? formatDateToYYYYMMDD(endDate)
    : formatDateToYYYYMMDD(new Date());

  // Step 5: Build full date list
  const allDates = generateDateRange(startDate, endDateStr);

  // Step 6: Group activities by date
  const activitiesByDate = groupActivitiesByDate(filtered);

  // Step 7: Collect all symbols for price loading
  const allSymbols = new Set();
  for (const activity of filtered) {
    const symbol = extractSymbol(activity);
    if (symbol) {
      allSymbols.add(symbol);
    }
  }

  // Step 8: Load prices for all symbols
  let pricesBySymbolDate = new Map();
  if (allSymbols.size > 0) {
    console.log(`[Unified] Loading prices for ${allSymbols.size} symbols...`);
    pricesBySymbolDate = await loadPricesForSymbols(
      Array.from(allSymbols),
      startDate,
      endDateStr,
      databaseUrl
    );
    console.log(
      `[Unified] Loaded prices for ${pricesBySymbolDate.size} symbols`
    );
  }

  // Step 9: Activities that affect cash balance
  // Note on activity types:
  // - FEE: Money you owe to broker (margin interest, account fees) - should be negative
  // - INTEREST: Money broker owes you (interest on cash balances) - should be positive
  // The code uses SnapTrade's amount field directly, assuming correct signs from the API
  const EXCLUDE_FROM_CASH = new Set([
    "OPTIONEXERCISE",
    "OPTIONASSIGNMENT",
    "OPTIONEXPIRATION",
  ]);

  // Step 10: Initialize state
  let cash = initialCash;
  let positions = {}; // symbol -> units
  const portfolioSeries = [];
  const lastKnownPricePerSymbol = new Map();

  // Step 11: Process each day
  for (const date of allDates) {
    const dateKey = formatDateToYYYYMMDD(date);
    if (!dateKey) {
      continue;
    }

    const todayActivities = activitiesByDate.get(dateKey) || [];
    let cashToday = cash;
    const positionsToday = { ...positions };

    // Process each activity for this day
    for (const activity of todayActivities) {
      const type = String(activity.type || "").toUpperCase();
      const symbol = extractSymbol(activity);

      // Update cash balance (for cash-affecting activities)
      if (!EXCLUDE_FROM_CASH.has(type)) {
        const amount = activity.amount;
        if (amount !== null && amount !== undefined && !isNaN(amount)) {
          cashToday += amount;
        }
      }

      // Update positions (for unit-affecting activities)
      if (symbol) {
        const units = activity.units ?? activity.quantity ?? null;
        if (units !== null && units !== undefined && !isNaN(units)) {
          // Skip option activities - they don't change positions directly
          if (
            type !== "OPTIONEXERCISE" &&
            type !== "OPTIONASSIGNMENT" &&
            type !== "OPTIONEXPIRATION"
          ) {
            if (!(symbol in positionsToday)) {
              positionsToday[symbol] = 0;
            }
            const adjustment = computeUnitAdjustment(activity);
            positionsToday[symbol] += adjustment;

            // Remove zero positions
            if (Math.abs(positionsToday[symbol]) < 1e-10) {
              delete positionsToday[symbol];
            }
          }
        }
      }
    }

    // Step 12: Calculate securities value for this day
    let securitiesValue = 0;
    const securityValues = {};

    for (const [symbol, units] of Object.entries(positionsToday)) {
      if (Math.abs(units) < 1e-10) {
        continue;
      }

      // Get price for this symbol on this date
      let price = getPriceForSymbolOnDate(pricesBySymbolDate, symbol, dateKey);

      // Try mapped symbol if price not found
      if (price === null || price === undefined) {
        const mappedSymbol = mapSymbolForPriceLookup(symbol);
        if (mappedSymbol !== symbol) {
          price = getPriceForSymbolOnDate(
            pricesBySymbolDate,
            mappedSymbol,
            dateKey
          );
        }
      }

      // Forward-fill: use last known price if current price is missing
      if (
        (price === null || price === undefined || isNaN(price)) &&
        !isOptionSymbol(symbol)
      ) {
        const lastKnownPrice = lastKnownPricePerSymbol.get(symbol);
        if (
          lastKnownPrice !== null &&
          lastKnownPrice !== undefined &&
          !isNaN(lastKnownPrice)
        ) {
          price = lastKnownPrice;
        }
      }

      // Calculate value
      if (price !== null && price !== undefined && !isNaN(price)) {
        const value = units * price;
        securityValues[symbol] = value;
        securitiesValue += value;

        // Update last known price
        lastKnownPricePerSymbol.set(symbol, price);
      } else if (isOptionSymbol(symbol)) {
        // Options are valued at $0
        continue;
      }
    }

    // Step 13: Calculate portfolio value and weights
    const portfolioValue = cashToday + securitiesValue;
    const cashWeight = portfolioValue > 0 ? cashToday / portfolioValue : 0;
    const securitiesWeight =
      portfolioValue > 0 ? securitiesValue / portfolioValue : 0;

    // Step 14: Build result entry
    portfolioSeries.push({
      date: dateKey,
      cash: cashToday,
      securitiesValue: securitiesValue,
      portfolioValue: portfolioValue,
      positions: { ...positionsToday },
      securityValues: { ...securityValues },
      cashWeight: cashWeight,
      securitiesWeight: securitiesWeight,
    });

    // Step 15: Update state for next iteration
    cash = cashToday;
    positions = positionsToday;
  }

  console.log(
    `[Unified] Built portfolio series: ${portfolioSeries.length} days (${startDate} to ${endDateStr})`
  );

  return portfolioSeries;
}

/**
 * Builds daily portfolio series from activities for multiple accounts
 */
export async function buildDailyPortfolioSeriesFromActivitiesForAccounts(
  opts = {}
) {
  const {
    activitiesByAccount,
    baseCurrencyByAccount = {},
    endDate,
    initialCashByAccount = {},
    databaseUrl,
  } = opts;

  if (!activitiesByAccount || typeof activitiesByAccount !== "object") {
    throw new Error("activitiesByAccount must be an object/map");
  }

  const results = {};

  for (const [accountId, activities] of Object.entries(activitiesByAccount)) {
    try {
      const series = await buildDailyPortfolioSeriesFromActivities({
        activities,
        baseCurrency: baseCurrencyByAccount[accountId],
        endDate,
        initialCash: initialCashByAccount[accountId] || 0,
        databaseUrl,
      });

      results[accountId] = series;
    } catch (error) {
      console.error(
        `[Unified] Error building portfolio series for account ${accountId}:`,
        error.message
      );
      results[accountId] = [];
    }
  }

  return results;
}

