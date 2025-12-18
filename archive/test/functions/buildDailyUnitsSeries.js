import {
  formatDateToYYYYMMDD,
  addDaysToDateString,
} from "../utils/dateHelpers.js";
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
 * Extracts symbol identifier from an activity
 * Handles both symbol objects and string symbols
 *
 * @param {Object} activity - Activity object
 * @returns {string|null} Symbol identifier or null
 */
function extractSymbol(activity) {
  // Check for option symbol first
  const optionSym = activity.option_symbol;
  if (optionSym && typeof optionSym === "object" && optionSym.ticker) {
    return String(optionSym.ticker).trim();
  }

  // Check for symbol object (from symbolObj or symbol field)
  const sym = activity.symbolObj || activity.symbol;
  if (sym && typeof sym === "object") {
    const ticker = sym.symbol || sym.raw_symbol;
    if (ticker) {
      return String(ticker).trim();
    }
  }

  // Check for string symbol
  if (activity.symbol && typeof activity.symbol === "string") {
    return activity.symbol.trim();
  }

  return null;
}

/**
 * Filters activities to only those with units and symbols
 * Keeps activities where symbol is not null and units is present/non-zero
 *
 * @param {Array} activities - Array of normalized activities
 * @returns {Array} Filtered activities with units
 */
function filterUnitRelatedActivities(activities) {
  return activities.filter((activity) => {
    // Must have a symbol
    const symbol = extractSymbol(activity);
    if (!symbol) {
      return false;
    }

    // Must have units that are present and non-zero
    const units = activity.units ?? activity.quantity ?? null;
    if (units === null || units === undefined || isNaN(units)) {
      return false;
    }

    // Filter out zero units (they don't affect positions)
    if (Math.abs(units) < 1e-10) {
      return false;
    }

    return true;
  });
}

/**
 * Filters out option exercise/assignment/expiration activities to prevent double counting.
 * When an option is exercised/assigned, SnapTrade creates:
 * 1. An OPTIONEXERCISE/OPTIONASSIGNMENT activity (closes the option position)
 * 2. A BUY/SELL activity for the underlying stock (the actual stock transaction)
 *
 * We should ONLY process the BUY/SELL activity (the actual stock transaction) and
 * IGNORE the option activity itself. The option activity is just metadata about
 * why the stock transaction happened, but the stock transaction is what actually
 * changes the position.
 *
 * @param {Array} activities - Array of normalized activities
 * @returns {Array} Filtered activities with option activities removed
 */
