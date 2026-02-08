import mongoose from "mongoose";

// SnapTrade account activities storage model
// Matches the shape produced by AccountServiceClientService.transformActivitiesForMongoDB
const activitiesSchema = new mongoose.Schema(
  {
    // normalized fields
    accountId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    activityId: { type: String, required: true, index: true },
    externalReferenceId: { type: String, default: null },
    type: { type: String, default: null },
    // normalized date (prefer trade_date if present)
    date: { type: Date, default: null, index: true },
    trade_date: { type: Date, default: null },
    settlement_date: { type: Date, default: null },
    description: { type: String, default: null },

    // symbol info (store both normalized ticker and raw object)
    symbol: { type: String, default: null },
    symbolObj: { type: mongoose.Schema.Types.Mixed, default: null },
    option_symbol: { type: mongoose.Schema.Types.Mixed, default: null },

    // quantities / amounts
    quantity: { type: Number, default: null },
    units: { type: Number, default: null },
    price: { type: Number, default: null },
    amount: { type: Number, default: null },

    // currency and fees
    currency: { type: String, default: null },
    currencyObj: { type: mongoose.Schema.Types.Mixed, default: null },
    fee: { type: Number, default: null },
    fees: { type: mongoose.Schema.Types.Mixed, default: null },
    fx_rate: { type: Number, default: null },

    // other metadata
    option_type: { type: String, default: null },
    institution: { type: String, default: null },
    netAmount: { type: Number, default: null },

    // store raw activity if needed for debugging
    raw: { type: mongoose.Schema.Types.Mixed, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// Enforce uniqueness at the database level to prevent race-condition duplicates
activitiesSchema.index({ accountId: 1, activityId: 1 }, { unique: true });

const Activities = mongoose.model(
  "SnapTradeAccountActivities",
  activitiesSchema
);

export default Activities;
