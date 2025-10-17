/**
 * User Routes
 *
 * Handles user profile management and preferences endpoints.
 *
 * @file user.js
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2025
 */

import express from "express";
import authController from "../controllers/authController.js";
import { requireAuth } from "../middleware/authmiddleware.js";

const router = express.Router();

// Apply authentication middleware to all user routes
router.use(requireAuth);

/**
 * Get Current User Profile
 * GET /api/user/me
 * Headers: { Authorization: "Bearer <accessToken>" }
 * Response: { user: {...} }
 */
router.get("/me", (req, res) => {
  authController.getCurrentUser(req, res);
});

/**
 * Update User Profile
 * PATCH /api/user/me
 * Body: { user, firstName?, lastName?, preferences? }
 * Response: { user }
 */
router.patch("/me", (req, res) => {
  authController.updateProfile(req, res);
});

export default router;
