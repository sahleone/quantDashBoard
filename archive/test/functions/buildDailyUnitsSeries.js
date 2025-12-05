import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";
import { ensureDbConnection, getDb } from "../utils/dbConnection.js";

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

  if (
    type === "OPTIONASSIGNMENT" ||
    type === "OPTIONEXERCISE" ||
    type === "OPTIONEXPIRATION"
  ) {
    return -Math.abs(units);
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
    const corporateActions = await corporateActionsCollection.find({
      symbol: { $in: symbols },
    }).toArray();

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
 * Stock splits are automatically applied when they occur.
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.activities - Array of activity objects from SnapTrade API (for one account)
 * @param {Date|string} opts.endDate - End date for the series (defaults to last activity date or today)
 * @param {string} opts.databaseUrl - Optional database URL for loading stock splits
 * @param {boolean} opts.applySplits - Whether to apply stock splits (default: true)
 * @returns {Promise<Array>} Array of objects with { date, positions } for each day
 *                  where positions is a map of symbol -> units
 */
export async function buildDailyUnitsSeries(opts = {}) {
  const { activities, endDate, databaseUrl, applySplits = true } = opts;

  if (!Array.isArray(activities) || activities.length === 0) {
    return [];
  }

  // Step 1: Normalize activities (chronological, date-only)
  const normalized = normalizeAndSortActivities(activities);

  if (normalized.length === 0) {
    return [];
  }

  // Step 2: Filter to unit-related activities
  const unitActivities = filterUnitRelatedActivities(normalized);

  if (unitActivities.length === 0) {
    console.warn(
      "No unit-related activities found. Returning empty series."
    );
    return [];
  }

  // Step 3: Determine the date range
  const firstActivity = unitActivities[0];
  const lastActivity = unitActivities[unitActivities.length - 1];

  const startDate = firstActivity.date_only;
  if (!startDate) {
    throw new Error("Cannot determine start date from activities");
  }

  const lastActivityDate = lastActivity.date_only;
  const endDateStr = endDate
    ? formatDateToYYYYMMDD(endDate)
    : lastActivityDate || formatDateToYYYYMMDD(new Date());

  // Build all calendar dates
  const allDates = generateDateRange(startDate, endDateStr);

  // Step 4: Group unit activities by date
  const activitiesByDate = groupActivitiesByDate(unitActivities);

  // Step 4.5: Load stock splits if enabled
  let splitsBySymbol = new Map();
  if (applySplits) {
    // Collect all unique symbols from activities
    const allSymbols = new Set();
    unitActivities.forEach((activity) => {
      const sym = extractSymbol(activity);
      if (sym) {
        allSymbols.add(sym);
      }
    });

    if (allSymbols.size > 0) {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDateStr);
      splitsBySymbol = await loadStockSplits(
        Array.from(allSymbols),
        startDateObj,
        endDateObj,
        databaseUrl
      );
    }
  }

  // Step 5: Initialize position state
  let positions = {}; // security -> units held
  const dates = [];
  const positionsSnapshots = [];

  // Step 6: Loop through each date and update positions
  for (const date of allDates) {
    const dateKey = formatDateToYYYYMMDD(date);

    // 6.1: Start-of-day positions (copy from yesterday)
    let positionsToday = { ...positions };

    // 6.1.5: Apply stock splits at the start of the day (before processing activities)
    if (applySplits && splitsBySymbol.size > 0) {
      positionsToday = applyStockSplitsForDate({
        date: dateKey,
        positions: positionsToday,
        splitsBySymbol,
      });
    }

    // 6.2: Get today's unit activities
    const todayActivities = activitiesByDate.get(dateKey) || [];

    // 6.3: For each activity, adjust units
    for (const activity of todayActivities) {
      const sym = extractSymbol(activity);
      if (!sym) {
        continue; // Shouldn't happen due to filter, but safety check
      }

      // Ensure we have a starting value
      if (!(sym in positionsToday)) {
        positionsToday[sym] = 0;
      }

      // Compute unit adjustment based on activity type
      const adjustment = computeUnitAdjustment(activity);
      positionsToday[sym] += adjustment;

      // Note: Negative positions are valid when units are sold (per SnapTrade docs)
      // We allow negative positions to represent short positions or overselling scenarios
    }

    // 6.4: End-of-day snapshot and roll forward
    // Remove symbols with zero (or near-zero) units to keep snapshots clean
    const cleanPositions = {};
    for (const [sym, units] of Object.entries(positionsToday)) {
      if (Math.abs(units) >= 1e-10) {
        cleanPositions[sym] = units;
      }
    }

    // Update positions for next day
    positions = cleanPositions;

    // Store snapshot
    dates.push(dateKey);
    positionsSnapshots.push({ ...cleanPositions });
  }

  // Step 7: Build the final result
  return dates.map((date, index) => ({
    date,
    positions: positionsSnapshots[index],
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
  const { activitiesByAccount, endDate, databaseUrl, applySplits = true } = opts;

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

