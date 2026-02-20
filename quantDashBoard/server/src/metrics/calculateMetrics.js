/**
 * calculateMetrics.js
 *
 * Main script that orchestrates metric calculations and stores results in DB.
 * Calculates metrics for different periods (1M, 3M, YTD, 1Y, ALL) and stores
 * them in the Metrics collection.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's accounts
 *  - accountId: optional; when set only process that specific account
 *  - fullSync: boolean; if true, recalculate all metrics; if false, only recalculate if data changed (default: false)
 */

import mongoose from "mongoose";
import Metrics from "../models/Metrics.js";
import PortfolioTimeseries from "../models/PortfolioTimeseries.js";
import AccountActivities from "../models/AccountActivities.js";
import PriceHistory from "../models/PriceHistory.js";
import * as portfolioSnapshotMetrics from "./helpers/portfolioSnapshotMetrics.js";
import * as returnsMetrics from "./helpers/returnsMetrics.js";
import * as riskMetrics from "./helpers/riskMetrics.js";
import * as riskAdjustedMetrics from "./helpers/riskAdjustedMetrics.js";
import * as diversificationMetrics from "./helpers/diversificationMetrics.js";

/**
 * Calculates the date range for a given period ending at asOfDate
 * @param {string} period - Period identifier (1M, 3M, YTD, 1Y, ALL)
 * @param {Date} asOfDate - End date for the period
 * @returns {{startDate: Date|null, endDate: Date}} - Date range object
 */
function getPeriodDateRange(period, asOfDate) {
  const endDate = new Date(asOfDate);
  endDate.setUTCHours(23, 59, 59, 999);

  // Use UTC-based arithmetic to avoid setMonth overflow and timezone issues.
  // e.g. March 31 minus 1 month should give Feb 28, not March 3.
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();
  const endDay = endDate.getUTCDate();

  let startDate;

  switch (period) {
    case "1M": {
      let targetMonth = endMonth - 1;
      let targetYear = endYear;
      if (targetMonth < 0) { targetMonth += 12; targetYear -= 1; }
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(endDay, lastDay)));
      break;
    }
    case "3M": {
      let targetMonth = endMonth - 3;
      let targetYear = endYear;
      while (targetMonth < 0) { targetMonth += 12; targetYear -= 1; }
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(endDay, lastDay)));
      break;
    }
    case "YTD":
      startDate = new Date(Date.UTC(endYear, 0, 1));
      break;
    case "1Y": {
      const lastDay = new Date(Date.UTC(endYear - 1, endMonth + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(endYear - 1, endMonth, Math.min(endDay, lastDay)));
      break;
    }
    case "ALL":
      return { startDate: null, endDate };
    default:
      throw new Error(`Unknown period: ${period}`);
  }

  startDate.setUTCHours(0, 0, 0, 0);
  return { startDate, endDate };
}

/**
 * Fetches SPY benchmark returns for beta calculation
 * @param {Date} startDate - Start date for benchmark data
 * @param {Date} endDate - End date for benchmark data
 * @param {Object} db - MongoDB database connection
 * @returns {Array<number>|null} - Array of daily returns or null if insufficient data
 */
/**
 * Fetches SPY benchmark returns aligned to portfolio dates for beta calculation
 * @param {Date} startDate - Start date for benchmark data
 * @param {Date} endDate - End date for benchmark data
 * @param {Object} db - MongoDB database connection
 * @param {Array} portfolioDates - Array of date strings (YYYY-MM-DD) from portfolio returns
 * @returns {Array<number>|null} - Array of daily returns aligned to portfolio dates, or null if insufficient data
 */
