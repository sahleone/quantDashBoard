/**
 * updatePortfolioTimeseries.js
 *
 * Builds portfolio valuation timeseries from positions, prices, and cash flows.
 * Implements the logic from returnsTest/activities.py build_portfolio_timeseries().
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's accounts
 *  - accountId: optional; when set only process that specific account
 *  - fullSync: boolean; if true, process all historical data; if false, only process from last PortfolioTimeseries date (default: false)
 */

import mongoose from "mongoose";
import PortfolioTimeseries from "../../quantDashBoard/server/src/models/PortfolioTimeseries.js";
import EquitiesWeightTimeseries from "../../quantDashBoard/server/src/models/EquitiesWeightTimeseries.js";
import PriceHistory from "../../quantDashBoard/server/src/models/PriceHistory.js";
import AccountActivities from "../../quantDashBoard/server/src/models/AccountActivities.js";

/**
 * Calculate stock value for a date from positions and prices
 */
async function calculateStockValue(accountId, date, db) {
  const timeseriesCollection = db.collection("equitiesweighttimeseries");
  const priceHistoryCollection = db.collection("pricehistories");

  // Get all positions for this account and date
  const positions = await timeseriesCollection
    .find({
      accountId: accountId,
      date: date,
    })
    .toArray();

  if (positions.length === 0) {
    return { stockValue: 0, positions: [] };
  }

  let totalStockValue = 0;
  const positionDetails = [];

  // Get prices for all symbols
  const symbols = positions.map((p) => p.symbol);
  const priceMap = new Map();

  // Fetch prices for all symbols at once
  const prices = await priceHistoryCollection
    .find({
      symbol: { $in: symbols },
      date: { $lte: date },
    })
    .sort({ symbol: 1, date: -1 })
    .toArray();

  // Group by symbol and get latest price before or on date
  const pricesBySymbol = new Map();
  for (const price of prices) {
    if (!pricesBySymbol.has(price.symbol)) {
      pricesBySymbol.set(price.symbol, price);
    }
  }

  // Calculate value for each position
  for (const position of positions) {
    const symbol = position.symbol;
    const units = position.units || 0;

    // Get price (forward fill from last known price)
    let price = 0;
    if (pricesBySymbol.has(symbol)) {
      price = pricesBySymbol.get(symbol).close || 0;
    }

    const value = units * price;
    totalStockValue += value;

    positionDetails.push({
      symbol: symbol,
      units: units,
      price: price,
      value: value,
    });
  }

  return { stockValue: totalStockValue, positions: positionDetails };
}

/**
 * Build cash flow series from activities
 * Implements build_cash_and_flows() logic from activities.py
 */
async function buildCashAndFlows(accountId, db) {
  const activitiesCollection = db.collection("snaptradeaccountactivities");

  // Fetch all activities for this account
  const activities = await activitiesCollection
    .find({ accountId: accountId })
    .sort({ trade_date: 1, date: 1 })
    .toArray();

  if (activities.length === 0) {
    return {
      cashValue: new Map(),
      cashFlowDay: new Map(),
      extFlowDay: new Map(),
      extFlowCum: new Map(),
    };
  }

  // Group by date and sum amounts
  const cashFlowByDate = new Map(); // date -> net cash flow
  const extFlowByDate = new Map(); // date -> external flow

  const EXT_TYPES = new Set(["CONTRIBUTION", "DEPOSIT", "WITHDRAWAL"]);

  for (const activity of activities) {
    const type = String(activity.type || "").toUpperCase();
    const amount = parseFloat(activity.amount || 0);
    if (isNaN(amount)) continue;

    // Get date (prefer trade_date, fallback to date)
    const dateRaw = activity.trade_date || activity.date;
    if (!dateRaw) continue;

    const date = new Date(dateRaw);
    date.setHours(0, 0, 0, 0);
    const dateKey = date.toISOString().split("T")[0];

    // All activities contribute to cash flow
    cashFlowByDate.set(
      dateKey,
      (cashFlowByDate.get(dateKey) || 0) + amount
    );

    // External flows (CONTRIBUTION, DEPOSIT, WITHDRAWAL)
    if (EXT_TYPES.has(type)) {
      let extAmount = amount;
      if (type === "WITHDRAWAL") {
        extAmount = -Math.abs(amount);
      } else if (type === "CONTRIBUTION" || type === "DEPOSIT") {
        extAmount = Math.abs(amount);
      }

      extFlowByDate.set(dateKey, (extFlowByDate.get(dateKey) || 0) + extAmount);
    }
  }

  // Build cumulative series
  const cashValue = new Map(); // cumulative cash
  const extFlowCum = new Map(); // cumulative external flows

  const allDates = new Set([
    ...cashFlowByDate.keys(),
    ...extFlowByDate.keys(),
  ]);
  const sortedDates = Array.from(allDates).sort();

  let runningCash = 0;
  let runningExtFlow = 0;

  for (const dateKey of sortedDates) {
    runningCash += cashFlowByDate.get(dateKey) || 0;
    runningExtFlow += extFlowByDate.get(dateKey) || 0;

    cashValue.set(dateKey, runningCash);
    extFlowCum.set(dateKey, runningExtFlow);
  }

  return {
    cashValue,
    cashFlowDay: cashFlowByDate,
    extFlowDay: extFlowByDate,
    extFlowCum,
  };
}

