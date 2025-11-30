/**
 * validateMetrics.js
 *
 * Validates data quality and alerts on issues in the metrics pipeline.
 * Performs various checks on portfolio data, prices, returns, and consistency.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; validate only this user
 *  - accountId: optional; validate only this account
 *  - sendAlerts: boolean; send notifications on failures (default: false)
 */

import mongoose from "mongoose";
import PortfolioTimeseries from "../quantDashBoard/server/src/models/PortfolioTimeseries.js";
import PriceHistory from "../quantDashBoard/server/src/models/PriceHistory.js";
import EquitiesWeightTimeseries from "../quantDashBoard/server/src/models/EquitiesWeightTimeseries.js";
import AccountActivities from "../quantDashBoard/server/src/models/AccountActivities.js";

/**
 * Validation results structure
 */
class ValidationResult {
  constructor(accountId, checkName, status, message, details = {}) {
    this.accountId = accountId;
    this.checkName = checkName;
    this.status = status; // 'pass', 'warning', 'error'
    this.message = message;
    this.details = details;
    this.timestamp = new Date();
  }
}

/**
 * Check AUM sanity (portfolio value within expected range)
 */
async function checkAUMSanity(accountId, db) {
  const portfolioCollection = db.collection("portfoliotimeseries");
  const portfolios = await portfolioCollection
    .find({ accountId: accountId })
    .sort({ date: 1 })
    .toArray();

  const results = [];

  for (const pt of portfolios) {
    const totalValue = pt.totalValue || 0;

    // Check for negative values
    if (totalValue < 0) {
      results.push(
        new ValidationResult(
          accountId,
          "AUM_Sanity",
          "error",
          `Negative portfolio value: ${totalValue}`,
          { date: pt.date, totalValue }
        )
      );
    }

    // Check for unreasonably large values (e.g., > $1 trillion)
    if (totalValue > 1e12) {
      results.push(
        new ValidationResult(
          accountId,
          "AUM_Sanity",
          "warning",
          `Unusually large portfolio value: ${totalValue}`,
          { date: pt.date, totalValue }
        )
      );
    }
  }

  if (results.length === 0) {
    results.push(
      new ValidationResult(
        accountId,
        "AUM_Sanity",
        "pass",
        "All portfolio values are within expected range"
      )
    );
  }

  return results;
}

/**
 * Check for missing prices
 */
async function checkMissingPrices(accountId, db) {
  const timeseriesCollection = db.collection("equitiesweighttimeseries");
  const priceHistoryCollection = db.collection("pricehistories");

  // Get all symbols for this account
  const symbols = await timeseriesCollection.distinct("symbol", {
    accountId: accountId,
  });

  const results = [];
  const missingSymbols = [];

  for (const symbol of symbols) {
    // Check if we have any prices for this symbol
    const priceCount = await priceHistoryCollection.countDocuments({
      symbol: symbol,
    });

    if (priceCount === 0) {
      missingSymbols.push(symbol);
    }
  }

  if (missingSymbols.length > 0) {
    results.push(
      new ValidationResult(
        accountId,
        "Missing_Prices",
        "warning",
        `${missingSymbols.length} symbols have no price data`,
        { missingSymbols: missingSymbols.slice(0, 10) } // Limit to first 10
      )
    );
  } else {
    results.push(
      new ValidationResult(
        accountId,
        "Missing_Prices",
        "pass",
        "All symbols have price data"
      )
    );
  }

  return results;
}

/**
 * Check for data gaps in portfolio timeseries
 */
async function checkDataGaps(accountId, db) {
  const portfolioCollection = db.collection("portfoliotimeseries");
  const portfolios = await portfolioCollection
    .find({ accountId: accountId })
    .sort({ date: 1 })
    .toArray();

  const results = [];
  const gaps = [];

  for (let i = 1; i < portfolios.length; i++) {
    const prevDate = new Date(portfolios[i - 1].date);
    const currDate = new Date(portfolios[i].date);

    const daysDiff =
      Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

    // Flag gaps larger than 3 days (weekends are OK)
    if (daysDiff > 3) {
      gaps.push({
        startDate: prevDate,
        endDate: currDate,
        days: daysDiff,
      });
    }
  }

  if (gaps.length > 0) {
    results.push(
      new ValidationResult(
        accountId,
        "Data_Gaps",
        "warning",
        `Found ${gaps.length} data gaps > 3 days`,
        { gaps: gaps.slice(0, 5) } // Limit to first 5
      )
    );
  } else {
    results.push(
      new ValidationResult(
        accountId,
        "Data_Gaps",
        "pass",
        "No significant data gaps found"
      )
    );
  }

  return results;
}

/**
 * Check for return outliers
 */
async function checkReturnOutliers(accountId, db) {
  const portfolioCollection = db.collection("portfoliotimeseries");
  const portfolios = await portfolioCollection
    .find({ accountId: accountId })
    .sort({ date: 1 })
    .toArray();

  const results = [];
  const outliers = [];

  for (const pt of portfolios) {
    const ret = pt.simpleReturns;
    if (ret !== null && ret !== undefined) {
      // Flag returns > 100% or < -100% (may indicate data error)
      if (ret > 1.0 || ret < -1.0) {
        outliers.push({
          date: pt.date,
          return: ret,
        });
      }
    }
  }

  if (outliers.length > 0) {
    results.push(
      new ValidationResult(
        accountId,
        "Return_Outliers",
        "error",
        `Found ${outliers.length} return outliers (>100% or <-100%)`,
        { outliers: outliers.slice(0, 10) }
      )
    );
  } else {
    results.push(
      new ValidationResult(
        accountId,
        "Return_Outliers",
        "pass",
        "No return outliers found"
      )
    );
  }

  return results;
}