async function fetchBenchmarkReturns(startDate, endDate, db, portfolioDates = null) {
  const priceHistoryCollection = db.collection("pricehistories");

  const prices = await priceHistoryCollection
    .find({
      symbol: "SPY",
      date: { $gte: startDate, $lte: endDate },
    })
    .sort({ date: 1 })
    .toArray();

  if (prices.length < 2) {
    return null;
  }

  // Build a map of date -> daily return for the benchmark
  const benchmarkReturnsByDate = new Map();
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1].close;
    const currPrice = prices[i].close;
    if (prevPrice > 0) {
      const dateStr = new Date(prices[i].date).toISOString().split("T")[0];
      benchmarkReturnsByDate.set(dateStr, (currPrice - prevPrice) / prevPrice);
    }
  }

  // If portfolio dates are provided, align benchmark returns to those dates
  if (portfolioDates && portfolioDates.length > 0) {
    const alignedReturns = [];
    for (const dateStr of portfolioDates) {
      if (benchmarkReturnsByDate.has(dateStr)) {
        alignedReturns.push(benchmarkReturnsByDate.get(dateStr));
      }
    }
    return alignedReturns.length >= 2 ? alignedReturns : null;
  }

  // Fallback: return all returns
  return Array.from(benchmarkReturnsByDate.values());
}

/**
 * Calculates all metrics for a specific account and period
 * @param {string} accountId - Account ID
 * @param {string} userId - User ID
 * @param {string} period - Period identifier (1M, 3M, YTD, 1Y, ALL)
 * @param {Date} asOfDate - End date for calculations
 * @param {Object} db - MongoDB database connection
 * @returns {Object|null} - Metrics object or null if no data available
 */
