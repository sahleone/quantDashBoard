/**
 * SnapTrade Controller
 *
 * This controller integrates SnapTrade API operations with MongoDB database
 * to provide comprehensive brokerage account management functionality.
 */

import UserServiceClientService from "../clients/userClient.js";
import AccountServiceClientService from "../clients/accountClient.js";
import ConnectionServiceClientService from "../clients/connectionsClient.js";
import User from "../models/Users.js";
import Connection from "../models/Connection.js";
import Account from "../models/AccountsList.js";
import AccountBalances from "../models/AccountBalances.js";
import AccountPositions from "../models/AccountHoldings.js";
import Metrics from "../models/Metrics.js";

class SnapTradeController {
  constructor() {
    this.userService = new UserServiceClientService();
    this.accountService = new AccountServiceClientService();
    this.connectionService = new ConnectionServiceClientService();
  }

  /**
   * Create a new SnapTrade user and sync with MongoDB
   */
  async createSnapTradeUser(req, res) {
    try {
      const { userId, email } = req.body;

      // Check if user exists in our database
      const existingUser = await User.findOne({ email });
      if (!existingUser) {
        return res
          .status(404)
          .json({ error: "User not found in our database" });
      }

      // Create SnapTrade user
      const snapTradeUser = await this.userService.createUser(
        userId || existingUser.userId
      );

      // Update our user record with SnapTrade credentials
      await User.findOneAndUpdate(
        { userId: snapTradeUser.userId },
        {
          userSecret: snapTradeUser.userSecret,
          updatedAt: new Date(),
        }
      );

      res.status(201).json({
        message: "SnapTrade user created successfully",
        userId: snapTradeUser.userId,
        userSecret: snapTradeUser.userSecret,
      });
    } catch (error) {
      console.error("Error creating SnapTrade user:", error);
      res.status(500).json({ error: "Failed to create SnapTrade user" });
    }
  }

  /**
   * Generate connection portal URL for brokerage linking
   */
  async generateConnectionPortal(req, res) {
    try {
      const { userId, userSecret, broker } = req.body;

      if (!userId || !userSecret) {
        return res.status(400).json({ error: "Missing userId or userSecret" });
      }

      const portalData = await this.userService.generateConnectionPortalUrl(
        userId,
        userSecret,
        broker
      );

      res.status(200).json(portalData);
    } catch (error) {
      console.error("Error generating connection portal:", error);
      res.status(500).json({ error: "Failed to generate connection portal" });
    }
  }

  /**
   * Update a connection (brokerage authorization) on SnapTrade and sync to MongoDB
   * Expected body: { userId, userSecret, updates }
   * URL param: :authorizationId
   */
  async updateConnection(req, res) {
    try {
      const { authorizationId } = req.params;
      const { userId, userSecret, updates } = req.body;

      if (!authorizationId) {
        return res
          .status(400)
          .json({ error: "Missing authorizationId in URL" });
      }

      if (!userId || !userSecret) {
        return res.status(400).json({ error: "Missing userId or userSecret" });
      }

      if (!updates || typeof updates !== "object") {
        return res
          .status(400)
          .json({ error: "Missing or invalid updates payload" });
      }

      // Call SnapTrade to update the authorization
      const updatedAuthorization =
        await this.connectionService.updateBrokerageAuthorization(
          userId,
          userSecret,
          authorizationId,
          updates
        );

      // Sync relevant fields to our local Connection model
      const existingConnection = await Connection.findOne({
        authorizationId: authorizationId,
      });

      if (existingConnection) {
        // Apply some common updatable fields if present
        if (updates.status) existingConnection.status = updates.status;
        if (updates.label) existingConnection.label = updates.label;
        if (updates.brokerage) existingConnection.brokerage = updates.brokerage;
        existingConnection.lastSyncDate = new Date();
        await existingConnection.save();
      }

      return res.status(200).json({
        message: "Connection updated successfully",
        updatedAuthorization,
        connection: existingConnection || null,
      });
    } catch (error) {
      console.error("Error updating connection:", error);
      res.status(500).json({ error: "Failed to update connection" });
    }
  }

