import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";
import { ensureDbConnection, getDb } from "../utils/dbConnection.js";

/**
 * Checks if a symbol is an option symbol (contains spaces)
 * Options are typically formatted like "AAPL 240119C00150000" with spaces
 */
function isOptionSymbol(symbol) {
  if (!symbol) return false;
  return symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "");
}

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
 * Loads prices from database for given symbols and date range
 * Builds a lookup map: pricesBySymbolDate[symbol][date] = price
 *
 * @param {Array<string>} symbols - Array of symbols to load prices for
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {string} databaseUrl - Optional database URL
 * @returns {Promise<Map<string, Map<string, number>>>} Map of symbol -> Map of date (YYYY-MM-DD) -> price
 */
async function loadPricesForSymbols(symbols, startDate, endDate, databaseUrl) {
  if (!symbols || symbols.length === 0) {
    return new Map();
  }

  try {
    await ensureDbConnection(databaseUrl);
    const db = getDb();
    const priceHistoryCollection = db.collection("pricehistories");

    // Convert dates to Date objects if strings
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    // Query for all symbols and dates at once
    const prices = await priceHistoryCollection
      .find({
        symbol: { $in: symbols },
        date: { $gte: start, $lte: end },
      })
      .sort({ symbol: 1, date: 1 })
      .toArray();

    // Build lookup: pricesBySymbolDate[symbol][date] = price
    const pricesBySymbolDate = new Map();

    for (const priceDoc of prices) {
      const symbol = priceDoc.symbol;
      const dateKey = formatDateToYYYYMMDD(priceDoc.date);
      const price = priceDoc.close; // Use closing price for valuation

      if (!symbol || !dateKey || price === null || price === undefined) {
        continue;
      }

      if (!pricesBySymbolDate.has(symbol)) {
        pricesBySymbolDate.set(symbol, new Map());
      }

      pricesBySymbolDate.get(symbol).set(dateKey, price);
    }

    return pricesBySymbolDate;
  } catch (error) {
    console.warn("Error loading prices from database:", error.message);
    // Return empty map on error - prices won't be available but processing continues
    return new Map();
  }
}

/**
 * Gets the latest available price for a symbol on or before a given date
 * Looks back to find the most recent price if exact date doesn't have one
 *
 * @param {Map<string, Map<string, number>>} pricesBySymbolDate - Price lookup map
 * @param {string} symbol - Symbol to look up
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {number|null} Price or null if not found
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
 * Builds a daily time series of securities values from units series and price data
 *
 * This function takes a units series (from buildDailyUnitsSeries) and computes:
 * - Per-symbol market value per day (units * price)
 * - Total securities value per day (sum across all symbols)
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.unitsSeries - Array of { date, positions: { symbol -> units } } from buildDailyUnitsSeries
 * @param {string} opts.databaseUrl - Optional database URL for loading prices
 * @param {Map<string, Map<string, number>>} opts.pricesBySymbolDate - Optional preloaded price lookup map
 * @param {Function} opts.getPriceForSymbolOnDate - Optional custom price lookup function
 * @returns {Promise<Array>} Array of objects with { date, values: { symbol -> value }, totalSecuritiesValue }
 */