async function calculatePeriodMetrics(accountId, userId, period, asOfDate, db) {
  const { startDate: periodStart, endDate } = getPeriodDateRange(
    period,
    asOfDate
  );

  const portfolioCollection = db.collection("portfoliotimeseries");
  let query = {
    accountId: accountId,
    date: { $lte: endDate },
  };

  if (periodStart) {
    query.date.$gte = periodStart;
  }

  const portfolioData = await portfolioCollection
    .find(query)
    .sort({ date: 1 })
    .toArray();

  if (portfolioData.length === 0) {
    return null;
  }

  const actualStartDate = periodStart || new Date(portfolioData[0].date);
  actualStartDate.setHours(0, 0, 0, 0);

  const activitiesCollection = db.collection("snaptradeaccountactivities");
  const activities = await activitiesCollection
    .find({
      accountId: accountId,
      $or: [
        { trade_date: { $gte: actualStartDate, $lte: endDate } },
        { date: { $gte: actualStartDate, $lte: endDate } },
      ],
    })
    .toArray();

  const returns = portfolioData
    .map((pt) => pt.simpleReturns)
    .filter((r) => r !== null && r !== undefined);
  const equityIndex = portfolioData
    .map((pt) => pt.equityIndex)
    .filter((ei) => ei !== null && ei !== undefined);

  const latest = portfolioData[portfolioData.length - 1];
  const first = portfolioData[0];

  const metrics = {};
  metrics.aum = portfolioSnapshotMetrics.calculateAUM(portfolioData);
  const allocation = portfolioSnapshotMetrics.calculateAssetAllocation(
    latest.positions || [],
    latest.totalValue || 0
  );
  metrics.hhi = portfolioSnapshotMetrics.calculateHHI(allocation);
  metrics.diversificationScore =
    portfolioSnapshotMetrics.calculateDiversificationScore(metrics.hhi);

  // Income metrics
  metrics.dividendIncome = portfolioSnapshotMetrics.calculateDividendIncome(
    activities,
    actualStartDate,
    endDate
  );
  metrics.interestIncome = portfolioSnapshotMetrics.calculateInterestIncome(
    activities,
    actualStartDate,
    endDate
  );

  const avgPortfolioValue =
    portfolioData.reduce((sum, pt) => sum + (pt.totalValue || 0), 0) /
    portfolioData.length;
  metrics.totalIncomeYield = portfolioSnapshotMetrics.calculateTotalIncomeYield(
    metrics.dividendIncome,
    metrics.interestIncome,
    avgPortfolioValue
  );

  // Calculate Time-Weighted Return (TWR) using pre-calculated fields when available
  // This eliminates the impact of external cash flows (deposits/withdrawals)
  const startValue = first.totalValue || 0;
  const endValue = latest.totalValue || 0;

  // Try to use pre-calculated TWR field from latest record
  let twrReturn = null;
  const periodUpper = period.toUpperCase();
  switch (periodUpper) {
    case "3M":
      twrReturn = latest.twr3Months;
      break;
    case "YTD":
      twrReturn = latest.twrYearToDate;
      break;
    case "ALL":
      twrReturn = latest.twrAllTime;
      break;
    case "1M":
    case "1Y":
      // For 1M and 1Y, calculate from dailyTWRReturn
      if (periodStart) {
        twrReturn = returnsMetrics.calculateTWRFromDailyReturns(
          portfolioData,
          periodStart,
          endDate
        );
      }
      break;
    default:
      twrReturn = null;
  }

  // Fallback to calculation from timeseries if pre-calculated value not available
  if (twrReturn === null || twrReturn === undefined) {
    metrics.totalReturn =
      returnsMetrics.calculateTWRFromTimeseries(portfolioData);
  } else {
    metrics.totalReturn = twrReturn;
  }

  // Derive CAGR from TWR to avoid conflating external cash flows with returns.
  // CAGR = (1 + TWR)^(1/years) - 1
  const days = Math.ceil((endDate - actualStartDate) / (1000 * 60 * 60 * 24));
  const years = days / 365.25;
  if (metrics.totalReturn !== null && metrics.totalReturn !== undefined && years > 0) {
    const totalReturnFactor = 1 + metrics.totalReturn;
    if (totalReturnFactor > 0) {
      metrics.cagr = Math.pow(totalReturnFactor, 1 / years) - 1;
    } else {
      metrics.cagr = -1; // Total loss
    }
  } else {
    metrics.cagr = 0;
  }

  metrics.volatility = riskMetrics.calculateVolatility(returns, true);
  metrics.maxDrawdown = riskMetrics.calculateMaxDrawdown(equityIndex);
  metrics.var95 = riskMetrics.calculateVaRHistorical(returns, 0.95);
  metrics.cvar95 = riskMetrics.calculateCVaR(returns, metrics.var95);

  try {
    // Build portfolio date strings for alignment (skip first day which has no return)
    const portfolioDates = portfolioData.slice(1)
      .filter((pt) => pt.simpleReturns !== null && pt.simpleReturns !== undefined)
      .map((pt) => new Date(pt.date).toISOString().split("T")[0]);

    // Align benchmark returns to the same dates as portfolio returns
    const benchmarkReturns = await fetchBenchmarkReturns(
      actualStartDate,
      endDate,
      db,
      portfolioDates
    );

    if (benchmarkReturns) {
      // Filter portfolio returns to only dates where we have benchmark data
      const benchmarkDateSet = new Set(portfolioDates.filter((_, i) => i < (benchmarkReturns?.length || 0)));
      // Both arrays are now aligned to the same dates
      const alignedPortfolioReturns = returns.slice(0, benchmarkReturns.length);
      if (alignedPortfolioReturns.length === benchmarkReturns.length && alignedPortfolioReturns.length >= 2) {
        metrics.beta = riskMetrics.calculateBeta(alignedPortfolioReturns, benchmarkReturns);
      } else {
        metrics.beta = null;
      }
    } else {
      metrics.beta = null;
    }
  } catch (error) {
    console.warn(`Failed to calculate beta for ${accountId}:`, error.message);
    metrics.beta = null;
  }

  metrics.sharpe = riskAdjustedMetrics.calculateSharpeRatio(returns, 0, true);
  metrics.sortino = riskAdjustedMetrics.calculateSortinoRatio(returns, 0, true);
  metrics.nav = latest.totalValue || 0;

  return metrics;
}

/**
 * Main function to calculate and store metrics
 */
