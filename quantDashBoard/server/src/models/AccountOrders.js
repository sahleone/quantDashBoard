import mongoose from "mongoose";

// SnapTrade "List account orders" response model
// Docs: https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getUserAccountOrders
const accountOrdersSchema = new mongoose.Schema(
  {

    accountId: { type: String, required: true, index: true }, // SnapTrade account UUID
    userId: { type: String, index: true },


    brokerage_order_id: { type: String, required: true },
    status: { type: String },

  
    universal_symbol: {
      id: { type: String },
      symbol: { type: String },
      raw_symbol: { type: String },
      description: { type: String, default: null },
      currency: {
        id: { type: String },
        code: { type: String },
        name: { type: String },
      },
      exchange: {
        id: { type: String },
        code: { type: String },
        mic_code: { type: String },
        name: { type: String },
        timezone: { type: String },
        start_time: { type: String },
        close_time: { type: String },
        suffix: { type: String, default: null },
      },
      type: {
        id: { type: String },
        code: { type: String },
        description: { type: String },
      },
      figi_code: { type: String, default: null },
      figi_instrument: {
        figi_code: { type: String, default: null },
        figi_share_class: { type: String, default: null },
      },
    },

  
    option_symbol: {
      id: { type: String },
      ticker: { type: String },
      option_type: { type: String },
      strike_price: { type: Number },
      expiration_date: { type: String },
      is_mini_option: { type: Boolean },
      underlying_symbol: {
        id: { type: String },
        symbol: { type: String },
        raw_symbol: { type: String },
        description: { type: String, default: null },
        currency: {
          id: { type: String },
          code: { type: String },
          name: { type: String },
        },
        exchange: {
          id: { type: String },
          code: { type: String },
          mic_code: { type: String },
          name: { type: String },
          timezone: { type: String },
          start_time: { type: String },
          close_time: { type: String },
          suffix: { type: String },
          allows_cryptocurrency_symbols: { type: Boolean },
        },
        type: {
          id: { type: String },
          code: { type: String },
          description: { type: String },
        },
        figi_code: { type: String, default: null },
        figi_instrument: {
          figi_code: { type: String, default: null },
          figi_share_class: { type: String, default: null },
        },
        currencies: [
          {
            id: { type: String },
            code: { type: String },
            name: { type: String },
          },
        ],
      },
    },

  
    quote_universal_symbol: {
      id: { type: String },
      symbol: { type: String },
      raw_symbol: { type: String },
      description: { type: String, default: null },
      currency: {
        id: { type: String },
        code: { type: String },
        name: { type: String },
      },
      exchange: {
        id: { type: String },
        code: { type: String },
        mic_code: { type: String },
        name: { type: String },
        timezone: { type: String },
        start_time: { type: String },
        close_time: { type: String },
        suffix: { type: String, default: null },
      },
      type: {
        id: { type: String },
        code: { type: String },
        description: { type: String },
      },
      figi_code: { type: String, default: null },
      figi_instrument: {
        figi_code: { type: String, default: null },
        figi_share_class: { type: String, default: null },
      },
      currencies: [
        {
          id: { type: String },
          code: { type: String },
          name: { type: String },
        },
      ],
    },
    quote_currency: {
      id: { type: String },
      code: { type: String },
      name: { type: String },
    },

    // Order details
    action: { type: String },
    total_quantity: { type: String, default: null },
    open_quantity: { type: String, default: null },
    canceled_quantity: { type: String, default: null },
    filled_quantity: { type: String, default: null },
    execution_price: { type: Number, default: null },
    limit_price: { type: Number, default: null },
    stop_price: { type: Number, default: null },
    order_type: { type: String, default: null },
    time_in_force: { type: String },
    time_placed: { type: Date },
    time_updated: { type: Date, default: null },
    time_executed: { type: Date, default: null },
    expiry_date: { type: Date, default: null },

    // Bracket order child IDs
    child_brokerage_order_ids: {
      take_profit_order_id: { type: String },
      stop_loss_order_id: { type: String },
    },


    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);





const AccountOrders = mongoose.model(
  "SnapTradeAccountOrders",
  accountOrdersSchema
);

export default AccountOrders;