/**
 * Calculate flow-adjusted returns and equity indices
 * Implements returns calculation logic from activities.py
 */
function calculateReturns(portfolioData) {
  const dates = Array.from(portfolioData.keys()).sort();
  if (dates.length === 0) {
    return portfolioData;
  }

  // Calculate simple returns
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
  }

  // First day has no return
  if (dates.length > 0) {
    portfolioData.get(dates[0]).simpleReturns = 0;
  }

  // Identify active segments (portfolio has non-trivial value)
  const THRESH = 1e-3;
  const alive = new Map();
  for (const date of dates) {
    const data = portfolioData.get(date);
    alive.set(date, (data.totalValue || 0) > THRESH);
  }

  // Assign segment IDs
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

  // Calculate cumulative return and equity index per segment
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

  // Fill in dead periods
  for (const date of dates) {
    const data = portfolioData.get(date);
    if (segmentId.get(date) === 0) {
      // Dead period
      data.cumReturn = cumReturn.get(date) || 0; // Carry forward or 0
      data.equityIndex = null; // NaN equivalent (null in JSON)
    } else {
      data.cumReturn = cumReturn.get(date) || 0;
      data.equityIndex = equityIndex.get(date) || null;
    }
  }

  return portfolioData;
}

/**
 * Get date range to process for an account
 */
async function getDateRange(accountId, fullSync, db) {
  if (fullSync) {
    // Get first date from EquitiesWeightTimeseries
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
    // Get last date from PortfolioTimeseries
    const portfolioCollection = db.collection("portfoliotimeseries");
    const lastEntry = await portfolioCollection
      .find({ accountId: accountId })
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    if (lastEntry.length === 0) {
      // No existing data, do full sync
      return getDateRange(accountId, true, db);
    }

    const startDate = new Date(lastEntry[0].date);
    startDate.setDate(startDate.getDate() + 1); // Start from next day
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Also get first date to ensure we have complete range
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

  // Connect to MongoDB if not already connected
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(databaseUrl, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
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
    // Get accounts to process
    const timeseriesCollection = db.collection("equitiesweighttimeseries");
    const query = {};
    if (userId) {
      query.userId = userId;
    }
    if (accountId) {
      query.accountId = accountId;
    }

    const accounts = await timeseriesCollection.distinct("accountId", query);
    summary.totalAccounts = accounts.length;

    if (accounts.length === 0) {
      console.log("No accounts found");
      await mongoose.disconnect();
      return summary;
    }

    console.log(
      `Processing ${accounts.length} account(s) (fullSync: ${fullSync})`
    );

    // Process each account
    for (const acctId of accounts) {
      try {
        // Get account userId
        const samplePosition = await timeseriesCollection.findOne({
          accountId: acctId,
        });
        if (!samplePosition) {
          console.warn(`No positions found for account ${acctId}`);
          summary.skipped++;
          continue;
        }

        const acctUserId = samplePosition.userId;
        if (!acctUserId) {
          console.warn(`No userId found for account ${acctId}`);
          summary.skipped++;
          continue;
        }

        console.log(`Processing account ${acctId} (user ${acctUserId})...`);

        // Get date range to process
        const dateRange = await getDateRange(acctId, fullSync, db);
        if (!dateRange) {
          console.log(`No date range for account ${acctId}`);
          summary.skipped++;
          continue;
        }

        // Build cash flows
        const cashFlows = await buildCashAndFlows(acctId, db);

        // Build calendar date range
        const dates = [];
        const current = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);

        while (current <= end) {
          dates.push(new Date(current));
          current.setDate(current.getDate() + 1);
        }

        // Build portfolio data for each date
        const portfolioData = new Map();

        for (const date of dates) {
          const dateKey = date.toISOString().split("T")[0];

          // Calculate stock value
          const { stockValue, positions } = await calculateStockValue(
            acctId,
            date,
            db
          );

          // Get cash value (forward fill from cash flows)
          let cashValue = 0;
          const cashFlowDates = Array.from(cashFlows.cashValue.keys()).sort();
          for (const cfDate of cashFlowDates) {
            if (cfDate <= dateKey) {
              cashValue = cashFlows.cashValue.get(cfDate) || 0;
            }
          }

          const totalValue = stockValue + cashValue;

          // Get external flows
          const depositWithdrawal = cashFlows.extFlowDay.get(dateKey) || 0;
          let externalFlowCumulative = 0;
          for (const cfDate of cashFlowDates) {
            if (cfDate <= dateKey) {
              externalFlowCumulative = cashFlows.extFlowCum.get(cfDate) || 0;
            }
          }

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

        // Calculate returns
        calculateReturns(portfolioData);

        // Store in database
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
                  cumReturn: data.cumReturn,
                  equityIndex: data.equityIndex,
                  positions: data.positions,
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
        console.error(`Error processing account ${acctId}:`, err?.message || err);
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
  } finally {
    await mongoose.disconnect();
  }

  return summary;
}

// CLI runner
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
    }
  })();
}

