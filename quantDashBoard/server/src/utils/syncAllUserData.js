/**
 * Comprehensive User Data Sync Utility
 * 
 * Syncs all user data from SnapTrade including:
 * - Accounts
 * - Holdings, positions, balances, activities
 * - Options
 * 
 * @param {string} userId - Internal userId
 * @param {string|null} userSecret - Optional SnapTrade userSecret (will be fetched from DB if not provided)
 * @param {object} options - { fullSync: boolean }
 * @returns {Promise<object>} - Comprehensive sync results
 */

import User from "../models/Users.js";
import Account from "../models/AccountsList.js";
import Options from "../models/Options.js";
import updateAccountsForUser from "./updateAccounts.js";
import updateAccountHoldingsForUser from "./updateAccountHoldings.js";
import OptionsServiceClientService from "../clients/optionsClient.js";

export default async function syncAllUserData(userId, userSecret = null, options = {}) {
  if (!userId) {
    throw new Error("Missing userId");
  }

  const fullSync = !!options.fullSync;
  const results = {
    userId,
    accounts: null,
    holdings: null,
    options: null,
    errors: [],
    success: false,
  };

  // Resolve userSecret if not provided
  let effectiveSecret = userSecret;
  if (!effectiveSecret) {
    const user = await User.findOne({ userId });
    if (!user || !user.userSecret) {
      throw new Error(`Missing userSecret for user ${userId}`);
    }
    effectiveSecret = user.userSecret;
  }

  try {
    // Step 1: Sync accounts
    console.log(`[${userId}] Syncing accounts...`);
    try {
      results.accounts = await updateAccountsForUser(userId, effectiveSecret);
      console.log(`[${userId}] Synced ${results.accounts.length} accounts`);
    } catch (err) {
      console.error(`[${userId}] Error syncing accounts:`, err.message);
      results.errors.push({ step: "accounts", error: err.message });
    }

    // Step 2: Sync holdings, positions, balances, activities
    console.log(`[${userId}] Syncing holdings, positions, balances, activities...`);
    try {
      results.holdings = await updateAccountHoldingsForUser(
        userId,
        effectiveSecret,
        { fullSync }
      );
      console.log(
        `[${userId}] Synced ${results.holdings?.length || 0} account holdings`
      );
    } catch (err) {
      console.error(`[${userId}] Error syncing holdings:`, err.message);
      results.errors.push({ step: "holdings", error: err.message });
    }

    // Step 3: Sync options for each account
    console.log(`[${userId}] Syncing options...`);
    try {
      const accountIds = results.holdings
        ? results.holdings.map((h) => h.accountId).filter(Boolean)
        : [];

      // If holdings sync failed, try to get account IDs from Accounts collection
      if (accountIds.length === 0) {
        const accounts = await Account.find({ userId }).lean();
        accountIds.push(...accounts.map((a) => a.accountId).filter(Boolean));
      }

      if (accountIds.length === 0) {
        console.log(`[${userId}] No accounts found for options sync`);
        results.options = [];
      } else {
        const optionsService = new OptionsServiceClientService();
        const optionsResults = [];

        for (const accountId of accountIds) {
          try {
            console.log(`[${userId}] Syncing options for account ${accountId}...`);
            const optionHoldings = await optionsService.listOptionHoldings(
              userId,
              effectiveSecret,
              accountId
            );

            if (!Array.isArray(optionHoldings) || optionHoldings.length === 0) {
              console.log(`[${userId}] No options found for account ${accountId}`);
              continue;
            }

            console.log(
              `[${userId}] Found ${optionHoldings.length} option positions for account ${accountId}`
            );

            // Upsert each option holding
            for (const holding of optionHoldings) {
              try {
                const ticker =
                  holding?.option_symbol?.ticker ||
                  holding?.symbol?.option_symbol?.ticker ||
                  (holding?.symbol && holding.symbol.raw_symbol) ||
                  null;

                if (!ticker) {
                  console.warn(
                    `[${userId}] Skipping option holding without ticker for account ${accountId}`
                  );
                  continue;
                }

                const query = {
                  accountId: accountId,
                  "symbol.option_symbol.ticker": ticker,
                };

                const doc = {
                  accountId: accountId,
                  userId: userId,
                  symbol: {
                    option_symbol:
                      holding.option_symbol || holding.symbol?.option_symbol || {},
                    id: holding.id || null,
                    description: holding.description || null,
                  },
                  price: holding.price ?? holding.last_price ?? null,
                  units: Number(holding.units ?? holding.quantity ?? 0),
                  average_purchase_price:
                    holding.average_purchase_price ??
                    holding.averagePurchasePrice ??
                    null,
                  currency: holding.currency || null,
                  createdAt: new Date(),
                };

                await Options.findOneAndUpdate(
                  query,
                  { $set: doc },
                  { upsert: true, new: true, setDefaultsOnInsert: true }
                );
              } catch (optErr) {
                console.error(
                  `[${userId}] Error saving option for account ${accountId}:`,
                  optErr.message
                );
              }
            }

            optionsResults.push({
              accountId,
              count: optionHoldings.length,
              status: "success",
            });
          } catch (accountErr) {
            console.error(
              `[${userId}] Error syncing options for account ${accountId}:`,
              accountErr.message
            );
            optionsResults.push({
              accountId,
              status: "failed",
              error: accountErr.message,
            });
          }
        }

        results.options = optionsResults;
        console.log(
          `[${userId}] Synced options for ${optionsResults.length} accounts`
        );
      }
    } catch (err) {
      console.error(`[${userId}] Error syncing options:`, err.message);
      results.errors.push({ step: "options", error: err.message });
    }

    // Mark as successful if at least one step succeeded
    results.success =
      results.accounts !== null ||
      results.holdings !== null ||
      results.options !== null;

    return results;
  } catch (err) {
    console.error(`[${userId}] Fatal error in syncAllUserData:`, err.message);
    results.errors.push({ step: "fatal", error: err.message });
    throw err;
  }
}

export { syncAllUserData };

