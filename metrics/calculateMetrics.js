/**
 * calculateMetrics.js
 *
 * Main script that orchestrates metric calculations and stores results in DB.
 * Calculates metrics for different periods (1M, 3M, YTD, 1Y, ITD) and stores
 * them in the Metrics collection.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's accounts
 *  - accountId: optional; when set only process that specific account
 *  - fullSync: boolean; if true, recalculate all metrics; if false, only recalculate if data changed (default: false)
 */

import mongoose from "mongoose";
import Metrics from "../quantDashBoard/server/src/models/Metrics.js";
import PortfolioTimeseries from "../quantDashBoard/server/src/models/PortfolioTimeseries.js";
import AccountActivities from "../quantDashBoard/server/src/models/AccountActivities.js";
import PriceHistory from "../quantDashBoard/server/src/models/PriceHistory.js";

// Import helper functions
import * as portfolioSnapshotMetrics from "./helper/portfolioSnapshotMetrics.js";
import * as returnsMetrics from "./helper/returnsMetrics.js";
import * as riskMetrics from "./helper/riskMetrics.js";
import * as riskAdjustedMetrics from "./helper/riskAdjustedMetrics.js";
import * as diversificationMetrics from "./helper/diversificationMetrics.js";

/**
 * Get date range for a period
 */
function getPeriodDateRange(period, asOfDate) {
  const endDate = new Date(asOfDate);
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(endDate);

  switch (period) {
    case "1M":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "3M":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "YTD":
      startDate.setMonth(0);
      startDate.setDate(1);
      break;
    case "1Y":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case "ITD":
      // ITD: from first data point to asOfDate
      return { startDate: null, endDate }; // Will be determined from data
    default:
      throw new Error(`Unknown period: ${period}`);
  }

  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

/**
 * Fetch benchmark returns (SPY) for beta calculation
 */
async function fetchBenchmarkReturns(startDate, endDate, db) {
  const priceHistoryCollection = db.collection("pricehistories");

  // Fetch SPY prices
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

  // Calculate returns
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1].close;
    const currPrice = prices[i].close;
    if (prevPrice > 0) {
      returns.push((currPrice - prevPrice) / prevPrice);
    }
  }

  return returns;
}

/**
 * Calculate all metrics for a period
 */
async function calculatePeriodMetrics(
  accountId,
  userId,
  period,
  asOfDate,
  db
) {
  // Get date range for period
  const { startDate: periodStart, endDate } = getPeriodDateRange(
    period,
    asOfDate
  );

  // Fetch portfolio timeseries
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

  // For ITD, use first date as start
  const actualStartDate = periodStart || new Date(portfolioData[0].date);
  actualStartDate.setHours(0, 0, 0, 0);

  // Fetch activities for income calculations
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

  // Extract returns and equity index
  const returns = portfolioData
    .map((pt) => pt.simpleReturns)
    .filter((r) => r !== null && r !== undefined);
  const equityIndex = portfolioData
    .map((pt) => pt.equityIndex)
    .filter((ei) => ei !== null && ei !== undefined);

  // Get latest portfolio data
  const latest = portfolioData[portfolioData.length - 1];
  const first = portfolioData[0];

  // Calculate metrics
  const metrics = {};

  // Portfolio snapshot metrics
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

  // Calculate average portfolio value
  const avgPortfolioValue =
    portfolioData.reduce((sum, pt) => sum + (pt.totalValue || 0), 0) /
    portfolioData.length;
  metrics.totalIncomeYield =
    portfolioSnapshotMetrics.calculateTotalIncomeYield(
      metrics.dividendIncome,
      metrics.interestIncome,
      avgPortfolioValue
    );

  // Returns metrics
  const startValue = first.totalValue || 0;
  const endValue = latest.totalValue || 0;
  metrics.totalReturn = returnsMetrics.calculatePointToPointReturn(
    startValue,
    endValue
  );

  const days = Math.ceil(
    (endDate - actualStartDate) / (1000 * 60 * 60 * 24)
  );
  const years = days / 365.25;
  metrics.cagr = returnsMetrics.calculateCAGR(startValue, endValue, years);

  // Risk metrics
  metrics.volatility = riskMetrics.calculateVolatility(returns, true);
  metrics.maxDrawdown = riskMetrics.calculateMaxDrawdown(equityIndex);
  metrics.var95 = riskMetrics.calculateVaRHistorical(returns, 0.95);
  metrics.cvar95 = riskMetrics.calculateCVaR(returns, metrics.var95);

  // Beta (requires benchmark)
  try {
    const benchmarkReturns = await fetchBenchmarkReturns(
      actualStartDate,
      endDate,
      db
    );
    if (benchmarkReturns && benchmarkReturns.length === returns.length) {
      metrics.beta = riskMetrics.calculateBeta(returns, benchmarkReturns);
    } else {
      metrics.beta = null;
    }
  } catch (error) {
    console.warn(`Failed to calculate beta for ${accountId}:`, error.message);
    metrics.beta = null;
  }

  // Risk-adjusted metrics
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
    totalPeriods: 0,
    calculated: 0,
    stored: 0,
    errors: [],
  };

  try {
    // Get accounts to process
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

    const periods = ["1M", "3M", "YTD", "1Y", "ITD"];
    const asOfDate = new Date();
    asOfDate.setHours(23, 59, 59, 999);

    // Process each account
    for (const acctId of accounts) {
      try {
        // Get account userId
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

        // Calculate metrics for each period
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
              console.log(
                `  - ${period}: No data available for this period`
              );
              continue;
            }

            // Store in database
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
                  period: period,
                  metrics: metrics,
                  computedAtUtc: new Date(),
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
        console.error(`Error processing account ${acctId}:`, err?.message || err);
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
    }
  })();
}