export async function buildDailySecurityValuesSeries(opts = {}) {
  const {
    unitsSeries,
    databaseUrl,
    pricesBySymbolDate: providedPrices,
    getPriceForSymbolOnDate: customPriceLookup,
  } = opts;

  if (!Array.isArray(unitsSeries) || unitsSeries.length === 0) {
    return [];
  }

  const allSymbols = new Set();
  for (const entry of unitsSeries) {
    if (entry.positions && typeof entry.positions === "object") {
      for (const symbol of Object.keys(entry.positions)) {
        allSymbols.add(symbol);
      }
    }
  }

  if (allSymbols.size === 0) {
    console.warn("No symbols found in unitsSeries. Returning empty series.");
    return [];
  }

  const symbolsArray = Array.from(allSymbols);
  const firstEntry = unitsSeries[0];
  const lastEntry = unitsSeries[unitsSeries.length - 1];
  const startDate = firstEntry.date;
  const endDate = lastEntry.date;

  if (!startDate || !endDate) {
    throw new Error("Cannot determine date range from unitsSeries");
  }

  let pricesBySymbolDate = providedPrices;
  let getPrice = customPriceLookup;

  if (!pricesBySymbolDate && !customPriceLookup) {
    pricesBySymbolDate = await loadPricesForSymbols(
      symbolsArray,
      startDate,
      endDate,
      databaseUrl
    );
    getPrice = (symbol, dateKey) =>
      getPriceForSymbolOnDate(pricesBySymbolDate, symbol, dateKey);
  } else if (pricesBySymbolDate && !customPriceLookup) {
    getPrice = (symbol, dateKey) =>
      getPriceForSymbolOnDate(pricesBySymbolDate, symbol, dateKey);
  }

  const securitiesValueSeries = [];
  const optionPositionsDetected = new Set();

  for (const entry of unitsSeries) {
    const { date, positions } = entry;

    if (!date || !positions || typeof positions !== "object") {
      continue;
    }

    const dateKey = formatDateToYYYYMMDD(date);
    if (!dateKey) {
      continue;
    }

    const values = {};
    let totalSecuritiesValue = 0;

    for (const [symbol, units] of Object.entries(positions)) {
      if (units === null || units === undefined || isNaN(units)) {
        continue;
      }

      let price = null;
      if (getPrice) {
        price = getPrice(symbol, dateKey);
      } else if (pricesBySymbolDate) {
        price = getPriceForSymbolOnDate(pricesBySymbolDate, symbol, dateKey);
      }

      if (price === null || price === undefined || isNaN(price)) {
        if (isOptionSymbol(symbol)) {
          optionPositionsDetected.add(symbol);
          console.warn(
            `⚠️  Option position detected but not valued: ${symbol} on ${dateKey} (${units} units). ` +
            `Option positions are tracked but valued at $0 due to lack of historical option pricing data. ` +
            `Portfolio values will be understated if options are held.`
          );
        } else {
          console.debug(
            `No price found for ${symbol} on ${dateKey}. Using price = 0.`
          );
        }
        price = 0;
      }

      const value = units * price;
      values[symbol] = value;
      totalSecuritiesValue += value;
    }

    securitiesValueSeries.push({
      date: dateKey,
      values,
      totalSecuritiesValue,
    });
  }
  if (optionPositionsDetected.size > 0) {
    console.warn(
      `\n⚠️  WARNING: ${optionPositionsDetected.size} option position(s) detected but not valued: ` +
      `${Array.from(optionPositionsDetected).slice(0, 5).join(", ")}${optionPositionsDetected.size > 5 ? "..." : ""}\n` +
      `Option positions are tracked in the units series but are valued at $0 due to the high cost of historical option pricing data. ` +
      `Portfolio values will be understated if options are held. See README.md for limitations.\n`
    );
  }

  return securitiesValueSeries;
}

/**
 * Builds daily securities values series for multiple accounts
 * Convenience function that processes units series for each account separately
 *
 * @param {Object} opts - Options object
 * @param {Object} opts.unitsSeriesByAccount - Map of accountId -> units series array
 * @param {string} opts.databaseUrl - Optional database URL for loading prices
 * @param {Map<string, Map<string, number>>} opts.pricesBySymbolDate - Optional preloaded price lookup map
 * @param {Function} opts.getPriceForSymbolOnDate - Optional custom price lookup function
 * @returns {Promise<Object>} Map of accountId -> securities values series array
 */
export async function buildDailySecurityValuesSeriesForAccounts(opts = {}) {
  const {
    unitsSeriesByAccount,
    databaseUrl,
    pricesBySymbolDate,
    getPriceForSymbolOnDate,
  } = opts;

  if (!unitsSeriesByAccount || typeof unitsSeriesByAccount !== "object") {
    throw new Error("unitsSeriesByAccount must be an object/map");
  }

  const results = {};

  for (const [accountId, unitsSeries] of Object.entries(unitsSeriesByAccount)) {
    try {
      const series = await buildDailySecurityValuesSeries({
        unitsSeries,
        databaseUrl,
        pricesBySymbolDate,
        getPriceForSymbolOnDate,
      });

      results[accountId] = series;
    } catch (error) {
      console.error(
        `Error building securities values series for account ${accountId}:`,
        error.message
      );
      results[accountId] = [];
    }
  }

  return results;
}

