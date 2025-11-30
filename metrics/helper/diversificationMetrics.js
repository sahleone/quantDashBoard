/**
 * Diversification Metrics
 * 
 * Functions for calculating diversification and correlation metrics:
 * - Correlation
 * - Cointegration (advanced, optional)
 */

/**
 * Calculate correlation between portfolio returns and benchmark returns
 * Correlation = Cov(X, Y) / (std(X) * std(Y))
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

  // Calculate standard deviations
  const pVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.portfolio - pMean, 2), 0) /
    pairs.length;
  const pStd = Math.sqrt(pVariance);

  const bVariance =
    pairs.reduce((sum, p) => sum + Math.pow(p.benchmark - bMean, 2), 0) /
    pairs.length;
  const bStd = Math.sqrt(bVariance);

  if (pStd === 0 || bStd === 0) {
    return null;
  }

  return covariance / (pStd * bStd);
}

/**
 * Calculate cointegration between two price series
 * This is a simplified version - full cointegration testing requires
 * statistical tests like ADF (Augmented Dickey-Fuller) test.
 * 
 * For now, we'll return a placeholder that indicates if the series
 * appear to move together (correlation of price changes).
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

  // Calculate returns from prices
  const returns1 = [];
  const returns2 = [];

  for (let i = 1; i < priceSeries1.length; i++) {
    const prev1 = priceSeries1[i - 1];
    const curr1 = priceSeries1[i];
    const prev2 = priceSeries2[i - 1];
    const curr2 = priceSeries2[i];

    if (
      prev1 > 0 &&
      curr1 > 0 &&
      prev2 > 0 &&
      curr2 > 0
    ) {
      returns1.push((curr1 - prev1) / prev1);
      returns2.push((curr2 - prev2) / prev2);
    }
  }

  // Return correlation of returns as a proxy for cointegration
  // Note: This is not a true cointegration test, but gives an indication
  return calculateCorrelation(returns1, returns2);
}

