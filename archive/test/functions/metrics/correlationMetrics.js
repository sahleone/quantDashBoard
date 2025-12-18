/**
 * Diversification, Correlation & Cointegration Metrics
 *
 * Functions for calculating correlation and cointegration metrics:
 * - Correlation
 * - Cointegration (Advanced)
 */

/**
 * Calculates Pearson correlation coefficient between two return series
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.returnsX - First return series
 * @param {Array<number>} opts.returnsY - Second return series
 * @returns {Object} Object with { correlation, pValue }
 */
export function calculateCorrelation(opts = {}) {
  const { returnsX, returnsY } = opts;

  if (
    !returnsX ||
    !returnsY ||
    returnsX.length !== returnsY.length ||
    returnsX.length === 0
  ) {
    return { correlation: null, pValue: null };
  }

  // Align arrays (filter out null/undefined pairs)
  const pairs = [];
  for (let i = 0; i < returnsX.length; i++) {
    const x = returnsX[i];
    const y = returnsY[i];
    if (
      x !== null &&
      x !== undefined &&
      !isNaN(x) &&
      y !== null &&
      y !== undefined &&
      !isNaN(y)
    ) {
      pairs.push({ x, y });
    }
  }

  if (pairs.length < 2) {
    return { correlation: null, pValue: null };
  }

  const xMean = pairs.reduce((sum, p) => sum + p.x, 0) / pairs.length;
  const yMean = pairs.reduce((sum, p) => sum + p.y, 0) / pairs.length;

  // Calculate covariance
  const covariance =
    pairs.reduce((sum, p) => sum + (p.x - xMean) * (p.y - yMean), 0) /
    pairs.length;

  // Calculate standard deviations
  const xVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.x - xMean, 2), 0) /
    pairs.length;
  const yVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0) /
    pairs.length;

  const xStd = Math.sqrt(xVariance);
  const yStd = Math.sqrt(yVariance);

  if (xStd === 0 || yStd === 0) {
    return { correlation: null, pValue: null };
  }

  // Calculate correlation
  const correlation = covariance / (xStd * yStd);

  // Calculate p-value (simplified t-test)
  // For large samples, t = r * sqrt((n-2)/(1-r^2))
  const n = pairs.length;
  if (n < 3 || Math.abs(correlation) >= 1) {
    return { correlation, pValue: null };
  }

  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  // Simplified p-value approximation (two-tailed)
  // For production, use proper t-distribution lookup
  const pValue = Math.abs(t) > 2 ? 0.05 : null; // Simplified

  return { correlation, pValue };
}

/**
 * Calculates cointegration between two price series (Advanced)
 * Uses OLS regression and tests residuals for stationarity
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.priceSeries1 - First price series
 * @param {Array<number>} opts.priceSeries2 - Second price series
 * @param {Array<string>} opts.dates - Array of dates (optional)
 * @returns {Promise<Object>} Object with { isCointegrated, spread, zScore, alpha, beta }
 */
export async function calculateCointegration(opts = {}) {
  const { priceSeries1, priceSeries2, dates } = opts;

  if (
    !priceSeries1 ||
    !priceSeries2 ||
    priceSeries1.length !== priceSeries2.length ||
    priceSeries1.length < 2
  ) {
    return {
      isCointegrated: false,
      spread: [],
      zScore: [],
      alpha: null,
      beta: null,
    };
  }

  // Align arrays
  const pairs = [];
  for (let i = 0; i < priceSeries1.length; i++) {
    const p1 = priceSeries1[i];
    const p2 = priceSeries2[i];
    if (
      p1 !== null &&
      p1 !== undefined &&
      !isNaN(p1) &&
      p1 > 0 &&
      p2 !== null &&
      p2 !== undefined &&
      !isNaN(p2) &&
      p2 > 0
    ) {
      pairs.push({ p1, p2 });
    }
  }

  if (pairs.length < 2) {
    return {
      isCointegrated: false,
      spread: [],
      zScore: [],
      alpha: null,
      beta: null,
    };
  }

  // OLS regression: P1 = alpha + beta * P2 + epsilon
  const n = pairs.length;
  const p1Mean = pairs.reduce((sum, p) => sum + p.p1, 0) / n;
  const p2Mean = pairs.reduce((sum, p) => sum + p.p2, 0) / n;

  const numerator = pairs.reduce(
    (sum, p) => sum + (p.p1 - p1Mean) * (p.p2 - p2Mean),
    0
  );
  const denominator = pairs.reduce(
    (sum, p) => sum + Math.pow(p.p2 - p2Mean, 2),
    0
  );

  if (denominator === 0) {
    return {
      isCointegrated: false,
      spread: [],
      zScore: [],
      alpha: null,
      beta: null,
    };
  }

  const beta = numerator / denominator;
  const alpha = p1Mean - beta * p2Mean;

  // Calculate residuals (spread)
  const spread = pairs.map((p) => p.p1 - (alpha + beta * p.p2));

  // Calculate z-score of spread
  const spreadMean = spread.reduce((sum, s) => sum + s, 0) / spread.length;
  const spreadVariance =
    spread.reduce((sum, s) => sum + Math.pow(s - spreadMean, 2), 0) /
    spread.length;
  const spreadStd = Math.sqrt(spreadVariance);

  const zScore =
    spreadStd > 0 ? spread.map((s) => (s - spreadMean) / spreadStd) : [];

  // Simplified stationarity test: check if spread mean-reverts
  // For production, use ADF (Augmented Dickey-Fuller) test
  // Here we use a simple heuristic: low variance relative to mean suggests stationarity
  const isCointegrated =
    spreadStd > 0 && Math.abs(spreadMean) / spreadStd < 2; // Simplified test

  return {
    isCointegrated,
    spread,
    zScore,
    alpha,
    beta,
  };
}

