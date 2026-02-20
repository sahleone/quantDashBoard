/**
 * updatePortfolioTimeseries.js
 *
 * Builds portfolio valuation timeseries from positions, prices, and cash flows.
 * Implements the logic from returnsTest/activities.py build_portfolio_timeseries().
 *
 * External flows (cashflows that split TWR periods):
 *  - CONTRIBUTION, DEPOSIT, WITHDRAWAL: External deposits/withdrawals
 *  - DIVIDEND: Dividends are treated as cashflows
 *  - BUY/SELL with option_symbol: Option transactions are treated as cashflows
 *  Note: Regular stock BUY/SELL (non-options) are NOT external flows
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's accounts
 *  - accountId: optional; when set only process that specific account
 *  - fullSync: boolean; if true, process all historical data; if false, only process from last PortfolioTimeseries date (default: false)
 */

import mongoose from "mongoose";
import PortfolioTimeseries from "../../models/PortfolioTimeseries.js";
import EquitiesWeightTimeseries from "../../models/EquitiesWeightTimeseries.js";
import PriceHistory from "../../models/PriceHistory.js";
import AccountActivities from "../../models/AccountActivities.js";
import { isCryptoSymbol } from "../../utils/yahooFinanceClient.js";

// isCryptoSymbol imported from yahooFinanceClient (single source of truth)

/**
 * Normalize crypto symbol for price lookup (e.g., ETH -> ETH-USD)
 */
function normalizeCryptoSymbol(symbol) {
  if (isCryptoSymbol(symbol)) {
    return `${symbol.replace(/\s+/g, "").toUpperCase()}-USD`;
  }
  return symbol;
}

/**
 * Build units tracking from activities (like attempt.js)
 * Tracks units per symbol per day by processing BUY, SELL, and REI activities
 * @param {Array} activities - Array of activity objects
 * @param {Array} allDates - Array of date strings in YYYY-MM-DD format
 * @returns {Map} - Map of date -> {symbol: units}
 */
function buildUnitsFromActivities(activities, allDates) {
  const UNITS_ACTIVITY_TYPES = new Set([
    "BUY",
    "SELL",
    "REI",
    "OPTIONASSIGNMENT",
    "OPTIONEXERCISE",
    "OPTIONEXPIRATION",
  ]);

  // Group activities by date
  const activitiesByDate = new Map();
  activities.forEach((activity) => {
    const dateValue = activity.trade_date || activity.date;
    if (!dateValue) return;

    let dateStr;
    if (dateValue instanceof Date) {
      dateStr = dateValue.toISOString().split("T")[0];
    } else {
      const dateObj = new Date(dateValue);
      dateStr = dateObj.toISOString().split("T")[0];
    }

    if (!activitiesByDate.has(dateStr)) {
      activitiesByDate.set(dateStr, []);
    }
    activitiesByDate.get(dateStr).push(activity);
  });

  // Build units tracking day by day
  const unitsByDate = new Map();
  const units = {}; // Track units per symbol: {SYMBOL: quantity}

  for (const dateStr of allDates.sort()) {
    const dayActivities = activitiesByDate.get(dateStr) || [];

    // Process units changes
    dayActivities.forEach((activity) => {
      const type = String(activity.type || "").toUpperCase();
      if (UNITS_ACTIVITY_TYPES.has(type)) {
        const symbol = activity.symbol || activity.symbolObj?.symbol || null;
        if (!symbol) return;

        const quantity = parseFloat(activity.quantity || activity.units || 0);
        if (isNaN(quantity)) return;

        // Initialize symbol if not present
        if (!units[symbol]) {
          units[symbol] = 0;
        }

        // Update units based on activity type
        if (type === "BUY" || type === "REI") {
          // BUY and REI add units
          units[symbol] += Math.abs(quantity);
        } else if (type === "SELL") {
          // SELL subtracts units
          units[symbol] -= Math.abs(quantity);
        }
      }
    });

    // Create a snapshot of current units state for this date
    unitsByDate.set(dateStr, { ...units });
  }

  return unitsByDate;
}

/**
 * Calculate stock value for a date from units tracking and prices
 * Uses units built from activities (like attempt.js approach)
 */