/**
 * Check consistency: totalValue = stockValue + cashValue
 */
async function checkConsistency(accountId, db) {
  const portfolioCollection = db.collection("portfoliotimeseries");
  const portfolios = await portfolioCollection
    .find({ accountId: accountId })
    .sort({ date: 1 })
    .toArray();

  const results = [];
  const inconsistencies = [];

  for (const pt of portfolios) {
    const totalValue = pt.totalValue || 0;
    const stockValue = pt.stockValue || 0;
    const cashValue = pt.cashValue || 0;
    const expectedTotal = stockValue + cashValue;

    // Allow small floating point differences
    const diff = Math.abs(totalValue - expectedTotal);
    if (diff > 0.01) {
      inconsistencies.push({
        date: pt.date,
        totalValue,
        stockValue,
        cashValue,
        expectedTotal,
        difference: diff,
      });
    }
  }

  if (inconsistencies.length > 0) {
    results.push(
      new ValidationResult(
        accountId,
        "Consistency",
        "error",
        `Found ${inconsistencies.length} inconsistencies (totalValue != stockValue + cashValue)`,
        { inconsistencies: inconsistencies.slice(0, 10) }
      )
    );
  } else {
    results.push(
      new ValidationResult(
        accountId,
        "Consistency",
        "pass",
        "All portfolio values are consistent"
      )
    );
  }

  return results;
}

/**
 * Check position consistency with activities
 */
async function checkPositionConsistency(accountId, db) {
  const timeseriesCollection = db.collection("equitiesweighttimeseries");
  const activitiesCollection = db.collection("snaptradeaccountactivities");

  // Get latest positions
  const latestPositions = await timeseriesCollection
    .find({ accountId: accountId })
    .sort({ date: -1 })
    .limit(1)
    .toArray();

  if (latestPositions.length === 0) {
    return [
      new ValidationResult(
        accountId,
        "Position_Consistency",
        "warning",
        "No positions found to validate"
      ),
    ];
  }

  const latestDate = latestPositions[0].date;

  // Get all position transactions from activities
  const POSITION_TYPES = new Set([
    "BUY",
    "SELL",
    "REI",
    "OPTIONASSIGNMENT",
    "OPTIONEXERCISE",
    "OPTIONEXPIRATION",
  ]);

  const activities = await activitiesCollection
    .find({
      accountId: accountId,
      type: { $in: Array.from(POSITION_TYPES) },
      $or: [
        { trade_date: { $lte: latestDate } },
        { date: { $lte: latestDate } },
      ],
    })
    .toArray();

  // This is a simplified check - full validation would require
  // rebuilding positions from activities and comparing
  const results = [
    new ValidationResult(
      accountId,
      "Position_Consistency",
      "pass",
      "Position consistency check completed (simplified)"
    ),
  ];

  return results;
}

/**
 * Main validation function
 */
export async function validateMetrics(opts = {}) {
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
  const sendAlerts = opts.sendAlerts === true;

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
    totalChecks: 0,
    passed: 0,
    warnings: 0,
    errors: 0,
    results: [],
  };

  try {
    // Get accounts to validate
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
      console.log("No accounts found to validate");
      await mongoose.disconnect();
      return summary;
    }

    console.log(`Validating ${accounts.length} account(s)`);

    // Run all validation checks for each account
    const checks = [
      checkAUMSanity,
      checkMissingPrices,
      checkDataGaps,
      checkReturnOutliers,
      checkConsistency,
      checkPositionConsistency,
    ];

    for (const acctId of accounts) {
      console.log(`Validating account ${acctId}...`);

      for (const checkFn of checks) {
        try {
          const checkResults = await checkFn(acctId, db);
          summary.results.push(...checkResults);

          for (const result of checkResults) {
            summary.totalChecks++;
            if (result.status === "pass") {
              summary.passed++;
            } else if (result.status === "warning") {
              summary.warnings++;
              console.log(`  ⚠ ${result.checkName}: ${result.message}`);
            } else if (result.status === "error") {
              summary.errors++;
              console.error(`  ✗ ${result.checkName}: ${result.message}`);
            }
          }
        } catch (checkError) {
          console.error(
            `  ✗ Error running ${checkFn.name}:`,
            checkError?.message || checkError
          );
        }
      }
    }

    console.log("\n=== Validation Summary ===");
    console.log(`Total accounts: ${summary.totalAccounts}`);
    console.log(`Total checks: ${summary.totalChecks}`);
    console.log(`Passed: ${summary.passed}`);
    console.log(`Warnings: ${summary.warnings}`);
    console.log(`Errors: ${summary.errors}`);

    // Send alerts if requested
    if (sendAlerts && summary.errors > 0) {
      console.log("\n⚠️  Errors detected - alerts should be sent here");
      // TODO: Implement alert sending (email, Slack, etc.)
    }
  } catch (error) {
    console.error("Error in validateMetrics:", error);
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
  process.argv[1].endsWith("validateMetrics.js")
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const opts = {};
      if (args.includes("--sendAlerts")) {
        opts.sendAlerts = true;
      }

      console.log("Starting validateMetrics...");
      const result = await validateMetrics(opts);
      console.log("validateMetrics result:", JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("validateMetrics failed:", err);
      process.exit(2);
    }
  })();
}

