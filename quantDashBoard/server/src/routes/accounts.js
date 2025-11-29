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
import { requireAuth } from "../middleware/authmiddleware.js";
import updateAccountsForUser from "../utils/updateAccounts.js";

const router = express.Router();

// Apply authentication middleware to all account routes
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

// NOTE: options chain is provided by /api/snaptrade/options/chain via snapTradeController

/**
 * Get Account Return Rates
 * GET /api/accounts/:accountId/returnRates
 */
// Return rates endpoints removed — functionality deprecated and removed.

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
  const userId = req.body.userId || req.user?.userId;
  const userSecret = req.body.userSecret || req.user?.userSecret || null;
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
  // Prefer explicit body values but fall back to authenticated user from
  // the requireAuth middleware. This allows the client to call the refresh
  // endpoint without sending the userSecret in the body (jwt is used).
  const userId = req.body.userId || req.user?.userId;
  const userSecret = req.body.userSecret || req.user?.userSecret;

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

export default router;
