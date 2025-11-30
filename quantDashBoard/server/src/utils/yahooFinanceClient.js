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

async function getYahooFinance() {
  if (!YahooFinanceModule) {
    const mod = await import("yahoo-finance2");
    YahooFinanceModule = mod.default || mod;
  }
  return YahooFinanceModule;
}

// Rate limiting: max 2000 requests/hour = ~33 requests/minute = ~1 request every 2 seconds
const RATE_LIMIT_DELAY_MS = 2000;
let lastRequestTime = 0;

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
 * 
 * @param {string} symbol - Ticker symbol (e.g., "AAPL")
 * @param {Date} startDate - Start date (inclusive)
 * @param {Date} endDate - End date (inclusive)
 * @returns {Promise<Array>} Array of price objects with date, close, open, high, low, volume
 */
export async function fetchHistoricalPrices(symbol, startDate, endDate) {
  await rateLimitDelay();

  // Clean symbol (remove spaces for option tickers)
  const cleanSymbol = symbol.replace(/\s+/g, "");

  return retryWithBackoff(async () => {
    try {
      const YahooFinance = await getYahooFinance();
      const yahooFinance = new YahooFinance();
      
      const historical = await yahooFinance.historical(cleanSymbol, {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      });

      if (!Array.isArray(historical) || historical.length === 0) {
        return [];
      }

      // Transform to our format
      return historical.map((row) => ({
        date: new Date(row.date),
        close: row.close || null,
        open: row.open || null,
        high: row.high || null,
        low: row.low || null,
        volume: row.volume || null,
      }));
    } catch (error) {
      // Handle missing symbol gracefully
      if (error.message && error.message.includes("Invalid symbol")) {
        console.warn(`Symbol ${symbol} not found on Yahoo Finance`);
        return [];
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

  const cleanSymbol = symbol.replace(/\s+/g, "");

  return retryWithBackoff(async () => {
    try {
      const YahooFinance = await getYahooFinance();
      const yahooFinance = new YahooFinance();
      const quote = await yahooFinance.quote(cleanSymbol);
      
      if (!quote || !quote.regularMarketPrice) {
        return null;
      }
      
      return quote.regularMarketPrice;
    } catch (error) {
      console.warn(`Failed to fetch latest price for ${symbol}:`, error.message);
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

export default {
  fetchHistoricalPrices,
  getLatestPrice,
  fetchMultipleSymbols,
};

