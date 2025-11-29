/**
 * Options Service Client
 *
 * Wraps the SnapTrade SDK options endpoints (listOptionHoldings, getOptionsChain)
 */
import SnapTradeClientService from "./snapTradeClient.js";

const snapTradeClient = new SnapTradeClientService();

class OptionsServiceClientService {
  constructor() {
    this.client = snapTradeClient.getClient();
  }

  /**
   * List option holdings for an account
   * @param {string} userId
   * @param {string} userSecret
   * @param {string} accountId
   */
  async listOptionHoldings(userId, userSecret, accountId) {
    const response = await this.client.options.listOptionHoldings({
      userId,
      userSecret,
      accountId,
    });
    return response.data;
  }

  /**
   * Get options chain for an underlying symbol
   * @param {object} params - parameters passed directly to SDK's getOptionsChain
   */
  async getOptionsChain(params = {}) {
    const { userId, userSecret, accountId } = params || {};

    if (!userId || !userSecret || !accountId) {
      throw new Error(
        "Missing required parameters: userId, userSecret and accountId are required to fetch options chain"
      );
    }

    // SDK requires a `symbol` (universal symbol id). If caller provided a
    // `ticker` instead, resolve it to a universal symbol via the referenceData API.
    let symbol = params.symbol;

    const stripQuotes = (v) =>
      typeof v === "string" ? v.replace(/^['\"]+|['\"]+$/g, "").trim() : v;

    if (typeof symbol === "string") {
      symbol = stripQuotes(symbol);
    }

    // Determine ticker to resolve: prefer explicit params.ticker, otherwise
    // if params.symbol exists but is not a UUID, treat it as a ticker and resolve.
    let ticker = params.ticker;
    const isUuid = (v) =>
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    if ((!ticker || ticker === "") && symbol && !isUuid(symbol)) {
      ticker = symbol;
    }

    if (ticker) {
      // Attempt to resolve ticker -> universal symbol id
      try {
        // The SDK expects an object payload with `query` (the ticker string)
        const resp = await this.client.referenceData.getSymbolsByTicker({
          query: ticker,
        });
        const symbolObj = resp && resp.data ? resp.data : resp;
        if (symbolObj) {
          // The reference data endpoint may return an object or array; handle common shapes
          const candidate = Array.isArray(symbolObj) ? symbolObj[0] : symbolObj;
          if (
            candidate &&
            (candidate.id || candidate.symbol || candidate.universal_id)
          ) {
            symbol =
              candidate.id ||
              candidate.universal_id ||
              (candidate.symbol && candidate.symbol.id) ||
              symbol;
          }
        }
      } catch (err) {
        console.error(
          "Error resolving ticker to universal symbol:",
          err && err.message ? err.message : err
        );
      }
    }

    if (!symbol) {
      throw new Error(
        "Could not resolve a universal symbol id. Provide a valid `symbol` (UUID) or a `ticker` that can be resolved."
      );
    }
    try {
      // Minimal debug log (do NOT log userSecret)
      console.log("Calling SnapTrade options.getOptionsChain", {
        userId,
        accountId,
        symbol,
        hasUserSecret: Boolean(userSecret),
      });

      const response = await this.client.options.getOptionsChain({
        userId,
        userSecret,
        accountId,
        symbol,
      });

      // SDK calls sometimes return the axios-like response or the data
      // directly. Normalize to response.data when available.
      return response && response.data ? response.data : response;
    } catch (err) {
      // Provide richer logs for debugging while preserving thrown error
      try {
        const debug = {
          message: err.message,
          // axios-style response shape
          status: err.response?.status,
          data: err.response?.data,
          headers: err.response?.headers,
          // request config (mask sensitive values if present)
          requestConfig: err.config
            ? {
                url: err.config.url,
                method: err.config.method,
                params: err.config.params,
              }
            : undefined,
        };
        console.error(
          "Error calling SnapTrade options.getOptionsChain:",
          debug
        );
      } catch (logErr) {
        // If logging fails, still log the original error
        console.error(
          "Error calling SnapTrade options.getOptionsChain (failed to format):",
          err
        );
      }

      // Re-throw the original error to preserve response/status for upstream handlers
      throw err;
    }
  }
}

export default OptionsServiceClientService;
