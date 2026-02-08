/**
 * Accounts Routes
 *
 * Handles all account and holdings management endpoints including
 * account listing, holdings retrieval, data synchronization,
 * and portfolio aggregation.
 *
 * @file accountsNew.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import accountsController from "../controllers/accountsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import updateAccountsForUser from "../utils/updateAccounts.js";

const router = express.Router();

router.use(requireAuth);

/**
 * List All User Accounts
 * GET /api/accounts
 * Body: { userId }
 * Response: { accounts, total }
 */
router.get("/", (req, res) => {
  accountsController.listAccounts(req, res);
});

/**
 * Get Account Holdings with Pagination
 * GET /api/accounts/holdings?accountId=123&page=1&pageSize=50&symbol=AAPL&assetType=equity&asOf=2025-01-01
 * Body: { userId }
 * Response: { holdings, pagination, summary }
 */
router.get("/holdings", (req, res) => {
  accountsController.getHoldings(req, res);
});

/**
 * Get Account Balances (from SnapTrade API)
 * GET /api/accounts/balances?accountId=123
 * Body: { userId, userSecret } (from JWT token)
 * Response: { balances, totals, asOf, source }
 */
router.get("/balances", (req, res) => {
  accountsController.getBalances(req, res);
});

/**
 * Get Account Positions
 * GET /api/accounts/positions?accountId=123&asOf=2025-01-01
 * Body: { userId }
 * Response: { positions, summary, asOf }
 */
router.get("/positions", (req, res) => {
  accountsController.getPositions(req, res);
});

/**
 * Get Account Activities
 * GET /api/accounts/activities?accountId=123&startDate=2025-01-01&endDate=2025-02-01&limit=1000&type=BUY,SELL
 */
router.get("/activities", (req, res) => {
  accountsController.getActivities(req, res);
});

/**
 * Get Dividends by Month (last 12 months)
 * GET /api/accounts/dividends/by-month?accountId=123
 * Response: { months: [{ month: "2024-01", amount: 150.50 }, ...], total: 1800.00 }
 */
router.get("/dividends/by-month", (req, res) => {
  accountsController.getDividendsByMonth(req, res);
});

/**
 * Sync Holdings Data from SnapTrade
 * POST /api/sync/holdings
 * Body: { userId, userSecret, accountIds?, fullSync? }
 * Response: { message, results, summary }
 */
router.post("/sync/holdings", (req, res) => {
  accountsController.syncHoldings(req, res);
});

/**
 * Sync Holdings for all accounts across user's connections
 * POST /api/sync/holdings/connections
 * Body: { userId, userSecret, fullSync? }
 */
router.post("/sync/holdings/connections", async (req, res) => {
  const userId = req.user?.userId;
  const userSecret = req.user?.userSecret || null;
  const fullSync = !!req.body.fullSync;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const { default: updateAccountHoldingsForUser } = await import(
      "../utils/updateAccountHoldings.js"
    );

    const results = await updateAccountHoldingsForUser(userId, userSecret, {
      fullSync,
    });

    return res.status(200).json({ message: "Holdings updated", results });
  } catch (err) {
    console.error(
      `Error updating account holdings for user ${userId}:`,
      err?.message || err
    );
    return res.status(500).json({
      error: {
        code: "HOLDINGS_UPDATE_FAILED",
        message: "Failed to update holdings",
        details: err?.message || String(err),
      },
    });
  }
});

/**
 * Get Position Details for Specific Symbol
 * GET /api/positions/:symbol
 * Body: { userId }
 * Response: { symbol, currentPosition, aggregatePosition, history, accounts }
 */
router.get("/positions/:symbol", (req, res) => {
  accountsController.getPositionDetails(req, res);
});

/**
 * Refresh Account Data from SnapTrade
 */
router.post("/refresh", async (req, res) => {
  const userId = req.user?.userId;
  const userSecret = req.user?.userSecret;

  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (!userSecret)
    return res
      .status(400)
      .json({ error: "Missing userSecret (or not in JWT)" });

  try {
    const results = await updateAccountsForUser(userId, userSecret);

    return res.status(200).json({
      message: "Accounts refreshed",
      accounts: results,
      total: results.length,
    });
  } catch (err) {
    console.error(
      `Error refreshing accounts for user ${userId}:`,
      err?.message || err
    );
    return res.status(500).json({
      error: {
        code: "REFRESH_FAILED",
        message: "Failed to refresh accounts",
        details: err?.message || String(err),
      },
    });
  }
});

/**
 * Comprehensive Sync All User Data
 * POST /api/accounts/sync/all
 * Body: { userId?, fullSync?: boolean }
 * Syncs accounts, holdings, positions, balances, activities, and options
 */
router.post("/sync/all", async (req, res) => {
  const userId = req.user?.userId;
  const fullSync = !!req.body.fullSync;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const { default: syncAllUserData } = await import(
      "../utils/syncAllUserData.js"
    );

    const result = await syncAllUserData(userId, null, { fullSync });

    // Calculate accurate counts
    const accountsCount = result.accounts?.length || 0;
    
    // Sum up actual holdings count from all account results
    let holdingsCount = 0;
    if (Array.isArray(result.holdings)) {
      holdingsCount = result.holdings.reduce((sum, accountResult) => {
        if (accountResult.status === "success" && accountResult.holdings) {
          return sum + (accountResult.holdings.total || 0);
        }
        return sum;
      }, 0);
    }
    
    // Sum up actual options count from all account results
    let optionsCount = 0;
    if (Array.isArray(result.options)) {
      optionsCount = result.options.reduce((sum, accountResult) => {
        if (accountResult.status === "success" && accountResult.count) {
          return sum + accountResult.count;
        }
        return sum;
      }, 0);
    }

    return res.status(200).json({
      message: "Comprehensive sync completed",
      success: result.success,
      accounts: accountsCount,
      holdings: holdingsCount,
      options: optionsCount,
      accountsProcessed: result.holdings?.length || 0,
      optionsAccountsProcessed: result.options?.length || 0,
      details: result,
    });
  } catch (err) {
    console.error(
      `Error performing comprehensive sync for user ${userId}:`,
      err?.message || err
    );
    return res.status(500).json({
      error: {
        code: "SYNC_ALL_FAILED",
        message: "Failed to perform comprehensive sync",
        details: err?.message || String(err),
      },
    });
  }
});

export default router;
