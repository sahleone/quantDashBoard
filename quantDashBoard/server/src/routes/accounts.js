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
 * Get Account Return Rates
 * GET /api/accounts/:accountId/returnRates
 */
router.get("/:accountId/returnRates", (req, res) => {
  accountsController.getReturnRates(req, res);
});

/**
 * Get account return rates for authenticated user (selects first account)
 * GET /api/accounts/returnRates
 */
router.get("/returnRates", (req, res) => {
  accountsController.getReturnRatesForUser(req, res);
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
 * Get Position Details for Specific Symbol
 * GET /api/positions/:symbol
 * Body: { userId }
 * Response: { symbol, currentPosition, aggregatePosition, history, accounts }
 */
router.get("/positions/:symbol", (req, res) => {
  accountsController.getPositionDetails(req, res);
});

export default router;
