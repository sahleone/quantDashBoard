/**
 * Main API Routes Index
 *
 * Centralizes all API route definitions and provides a clean
 * structure for the REST API endpoints.
 *
 * @file api.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import authRoutes from "./authRoutes.js";
import connectionsRoutes from "./connections.js";
import accountsRoutes from "./accounts.js";
import metricsRoutes from "./metrics.js";
import userRoutes from "./user.js";
import snapTradeRoutes from "./snapTrade.js";

const router = express.Router();

// Authentication routes
router.use("/auth", authRoutes);

// User profile routes
router.use("/user", userRoutes);

// Connection management routes
router.use("/connections", connectionsRoutes);

// Account and holdings routes
router.use("/accounts", accountsRoutes);

// SnapTrade data synchronization routes
router.use("/snaptrade", snapTradeRoutes);

// Portfolio analytics and metrics routes
router.use("/", metricsRoutes);

export default router;
