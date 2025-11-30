/**
 * updateEquitiesWeightTable.js
 *
 * Processes AccountActivities to build a daily timeseries of position weights
 * (signed units per symbol) and saves it to the EquitiesWeightTimeseries collection.
 *
 * This implements the positions timeseries logic from the Python activities.py script,
 * building a daily snapshot of holdings for each account.
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string (falls back to env DATABASE_URL)
 *  - userId: optional; when set only process that user's accounts
 *  - accountId: optional; when set only process that specific account
 */

import mongoose from "mongoose";
import EquitiesWeightTimeseries from "../../quantDashBoard/server/src/models/EquitiesWeightTimeseries.js";

/**
 * Extracts the position symbol from an activity record.
 * Prioritizes option symbols, then regular symbols, then string fallback.
 * @param {Object} activity - Activity record
 * @returns {string|null} - Symbol string or null if not found
 */
function extractPositionSymbol(activity) {
  const optionSym = activity.option_symbol;
  if (optionSym && typeof optionSym === "object" && optionSym.ticker) {
    return String(optionSym.ticker).trim();
  }

  const sym = activity.symbolObj || activity.symbol;
  if (sym && typeof sym === "object") {
    const ticker = sym.symbol || sym.raw_symbol;
    if (ticker) {
      return String(ticker).trim();
    }
  }

  if (activity.symbol && typeof activity.symbol === "string") {
    return activity.symbol.trim();
  }

  return null;
}

/**
 * Computes signed units for an activity based on transaction type.
 * @param {Object} activity - Activity record
 * @returns {number} - Positive for buys, negative for sells/option closures
 */
function signedUnits(activity) {
  const type = String(activity.type || "").toUpperCase();
  const units = parseFloat(activity.units || activity.quantity || 0);

  if (type === "SELL") {
    return -Math.abs(units);
  } else if (type === "BUY" || type === "REI") {
    return Math.abs(units);
  } else if (
    type === "OPTIONASSIGNMENT" ||
    type === "OPTIONEXERCISE" ||
    type === "OPTIONEXPIRATION"
  ) {
    return -Math.abs(units);
  }

  return 0.0;
}

/**
 * Builds daily positions timeseries from activities by aggregating transactions
 * and rolling forward positions day by day.
 * @param {Array} activities - Array of activity records
 * @returns {Map<string, Map<string, number>>} - Map of date -> Map of symbol -> units
 */
