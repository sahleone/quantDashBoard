/**
 * Account Service Client
 *
 * This service handles all account-related operations with SnapTrade,
 * including account listing, holdings retrieval, balances, positions, orders,
 * and activity history. It provides a comprehensive interface for managing
 * brokerage account data through the SnapTrade API.
 *
 * @class AccountServiceClientService
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2024
 */

import SnapTradeClientService from "./snapTradeClient.js";
import { setTimeout as delay } from "timers/promises";

// Instantiate the SnapTrade client service
const snapTradeClient = new SnapTradeClientService();

/**
 * Account Service Client Service
 *
 * Provides methods to interact with SnapTrade account information endpoints.
 * Handles authentication, data retrieval, and error management for all
 * account-related operations.
 *
 * @class AccountServiceClientService
 */
class AccountServiceClientService {
  /**
   * Creates an instance of AccountServiceClientService
   *
   * Initializes the SnapTrade client for making API calls to account endpoints.
   * The client is obtained from the singleton SnapTradeClientService instance.
   *
   * @constructor
   * @example
   * const accountService = new AccountServiceClientService();
   */
  constructor() {
    this.client = snapTradeClient.getClient();
  }

  /**
   * Retrieves a list of all accounts associated with a user
   *
   * Fetches all brokerage accounts linked to the specified user from SnapTrade.
   * This is typically the first call made to get account IDs for subsequent operations.
   *
   * @async
   * @method listAccounts
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @returns {Promise<Array>} Array of account objects containing account details
   * @throws {Error} When API call fails or authentication is invalid
   *
   * @example
   * try {
   *   const accounts = await accountService.listAccounts('user123', 'secret456');
   *   console.log(`Found ${accounts.length} accounts`);
   *   accounts.forEach(account => {
   *     console.log(`Account: ${account.name} (${account.id})`);
   *   });
   * } catch (error) {
   *   console.error('Failed to list accounts:', error.message);
   * }
   */
  async listAccounts(userId, userSecret) {
    try {
      console.log("AccountServiceClient.listAccounts called with:", {
        userId,
        userSecret: userSecret ? "***" : "missing",
      });
      const response = await this.client.accountInformation.listUserAccounts({
        userId: userId,
        userSecret: userSecret,
      });
      console.log(
        "SnapTrade API response:",
        response?.data?.length || 0,
        "accounts"
      );
      return response.data;
    } catch (error) {
      console.error("AccountServiceClient.listAccounts error:", error);
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Retrieves holdings (stocks, bonds, etc.) for a specific account
   *
   * Fetches all current holdings in the specified account, including stocks,
   * bonds, ETFs, mutual funds, and other securities with their quantities
   * and current values.
   *
   * @async
   * @method listAccountHoldings
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @returns {Promise<Array>} Array of holding objects with security details and quantities
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @example
   * try {
   *   const holdings = await accountService.listAccountHoldings('user123', 'secret456', 'account789');
   *   console.log(`Account has ${holdings.length} holdings`);
   *   holdings.forEach(holding => {
   *     console.log(`${holding.symbol}: ${holding.quantity} shares @ $${holding.price}`);
   *   });
   * } catch (error) {
   *   console.error('Failed to get holdings:', error.message);
   * }
   */
  async listAccountHoldings(userId, userSecret, accountId) {
    const response = await this.client.accountInformation.getUserHoldings({
      accountId: accountId,
      userId: userId,
      userSecret: userSecret,
    });
    return response.data;
  }

  /**
   * Transforms SnapTrade holdings data for MongoDB AccountHoldings model
   *
   * Converts SnapTrade API response format to match the AccountHoldings schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformHoldingsForMongoDB
   * @param {Array} holdings - Raw holdings data from SnapTrade API
   * @param {string} accountId - The account ID these holdings belong to
   * @returns {Array} Transformed holdings data ready for MongoDB insertion
   *
   * @example
   * const rawHoldings = await accountService.listAccountHoldings(userId, userSecret, accountId);
   * const transformedHoldings = accountService.transformHoldingsForMongoDB(rawHoldings, accountId);
   * await AccountHoldings.insertMany(transformedHoldings);
   */
  transformHoldingsForMongoDB(holdings, accountId, userId) {
    console.log("Raw holdings data:", JSON.stringify(holdings, null, 2));
    console.log("Holdings type:", typeof holdings);
    console.log("Is array:", Array.isArray(holdings));

    // Handle case where holdings might not be an array
    if (!Array.isArray(holdings)) {
      console.error("Holdings is not an array:", holdings);
      return [];
    }

    return holdings.map((holding) => ({
      userId: userId,
      asOfDate: new Date(),
      accountId: accountId,
      symbol: holding.symbol?.symbol || holding.symbol,
      description: holding.symbol?.description || "Unknown Security",
      currency: holding.symbol?.currency?.code || "USD",
      units: Number(holding.units ?? 0),
      price: Number(holding.price ?? 0),
      averagePurchasePrice: Number(holding.average_purchase_price ?? 0),
      marketValue: Number(holding.market_value ?? 0),
      typeCode: holding.symbol?.type?.code || "",
      typeDescription: holding.symbol?.type?.description || "",
      openPnl: holding.open_pnl || 0,
      fractionalUnits: holding.fractional_units || 0,
      exchange: holding.symbol?.exchange?.code || "Unknown",
      isCashEquivalent: holding.cash_equivalent || false,
      symbolDetails: {
        rawSymbol: holding.symbol?.raw_symbol,
        figiCode: holding.symbol?.figi_code,
        exchangeCode: holding.symbol?.exchange?.code,
        exchangeName: holding.symbol?.exchange?.name,
        timezone: holding.symbol?.exchange?.timezone,
        startTime: holding.symbol?.exchange?.start_time,
        closeTime: holding.symbol?.exchange?.close_time,
        suffix: holding.symbol?.exchange?.suffix,
        typeCode: holding.symbol?.type?.code,
        typeDescription: holding.symbol?.type?.description,
        localId: holding.symbol?.local_id,
        isQuotable: holding.symbol?.is_quotable,
        isTradable: holding.symbol?.is_tradable,
      },
      createdAt: new Date(),
    }));
  }

  /**
   * Retrieves detailed information about a specific account
   *
   * Fetches comprehensive account details including account type, status,
   * broker information, and other metadata associated with the account.
   *
   * @async
   * @method getAccountDetails
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @returns {Promise<Object>} Account details object containing metadata and configuration
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @example
   * try {
   *   const details = await accountService.getAccountDetails('user123', 'secret456', 'account789');
   *   console.log(`Account: ${details.name}`);
   *   console.log(`Type: ${details.type}`);
   *   console.log(`Status: ${details.status}`);
   * } catch (error) {
   *   console.error('Failed to get account details:', error.message);
   * }
   */
  async getAccountDetails(userId, userSecret, accountId) {
    const response = await this.client.accountInformation.getUserAccountDetails(
      {
        accountId: accountId,
        userId: userId,
        userSecret: userSecret,
      }
    );
    return response.data;
  }

  /**
   * Retrieves account balance information
   *
   * Fetches current balance details for the specified account, including
   * cash balances, buying power, and other financial metrics.
   *
   * @async
   * @method listAccountBalances
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @returns {Promise<Array>} Array of balance objects containing cash and buying power information
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @example
   * try {
   *   const balances = await accountService.listAccountBalances('user123', 'secret456', 'account789');
   *   console.log(`Found ${balances.length} balance records`);
   *   balances.forEach(balance => {
   *     console.log(`Cash Balance: $${balance.cash}`);
   *     console.log(`Buying Power: $${balance.buyingPower}`);
   *   });
   * } catch (error) {
   *   console.error('Failed to get account balances:', error.message);
   * }
   */
  async listAccountBalances(userId, userSecret, accountId) {
    const response = await this.client.accountInformation.getUserAccountBalance(
      {
        accountId: accountId,
        userId: userId,
        userSecret: userSecret,
      }
    );
    return response.data;
  }

  /**
   * Retrieves account positions (open trades and investments)
   *
   * Fetches all current positions in the specified account, including
   * long and short positions, options, and other derivative instruments.
   *
   * @async
   * @method listAccountPositions
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @returns {Promise<Array>} Array of position objects with trade details and P&L information
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @example
   * try {
   *   const positions = await accountService.listAccountPositions('user123', 'secret456', 'account789');
   *   console.log(`Account has ${positions.length} positions`);
   *   positions.forEach(position => {
   *     console.log(`${position.symbol}: ${position.quantity} @ $${position.averagePrice}`);
   *   });
   * } catch (error) {
   *   console.error('Failed to get account positions:', error.message);
   * }
   */
  async listAccountPositions(userId, userSecret, accountId) {
    const response =
      await this.client.accountInformation.getUserAccountPositions({
        accountId: accountId,
        userId: userId,
        userSecret: userSecret,
      });
    return response.data;
  }

  /**
   * Retrieves account rate of return percentages for available timeframes
   *
   * @async
   * @method getUserAccountReturnRates
   * @param {string} userId
   * @param {string} userSecret
   * @param {string} accountId
   * @returns {Promise<Object>} RateOfReturnResponse from SnapTrade
   */
  async getUserAccountReturnRates(userId, userSecret, accountId) {
    try {
      const response =
        await this.client.accountInformation.getUserAccountReturnRates({
          accountId: accountId,
          userId: userId,
          userSecret: userSecret,
        });
      return response.data;
    } catch (error) {
      console.error(
        "AccountServiceClient.getUserAccountReturnRates error:",
        error
      );
      // Log expanded SDK response details including headers for easier debugging
      console.error("SDK error details:", {
        message: error.message,
        status: error.response?.status,
        headers: error.response?.headers,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Transforms SnapTrade positions data for MongoDB AccountPositions model
   *
   * Converts SnapTrade API response format to match the AccountPositions schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformPositionsForMongoDB
   * @param {Array} positions - Raw positions data from SnapTrade API
   * @param {string} accountId - The account ID these positions belong to
   * @returns {Array} Transformed positions data ready for MongoDB insertion
   *
   * @example
   * const rawPositions = await accountService.listAccountPositions(userId, userSecret, accountId);
   * const transformedPositions = accountService.transformPositionsForMongoDB(rawPositions, accountId);
   * await AccountPositions.insertMany(transformedPositions);
   */
  transformPositionsForMongoDB(positions, accountId, userId) {
    console.log("Raw positions data:", JSON.stringify(positions, null, 2));
    console.log("Positions type:", typeof positions);
    console.log("Is array:", Array.isArray(positions));

    // Handle case where positions might not be an array
    if (!Array.isArray(positions)) {
      console.error("Positions is not an array:", positions);
      return [];
    }

    return positions.map((position) => {
      console.log("Processing position:", JSON.stringify(position, null, 2));
      console.log("Position symbol type:", typeof position.symbol);
      console.log("Position symbol value:", position.symbol);

      // Extract symbol ticker safely
      let symbolTicker = "UNKNOWN";
      if (typeof position.symbol === "string") {
        symbolTicker = position.symbol;
      } else if (position.symbol && typeof position.symbol === "object") {
        // Handle nested symbol structure
        if (
          position.symbol.symbol &&
          typeof position.symbol.symbol === "object"
        ) {
          symbolTicker =
            position.symbol.symbol.symbol ||
            position.symbol.symbol.raw_symbol ||
            "UNKNOWN";
        } else {
          symbolTicker =
            position.symbol.symbol || position.symbol.raw_symbol || "UNKNOWN";
        }
      }

      console.log(
        "Final symbolTicker:",
        symbolTicker,
        "Type:",
        typeof symbolTicker
      );

      return {
        userId: userId,
        asOfDate: new Date(),
        accountId: accountId,
        symbolTicker: symbolTicker,
        // Safely derive exchange code from either the top-level symbol or
        // the nested symbol object structure returned by SnapTrade.
        listingExchangeCode:
          position.symbol?.exchange?.code ||
          position.symbol?.symbol?.exchange?.code ||
          null,
        positionSymbol: {
          symbol: {
            id: position.symbol?.symbol?.id || position.symbol?.id,
            symbol: position.symbol?.symbol?.symbol || position.symbol?.symbol,
            raw_symbol:
              position.symbol?.symbol?.raw_symbol ||
              position.symbol?.raw_symbol,
            description:
              position.symbol?.symbol?.description ||
              position.symbol?.description,
            currency: {
              id:
                position.symbol?.symbol?.currency?.id ||
                position.symbol?.currency?.id,
              code:
                position.symbol?.symbol?.currency?.code ||
                position.symbol?.currency?.code,
              name:
                position.symbol?.symbol?.currency?.name ||
                position.symbol?.currency?.name,
            },
            exchange: {
              id:
                position.symbol?.symbol?.exchange?.id ||
                position.symbol?.exchange?.id,
              code:
                position.symbol?.symbol?.exchange?.code ||
                position.symbol?.exchange?.code,
              mic_code:
                position.symbol?.symbol?.exchange?.mic_code ||
                position.symbol?.exchange?.mic_code,
              name:
                position.symbol?.symbol?.exchange?.name ||
                position.symbol?.exchange?.name,
              timezone:
                position.symbol?.symbol?.exchange?.timezone ||
                position.symbol?.exchange?.timezone,
              start_time:
                position.symbol?.symbol?.exchange?.start_time ||
                position.symbol?.exchange?.start_time,
              close_time:
                position.symbol?.symbol?.exchange?.close_time ||
                position.symbol?.exchange?.close_time,
              suffix:
                position.symbol?.symbol?.exchange?.suffix ||
                position.symbol?.exchange?.suffix,
            },
            type: {
              id:
                position.symbol?.symbol?.type?.id || position.symbol?.type?.id,
              code:
                position.symbol?.symbol?.type?.code ||
                position.symbol?.type?.code,
              description:
                position.symbol?.symbol?.type?.description ||
                position.symbol?.type?.description,
            },
            figi_code:
              position.symbol?.symbol?.figi_code || position.symbol?.figi_code,
            figi_instrument: {
              figi_code:
                position.symbol?.symbol?.figi_instrument?.figi_code ||
                position.symbol?.figi_instrument?.figi_code,
              figi_share_class:
                position.symbol?.symbol?.figi_instrument?.figi_share_class ||
                position.symbol?.figi_instrument?.figi_share_class,
            },
          },
          id: position.id,
          description: position.description,
          local_id: position.local_id,
          is_quotable: position.is_quotable,
          is_tradable: position.is_tradable,
        },
        units: Number(position.units ?? 0),
        price: Number(position.price ?? 0),
        open_pnl: Number(position.open_pnl ?? 0),
        average_purchase_price: Number(position.average_purchase_price ?? 0),
        currency: {
          id: position.currency?.id,
          code: position.currency?.code,
          name: position.currency?.name,
        },
        cash_equivalent: position.cash_equivalent,
        createdAt: new Date(),
      };
    });
  }

  /**
   * Retrieves historical orders for a specific account
   *
   * Fetches all orders (buy, sell, etc.) placed in the specified account
   * within the given time period. Useful for trade history and analysis.
   *
   * @async
   * @method listAccountOrders
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @param {number} [days=30] - Number of days to look back for orders (default: 30)
   * @returns {Promise<Array>} Array of order objects with execution details and status
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @example
   * try {
   *   const orders = await accountService.listAccountOrders('user123', 'secret456', 'account789', 7);
   *   console.log(`Found ${orders.length} orders in the last 7 days`);
   *   orders.forEach(order => {
   *     console.log(`${order.side} ${order.quantity} ${order.symbol} @ $${order.price}`);
   *   });
   * } catch (error) {
   *   console.error('Failed to get account orders:', error.message);
   * }
   */
  async listAccountOrders(userId, userSecret, accountId, days = 30) {
    const response = await this.client.accountInformation.getUserAccountOrders({
      accountId: accountId,
      userId: userId,
      userSecret: userSecret,
      days: days,
    });
    return response.data;
  }

  /**
   * Retrieves recent orders for a specific account
   *
   * Fetches the most recent orders placed in the specified account within
   * the given time period. This is similar to listAccountOrders but may
   * have different filtering or sorting applied by SnapTrade.
   *
   * @async
   * @method listAccountOrdersRecent
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @param {number} [days=30] - Number of days to look back for recent orders (default: 30)
   * @returns {Promise<Array>} Array of recent order objects with execution details and status
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @example
   * try {
   *   const recentOrders = await accountService.listAccountOrdersRecent('user123', 'secret456', 'account789', 3);
   *   console.log(`Found ${recentOrders.length} recent orders in the last 3 days`);
   *   recentOrders.forEach(order => {
   *     console.log(`Recent: ${order.side} ${order.quantity} ${order.symbol}`);
   *   });
   * } catch (error) {
   *   console.error('Failed to get recent orders:', error.message);
   * }
   */
  async listAccountOrdersRecent(userId, userSecret, accountId, days = 30) {
    const response =
      await this.client.accountInformation.getUserAccountRecentOrders({
        accountId: accountId,
        userId: userId,
        userSecret: userSecret,
        days: days,
      });
    return response.data;
  }

  /**
   * Transforms SnapTrade orders data for MongoDB AccountOrders model
   *
   * Converts SnapTrade API response format to match the AccountOrders schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformOrdersForMongoDB
   * @param {Array} orders - Raw orders data from SnapTrade API
   * @param {string} accountId - The account ID these orders belong to
   * @param {string} userId - The user ID these orders belong to
   * @returns {Array} Transformed orders data ready for MongoDB insertion
   *
   * @example
   * const rawOrders = await accountService.listAccountOrders(userId, userSecret, accountId, 30);
   * const transformedOrders = accountService.transformOrdersForMongoDB(rawOrders, accountId, userId);
   * await AccountOrders.insertMany(transformedOrders);
   */
  transformOrdersForMongoDB(orders, accountId, userId) {
    return orders.map((order) => ({
      accountId: accountId,
      userId: userId,
      brokerage_order_id: order.brokerage_order_id,
      status: order.status,
      universal_symbol: order.symbol
        ? {
            id: order.symbol.id,
            symbol: order.symbol.symbol,
            raw_symbol: order.symbol.raw_symbol,
            description: order.symbol.description,
            currency: {
              id: order.symbol.currency?.id,
              code: order.symbol.currency?.code,
              name: order.symbol.currency?.name,
            },
            exchange: {
              id: order.symbol.exchange?.id,
              code: order.symbol.exchange?.code,
              mic_code: order.symbol.exchange?.mic_code,
              name: order.symbol.exchange?.name,
              timezone: order.symbol.exchange?.timezone,
              start_time: order.symbol.exchange?.start_time,
              close_time: order.symbol.exchange?.close_time,
              suffix: order.symbol.exchange?.suffix,
            },
            type: {
              id: order.symbol.type?.id,
              code: order.symbol.type?.code,
              description: order.symbol.type?.description,
            },
            figi_code: order.symbol.figi_code,
            figi_instrument: {
              figi_code: order.symbol.figi_instrument?.figi_code,
              figi_share_class: order.symbol.figi_instrument?.figi_share_class,
            },
          }
        : null,
      option_symbol: order.option_symbol
        ? {
            id: order.option_symbol.id,
            ticker: order.option_symbol.ticker,
            option_type: order.option_symbol.option_type,
            strike_price: order.option_symbol.strike_price,
            expiration_date: order.option_symbol.expiration_date,
            is_mini_option: order.option_symbol.is_mini_option,
            underlying_symbol: {
              id: order.option_symbol.underlying_symbol?.id,
              symbol: order.option_symbol.underlying_symbol?.symbol,
              raw_symbol: order.option_symbol.underlying_symbol?.raw_symbol,
              description: order.option_symbol.underlying_symbol?.description,
              currency: {
                id: order.option_symbol.underlying_symbol?.currency?.id,
                code: order.option_symbol.underlying_symbol?.currency?.code,
                name: order.option_symbol.underlying_symbol?.currency?.name,
              },
              exchange: {
                id: order.option_symbol.underlying_symbol?.exchange?.id,
                code: order.option_symbol.underlying_symbol?.exchange?.code,
                mic_code:
                  order.option_symbol.underlying_symbol?.exchange?.mic_code,
                name: order.option_symbol.underlying_symbol?.exchange?.name,
                timezone:
                  order.option_symbol.underlying_symbol?.exchange?.timezone,
                start_time:
                  order.option_symbol.underlying_symbol?.exchange?.start_time,
                close_time:
                  order.option_symbol.underlying_symbol?.exchange?.close_time,
                suffix: order.option_symbol.underlying_symbol?.exchange?.suffix,
                allows_cryptocurrency_symbols:
                  order.option_symbol.underlying_symbol?.exchange
                    ?.allows_cryptocurrency_symbols,
              },
              type: {
                id: order.option_symbol.underlying_symbol?.type?.id,
                code: order.option_symbol.underlying_symbol?.type?.code,
                description:
                  order.option_symbol.underlying_symbol?.type?.description,
              },
              figi_code: order.option_symbol.underlying_symbol?.figi_code,
              figi_instrument: {
                figi_code:
                  order.option_symbol.underlying_symbol?.figi_instrument
                    ?.figi_code,
                figi_share_class:
                  order.option_symbol.underlying_symbol?.figi_instrument
                    ?.figi_share_class,
              },
              currencies:
                order.option_symbol.underlying_symbol?.currencies?.map(
                  (curr) => ({
                    id: curr.id,
                    code: curr.code,
                    name: curr.name,
                  })
                ),
            },
          }
        : null,
      quote_universal_symbol: order.quote_symbol
        ? {
            id: order.quote_symbol.id,
            symbol: order.quote_symbol.symbol,
            raw_symbol: order.quote_symbol.raw_symbol,
            description: order.quote_symbol.description,
            currency: {
              id: order.quote_symbol.currency?.id,
              code: order.quote_symbol.currency?.code,
              name: order.quote_symbol.currency?.name,
            },
            exchange: {
              id: order.quote_symbol.exchange?.id,
              code: order.quote_symbol.exchange?.code,
              mic_code: order.quote_symbol.exchange?.mic_code,
              name: order.quote_symbol.exchange?.name,
              timezone: order.quote_symbol.exchange?.timezone,
              start_time: order.quote_symbol.exchange?.start_time,
              close_time: order.quote_symbol.exchange?.close_time,
              suffix: order.quote_symbol.exchange?.suffix,
            },
            type: {
              id: order.quote_symbol.type?.id,
              code: order.quote_symbol.type?.code,
              description: order.quote_symbol.type?.description,
            },
            figi_code: order.quote_symbol.figi_code,
            figi_instrument: {
              figi_code: order.quote_symbol.figi_instrument?.figi_code,
              figi_share_class:
                order.quote_symbol.figi_instrument?.figi_share_class,
            },
            currencies: order.quote_symbol.currencies?.map((curr) => ({
              id: curr.id,
              code: curr.code,
              name: curr.name,
            })),
          }
        : null,
      quote_currency: order.quote_currency
        ? {
            id: order.quote_currency.id,
            code: order.quote_currency.code,
            name: order.quote_currency.name,
          }
        : null,
      action: order.action,
      total_quantity: order.total_quantity,
      open_quantity: order.open_quantity,
      canceled_quantity: order.canceled_quantity,
      filled_quantity: order.filled_quantity,
      execution_price: order.execution_price,
      limit_price: order.limit_price,
      stop_price: order.stop_price,
      order_type: order.order_type,
      time_in_force: order.time_in_force,
      time_placed: order.time_placed ? new Date(order.time_placed) : null,
      time_updated: order.time_updated ? new Date(order.time_updated) : null,
      time_executed: order.time_executed ? new Date(order.time_executed) : null,
      expiry_date: order.expiry_date ? new Date(order.expiry_date) : null,
      child_brokerage_order_ids: {
        take_profit_order_id:
          order.child_brokerage_order_ids?.take_profit_order_id,
        stop_loss_order_id: order.child_brokerage_order_ids?.stop_loss_order_id,
      },
      createdAt: new Date(),
    }));
  }

  /**
   * Retrieves comprehensive account activity history with pagination support
   *
   * Fetches all account activities (trades, dividends, fees, transfers, etc.)
   * for the specified account with support for pagination, date filtering,
   * and activity type filtering. This method handles large datasets by
   * automatically paginating through results and includes rate limiting.
   *
   * @async
   * @method listAllAccountActivities
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @param {number} [limit=1000] - Maximum number of activities per page (default: 1000)
   * @param {string|null} [startDate=null] - Start date for filtering activities (YYYY-MM-DD format)
   * @param {string|null} [endDate=null] - End date for filtering activities (YYYY-MM-DD format)
   * @param {string} [type="BUY,SELL,DIVIDEND"] - Comma-separated list of activity types to include
   * @returns {Promise<Array>} Array of all activity objects matching the criteria
   * @throws {Error} When API call fails, account not found, or authentication is invalid
   *
   * @description
   * Supported activity types:
   * - BUY: Purchase transactions
   * - SELL: Sale transactions
   * - DIVIDEND: Dividend payments
   * - CONTRIBUTION: Account contributions
   * - WITHDRAWAL: Account withdrawals
   * - REI: Reinvestment activities
   * - STOCK_DIVIDEND: Stock dividend distributions
   * - INTEREST: Interest payments
   * - FEE: Account fees
   * - OPTIONEXPIRATION: Option expiration events
   * - OPTIONEXERCISE: Option exercise events
   * - OPTIONASSIGNMENT: Option assignment events
   * - TRANSFER: Account transfers
   *
   * @example
   * // Get all activities for the last 30 days
   * try {
   *   const activities = await accountService.listAllAccountActivities(
   *     'user123',
   *     'secret456',
   *     'account789'
   *   );
   *   console.log(`Found ${activities.length} total activities`);
   * } catch (error) {
   *   console.error('Failed to get activities:', error.message);
   * }
   *
   * @example
   * // Get only buy/sell activities for a specific date range
   * try {
   *   const trades = await accountService.listAllAccountActivities(
   *     'user123',
   *     'secret456',
   *     'account789',
   *     500,
   *     '2024-01-01',
   *     '2024-01-31',
   *     'BUY,SELL'
   *   );
   *   console.log(`Found ${trades.length} trades in January 2024`);
   * } catch (error) {
   *   console.error('Failed to get trades:', error.message);
   * }
   */
  async listAllAccountActivities(
    userId,
    userSecret,
    accountId,
    limit = 1000,
    startDate = null,
    endDate = null,
    type = "BUY,SELL,DIVIDEND"
  ) {
    let allActivities = [];
    let offset = 0;
    let hasMorePages = true;
    const params = {
      accountId: accountId,
      userId: userId,
      userSecret: userSecret,
      offset: offset,
      limit: limit,
      type: "",
      count: 0,
    };

    let types = [
      "BUY",
      "SELL",
      "DIVIDEND",
      "CONTRIBUTION",
      "WITHDRAWAL",
      "REI",
      "STOCK_DIVIDEND",
      "INTEREST",
      "FEE",
      "OPTIONEXPIRATION",
      "OPTIONEXERCISE",
      "OPTIONASSIGNMENT",
      "TRANSFER",
    ];

    let typeSplit = type.split(",");

    for (const type of typeSplit) {
      if (types.includes(type)) {
        params.type += type + ",";
      } else {
        console.log(`Invalid type: ${type}`);
      }
    }

    params.type = params.type.slice(0, -1);

    while (hasMorePages) {
      if (startDate) {
        params.startDate = startDate;
      }

      if (endDate) {
        params.endDate = endDate;
      }

      const response =
        await this.client.accountInformation.getAccountActivities(params);

      const page = response.data || {};
      const activities = Array.isArray(page.data) ? page.data : [];
      const pagination = page.pagination || {};

      allActivities = allActivities.concat(activities);

      if (activities.length < limit) {
        hasMorePages = false;
      } else if (
        typeof pagination.total === "number" &&
        params.offset + activities.length >= pagination.total
      ) {
        hasMorePages = false;
      } else {
        params.offset += limit;
        console.log(`Fetching next page...`);
        params.count++;
        await delay(500);
      }
      if (params.count > 10) {
        hasMorePages = false;
        console.log(
          `Reached self-imposed limit of 10 pages, stopping... cuz WTF`
        );
      }
    }
    return allActivities;
  }

  /**
   * Transforms SnapTrade activities data for MongoDB storage
   *
   * Converts SnapTrade API response format to match a generic activities schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformActivitiesForMongoDB
   * @param {Array} activities - Raw activities data from SnapTrade API
   * @param {string} accountId - The account ID these activities belong to
   * @param {string} userId - The user ID these activities belong to
   * @returns {Array} Transformed activities data ready for MongoDB insertion
   *
   * @example
   * const rawActivities = await accountService.listAllAccountActivities(userId, userSecret, accountId);
   * const transformedActivities = accountService.transformActivitiesForMongoDB(rawActivities, accountId, userId);
   * await Activities.insertMany(transformedActivities);
   */
  transformActivitiesForMongoDB(activities, accountId, userId) {
    return activities.map((activity) => ({
      accountId: accountId,
      userId: userId,
      activityId: activity.id,
      type: activity.type,
      date: activity.date ? new Date(activity.date) : null,
      description: activity.description,
      symbol: activity.symbol?.symbol || activity.symbol,
      quantity: activity.quantity,
      price: activity.price,
      amount: activity.amount,
      currency: activity.currency?.code || activity.currency,
      fees: activity.fees,
      netAmount: activity.net_amount,
      createdAt: new Date(),
    }));
  }

  /**
   * Transforms SnapTrade account data for MongoDB AccountsList model
   *
   * Converts SnapTrade API response format to match the AccountsList schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformAccountsForMongoDB
   * @param {Array} accounts - Raw accounts data from SnapTrade API
   * @param {string} userId - The user ID these accounts belong to
   * @returns {Array} Transformed accounts data ready for MongoDB insertion
   *
   * @example
   * const rawAccounts = await accountService.listAccounts(userId, userSecret);
   * const transformedAccounts = accountService.transformAccountsForMongoDB(rawAccounts, userId);
   * await AccountsList.insertMany(transformedAccounts);
   */
  transformAccountsForMongoDB(accounts, userId) {
    return accounts.map((account) => ({
      userId: userId,
      brokerageAuthorizationId: account.brokerage_authorization,
      accountId: account.id,
      accountName: account.name,
      number: account.number,
      currency: account.currency?.code || account.currency || "USD",
      institutionName: account.institution_name,
      createdDate: account.created_date ? new Date(account.created_date) : null,
      syncStatus: {
        transactions: {
          initial_sync_completed:
            account.sync_status?.transactions?.initial_sync_completed,
          last_successful_sync: account.sync_status?.transactions
            ?.last_successful_sync
            ? new Date(account.sync_status.transactions.last_successful_sync)
            : null,
          first_transaction_date: account.sync_status?.transactions
            ?.first_transaction_date
            ? new Date(account.sync_status.transactions.first_transaction_date)
            : null,
        },
        holdings: {
          initial_sync_completed:
            account.sync_status?.holdings?.initial_sync_completed,
          last_successful_sync: account.sync_status?.holdings
            ?.last_successful_sync
            ? new Date(account.sync_status.holdings.last_successful_sync)
            : null,
        },
      },
      balance: {
        total: {
          amount: account.balance?.total?.amount,
          currency:
            account.balance?.total?.currency?.code ||
            account.balance?.total?.currency,
        },
      },
      raw_type: account.raw_type,
      status: account.status,
    }));
  }

  /**
   * Transforms SnapTrade account details for MongoDB AccountDetail model
   *
   * Converts SnapTrade API response format to match the AccountDetail schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformAccountDetailsForMongoDB
   * @param {Object} accountDetail - Raw account detail data from SnapTrade API
   * @param {string} userId - The user ID this account belongs to
   * @returns {Object} Transformed account detail data ready for MongoDB insertion
   *
   * @example
   * const rawDetail = await accountService.getAccountDetails(userId, userSecret, accountId);
   * const transformedDetail = accountService.transformAccountDetailsForMongoDB(rawDetail, userId);
   * await AccountDetail.create(transformedDetail);
   */
  transformAccountDetailsForMongoDB(accountDetail, userId) {
    return {
      userId: userId,
      accountId: accountDetail.id,
      brokerageAuthorizationId: accountDetail.brokerage_authorization,
      name: accountDetail.name,
      number: accountDetail.number,
      institutionName: accountDetail.institution_name,
      createdDate: accountDetail.created_date
        ? new Date(accountDetail.created_date)
        : null,
      syncStatus: {
        transactions: {
          initial_sync_completed:
            accountDetail.sync_status?.transactions?.initial_sync_completed,
          last_successful_sync: accountDetail.sync_status?.transactions
            ?.last_successful_sync
            ? new Date(
                accountDetail.sync_status.transactions.last_successful_sync
              )
            : null,
          first_transaction_date: accountDetail.sync_status?.transactions
            ?.first_transaction_date
            ? new Date(
                accountDetail.sync_status.transactions.first_transaction_date
              )
            : null,
        },
        holdings: {
          initial_sync_completed:
            accountDetail.sync_status?.holdings?.initial_sync_completed,
          last_successful_sync: accountDetail.sync_status?.holdings
            ?.last_successful_sync
            ? new Date(accountDetail.sync_status.holdings.last_successful_sync)
            : null,
        },
      },
      balance: {
        total: {
          amount: accountDetail.balance?.total?.amount,
          currency:
            accountDetail.balance?.total?.currency?.code ||
            accountDetail.balance?.total?.currency,
        },
      },
      status: accountDetail.status,
      rawType: accountDetail.raw_type,
    };
  }

  /**
   * Transforms SnapTrade balances data for MongoDB AccountBalances model
   *
   * Converts SnapTrade API response format to match the AccountBalances schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformBalancesForMongoDB
   * @param {Array|Object} balances - Raw balances data from SnapTrade API (array or single object)
   * @param {string} accountId - The account ID these balances belong to
   * @returns {Object} Transformed balances data ready for MongoDB insertion
   *
   * @example
   * const rawBalances = await accountService.listAccountBalances(userId, userSecret, accountId);
   * const transformedBalances = accountService.transformBalancesForMongoDB(rawBalances, accountId);
   * await AccountBalances.create(transformedBalances);
   */
  transformBalancesForMongoDB(balances, accountId, userId) {
    // Handle both array and single object responses
    const balanceData = Array.isArray(balances) ? balances[0] : balances;

    if (!balanceData) {
      console.warn(`No balance data found for account ${accountId}`);
      return {
        userId: userId,
        asOfDate: new Date(),
        accountId: accountId,
        currency: {
          id: null,
          code: "USD",
          name: "US Dollar",
        },
        cash: 0,
        buyingPower: 0,
        accountBalance: 0,
        openPn1: null,
        createdAt: new Date(),
      };
    }

    return {
      userId: userId,
      asOfDate: new Date(),
      accountId: accountId,
      currency: balanceData.currency || {
        id: null,
        code: "USD",
        name: "US Dollar",
      },
      cash: balanceData.cash,
      buyingPower: balanceData.buying_power,
      accountBalance: balanceData.account_balance,
      openPn1: balanceData.open_pnl,
      createdAt: new Date(),
    };
  }

  /**
   * Comprehensive data synchronization method for all account data
   *
   * Fetches and transforms all account-related data from SnapTrade API
   * and returns it in a structured format ready for MongoDB insertion.
   * This method orchestrates the entire data synchronization process.
   *
   * @async
   * @method syncAllAccountData
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} accountId - The unique identifier for the specific account
   * @param {Object} [options] - Optional configuration for data sync
   * @param {number} [options.days=30] - Number of days to look back for orders/activities
   * @param {string} [options.activityTypes="BUY,SELL,DIVIDEND"] - Activity types to include
   * @param {string} [options.startDate=null] - Start date for activities filtering
   * @param {string} [options.endDate=null] - End date for activities filtering
   * @returns {Promise<Object>} Complete account data object with all transformed data
   * @throws {Error} When API calls fail or authentication is invalid
   *
   * @example
   * try {
   *   const syncData = await accountService.syncAllAccountData('user123', 'secret456', 'account789', {
   *     days: 90,
   *     activityTypes: 'BUY,SELL,DIVIDEND,FEE',
   *     startDate: '2024-01-01',
   *     endDate: '2024-12-31'
   *   });
   *
   *   // Insert all data into MongoDB
   *   await AccountsList.create(syncData.account);
   *   await AccountDetail.create(syncData.accountDetail);
   *   await AccountBalances.create(syncData.balances);
   *   await AccountHoldings.insertMany(syncData.holdings);
   *   await AccountPositions.insertMany(syncData.positions);
   *   await AccountOrders.insertMany(syncData.orders);
   *   await Activities.insertMany(syncData.activities);
   * } catch (error) {
   *   console.error('Failed to sync account data:', error.message);
   * }
   */
  async syncAllAccountData(userId, userSecret, accountId, options = {}) {
    const {
      days = 30,
      activityTypes = "BUY,SELL,DIVIDEND",
      startDate = null,
      endDate = null,
    } = options;

    try {
      console.log(`Starting comprehensive data sync for account ${accountId}`);

      // Fetch all account data in parallel for efficiency
      const [
        accounts,
        accountDetail,
        balances,
        holdings,
        positions,
        orders,
        activities,
      ] = await Promise.all([
        this.listAccounts(userId, userSecret),
        this.getAccountDetails(userId, userSecret, accountId),
        this.listAccountBalances(userId, userSecret, accountId),
        this.listAccountHoldings(userId, userSecret, accountId),
        this.listAccountPositions(userId, userSecret, accountId),
        this.listAccountOrders(userId, userSecret, accountId, days),
        this.listAllAccountActivities(
          userId,
          userSecret,
          accountId,
          1000,
          startDate,
          endDate,
          activityTypes
        ),
      ]);

      // Find the specific account from the accounts list
      const account = accounts.find((acc) => acc.id === accountId);

      // Transform all data for MongoDB
      const transformedData = {
        account: account
          ? this.transformAccountsForMongoDB([account], userId)[0]
          : null,
        accountDetail: this.transformAccountDetailsForMongoDB(
          accountDetail,
          userId
        ),
        balances: this.transformBalancesForMongoDB(balances, accountId, userId),
        holdings: this.transformHoldingsForMongoDB(holdings, accountId, userId),
        positions: this.transformPositionsForMongoDB(
          positions,
          accountId,
          userId
        ),
        orders: this.transformOrdersForMongoDB(orders, accountId, userId),
        activities: this.transformActivitiesForMongoDB(
          activities,
          accountId,
          userId
        ),
      };

      console.log(`Data sync completed for account ${accountId}:`, {
        holdings: transformedData.holdings.length,
        positions: transformedData.positions.length,
        orders: transformedData.orders.length,
        activities: transformedData.activities.length,
      });

      return transformedData;
    } catch (error) {
      console.error(`Failed to sync data for account ${accountId}:`, error);
      throw error;
    }
  }
}

/**
 * Default export of AccountServiceClientService
 *
 * Provides a singleton instance of the account service client for use throughout
 * the application. This service handles all SnapTrade account-related operations
 * including account listing, holdings, balances, positions, orders, and activities.
 *
 * @module AccountServiceClientService
 * @default AccountServiceClientService
 *
 * @example
 * import AccountServiceClientService from './accountClient.js';
 *
 * const accountService = new AccountServiceClientService();
 *
 * // List all accounts for a user
 * const accounts = await accountService.listAccounts(userId, userSecret);
 *
 * // Get holdings for a specific account
 * const holdings = await accountService.listAccountHoldings(userId, userSecret, accountId);
 */
export default AccountServiceClientService;
