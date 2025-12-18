/**
 * SnapTrade Routes
 *
 * Handles all SnapTrade data synchronization endpoints including
 * connection sync, account sync, balance sync, and other data operations.
 *
 * @file snapTrade.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import snapTradeController from "../controllers/snapTradeController.js";
import { requireAuth } from "../middleware/authmiddleware.js";

const router = express.Router();

// Apply authentication middleware to all SnapTrade routes
router.use(requireAuth);

/**
 * Sync User Connections from SnapTrade
 * POST /api/snaptrade/sync/connections
 * Body: { userId, userSecret }
 * Response: { message, connections }
 */
router.post("/sync/connections", (req, res) => {
  snapTradeController.syncUserConnections(req, res);
});

/**
 * Sync User Accounts from SnapTrade
 * POST /api/snaptrade/sync/accounts
 * Body: { userId, userSecret }
 * Response: { message, accounts }
 */
router.post("/sync/accounts", (req, res) => {
  snapTradeController.syncUserAccounts(req, res);
});

/**
 * Sync Account Balances from SnapTrade
 * POST /api/snaptrade/sync/balances
 * Query: { userId, userSecret, accountId }
 * Response: { message, balances }
 */
router.post("/sync/balances", (req, res) => {
  snapTradeController.syncAccountBalances(req, res);
});

/**
 * Sync Account Positions from SnapTrade
 * POST /api/snaptrade/sync/positions
 * Query: { userId, userSecret, accountId }
 * Response: { message, positions }
 */
router.post("/sync/positions", (req, res) => {
  snapTradeController.syncAccountPositions(req, res);
});

/**
 * Get aggregated portfolio snapshot
 * GET /api/snaptrade/portfolio/:userId
 * Response: { accounts, connections, summary }
 */
router.get("/portfolio/:userId", (req, res) => {
  snapTradeController.getUserPortfolio(req, res);
});

/**
 * Convenience route for authenticated user portfolio
 * GET /api/snaptrade/portfolio
 * Response: { accounts, connections, summary }
 */
router.get("/portfolio", (req, res) => {
  snapTradeController.getUserPortfolio(req, res);
});

/**
 * Update a specific connection (brokerage authorization)
 * PATCH /api/snaptrade/connections/:authorizationId
 * Body: { userId, userSecret, updates }
 */
router.patch("/connections/:authorizationId", (req, res) => {
  snapTradeController.updateConnection(req, res);
});

/**
 * Sync account option holdings from SnapTrade
 * POST /api/snaptrade/sync/options/holdings
 * Body or Query: { userId, userSecret, accountId }
 */
router.post("/sync/options/holdings", (req, res) => {
  snapTradeController.syncAccountOptionHoldings(req, res);
});

/**
 * Retrieve options chain from SnapTrade
 * GET /api/snaptrade/options/chain?symbol=XYZ
 */
router.get("/options/chain", (req, res) => {
  snapTradeController.getOptionsChain(req, res);
});

/**
 * Dev-only route to resolve a ticker to the SnapTrade universal symbol
 * GET /api/snaptrade/debug/resolve?ticker=PLTY
 */
router.get("/debug/resolve", (req, res) => {
  snapTradeController.resolveTicker(req, res);
});

/**
 * Fetch account positions from SnapTrade (pass-through, no DB persistence)
 * GET /api/snaptrade/positions?accountId=...
 */
router.get("/positions", (req, res) => {
  snapTradeController.getAccountPositions(req, res);
});

/**
 * Fetch option holdings from SnapTrade (pass-through, no DB persistence)
 * GET /api/snaptrade/options/holdings?userId=...&userSecret=...&accountId=...
 */
router.get("/options/holdings", (req, res) => {
  snapTradeController.getAccountOptionHoldings(req, res);
});

/**
 * Get option holdings from our DB; if none for today, call SnapTrade and persist
 * GET /api/snaptrade/options/dbholdings?accountId=...
 */
router.get("/options/dbholdings", (req, res) => {
  snapTradeController.getAccountOptionHoldingsFromDb(req, res);
});

export default router;