async function calculateStockValueFromUnits(units, date, db) {
  const priceHistoryCollection = db.collection("pricehistories");

  if (!units || Object.keys(units).length === 0) {
    return { stockValue: 0, positions: [] };
  }

  const symbols = Object.keys(units).filter((s) => units[s] !== 0);

  if (symbols.length === 0) {
    return { stockValue: 0, positions: [] };
  }

  // Build list of symbols to query, including normalized crypto versions
  const symbolsToQuery = new Set(symbols);
  for (const symbol of symbols) {
    if (isCryptoSymbol(symbol)) {
      symbolsToQuery.add(normalizeCryptoSymbol(symbol));
    }
  }

  // Normalize date for price query (use end of day to include prices for the query date)
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  const priceQueryDate = new Date(normalizedDate);
  priceQueryDate.setHours(23, 59, 59, 999);

  // Use aggregation to get latest price per symbol more efficiently
  const prices = await priceHistoryCollection
    .aggregate([
      {
        $match: {
          symbol: { $in: Array.from(symbolsToQuery) },
          date: { $lte: priceQueryDate },
        },
      },
      {
        $sort: { symbol: 1, date: -1 },
      },
      {
        $group: {
          _id: "$symbol",
          close: { $first: "$close" },
          date: { $first: "$date" },
        },
      },
    ])
    .toArray();

  const pricesBySymbol = new Map();
  for (const price of prices) {
    pricesBySymbol.set(price._id, price.close || 0);
  }

  let totalStockValue = 0;
  const positionDetails = [];

  for (const symbol of symbols) {
    const symbolUnits = units[symbol] || 0;
    if (symbolUnits === 0) continue;

    // Try original symbol first, then normalized crypto version
    let price = pricesBySymbol.get(symbol) || 0;
    if (price === 0 && isCryptoSymbol(symbol)) {
      const normalizedSymbol = normalizeCryptoSymbol(symbol);
      price = pricesBySymbol.get(normalizedSymbol) || 0;
    }

    const value = symbolUnits * price;
    totalStockValue += value;

    positionDetails.push({
      symbol: symbol,
      units: symbolUnits,
      price: price,
      value: value,
    });
  }

  return { stockValue: totalStockValue, positions: positionDetails };
}

/**
 * Build cash flow series from activities
 * Processes activities in chronological order, day by day, maintaining running cash balance
 *
 * Algorithm:
 * 1. Sort activities by trade_date (oldest → newest), and within same date by time/_id
 * 2. Build date range from earliest activity to end date
 * 3. Initialize cash = 0
 * 4. For each date, process activities in order, updating cash balance
 *
 * External flows (cashflows that split TWR periods):
 *  - CONTRIBUTION, DEPOSIT, WITHDRAWAL: External deposits/withdrawals
 *  - DIVIDEND: Dividends are treated as cashflows
 *  - BUY/SELL with option_symbol: Option transactions are treated as cashflows
 *
 * @param {string} accountId - Account ID
 * @param {Object} db - MongoDB database connection
 * @param {Date} endDate - End date for calculations
 * @param {Array} activities - Optional: pre-fetched activities array. If not provided, will fetch from database.
 * @returns {Object} Cash flow data with cashValue, cashFlowDay, extFlowDay, extFlowCum maps
 */
