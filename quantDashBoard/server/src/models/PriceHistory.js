import mongoose from "mongoose";

/**
 * PriceHistory model
 * 
 * Stores daily price data for all symbols (stocks, ETFs, options).
 * This is populated by updatePriceData.js which fetches prices from Yahoo Finance.
 * 
 * Structure:
 * - symbol: Ticker symbol (required, indexed)
 * - date: Date of the price (required, indexed)
 * - close: Closing price (required)
 * - open: Opening price (optional)
 * - high: High price (optional)
 * - low: Low price (optional)
 * - volume: Trading volume (optional)
 * 
 * Indexed by (symbol, date) for efficient queries and uniqueness.
 */
const priceHistorySchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    close: {
      type: Number,
      required: true,
    },
    open: {
      type: Number,
      default: null,
    },
    high: {
      type: Number,
      default: null,
    },
    low: {
      type: Number,
      default: null,
    },
    volume: {
      type: Number,
      default: null,
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

// Compound unique index for efficient queries and uniqueness
priceHistorySchema.index({ symbol: 1, date: 1 }, { unique: true });

const PriceHistory = mongoose.model("PriceHistory", priceHistorySchema);

export default PriceHistory;

