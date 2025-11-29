import mongoose from "mongoose";

/**
 * EquitiesWeightTimeseries model
 * 
 * Stores daily position weights (signed units) per symbol for each account.
 * This is the output of processing AccountActivities to build a timeseries
 * of holdings over time.
 * 
 * Structure:
 * - userId: User identifier
 * - accountId: Account identifier  
 * - date: Date of the position snapshot
 * - symbol: Ticker symbol (equity or option ticker)
 * - units: Signed units (shares/contracts) held on this date
 * 
 * Indexed by userId, accountId, date, and symbol for efficient queries.
 */
const equitiesWeightTimeseriesSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    units: {
      type: Number,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Compound index for efficient queries by account and date
equitiesWeightTimeseriesSchema.index({ accountId: 1, date: 1, symbol: 1 }, { unique: true });

const EquitiesWeightTimeseries = mongoose.model(
  "EquitiesWeightTimeseries",
  equitiesWeightTimeseriesSchema
);

export default EquitiesWeightTimeseries;

