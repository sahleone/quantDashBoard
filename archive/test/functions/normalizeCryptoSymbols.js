/**
 * Common cryptocurrency symbols that need "-USD" suffix for Yahoo Finance
 */
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

/**
 * Checks if a symbol is a crypto symbol
 *
 * @param {string} symbol - Symbol to check
 * @returns {boolean} True if the symbol is a known crypto symbol
 */
function isCryptoSymbol(symbol) {
  if (!symbol) return false;
  const cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();
  return CRYPTO_SYMBOLS.has(cleanSymbol) && !cleanSymbol.endsWith("-USD");
}

/**
 * Normalizes crypto symbols by appending "-USD" suffix
 * Checks all symbols in the array and replaces crypto symbols with "<symbol>-USD"
 *
 * @param {Object} opts - Options object
 * @param {string[]} opts.symbols - Array of symbols to check and normalize
 * @returns {Promise<string[]>} Array of normalized symbols (crypto symbols replaced with "<symbol>-USD")
 */
export async function normalizeCryptoSymbols(opts = {}) {
  const { symbols } = opts;

  if (!Array.isArray(symbols)) {
    throw new Error("symbols must be an array");
  }

  const normalized = symbols.map((symbol) => {
    if (!symbol) return symbol;

    const cleanSymbol = symbol.replace(/\s+/g, "").toUpperCase();

    if (isCryptoSymbol(cleanSymbol)) {
      return `${cleanSymbol}-USD`;
    }

    return symbol;
  });

  return normalized;
}

