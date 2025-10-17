import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    }, // MongoDB document identifier
    userId: {
      type: String,
      required: true,
      index: true,
    }, // Internal user identifier linking to app user
    brokerageAuthorizationId: {
      type: String,
      required: true,
    }, // SnapTrade connection id (brokerage_authorization)
    accountId: {
      type: String,
      required: true,
      unique: true,
    }, // SnapTrade account id (id)
    accountName: {
      type: String,
      required: true,
    }, // Account display name (name)
    number: {
      type: String,
    }, // Brokerage account number (may be masked)
    currency: {
      type: String,
      required: true,
      default: "USD",
    }, 
    institutionName: {
      type: String,
      required: true,
    }, // Brokerage institution name
    createdDate: {
      type: Date,
    }, 
    syncStatus: {
      transactions: {
        initial_sync_completed: { type: Boolean }, 
        last_successful_sync: { type: Date },
        first_transaction_date: { type: Date }, 
      },
      holdings: {
        initial_sync_completed: { type: Boolean }, 
        last_successful_sync: { type: Date }, 
      },
    }, 
    balance: {
      total: {
        amount: { type: Number }, 
        currency: { type: String }, 
      },
    }, //Contains balanceinfo
    raw_type: {
      type: String,
    }, 
    status: {
      type: String,
      enum: ["open", "closed", "archived"],
      default: null,
    },
  },
  { timestamps: true }
);


const Account = mongoose.model("SnapTradeAccount", accountSchema);

export default Account;
