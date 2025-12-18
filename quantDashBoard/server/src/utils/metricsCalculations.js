/**
 * Metrics Calculation Utilities
 * 
 * Contains all metric calculation functions for portfolio performance and risk analysis.
 * These functions are used to calculate metrics from portfolio returns data.
 */

/**
 * Compute the expected return (mean return) from a return series.
 */
function expectedReturn(returns) {
  if (returns.length === 0) {
    throw new Error("returns cannot be empty");
  }
  const sum = returns.reduce((acc, ret) => acc + ret, 0);
  return sum / returns.length;
}

/**
 * Compute volatility (standard deviation) of returns.
 */
function volatility(returns, ddof = 1) {
  if (returns.length < 2) {
    throw new Error("returns must have at least 2 values to compute volatility");
  }
  const mean = expectedReturn(returns);
  const variance =
    returns.reduce((acc, ret) => {
      const diff = ret - mean;
      return acc + diff * diff;
    }, 0) /
    (returns.length - ddof);
  return Math.sqrt(variance);
}

/**
 * Compute annualized volatility.
 */
function annualizedVolatility(returns, periodsPerYear, ddof = 1) {
  if (periodsPerYear <= 0) {
    throw new Error("periodsPerYear must be positive");
  }
  const periodVol = volatility(returns, ddof);
  return periodVol * Math.sqrt(periodsPerYear);
}

/**
 * Compute the Sharpe Ratio (risk-adjusted performance metric).
 */
function sharpeRatio(returns, riskFreeRate = 0.0, periodsPerYear = null) {
  if (returns.length < 2) {
    throw new Error("returns must have at least 2 values to compute Sharpe Ratio");
  }
  const excess = returns.map((ret) => ret - riskFreeRate);
  const meanExcess = expectedReturn(excess);
  const vol = volatility(returns, 1);
  if (vol === 0) {
    throw new Error("volatility is zero, cannot compute Sharpe Ratio");
  }
  if (periodsPerYear !== null && periodsPerYear !== undefined) {
    const meanExcessAnnual = meanExcess * periodsPerYear;
    const volAnnual = annualizedVolatility(returns, periodsPerYear, 1);
    return meanExcessAnnual / volAnnual;
  }
  return meanExcess / vol;
}

/**
 * Approximate normal quantile (inverse CDF).
 */
function normalQuantile(p) {
  if (p === 0.975) return 1.96;
  if (p === 0.95) return 1.645;
  if (p === 0.9) return 1.282;
  if (p === 0.99) return 2.326;
  if (p === 0.995) return 2.576;

  const a0 = 2.50662823884;
  const a1 = -18.61500062529;
  const a2 = 41.39119773534;
  const a3 = -25.44106049637;
  const b1 = -8.4735109309;
  const b2 = 23.08336743743;
  const b3 = -21.06224101826;
  const b4 = 3.13082909833;
  const c0 = 0.3374754822726147;
  const c1 = 0.9761690190917186;
  const c2 = 0.1607979714918209;
  const c3 = 0.0276438810333863;
  const c4 = 0.0038405729373609;
  const c5 = 0.0003951896511919;
  const c6 = 0.0000321767881768;
  const c7 = 0.0000002888167364;
  const c8 = 0.0000003960315187;

  let y = p - 0.5;
  let r, x;

  if (Math.abs(y) < 0.42) {
    r = y * y;
    x =
      (y * (((a3 * r + a2) * r + a1) * r + a0)) /
      ((((b4 * r + b3) * r + b2) * r + b1) * r + 1);
  } else {
    r = p;
    if (y > 0) r = 1 - p;
    r = Math.log(-Math.log(r));
    x =
      c0 +
      r *
        (c1 +
          r *
            (c2 +
              r * (c3 + r * (c4 + r * (c5 + r * (c6 + r * (c7 + r * c8)))))));
    if (y < 0) x = -x;
  }
  return x;
}

/**
 * Compute the confidence interval for the Sharpe Ratio.
 */