function buildDailyPositions(activities) {
  const POSITION_TYPES = new Set([
    "BUY",
    "SELL",
    "REI",
    "OPTIONASSIGNMENT",
    "OPTIONEXERCISE",
    "OPTIONEXPIRATION",
  ]);

  const transactionsByDate = new Map();

  for (const activity of activities) {
    const type = String(activity.type || "").toUpperCase();
    if (!POSITION_TYPES.has(type)) {
      continue;
    }

    const symbol = extractPositionSymbol(activity);
    if (!symbol) {
      continue;
    }

    const tradeDateRaw = activity.trade_date || activity.date;
    if (!tradeDateRaw) {
      continue;
    }

    const tradeDate = new Date(tradeDateRaw);
    tradeDate.setHours(0, 0, 0, 0);
    const dateKey = tradeDate.toISOString().split("T")[0];

    const units = signedUnits(activity);
    if (Math.abs(units) < 1e-6) {
      continue;
    }

    if (!transactionsByDate.has(dateKey)) {
      transactionsByDate.set(dateKey, new Map());
    }
    const symbolMap = transactionsByDate.get(dateKey);
    symbolMap.set(symbol, (symbolMap.get(symbol) || 0) + units);
  }

  if (transactionsByDate.size === 0) {
    return new Map();
  }

  const dates = Array.from(transactionsByDate.keys()).sort();
  const minDate = new Date(dates[0]);
  const maxDate = new Date(dates[dates.length - 1]);

  const dateRange = [];
  const current = new Date(minDate);
  while (current <= maxDate) {
    dateRange.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const positionsByDate = new Map();
  const currentPositions = new Map();

  for (const date of dateRange) {
    const dateKey = date.toISOString().split("T")[0];

    if (transactionsByDate.has(dateKey)) {
      const dayTransactions = transactionsByDate.get(dateKey);
      for (const [symbol, deltaUnits] of dayTransactions) {
        const newUnits = (currentPositions.get(symbol) || 0) + deltaUnits;
        if (Math.abs(newUnits) < 1e-3) {
          currentPositions.delete(symbol);
        } else {
          currentPositions.set(symbol, newUnits);
        }
      }
    }

    positionsByDate.set(dateKey, new Map(currentPositions));
  }

  return positionsByDate;
}

/**
 * Update the EquitiesWeightTimeseries collection from AccountActivities.
 *
 * Behavior:
 * - Connects to MongoDB using DATABASE_URL or the provided databaseUrl option.
 * - Fetches activities from AccountActivities collection for the specified accounts.
 * - Builds daily positions timeseries by processing BUY/SELL/REI/option transactions.
 * - Upserts positions into EquitiesWeightTimeseries collection.
 *
 * Options:
 *  - databaseUrl: MongoDB connection string
 *  - userId: optional string to process only a specific user's accounts
 *  - accountId: optional string to process only a specific account
 */
export async function updateEquitiesWeightTable(opts = {}) {
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

  // Connect to MongoDB if not already connected
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(databaseUrl, {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      });

      console.log(
        "Connected to MongoDB (readyState:",
        mongoose.connection.readyState,
        ")"
      );

      try {
        await mongoose.connection.db.admin().ping();
        console.log("Database ping successful - connection is ready");
      } catch (pingErr) {
        console.error("Connection test failed:", pingErr?.message || pingErr);
        throw new Error(
          `Connection test failed: ${pingErr?.message || pingErr}`
        );
      }
    } catch (err) {
      console.error("Failed to connect to MongoDB:", err?.message || err);
      throw err;
    }
  }

  const summary = {
    totalAccounts: 0,
    processed: 0,
    skipped: 0,
    totalRecords: 0,
    errors: [],
  };

  const db = mongoose.connection.db;
  const activitiesCollection = db.collection("snaptradeaccountactivities");

  const activityQuery = {};
  if (userId) {
    activityQuery.userId = userId;
  }
  if (accountId) {
    activityQuery.accountId = accountId;
  }

  const accounts = await activitiesCollection.distinct(
    "accountId",
    activityQuery
  );
  summary.totalAccounts = accounts.length;

  if (accounts.length === 0) {
    console.log("No accounts found with activities");
    await mongoose.disconnect();
    return summary;
  }

  console.log(`Processing ${accounts.length} account(s)`);

  for (const acctId of accounts) {
    try {
      const sampleActivity = await activitiesCollection.findOne({
        accountId: acctId,
      });
      if (!sampleActivity) {
        console.warn(`No activities found for account ${acctId}`);
        summary.skipped++;
        continue;
      }

      const acctUserId = sampleActivity.userId;
      if (!acctUserId) {
        console.warn(`No userId found for account ${acctId}`);
        summary.skipped++;
        continue;
      }

      const activities = [];
      const cursor = activitiesCollection
        .find({ accountId: acctId })
        .sort({ trade_date: 1, date: 1 })
        .batchSize(1000)
        .maxTimeMS(300000);

      for await (const activity of cursor) {
        activities.push(activity);
      }

      if (activities.length === 0) {
        console.log(`No activities for account ${acctId}`);
        summary.processed++;
        continue;
      }

      console.log(
        `Processing ${activities.length} activities for account ${acctId} (user ${acctUserId})`
      );

      const positionsByDate = buildDailyPositions(activities);

      if (positionsByDate.size === 0) {
        console.log(`No position transactions found for account ${acctId}`);
        summary.processed++;
        continue;
      }

      const ops = [];
      for (const [dateKey, symbolMap] of positionsByDate) {
        const date = new Date(dateKey);
        for (const [symbol, units] of symbolMap) {
          ops.push({
            updateOne: {
              filter: {
                accountId: acctId,
                date: date,
                symbol: symbol,
              },
              update: {
                $set: {
                  userId: acctUserId,
                  accountId: acctId,
                  date: date,
                  symbol: symbol,
                  units: units,
                },
              },
              upsert: true,
            },
          });
        }
      }

      if (ops.length > 0) {
        const timeseriesCollection = db.collection("equitiesweighttimeseries");

        const BATCH_SIZE = 1000;
        let totalUpserted = 0;
        let totalModified = 0;

        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
          const batch = ops.slice(i, i + BATCH_SIZE);
          try {
            const res = await timeseriesCollection.bulkWrite(batch, {
              ordered: false,
            });
            const upserted = res.upsertedCount || res.nUpserted || 0;
            const modified = res.modifiedCount || res.nModified || 0;
            totalUpserted += upserted;
            totalModified += modified;

            if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= ops.length) {
              console.log(
                `  Progress: ${Math.min(i + BATCH_SIZE, ops.length)}/${
                  ops.length
                } records processed`
              );
            }
          } catch (batchErr) {
            console.error(
              `Error in batch ${i}-${i + BATCH_SIZE}:`,
              batchErr?.message || batchErr
            );
          }
        }

        summary.totalRecords += totalUpserted + totalModified;
        console.log(
          `Upserted/modified ${
            totalUpserted + totalModified
          } position records for account ${acctId} across ${
            positionsByDate.size
          } dates`
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

  await mongoose.disconnect();
  return summary;
}

/**
 * CLI entry point when run directly
 */
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("updateEquitiesWeightTable.js")
) {
  (async () => {
    try {
      console.log("Starting updateEquitiesWeightTable...");
      const result = await updateEquitiesWeightTable();
      console.log(
        "updateEquitiesWeightTable result:",
        JSON.stringify(result, null, 2)
      );
      process.exit(0);
    } catch (err) {
      console.error("updateEquitiesWeightTable failed:", err);
      process.exit(2);
    }
  })();
}
