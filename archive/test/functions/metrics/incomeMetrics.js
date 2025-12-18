/**
 * Income Metrics
 *
 * Functions for calculating income metrics from activities:
 * - Dividend Income
 * - Interest Income
 * - Total Income
 * - Income Yields
 */

import { ensureDbConnection, getDb } from "../../utils/dbConnection.js";
import AccountServiceClientService from "../../../../quantDashBoard/server/src/clients/accountClient.js";
import { formatDateToYYYYMMDD } from "../../utils/dateHelpers.js";

/**
 * Calculates dividend income from activities
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {Date|string} opts.startDate - Start date for filtering (required)
 * @param {Date|string} opts.endDate - End date for filtering (required)
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<number>} Total dividend income amount
 */
export async function calculateDividendIncome(opts = {}) {
  const { userId, userSecret, accountId, startDate, endDate, databaseUrl } =
    opts;

  if (!userId || !userSecret || !accountId || !startDate || !endDate) {
    throw new Error(
      "userId, userSecret, accountId, startDate, and endDate are required"
    );
  }

  await ensureDbConnection(databaseUrl);

  try {
    const accountService = new AccountServiceClientService();

    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);

    const activities = await accountService.listAllAccountActivities(
      userId,
      userSecret,
      accountId,
      1000, // limit
      startDateStr,
      endDateStr,
      "DIVIDEND,STOCK_DIVIDEND"
    );

    let total = 0;
    for (const activity of activities || []) {
      const amount = parseFloat(activity.amount || 0);
      if (!isNaN(amount) && amount > 0) {
        total += amount;
      }
    }

    return total;
  } catch (error) {
    console.error("Error calculating dividend income:", error);
    throw error;
  }
}

/**
 * Calculates interest income from activities
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {Date|string} opts.startDate - Start date for filtering (required)
 * @param {Date|string} opts.endDate - End date for filtering (required)
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<number>} Total interest income amount
 */
export async function calculateInterestIncome(opts = {}) {
  const { userId, userSecret, accountId, startDate, endDate, databaseUrl } =
    opts;

  if (!userId || !userSecret || !accountId || !startDate || !endDate) {
    throw new Error(
      "userId, userSecret, accountId, startDate, and endDate are required"
    );
  }

  await ensureDbConnection(databaseUrl);

  try {
    const accountService = new AccountServiceClientService();

    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);

    const activities = await accountService.listAllAccountActivities(
      userId,
      userSecret,
      accountId,
      1000, // limit
      startDateStr,
      endDateStr,
      "INTEREST"
    );

    let total = 0;
    for (const activity of activities || []) {
      const amount = parseFloat(activity.amount || 0);
      if (!isNaN(amount) && amount > 0) {
        total += amount;
      }
    }

    return total;
  } catch (error) {
    console.error("Error calculating interest income:", error);
    throw error;
  }
}

/**
 * Calculates total income (dividends + interest)
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {Date|string} opts.startDate - Start date for filtering (required)
 * @param {Date|string} opts.endDate - End date for filtering (required)
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Object>} Object with { dividends, interest, total }
 */
export async function calculateTotalIncome(opts = {}) {
  const { userId, userSecret, accountId, startDate, endDate, databaseUrl } =
    opts;

  const [dividends, interest] = await Promise.all([
    calculateDividendIncome({ userId, userSecret, accountId, startDate, endDate, databaseUrl }),
    calculateInterestIncome({ userId, userSecret, accountId, startDate, endDate, databaseUrl }),
  ]);

  return {
    dividends,
    interest,
    total: dividends + interest,
  };
}

/**
 * Calculates income yields (dividend yield, interest yield, total yield)
 * Requires average portfolio value over the period
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {Date|string} opts.startDate - Start date for filtering (required)
 * @param {Date|string} opts.endDate - End date for filtering (required)
 * @param {number} opts.avgPortfolioValue - Average portfolio value over period (required)
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Object>} Object with yields
 */
