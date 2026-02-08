import mongoose from "mongoose";

/**
 * PortfolioTimeseries model
 *
 * Stores daily portfolio valuations, returns, and equity indices for each account.
 * This is populated by updatePortfolioTimeseries.js which calculates values from
 * positions, prices, and cash flows.
 *
 * Structure:
 * - userId: User identifier (required, indexed)
 * - accountId: Account identifier (required, indexed)
 * - date: Date of the valuation (required, indexed)
 * - stockValue: Total value of stock/option positions (required)
 * - cashValue: Cash balance (required)
 * - totalValue: Total portfolio value = stockValue + cashValue (required)
 * - depositWithdrawal: Net external flow for this day (default: 0)
 * - externalFlowCumulative: Cumulative external flows (default: 0)
 * - simpleReturns: Flow-adjusted daily return (optional)
 * - dailyTWRReturn: Time-weighted daily log return excluding external cash flows (optional)
 *   Note: This is a log return (ln(V_end/V_start)), not a simple return
 * - twr1Day: 1-day TWR return (same as dailyTWRReturn) (optional)
 * - twr3Months: Rolling 3-month TWR return (geometrically linked daily returns) (optional)
 * - twrYearToDate: Year-to-date TWR return (geometrically linked from Jan 1) (optional)
 * - twrAllTime: All-time TWR return (geometrically linked from inception) (optional)
 * - cumReturn: Cumulative return per active segment (optional)
 * - equityIndex: Normalized equity curve per segment (optional)
 * - positions: Array of position breakdowns (optional)
 *
 * Indexed by (userId, accountId, date) for efficient queries and uniqueness.
 */
const portfolioTimeseriesSchema = new mongoose.Schema(
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
    stockValue: {
      type: Number,
      required: true,
    },
    cashValue: {
      type: Number,
      required: true,
    },
    totalValue: {
      type: Number,
      required: true,
    },
    depositWithdrawal: {
      type: Number,
      default: 0,
    },
    externalFlowCumulative: {
      type: Number,
      default: 0,
    },
    simpleReturns: {
      type: Number,
      default: null,
    },
    dailyTWRReturn: {
      type: Number,
      default: null,
    },
    twr1Day: {
      type: Number,
      default: null,
    },
    twr3Months: {
      type: Number,
      default: null,
    },
    twrYearToDate: {
      type: Number,
      default: null,
    },
    twrAllTime: {
      type: Number,
      default: null,
    },
    cumReturn: {
      type: Number,
      default: null,
    },
    equityIndex: {
      type: Number,
      default: null,
    },
    positions: [
      {
        symbol: String,
        units: Number,
        price: Number,
        value: Number,
      },
    ],
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
portfolioTimeseriesSchema.index(
  { userId: 1, accountId: 1, date: 1 },
  { unique: true }
);

const PortfolioTimeseries = mongoose.model(
  "PortfolioTimeseries",
  portfolioTimeseriesSchema
);

export default PortfolioTimeseries;
