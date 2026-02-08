/**
 * Diversification Metrics
 *
 * Functions for calculating diversification and correlation metrics:
 * - Correlation
 * - Cointegration (advanced, optional)
 */

/**
 * Calculates correlation coefficient between portfolio and benchmark returns
 * @param {Array<number>} portfolioReturns - Array of portfolio returns
 * @param {Array<number>} benchmarkReturns - Array of benchmark returns
 * @returns {number|null} - Correlation coefficient (-1 to 1) or null if invalid
 */
export function calculateCorrelation(portfolioReturns, benchmarkReturns) {
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

  const pVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.portfolio - pMean, 2), 0) /
    (pairs.length - 1);
  const pStd = Math.sqrt(pVariance);

  const bVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.benchmark - bMean, 2), 0) /
    (pairs.length - 1);
  const bStd = Math.sqrt(bVariance);

  if (pStd === 0 || bStd === 0) {
    return null;
  }

  return covariance / (pStd * bStd);
}

/**
 * Calculates a simplified cointegration measure between two price series.
 * Uses correlation of returns as a proxy. For true cointegration testing,
 * statistical tests like ADF (Augmented Dickey-Fuller) are required.
 * @param {Array<number>} priceSeries1 - First price series
 * @param {Array<number>} priceSeries2 - Second price series
 * @returns {number|null} - Correlation coefficient or null if invalid input
 */
export function calculateCointegration(priceSeries1, priceSeries2) {
  if (
    !priceSeries1 ||
    !priceSeries2 ||
    priceSeries1.length !== priceSeries2.length ||
    priceSeries1.length === 0
  ) {
    return null;
  }

  const returns1 = [];
  const returns2 = [];

  for (let i = 1; i < priceSeries1.length; i++) {
    const prev1 = priceSeries1[i - 1];
    const curr1 = priceSeries1[i];
    const prev2 = priceSeries2[i - 1];
    const curr2 = priceSeries2[i];

    if (prev1 > 0 && curr1 > 0 && prev2 > 0 && curr2 > 0) {
      returns1.push((curr1 - prev1) / prev1);
      returns2.push((curr2 - prev2) / prev2);
    }
  }

  return calculateCorrelation(returns1, returns2);
}
