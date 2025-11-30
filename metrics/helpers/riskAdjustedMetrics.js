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
 * @param {Array<number>} returns - Array of returns
 * @param {number} riskFreeRate - Risk-free rate (default: 0)
 * @param {boolean} annualized - Whether to annualize (default: true)
 * @returns {number|null} - Sharpe ratio or null if volatility is zero
 */
export function calculateSharpeRatio(
  returns,
  riskFreeRate = 0,
  annualized = true
) {
  if (!returns || returns.length === 0) {
    return null;
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined
  );

  if (validReturns.length === 0) {
    return null;
  }

  const meanReturn =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

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

  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

/**
 * Calculates Sortino Ratio (downside risk-adjusted return measure)
 * @param {Array<number>} returns - Array of returns
 * @param {number} mar - Minimum Acceptable Return (default: 0)
 * @param {boolean} annualized - Whether to annualize (default: true)
 * @returns {number|null} - Sortino ratio or null if no downside risk
 */
export function calculateSortinoRatio(
  returns,
  mar = 0,
  annualized = true
) {
  if (!returns || returns.length === 0) {
    return null;
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined
  );

  if (validReturns.length === 0) {
    return null;
  }

  const meanReturn =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  const squaredDownsideDeviations = validReturns.map((r) => {
    const deviation = r - mar;
    return deviation < 0 ? deviation * deviation : 0;
  });

  const sumSquaredDownsideDeviations = squaredDownsideDeviations.reduce(
    (sum, d) => sum + d,
    0
  );

  if (sumSquaredDownsideDeviations === 0) {
    return null;
  }

  const downsideVariance =
    sumSquaredDownsideDeviations / validReturns.length;
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

  return (annualizedReturn - mar) / annualizedDownsideDev;
}

/**
 * Calculates Return over Maximum Drawdown ratio
 * @param {number} totalReturn - Total return for the period
 * @param {number} maxDrawdown - Maximum drawdown value
 * @returns {number|null} - Ratio or null if maxDrawdown is zero
 */
export function calculateReturnOverMaxDD(totalReturn, maxDrawdown) {
  if (!maxDrawdown || maxDrawdown === 0) {
    return null;
  }

  return totalReturn / Math.abs(maxDrawdown);
}

