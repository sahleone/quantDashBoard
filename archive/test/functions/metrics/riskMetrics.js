/**
 * Risk & Drawdown Metrics
 *
 * Functions for calculating risk metrics from portfolio returns:
 * - Volatility
 * - Beta
 * - Maximum Drawdown
 * - VaR (Value at Risk)
 * - CVaR (Conditional VaR)
 */

import { ensureDbConnection, getDb } from "../../utils/dbConnection.js";

/**
 * Calculates volatility (standard deviation of returns)
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.returns - Array of daily returns
 * @param {boolean} opts.annualized - Whether to annualize (default: true)
 * @returns {Object} Object with { volatility, periodVolatility }
 */
export function calculateVolatility(opts = {}) {
  const { returns, annualized = true } = opts;

  if (!returns || returns.length === 0) {
    return { volatility: 0, periodVolatility: 0 };
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined && !isNaN(r)
  );

  if (validReturns.length === 0) {
    return { volatility: 0, periodVolatility: 0 };
  }

  const mean =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    validReturns.length;

  const periodVolatility = Math.sqrt(variance);
  const volatility = annualized
    ? periodVolatility * Math.sqrt(252)
    : periodVolatility;

  return { volatility, periodVolatility };
}

/**
 * Calculates Beta (sensitivity to benchmark movements)
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.portfolioReturns - Array of portfolio returns
 * @param {Array<number>} opts.benchmarkReturns - Array of benchmark returns (same length)
 * @param {Array<string>} opts.dates - Array of dates (optional, for alignment)
 * @returns {Object} Object with { beta, correlation, alpha }
 */
export function calculateBeta(opts = {}) {
  const { portfolioReturns, benchmarkReturns, dates } = opts;

  if (
    !portfolioReturns ||
    !benchmarkReturns ||
    portfolioReturns.length !== benchmarkReturns.length ||
    portfolioReturns.length === 0
  ) {
    return { beta: null, correlation: null, alpha: null };
  }

  // Align arrays (filter out null/undefined pairs)
  const pairs = [];
  for (let i = 0; i < portfolioReturns.length; i++) {
    const pRet = portfolioReturns[i];
    const bRet = benchmarkReturns[i];
    if (
      pRet !== null &&
      pRet !== undefined &&
      !isNaN(pRet) &&
      bRet !== null &&
      bRet !== undefined &&
      !isNaN(bRet)
    ) {
      pairs.push({ portfolio: pRet, benchmark: bRet });
    }
  }

  if (pairs.length === 0) {
    return { beta: null, correlation: null, alpha: null };
  }

  const pMean = pairs.reduce((sum, p) => sum + p.portfolio, 0) / pairs.length;
  const bMean = pairs.reduce((sum, p) => sum + p.benchmark, 0) / pairs.length;

  // Calculate covariance
  const covariance =
    pairs.reduce(
      (sum, p) => sum + (p.portfolio - pMean) * (p.benchmark - bMean),
      0
    ) / pairs.length;

  // Calculate variance of benchmark
  const bVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.benchmark - bMean, 2), 0) /
    pairs.length;

  if (bVariance === 0) {
    return { beta: null, correlation: null, alpha: null };
  }

  // Calculate beta
  const beta = covariance / bVariance;

  // Calculate correlation
  const pVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.portfolio - pMean, 2), 0) /
    pairs.length;
  const pStd = Math.sqrt(pVariance);
  const bStd = Math.sqrt(bVariance);
  const correlation = covariance / (pStd * bStd);

  // Calculate alpha (assuming risk-free rate = 0 for simplicity)
  const alpha = pMean - beta * bMean;

  return { beta, correlation, alpha };
}

/**
 * Calculates Maximum Drawdown from portfolio series
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.portfolioSeries - Array of portfolio series with { date, portfolioValue }
 * @returns {Object} Object with { maxDrawdown, maxDrawdownDate, drawdownSeries }
 */
