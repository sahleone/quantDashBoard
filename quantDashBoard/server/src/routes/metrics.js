/**
 * Metrics Routes
 *
 * Handles all portfolio analytics and metrics endpoints including
 * portfolio value, performance metrics, risk analysis, factor exposures,
 * and time series data.
 *
 * @file metrics.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import metricsController from "../controllers/metricsController.js";

const router = express.Router();

/**
 * Get Portfolio Value Over Time
 * GET /api/portfolio/value?range=YTD&benchmark=SPY
 * Body: { userId }
 * Response: { benchmark, points, summary }
 */
router.get("/portfolio/value", (req, res) => {
  metricsController.getPortfolioValue(req, res);
});

/**
 * Get Portfolio Performance Metrics
 * GET /api/metrics/performance?range=1Y&benchmark=SPY
 * Body: { userId }
 * Response: { returns, volatility, sharpe, beta, maxDrawdown, calmar }
 */
router.get("/metrics/performance", (req, res) => {
  metricsController.getPerformance(req, res);
});

/**
 * Get Risk Metrics
 * GET /api/metrics/risk?range=1Y&confidence=0.95
 * Body: { userId }
 * Response: { var, cvar, volatility, beta, correlation }
 */
router.get("/metrics/risk", (req, res) => {
  metricsController.getRiskMetrics(req, res);
});

/**
 * Get Factor Exposures
 * GET /api/metrics/factors?model=FF3&range=1Y
 * Body: { userId }
 * Response: { model, exposures, statistics }
 */
router.get("/metrics/factors", (req, res) => {
  metricsController.getFactorExposures(req, res);
});

/**
 * Get Key Performance Indicators
 * GET /api/metrics/kpis?range=1Y
 * Body: { userId }
 * Response: { kpis, summary, lastUpdated }
 */
router.get("/metrics/kpis", (req, res) => {
  metricsController.getKPIs(req, res);
});

/**
 * Get Time Series Metrics
 * GET /api/metrics/timeseries?series=returns,vol&range=1Y
 * Body: { userId }
 * Response: { series, data, summary }
 */
router.get("/metrics/timeseries", (req, res) => {
  metricsController.getTimeSeries(req, res);
});

/**
 * Calculate Metrics (Manual Trigger)
 * POST /api/metrics/calculate
 * Body: { userId, accountId (optional), fullSync (optional, default: false), steps (optional) }
 * Response: { success, results, summary }
 */
router.post("/metrics/calculate", async (req, res) => {
  await metricsController.calculateMetrics(req, res);
});

export default router;
