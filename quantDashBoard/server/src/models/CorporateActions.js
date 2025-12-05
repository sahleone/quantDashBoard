import mongoose from "mongoose";

/**
 * CorporateActions model
 * 
 * Stores corporate actions (stock splits, dividends) for all symbols.
 * This is populated by updatePriceData.js which fetches corporate actions from Yahoo Finance.
 * 
 * Structure:
 * - symbol: Ticker symbol (required, indexed, unique)
 * - splits: Array of stock split events
 *   - date: Date of the split (required)
 *   - factor: Split factor (e.g., 2.0 for 2:1 split, 0.5 for 1:2 reverse split)
 *   - ratio: Human-readable ratio (e.g., "2:1")
 * - dividends: Array of dividend events
 *   - date: Ex-dividend date (required)
 *   - amount: Dividend amount per share (required)
 * - lastUpdated: Last time this record was updated
 * - source: Source of the data (e.g., "yahoo_finance")
 * 
 * Indexed by symbol for efficient queries.
 */
const corporateActionsSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    splits: [
      {
        date: {
          type: Date,
          required: true,
        },
        factor: {
          type: Number,
          required: true,
        },
        ratio: {
          type: String,
          default: null,
        },
      },
    ],
    dividends: [
      {
        date: {
          type: Date,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "yahoo_finance",
    },
  },
  {
    timestamps: false,
  }
);

// Index on splits.date for efficient date range queries
corporateActionsSchema.index({ "splits.date": 1 });
corporateActionsSchema.index({ "dividends.date": 1 });

const CorporateActions = mongoose.model("CorporateActions", corporateActionsSchema);

export default CorporateActions;

