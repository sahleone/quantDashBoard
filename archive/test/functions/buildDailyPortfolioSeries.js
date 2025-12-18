
/**
 * Builds a daily portfolio value time series from unified date mapping
 *
 * This function takes a unified date mapping (from buildUnifiedTimeseries) and converts it
 * to an array format with:
 * - Cash balance per day
 * - Securities value per day
 * - Total portfolio value per day (cash + securities)
 * - Optional daily return calculation
 *
 * @param {Object} opts - Options object
 * @param {Object} opts.dateMapping - Unified date mapping {date: {cash, securitiesValue, portfolioValue}}
 * @param {boolean} [opts.includeDailyReturn=false] - Whether to compute daily returns
 * @returns {Array} Array of objects with { date, cash, securitiesValue, portfolioValue, dailyReturn? }
 */
export function buildDailyPortfolioSeries(opts = {}) {
  const { dateMapping, includeDailyReturn = false } = opts;

  if (!dateMapping || typeof dateMapping !== "object") {
    return [];
  }

  const sortedDates = Object.keys(dateMapping).sort();
  if (sortedDates.length === 0) {
    return [];
  }

  let prevPortfolioValue = null;
  const portfolioSeries = [];

  for (const dateStr of sortedDates) {
    const dayData = dateMapping[dateStr];
    const cash = dayData?.cash || 0;
    const securitiesValue = dayData?.securitiesValue || 0;
    const portfolioValue = dayData?.portfolioValue || cash + securitiesValue;

    // Optional: Compute simple daily return
    let dailyReturn = null;
    if (includeDailyReturn) {
      if (prevPortfolioValue !== null && prevPortfolioValue > 0) {
        dailyReturn = portfolioValue / prevPortfolioValue - 1;
      }
    }

    const row = {
      date: dateStr,
      cash,
      securitiesValue,
      portfolioValue,
    };

    if (includeDailyReturn) {
      row.dailyReturn = dailyReturn;
    }

    portfolioSeries.push(row);
    prevPortfolioValue = portfolioValue;
  }

  return portfolioSeries;
}

/**
 * Validates portfolio series for potential double counting issues
 * Logs warnings if suspicious patterns are detected
 *
 * @param {Array} portfolioSeries - Array of portfolio series entries
 */
function validatePortfolioSeries(portfolioSeries) {
  if (!Array.isArray(portfolioSeries) || portfolioSeries.length === 0) {
    return;
  }

  let prevCash = 0;
  let prevSecVal = 0;
  let prevPortfolioValue = null;

  for (let i = 0; i < portfolioSeries.length; i++) {
    const curr = portfolioSeries[i];
    const cash = curr.cash || 0;
    const secVal = curr.securitiesValue || 0;
    const portfolioValue = curr.portfolioValue || 0;

    // Check that portfolio value equals cash + securities
    const expectedPortfolioValue = cash + secVal;
    const diff = Math.abs(portfolioValue - expectedPortfolioValue);
    if (diff > 0.01) {
      console.warn(
        `[Portfolio Validation] ${curr.date}: Portfolio value mismatch. ` +
          `Expected: ${expectedPortfolioValue.toFixed(
            2
          )}, Got: ${portfolioValue.toFixed(2)}, Diff: ${diff.toFixed(2)}`
      );
    }

    // Check for suspiciously large changes that might indicate double counting
    if (prevPortfolioValue !== null) {
      const portfolioChange = portfolioValue - prevPortfolioValue;
      const cashChange = cash - prevCash;
      const secChange = secVal - prevSecVal;
      const expectedChange = cashChange + secChange;
      const changeDiff = Math.abs(portfolioChange - expectedChange);

      if (changeDiff > 0.01) {
        console.warn(
          `[Portfolio Validation] ${curr.date}: Portfolio change mismatch. ` +
            `Portfolio change: ${portfolioChange.toFixed(2)}, ` +
            `Cash change: ${cashChange.toFixed(2)}, ` +
            `Securities change: ${secChange.toFixed(2)}, ` +
            `Expected sum: ${expectedChange.toFixed(2)}, ` +
            `Diff: ${changeDiff.toFixed(2)}`
        );
      }

      // Check for unusually large jumps (might indicate double counting)
      const absChange = Math.abs(portfolioChange);
      const prevValue = Math.abs(prevPortfolioValue);
      if (prevValue > 0 && absChange / prevValue > 0.5) {
        console.warn(
          `[Portfolio Validation] ${curr.date}: Large portfolio value change detected. ` +
            `Change: ${portfolioChange.toFixed(2)} (${(
              (portfolioChange / prevValue) *
              100
            ).toFixed(2)}%), ` +
            `Previous: ${prevPortfolioValue.toFixed(
              2
            )}, Current: ${portfolioValue.toFixed(2)}`
        );
      }
    }

    prevCash = cash;
    prevSecVal = secVal;
    prevPortfolioValue = portfolioValue;
  }
}

/**
 * Builds daily portfolio series for multiple accounts from unified date mappings
 *
 * @param {Object} opts - Options object
 * @param {Object} opts.dateMappingsByAccount - Map of accountId -> dateMapping {date: {cash, securitiesValue, portfolioValue}}
 * @param {boolean} [opts.includeDailyReturn=false] - Whether to compute daily returns
 * @returns {Object} Map of accountId -> portfolio series array
 */
export function buildDailyPortfolioSeriesForAccounts(opts = {}) {
  const { dateMappingsByAccount, includeDailyReturn = false } = opts;

  if (!dateMappingsByAccount || typeof dateMappingsByAccount !== "object") {
    throw new Error("dateMappingsByAccount must be provided");
  }

  const results = {};

  for (const [accountId, dateMapping] of Object.entries(dateMappingsByAccount)) {
    try {
      const series = buildDailyPortfolioSeries({
        dateMapping,
        includeDailyReturn,
      });

      results[accountId] = series;
    } catch (error) {
      console.error(
        `Error building portfolio series for account ${accountId}:`,
        error.message
      );
      results[accountId] = [];
    }
  }

  return results;
}