  /**
   * Sync user connections from SnapTrade to MongoDB
   */
  async syncUserConnections(req, res) {
    try {
      const { userId, userSecret } = req.query;

      if (!userId || !userSecret) {
        return res.status(400).json({ error: "Missing userId or userSecret" });
      }

      // Get connections from SnapTrade
      console.log("syncUserConnections: Getting connections from SnapTrade...");
      const snapTradeConnections = await this.userService.getUserConnections(
        userId,
        userSecret
      );
      console.log(
        "syncUserConnections: Retrieved",
        snapTradeConnections?.length || 0,
        "connections from SnapTrade"
      );
      console.log(
        "syncUserConnections: Connection data:",
        snapTradeConnections
      );

      const syncedConnections = [];

      for (const connection of snapTradeConnections) {
        // Check if connection already exists
        const existingConnection = await Connection.findOne({
          connectionId: connection.id,
        });

        if (existingConnection) {
          // Update existing connection
          existingConnection.status = connection.status || "ACTIVE";
          existingConnection.lastSyncDate = new Date();
          await existingConnection.save();
          syncedConnections.push(existingConnection);
        } else {
          // Create new connection
          const newConnection = new Connection({
            userId: userId,
            connectionId: connection.id,
            authorizationId: connection.id, // SnapTrade uses same ID for both
            brokerage: {
              name: connection.brokerage?.name || "Unknown",
              id: connection.brokerage?.id || connection.id,
            },
            status: connection.status || "ACTIVE",
            lastSyncDate: new Date(),
          });

          console.log("Saving new connection:", newConnection);
          await newConnection.save();
          console.log("Connection saved successfully:", newConnection._id);
          syncedConnections.push(newConnection);
        }
      }

      const result = {
        message: "Connections synced successfully",
        connections: syncedConnections,
      };

      if (res && res.status && res.json) {
        res.status(200).json(result);
      }
      return result;
    } catch (error) {
      console.error("Error syncing user connections:", error);
      const errorResult = { error: "Failed to sync user connections" };
      if (res && res.status && res.json) {
        res.status(500).json(errorResult);
      }
      throw error;
    }
  }

  /**
   * Sync user accounts from SnapTrade to MongoDB
   */
  async syncUserAccounts(req, res) {
    try {
      const { userId, userSecret } = req.query;

      if (!userId || !userSecret) {
        return res.status(400).json({ error: "Missing userId or userSecret" });
      }

      // Get accounts from SnapTrade
      console.log("syncUserAccounts: Getting accounts from SnapTrade...");
      const snapTradeAccounts = await this.accountService.listAccounts(
        userId,
        userSecret
      );
      console.log(
        "syncUserAccounts: Retrieved",
        snapTradeAccounts?.length || 0,
        "accounts from SnapTrade"
      );
      console.log("syncUserAccounts: Account data:", snapTradeAccounts);

      const syncedAccounts = [];

      for (const account of snapTradeAccounts) {
        console.log("Processing account:", account);

        // Find the connection for this account
        // Try different possible field names for the authorization ID
        const authorizationId =
          account.authorizationId ||
          account.authorization_id ||
          account.connectionId ||
          account.connection_id;
        console.log(
          "Looking for connection with authorizationId:",
          authorizationId
        );

        const connection = await Connection.findOne({
          userId: userId,
          authorizationId: authorizationId,
        });

        if (!connection) {
          console.warn(
            `No connection found for account ${account.id} with authorizationId ${authorizationId}`
          );
          console.log(
            "Available connections:",
            await Connection.find({ userId })
          );
          continue;
        }

        console.log("Found connection:", connection);

        // Check if account already exists
        const existingAccount = await Account.findOne({
          accountId: account.id,
        });

        if (existingAccount) {
          // Update existing account
          existingAccount.accountName =
            account.name || existingAccount.accountName;
          existingAccount.accountType =
            account.type || existingAccount.accountType;
          existingAccount.currency =
            account.currency || existingAccount.currency;
          existingAccount.lastSyncDate = new Date();
          await existingAccount.save();
          syncedAccounts.push(existingAccount);
        } else {
          // Create new account
          const newAccount = new Account({
            userId: userId,
            connectionId: connection._id,
            accountId: account.id,
            accountName: account.name || "Unknown Account",
            accountType: account.type || "Unknown",
            currency: account.currency || "USD",
            brokerage: {
              name: connection.brokerage.name,
              id: connection.brokerage.id,
            },
            lastSyncDate: new Date(),
          });

          console.log("Saving new account:", newAccount);
          await newAccount.save();
          console.log("Account saved successfully:", newAccount._id);
          syncedAccounts.push(newAccount);
        }
      }

      const result = {
        message: "Accounts synced successfully",
        accounts: syncedAccounts,
      };

      if (res && res.status && res.json) {
        res.status(200).json(result);
      }
      return result;
    } catch (error) {
      console.error("Error syncing user accounts:", error);
      const errorResult = { error: "Failed to sync user accounts" };
      if (res && res.status && res.json) {
        res.status(500).json(errorResult);
      }
      throw error;
    }
  }

