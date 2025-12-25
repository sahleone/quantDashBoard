import mongoose from "mongoose";

/**
 * Metrics model
 *
 * Stores calculated portfolio metrics for different periods.
 * Supports both old schema (for backward compatibility) and new schema.
 *
 * New schema:
 * - userId: User identifier (required, indexed)
 * - accountId: Account identifier (required, indexed)
 * - date: As-of date for metrics (required, indexed)
 * - period: Period type ('1M', '3M', 'YTD', '1Y', 'ALL') (required, indexed)
 * - metrics: Object containing all calculated metrics
 *
 * Old schema (backward compatibility):
 * - asOfDate: Date (required)
 * - accountId: String (required)
 * - sharpe, volatility, beta, nav, drawdownToDate: Numbers
 */
const metricsSchema = new mongoose.Schema(
  {
    // New schema fields
    userId: {
      type: String,
      index: true,
      default: null,
    },
    date: {
      type: Date,
      index: true,
      default: null,
    },
    period: {
      type: String,
      enum: ["1M", "3M", "YTD", "1Y", "ALL"],
      index: true,
      default: null,
    },
    metrics: {
      aum: { type: Number, default: null },
      totalReturn: { type: Number, default: null },
      cagr: { type: Number, default: null },
      volatility: { type: Number, default: null },
      sharpe: { type: Number, default: null },
      sortino: { type: Number, default: null },
      maxDrawdown: { type: Number, default: null },
      beta: { type: Number, default: null },
      var95: { type: Number, default: null },
      cvar95: { type: Number, default: null },
      hhi: { type: Number, default: null },
      diversificationScore: { type: Number, default: null },
      dividendIncome: { type: Number, default: null },
      interestIncome: { type: Number, default: null },
      totalIncomeYield: { type: Number, default: null },
      nav: { type: mongoose.Schema.Types.Decimal128, default: null },
      // Additional performance metrics
      calmar: { type: Number, default: null },
      alpha: { type: Number, default: null },
      // Additional risk metrics
      omega: { type: Number, default: null },
      downsideDeviation: { type: Number, default: null },
      sharpeConfidenceInterval: {
        lowerBound: { type: Number, default: null },
        upperBound: { type: Number, default: null },
      },
    },
    // Old schema fields (for backward compatibility)
    asOfDate: {
      type: Date,
      default: null,
    },
    computedAtUtc: {
      type: Date,
      required: false,
      default: Date.now,
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },
    sharpe: {
      type: Number,
      default: null,
    },
    volatility: {
      type: Number,
      default: null,
    },
    beta: {
      type: Number,
      default: null,
    },
    drawdownToDate: {
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

// New compound index for efficient querying
metricsSchema.index(
  { userId: 1, accountId: 1, date: 1, period: 1 },
  { unique: true, sparse: true }
);

// Old compound index (for backward compatibility)
metricsSchema.index(
  { asOfDate: 1, accountId: 1 },
  { unique: true, sparse: true }
);

const Metrics = mongoose.model("SnapTradeMetrics", metricsSchema);

export default Metrics;
