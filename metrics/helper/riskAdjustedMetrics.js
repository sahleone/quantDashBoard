/**
 * Risk-Adjusted Performance Metrics
 * 
 * Functions for calculating risk-adjusted performance metrics:
 * - Sharpe Ratio
 * - Sortino Ratio
 * - Return / Max Drawdown
 */

/**
 * Calculate Sharpe Ratio
 * Sharpe = (mean_return - risk_free_rate) / volatility
 * Annualized: Sharpe = (mean_daily_return * 252 - R_f) / (volatility_daily * sqrt(252))
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

  // Calculate mean return
  const meanReturn =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  // Calculate volatility
  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
    validReturns.length;
  const volatility = Math.sqrt(variance);

  if (volatility === 0) {
    return null;
  }

  // Annualize if requested
  let annualizedReturn = meanReturn;
  let annualizedVol = volatility;
  if (annualized) {
    annualizedReturn = meanReturn * 252;
    annualizedVol = volatility * Math.sqrt(252);
  }

  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

/**
 * Calculate Sortino Ratio
 * Sortino = (mean_return - MAR) / downside_deviation
 * downside_deviation = sqrt(mean((returns < MAR)^2))
 * MAR = Minimum Acceptable Return (often 0 or risk-free rate)
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

  // Calculate mean return
  const meanReturn =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  // Calculate downside deviation (only negative deviations from MAR)
  // Standard Sortino formula: sqrt(mean of squared negative deviations)
  // Mean is calculated over ALL observations (n), not just negative ones
  const squaredDownsideDeviations = validReturns.map((r) => {
    const deviation = r - mar;
    return deviation < 0 ? deviation * deviation : 0;
  });

  // Sum all squared deviations (including zeros for non-negative returns)
  const sumSquaredDownsideDeviations = squaredDownsideDeviations.reduce(
    (sum, d) => sum + d,
    0
  );

  // Check if there are any negative deviations
  if (sumSquaredDownsideDeviations === 0) {
    return null; // No downside risk
  }

  // Divide by total number of observations (n), not just count of negative deviations
  const downsideVariance =
    sumSquaredDownsideDeviations / validReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);

  if (downsideDeviation === 0) {
    return null;
  }

  // Annualize if requested
  let annualizedReturn = meanReturn;
  let annualizedDownsideDev = downsideDeviation;
  if (annualized) {
    annualizedReturn = meanReturn * 252;
    annualizedDownsideDev = downsideDeviation * Math.sqrt(252);
  }

  return (annualizedReturn - mar) / annualizedDownsideDev;
}

/**
 * Calculate Return / Max Drawdown ratio
 * Return/MaxDD = Return_period / |MaxDD|
 */
export function calculateReturnOverMaxDD(totalReturn, maxDrawdown) {
  if (!maxDrawdown || maxDrawdown === 0) {
    return null;
  }

  return totalReturn / Math.abs(maxDrawdown);
}

