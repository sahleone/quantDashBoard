import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";
import { ensureDbConnection, getDb } from "../utils/dbConnection.js";
import {
  getMinDate,
  createDateMapping,
  buildCashTimeSeries,
} from "./buildUnifiedTimeseries.js";

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
 * Normalizes and sorts activities for processing
 * - Reverses the list (SnapTrade returns reverse chronological)
 * - Extracts date-only from trade_date
 * - Sorts by trade_date ascending
 *
 * @param {Array} activities - Array of activity objects from SnapTrade
 * @returns {Array} Normalized and sorted activities
 */
function normalizeAndSortActivities(activities) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return [];
  }

  // Reverse the list (SnapTrade returns latest → oldest)
  const reversed = [...activities].reverse();

  // Normalize dates and add date_only field
  const normalized = reversed.map((activity) => {
    const tradeDate = activity.trade_date || activity.date;
    const dateOnly = tradeDate ? formatDateToYYYYMMDD(tradeDate) : null;

    return {
      ...activity,
      date_only: dateOnly,
      // Preserve original trade_date for sorting
      _sortDate: tradeDate ? new Date(tradeDate) : null,
    };
  });

  // Sort by trade_date ascending (oldest → newest)
  normalized.sort((a, b) => {
    if (!a._sortDate && !b._sortDate) return 0;
    if (!a._sortDate) return 1;
    if (!b._sortDate) return -1;
    return a._sortDate - b._sortDate;
  });

  return normalized;
}

/**
 * Filters activities to only those in the target currency
 *
 * @param {Array} activities - Array of normalized activities
 * @param {string} targetCurrency - Currency code to filter by (e.g., "USD")
 * @returns {Array} Filtered activities
 */
function filterByCurrency(activities, targetCurrency) {
  if (!targetCurrency) {
    return activities;
  }

  return activities.filter((activity) => {
    // Handle different possible currency field structures
    const currencyCode =
      activity.currency?.code ||
      activity.currency ||
      activity.currencyObj?.code;

    return currencyCode === targetCurrency;
  });
}

/**
 * Groups activities by date
 *
 * @param {Array} activities - Array of normalized activities
 * @returns {Map<string, Array>} Map of date (YYYY-MM-DD) to activities array
 */
function groupActivitiesByDate(activities) {
  const grouped = new Map();

  for (const activity of activities) {
    const dateKey = activity.date_only;
    if (!dateKey) {
      continue; // Skip activities without valid dates
    }

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey).push(activity);
  }

  return grouped;
}

/**
 * Builds a daily cash series from SnapTrade activities for one account
 *
 * This function processes activities to create a time series of daily cash balances.
 * It follows the SnapTrade API design where:
 * - Activities are returned reverse chronological (latest → oldest)
 * - The `amount` field already has the correct sign (positive increases balance, negative decreases)
 * - We work at daily resolution, grouping activities by calendar date
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.activities - Array of activity objects from SnapTrade API
 * @param {string} opts.baseCurrency - Base currency code to track (e.g., "USD"). If not provided, uses first activity's currency
 * @param {Date|string} opts.endDate - End date for the series (defaults to last activity date or today)
 * @param {number} opts.initialCash - Starting cash balance (default: 0)
 * @returns {Promise<Array>} Array of objects with { date, cash } for each day
 */
export async function buildDailyCashSeries(opts = {}) {
  const { activities, baseCurrency, endDate, initialCash = 0 } = opts;

  if (!Array.isArray(activities) || activities.length === 0) {
    return [];
  }

  // Step 0: Deduplicate activities by activityId to prevent double counting
  const seenActivityIds = new Set();
  const deduplicatedActivities = activities.filter((activity) => {
    const activityId = activity.activityId || activity.id;
    if (!activityId) {
      // Keep activities without IDs (shouldn't happen, but handle gracefully)
      return true;
    }
    if (seenActivityIds.has(activityId)) {
      console.warn(
        `Duplicate activity detected and removed: ${activityId} (type: ${activity.type})`
      );
      return false;
    }
    seenActivityIds.add(activityId);
    return true;
  });

  if (deduplicatedActivities.length !== activities.length) {
    console.log(
      `Removed ${
        activities.length - deduplicatedActivities.length
      } duplicate activities`
    );
  }

  // Step 1: Normalize and sort activities (oldest → newest)
  const normalized = normalizeAndSortActivities(deduplicatedActivities);

  if (normalized.length === 0) {
    return [];
  }

  // Step 2: Determine target currency
  let targetCurrency = baseCurrency;
  if (!targetCurrency) {
    // Use the first activity's currency as default
    const firstActivity = normalized[0];
    targetCurrency =
      firstActivity.currency?.code ||
      firstActivity.currency ||
      firstActivity.currencyObj?.code ||
      "USD";
  }

  // Step 2: Filter to target currency only
  const filtered = filterByCurrency(normalized, targetCurrency);

  if (filtered.length === 0) {
    console.warn(
      `No activities found in currency ${targetCurrency}. Returning empty series.`
    );
    return [];
  }

  // Step 3: Use unified approach to build cash time series
  const minDate = getMinDate(filtered);
  if (!minDate) {
    throw new Error("Cannot determine start date from activities");
  }

  const today = endDate ? new Date(endDate) : new Date();
  today.setHours(0, 0, 0, 0);

  // Create date mapping and build cash time series
  const dateMapping = createDateMapping(minDate, today);
  buildCashTimeSeries(filtered, dateMapping);

  // Convert date mapping to array format for backward compatibility
  // Apply initialCash offset to all cash values
  const sortedDates = Object.keys(dateMapping).sort();
  return sortedDates.map((dateStr) => ({
    date: dateStr,
    cash: (dateMapping[dateStr]?.cash || 0) + initialCash,
    currency: targetCurrency,
  }));
}

