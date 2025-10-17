import mongoose from "mongoose";

const accountPositionsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    asOfDate: {
      type: Date,
      default: Date.now,
      required: true,
    },

    accountId: {
      type: String,
      required: true,
    },

    symbol: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: false,
      default: "Unknown Security",
    },

    currency: {
      type: String,
      required: true,
    },

    units: { type: Number, required: true },

    price: {
      type: Number,
      required: true,
    },
    // Volume-weighted average purchase price per unit
    averagePurchasePrice: { type: Number, required: true },
    // Current market value of the position (units * price)
    marketValue: { type: Number, required: true },

    typeCode: {
      type: String,
      required: false,
      default: "",
    },

    typeDescription: {
      type: String,
      required: false,
      default: "",
    },
    // Open profit/loss in account currency reported by brokerage/SnapTrade
    openPnl: {
      type: Number,
      default: 0,
    },

    fractionalUnits: {
      type: Number,
      default: 0,
    },

    exchange: {
      type: String,
      default: "Unknown",
    },

    isCashEquivalent: {
      type: Boolean,
      default: false,
    },

    symbolDetails: {
      rawSymbol: String,

      figiCode: String,

      exchangeCode: String,

      exchangeName: String,

      timezone: String,

      startTime: String,

      closeTime: String,

      suffix: String,

      typeCode: String,

      typeDescription: String,

      localId: String,

      isQuotable: Boolean,

      isTradable: Boolean,
    },
    // Document creation timestamp for internal auditing
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

const AccountPositions = mongoose.model(
  "SnapTradeAccountPositions",
  accountPositionsSchema
);

export default AccountPositions;
