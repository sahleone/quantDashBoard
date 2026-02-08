import mongoose from "mongoose";

const accountBalancesSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    asOfDate: {
      type: Date,
      required: true,
    },
    accountId: {
      type: String,
      required: true,
    },
    // SnapTrade balances API currency object structure
    currency: {
      id: { type: String }, // SnapTrade currency UUID
      code: { type: String }, // ISO-4217 currency code
      name: { type: String }, // Human friendly currency name
    },
    cash: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
    },
    buyingPower: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
      
    },
    accountBalance: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    openPn1: {
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

// Enforce uniqueness at the database level to prevent race-condition duplicates
accountBalancesSchema.index({ accountId: 1, asOfDate: 1 }, { unique: true });

const AccountBalances = mongoose.model(
  "SnapTradeAccountBalances",
  accountBalancesSchema
);

export default AccountBalances;
