import mongoose from "mongoose";

// SnapTrade "Get account detail" response model
// Mirrors API fields while following our camelCase conventions
const accountDetailSchema = new mongoose.Schema(
  {

    userId: {
      type: String,
      index: true,
    },

    // SnapTrade account identifiers
    accountId: {
      type: String,
      required: true,
      unique: true, 
      index: true,
    },
    brokerageAuthorizationId: {
      type: String,
      required: true, // connection id in SnapTrade
      index: true,
    },


    name: { type: String, default: null },
    number: { type: String },
    institutionName: { type: String },
    createdDate: { type: Date }, 

    // Sync status
    syncStatus: {
      transactions: {
        initial_sync_completed: { type: Boolean, default: null },
        last_successful_sync: { type: Date, default: null },
        first_transaction_date: { type: Date, default: null },
      },
      holdings: {
        initial_sync_completed: { type: Boolean, default: null },
        last_successful_sync: { type: Date, default: null },
      },
    },

    // Balance block
    balance: {
      total: {
        amount: { type: Number, default: null },
        currency: { type: String },
      },
    },

    // Account status and type
    status: {
      type: String,
      enum: ["open", "closed", "archived", null],
      default: null,
    },
    rawType: { type: String, default: null },
  },
  { timestamps: true }
);


const AccountDetails = mongoose.model(
  "SnapTradeAccountDetails",
  accountDetailSchema
);

export default AccountDetails;
