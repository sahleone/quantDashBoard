/**
 * Authentication Routes
 *
 * Handles all authentication-related endpoints including signup, login,
 * token refresh, logout, and user profile management.
 *
 * @file authRoutes.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import authController from "../controllers/authController.js";

const router = express.Router();

/**
 * User Registration
 * POST /api/auth/signup
 * Body: { firstName, lastName, email, password }
 * Response: { user, accessToken, refreshToken }
 */
router.post("/signup", (req, res) => {
  authController.signup(req, res);
});

/**
 * User Login
 * POST /api/auth/login
 * Body: { email, password }
 * Response: { user, accessToken, refreshToken }
 */
router.post("/login", (req, res) => {
  authController.login(req, res);
});

/**
 * Token Refresh
 * POST /api/auth/refresh
 * Body: { refreshToken } or Cookie: refreshToken
 * Response: { accessToken }
 */
router.post("/refresh", (req, res) => {
  authController.refresh(req, res);
});

/**
 * User Logout
 * POST /api/auth/logout
 * Response: { message: "Logged out successfully" }
 */
router.post("/logout", (req, res) => {
  authController.logout(req, res);
});

export default router;