async function buildCashAndFlows(
  accountId,
  db,
  endDate = null,
  activities = null
) {
  // If activities not provided, fetch them from database
  if (!activities) {
    const activitiesCollection = db.collection("snaptradeaccountactivities");
    // Step 1: Sort activities by trade_date (oldest → newest), and within same date by _id (which contains timestamp)
    activities = await activitiesCollection
      .find({ accountId: accountId })
      .sort({ trade_date: 1, date: 1, _id: 1 })
      .toArray();
  }

  if (activities.length === 0) {
    return {
      cashValue: new Map(),
      cashFlowDay: new Map(),
      extFlowDay: new Map(),
      extFlowCum: new Map(),
    };
  }

  // Step 2: Build date range - find earliest trade date
  let earliestDate = null;
  const activitiesByDate = new Map();

  for (const activity of activities) {
    const dateRaw = activity.trade_date || activity.date;
    if (!dateRaw) continue;

    const date = new Date(dateRaw);
    date.setHours(0, 0, 0, 0);
    const dateKey = date.toISOString().split("T")[0];

    if (!earliestDate || dateKey < earliestDate) {
      earliestDate = dateKey;
    }

    if (!activitiesByDate.has(dateKey)) {
      activitiesByDate.set(dateKey, []);
    }
    activitiesByDate.get(dateKey).push(activity);
  }

  if (!earliestDate) {
    return {
      cashValue: new Map(),
      cashFlowDay: new Map(),
      extFlowDay: new Map(),
      extFlowCum: new Map(),
    };
  }

  // Build list of all dates from earliest to end date
  const startDate = new Date(earliestDate);
  const finalEndDate = endDate || new Date();
  finalEndDate.setHours(23, 59, 59, 999);

  const allDates = [];
  const current = new Date(startDate);
  while (current <= finalEndDate) {
    allDates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  // Step 3: Initialize portfolio state
  let cash = 0;
  const cashValue = new Map();
  const cashFlowDay = new Map();
  const extFlowDay = new Map();
  const extFlowCum = new Map();

  // External flow types (for returns calculation)
  // These are cashflows that split TWR periods:
  //   - CONTRIBUTION, DEPOSIT, WITHDRAWAL: External deposits/withdrawals
  //   - DIVIDEND: Dividends are treated as cashflows to split TWR periods
  //   - BUY/SELL with option_symbol: Option transactions are treated as cashflows
  // Note: FEE and INTEREST are NOT external flows (they're investment costs/returns)
  //   - FEE: Money you owe to broker (margin interest, account fees) - negative amount
  //   - INTEREST: Money broker owes you (interest on cash) - positive amount
  const EXT_TYPES = new Set(["CONTRIBUTION", "DEPOSIT", "WITHDRAWAL", "DIVIDEND"]);

  let runningExtFlow = 0;
  let minCashValue = 0;
  let firstActivityDate = null;

  // Step 4: For each date, apply activities in order
  for (const dateKey of allDates) {
    const dayStartCash = cash;
    let dayCashFlow = 0;
    let dayExtFlow = 0;

    // Get activities for this date (already sorted by _id which contains timestamp)
    const dayActivities = activitiesByDate.get(dateKey) || [];

    // Process each activity for this day in order
    for (const activity of dayActivities) {
      const type = String(activity.type || "").toUpperCase();
      const amount = parseFloat(activity.amount || 0);
      if (isNaN(amount)) continue;

      // Update cash balance (ALL activities affect cash)
      // Note: SnapTrade should provide amounts with correct signs:
      //   - FEE: negative (money you owe to broker)
      //   - INTEREST: positive (money broker owes you)
      //   - BUY: negative (cash out)
      //   - SELL: positive (cash in)
      cash += amount;
      dayCashFlow += amount;

      // Track external flows for returns calculation (these split TWR periods)
      // External flows include:
      //   - CONTRIBUTION, DEPOSIT, WITHDRAWAL: External deposits/withdrawals
      //   - DIVIDEND: Dividends are treated as cashflows
      //   - BUY/SELL with option_symbol: Option transactions are treated as cashflows
      // Note: Regular stock BUY/SELL (non-options) are NOT external flows
      // Note: FEE and INTEREST are NOT external flows (they're investment costs/returns)
      
      // Check if this is an option transaction (BUY/SELL with option_symbol)
      const isOptionTransaction = 
        (type === "BUY" || type === "SELL") &&
        activity.option_symbol !== null &&
        activity.option_symbol !== undefined;

      // Determine if this activity is an external flow
      const isExternalFlow = EXT_TYPES.has(type) || isOptionTransaction;

      if (isExternalFlow) {
        let extAmount = amount;
        if (type === "WITHDRAWAL") {
          extAmount = -Math.abs(amount);
        } else if (type === "CONTRIBUTION" || type === "DEPOSIT") {
          extAmount = Math.abs(amount);
        }
        // For DIVIDEND and option transactions, use the amount as-is (already has correct sign)

        dayExtFlow += extAmount;
        runningExtFlow += extAmount;
      }

      // Track first activity for warning
      if (firstActivityDate === null) {
        firstActivityDate = dateKey;
      }
    }

    // Record end-of-day values
    // Always record cash value (forward-filled if no activities)
    cashValue.set(dateKey, cash);
    extFlowCum.set(dateKey, runningExtFlow);

    // Only record cash flow and external flow if there were activities today
    if (dayActivities.length > 0) {
      if (dayCashFlow !== 0) {
        cashFlowDay.set(dateKey, dayCashFlow);
      }
      if (dayExtFlow !== 0) {
        extFlowDay.set(dateKey, dayExtFlow);
      }
    }

    // Track minimum cash value
    if (cash < minCashValue) {
      minCashValue = cash;
    }
  }

  // Warn if cash value goes negative (likely missing initial deposit or wrong activity signs)
  if (minCashValue < 0 && firstActivityDate) {
    const firstDayActivities = activitiesByDate.get(firstActivityDate) || [];
    const firstActivity = firstDayActivities[0];
    const firstDayCashFlow = cashFlowDay.get(firstActivityDate) || 0;

    console.warn(
      `⚠️  Account ${accountId}: Cash value goes negative (min: ${minCashValue.toFixed(
        2
      )}). ` +
        `First activity on ${firstActivityDate}: ${
          firstActivity?.type || "unknown"
        } ` +
        `with amount ${firstDayCashFlow.toFixed(2)}. ` +
        `This may indicate a missing initial deposit or incorrect activity signs.`
    );
  }

  return {
    cashValue,
    cashFlowDay,
    extFlowDay,
    extFlowCum,
  };
}

/**
 * Calculate flow-adjusted returns and equity indices
 * Implements returns calculation logic from activities.py
 *
 * Uses depositWithdrawal field (which includes dividends and option transactions)
 * to calculate TWR returns that properly split periods at cashflow events.
 */
function calculateReturns(portfolioData) {
  const dates = Array.from(portfolioData.keys()).sort();
  if (dates.length === 0) {
    return portfolioData;
  }

  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1];
    const currDate = dates[i];
    const prev = portfolioData.get(prevDate);
    const curr = portfolioData.get(currDate);

    const V_prev = prev.totalValue || 0;
    const CF = curr.depositWithdrawal || 0;
    const base = V_prev + CF;
    const V_curr = curr.totalValue || 0;

    if (base <= 0) {
      curr.simpleReturns = 0;
    } else {
      curr.simpleReturns = (V_curr - base) / base;
    }

    // TWR: assume cash flow occurs at start of period.
    // Adjust the denominator only: V_prev + CF.
    // Do NOT also subtract CF from the numerator — that double-counts.
    const startValueWithCF = V_prev + CF;

    if (Math.abs(startValueWithCF) < 1e-6) {
      curr.dailyTWRReturn = 0;
    } else if (V_curr <= 0) {
      // Can't take log of zero or negative - this usually indicates missing prices
      // or data quality issues. Log this so it's visible in diagnostics.
      console.warn(
        `⚠️  TWR: V_curr <= 0 on ${currDate} (V_curr=${V_curr.toFixed(2)}, V_prev=${V_prev.toFixed(2)}, CF=${CF.toFixed(2)}). ` +
        `Likely missing prices. Setting dailyTWRReturn = 0.`
      );
      curr.dailyTWRReturn = 0;
      curr._twrDataQualityIssue = true;
    } else {
      // Calculate log return: ln(V_curr / (V_prev + CF))
      const ratio = V_curr / startValueWithCF;
      // Clamp ratio to prevent log(0) or extreme values
      const clampedRatio = Math.max(ratio, 1e-10);
      const logReturn = Math.log(clampedRatio);

      if (
        isNaN(logReturn) ||
        !isFinite(logReturn) ||
        Math.abs(logReturn) > 10
      ) {
        console.warn(
          `⚠️  TWR: Extreme log return ${logReturn?.toFixed(4)} on ${currDate} ` +
          `(V_curr=${V_curr.toFixed(2)}, base=${startValueWithCF.toFixed(2)}). Setting to 0.`
        );
        curr.dailyTWRReturn = 0;
        curr._twrDataQualityIssue = true;
      } else {
        curr.dailyTWRReturn = logReturn;
      }
    }
  }

  if (dates.length > 0) {
    const firstData = portfolioData.get(dates[0]);
    firstData.simpleReturns = 0;
    firstData.dailyTWRReturn = 0;
  }

  const THRESH = 1e-3;
  const alive = new Map();
  for (const date of dates) {
    const data = portfolioData.get(date);
    alive.set(date, (data.totalValue || 0) > THRESH);
  }

  const segmentId = new Map();
  let currentSegment = 0;
  let prevAlive = false;

  for (const date of dates) {
    const isAlive = alive.get(date);
    if (isAlive && !prevAlive) {
      currentSegment++;
    }
    segmentId.set(date, isAlive ? currentSegment : 0);
    prevAlive = isAlive;
  }

  const cumReturn = new Map();
  const equityIndex = new Map();

  const maxSegment = Math.max(...Array.from(segmentId.values()));

  for (let seg = 1; seg <= maxSegment; seg++) {
    const segmentDates = dates.filter((d) => segmentId.get(d) === seg);
    if (segmentDates.length === 0) continue;

    let cumRet = 0;
    let eqIdx = 1;

    for (const date of segmentDates) {
      const data = portfolioData.get(date);
      const ret = data.simpleReturns || 0;

      cumRet = (1 + ret) * (1 + cumRet) - 1;
      eqIdx = (1 + ret) * eqIdx;

      cumReturn.set(date, cumRet);
      equityIndex.set(date, eqIdx);
    }
  }

  for (const date of dates) {
    const data = portfolioData.get(date);
    if (segmentId.get(date) === 0) {
      data.cumReturn = cumReturn.get(date) || 0;
      data.equityIndex = null;
    } else {
      data.cumReturn = cumReturn.get(date) || 0;
      data.equityIndex = equityIndex.get(date) || null;
    }
  }

  return portfolioData;
}