function filterOutOptionActivities(activities) {
  // Filter out option exercise/assignment/expiration activities
  // Keep BUY/SELL activities (even if they're from option exercises)
  const filtered = activities.filter((activity) => {
    const type = String(activity.type || "").toUpperCase();

    // Filter out option activities - we only care about the resulting BUY/SELL
    if (
      type === "OPTIONEXERCISE" ||
      type === "OPTIONASSIGNMENT" ||
      type === "OPTIONEXPIRATION"
    ) {
      const symbol = extractSymbol(activity);
      console.warn(
        `Ignoring ${type} activity for ${symbol || "N/A"} on ${
          activity.date_only || "unknown date"
        } - only processing resulting BUY/SELL transactions`
      );
      return false; // Exclude option activities
    }

    return true; // Keep all other activities (including BUY/SELL from option exercises)
  });

  const removed = activities.length - filtered.length;
  if (removed > 0) {
    console.log(
      `Removed ${removed} option exercise/assignment/expiration activity(ies) - only processing resulting BUY/SELL transactions`
    );
  }

  return filtered;
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
 * Computes unit adjustment for an activity based on its type
 * Returns the delta in units (positive = increase, negative = decrease)
 *
 * @param {Object} activity - Activity object
 * @returns {number} Unit adjustment (can be positive, negative, or zero)
 */
function computeUnitAdjustment(activity) {
  const type = String(activity.type || "").toUpperCase();
  const units = parseFloat(activity.units ?? activity.quantity ?? 0);

  if (isNaN(units) || Math.abs(units) < 1e-10) {
    return 0;
  }

  // A. Regular trades (buy/sell)
  if (type === "BUY") {
    return Math.abs(units); // Increase units
  }

  if (type === "SELL") {
    return -Math.abs(units); // Decrease units
  }

  // B. Dividend reinvestments / stock dividends
  if (type === "REI") {
    // Dividend reinvestment - units used to buy more shares
    return Math.abs(units);
  }

  if (type === "STOCK_DIVIDEND") {
    // Shares issued as dividend
    return Math.abs(units);
  }

  // Plain DIVIDEND (cash) doesn't change units - handled by filter

  // C. Transfers of assets
  if (type === "EXTERNAL_ASSET_TRANSFER_IN") {
    // Units entering this account
    return Math.abs(units);
  }

  if (type === "EXTERNAL_ASSET_TRANSFER_OUT") {
    // Units leaving this account
    return -Math.abs(units);
  }

  if (type === "TRANSFER") {
    // Generic transfer - direction may be ambiguous
    // For now, we'll check if there's a direction indicator
    // If not, we'll need to inspect the data structure
    // Default: assume positive (incoming) if units is positive
    // This may need adjustment based on actual SnapTrade data
    return units; // Use the sign as provided
  }

  // D. Corporate actions (splits)
  if (type === "SPLIT") {
    // Split could be encoded as net change in units
    // Or we might need to apply a ratio to existing units
    // For now, treat as net change if units is provided
    // If you have a split ratio, you'd multiply existing positions
    return units; // Use the sign as provided
  }

  // Option activities are now filtered out before reaching this function
  // (see filterOutOptionActivities), so this should never be reached.
  // But keep it as a safety fallback in case filtering is bypassed.
  if (
    type === "OPTIONASSIGNMENT" ||
    type === "OPTIONEXERCISE" ||
    type === "OPTIONEXPIRATION"
  ) {
    // Option activities should be filtered out, but if they reach here, ignore them
    // (return 0) since we only process the resulting BUY/SELL transactions
    console.warn(
      `Option activity ${type} reached computeUnitAdjustment - should have been filtered out. Ignoring.`
    );
    return 0;
  }

  if (type === "ADJUSTMENT") {
    return units;
  }
  console.warn(
    `Unknown activity type "${type}" with units ${units}. Applying units as-is.`
  );
  return units;
}

/**
 * Applies stock splits to positions for a given date
 *
 * @param {Object} params - Parameters object
 * @param {string} params.date - Date in YYYY-MM-DD format
 * @param {Object} params.positions - Current positions map { symbol: units }
 * @param {Map<string, Array>} params.splitsBySymbol - Map of symbol -> array of { exDate, factor }
 * @returns {Object} Updated positions map with splits applied
 */
function applyStockSplitsForDate({ date, positions, splitsBySymbol }) {
  const updatedPositions = { ...positions };

  for (const [symbol, units] of Object.entries(updatedPositions)) {
    const splits = splitsBySymbol.get(symbol);
    if (!splits || splits.length === 0) {
      continue;
    }

    for (const split of splits) {
      const splitDateKey = formatDateToYYYYMMDD(split.date);
      if (splitDateKey === date) {
        updatedPositions[symbol] = units * split.factor;
      }
    }
  }

  return updatedPositions;
}

/**
 * Loads stock splits from database for given symbols and date range
 *
 * @param {Array<string>} symbols - Array of symbols to load splits for
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} databaseUrl - Optional database URL
 * @returns {Promise<Map<string, Array>>} Map of symbol -> array of { date, factor, ratioFrom, ratioTo }
 */
async function loadStockSplits(symbols, startDate, endDate, databaseUrl) {
  if (!symbols || symbols.length === 0) {
    return new Map();
  }

  try {
    await ensureDbConnection(databaseUrl);
    const db = getDb();
    const corporateActionsCollection = db.collection("corporateactions");

    const splitsBySymbol = new Map();

    // Query for all symbols at once
    const corporateActions = await corporateActionsCollection
      .find({
        symbol: { $in: symbols },
      })
      .toArray();

    for (const action of corporateActions) {
      if (!action.splits || !Array.isArray(action.splits)) {
        continue;
      }

      // Filter splits to date range and sort by date
      const splitsInRange = action.splits
        .filter((split) => {
          const splitDate = new Date(split.date);
          return splitDate >= startDate && splitDate <= endDate;
        })
        .map((split) => ({
          date: new Date(split.date),
          factor: split.factor || 1.0,
          ratioFrom: split.ratioFrom || 1,
          ratioTo: split.ratioTo || 1,
          ratio: split.ratio || "1:1",
        }))
        .sort((a, b) => a.date - b.date);

      if (splitsInRange.length > 0) {
        splitsBySymbol.set(action.symbol, splitsInRange);
      }
    }

    return splitsBySymbol;
  } catch (error) {
    console.warn("Error loading stock splits from database:", error.message);
    // Return empty map on error - splits won't be applied but processing continues
    return new Map();
  }
}

/**
 * Builds a daily time series of units held per security for one account
 *
 * This function processes activities to create a time series of daily position snapshots.
 * It tracks units held for each security (stock, ETF, bond, crypto, etc.) across all dates.
 *
 * NOTE: Stock splits are NOT currently applied in the unified approach. The `applySplits`
 * parameter is accepted for backward compatibility but will log a warning if set to true.
 * To get split-adjusted positions, you would need to apply splits manually after calling
 * this function, or use the old implementation (which has been removed).
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.activities - Array of activity objects from SnapTrade API (for one account)
 * @param {Date|string} opts.endDate - End date for the series (defaults to last activity date or today)
 * @param {string} opts.databaseUrl - Optional database URL (currently unused, kept for backward compatibility)
 * @param {boolean} opts.applySplits - Whether to apply stock splits (default: true, but currently not implemented)
 * @returns {Promise<Array>} Array of objects with { date, positions } for each day
 *                  where positions is a map of symbol -> units
 */
export async function buildDailyUnitsSeries(opts = {}) {
  const { activities, endDate, databaseUrl, applySplits = true } = opts;

  if (!Array.isArray(activities) || activities.length === 0) {
    return [];
  }

  // Warn if splits are requested but not supported
  if (applySplits) {
    console.warn(
      "⚠️  Stock splits are not currently supported in the unified timeseries approach. " +
        "Positions will be returned without split adjustments. " +
        "This may cause incorrect portfolio calculations when stock splits occur."
    );
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

  // Step 1: Normalize activities (chronological, date-only)
  const normalized = normalizeAndSortActivities(deduplicatedActivities);

  if (normalized.length === 0) {
    return [];
  }

  // Step 2: Use unified approach to build units time series
  const minDate = getMinDate(normalized);
  if (!minDate) {
    throw new Error("Cannot determine start date from activities");
  }

  const today = endDate ? new Date(endDate) : new Date();
  today.setHours(0, 0, 0, 0);

  // Create date mapping and build cash/units time series
  const dateMapping = createDateMapping(minDate, today);
  buildCashTimeSeries(normalized, dateMapping);

  // Extract units from date mapping and convert to array format
  const sortedDates = Object.keys(dateMapping).sort();
  return sortedDates.map((dateStr) => ({
    date: dateStr,
    positions: dateMapping[dateStr]?.units || {},
  }));
}

/**
 * Builds daily units series for multiple accounts
 * Convenience function that processes activities for each account separately
 *
 * @param {Object} opts - Options object
 * @param {Object} opts.activitiesByAccount - Map of accountId → activities array
 * @param {Date|string} opts.endDate - End date for all series (optional)
 * @param {string} opts.databaseUrl - Optional database URL for loading stock splits
 * @param {boolean} opts.applySplits - Whether to apply stock splits (default: true)
 * @returns {Promise<Object>} Map of accountId → units series array
 */
export async function buildDailyUnitsSeriesForAccounts(opts = {}) {
  const {
    activitiesByAccount,
    endDate,
    databaseUrl,
    applySplits = true,
  } = opts;

  if (!activitiesByAccount || typeof activitiesByAccount !== "object") {
    throw new Error("activitiesByAccount must be an object/map");
  }

  const results = {};

  for (const [accountId, activities] of Object.entries(activitiesByAccount)) {
    try {
      const series = await buildDailyUnitsSeries({
        activities,
        endDate,
        databaseUrl,
        applySplits,
      });

      results[accountId] = series;
    } catch (error) {
      console.error(
        `Error building units series for account ${accountId}:`,
        error.message
      );
      results[accountId] = [];
    }
  }

  return results;
}
