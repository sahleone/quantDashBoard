/**
 * Compute the expected return (mean return) from a return series.
 *
 * @param {number[]} returns - Series of periodic returns.
 * @returns {number} Expected return (mean): E[R] = (1/T) * Σ R_t
 * @throws {Error} If returns is empty.
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
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [ddof=1] - Delta degrees of freedom. Default is 1 for sample standard deviation.
 * @returns {number} Volatility (standard deviation): σ = sqrt((1/(T-1)) * Σ (R_t - R̄)²)
 * @throws {Error} If returns has less than 2 values.
 */
function volatility(returns, ddof = 1) {
  if (returns.length < 2) {
    throw new Error(
      "returns must have at least 2 values to compute volatility"
    );
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
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} periodsPerYear - Number of periods per year (e.g., 252 for daily, 12 for monthly).
 * @param {number} [ddof=1] - Delta degrees of freedom. Default is 1 for sample standard deviation.
 * @returns {number} Annualized volatility: σ_annual = σ_period * sqrt(n)
 * @throws {Error} If returns has less than 2 values or periodsPerYear is invalid.
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
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [riskFreeRate=0.0] - Risk-free rate. Should be in same period as returns.
 * @param {number} [periodsPerYear] - Number of periods per year. If provided, returns are annualized.
 * @returns {number} Sharpe Ratio: S = (R̄ - R_f) / σ
 * @throws {Error} If returns has less than 2 values or volatility is zero.
 */
function sharpeRatio(returns, riskFreeRate = 0.0, periodsPerYear = null) {
  if (returns.length < 2) {
    throw new Error(
      "returns must have at least 2 values to compute Sharpe Ratio"
    );
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
 * Compute the confidence interval for the Sharpe Ratio using the Jobson-Korkie approximation.
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [riskFreeRate=0.0] - Risk-free rate. Should be in same period as returns.
 * @param {number} [confidence=0.95] - Confidence level (default: 0.95 for 95% CI).
 * @returns {Object} Object with {sharpeRatio, lowerBound, upperBound}
 *                   Confidence interval: S ± z_{α/2} * sqrt((1 + 0.5*S²) / T)
 * @throws {Error} If returns has less than 2 values or confidence is not in (0, 1).
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
 * Approximate normal quantile (inverse CDF) using Beasley-Springer-Moro algorithm.
 * Simplified version for common confidence levels.
 *
 * @param {number} p - Probability (0 < p < 1).
 * @returns {number} z-score.
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
 * Compute the maximum drawdown from cumulative returns.
 *
 * @param {number[]} cumulativeReturns - Cumulative returns or cumulative portfolio values over time.
 * @returns {number} Maximum drawdown: Max DD = max_t ((Peak_t - Trough_t) / Peak_t)
 * @throws {Error} If cumulativeReturns is empty.
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
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number[]} cumulativeReturns - Cumulative returns or cumulative portfolio values over time.
 * @param {number} periodsPerYear - Number of periods per year (e.g., 252 for daily, 12 for monthly).
 * @returns {number} Calmar Ratio: Calmar = Annualized Return / Maximum Drawdown
 * @throws {Error} If inputs are invalid or max drawdown is zero.
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
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [riskFreeRate=0.0] - Risk-free rate. Should be in same period as returns.
 * @param {number} [periodsPerYear] - Number of periods per year. If provided, returns are annualized.
 * @returns {number} Sortino Ratio: Sortino = (R̄ - R_f) / σ_downside
 * @throws {Error} If returns has less than 2 values or downside deviation is zero.
 */
function sortinoRatio(returns, riskFreeRate = 0.0, periodsPerYear = null) {
  if (returns.length < 2) {
    throw new Error(
      "returns must have at least 2 values to compute Sortino Ratio"
    );
  }

  const excess = returns.map((ret) => ret - riskFreeRate);
  const meanExcess = expectedReturn(excess);
  const downsideReturns = excess.filter((ret) => ret < 0);

  if (downsideReturns.length === 0) {
    if (meanExcess > 0) {
      return Infinity;
    } else {
      throw new Error(
        "no negative returns and mean excess return is non-positive"
      );
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
 *
 * @param {number[]} portfolioReturns - Portfolio returns.
 * @param {number[]} marketReturns - Market/benchmark returns.
 * @param {number} [riskFreeRate=0.0] - Risk-free rate. Should be in same period as returns.
 * @returns {number} Alpha: α = R_p - [R_f + β * (R_m - R_f)]
 * @throws {Error} If inputs are invalid or have mismatched lengths.
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
 *
 * @param {number[]} portfolioReturns - Portfolio returns.
 * @param {number[]} marketReturns - Market/benchmark returns.
 * @returns {number} Beta: β = Cov(R_p, R_m) / Var(R_m)
 * @throws {Error} If inputs are invalid, have mismatched lengths, or market variance is zero.
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
 * Compute Value at Risk (VaR) - the maximum expected loss over a given period at a given confidence level.
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [confidence=0.95] - Confidence level (default: 0.95 for 95% VaR). Should be between 0 and 1.
 * @param {string} [method='historical'] - Method for computing VaR. Options: 'historical' (default) or 'parametric'.
 * @returns {number} Value at Risk (negative value representing potential loss).
 *                   For historical method: VaR = -percentile(returns, 1 - confidence)
 *                   For parametric method: VaR = -[mean(returns) + z_score * std(returns)]
 * @throws {Error} If returns is empty, confidence is not in (0, 1), or method is invalid.
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
 * Compute Conditional Value at Risk (CVaR) / Expected Shortfall.
 * The expected loss given that the loss exceeds VaR.
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [confidence=0.95] - Confidence level (default: 0.95 for 95% CVaR). Should be between 0 and 1.
 * @param {string} [method='historical'] - Method for computing CVaR. Options: 'historical' (default) or 'parametric'.
 * @returns {number} Conditional Value at Risk (negative value representing expected loss beyond VaR).
 *                   For historical method: CVaR = -mean(returns <= VaR_threshold)
 *                   For parametric method: CVaR uses analytical formula for normal distribution
 * @throws {Error} If returns is empty, confidence is not in (0, 1), or method is invalid.
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
 * Approximate normal probability density function (PDF).
 *
 * @param {number} x - Value at which to evaluate the PDF.
 * @returns {number} PDF value.
 */
function normalPDF(x) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Compute downside deviation (standard deviation of returns below a target).
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [target=0.0] - Target return (default: 0.0). Only returns below this target are considered.
 * @param {number} [ddof=1] - Delta degrees of freedom. Default is 1 for sample standard deviation.
 * @returns {number} Downside deviation: σ_downside = sqrt((1/(T-1)) * Σ min(R_t - target, 0)²)
 * @throws {Error} If returns has less than 2 values.
 */
function downsideDeviation(returns, target = 0.0, ddof = 1) {
  if (returns.length < 2) {
    throw new Error(
      "returns must have at least 2 values to compute downside deviation"
    );
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
 * Compute the Omega Ratio - a risk-adjusted performance metric that considers all moments of the return distribution.
 *
 * @param {number[]} returns - Series of periodic returns.
 * @param {number} [threshold=0.0] - Threshold return level (default: 0.0). Often set to risk-free rate or zero.
 * @returns {number} Omega Ratio: Ω = Σ max(R_t - threshold, 0) / |Σ min(R_t - threshold, 0)|
 *                   Higher values indicate better risk-adjusted performance.
 * @throws {Error} If returns is empty or the denominator is zero.
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
      throw new Error(
        "both gains and losses are zero, cannot compute Omega Ratio"
      );
    }
  }

  return gains / losses;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
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
}
