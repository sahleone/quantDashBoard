import mongoose from "mongoose";

const metricsSchema = new mongoose.Schema(
  {
    asOfDate: {
      type: Date,
      required: true,
    },
    computedAtUtc: {
      type: Date,
      required: true,
    },
    accountId: {
      type: String,
      required: true,
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
    nav: {
      type: mongoose.Schema.Types.Decimal128,
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

// Create compound index for efficient querying
metricsSchema.index({ asOfDate: 1, accountId: 1 }, { unique: true });

const Metrics = mongoose.model("SnapTradeMetrics", metricsSchema);

export default Metrics;
