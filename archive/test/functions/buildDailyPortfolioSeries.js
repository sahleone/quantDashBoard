import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";

/**
 * Generates array of dates between start and end (inclusive)
 *
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Date[]} Array of Date objects
 */
function generateDateRange(startDate, endDate) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Set to start of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Builds a daily portfolio value time series by combining cash and securities values
 *
 * This function takes cash series and securities value series and combines them into
 * a single aligned portfolio timeseries with:
 * - Cash balance per day
 * - Securities value per day
 * - Total portfolio value per day (cash + securities)
 * - Optional daily return calculation
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.cashSeries - Array of { date, cash, currency } from buildDailyCashSeries
 * @param {Array} opts.securitiesValueSeries - Array of { date, totalSecuritiesValue, values } from buildDailySecurityValuesSeries
 * @param {Date|string} opts.startDate - Optional start date (defaults to earliest date in either series)
 * @param {Date|string} opts.endDate - Optional end date (defaults to latest date in either series)
 * @param {boolean} opts.includeDailyReturn - Whether to compute daily returns (default: false)
 * @returns {Array} Array of objects with { date, cash, securitiesValue, portfolioValue, dailyReturn? }
 */
export function buildDailyPortfolioSeries(opts = {}) {
  const {
    cashSeries,
    securitiesValueSeries,
    startDate: providedStartDate,
    endDate: providedEndDate,
    includeDailyReturn = false,
  } = opts;

  if (
    (!Array.isArray(cashSeries) || cashSeries.length === 0) &&
    (!Array.isArray(securitiesValueSeries) ||
      securitiesValueSeries.length === 0)
  ) {
    return [];
  }

  // Step 1: Build quick lookup maps
  const cashByDate = new Map();
  if (Array.isArray(cashSeries) && cashSeries.length > 0) {
    for (const entry of cashSeries) {
      if (entry.date) {
        const dateKey = formatDateToYYYYMMDD(entry.date);
        if (dateKey) {
          cashByDate.set(dateKey, entry.cash || 0);
        }
      }
    }
  }

  const secValByDate = new Map();
  if (
    Array.isArray(securitiesValueSeries) &&
    securitiesValueSeries.length > 0
  ) {
    for (const entry of securitiesValueSeries) {
      if (entry.date) {
        const dateKey = formatDateToYYYYMMDD(entry.date);
        if (dateKey) {
          secValByDate.set(dateKey, entry.totalSecuritiesValue || 0);
        }
      }
    }
  }

  // Step 2: Determine overall date range
  let startDate = providedStartDate;
  let endDate = providedEndDate;

  if (!startDate || !endDate) {
    // Collect all dates from both series
    const allDates = new Set();

    if (Array.isArray(cashSeries) && cashSeries.length > 0) {
      for (const entry of cashSeries) {
        if (entry.date) {
          const dateKey = formatDateToYYYYMMDD(entry.date);
          if (dateKey) {
            allDates.add(dateKey);
          }
        }
      }
    }

    if (
      Array.isArray(securitiesValueSeries) &&
      securitiesValueSeries.length > 0
    ) {
      for (const entry of securitiesValueSeries) {
        if (entry.date) {
          const dateKey = formatDateToYYYYMMDD(entry.date);
          if (dateKey) {
            allDates.add(dateKey);
          }
        }
      }
    }

    if (allDates.size === 0) {
      return [];
    }

    const sortedDates = Array.from(allDates).sort();

    if (!startDate) {
      startDate = sortedDates[0];
    }
    if (!endDate) {
      endDate = sortedDates[sortedDates.length - 1];
    }
  }

  // Build full list of all calendar dates from startDate to endDate
  const allDates = generateDateRange(startDate, endDate);

  // Step 3: Initialize state
  let lastCash = 0;
  let lastSecVal = 0;
  let prevPortfolioValue = null;
  const portfolioSeries = [];

  // Step 4: Loop over each calendar date
  for (const date of allDates) {
    const dateKey = formatDateToYYYYMMDD(date);
    if (!dateKey) {
      continue;
    }

    // Update cash
    if (cashByDate.has(dateKey)) {
      lastCash = cashByDate.get(dateKey);
    }
    // Else: keep lastCash as previous day (carry forward)

    // Update securities value
    if (secValByDate.has(dateKey)) {
      lastSecVal = secValByDate.get(dateKey);
    }
    // Else: keep lastSecVal as previous day (carry forward)

    // Compute portfolio value
    const portfolioValue = lastCash + lastSecVal;

    // Optional: Compute simple daily return
    let dailyReturn = null;
    if (includeDailyReturn) {
      if (prevPortfolioValue !== null && prevPortfolioValue > 0) {
        dailyReturn = portfolioValue / prevPortfolioValue - 1;
      }
    }

    // Build row
    const row = {
      date: dateKey,
      cash: lastCash,
      securitiesValue: lastSecVal,
      portfolioValue,
    };

    if (includeDailyReturn) {
      row.dailyReturn = dailyReturn;
    }

    portfolioSeries.push(row);

    // Update for next iteration
    prevPortfolioValue = portfolioValue;
  }

  return portfolioSeries;
}

/**
 * Builds daily portfolio series for multiple accounts
 * Convenience function that processes cash and securities series for each account separately
 *
 * @param {Object} opts - Options object
 * @param {Object} opts.cashSeriesByAccount - Map of accountId -> cash series array
 * @param {Object} opts.securitiesValueSeriesByAccount - Map of accountId -> securities value series array
 * @param {Date|string} opts.startDate - Optional start date
 * @param {Date|string} opts.endDate - Optional end date
 * @param {boolean} opts.includeDailyReturn - Whether to compute daily returns (default: false)
 * @returns {Object} Map of accountId -> portfolio series array
 */
export function buildDailyPortfolioSeriesForAccounts(opts = {}) {
  const {
    cashSeriesByAccount,
    securitiesValueSeriesByAccount,
    startDate,
    endDate,
    includeDailyReturn,
  } = opts;

  if (
    (!cashSeriesByAccount ||
      typeof cashSeriesByAccount !== "object") &&
    (!securitiesValueSeriesByAccount ||
      typeof securitiesValueSeriesByAccount !== "object")
  ) {
    throw new Error(
      "Either cashSeriesByAccount or securitiesValueSeriesByAccount must be provided"
    );
  }

  const results = {};

  // Get all account IDs from both maps
  const allAccountIds = new Set();
  if (cashSeriesByAccount) {
    for (const accountId of Object.keys(cashSeriesByAccount)) {
      allAccountIds.add(accountId);
    }
  }
  if (securitiesValueSeriesByAccount) {
    for (const accountId of Object.keys(securitiesValueSeriesByAccount)) {
      allAccountIds.add(accountId);
    }
  }

  for (const accountId of allAccountIds) {
    try {
      const cashSeries = cashSeriesByAccount?.[accountId] || [];
      const securitiesValueSeries =
        securitiesValueSeriesByAccount?.[accountId] || [];

      const series = buildDailyPortfolioSeries({
        cashSeries,
        securitiesValueSeries,
        startDate,
        endDate,
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