/**
 * Calculate rolling TWR returns for different periods
 * Geometrically links daily TWR returns over the specified period
 *
 * Formula: TWR = (1 + r₁) × (1 + r₂) × ... × (1 + rₙ) - 1
 * where rᵢ are the daily TWR returns
 *
 * @param {Map<string, Object>} portfolioData - Map of date strings to portfolio data with dailyTWRReturn already calculated (as log returns)
 * @returns {Map<string, Object>} - Updated portfolio data with twr1Day, twr3Months, twrYearToDate, twrAllTime
 */
function calculatePeriodTWRReturns(portfolioData) {
  const dates = Array.from(portfolioData.keys()).sort();
  if (dates.length === 0) {
    return portfolioData;
  }

  const firstDate = dates[0];
  const [firstYear] = firstDate.split("-").map(Number);

  for (let i = 0; i < dates.length; i++) {
    const currentDate = dates[i];
    const currentData = portfolioData.get(currentDate);

    // Convert log return to simple return for 1-day: exp(logReturn) - 1
    if (
      currentData.dailyTWRReturn !== undefined &&
      currentData.dailyTWRReturn !== null &&
      isFinite(currentData.dailyTWRReturn)
    ) {
      const simpleReturn = Math.exp(currentData.dailyTWRReturn) - 1;
      currentData.twr1Day = isFinite(simpleReturn) ? simpleReturn : null;
    } else {
      currentData.twr1Day = null;
    }

    const [currentYear, currentMonth, currentDay] = currentDate
      .split("-")
      .map(Number);

    let targetYear = currentYear;
    let targetMonth = currentMonth - 3;

    while (targetMonth < 1) {
      targetMonth += 12;
      targetYear -= 1;
    }

    const lastDayOfTargetMonth = new Date(
      Date.UTC(targetYear, targetMonth, 0)
    ).getUTCDate();
    const targetDay = Math.min(currentDay, lastDayOfTargetMonth);

    const threeMonthsAgoStr = `${targetYear}-${String(targetMonth).padStart(
      2,
      "0"
    )}-${String(targetDay).padStart(2, "0")}`;

    const yearStartStr = `${currentYear}-01-01`;

    const geometricLink = (startDateStr, endDateStr) => {
      const periodDates = dates.filter(
        (d) => d >= startDateStr && d <= endDateStr
      );

      if (periodDates.length === 0) return null;

      const actualStartDate = periodDates[0];
      const actualStartData = portfolioData.get(actualStartDate);

      if (
        !actualStartData ||
        actualStartData.dailyTWRReturn === undefined ||
        actualStartData.dailyTWRReturn === null
      ) {
        return null;
      }

      // Sum log returns (since dailyTWRReturn is now a log return)
      let sumLogReturns = 0;
      let hasValidReturns = false;
      for (const dateStr of periodDates) {
        const dayData = portfolioData.get(dateStr);
        if (
          dayData &&
          dayData.dailyTWRReturn !== undefined &&
          dayData.dailyTWRReturn !== null
        ) {
          const logReturn = dayData.dailyTWRReturn;
          if (isFinite(logReturn)) {
            sumLogReturns += logReturn;
            hasValidReturns = true;
          }
        }
      }

      if (!hasValidReturns) return null;

      // Convert sum of log returns back to simple return: exp(sum) - 1
      const cumulative = Math.exp(sumLogReturns);
      const result = cumulative - 1;

      return isFinite(result) ? result : null;
    };

    const start3M =
      threeMonthsAgoStr > firstDate ? threeMonthsAgoStr : firstDate;
    currentData.twr3Months = geometricLink(start3M, currentDate);

    const startYTD = yearStartStr > firstDate ? yearStartStr : firstDate;
    if (currentYear >= firstYear) {
      currentData.twrYearToDate = geometricLink(startYTD, currentDate);
    } else {
      currentData.twrYearToDate = null;
    }

    currentData.twrAllTime = geometricLink(firstDate, currentDate);
  }

  return portfolioData;
}