function sharpeRatioConfidenceInterval(
  returns,
  riskFreeRate = 0.0,
  confidence = 0.95
) {
  if (returns.length < 2) {
    throw new Error("returns must have at least 2 values");
  }
  if (confidence <= 0 || confidence >= 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  const sharpe = sharpeRatio(returns, riskFreeRate);
  const T = returns.length;
  const alpha = 1 - confidence;
  const zScore = normalQuantile(1 - alpha / 2);
  const se = Math.sqrt((1 + 0.5 * sharpe * sharpe) / T);
  const lower = sharpe - zScore * se;
  const upper = sharpe + zScore * se;
  return {
    sharpeRatio: sharpe,
    lowerBound: lower,
    upperBound: upper,
  };
}

/**
 * Compute the maximum drawdown from cumulative returns.
 */
function maximumDrawdown(cumulativeReturns) {
  if (cumulativeReturns.length === 0) {
    throw new Error("cumulativeReturns cannot be empty");
  }
  let runningMax = cumulativeReturns[0];
  let maxDrawdown = 0;
  for (let i = 0; i < cumulativeReturns.length; i++) {
    runningMax = Math.max(runningMax, cumulativeReturns[i]);
    const drawdown = (runningMax - cumulativeReturns[i]) / runningMax;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  return maxDrawdown;
}

/**
 * Compute the Calmar Ratio (annualized return / maximum drawdown).
 */
function calmarRatio(returns, cumulativeReturns, periodsPerYear) {
  if (periodsPerYear <= 0) {
    throw new Error("periodsPerYear must be positive");
  }
  if (returns.length === 0) {
    throw new Error("returns cannot be empty");
  }
  const meanReturn = expectedReturn(returns);
  const annualizedReturn = Math.pow(1 + meanReturn, periodsPerYear) - 1;
  const maxDd = maximumDrawdown(cumulativeReturns);
  if (maxDd === 0) {
    throw new Error("maximum drawdown is zero, cannot compute Calmar Ratio");
  }
  return annualizedReturn / maxDd;
}

/**
 * Compute the Sortino Ratio (downside risk-adjusted performance metric).
 */
function sortinoRatio(returns, riskFreeRate = 0.0, periodsPerYear = null) {
  if (returns.length < 2) {
    throw new Error("returns must have at least 2 values to compute Sortino Ratio");
  }
  const excess = returns.map((ret) => ret - riskFreeRate);
  const meanExcess = expectedReturn(excess);
  const downsideReturns = excess.filter((ret) => ret < 0);
  if (downsideReturns.length === 0) {
    if (meanExcess > 0) {
      return Infinity;
    } else {
      throw new Error("no negative returns and mean excess return is non-positive");
    }
  }
  const downsideDeviation = volatility(downsideReturns, 1);
  if (downsideDeviation === 0) {
    throw new Error("downside deviation is zero, cannot compute Sortino Ratio");
  }
  if (periodsPerYear !== null && periodsPerYear !== undefined) {
    const meanExcessAnnual = meanExcess * periodsPerYear;
    const downsideDevAnnual = downsideDeviation * Math.sqrt(periodsPerYear);
    return meanExcessAnnual / downsideDevAnnual;
  }
  return meanExcess / downsideDeviation;
}

/**
 * Compute Alpha using CAPM (Capital Asset Pricing Model).
 */
function alpha(portfolioReturns, marketReturns, riskFreeRate = 0.0) {
  if (portfolioReturns.length === 0) {
    throw new Error("portfolioReturns cannot be empty");
  }
  if (portfolioReturns.length !== marketReturns.length) {
    throw new Error(
      `portfolioReturns and marketReturns must have the same length (got ${portfolioReturns.length} and ${marketReturns.length})`
    );
  }
  const betaVal = beta(portfolioReturns, marketReturns);
  const portfolioMean = expectedReturn(portfolioReturns);
  const marketMean = expectedReturn(marketReturns);
  return portfolioMean - (riskFreeRate + betaVal * (marketMean - riskFreeRate));
}

/**
 * Compute Beta (sensitivity to market returns).
 */
function beta(portfolioReturns, marketReturns) {
  if (portfolioReturns.length === 0) {
    throw new Error("portfolioReturns cannot be empty");
  }
  if (portfolioReturns.length !== marketReturns.length) {
    throw new Error(
      `portfolioReturns and marketReturns must have the same length (got ${portfolioReturns.length} and ${marketReturns.length})`
    );
  }
  if (portfolioReturns.length < 2) {
    throw new Error("must have at least 2 observations to compute beta");
  }
  const portfolioMean = expectedReturn(portfolioReturns);
  const marketMean = expectedReturn(marketReturns);
  let covariance = 0;
  for (let i = 0; i < portfolioReturns.length; i++) {
    covariance +=
      (portfolioReturns[i] - portfolioMean) * (marketReturns[i] - marketMean);
  }
  covariance /= portfolioReturns.length - 1;
  const marketVariance = volatility(marketReturns, 1) ** 2;
  if (marketVariance === 0) {
    throw new Error("market variance is zero, cannot compute beta");
  }
  return covariance / marketVariance;
}

/**
 * Compute Value at Risk (VaR).
 */
function valueAtRisk(returns, confidence = 0.95, method = "historical") {
  if (returns.length === 0) {
    throw new Error("returns cannot be empty");
  }
  if (confidence <= 0 || confidence >= 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  if (method !== "historical" && method !== "parametric") {
    throw new Error("method must be 'historical' or 'parametric'");
  }
  if (method === "historical") {
    const percentile = (1 - confidence) * 100;
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    const varValue = sorted[Math.max(0, index)];
    return -varValue;
  } else {
    const meanReturn = expectedReturn(returns);
    const vol = volatility(returns, 1);
    const zScore = normalQuantile(1 - confidence);
    const varValue = meanReturn + zScore * vol;
    return -varValue;
  }
}

/**
 * Approximate normal probability density function (PDF).
 */
function normalPDF(x) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Compute Conditional Value at Risk (CVaR) / Expected Shortfall.
 */
function conditionalValueAtRisk(
  returns,
  confidence = 0.95,
  method = "historical"
) {
  if (returns.length === 0) {
    throw new Error("returns cannot be empty");
  }
  if (confidence <= 0 || confidence >= 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  if (method !== "historical" && method !== "parametric") {
    throw new Error("method must be 'historical' or 'parametric'");
  }
  const varValue = -valueAtRisk(returns, confidence, method);
  if (method === "historical") {
    const tailReturns = returns.filter((r) => r <= varValue);
    if (tailReturns.length === 0) {
      return -varValue;
    }
    const cvar = expectedReturn(tailReturns);
    return -cvar;
  } else {
    const meanReturn = expectedReturn(returns);
    const vol = volatility(returns, 1);
    const zScore = normalQuantile(1 - confidence);
    const pdfValue = normalPDF(zScore);
    const cvar = meanReturn - (vol * pdfValue) / (1 - confidence);
    return -cvar;
  }
}

/**
 * Compute downside deviation (standard deviation of returns below a target).
 */
function downsideDeviation(returns, target = 0.0, ddof = 1) {
  if (returns.length < 2) {
    throw new Error("returns must have at least 2 values to compute downside deviation");
  }
  const downsideReturns = returns
    .filter((r) => r < target)
    .map((r) => r - target);
  if (downsideReturns.length === 0) {
    return 0.0;
  }
  return volatility(downsideReturns, ddof);
}

/**
 * Compute the Omega Ratio.
 */
function omegaRatio(returns, threshold = 0.0) {
  if (returns.length === 0) {
    throw new Error("returns cannot be empty");
  }
  const excess = returns.map((r) => r - threshold);
  const gains = excess
    .filter((e) => e > 0)
    .reduce((sum, e) => sum + e, 0);
  const losses = Math.abs(
    excess.filter((e) => e < 0).reduce((sum, e) => sum + e, 0)
  );
  if (losses === 0) {
    if (gains > 0) {
      return Infinity;
    } else {
      throw new Error("both gains and losses are zero, cannot compute Omega Ratio");
    }
  }
  return gains / losses;
}

/**
 * Calculate all performance metrics from returns data
 */
export function calculatePerformanceMetrics(
  returns,
  cumulativeReturns,
  periodsPerYear = 252,
  riskFreeRate = 0.02
) {
  if (!returns || returns.length === 0) {
    return {
      expectedReturn: null,
      sharpe: null,
      sortino: null,
      calmar: null,
      alpha: null,
    };
  }

  const periodRiskFreeRate = riskFreeRate / periodsPerYear;

  try {
    const meanReturn = expectedReturn(returns);
    const sharpe = sharpeRatio(returns, periodRiskFreeRate, periodsPerYear);
    const sortino = sortinoRatio(returns, periodRiskFreeRate, periodsPerYear);
    
    let calmar = null;
    if (cumulativeReturns && cumulativeReturns.length > 0) {
      try {
        calmar = calmarRatio(returns, cumulativeReturns, periodsPerYear);
      } catch (e) {
        calmar = null;
      }
    }

    return {
      expectedReturn: meanReturn,
      annualizedReturn: meanReturn * periodsPerYear,
      sharpe: sharpe,
      sortino: sortino,
      calmar: calmar,
      alpha: null, // Alpha requires benchmark returns, calculated separately
    };
  } catch (error) {
    console.error("Error calculating performance metrics:", error);
    return {
      expectedReturn: null,
      sharpe: null,
      sortino: null,
      calmar: null,
      alpha: null,
    };
  }
}

/**
 * Calculate all risk metrics from returns data
 */
export function calculateRiskMetrics(
  returns,
  confidence = 0.95,
  periodsPerYear = 252,
  riskFreeRate = 0.02
) {
  if (!returns || returns.length < 2) {
    return {
      volatility: null,
      annualizedVolatility: null,
      var95: null,
      cvar95: null,
      downsideDeviation: null,
      omega: null,
      sharpeConfidenceInterval: null,
    };
  }

  const periodRiskFreeRate = riskFreeRate / periodsPerYear;

  try {
    const vol = volatility(returns, 1);
    const annualizedVol = annualizedVolatility(returns, periodsPerYear, 1);
    const var95 = valueAtRisk(returns, confidence, "historical");
    const cvar95 = conditionalValueAtRisk(returns, confidence, "historical");
    const downsideDev = downsideDeviation(returns, 0.0, 1);
    
    let omega = null;
    try {
      omega = omegaRatio(returns, periodRiskFreeRate);
      if (omega === Infinity) {
        omega = null; // Store null instead of Infinity
      }
    } catch (e) {
      omega = null;
    }

    let sharpeCI = null;
    try {
      sharpeCI = sharpeRatioConfidenceInterval(returns, periodRiskFreeRate, confidence);
    } catch (e) {
      sharpeCI = null;
    }

    return {
      volatility: vol,
      annualizedVolatility: annualizedVol,
      var95: Math.abs(var95),
      cvar95: Math.abs(cvar95),
      downsideDeviation: downsideDev,
      omega: omega,
      sharpeConfidenceInterval: sharpeCI,
    };
  } catch (error) {
    console.error("Error calculating risk metrics:", error);
    return {
      volatility: null,
      annualizedVolatility: null,
      var95: null,
      cvar95: null,
      downsideDeviation: null,
      omega: null,
      sharpeConfidenceInterval: null,
    };
  }
}

/**
 * Calculate Alpha and Beta from portfolio and market returns
 */
export function calculateFactorMetrics(
  portfolioReturns,
  marketReturns,
  riskFreeRate = 0.02
) {
  if (!portfolioReturns || !marketReturns || portfolioReturns.length < 2) {
    return {
      alpha: null,
      beta: null,
    };
  }

  if (portfolioReturns.length !== marketReturns.length) {
    console.warn("Portfolio and market returns have different lengths");
    return {
      alpha: null,
      beta: null,
    };
  }

  try {
    const periodRiskFreeRate = riskFreeRate / 252; // Assuming daily returns
    const betaVal = beta(portfolioReturns, marketReturns);
    const alphaVal = alpha(portfolioReturns, marketReturns, periodRiskFreeRate);
    
    return {
      alpha: alphaVal,
      beta: betaVal,
    };
  } catch (error) {
    console.error("Error calculating factor metrics:", error);
    return {
      alpha: null,
      beta: null,
    };
  }
}

/**
 * Calculate maximum drawdown from cumulative returns
 */
export function calculateMaxDrawdown(cumulativeReturns) {
  if (!cumulativeReturns || cumulativeReturns.length === 0) {
    return null;
  }
  try {
    const maxDD = maximumDrawdown(cumulativeReturns);
    return -Math.abs(maxDD); // Return as negative
  } catch (error) {
    console.error("Error calculating max drawdown:", error);
    return null;
  }
}

// Export individual functions for direct use if needed
export {
  expectedReturn,
  volatility,
  annualizedVolatility,
  sharpeRatio,
  sharpeRatioConfidenceInterval,
  maximumDrawdown,
  calmarRatio,
  sortinoRatio,
  alpha,
  beta,
  valueAtRisk,
  conditionalValueAtRisk,
  downsideDeviation,
  omegaRatio,
};