  /**
   * Sync account positions from SnapTrade to MongoDB
   */
  async syncAccountPositions(req, res) {
    try {
      const { userId, userSecret, accountId } = req.query;

      if (!userId || !userSecret || !accountId) {
        if (res && res.status && res.json) {
          return res.status(400).json({ error: "Missing required parameters" });
        }
        throw new Error("Missing required parameters");
      }

      // Get positions from SnapTrade with retry logic for 425 errors
      let snapTradePositions;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          snapTradePositions = await this.accountService.listAccountPositions(
            userId,
            userSecret,
            accountId
          );
          break; // Success, exit retry loop
        } catch (error) {
          if (error.status === 425 && retryCount < maxRetries - 1) {
            console.log(
              `SnapTrade holdings sync not ready for account ${accountId}, retrying in 10 seconds... (attempt ${
                retryCount + 1
              }/${maxRetries})`
            );
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
            continue;
          } else {
            throw error; // Re-throw if not a 425 error or max retries reached
          }
        }
      }

      const syncedPositions = [];
      const currentDate = new Date();

      const normalizeNumber = (value, fallback = 0) => {
        if (value === null || value === undefined || value === "") {
          return fallback;
        }
        const numeric = Number(value);
        return Number.isNaN(numeric) ? fallback : numeric;
      };

      const pickFirstString = (...values) => {
        for (const value of values) {
          if (typeof value === "string" && value.trim().length > 0) {
            return value;
          }
        }
        return "";
      };

      const extractSymbolData = (symbolInput) => {
        if (!symbolInput) {
          return {};
        }

        if (typeof symbolInput === "string") {
          return {
            symbol: symbolInput,
            raw_symbol: symbolInput,
          };
        }

        if (
          symbolInput.symbol &&
          typeof symbolInput.symbol === "object" &&
          symbolInput.symbol !== null
        ) {
          return {
            ...symbolInput.symbol,
            raw_symbol: symbolInput.symbol.raw_symbol || symbolInput.raw_symbol,
            exchange: symbolInput.symbol.exchange || symbolInput.exchange || {},
            currency: symbolInput.symbol.currency || symbolInput.currency || {},
            type: symbolInput.symbol.type || symbolInput.type || {},
          };
        }

        if (typeof symbolInput.symbol === "string") {
          return {
            ...symbolInput,
            raw_symbol: symbolInput.raw_symbol || symbolInput.symbol,
          };
        }

        return {
          ...symbolInput,
          exchange: symbolInput.exchange || {},
          currency: symbolInput.currency || {},
          type: symbolInput.type || {},
        };
      };

