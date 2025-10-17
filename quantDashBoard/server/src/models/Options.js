import mongoose from "mongoose";

// SnapTrade "List account option positions" response model
// Docs: https://docs.snaptrade.com/reference/Options/Options_listOptionHoldings
const optionsSchema = new mongoose.Schema(
  {

    accountId: { type: String, required: true, index: true }, // SnapTrade account UUID
    userId: { type: String, index: true },


    symbol: {

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
            suffix: { type: String, default: null },
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

      id: { type: String },
      description: { type: String, default: null },
    },


    price: { type: Number, default: null }, 
    units: { type: Number, required: true }, 
    average_purchase_price: { type: Number, default: null }, 


    currency: {
      id: { type: String },
      code: { type: String },
      name: { type: String },
    },


    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);


optionsSchema.index(
  { accountId: 1, "symbol.option_symbol.ticker": 1 },
  { unique: true }
);


optionsSchema.index({ accountId: 1, createdAt: -1 });
optionsSchema.index({ "symbol.option_symbol.underlying_symbol.symbol": 1 });
optionsSchema.index({ "symbol.option_symbol.option_type": 1 });

const Options = mongoose.model("SnapTradeAccountOptions", optionsSchema);

export default Options;
