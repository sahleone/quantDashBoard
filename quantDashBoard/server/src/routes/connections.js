/**
 * Connections Routes
 *
 * Handles all SnapTrade connection management endpoints including
 * portal generation, authorization exchange, connection listing,
 * and health monitoring.
 *
 * @file connections.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import jwt from "jsonwebtoken";
import connectionsController from "../controllers/connectionsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { config } from "../config/environment.js";
import updateConnectionsForUser from "../utils/updateConnections.js";

const router = express.Router();

router.use(requireAuth);

/**
 * Generate SnapTrade Connection Portal
 * POST /api/connections/snaptrade/portal
 * Body: { userId, userSecret, broker?, customRedirect?, connectionType? }
 * Response: { redirectUrl, portalId, expiresAt }
 */
router.post("/snaptrade/portal", (req, res) => {
  connectionsController.generatePortal(req, res);
});

/**
 * Exchange Authorization for Connection Details
 * POST /api/connections/snaptrade/exchange
 * Body: { userId, userSecret, authorizationId }
 * Response: { connectionId, authorizationId, accounts, brokerage, status }
 */
router.post("/snaptrade/exchange", (req, res) => {
  connectionsController.exchangeAuthorization(req, res);
});

/**
 * Debug authentication endpoint
 * GET /api/connections/debug
 * Response: { authInfo, userInfo }
 */
router.get("/debug", (req, res) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : req.cookies.jwt;

  let tokenDecoded = null;
  let tokenError = null;
  if (token) {
    try {
      tokenDecoded = jwt.decode(token);
      jwt.verify(token, config.jwt.secret);
    } catch (error) {
      tokenError = error.message;
    }
  }

  res.json({
    authHeader: authHeader ? "Present" : "Missing",
    token: token ? `Present (${token.length} chars)` : "Missing",
    tokenPreview: token ? token.substring(0, 20) + "..." : "N/A",
    tokenDecoded: tokenDecoded,
    tokenError: tokenError,
    user: req.user
      ? {
          id: req.user._id,
          userId: req.user.userId,
          email: req.user.email,
          userSecret: req.user.userSecret ? "Present" : "Missing",
        }
      : "Not set",
    cookies: req.cookies,
    headers: {
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    },
  });
});

/**
 * Simple test endpoint that doesn't require SnapTrade API calls
 * GET /api/connections/test
 * Response: { message, user }
 */
router.get("/test", (req, res) => {
  res.json({
    message: "Authentication successful",
    user: req.user
      ? {
          id: req.user._id,
          userId: req.user.userId,
          email: req.user.email,
        }
      : "No user found",
  });
});

/**
 * List All User Connections
 * GET /api/connections
 * Body: { userId, userSecret }
 * Response: { connections, health, summary }
 */
router.get("/", (req, res) => {
  connectionsController.listConnections(req, res);
});

/**
 * Remove Brokerage Connection
 * DELETE /api/connections/:connectionId
 * Body: { userId, userSecret }
 * Response: { message, connectionId }
 */
router.delete("/:connectionId", (req, res) => {
  connectionsController.removeConnection(req, res);
});

/**
 * Check Connection Health Status
 * GET /api/connections/health
 * Body: { userId, userSecret }
 * Response: { health, lastChecked }
 */
router.get("/health", (req, res) => {
  connectionsController.checkHealth(req, res);
});

/**
 * Refresh Connections Data from SnapTrade
 * POST /api/connections/refres h
 * Body: { userId, userSecret }
 */
router.post("/refresh", async (req, res) => {
  const userId = req.body.userId || req.user?.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const userSecret = req.body.userSecret || null;

  try {
    const results = await updateConnectionsForUser(userId, userSecret);

    return res.status(200).json({
      message: "Connections refreshed",
      connections: results,
      total: results.length,
    });
  } catch (err) {
    console.error(
      `Error refreshing connections for user ${userId}:`,
      err?.message || err
    );
    return res.status(500).json({
      error: {
        code: "REFRESH_FAILED",
        message: "Failed to refresh connections",
        details: err?.message || String(err),
      },
    });
  }
});

export default router;