/**
 * Builds daily cash series for multiple accounts
 * Convenience function that processes activities for each account separately
 *
 * @param {Object} opts - Options object
 * @param {Object} opts.activitiesByAccount - Map of accountId → activities array
 * @param {Object} opts.baseCurrencyByAccount - Map of accountId → currency code (optional)
 * @param {Date|string} opts.endDate - End date for all series (optional)
 * @param {Object} opts.initialCashByAccount - Map of accountId → initial cash (optional)
 * @returns {Promise<Object>} Map of accountId → cash series array
 */
export async function buildDailyCashSeriesForAccounts(opts = {}) {
  const {
    activitiesByAccount,
    baseCurrencyByAccount = {},
    endDate,
    initialCashByAccount = {},
  } = opts;

  if (!activitiesByAccount || typeof activitiesByAccount !== "object") {
    throw new Error("activitiesByAccount must be an object/map");
  }

  const results = {};

  for (const [accountId, activities] of Object.entries(activitiesByAccount)) {
    try {
      const series = await buildDailyCashSeries({
        activities,
        baseCurrency: baseCurrencyByAccount[accountId],
        endDate,
        initialCash: initialCashByAccount[accountId] || 0,
      });

      results[accountId] = series;
    } catch (error) {
      console.error(
        `Error building cash series for account ${accountId}:`,
        error.message
      );
      results[accountId] = [];
    }
  }

  return results;
}

/**
 * Stores cash series in PortfolioTimeseries collection
 * Updates or creates records with cashValue for each date
 *
 * @param {Object} opts - Options object
 * @param {string} opts.accountId - Account ID
 * @param {string} opts.userId - User ID (will be fetched from account if not provided)
 * @param {Array} opts.cashSeries - Array of { date, cash, currency } objects
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Object>} Summary of stored records
 */
export async function storeCashSeries(opts = {}) {
  const { accountId, userId: providedUserId, cashSeries, databaseUrl } = opts;

  if (!accountId) {
    throw new Error("accountId is required");
  }

  if (!Array.isArray(cashSeries) || cashSeries.length === 0) {
    return {
      stored: 0,
      message: "No cash series data to store",
    };
  }

  await ensureDbConnection(databaseUrl);
  const db = getDb();

  // Get userId from account if not provided
  let userId = providedUserId;
  if (!userId) {
    const accountsCollection = db.collection("snaptradeaccounts");
    const account = await accountsCollection.findOne({ accountId });
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    userId = account.userId;
    if (!userId) {
      throw new Error(`No userId found for account: ${accountId}`);
    }
  }

  const portfolioCollection = db.collection("portfoliotimeseries");

  // Prepare bulk write operations
  const ops = cashSeries.map((entry) => {
    const date = new Date(entry.date);
    date.setHours(0, 0, 0, 0);

    return {
      updateOne: {
        filter: {
          userId: userId,
          accountId: accountId,
          date: date,
        },
        update: {
          $set: {
            userId: userId,
            accountId: accountId,
            date: date,
            cashValue: entry.cash,
            // If record doesn't exist, set defaults for other required fields
            $setOnInsert: {
              stockValue: 0,
              totalValue: entry.cash,
              depositWithdrawal: 0,
              externalFlowCumulative: 0,
              createdAt: new Date(),
            },
          },
        },
        upsert: true,
      },
    };
  });

  // Execute bulk write
  if (ops.length > 0) {
    const result = await portfolioCollection.bulkWrite(ops, { ordered: false });
    const stored = result.upsertedCount + result.modifiedCount;

    return {
      stored,
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      accountId,
      userId,
      dateRange: {
        startDate: cashSeries[0]?.date,
        endDate: cashSeries[cashSeries.length - 1]?.date,
      },
    };
  }

  return {
    stored: 0,
    message: "No operations to execute",
  };
}
