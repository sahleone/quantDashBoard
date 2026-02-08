/**
 * Risk Metrics
 *
 * Functions for calculating risk metrics:
 * - Volatility
 * - Beta
 * - Maximum Drawdown
 * - VaR (Value at Risk)
 * - CVaR (Conditional VaR)
 */

/**
 * Calculates volatility (standard deviation of returns)
 * @param {Array<number>} returns - Array of returns
 * @param {boolean} annualized - Whether to annualize the result (default: true)
 * @returns {number} - Volatility as a decimal
 */
export function calculateVolatility(returns, annualized = true) {
  if (!returns || returns.length === 0) {
    return 0;
  }

  const validReturns = returns.filter((r) => r !== null && r !== undefined);

  if (validReturns.length < 2) {
    return 0;
  }

  const mean =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    (validReturns.length - 1);

  const stdDev = Math.sqrt(variance);

  if (annualized) {
    return stdDev * Math.sqrt(252);
  }

  return stdDev;
}

/**
 * Calculates Beta (sensitivity to benchmark movements)
 * @param {Array<number>} portfolioReturns - Array of portfolio returns
 * @param {Array<number>} benchmarkReturns - Array of benchmark returns
 * @returns {number|null} - Beta value or null if insufficient data
 */
export function calculateBeta(portfolioReturns, benchmarkReturns) {
  if (
    !portfolioReturns ||
    !benchmarkReturns ||
    portfolioReturns.length !== benchmarkReturns.length ||
    portfolioReturns.length === 0
  ) {
    return null;
  }

  const pairs = [];
  for (let i = 0; i < portfolioReturns.length; i++) {
    const pRet = portfolioReturns[i];
    const bRet = benchmarkReturns[i];
    if (
      pRet !== null &&
      pRet !== undefined &&
      bRet !== null &&
      bRet !== undefined
    ) {
      pairs.push({ portfolio: pRet, benchmark: bRet });
    }
  }

  if (pairs.length < 2) {
    return null;
  }

  const pMean = pairs.reduce((sum, p) => sum + p.portfolio, 0) / pairs.length;
  const bMean = pairs.reduce((sum, p) => sum + p.benchmark, 0) / pairs.length;

  const covariance =
    pairs.reduce(
      (sum, p) => sum + (p.portfolio - pMean) * (p.benchmark - bMean),
      0
    ) / (pairs.length - 1);

  const bVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.benchmark - bMean, 2), 0) /
    (pairs.length - 1);

  if (bVariance === 0) {
    return null;
  }

  return covariance / bVariance;
}

/**
 * Calculates Maximum Drawdown from equity index
 * @param {Array<number>} equityIndex - Array of equity index values
 * @returns {number} - Maximum drawdown as a positive decimal
 */
export function calculateMaxDrawdown(equityIndex) {
  if (!equityIndex || equityIndex.length === 0) {
    return 0;
  }

  const validValues = equityIndex.filter(
    (v) => v !== null && v !== undefined && !isNaN(v)
  );

  if (validValues.length === 0) {
    return 0;
  }

  let maxDD = 0;
  let peak = validValues[0];

  for (let i = 1; i < validValues.length; i++) {
    const value = validValues[i];
    if (value > peak) {
      peak = value;
    } else {
      const drawdown = (value - peak) / peak;
      if (drawdown < maxDD) {
        maxDD = drawdown;
      }
    }
  }

  return Math.abs(maxDD);
}

/**
 * Calculates Value at Risk (VaR) using historical method
 * @param {Array<number>} returns - Array of returns
 * @param {number} confidence - Confidence level (default: 0.95)
 * @returns {number} - VaR value (positive number representing potential loss)
 */
export function calculateVaRHistorical(returns, confidence = 0.95) {
  if (!returns || returns.length === 0) {
    return 0;
  }

  const losses = returns
    .filter((r) => r !== null && r !== undefined)
    .map((r) => -r)
    .sort((a, b) => a - b);

  if (losses.length === 0) {
    return 0;
  }

  // For VaR at 95% confidence, we want the 5th percentile of losses (sorted ascending)
  const index = Math.ceil(losses.length * (1 - confidence)) - 1;
  return losses[Math.max(index, 0)];
}

/**
 * Calculates Value at Risk (VaR) using parametric method (normal distribution)
 * @param {Array<number>} returns - Array of returns
 * @param {number} confidence - Confidence level (default: 0.95)
 * @returns {number} - VaR value
 */
export function calculateVaRParametric(returns, confidence = 0.95) {
  if (!returns || returns.length === 0) {
    return 0;
  }

  const validReturns = returns.filter((r) => r !== null && r !== undefined);

  if (validReturns.length === 0) {
    return 0;
  }

  if (validReturns.length < 2) {
    return 0;
  }

  const mean =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    (validReturns.length - 1);
  const std = Math.sqrt(variance);

  const zScores = {
    0.95: 1.645,
    0.99: 2.326,
    0.9: 1.282,
  };
  const z = zScores[confidence] || 1.645;

  return -(mean + z * std);
}

/**
 * Calculates Conditional Value at Risk (CVaR) / Expected Shortfall
 * @param {Array<number>} returns - Array of returns
 * @param {number} var95 - VaR value at 95% confidence
 * @returns {number} - CVaR value
 */
export function calculateCVaR(returns, var95) {
  if (
    !returns ||
    returns.length === 0 ||
    var95 === null ||
    var95 === undefined
  ) {
    return 0;
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined
  );

  if (validReturns.length === 0) {
    return 0;
  }

  // Sort returns ascending and take the worst 5% (left tail)
  const sorted = [...validReturns].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.floor(sorted.length * 0.05));
  const tailReturns = sorted.slice(0, cutoff);

  // CVaR = negative of the mean of the worst tail returns (expressed as a loss)
  const tailMean =
    tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
  return -tailMean;
}