export async function calculateIncomeYield(opts = {}) {
  const {
    userId,
    userSecret,
    accountId,
    startDate,
    endDate,
    avgPortfolioValue,
    databaseUrl,
  } = opts;

  if (!avgPortfolioValue || avgPortfolioValue <= 0) {
    throw new Error("avgPortfolioValue must be a positive number");
  }

  const income = await calculateTotalIncome({
    userId,
    userSecret,
    accountId,
    startDate,
    endDate,
    databaseUrl,
  });

  return {
    dividendYield: income.dividends / avgPortfolioValue,
    interestYield: income.interest / avgPortfolioValue,
    totalYield: income.total / avgPortfolioValue,
    dividends: income.dividends,
    interest: income.interest,
    total: income.total,
    avgPortfolioValue,
  };
}

/**
 * Calculates income metrics grouped by time period (monthly, quarterly, yearly)
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {Date|string} opts.startDate - Start date for filtering (required)
 * @param {Date|string} opts.endDate - End date for filtering (required)
 * @param {string} opts.groupBy - Grouping period: 'month' | 'quarter' | 'year' (default: 'month')
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Object>} Object with { byPeriod, totals }
 */
export async function calculateIncomeMetrics(opts = {}) {
  const {
    userId,
    userSecret,
    accountId,
    startDate,
    endDate,
    groupBy = "month",
    databaseUrl,
  } = opts;

  if (!userId || !userSecret || !accountId || !startDate || !endDate) {
    throw new Error(
      "userId, userSecret, accountId, startDate, and endDate are required"
    );
  }

  await ensureDbConnection(databaseUrl);

  try {
    const accountService = new AccountServiceClientService();

    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);

    // Fetch all income activities
    const dividendActivities = await accountService.listAllAccountActivities(
      userId,
      userSecret,
      accountId,
      1000,
      startDateStr,
      endDateStr,
      "DIVIDEND,STOCK_DIVIDEND"
    );

    const interestActivities = await accountService.listAllAccountActivities(
      userId,
      userSecret,
      accountId,
      1000,
      startDateStr,
      endDateStr,
      "INTEREST"
    );

    // Group by period
    const byPeriod = {};
    let totalDividends = 0;
    let totalInterest = 0;

    const getPeriodKey = (date) => {
      const d = new Date(date);
      switch (groupBy) {
        case "quarter":
          const quarter = Math.floor(d.getMonth() / 3) + 1;
          return `${d.getFullYear()}-Q${quarter}`;
        case "year":
          return `${d.getFullYear()}`;
        case "month":
        default:
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
    };

    // Process dividend activities
    for (const activity of dividendActivities || []) {
      const date = activity.trade_date || activity.date;
      if (!date) continue;

      const period = getPeriodKey(date);
      if (!byPeriod[period]) {
        byPeriod[period] = { period, dividends: 0, interest: 0, total: 0 };
      }

      const amount = parseFloat(activity.amount || 0);
      if (!isNaN(amount) && amount > 0) {
        byPeriod[period].dividends += amount;
        totalDividends += amount;
      }
    }

    // Process interest activities
    for (const activity of interestActivities || []) {
      const date = activity.trade_date || activity.date;
      if (!date) continue;

      const period = getPeriodKey(date);
      if (!byPeriod[period]) {
        byPeriod[period] = { period, dividends: 0, interest: 0, total: 0 };
      }

      const amount = parseFloat(activity.amount || 0);
      if (!isNaN(amount) && amount > 0) {
        byPeriod[period].interest += amount;
        totalInterest += amount;
      }
    }

    // Calculate totals for each period
    const periods = Object.values(byPeriod).map((p) => ({
      ...p,
      total: p.dividends + p.interest,
    }));

    // Sort by period
    periods.sort((a, b) => a.period.localeCompare(b.period));

    return {
      byPeriod: periods,
      totals: {
        dividends: totalDividends,
        interest: totalInterest,
        total: totalDividends + totalInterest,
      },
    };
  } catch (error) {
    console.error("Error calculating income metrics:", error);
    throw error;
  }
}

