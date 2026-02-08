/**
 * Yahoo Finance Client Utility
 *
 * Provides functions to fetch historical price data from Yahoo Finance API
 * using the yahoo-finance2 package.
 *
 * Features:
 * - Rate limiting (max 2000 requests/hour)
 * - Retry logic with exponential backoff
 * - Error handling for missing data
 * - Batch fetching for multiple symbols
 */

// Dynamic import for yahoo-finance2 to work from any location
let YahooFinanceModule = null;
let yahooFinanceInstance = null;

async function getYahooFinance() {
  if (!YahooFinanceModule) {
    const mod = await import("yahoo-finance2");
    YahooFinanceModule = mod.default || mod;
  }
  // Cache a single instance to avoid creating new instances on every call
  if (!yahooFinanceInstance) {
    // Suppress deprecation notice for historical() -> chart() migration
    yahooFinanceInstance = new YahooFinanceModule({
      suppressNotices: ["ripHistorical"],
    });
  }
  return yahooFinanceInstance;
}

// Rate limiting: max 2000 requests/hour = ~33 requests/minute = ~1 request every 2 seconds
const RATE_LIMIT_DELAY_MS = 2000;
let lastRequestTime = 0;

/**
 * Common cryptocurrency symbols that need "-USD" suffix for Yahoo Finance
 * This is not exhaustive but covers the most common ones
 */
