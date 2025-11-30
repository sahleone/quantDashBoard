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
 * Calculate volatility (standard deviation of returns)
 * Annualized: volatility = std(returns) * sqrt(252) for daily data
 */
export function calculateVolatility(returns, annualized = true) {
  if (!returns || returns.length === 0) {
    return 0;
  }

  // Filter out null/undefined returns
  const validReturns = returns.filter((r) => r !== null && r !== undefined);

  if (validReturns.length === 0) {
    return 0;
  }

  // Calculate mean
  const mean =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

  // Calculate variance
  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    validReturns.length;

  // Standard deviation
  const stdDev = Math.sqrt(variance);

  // Annualize if requested (assuming daily returns)
  if (annualized) {
    return stdDev * Math.sqrt(252);
  }

  return stdDev;
}

/**
 * Calculate Beta
 * Beta = Cov(portfolio_returns, benchmark_returns) / Var(benchmark_returns)
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

  // Filter to valid pairs
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

  if (pairs.length === 0) {
    return null;
  }

  // Calculate means
  const pMean =
    pairs.reduce((sum, p) => sum + p.portfolio, 0) / pairs.length;
  const bMean =
    pairs.reduce((sum, p) => sum + p.benchmark, 0) / pairs.length;

  // Calculate covariance
  const covariance =
    pairs.reduce(
      (sum, p) =>
        sum + (p.portfolio - pMean) * (p.benchmark - bMean),
      0
    ) / pairs.length;

  // Calculate benchmark variance
  const bVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.benchmark - bMean, 2), 0) /
    pairs.length;

  if (bVariance === 0) {
    return null;
  }

  return covariance / bVariance;
}

/**
 * Calculate Maximum Drawdown from equity index
 * MaxDD = min((equityIndex[t] - peak[t]) / peak[t])
 * where peak[t] = max(equityIndex[0:t])
 */
export function calculateMaxDrawdown(equityIndex) {
  if (!equityIndex || equityIndex.length === 0) {
    return 0;
  }

  // Filter out null values
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

  return Math.abs(maxDD); // Return as positive number
}

/**
 * Calculate VaR (Value at Risk) using historical method
 * VaR_95 = quantile(losses, 0.95) where losses = -returns
 */
export function calculateVaRHistorical(returns, confidence = 0.95) {
  if (!returns || returns.length === 0) {
    return 0;
  }

  // Convert returns to losses
  const losses = returns
    .filter((r) => r !== null && r !== undefined)
    .map((r) => -r)
    .sort((a, b) => a - b);

  if (losses.length === 0) {
    return 0;
  }

  const index = Math.ceil(losses.length * confidence) - 1;
  return losses[Math.min(index, losses.length - 1)];
}

/**
 * Calculate VaR using parametric method (assuming normal distribution)
 * VaR_95 = -(mean + z_0.95 * std) where z_0.95 ≈ 1.645
 */
export function calculateVaRParametric(returns, confidence = 0.95) {
  if (!returns || returns.length === 0) {
    return 0;
  }

  const validReturns = returns.filter(
    (r) => r !== null && r !== undefined
  );

  if (validReturns.length === 0) {
    return 0;
  }

  // Calculate mean and std
  const mean =
    validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
  const variance =
    validReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
    validReturns.length;
  const std = Math.sqrt(variance);

  // Z-score for confidence level
  const zScores = {
    0.95: 1.645,
    0.99: 2.326,
    0.90: 1.282,
  };
  const z = zScores[confidence] || 1.645;

  return -(mean + z * std);
}

/**
 * Calculate CVaR (Conditional VaR / Expected Shortfall)
 * CVaR_95 = mean(losses | losses >= VaR_95)
 */
export function calculateCVaR(returns, var95) {
  if (!returns || returns.length === 0 || var95 === null || var95 === undefined) {
    return 0;
  }

  // Convert returns to losses
  const losses = returns
    .filter((r) => r !== null && r !== undefined)
    .map((r) => -r);

  if (losses.length === 0) {
    return 0;
  }

  // Filter losses >= VaR
  const tailLosses = losses.filter((loss) => loss >= var95);

  if (tailLosses.length === 0) {
    return var95;
  }

  // Calculate mean of tail losses
  return tailLosses.reduce((sum, loss) => sum + loss, 0) / tailLosses.length;
}