export function calculateMaxDrawdown(opts = {}) {
  const { portfolioSeries } = opts;

  if (!Array.isArray(portfolioSeries) || portfolioSeries.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownDate: null,
      drawdownSeries: [],
    };
  }

  const equityIndex = portfolioSeries.map((p) => p.portfolioValue || 0);
  const validValues = equityIndex.filter(
    (v) => v !== null && v !== undefined && !isNaN(v) && v > 0
  );

  if (validValues.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownDate: null,
      drawdownSeries: [],
    };
  }

  let maxDD = 0;
  let maxDDDate = null;
  // Initialize peak from first valid value in equityIndex (not from validValues array)
  let peak = null;
  let peakIndex = -1;
  const drawdownSeries = [];

  // Process from the beginning of equityIndex, finding first valid peak
  for (let i = 0; i < equityIndex.length; i++) {
    const value = equityIndex[i];

    // Handle invalid values
    if (value === null || value === undefined || isNaN(value) || value <= 0) {
      // If we don't have a peak yet, can't calculate drawdown
      if (peak === null) {
        drawdownSeries.push(null);
        continue;
      }
      // If we have a peak, invalid values still get null drawdown
      drawdownSeries.push(null);
      continue;
    }

    // First valid value becomes the initial peak
    if (peak === null) {
      peak = value;
      peakIndex = i;
      // First value has no drawdown (it's the peak itself)
      drawdownSeries.push(0);
      continue;
    }

    // Update peak if current value is higher
    if (value > peak) {
      peak = value;
      peakIndex = i;
      // New peak has no drawdown
      drawdownSeries.push(0);
    } else {
      // Calculate drawdown from current peak
      const drawdown = (value - peak) / peak;
      drawdownSeries.push(drawdown);

      if (drawdown < maxDD) {
        maxDD = drawdown;
        maxDDDate = portfolioSeries[i].date;
      }
    }
  }

  return {
    maxDrawdown: Math.abs(maxDD), // Return as positive value
    maxDrawdownDate,
    drawdownSeries,
  };
}

/**
 * Calculates Value at Risk (VaR) and Conditional VaR (CVaR) using historical method
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.returns - Array of daily returns
 * @param {number} opts.confidenceLevel - Confidence level (default: 0.95)
 * @returns {Object} Object with { var, cvar, confidenceLevel }
 */
export function calculateVaRAndCVaR(opts = {}) {
  const { returns, confidenceLevel = 0.95 } = opts;

  if (!returns || returns.length === 0) {
    return { var: 0, cvar: 0, confidenceLevel };
  }

  // Convert returns to losses (positive values represent losses)
  const losses = returns
    .filter((r) => r !== null && r !== undefined && !isNaN(r))
    .map((r) => -r)
    .sort((a, b) => a - b); // Sort ascending (worst losses at the end)

  if (losses.length === 0) {
    return { var: 0, cvar: 0, confidenceLevel };
  }

  // Calculate VaR as the quantile
  // Since losses are sorted ascending (worst at end), we need the tail percentile
  // For 95% confidence, we want the 5th percentile (worst 5% of losses)
  const tailPercentile = 1 - confidenceLevel;
  const index = Math.floor(losses.length * tailPercentile);
  const varValue = losses[Math.min(index, losses.length - 1)];

  // Calculate CVaR as average of losses >= VaR
  const tailLosses = losses.filter((loss) => loss >= varValue);

  const cvarValue =
    tailLosses.length > 0
      ? tailLosses.reduce((sum, loss) => sum + loss, 0) / tailLosses.length
      : varValue;

  return {
    var: varValue,
    cvar: cvarValue,
    confidenceLevel,
  };
}

/**
 * Fetches benchmark returns from database for beta calculation
 *
 * @param {Object} opts - Options object
 * @param {Date|string} opts.startDate - Start date
 * @param {Date|string} opts.endDate - End date
 * @param {string} opts.benchmarkSymbol - Benchmark symbol (default: "SPY")
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Array<number>|null>} Array of daily returns or null
 */
export async function fetchBenchmarkReturns(opts = {}) {
  const { startDate, endDate, benchmarkSymbol = "SPY", databaseUrl } = opts;

  if (!startDate || !endDate) {
    return null;
  }

  await ensureDbConnection(databaseUrl);
  const db = getDb();

  try {
    const priceHistoryCollection = db.collection("pricehistories");

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const prices = await priceHistoryCollection
      .find({
        symbol: benchmarkSymbol,
        date: { $gte: start, $lte: end },
      })
      .sort({ date: 1 })
      .toArray();

    if (prices.length < 2) {
      return null;
    }

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1].close;
      const currPrice = prices[i].close;
      if (prevPrice > 0 && currPrice > 0) {
        returns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    return returns;
  } catch (error) {
    console.error("Error fetching benchmark returns:", error);
    return null;
  }
}