export const CRYPTO_SYMBOLS = new Set([
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

/**
 * Check if a symbol is a crypto symbol that needs "-USD" suffix
 * @param {string} symbol - Symbol to check
 * @returns {boolean}
 */
export function isCryptoSymbol(symbol) {
  const cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();
  return CRYPTO_SYMBOLS.has(cleanSymbol) && !cleanSymbol.endsWith("-USD");
}

/**
 * Normalize symbol for Yahoo Finance API
 * - Removes spaces (for option tickers)
 * - Appends "-USD" to crypto symbols if not already present
 *
 * @param {string} symbol - Original symbol
 * @returns {string} - Normalized symbol for Yahoo Finance
 */
function normalizeSymbolForYahoo(symbol) {
  // Remove spaces first (for option tickers)
  let cleanSymbol = symbol.replace(/\s+/g, "");

  // Check if it's a crypto symbol (uppercase for comparison)
  const upperSymbol = cleanSymbol.toUpperCase();

  // If it's a known crypto symbol and doesn't already end with "-USD", append it
  if (CRYPTO_SYMBOLS.has(upperSymbol) && !upperSymbol.endsWith("-USD")) {
    cleanSymbol = `${upperSymbol}-USD`;
  }

  return cleanSymbol;
}

/**
 * Delay to respect rate limits
 */
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
 * Retry with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Fetch historical prices for a single symbol
 * Uses adjusted close prices (adjClose) which account for stock splits and dividends.
 *
 * @param {string} symbol - Ticker symbol (e.g., "AAPL")
 * @param {Date} startDate - Start date (inclusive)
 * @param {Date} endDate - End date (inclusive)
 * @returns {Promise<Array>} Array of price objects with date, close (adjusted), open, high, low, volume
 */
export async function fetchHistoricalPrices(symbol, startDate, endDate) {
  await rateLimitDelay();

  // Normalize symbol (remove spaces, append -USD for crypto)
  let cleanSymbol = normalizeSymbolForYahoo(symbol);
  const originalSymbol = symbol;

  return retryWithBackoff(async () => {
    try {
      const yahooFinance = await getYahooFinance();

      // Use chart() instead of deprecated historical()
      const chart = await yahooFinance.chart(cleanSymbol, {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      });

      if (
        !chart ||
        !chart.quotes ||
        !Array.isArray(chart.quotes) ||
        chart.quotes.length === 0
      ) {
        // If no data and symbol doesn't end with -USD, try with -USD suffix
        if (!cleanSymbol.toUpperCase().endsWith("-USD")) {
          const usdSymbol = `${cleanSymbol.toUpperCase()}-USD`;
          console.log(`No data for ${originalSymbol}, trying ${usdSymbol}...`);
          await rateLimitDelay();
          try {
            const usdChart = await yahooFinance.chart(usdSymbol, {
              period1: startDate,
              period2: endDate,
              interval: "1d",
            });
            if (
              usdChart &&
              usdChart.quotes &&
              Array.isArray(usdChart.quotes) &&
              usdChart.quotes.length > 0
            ) {
              return usdChart.quotes.map((row) => ({
                date: new Date(row.date),
                close: row.adjClose || row.close || null,
                open: row.open || null,
                high: row.high || null,
                low: row.low || null,
                volume: row.volume || null,
              }));
            }
          } catch (usdError) {
            // USD suffix also failed, continue to return empty array
          }
        }
        return [];
      }

      // Transform to our format - use adjusted close prices
      return chart.quotes.map((row) => ({
        date: new Date(row.date),
        close: row.adjClose || row.close || null,
        open: row.open || null,
        high: row.high || null,
        low: row.low || null,
        volume: row.volume || null,
      }));
    } catch (error) {
      // Handle missing symbol gracefully - try with -USD suffix if not already tried
      if (
        error.message &&
        (error.message.includes("Invalid symbol") ||
          error.message.includes("Not found"))
      ) {
        // If symbol doesn't end with -USD, try with -USD suffix
        if (!cleanSymbol.toUpperCase().endsWith("-USD")) {
          const usdSymbol = `${cleanSymbol.toUpperCase()}-USD`;
          console.log(
            `Symbol ${originalSymbol} not found, trying ${usdSymbol}...`
          );
          await rateLimitDelay();
          try {
            const yahooFinance = await getYahooFinance();
            const usdChart = await yahooFinance.chart(usdSymbol, {
              period1: startDate,
              period2: endDate,
              interval: "1d",
            });
            if (
              usdChart &&
              usdChart.quotes &&
              Array.isArray(usdChart.quotes) &&
              usdChart.quotes.length > 0
            ) {
              return usdChart.quotes.map((row) => ({
                date: new Date(row.date),
                close: row.adjClose || row.close || null,
                open: row.open || null,
                high: row.high || null,
                low: row.low || null,
                volume: row.volume || null,
              }));
            }
          } catch (usdError) {
            // USD suffix also failed, return empty array
            console.warn(
              `Symbol ${originalSymbol} and ${usdSymbol} not found on Yahoo Finance`
            );
            return [];
          }
        } else {
          console.warn(`Symbol ${originalSymbol} not found on Yahoo Finance`);
          return [];
        }
      }
      throw error;
    }
  });
}

/**
 * Fetch latest price for a symbol
 *
 * @param {string} symbol - Ticker symbol
 * @returns {Promise<number|null>} Latest close price or null if not found
 */
export async function getLatestPrice(symbol) {
  await rateLimitDelay();

  // Normalize symbol (remove spaces, append -USD for crypto)
  let cleanSymbol = normalizeSymbolForYahoo(symbol);
  const originalSymbol = symbol;

  return retryWithBackoff(async () => {
    try {
      const yahooFinance = await getYahooFinance();
      const quote = await yahooFinance.quote(cleanSymbol);

      if (!quote || !quote.regularMarketPrice) {
        // If no price and symbol doesn't end with -USD, try with -USD suffix
        if (!cleanSymbol.toUpperCase().endsWith("-USD")) {
          const usdSymbol = `${cleanSymbol.toUpperCase()}-USD`;
          console.log(`No price for ${originalSymbol}, trying ${usdSymbol}...`);
          await rateLimitDelay();
          try {
            const usdQuote = await yahooFinance.quote(usdSymbol);
            if (usdQuote && usdQuote.regularMarketPrice) {
              return usdQuote.regularMarketPrice;
            }
          } catch (usdError) {
            // USD suffix also failed, continue to return null
          }
        }
        return null;
      }

      return quote.regularMarketPrice;
    } catch (error) {
      // Try with -USD suffix if not already tried
      if (
        error.message &&
        (error.message.includes("Invalid symbol") ||
          error.message.includes("Not found"))
      ) {
        if (!cleanSymbol.toUpperCase().endsWith("-USD")) {
          const usdSymbol = `${cleanSymbol.toUpperCase()}-USD`;
          console.log(
            `Symbol ${originalSymbol} not found, trying ${usdSymbol}...`
          );
          await rateLimitDelay();
          try {
            const yahooFinance = await getYahooFinance();
            const usdQuote = await yahooFinance.quote(usdSymbol);
            if (usdQuote && usdQuote.regularMarketPrice) {
              return usdQuote.regularMarketPrice;
            }
            // USD fallback succeeded but no price available, return null
            return null;
          } catch (usdError) {
            // USD suffix also failed, return null
            console.warn(
              `Failed to fetch latest price for ${originalSymbol} and ${usdSymbol}:`,
              usdError.message
            );
            return null;
          }
        } else {
          console.warn(
            `Failed to fetch latest price for ${originalSymbol}:`,
            error.message
          );
          return null;
        }
      }
      console.warn(
        `Failed to fetch latest price for ${originalSymbol}:`,
        error.message
      );
      return null;
    }
  });
}

/**
 * Fetch historical prices for multiple symbols (sequential to respect rate limits)
 *
 * @param {Array<string>} symbols - Array of ticker symbols
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Map>} Map of symbol -> array of price objects
 */
export async function fetchMultipleSymbols(symbols, startDate, endDate) {
  const results = new Map();

  for (const symbol of symbols) {
    try {
      const prices = await fetchHistoricalPrices(symbol, startDate, endDate);
      results.set(symbol, prices);
    } catch (error) {
      console.error(`Error fetching prices for ${symbol}:`, error.message);
      results.set(symbol, []);
    }
  }

  return results;
}

/**
 * Fetch stock splits for a single symbol
 *
 * @param {string} symbol - Ticker symbol (e.g., "AAPL")
 * @param {Date} startDate - Start date (optional, for filtering)
 * @param {Date} endDate - End date (optional, for filtering)
 * @returns {Promise<Array>} Array of split objects with date, factor, ratio
 */
export async function fetchStockSplits(
  symbol,
  startDate = null,
  endDate = null
) {
  await rateLimitDelay();

  // Skip option tickers that contain spaces (they don't have splits)
  if (symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "")) {
    return [];
  }

  // Normalize symbol (remove spaces, append -USD for crypto)
  let cleanSymbol = normalizeSymbolForYahoo(symbol);
  const originalSymbol = symbol;

  return retryWithBackoff(async () => {
    const yahooFinance = await getYahooFinance();
    const end = endDate || new Date();
    const start = startDate || new Date(0); // Default to beginning of time

    try {
      // Fetch chart data which includes split information

      // Use chart() instead of deprecated historical()
      // Include events parameter to request split data
      const chart = await yahooFinance.chart(cleanSymbol, {
        period1: start,
        period2: end,
        interval: "1d",
        events: "split", // Request split events (must be string, not array)
      });

      if (!chart || !chart.quotes || !Array.isArray(chart.quotes)) {
        return [];
      }

      // Extract splits from chart data
      // Splits can be in chart.events.splits or in the quotes array when they occur
      const splits = [];
      const seenDates = new Set();

      // First, check chart.events.splits if available
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
              const splitRatio =
                split.numerator && split.denominator
                  ? `${split.numerator}:${split.denominator}`
                  : split.ratio || "1:1";
              const factor =
                split.numerator && split.denominator
                  ? split.numerator / split.denominator
                  : 1.0;

              splits.push({
                date: new Date(split.date),
                factor: factor,
                ratio: splitRatio,
              });
            }
          }
        }
      }

      // Also check quotes array for split information (backup method)
      for (const row of chart.quotes) {
        if (row.split && row.date) {
          const dateKey = new Date(row.date).toISOString().split("T")[0];

          // Avoid duplicates
          if (!seenDates.has(dateKey)) {
            seenDates.add(dateKey);

            // Calculate split factor from ratio (e.g., "2:1" = 2.0, "1:2" = 0.5)
            const splitRatio = row.split;
            let factor = 1.0;
            let ratio = null;

            if (typeof splitRatio === "string" && splitRatio.includes(":")) {
              const [numerator, denominator] = splitRatio
                .split(":")
                .map(Number);
              if (denominator && !isNaN(numerator) && !isNaN(denominator)) {
                factor = numerator / denominator;
                ratio = splitRatio;
              }
            } else if (typeof splitRatio === "number") {
              factor = splitRatio;
            }

            splits.push({
              date: new Date(row.date),
              factor: factor,
              ratio: ratio || `${factor}:1`,
            });
          }
        }
      }

      // Sort by date (oldest first)
      splits.sort((a, b) => a.date - b.date);

      return splits;
    } catch (error) {
      // Handle missing symbol gracefully - try with -USD suffix if not already tried
      if (
        error.message &&
        (error.message.includes("Invalid symbol") ||
          error.message.includes("Not found"))
      ) {
        // If symbol doesn't end with -USD, try with -USD suffix
        if (!cleanSymbol.toUpperCase().endsWith("-USD")) {
          const usdSymbol = `${cleanSymbol.toUpperCase()}-USD`;
          console.log(
            `Symbol ${originalSymbol} not found for splits, trying ${usdSymbol}...`
          );
          await rateLimitDelay();
          try {
            const yahooFinance = await getYahooFinance();
            const usdChart = await yahooFinance.chart(usdSymbol, {
              period1: start,
              period2: end,
              interval: "1d",
              events: "split",
            });

            if (usdChart && usdChart.quotes && Array.isArray(usdChart.quotes)) {
              const splits = [];
              const seenDates = new Set();

              if (
                usdChart.events &&
                usdChart.events.splits &&
                Array.isArray(usdChart.events.splits)
              ) {
                for (const split of usdChart.events.splits) {
                  if (split.date) {
                    const dateKey = new Date(split.date)
                      .toISOString()
                      .split("T")[0];
                    if (!seenDates.has(dateKey)) {
                      seenDates.add(dateKey);
                      const splitRatio =
                        split.numerator && split.denominator
                          ? `${split.numerator}:${split.denominator}`
                          : split.ratio || "1:1";
                      const factor =
                        split.numerator && split.denominator
                          ? split.numerator / split.denominator
                          : 1.0;

                      splits.push({
                        date: new Date(split.date),
                        factor: factor,
                        ratio: splitRatio,
                      });
                    }
                  }
                }
              }

              for (const row of usdChart.quotes) {
                if (row.split && row.date) {
                  const dateKey = new Date(row.date)
                    .toISOString()
                    .split("T")[0];
                  if (!seenDates.has(dateKey)) {
                    seenDates.add(dateKey);
                    const splitRatio = row.split;
                    let factor = 1.0;
                    let ratio = null;

                    if (
                      typeof splitRatio === "string" &&
                      splitRatio.includes(":")
                    ) {
                      const [numerator, denominator] = splitRatio
                        .split(":")
                        .map(Number);
                      if (
                        denominator &&
                        !isNaN(numerator) &&
                        !isNaN(denominator)
                      ) {
                        factor = numerator / denominator;
                        ratio = splitRatio;
                      }
                    } else if (typeof splitRatio === "number") {
                      factor = splitRatio;
                    }

                    splits.push({
                      date: new Date(row.date),
                      factor: factor,
                      ratio: ratio || `${factor}:1`,
                    });
                  }
                }
              }

              splits.sort((a, b) => a.date - b.date);
              return splits;
            }
          } catch (usdError) {
            // USD suffix also failed, return empty array
            console.warn(
              `Symbol ${originalSymbol} and ${usdSymbol} not found on Yahoo Finance for splits`
            );
            return [];
          }
        } else {
          console.warn(
            `Symbol ${originalSymbol} not found on Yahoo Finance for splits`
          );
          return [];
        }
      }
      // Handle "No such event type" error - some symbols don't have split data
      // This is expected and not an error condition
      // Also handle cases where events parameter might not be supported
      if (
        error.message &&
        (error.message.includes("No such event type") ||
          error.message.includes("events"))
      ) {
        // Try without events parameter as fallback
        try {
          const chart = await yahooFinance.chart(cleanSymbol, {
            period1: start,
            period2: end,
            interval: "1d",
          });

          // Extract from quotes array only
          if (chart && chart.quotes && Array.isArray(chart.quotes)) {
            const splits = [];
            const seenDates = new Set();
            for (const row of chart.quotes) {
              if (row.split && row.date) {
                const dateKey = new Date(row.date).toISOString().split("T")[0];
                if (!seenDates.has(dateKey)) {
                  seenDates.add(dateKey);
                  const splitRatio = row.split;
                  let factor = 1.0;
                  let ratio = null;

                  if (
                    typeof splitRatio === "string" &&
                    splitRatio.includes(":")
                  ) {
                    const [numerator, denominator] = splitRatio
                      .split(":")
                      .map(Number);
                    if (
                      denominator &&
                      !isNaN(numerator) &&
                      !isNaN(denominator)
                    ) {
                      factor = numerator / denominator;
                      ratio = splitRatio;
                    }
                  } else if (typeof splitRatio === "number") {
                    factor = splitRatio;
                  }

                  splits.push({
                    date: new Date(row.date),
                    factor: factor,
                    ratio: ratio || `${factor}:1`,
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
        // Silently return empty array - this symbol simply doesn't have splits
        return [];
      }
      console.warn(`Error fetching splits for ${symbol}:`, error.message);
      return [];
    }
  });
}

/**
 * Fetch dividends for a single symbol
 *
 * @param {string} symbol - Ticker symbol (e.g., "AAPL")
 * @param {Date} startDate - Start date (optional, for filtering)
 * @param {Date} endDate - End date (optional, for filtering)
 * @returns {Promise<Array>} Array of dividend objects with date, amount
 */
export async function fetchDividends(symbol, startDate = null, endDate = null) {
  await rateLimitDelay();

  // Skip option tickers (they don't have dividends)
  if (symbol.includes(" ") && symbol.trim() !== symbol.replace(/\s+/g, "")) {
    return [];
  }

  // Normalize symbol (remove spaces, append -USD for crypto)
  let cleanSymbol = normalizeSymbolForYahoo(symbol);
  const originalSymbol = symbol;

  return retryWithBackoff(async () => {
    const yahooFinance = await getYahooFinance();
    const end = endDate || new Date();
    const start = startDate || new Date(0);

    try {
      // Use chart() instead of deprecated historical()
      // Include events parameter to request dividend data
      const chart = await yahooFinance.chart(cleanSymbol, {
        period1: start,
        period2: end,
        interval: "1d",
        events: ["dividend"], // Request dividend events
      });

      if (!chart) {
        return [];
      }

      // Extract dividends from chart data
      // Dividends can be in chart.events.dividends or in the quotes array when they occur
      const dividends = [];
      const seenDates = new Set();

      // First, check chart.events.dividends if available
      if (
        chart.events &&
        chart.events.dividends &&
        Array.isArray(chart.events.dividends)
      ) {
        for (const dividend of chart.events.dividends) {
          if (dividend.date && dividend.amount !== undefined) {
            const dateKey = new Date(dividend.date).toISOString().split("T")[0];
            if (!seenDates.has(dateKey)) {
              seenDates.add(dateKey);
              dividends.push({
                date: new Date(dividend.date),
                amount: parseFloat(dividend.amount) || 0,
              });
            }
          }
        }
      }

      // Also check quotes array for dividend information (backup method)
      if (chart.quotes && Array.isArray(chart.quotes)) {
        for (const row of chart.quotes) {
          if (row.dividend && row.date) {
            const dateKey = new Date(row.date).toISOString().split("T")[0];

            // Avoid duplicates
            if (!seenDates.has(dateKey)) {
              seenDates.add(dateKey);

              dividends.push({
                date: new Date(row.date),
                amount: parseFloat(row.dividend) || 0,
              });
            }
          }
        }
      }

      // Sort by date (oldest first)
      dividends.sort((a, b) => a.date - b.date);

      return dividends;
    } catch (error) {
      // Handle missing symbol gracefully - try with -USD suffix if not already tried
      if (
        error.message &&
        (error.message.includes("Invalid symbol") ||
          error.message.includes("Not found"))
      ) {
        // If symbol doesn't end with -USD, try with -USD suffix
        if (!cleanSymbol.toUpperCase().endsWith("-USD")) {
          const usdSymbol = `${cleanSymbol.toUpperCase()}-USD`;
          console.log(
            `Symbol ${originalSymbol} not found for dividends, trying ${usdSymbol}...`
          );
          await rateLimitDelay();
          try {
            const yahooFinance = await getYahooFinance();
            const usdChart = await yahooFinance.chart(usdSymbol, {
              period1: start,
              period2: end,
              interval: "1d",
              events: ["dividend"],
            });

            if (usdChart) {
              const dividends = [];
              const seenDates = new Set();

              if (
                usdChart.events &&
                usdChart.events.dividends &&
                Array.isArray(usdChart.events.dividends)
              ) {
                for (const dividend of usdChart.events.dividends) {
                  if (dividend.date && dividend.amount !== undefined) {
                    const dateKey = new Date(dividend.date)
                      .toISOString()
                      .split("T")[0];
                    if (!seenDates.has(dateKey)) {
                      seenDates.add(dateKey);
                      dividends.push({
                        date: new Date(dividend.date),
                        amount: parseFloat(dividend.amount) || 0,
                      });
                    }
                  }
                }
              }

              if (usdChart.quotes && Array.isArray(usdChart.quotes)) {
                for (const row of usdChart.quotes) {
                  if (row.dividend && row.date) {
                    const dateKey = new Date(row.date)
                      .toISOString()
                      .split("T")[0];
                    if (!seenDates.has(dateKey)) {
                      seenDates.add(dateKey);
                      dividends.push({
                        date: new Date(row.date),
                        amount: parseFloat(row.dividend) || 0,
                      });
                    }
                  }
                }
              }

              dividends.sort((a, b) => a.date - b.date);
              return dividends;
            }
          } catch (usdError) {
            // USD suffix also failed, return empty array
            console.warn(
              `Symbol ${originalSymbol} and ${usdSymbol} not found on Yahoo Finance for dividends`
            );
            return [];
          }
        } else {
          console.warn(
            `Symbol ${originalSymbol} not found on Yahoo Finance for dividends`
          );
          return [];
        }
      }
      // Handle "No such event type" error - some symbols don't have dividend data
      // This is expected and not an error condition
      // Also handle cases where events parameter might not be supported
      if (
        error.message &&
        (error.message.includes("No such event type") ||
          error.message.includes("events"))
      ) {
        // Try without events parameter as fallback
        try {
          const chart = await yahooFinance.chart(cleanSymbol, {
            period1: start,
            period2: end,
            interval: "1d",
          });

          // Extract from quotes array only
          if (chart && chart.quotes && Array.isArray(chart.quotes)) {
            const dividends = [];
            const seenDates = new Set();
            for (const row of chart.quotes) {
              if (row.dividend && row.date) {
                const dateKey = new Date(row.date).toISOString().split("T")[0];
                if (!seenDates.has(dateKey)) {
                  seenDates.add(dateKey);
                  dividends.push({
                    date: new Date(row.date),
                    amount: parseFloat(row.dividend) || 0,
                  });
                }
              }
            }
            dividends.sort((a, b) => a.date - b.date);
            return dividends;
          }
        } catch (fallbackError) {
          // If fallback also fails, return empty array
        }
        // Silently return empty array - this symbol simply doesn't have dividends
        return [];
      }
      // Log other errors but still return empty array to allow pipeline to continue
      console.warn(`Error fetching dividends for ${symbol}:`, error.message);
      return [];
    }
  });
}

export default {
  fetchHistoricalPrices,
  getLatestPrice,
  fetchMultipleSymbols,
  fetchStockSplits,
  fetchDividends,
};
