import mongoose from "mongoose";

/**
 * Fama-French Factors Model
 *
 * Caches daily factor data from the Kenneth French Data Library.
 * Used for:
 * - Risk-free rate (RF) for Sharpe/Sortino calculations
 * - Factor data (Mkt-RF, SMB, HML) for regression analysis
 *
 * Values are stored in DECIMAL form (e.g. 0.001 not 0.10%).
 */
const famaFrenchFactorsSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    mktRf: {
      type: Number,
      required: true,
    },
    smb: {
      type: Number,
      required: true,
    },
    hml: {
      type: Number,
      required: true,
    },
    rf: {
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

// Unique index on date — one row per trading day
famaFrenchFactorsSchema.index({ date: 1 }, { unique: true });

const FamaFrenchFactors = mongoose.model(
  "FamaFrenchFactors",
  famaFrenchFactorsSchema
);

export default FamaFrenchFactors;
