/**
 * Risk-Adjusted Performance Metrics
 *
 * Functions for calculating risk-adjusted performance metrics:
 * - Sharpe Ratio
 * - Sortino Ratio
 * - Return / Max Drawdown
 */

/**
 * Calculates Sharpe Ratio (risk-adjusted return measure)
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.returns - Array of daily returns
 * @param {number} opts.riskFreeRate - Annual risk-free rate (default: 0)
 * @param {boolean} opts.annualized - Whether to annualize (default: true)
 * @returns {Object|null} Object with { sharpe, meanReturn, stdDev, annualizedReturn, annualizedVol } or null
 */
export function calculateSharpeRatio(opts = {}) {
  const { returns, riskFreeRate = 0, annualized = true } = opts;

  if (!returns || returns.length === 0) {
    return null;
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined && !isNaN(r)
  );

  if (validReturns.length === 0) {
    return null;
  }

  const meanReturn = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
    validReturns.length;
  const volatility = Math.sqrt(variance);

  if (volatility === 0) {
    return null;
  }

  let annualizedReturn = meanReturn;
  let annualizedVol = volatility;
  if (annualized) {
    annualizedReturn = meanReturn * 252;
    annualizedVol = volatility * Math.sqrt(252);
  }

  const sharpe = (annualizedReturn - riskFreeRate) / annualizedVol;

  return {
    sharpe,
    meanReturn,
    stdDev: volatility,
    annualizedReturn,
    annualizedVol,
  };
}

/**
 * Calculates Sortino Ratio (downside risk-adjusted return measure)
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.returns - Array of daily returns
 * @param {number} opts.mar - Annual Minimum Acceptable Return (default: 0)
 * @param {boolean} opts.annualized - Whether to annualize (default: true)
 * @returns {Object|null} Object with { sortino, meanReturn, downsideDeviation, annualizedReturn, annualizedDownsideDev } or null
 */
export function calculateSortinoRatio(opts = {}) {
  const { returns, mar = 0, annualized = true } = opts;

  if (!returns || returns.length === 0) {
    return null;
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined && !isNaN(r)
  );

  if (validReturns.length === 0) {
    return null;
  }

  const meanReturn = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  // Convert MAR to daily rate for downside deviation calculation
  const marDaily = mar / 252;

  // Calculate downside deviations (only for returns below MAR)
  const squaredDownsideDeviations = validReturns.map((r) => {
    const deviation = r - marDaily;
    return deviation < 0 ? deviation * deviation : 0;
  });

  const sumSquaredDownsideDeviations = squaredDownsideDeviations.reduce(
    (sum, d) => sum + d,
    0
  );

  if (sumSquaredDownsideDeviations === 0) {
    return null;
  }

  const downsideVariance = sumSquaredDownsideDeviations / validReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);

  if (downsideDeviation === 0) {
    return null;
  }

  let annualizedReturn = meanReturn;
  let annualizedDownsideDev = downsideDeviation;
  if (annualized) {
    annualizedReturn = meanReturn * 252;
    annualizedDownsideDev = downsideDeviation * Math.sqrt(252);
  }

  const sortino = (annualizedReturn - mar) / annualizedDownsideDev;

  return {
    sortino,
    meanReturn,
    downsideDeviation,
    annualizedReturn,
    annualizedDownsideDev,
  };
}

/**
 * Calculates Return over Maximum Drawdown ratio
 *
 * @param {Object} opts - Options object
 * @param {number} opts.periodReturn - Total return for the period
 * @param {number} opts.maxDrawdown - Maximum drawdown value (positive)
 * @returns {Object|null} Object with { ratio, return, maxDrawdown } or null
 */
export function calculateReturnOverMaxDD(opts = {}) {
  const { periodReturn, maxDrawdown } = opts;

  if (!maxDrawdown || maxDrawdown === 0) {
    return null;
  }

  return {
    ratio: periodReturn / Math.abs(maxDrawdown),
    return: periodReturn,
    maxDrawdown: Math.abs(maxDrawdown),
  };
}