      const sanitizePosition = (position) => {
        const symbolData = extractSymbolData(position.symbol);

        const normalizedSymbol =
          pickFirstString(
            symbolData.symbol,
            symbolData.raw_symbol,
            symbolData.code,
            symbolData.ticker,
            symbolData.local_id,
            symbolData.id,
            typeof position.symbol === "string" ? position.symbol : ""
          ) || "Unknown";

        const description =
          pickFirstString(
            position.description,
            symbolData.description,
            symbolData.name,
            normalizedSymbol
          ) || "Unknown Security";

        const currencyCode =
          pickFirstString(
            symbolData.currency?.code,
            typeof position.currency === "object"
              ? position.currency.code
              : position.currency,
            symbolData.currency,
            "USD"
          ) || "USD";

        const typeCode = pickFirstString(
          position.typeCode,
          symbolData.type?.code,
          position.type?.code
        );

        const typeDescription = pickFirstString(
          position.typeDescription,
          symbolData.type?.description,
          position.type?.description
        );

        const units = normalizeNumber(
          position.units ??
            position.quantity ??
            position.quantity_available ??
            position.position_qty,
          0
        );

        const price = normalizeNumber(
          position.price ?? position.marketPrice ?? position.market_price,
          0
        );

        const averagePurchasePrice = normalizeNumber(
          position.averagePurchasePrice ??
            position.average_purchase_price ??
            position.cost_basis_per_unit,
          0
        );

        const marketValue = normalizeNumber(
          position.marketValue ?? position.market_value,
          units * price
        );

        const openPnl = normalizeNumber(
          position.openPnl ??
            position.open_pnl ??
            position.unrealizedPnl ??
            position.unrealized_pnl ??
            marketValue - units * averagePurchasePrice,
          0
        );

        const fractionalUnits = normalizeNumber(
          position.fractional_units ?? position.fractionalUnits,
          0
        );

        const exchangeCode = pickFirstString(
          symbolData.exchange?.code,
          symbolData.exchange?.mic_code,
          symbolData.exchange?.id
        );

        return {
          symbol: normalizedSymbol,
          description,
          currency: currencyCode,
          typeCode: typeCode || "",
          typeDescription: typeDescription || "",
          units,
          price,
          averagePurchasePrice,
          marketValue,
          openPnl,
          fractionalUnits,
          exchange: exchangeCode || "Unknown",
          isCashEquivalent: Boolean(
            position.cash_equivalent ?? position.is_cash_equivalent ?? false
          ),
          symbolDetails: {
            rawSymbol:
              pickFirstString(
                symbolData.raw_symbol,
                typeof position.symbol === "string" ? position.symbol : ""
              ) || normalizedSymbol,
            figiCode: pickFirstString(
              symbolData.figi_code,
              symbolData.figiCode,
              symbolData.figi_instrument?.figi_code
            ),
            exchangeCode: exchangeCode || "",
            exchangeName: pickFirstString(
              symbolData.exchange?.name,
              position.symbol?.exchange?.name
            ),
            timezone: pickFirstString(
              symbolData.exchange?.timezone,
              position.symbol?.exchange?.timezone
            ),
            startTime: pickFirstString(
              symbolData.exchange?.start_time,
              position.symbol?.exchange?.start_time
            ),
            closeTime: pickFirstString(
              symbolData.exchange?.close_time,
              position.symbol?.exchange?.close_time
            ),
            suffix: pickFirstString(
              symbolData.exchange?.suffix,
              position.symbol?.exchange?.suffix
            ),
            typeCode: typeCode || "",
            typeDescription: typeDescription || "",
            localId: pickFirstString(
              symbolData.local_id,
              position.symbol?.local_id
            ),
            isQuotable: Boolean(
              symbolData.is_quotable ?? position.is_quotable ?? false
            ),
            isTradable: Boolean(
              symbolData.is_tradable ?? position.is_tradable ?? false
            ),
          },
        };
      };

      console.log(
        `Found ${snapTradePositions.length} positions from SnapTrade for account ${accountId}`
      );

