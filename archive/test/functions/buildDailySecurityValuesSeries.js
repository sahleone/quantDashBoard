import {
  formatDateToYYYYMMDD,
  isWeekend,
  getPreviousFriday,
} from "../utils/dateHelpers.js";
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
 * Checks if a symbol is a cryptocurrency
 * Crypto markets are open 24/7, so prices should be available on weekends
 */
function isCryptoSymbol(symbol) {
  if (!symbol) return false;
  const cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();
  // Remove "-USD" suffix if present for comparison
  const baseSymbol = cleanSymbol.endsWith("-USD")
    ? cleanSymbol.slice(0, -4)
    : cleanSymbol;

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

  return CRYPTO_SYMBOLS.has(baseSymbol);
}

/**
 * Maps historical symbol names to current symbol names
 * Handles stock rebrands (e.g., FB -> META)
 *
 * @param {string} symbol - Original symbol
 * @returns {string} - Mapped symbol (or original if no mapping)
 */
function mapSymbolForPriceLookup(symbol) {
  if (!symbol) return symbol;

  // Stock rebrands and symbol changes
  const SYMBOL_MAP = {
    FB: "META", // Facebook rebranded to Meta in June 2022
  };

  return SYMBOL_MAP[symbol.toUpperCase()] || symbol;
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

  // Retry logic for connection timeouts
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ensureDbConnection(databaseUrl);
      const db = getDb();
      const priceHistoryCollection = db.collection("pricehistories");

      // Convert dates to Date objects if strings
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      // Load prices in batches if there are many symbols to avoid timeout
      // Also include mapped symbols (e.g., FB -> META) in the query
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

        // Query for this batch of symbols
        const prices = await priceHistoryCollection
          .find({
            symbol: { $in: symbolBatch },
            date: { $gte: start, $lte: end },
          })
          .sort({ symbol: 1, date: 1 })
          .toArray();

        // Build lookup: pricesBySymbolDate[symbol][date] = price
        // Also store prices under mapped symbol names (e.g., META prices also under FB)
        for (const priceDoc of prices) {
          const symbol = priceDoc.symbol;
          const dateKey = formatDateToYYYYMMDD(priceDoc.date);
          const price = priceDoc.close; // Use closing price for valuation

          if (!symbol || !dateKey || price === null || price === undefined) {
            continue;
          }

          // Store price under the symbol found in database
          if (!pricesBySymbolDate.has(symbol)) {
            pricesBySymbolDate.set(symbol, new Map());
          }
          pricesBySymbolDate.get(symbol).set(dateKey, price);

          // Also store under reverse-mapped symbols (e.g., if we have META, also store under FB)
          // This allows positions with "FB" to find prices stored as "META"
          for (const [originalSymbol, mappedSymbol] of Object.entries({
            FB: "META",
            // Add more mappings as needed
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

      console.log(`Loaded prices for ${pricesBySymbolDate.size} symbols`);
      return pricesBySymbolDate;
    } catch (error) {
      lastError = error;
      const isTimeout =
        error.message?.includes("timeout") ||
        error.message?.includes("timed out") ||
        error.name === "MongoServerSelectionError";

      if (isTimeout && attempt < maxRetries) {
        console.warn(
          `Price loading attempt ${attempt} failed (timeout), retrying... (${
            maxRetries - attempt
          } attempts left)`
        );
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        continue;
      }

      // If not a timeout or last attempt, break and return error
      break;
    }
  }

  console.warn(
    "Error loading prices from database:",
    lastError?.message || lastError
  );
  // Return empty map on error - prices won't be available but processing continues
  return new Map();
}

/**
 * Gets the latest available price for a symbol on or before a given date
 * Explicitly handles weekends: for stocks/ETFs on weekends, uses Friday's price
 * For crypto, prices should be available on weekends (markets open 24/7)
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

  // For weekends (Saturday/Sunday), explicitly use Friday's price for stocks/ETFs
  // Crypto prices should be available on weekends (markets open 24/7)
  if (
    isWeekend(dateKey) &&
    !isCryptoSymbol(symbol) &&
    !isOptionSymbol(symbol)
  ) {
    const fridayDate = getPreviousFriday(dateKey);
    if (fridayDate && fridayDate !== dateKey && symbolPrices.has(fridayDate)) {
      return symbolPrices.get(fridayDate);
    }
  }

  // Look back to find the latest available price before this date
  // This handles holidays and other non-trading days
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
 * @param {Date|string} opts.endDate - Optional end date (defaults to today to extend series to current date)
 * @param {string} opts.databaseUrl - Optional database URL for loading prices
 * @param {Map<string, Map<string, number>>} opts.pricesBySymbolDate - Optional preloaded price lookup map
 * @param {Function} opts.getPriceForSymbolOnDate - Optional custom price lookup function
 * @returns {Promise<Array>} Array of objects with { date, values: { symbol -> value }, totalSecuritiesValue }
 */
export async function buildDailySecurityValuesSeries(opts = {}) {
  const {
    unitsSeries,
    endDate,
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
  // Use provided endDate or default to today to extend series to current date
  // Format endDate consistently (handles both Date objects and strings)
  const finalEndDate = endDate
    ? formatDateToYYYYMMDD(endDate)
    : formatDateToYYYYMMDD(new Date());

  if (!startDate) {
    throw new Error("Cannot determine start date from unitsSeries");
  }

  let pricesBySymbolDate = providedPrices;
  let getPrice = customPriceLookup;

  if (!pricesBySymbolDate && !customPriceLookup) {
    pricesBySymbolDate = await loadPricesForSymbols(
      symbolsArray,
      startDate,
      finalEndDate,
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
  let lastTotalSecuritiesValue = 0; // Track previous day's value for forward-filling
  let lastPositions = {}; // Track last known positions for extending to today
  const lastKnownPricePerSymbol = new Map(); // Track last known price per symbol for forward-filling

  // Build a map of positions by date for efficient lookup
  const positionsByDate = new Map();
  for (const entry of unitsSeries) {
    if (entry.date && entry.positions) {
      const dateKey = formatDateToYYYYMMDD(entry.date);
      if (dateKey) {
        positionsByDate.set(dateKey, entry.positions);
        lastPositions = entry.positions; // Keep track of last known positions
      }
    }
  }

  // Generate all dates from start to endDate (today)
  const allDates = generateDateRange(startDate, finalEndDate);

  for (const date of allDates) {
    const dateKey = formatDateToYYYYMMDD(date);
    if (!dateKey) {
      continue;
    }

    // Get positions for this date, or use last known positions if extending beyond unitsSeries
    let positions = positionsByDate.get(dateKey);
    if (!positions) {
      // If we're beyond the last entry in unitsSeries, use last known positions
      // If lastPositions is empty, that's fine - we'll just have zero value for those dates
      positions = lastPositions || {};
    } else {
      // Update last known positions
      lastPositions = positions;
    }
    // Always process, even if positions is empty (will result in zero value, which is correct)
    if (typeof positions !== "object") {
      continue;
    }

    const values = {};
    let totalSecuritiesValue = 0;
    let hasValidPrices = false; // Track if we found at least one valid price

    for (const [symbol, units] of Object.entries(positions)) {
      if (units === null || units === undefined || isNaN(units)) {
        continue;
      }

      let price = null;
      if (getPrice) {
        price = getPrice(symbol, dateKey);
        // If not found, try mapped symbol (e.g., FB -> META)
        if (price === null || price === undefined) {
          const mappedSymbol = mapSymbolForPriceLookup(symbol);
          if (mappedSymbol !== symbol) {
            price = getPrice(mappedSymbol, dateKey);
          }
        }
      } else if (pricesBySymbolDate) {
        price = getPriceForSymbolOnDate(pricesBySymbolDate, symbol, dateKey);
        // If not found, try mapped symbol (e.g., FB -> META)
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
      }

      // Forward-fill: If price is missing, use last known price for this specific symbol
      // This ensures each symbol uses its own previous day's price, not the portfolio value
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
          // Log when we forward-fill (only for weekends or if it's a significant gap)
          if (isWeekend(dateKey)) {
            console.debug(
              `[Price Forward-Fill] ${symbol} on ${dateKey} (weekend): Using last known price ${price.toFixed(
                2
              )} from previous trading day`
            );
          }
        }
      }

      if (price === null || price === undefined || isNaN(price)) {
        if (isOptionSymbol(symbol)) {
          optionPositionsDetected.add(symbol);
          // Options are valued at $0 - don't add to total but continue processing
          continue;
        } else {
          // No price available and no last known price - skip this symbol
          continue;
        }
      }

      // Update last known price for this symbol (for forward-filling on future dates)
      lastKnownPricePerSymbol.set(symbol, price);

      hasValidPrices = true;
      const value = units * price;
      values[symbol] = value;
      totalSecuritiesValue += value;
    }

    // If no valid prices found for any symbol but we have positions, forward-fill from previous day
    if (
      !hasValidPrices &&
      Object.keys(positions).length > 0 &&
      lastTotalSecuritiesValue > 0
    ) {
      totalSecuritiesValue = lastTotalSecuritiesValue;
      console.debug(
        `No prices found for any symbols on ${dateKey} (${
          Object.keys(positions).length
        } positions). Forward-filling securities value: ${totalSecuritiesValue.toFixed(
          2
        )}`
      );
    }

    // Update last value for next iteration
    // Only update if we have a calculated value or forward-filled (don't update if truly zero with no positions)
    if (
      totalSecuritiesValue > 0 ||
      hasValidPrices ||
      (Object.keys(positions).length > 0 && lastTotalSecuritiesValue > 0)
    ) {
      lastTotalSecuritiesValue = totalSecuritiesValue;
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
        `${Array.from(optionPositionsDetected).slice(0, 5).join(", ")}${
          optionPositionsDetected.size > 5 ? "..." : ""
        }\n` +
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