/**
 * Get date range to process for an account
 */
async function getDateRange(accountId, fullSync, db) {
  if (fullSync) {
    const timeseriesCollection = db.collection("equitiesweighttimeseries");
    const firstPosition = await timeseriesCollection
      .find({ accountId: accountId })
      .sort({ date: 1 })
      .limit(1)
      .toArray();

    if (firstPosition.length === 0) {
      return null;
    }

    const startDate = new Date(firstPosition[0].date);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  } else {
    const portfolioCollection = db.collection("portfoliotimeseries");
    const lastEntry = await portfolioCollection
      .find({ accountId: accountId })
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    if (lastEntry.length === 0) {
      return getDateRange(accountId, true, db);
    }

    const startDate = new Date(lastEntry[0].date);
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const timeseriesCollection = db.collection("equitiesweighttimeseries");
    const firstPosition = await timeseriesCollection
      .find({ accountId: accountId })
      .sort({ date: 1 })
      .limit(1)
      .toArray();

    if (firstPosition.length > 0) {
      const firstDate = new Date(firstPosition[0].date);
      return {
        startDate: firstDate < startDate ? firstDate : startDate,
        endDate,
      };
    }

    return { startDate, endDate };
  }
}

/**
 * Main function to update portfolio timeseries
 */
export async function updatePortfolioTimeseries(opts = {}) {
  const databaseUrl =
    opts.databaseUrl ||
    process.env.DATABASE_URL ||
    (() => {
      throw new Error(
        "DATABASE_URL environment variable is required. Please set it in your .env file."
      );
    })();

  const userId = opts.userId || null;
  const accountId = opts.accountId || null;
  const fullSync = opts.fullSync === true;

  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(databaseUrl, {
        serverSelectionTimeoutMS: 60000, // Increased to 60s
        connectTimeoutMS: 60000, // Increased to 60s
        socketTimeoutMS: 300000, // Increased to 5 minutes for long operations
        maxPoolSize: 10, // Allow more concurrent connections
      });
      console.log("Connected to MongoDB");
    } catch (err) {
      console.error("Failed to connect to MongoDB:", err?.message || err);
      throw err;
    }
  }

  const db = mongoose.connection.db;
  const summary = {
    totalAccounts: 0,
    processed: 0,
    skipped: 0,
    totalRecords: 0,
    errors: [],
  };

  try {
    // Get accounts from activities instead of EquitiesWeightTimeseries
    const activitiesCollection = db.collection("snaptradeaccountactivities");
    const query = {};
    if (userId) {
      query.userId = userId;
    }
    if (accountId) {
      query.accountId = accountId;
    }

    const accounts = await activitiesCollection.distinct("accountId", query);
    summary.totalAccounts = accounts.length;

    if (accounts.length === 0) {
      console.log("No accounts found in activities");
      return summary;
    }

    console.log(
      `Processing ${accounts.length} account(s) (fullSync: ${fullSync})`
    );

    for (const acctId of accounts) {
      try {
        // Get userId from activities
        const sampleActivity = await activitiesCollection.findOne({
          accountId: acctId,
        });
        if (!sampleActivity) {
          console.warn(
            `⚠️  No activities found for account ${acctId}. Skipping.`
          );
          summary.skipped++;
          continue;
        }

        const acctUserId = sampleActivity.userId;
        if (!acctUserId) {
          console.warn(`No userId found for account ${acctId}`);
          summary.skipped++;
          continue;
        }

        console.log(`Processing account ${acctId} (user ${acctUserId})...`);

        // Get all activities for this account FIRST (like attempt.js)
        const activities = await activitiesCollection
          .find({ accountId: acctId })
          .sort({ trade_date: 1, date: 1, _id: 1 })
          .toArray();

        if (activities.length === 0) {
          console.warn(`No activities found for account ${acctId}`);
          summary.skipped++;
          continue;
        }

        // Determine date range from activities (like attempt.js)
        // Find earliest and latest activity dates
        let earliestActivityDate = null;
        let latestActivityDate = null;
        for (const activity of activities) {
          const dateValue = activity.trade_date || activity.date;
          if (!dateValue) continue;
          const date = new Date(dateValue);
          date.setHours(0, 0, 0, 0);
          if (!earliestActivityDate || date < earliestActivityDate) {
            earliestActivityDate = date;
          }
          if (!latestActivityDate || date > latestActivityDate) {
            latestActivityDate = date;
          }
        }

        if (!earliestActivityDate) {
          console.warn(`No valid activity dates found for account ${acctId}`);
          summary.skipped++;
          continue;
        }

        // Use activity-based date range, but respect fullSync setting
        let startDate, endDate;
        if (fullSync) {
          // Full sync: use earliest activity to today
          startDate = earliestActivityDate;
          endDate = new Date();
          endDate.setHours(23, 59, 59, 999);
        } else {
          // Incremental: check last portfolio timeseries entry
          const portfolioCollection = db.collection("portfoliotimeseries");
          const lastEntry = await portfolioCollection
            .find({ accountId: acctId })
            .sort({ date: -1 })
            .limit(1)
            .toArray();

          if (lastEntry.length > 0) {
            // Include the last existing day so its totalValue seeds V_prev
            // for the first new day's return calculation (avoids V_prev = 0)
            startDate = new Date(lastEntry[0].date);
            // Ensure startDate is not before earliest activity
            if (startDate < earliestActivityDate) {
              startDate = earliestActivityDate;
            }
          } else {
            startDate = earliestActivityDate;
          }
          endDate = new Date();
          endDate.setHours(23, 59, 59, 999);
        }

        // Pass activities to buildCashAndFlows to avoid fetching twice
        const cashFlows = await buildCashAndFlows(
          acctId,
          db,
          endDate,
          activities
        );

        // Generate date range from startDate to endDate (like attempt.js)
        const dates = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
          dates.push(new Date(current));
          current.setDate(current.getDate() + 1);
        }

        // Build all date strings
        const allDatesSorted = dates.map((d) => d.toISOString().split("T")[0]);

        // Build units tracking from activities (like attempt.js)
        const unitsByDate = buildUnitsFromActivities(
          activities,
          allDatesSorted
        );

        const portfolioData = new Map();

        // Build forward-filled cash value map for all dates (like Python's ffill)
        const cashValueByDate = new Map();
        let lastCashValue = 0;

        // Build forward-filled extFlowCum map for all dates (like Python's ffill)
        const extFlowCumByDate = new Map();
        let lastExtFlowCum = 0;

        // Forward-fill cash values and extFlowCum in a single pass
        for (const dateKey of allDatesSorted) {
          if (cashFlows.cashValue.has(dateKey)) {
            lastCashValue = cashFlows.cashValue.get(dateKey);
          }
          cashValueByDate.set(dateKey, lastCashValue);

          if (cashFlows.extFlowCum.has(dateKey)) {
            lastExtFlowCum = cashFlows.extFlowCum.get(dateKey);
          }
          extFlowCumByDate.set(dateKey, lastExtFlowCum);
        }

        for (const date of dates) {
          const dateKey = date.toISOString().split("T")[0];

          // Get units for this date
          const units = unitsByDate.get(dateKey) || {};

          // Calculate stock value from units and prices
          const { stockValue, positions } = await calculateStockValueFromUnits(
            units,
            date,
            db
          );

          // Check for positions with missing prices and use last known price as fallback
          const unitsCount = Object.keys(units).filter(
            (s) => units[s] > 0
          ).length;
          const symbolsWithoutPrices = positions
            .filter((p) => p.price === 0 && p.units !== 0)
            .map((p) => p.symbol);

          if (symbolsWithoutPrices.length > 0) {
            console.error(
              `❌ Account ${acctId} on ${dateKey}: Missing prices for ${symbolsWithoutPrices.length} symbol(s) with active positions: ` +
                `${symbolsWithoutPrices.slice(0, 10).join(", ")}${
                  symbolsWithoutPrices.length > 10
                    ? `... (${symbolsWithoutPrices.length} total)`
                    : ""
                }. ` +
                `Portfolio value will be understated. Run updatePriceData with --forceRefresh to fix.`
            );
            // Track missing prices in summary for upstream reporting
            if (!summary._missingPrices) summary._missingPrices = [];
            summary._missingPrices.push({
              accountId: acctId,
              date: dateKey,
              symbols: symbolsWithoutPrices,
            });
          }

          // Use forward-filled cash value (last known value up to this date)
          const cashValue = cashValueByDate.get(dateKey) || 0;

          const totalValue = stockValue + cashValue;

          const depositWithdrawal = cashFlows.extFlowDay.get(dateKey) || 0;

          // Use pre-computed forward-filled extFlowCum
          const externalFlowCumulative = extFlowCumByDate.get(dateKey) || 0;

          portfolioData.set(dateKey, {
            userId: acctUserId,
            accountId: acctId,
            date: date,
            stockValue: stockValue,
            cashValue: cashValue,
            totalValue: totalValue,
            depositWithdrawal: depositWithdrawal,
            externalFlowCumulative: externalFlowCumulative,
            positions: positions,
          });
        }

        calculateReturns(portfolioData);
        calculatePeriodTWRReturns(portfolioData);

        // Pre-write validation: check for data quality issues before persisting
        let dataQualityErrors = 0;
        for (const [dateKey, data] of portfolioData) {
          // Check for NaN values that would corrupt the database
          if (isNaN(data.totalValue) || isNaN(data.stockValue) || isNaN(data.cashValue)) {
            console.error(`❌ Account ${acctId} on ${dateKey}: NaN detected in portfolio values (total: ${data.totalValue}, stock: ${data.stockValue}, cash: ${data.cashValue}). Skipping this record.`);
            portfolioData.delete(dateKey);
            dataQualityErrors++;
            continue;
          }
          // Check totalValue consistency
          const expectedTotal = data.stockValue + data.cashValue;
          if (Math.abs(data.totalValue - expectedTotal) > 0.01) {
            console.warn(`⚠️  Account ${acctId} on ${dateKey}: totalValue (${data.totalValue}) != stockValue (${data.stockValue}) + cashValue (${data.cashValue}). Correcting.`);
            data.totalValue = expectedTotal;
          }
        }

        if (dataQualityErrors > 0) {
          console.warn(`⚠️  Account ${acctId}: ${dataQualityErrors} record(s) removed due to data quality issues`);
          summary.errors.push({
            accountId: acctId,
            error: `${dataQualityErrors} records had NaN values and were excluded`,
          });
        }

        const portfolioCollection = db.collection("portfoliotimeseries");
        const ops = [];

        for (const [dateKey, data] of portfolioData) {
          ops.push({
            updateOne: {
              filter: {
                userId: data.userId,
                accountId: data.accountId,
                date: data.date,
              },
              update: {
                $set: {
                  userId: data.userId,
                  accountId: data.accountId,
                  date: data.date,
                  stockValue: data.stockValue,
                  cashValue: data.cashValue,
                  totalValue: data.totalValue,
                  depositWithdrawal: data.depositWithdrawal,
                  externalFlowCumulative: data.externalFlowCumulative,
                  simpleReturns: data.simpleReturns,
                  dailyTWRReturn: data.dailyTWRReturn,
                  twr1Day: data.twr1Day,
                  twr3Months: data.twr3Months,
                  twrYearToDate: data.twrYearToDate,
                  twrAllTime: data.twrAllTime,
                  cumReturn: data.cumReturn,
                  equityIndex: data.equityIndex,
                  positions: data.positions,
                },
                $setOnInsert: {
                  createdAt: new Date(),
                },
              },
              upsert: true,
            },
          });
        }

        if (ops.length > 0) {
          const BATCH_SIZE = 1000;
          let totalUpserted = 0;

          for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = ops.slice(i, i + BATCH_SIZE);
            const res = await portfolioCollection.bulkWrite(batch, {
              ordered: false,
            });
            totalUpserted += res.upsertedCount || res.nUpserted || 0;
          }

          summary.totalRecords += totalUpserted;
          console.log(
            `  ✓ Account ${acctId}: stored ${totalUpserted} portfolio records`
          );
        }

        summary.processed++;
      } catch (err) {
        console.error(
          `Error processing account ${acctId}:`,
          err?.message || err
        );
        summary.errors.push({
          accountId: acctId,
          error: err?.message || String(err),
        });
      }
    }

    console.log("\n=== Summary ===");
    console.log(`Total accounts: ${summary.totalAccounts}`);
    console.log(`Processed: ${summary.processed}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Total records: ${summary.totalRecords}`);
    console.log(`Errors: ${summary.errors.length}`);
  } catch (error) {
    console.error("Error in updatePortfolioTimeseries:", error);
    throw error;
  }

  return summary;
}

/**
 * CLI entry point when run directly
 */
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("updatePortfolioTimeseries.js")
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const opts = {};
      if (args.includes("--fullSync")) {
        opts.fullSync = true;
      }

      console.log("Starting updatePortfolioTimeseries...");
      const result = await updatePortfolioTimeseries(opts);
      console.log(
        "updatePortfolioTimeseries result:",
        JSON.stringify(result, null, 2)
      );
      process.exit(0);
    } catch (err) {
      console.error("updatePortfolioTimeseries failed:", err);
      process.exit(2);
    } finally {
      await mongoose.disconnect();
    }
  })();
}
