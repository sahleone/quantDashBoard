/**
 * Accounts Controller
 *
 * Handles all account and holdings management operations including
 * account listing, holdings retrieval, and data synchronization.
 * Implements the accounts API endpoints from the product spec.
 *
 * @class AccountsController
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import AccountServiceClientService from "../clients/accountClient.js";
import Account from "../models/AccountsList.js";
import AccountDetail from "../models/AccountDetail.js";
import AccountHoldings from "../models/AccountHoldings.js";
import AccountBalances from "../models/AccountBalances.js";
import AccountPositions from "../models/AccountPositions.js";
import AccountOrders from "../models/AccountOrders.js";
import {
  upsertWithDuplicateCheck,
  UNIQUE_FIELD_MAPPINGS,
} from "../utils/duplicateHandler.js";

/**
 * Accounts Controller
 *
 * Provides REST API endpoints for managing user accounts and holdings.
 * Handles account listing, holdings retrieval, data synchronization,
 * and portfolio aggregation operations.
 *
 * @class AccountsController
 */
class AccountsController {
  constructor() {
    this.accountService = new AccountServiceClientService();
  }

  /**
   * List all user accounts
   *
   * Retrieves all brokerage accounts for the authenticated user
   * with their current status and metadata.
   *
   * @async
   * @method listAccounts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/accounts
   * Body: { userId: "user123" }
   * Response: { accounts: [...], total: 5 }
   */
  async listAccounts(req, res) {
    try {
      // Get user from JWT token (set by auth middleware)
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        });
      }

      console.log(`Listing accounts for user: ${user.userId}`);

      if (!user.userSecret) {
        return res.status(400).json({
          error: {
            code: "MISSING_SNAPTRADE_CREDENTIALS",
            message: "User does not have SnapTrade credentials",
          },
        });
      }

      let storedAccounts = await Account.find({ userId: user.userId })
        .sort({ createdAt: -1 })
        .lean();

      let fetchedFromSnapTrade = false;

      if (!storedAccounts.length) {
        try {
          const snapTradeAccounts = await this.accountService.listAccounts(
            user.userId,
            user.userSecret
          );

          if (Array.isArray(snapTradeAccounts) && snapTradeAccounts.length) {
            const allowedStatuses = ["open", "closed", "archived"];
            const upsertedAccounts = [];

            for (const snapAccount of snapTradeAccounts) {
              const brokerageAuthorizationId =
                snapAccount.brokerage_authorization ||
                snapAccount.brokerage_authorization_id ||
                snapAccount.connection_id ||
                snapAccount.authorization_id ||
                null;

              if (!brokerageAuthorizationId) {
                console.warn(
                  "Skipping account missing brokerage authorization:",
                  snapAccount?.id
                );
                continue;
              }

              const normalizedStatus =
                typeof snapAccount.status === "string"
                  ? snapAccount.status.toLowerCase()
                  : null;

              const status = allowedStatuses.includes(normalizedStatus)
                ? normalizedStatus
                : null;

              const createdDate = snapAccount.created_date
                ? new Date(snapAccount.created_date)
                : null;

              const transactionsSync = snapAccount.sync_status?.transactions;
              const holdingsSync = snapAccount.sync_status?.holdings;

              const updatePayload = {
                userId: user.userId,
                brokerageAuthorizationId,
                accountId: snapAccount.id,
                accountName: snapAccount.name || "Unknown Account",
                number: snapAccount.number,
                currency:
                  snapAccount.currency?.code || snapAccount.currency || "USD",
                institutionName:
                  snapAccount.institution_name ||
                  snapAccount.brokerage ||
                  "Unknown",
                createdDate,
                syncStatus: {
                  transactions: {
                    initial_sync_completed:
                      transactionsSync?.initial_sync_completed ?? null,
                    last_successful_sync: transactionsSync?.last_successful_sync
                      ? new Date(transactionsSync.last_successful_sync)
                      : null,
                    first_transaction_date: transactionsSync?.first_transaction_date
                      ? new Date(transactionsSync.first_transaction_date)
                      : null,
                  },
                  holdings: {
                    initial_sync_completed:
                      holdingsSync?.initial_sync_completed ?? null,
                    last_successful_sync: holdingsSync?.last_successful_sync
                      ? new Date(holdingsSync.last_successful_sync)
                      : null,
                  },
                },
                balance: {
                  total: {
                    amount: snapAccount.balance?.total?.amount ?? null,
                    currency:
                      snapAccount.balance?.total?.currency?.code ||
                      snapAccount.balance?.total?.currency ||
                      null,
                  },
                },
                raw_type: snapAccount.raw_type,
                status,
                updatedAt: new Date(),
              };

              const savedAccount = await Account.findOneAndUpdate(
                {
                  userId: user.userId,
                  accountId: snapAccount.id,
                },
                {
                  $set: updatePayload,
                  $setOnInsert: {
                    createdAt: new Date(),
                  },
                },
                {
                  upsert: true,
                  new: true,
                  setDefaultsOnInsert: true,
                }
              );

              upsertedAccounts.push(savedAccount.toObject());
            }

            storedAccounts = upsertedAccounts;
            fetchedFromSnapTrade = true;
          }
        } catch (snapError) {
          console.error(
            "Error pulling accounts from SnapTrade when database empty:",
            snapError
          );
        }
      }

      const totalAccounts = storedAccounts.length;
      const openAccounts = storedAccounts.filter(
        (account) => account.status === "open"
      ).length;
      const closedAccounts = storedAccounts.filter(
        (account) => account.status === "closed"
      ).length;

      const responseAccounts = storedAccounts.map((account) => ({
        id: account._id,
        accountId: account.accountId,
        accountName: account.accountName,
        number: account.number,
        currency: account.currency,
        institutionName: account.institutionName,
        brokerageAuthorizationId: account.brokerageAuthorizationId,
        status: account.status,
        syncStatus: account.syncStatus,
        balance: account.balance,
        createdDate: account.createdDate,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      }));

      res.status(200).json({
        accounts: responseAccounts,
        total: totalAccounts,
        summary: {
          openAccounts,
          closedAccounts,
          totalAccounts,
          lastChecked: new Date(),
          source: fetchedFromSnapTrade ? "snaptrade" : "database",
        },
      });
    } catch (error) {
      console.error("Error listing accounts:", error);
      res.status(500).json({
        error: {
          code: "ACCOUNTS_LIST_FAILED",
          message: "Failed to retrieve accounts",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get account holdings with pagination and filtering
   *
   * Retrieves holdings for specified accounts with support for
   * pagination, date filtering, and account selection.
   *
   * @async
   * @method getHoldings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/accounts/holdings?accountId=123&page=1&pageSize=50
   * Body: { userId: "user123" }
   * Response: { holdings: [...], pagination: {...} }
   */
  async getHoldings(req, res) {
    try {
      const { userId } = req.body;

      // Validate required parameters
      if (!userId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: userId is required",
          },
        });
      }
      const {
        accountId,
        asOf,
        page = 1,
        pageSize = 50,
        symbol,
        assetType,
      } = req.query;

      console.log(
        `Getting holdings for user: ${userId}, account: ${accountId}`
      );

      // Build query
      const query = { userId };
      if (accountId) query.accountId = accountId;
      if (symbol) query.symbol = { $regex: symbol, $options: "i" };
      if (assetType) query.assetType = assetType;
      if (asOf) {
        const asOfDate = new Date(asOf);
        query.asOfDate = {
          $gte: new Date(
            asOfDate.getFullYear(),
            asOfDate.getMonth(),
            asOfDate.getDate()
          ),
          $lt: new Date(
            asOfDate.getFullYear(),
            asOfDate.getMonth(),
            asOfDate.getDate() + 1
          ),
        };
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(pageSize);
      const limit = parseInt(pageSize);

      // Get holdings with pagination
      const [holdings, total] = await Promise.all([
        AccountHoldings.find(query)
          .sort({ marketValue: -1 })
          .skip(skip)
          .limit(limit),
        AccountHoldings.countDocuments(query),
      ]);

      // Calculate total portfolio value
      const totalValue = await AccountHoldings.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: "$marketValue" } } },
      ]);

      res.status(200).json({
        holdings: holdings,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total: total,
          totalPages: Math.ceil(total / parseInt(pageSize)),
        },
        summary: {
          totalValue: totalValue[0]?.total || 0,
          totalHoldings: total,
          asOf: asOf || new Date().toISOString().split("T")[0],
        },
      });
    } catch (error) {
      console.error("Error getting holdings:", error);
      res.status(500).json({
        error: {
          code: "HOLDINGS_RETRIEVAL_FAILED",
          message: "Failed to retrieve holdings",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get account balances
   *
   * Retrieves current account balances directly from SnapTrade API.
   *
   * @async
   * @method getBalances
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/accounts/balances?accountId=123
   * Body: { userId: "user123", userSecret: "secret456" }
   * Response: { balances: [...], totals: {...} }
   */
  async getBalances(req, res) {
    try {
      // Get user from JWT token (set by auth middleware)
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        });
      }

      const { accountId } = req.query;

      console.log(
        `Getting balances from SnapTrade API for user: ${user.userId}, account: ${accountId}`
      );

      if (!accountId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: accountId is required",
          },
        });
      }

      // Fetch balances directly from SnapTrade API
      const snapTradeBalances = await this.accountService.listAccountBalances(
        user.userId,
        user.userSecret,
        accountId
      );

      console.log(
        `Retrieved ${snapTradeBalances.length} balance records from SnapTrade`
      );

      // Calculate totals across all currencies
      const totals = snapTradeBalances.reduce(
        (acc, balance) => ({
          cash: (acc.cash || 0) + (balance.cash || 0),
          buyingPower: (acc.buyingPower || 0) + (balance.buyingPower || 0),
        }),
        {}
      );

      res.status(200).json({
        balances: snapTradeBalances,
        totals: totals,
        asOf: new Date().toISOString().split("T")[0],
        source: "snaptrade_api",
      });
    } catch (error) {
      console.error("Error getting balances from SnapTrade API:", error);
      res.status(500).json({
        error: {
          code: "BALANCES_RETRIEVAL_FAILED",
          message: "Failed to retrieve balances from SnapTrade API",
          details: error.message,
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get account positions
   *
   * Retrieves current account positions for specified accounts.
   *
   * @async
   * @method getPositions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/accounts/positions?accountId=123
   * Body: { userId: "user123" }
   * Response: { positions: [...], summary: {...} }
   */
  async getPositions(req, res) {
    try {
      const { userId } = req.body;
      const { accountId, asOf } = req.query;

      console.log(
        `Getting positions for user: ${userId}, account: ${accountId}`
      );

      // Build query
      const query = { userId };
      if (accountId) query.accountId = accountId;
      if (asOf) {
        const asOfDate = new Date(asOf);
        query.asOfDate = {
          $gte: new Date(
            asOfDate.getFullYear(),
            asOfDate.getMonth(),
            asOfDate.getDate()
          ),
          $lt: new Date(
            asOfDate.getFullYear(),
            asOfDate.getMonth(),
            asOfDate.getDate() + 1
          ),
        };
      }

      const positions = await AccountPositions.find(query).sort({
        marketValue: -1,
      });

      // Calculate summary
      const summary = positions.reduce(
        (acc, position) => ({
          totalPositions: acc.totalPositions + 1,
          totalValue: acc.totalValue + (position.marketValue || 0),
          totalPnL: acc.totalPnL + (position.openPnl || 0),
        }),
        { totalPositions: 0, totalValue: 0, totalPnL: 0 }
      );

      res.status(200).json({
        positions: positions,
        summary: summary,
        asOf: asOf || new Date().toISOString().split("T")[0],
      });
    } catch (error) {
      console.error("Error getting positions:", error);
      res.status(500).json({
        error: {
          code: "POSITIONS_RETRIEVAL_FAILED",
          message: "Failed to retrieve positions",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Sync holdings data from SnapTrade
   *
   * Triggers a manual synchronization of holdings data from SnapTrade
   * for specified accounts or all user accounts.
   *
   * @async
   * @method syncHoldings
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/sync/holdings
   * Body: { userId: "user123", userSecret: "secret456", accountIds: ["123", "456"] }
   * Response: { message: "Sync initiated", jobId: "job-789" }
   */
  async syncHoldings(req, res) {
    try {
      // Get user from JWT token (set by auth middleware)
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        });
      }

      const { accountIds, fullSync = false, connectionId } = req.body;

      console.log(`Initiating holdings sync for user: ${user.userId}`);

      let targetAccounts = [];

      if (connectionId) {
        // If connectionId is provided, get accounts from SnapTrade for this connection
        console.log(`Syncing accounts for connection: ${connectionId}`);

        try {
          // Get accounts from SnapTrade for this specific connection
          const snapTradeAccounts = await this.accountService.listAccounts(
            user.userId,
            user.userSecret
          );

          // Filter accounts for this connection (we'll need to match by brokerage authorization)
          // For now, let's sync all accounts and let SnapTrade handle the filtering
          targetAccounts = snapTradeAccounts.map((account) => ({
            accountId: account.id,
            userId: user.userId,
            brokerageAuthorizationId: connectionId,
            accountName: account.name,
            currency: account.currency?.code || "USD",
            institutionName: account.institution_name || "Unknown",
            syncStatus: "pending",
          }));

          console.log(
            `Found ${targetAccounts.length} accounts for connection ${connectionId}`
          );
        } catch (error) {
          console.error(
            `Error getting accounts for connection ${connectionId}:`,
            error
          );
          return res.status(500).json({
            error: {
              code: "SYNC_FAILED",
              message: "Failed to get accounts for connection",
              details: error.message,
            },
          });
        }
      } else {
        // Get user accounts from database
        const accounts = await Account.find({ userId: user.userId });
        targetAccounts = accountIds
          ? accounts.filter((acc) => accountIds.includes(acc.accountId))
          : accounts;
      }

      if (targetAccounts.length === 0) {
        return res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "No accounts found for sync",
          },
        });
      }

      // Initiate sync for each account
      const syncResults = [];
      for (const account of targetAccounts) {
        try {
          const syncData = await this.accountService.syncAllAccountData(
            user.userId,
            user.userSecret,
            account.accountId,
            {
              days: fullSync ? 365 : 30,
              activityTypes: "BUY,SELL,DIVIDEND,FEE",
            }
          );

          // Store transformed data
          if (syncData.account) {
            await Account.findOneAndUpdate(
              { accountId: account.accountId },
              syncData.account,
              { upsert: true }
            );
          }

          if (syncData.accountDetail) {
            await AccountDetail.findOneAndUpdate(
              { accountId: account.accountId },
              syncData.accountDetail,
              { upsert: true }
            );
            console.log(
              `Account details synced for account ${account.accountId}`
            );
          }

          if (syncData.balances) {
            await AccountBalances.findOneAndUpdate(
              {
                accountId: account.accountId,
                asOfDate: syncData.balances.asOfDate,
              },
              syncData.balances,
              { upsert: true }
            );
          }

          // Initialize result variables
          let holdingsResult = null;
          let positionsResult = null;
          let ordersResult = null;

          if (syncData.holdings.length > 0) {
            holdingsResult = await upsertWithDuplicateCheck(
              AccountHoldings,
              syncData.holdings,
              UNIQUE_FIELD_MAPPINGS.AccountHoldings,
              "holdings"
            );
            console.log(
              `Holdings sync result for account ${account.accountId}:`,
              holdingsResult
            );
          }

          if (syncData.positions.length > 0) {
            positionsResult = await upsertWithDuplicateCheck(
              AccountPositions,
              syncData.positions,
              UNIQUE_FIELD_MAPPINGS.AccountPositions,
              "positions"
            );
            console.log(
              `Positions sync result for account ${account.accountId}:`,
              positionsResult
            );
          }

          if (syncData.orders.length > 0) {
            ordersResult = await upsertWithDuplicateCheck(
              AccountOrders,
              syncData.orders,
              UNIQUE_FIELD_MAPPINGS.AccountOrders,
              "orders"
            );
            console.log(
              `Orders sync result for account ${account.accountId}:`,
              ordersResult
            );
          }

          syncResults.push({
            accountId: account.accountId,
            status: "success",
            holdings: {
              total: syncData.holdings.length,
              result: holdingsResult || {
                total: 0,
                upserted: 0,
                duplicates: 0,
                errors: 0,
              },
            },
            positions: {
              total: syncData.positions.length,
              result: positionsResult || {
                total: 0,
                upserted: 0,
                duplicates: 0,
                errors: 0,
              },
            },
            orders: {
              total: syncData.orders.length,
              result: ordersResult || {
                total: 0,
                upserted: 0,
                duplicates: 0,
                errors: 0,
              },
            },
          });
        } catch (error) {
          console.error(`Sync failed for account ${account.accountId}:`, error);
          syncResults.push({
            accountId: account.accountId,
            status: "failed",
            error: error.message,
          });
        }
      }

      res.status(200).json({
        message: "Holdings sync completed",
        results: syncResults,
        summary: {
          totalAccounts: targetAccounts.length,
          successful: syncResults.filter((r) => r.status === "success").length,
          failed: syncResults.filter((r) => r.status === "failed").length,
        },
      });
    } catch (error) {
      console.error("Error syncing holdings:", error);
      res.status(500).json({
        error: {
          code: "HOLDINGS_SYNC_FAILED",
          message: "Failed to sync holdings",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Get position details for a specific symbol
   *
   * Retrieves detailed information about a specific position
   * across all user accounts.
   *
   * @async
   * @method getPositionDetails
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/positions/:symbol
   * Body: { userId: "user123" }
   * Response: { position: {...}, history: [...] }
   */
  async getPositionDetails(req, res) {
    try {
      const { userId } = req.body;
      const { symbol } = req.params;

      console.log(
        `Getting position details for symbol: ${symbol}, user: ${userId}`
      );

      // Get current position across all accounts
      const positions = await AccountPositions.find({
        userId,
        symbol: symbol.toUpperCase(),
      }).sort({ asOfDate: -1 });

      if (positions.length === 0) {
        return res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Position not found",
          },
        });
      }

      // Get historical data
      const history = await AccountPositions.find({
        userId,
        symbol: symbol.toUpperCase(),
      })
        .sort({ asOfDate: -1 })
        .limit(30);

      // Calculate aggregate position
      const aggregatePosition = positions.reduce(
        (acc, pos) => ({
          totalUnits: acc.totalUnits + (pos.units || 0),
          totalValue: acc.totalValue + (pos.marketValue || 0),
          totalPnL: acc.totalPnL + (pos.openPnl || 0),
          accounts: [...acc.accounts, pos.accountId],
        }),
        { totalUnits: 0, totalValue: 0, totalPnL: 0, accounts: [] }
      );

      res.status(200).json({
        symbol: symbol.toUpperCase(),
        currentPosition: positions[0],
        aggregatePosition: aggregatePosition,
        history: history,
        accounts: [...new Set(aggregatePosition.accounts)],
      });
    } catch (error) {
      console.error("Error getting position details:", error);
      res.status(500).json({
        error: {
          code: "POSITION_DETAILS_FAILED",
          message: "Failed to retrieve position details",
          retryAfter: 60,
        },
      });
    }
  }
}

export default new AccountsController();