      for (const position of snapTradePositions) {
        const sanitizedPosition = sanitizePosition(position);

        console.log(
          `Processing position: ${sanitizedPosition.symbol} - ${sanitizedPosition.description}`
        );

        // Check if position already exists for today
        const existingPosition = await AccountPositions.findOne({
          asOfDate: {
            $gte: new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              currentDate.getDate()
            ),
            $lt: new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              currentDate.getDate() + 1
            ),
          },
          accountId: accountId,
          symbol: sanitizedPosition.symbol,
        });

        if (existingPosition) {
          // Update existing position
          existingPosition.userId = userId;
          existingPosition.symbol = sanitizedPosition.symbol;
          existingPosition.description =
            sanitizedPosition.description || existingPosition.description;
          existingPosition.currency =
            sanitizedPosition.currency || existingPosition.currency;
          existingPosition.typeCode =
            sanitizedPosition.typeCode || existingPosition.typeCode;
          existingPosition.typeDescription =
            sanitizedPosition.typeDescription ||
            existingPosition.typeDescription;
          existingPosition.units =
            sanitizedPosition.units || existingPosition.units;
          existingPosition.price =
            sanitizedPosition.price || existingPosition.price;
          existingPosition.averagePurchasePrice =
            sanitizedPosition.averagePurchasePrice ||
            existingPosition.averagePurchasePrice;
          existingPosition.marketValue =
            sanitizedPosition.marketValue || existingPosition.marketValue;
          // Enhanced fields
          existingPosition.openPnl = sanitizedPosition.openPnl;
          existingPosition.fractionalUnits = sanitizedPosition.fractionalUnits;
          existingPosition.exchange = sanitizedPosition.exchange;
          existingPosition.isCashEquivalent =
            sanitizedPosition.isCashEquivalent;
          existingPosition.symbolDetails = sanitizedPosition.symbolDetails;

          await existingPosition.save();
          syncedPositions.push(existingPosition);
        } else {
          // Create new position
          const newPosition = new AccountPositions({
            asOfDate: currentDate,
            userId: userId,
            accountId: accountId,
            symbol: sanitizedPosition.symbol,
            description: sanitizedPosition.description,
            currency: sanitizedPosition.currency,
            typeCode: sanitizedPosition.typeCode,
            typeDescription: sanitizedPosition.typeDescription,
            units: sanitizedPosition.units,
            price: sanitizedPosition.price,
            averagePurchasePrice: sanitizedPosition.averagePurchasePrice,
            marketValue: sanitizedPosition.marketValue,
            // Enhanced fields
            openPnl: sanitizedPosition.openPnl,
            fractionalUnits: sanitizedPosition.fractionalUnits,
            exchange: sanitizedPosition.exchange,
            isCashEquivalent: sanitizedPosition.isCashEquivalent,
            symbolDetails: sanitizedPosition.symbolDetails,
          });

          await newPosition.save();
          syncedPositions.push(newPosition);
        }
      }

      const result = {
        message: "Positions synced successfully",
        positions: syncedPositions,
      };

      if (res && res.status && res.json) {
        res.status(200).json(result);
      }
      return result;
    } catch (error) {
      console.error("Error syncing account positions:", error);
      const errorResult = { error: "Failed to sync account positions" };
      if (res && res.status && res.json) {
        res.status(500).json(errorResult);
      }
      throw error;
    }
  }

  /**
   * Sync account balances from SnapTrade to MongoDB
   */
  async syncAccountBalances(req, res) {
    try {
      const { userId, userSecret, accountId } = req.query;

      if (!userId || !userSecret || !accountId) {
        if (res && res.status && res.json) {
          return res.status(400).json({ error: "Missing required parameters" });
        }
        throw new Error("Missing required parameters");
      }

      // Get balances from SnapTrade with retry logic for 425 errors
      let snapTradeBalances;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          snapTradeBalances = await this.accountService.listAccountBalances(
            userId,
            userSecret,
            accountId
          );
          break; // Success, exit retry loop
        } catch (error) {
          if (error.status === 425 && retryCount < maxRetries - 1) {
            console.log(
              `SnapTrade holdings sync not ready for account ${accountId}, retrying in 10 seconds... (attempt ${
                retryCount + 1
              }/${maxRetries})`
            );
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
            continue;
          } else {
            throw error; // Re-throw if not a 425 error or max retries reached
          }
        }
      }

      const syncedBalances = [];
      const currentDate = new Date();

      console.log(
        `Found ${snapTradeBalances.length} balances from SnapTrade for account ${accountId}`
      );

      for (const balance of snapTradeBalances) {
        console.log(`Processing balance:`, balance);

        // Check if balance already exists for today
        const existingBalance = await AccountBalances.findOne({
          asOfDate: {
            $gte: new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              currentDate.getDate()
            ),
            $lt: new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              currentDate.getDate() + 1
            ),
          },
          accountId: accountId,
        });

        if (existingBalance) {
          // Update existing balance
          existingBalance.currency =
            balance.currency || existingBalance.currency;
          existingBalance.cash = balance.cash || existingBalance.cash;
          existingBalance.buyingPower =
            balance.buyingPower || existingBalance.buyingPower;
          existingBalance.accountBalance =
            balance.accountBalance || existingBalance.accountBalance;
          existingBalance.openPn1 = balance.openPn1 || existingBalance.openPn1;

          await existingBalance.save();
          syncedBalances.push(existingBalance);
        } else {
          // Create new balance
          const newBalance = new AccountBalances({
            asOfDate: currentDate,
            accountId: accountId,
            currency: balance.currency || {
              id: null,
              code: "USD",
              name: "US Dollar",
            },
            cash: balance.cash || 0,
            buyingPower: balance.buyingPower || 0,
            accountBalance: balance.accountBalance || 0,
            openPn1: balance.openPn1 || null,
          });

          await newBalance.save();
          syncedBalances.push(newBalance);
        }
      }

      const result = {
        message: "Balances synced successfully",
        balances: syncedBalances,
      };

      if (res && res.status && res.json) {
        res.status(200).json(result);
      }
      return result;
    } catch (error) {
      console.error("Error syncing account balances:", error);
      const errorResult = { error: "Failed to sync account balances" };
      if (res && res.status && res.json) {
        res.status(500).json(errorResult);
      }
      throw error;
    }
  }

  /**
   * Get user's complete portfolio data from MongoDB
   */
  async getUserPortfolio(req, res) {
    try {
      const requestedUserId = req.params?.userId;
      const authUser = req.user;

      if (!authUser || !authUser.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (requestedUserId && requestedUserId !== authUser.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const effectiveUserId = requestedUserId || authUser.userId;

      const userRecord = await User.findOne({ userId: effectiveUserId });

      if (!userRecord) {
        return res.status(404).json({ error: "User not found" });
      }

      const connections = await Connection.find({
        userId: effectiveUserId,
      }).lean();
      const accounts = await Account.find({ userId: effectiveUserId }).lean();

      const accountIds = accounts.map((acc) => acc.accountId);
      const mergePositionsIntoMap = (sourcePositions, targetMap) => {
        for (const position of sourcePositions) {
          if (!position || !position.accountId) {
            continue;
          }

          const accountMap = targetMap.get(position.accountId) || new Map();
          const symbolKey = (position.symbol || "").toUpperCase();
          const existing = accountMap.get(symbolKey);

          if (!existing || existing.asOfDate < position.asOfDate) {
            accountMap.set(symbolKey, position);
          }

          targetMap.set(position.accountId, accountMap);
        }
      };

      const positionsByAccount = new Map();
      let fetchedFromSnapTrade = false;

      if (accountIds.length) {
        const storedPositions = await AccountPositions.find({
          accountId: { $in: accountIds },
        })
          .sort({ asOfDate: -1 })
          .lean();

        mergePositionsIntoMap(storedPositions, positionsByAccount);

        const accountsMissingPositions = accounts.filter((account) => {
          const accountPositions = positionsByAccount.get(account.accountId);
          return !accountPositions || accountPositions.size === 0;
        });

        if (accountsMissingPositions.length && userRecord?.userSecret) {
          for (const account of accountsMissingPositions) {
            try {
              await this.syncAccountPositions(
                {
                  query: {
                    userId: userRecord.userId,
                    userSecret: userRecord.userSecret,
                    accountId: account.accountId,
                  },
                },
                null
              );
              fetchedFromSnapTrade = true;
            } catch (syncError) {
              console.error(
                `Error syncing positions for account ${account.accountId}:`,
                syncError
              );
            }
          }

          if (fetchedFromSnapTrade) {
            const refreshedPositions = await AccountPositions.find({
              accountId: {
                $in: accountsMissingPositions.map((acc) => acc.accountId),
              },
            })
              .sort({ asOfDate: -1 })
              .lean();

            mergePositionsIntoMap(refreshedPositions, positionsByAccount);
          }
        }
      }

      const accountSummaries = [];
      let totalCostBasis = 0;
      let totalMarketValue = 0;
      let totalUnrealizedPnl = 0;
      let totalLots = 0;
      let totalPositions = 0;
      let lastUpdated = null;

      for (const account of accounts) {
        const accountCurrency = account.currency || "USD";
        const accountPositionsMap = positionsByAccount.get(account.accountId);
        const accountPositions = accountPositionsMap
          ? Array.from(accountPositionsMap.values())
          : [];

        accountPositions.sort((a, b) => {
          if (!a.symbol) return 1;
          if (!b.symbol) return -1;
          return a.symbol.localeCompare(b.symbol);
        });

        let accountLots = 0;
        let accountCostBasis = 0;
        let accountMarketValue = 0;
        let accountUnrealized = 0;

        const formattedPositions = accountPositions.map((position) => {
          const lots = Number.isFinite(Number(position.units))
            ? Number(position.units)
            : 0;
          const averagePrice = Number.isFinite(
            Number(position.averagePurchasePrice)
          )
            ? Number(position.averagePurchasePrice)
            : 0;
          const marketPrice = Number.isFinite(Number(position.price))
            ? Number(position.price)
            : 0;
          const costBasis = lots * averagePrice;
          const marketValue = lots * marketPrice;
          const unrealizedPnl = Number.isFinite(Number(position.openPnl))
            ? Number(position.openPnl)
            : marketValue - costBasis;

          if (position.asOfDate) {
            const asOfDate = new Date(position.asOfDate);
            if (
              !Number.isNaN(asOfDate.getTime()) &&
              (!lastUpdated || asOfDate > lastUpdated)
            ) {
              lastUpdated = asOfDate;
            }
          }

          accountLots += lots;
          accountCostBasis += costBasis;
          accountMarketValue += marketValue;
          accountUnrealized += unrealizedPnl;

          return {
            symbol: position.symbol,
            name: position.description || position.symbol || "Unknown",
            lots,
            units: lots,
            averagePrice,
            marketPrice,
            costBasis,
            marketValue,
            unrealizedPnl,
            currency: position.currency || accountCurrency,
            asOfDate: position.asOfDate,
          };
        });

        totalPositions += formattedPositions.length;
        totalLots += accountLots;
        totalCostBasis += accountCostBasis;
        totalMarketValue += accountMarketValue;
        totalUnrealizedPnl += accountUnrealized;

        accountSummaries.push({
          accountId: account.accountId,
          accountName: account.accountName,
          brokerageAuthorizationId: account.brokerageAuthorizationId,
          currency: accountCurrency,
          positions: formattedPositions,
          totals: {
            lots: accountLots,
            units: accountLots,
            costBasis: accountCostBasis,
            marketValue: accountMarketValue,
            unrealizedPnl: accountUnrealized,
          },
        });
      }

      res.status(200).json({
        connections,
        accounts: accountSummaries,
        summary: {
          totalAccounts: accounts.length,
          totalPositions,
          totalLots,
          totalUnits: totalLots,
          totalCostBasis,
          totalMarketValue,
          totalUnrealizedPnl,
          lastUpdated,
          source: fetchedFromSnapTrade
            ? "snaptrade"
            : accounts.length
            ? "database"
            : userRecord?.userSecret
            ? "database"
            : "none",
        },
      });
    } catch (error) {
      console.error("Error getting user portfolio:", error);
      res.status(500).json({ error: "Failed to get user portfolio" });
    }
  }

  /**
   * Delete SnapTrade user and clean up MongoDB data
   */
  async deleteSnapTradeUser(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      // Delete from SnapTrade
      await this.userService.deleteUser(userId);

      // Clean up MongoDB data
      await Connection.deleteMany({ userId });
      await Account.deleteMany({ userId });
      await AccountPositions.deleteMany({
        accountId: {
          $in: await Account.find({ userId }).distinct("accountId"),
        },
      });
      await AccountBalances.deleteMany({
        accountId: {
          $in: await Account.find({ userId }).distinct("accountId"),
        },
      });

      // Clear userSecret from user record
      await User.findOneAndUpdate(
        { userId },
        { userSecret: null, updatedAt: new Date() }
      );

      res.status(200).json({ message: "SnapTrade user deleted successfully" });
    } catch (error) {
      console.error("Error deleting SnapTrade user:", error);
      res.status(500).json({ error: "Failed to delete SnapTrade user" });
    }
  }
}

export default new SnapTradeController();
