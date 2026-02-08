import Account from "../models/AccountsList.js";
import AccountDetail from "../models/AccountDetail.js";
import AccountHoldings from "../models/AccountHoldings.js";
import AccountBalances from "../models/AccountBalances.js";
import AccountPositions from "../models/AccountPositions.js";
import AccountOrders from "../models/AccountOrders.js";
import Activities from "../models/AccountActivities.js";
import User from "../models/Users.js";
import ConnectionModel from "../models/Connection.js";
import AccountServiceClientService from "../clients/accountClient.js";
import {
  upsertWithDuplicateCheck,
  UNIQUE_FIELD_MAPPINGS,
} from "./duplicateHandler.js";

/**
 * Update account holdings for all accounts across all connections for a user.
 *
 * This function will:
 *  - resolve the userSecret (from arg or DB)
 *  - list connections for the user
 *  - for each connection, fetch accounts from SnapTrade and filter by
 *    matching authorization/connection id
 *  - call accountService.syncAllAccountData for each account and upsert
 *    holdings/positions/orders/balances into the DB
 *
 * @param {string} userId - internal userId
 * @param {string|null} userSecret - optional SnapTrade userSecret
 * @param {object} options - { fullSync: boolean }
 * @returns {Promise<Array>} - array of per-account sync results
 */
export default async function updateAccountHoldingsForUser(
  userId,
  userSecret = null,
  options = {}
) {
  if (!userId) throw new Error("Missing userId");

  let effectiveSecret = userSecret;
  let user = null;

  if (!effectiveSecret) {
    user = await User.findOne({ userId });
    if (!user || !user.userSecret) {
      throw new Error("Missing userSecret for user");
    }
    effectiveSecret = user.userSecret;
  } else {
    // try to load user for metadata but don't require it
    user = await User.findOne({ userId }).catch(() => null);
  }

  const connectionDocs = await ConnectionModel.find({ userId }).lean();
  const connectionIds = (connectionDocs || []).map((c) => c.connectionId);

  const accountService = new AccountServiceClientService();

  // Fetch all accounts from SnapTrade for this user once to avoid repeated calls
  let snapAccounts = [];
  try {
    snapAccounts = await accountService.listAccounts(userId, effectiveSecret);
  } catch (err) {
    console.error(
      "Failed to list accounts from SnapTrade:",
      err?.message || err
    );
    throw err;
  }

  if (!Array.isArray(snapAccounts) || snapAccounts.length === 0) return [];

  // Filter accounts per connection and then sync each account
  const results = [];
  const fullSync = !!options.fullSync;

  // Helper to derive authorization id from snap account
  const extractAuthId = (acct) => {
    return (
      acct.authorizationId ||
      acct.authorization_id ||
      acct.brokerage_authorization ||
      acct.brokerage_authorization_id ||
      acct.connection_id ||
      acct.connectionId ||
      acct.brokerage?.id ||
      null
    );
  };

  for (const acct of snapAccounts) {
    try {
      const authId = extractAuthId(acct);

      // If we have connection ids in DB, only sync accounts that match those connections
      if (connectionIds.length && authId && !connectionIds.includes(authId)) {
        // skip accounts not associated with a known connection
        continue;
      }

      const accountId = acct.id || acct.accountId || acct.account_id;
      if (!accountId) continue;

      // Call SnapTrade sync for this account
      const syncData = await accountService.syncAllAccountData(
        userId,
        effectiveSecret,
        accountId,
        { days: fullSync ? 365 : 30 }
      );

      // Persist account and details
      if (syncData.account) {
        await Account.findOneAndUpdate(
          { accountId: accountId },
          syncData.account,
          { upsert: true }
        );
      }

      if (syncData.accountDetail) {
        await AccountDetail.findOneAndUpdate(
          { accountId: accountId },
          syncData.accountDetail,
          { upsert: true }
        );
      }

      if (syncData.balances) {
        await AccountBalances.findOneAndUpdate(
          { accountId: accountId, asOfDate: syncData.balances.asOfDate },
          syncData.balances,
          { upsert: true }
        );
      }

      let holdingsResult = null;
      let positionsResult = null;
      let ordersResult = null;

      if (Array.isArray(syncData.holdings) && syncData.holdings.length) {
        holdingsResult = await upsertWithDuplicateCheck(
          AccountHoldings,
          syncData.holdings,
          UNIQUE_FIELD_MAPPINGS.AccountHoldings,
          "holdings"
        );
      }

      if (Array.isArray(syncData.positions) && syncData.positions.length) {
        positionsResult = await upsertWithDuplicateCheck(
          AccountPositions,
          syncData.positions,
          UNIQUE_FIELD_MAPPINGS.AccountPositions,
          "positions"
        );
      }

      if (Array.isArray(syncData.orders) && syncData.orders.length) {
        ordersResult = await upsertWithDuplicateCheck(
          AccountOrders,
          syncData.orders,
          UNIQUE_FIELD_MAPPINGS.AccountOrders,
          "orders"
        );
      }

      let activitiesResult = null;
      if (Array.isArray(syncData.activities) && syncData.activities.length) {
        activitiesResult = await upsertWithDuplicateCheck(
          Activities,
          syncData.activities,
          UNIQUE_FIELD_MAPPINGS.Activities,
          "activities"
        );
        console.log(
          `Activities sync result for account ${accountId}:`,
          activitiesResult
        );
      }

      results.push({
        accountId,
        status: "success",
        holdings: holdingsResult || null,
        positions: positionsResult || null,
        orders: ordersResult || null,
        activities: activitiesResult || null,
      });
    } catch (err) {
      console.error(
        `Failed to sync account ${acct.id || acct.accountId}:`,
        err?.message || err
      );
      results.push({
        accountId: acct.id || acct.accountId || null,
        status: "failed",
        error: err?.message || String(err),
      });
      // continue to next account
    }
  }

  return results;
}

export { updateAccountHoldingsForUser };