export async function calculateMetrics(opts = {}) {
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
    totalPeriods: 0,
    calculated: 0,
    stored: 0,
    errors: [],
  };

  try {
    const portfolioCollection = db.collection("portfoliotimeseries");
    const query = {};
    if (userId) {
      query.userId = userId;
    }
    if (accountId) {
      query.accountId = accountId;
    }

    const accounts = await portfolioCollection.distinct("accountId", query);
    summary.totalAccounts = accounts.length;

    if (accounts.length === 0) {
      console.log("No accounts found in PortfolioTimeseries");
      await mongoose.disconnect();
      return summary;
    }

    console.log(`Processing ${accounts.length} account(s)`);

    const periods = ["1M", "3M", "YTD", "1Y", "ALL"];
    // Use UTC to avoid timezone-related off-by-one errors
    const now = new Date();
    const asOfDate = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      23, 59, 59, 999
    ));

    for (const acctId of accounts) {
      try {
        const samplePortfolio = await portfolioCollection.findOne({
          accountId: acctId,
        });
        if (!samplePortfolio) {
          console.warn(`No portfolio data found for account ${acctId}`);
          continue;
        }

        const acctUserId = samplePortfolio.userId;
        if (!acctUserId) {
          console.warn(`No userId found for account ${acctId}`);
          continue;
        }

        console.log(`Processing account ${acctId} (user ${acctUserId})...`);

        // Data freshness check: verify portfolio data is reasonably recent
        const latestPortfolio = await portfolioCollection
          .find({ accountId: acctId })
          .sort({ date: -1 })
          .limit(1)
          .toArray();

        if (latestPortfolio.length > 0) {
          const latestDate = new Date(latestPortfolio[0].date);
          const daysSinceUpdate = Math.floor((asOfDate - latestDate) / (1000 * 60 * 60 * 24));
          if (daysSinceUpdate > 3) {
            console.warn(
              `⚠️  Account ${acctId}: Portfolio data is ${daysSinceUpdate} days old ` +
              `(last entry: ${latestDate.toISOString().split("T")[0]}). ` +
              `Metrics may be stale. Run full sync to update.`
            );
          }
        }

        for (const period of periods) {
          try {
            summary.totalPeriods++;

            const metrics = await calculatePeriodMetrics(
              acctId,
              acctUserId,
              period,
              asOfDate,
              db
            );

            if (!metrics) {
              console.log(`  - ${period}: No data available for this period`);
              continue;
            }

            const metricsCollection = db.collection("snaptrademetrics");
            await metricsCollection.updateOne(
              {
                userId: acctUserId,
                accountId: acctId,
                date: asOfDate,
                period: period,
              },
              {
                $set: {
                  userId: acctUserId,
                  accountId: acctId,
                  date: asOfDate,
                  asOfDate: asOfDate, // Also set asOfDate for backward compatibility with old index
                  period: period,
                  metrics: metrics,
                  computedAtUtc: new Date(),
                },
                $setOnInsert: {
                  createdAt: new Date(),
                },
              },
              { upsert: true }
            );

            summary.calculated++;
            summary.stored++;
            console.log(`  ✓ ${period}: Calculated and stored metrics`);
          } catch (periodError) {
            console.error(
              `  ✗ ${period}: Error calculating metrics:`,
              periodError?.message || periodError
            );
            summary.errors.push({
              accountId: acctId,
              period: period,
              error: periodError?.message || String(periodError),
            });
          }
        }
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
    console.log(`Total periods: ${summary.totalPeriods}`);
    console.log(`Calculated: ${summary.calculated}`);
    console.log(`Stored: ${summary.stored}`);
    console.log(`Errors: ${summary.errors.length}`);
  } catch (error) {
    console.error("Error in calculateMetrics:", error);
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
  process.argv[1].endsWith("calculateMetrics.js")
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const opts = {};
      if (args.includes("--fullSync")) {
        opts.fullSync = true;
      }

      console.log("Starting calculateMetrics...");
      const result = await calculateMetrics(opts);
      console.log("calculateMetrics result:", JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("calculateMetrics failed:", err);
      process.exit(2);
    } finally {
      await mongoose.disconnect();
    }
  })();
}
