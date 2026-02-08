/**
 * Authentication Controller
 *
 * Handles all user authentication operations including signup, login,
 * token refresh, and logout. Implements JWT-based authentication with
 * refresh tokens and proper security measures.
 *
 * @class AuthController
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2024
 */

import { v4 as uuidv4 } from "uuid";
import User from "../models/Users.js";
import jwt from "jsonwebtoken";
import { config } from "../config/environment.js";
import UserServiceClientService from "../clients/userClient.js";

const SECRET = config.jwt.secret;
const REFRESH_SECRET = config.jwt.refreshSecret;
// Default access token cookie lifetime (ms) when a numeric expiry isn't available
const ACCESS_TOKEN_DEFAULT_MS = 15 * 60 * 1000;

/**
 * Authentication Controller
 *
 * Provides REST API endpoints for user authentication and authorization.
 * Handles user registration, login, token refresh, logout, and user profile
 * management with proper security measures and validation.
 *
 * @class AuthController
 */
class AuthController {
  constructor() {
    this.accessTokenExpiry = this.getExpiresIn();
    this.refreshTokenExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.userService = new UserServiceClientService();
  }

  // Common cookie options helper to ensure development vs production
  // settings are applied consistently. Browsers require SameSite=None
  // cookies to be Secure; to avoid cookies being dropped in local
  // development, use SameSite='lax' and secure=false when not in
  // production.
  cookieOptions(maxAge) {
    const isProd = process.env.NODE_ENV === "production";
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge,
    };
  }

  /**
   * Get token expiry time in milliseconds
   */
  getExpiresIn() {
    const expiresIn = config.jwt.expiresIn;

    if (!expiresIn) {
      return "15m";
    }

    // If the value is numeric, assume milliseconds when large, seconds otherwise
    if (typeof expiresIn === "number") {
      return expiresIn > 60 * 60 ? Math.floor(expiresIn / 1000) : expiresIn;
    }

    const trimmed = expiresIn.toString().trim();

    // If it's a plain number string, treat similar to numeric branch
    if (/^\d+$/.test(trimmed)) {
      const numericValue = parseInt(trimmed, 10);
      return numericValue > 60 * 60
        ? Math.floor(numericValue / 1000)
        : numericValue;
    }

    // Fallback to passing through strings like "15m"
    return trimmed;
  }

  /**
   * Handle authentication errors
   */
  handleError(err) {
    console.error(err.message, err.code);
    let errors = { email: "", password: "", firstName: "", lastName: "" };

    // Return a generic message for both incorrect email and password
    // to prevent user enumeration attacks
    if (
      err.message.includes("Incorrect password") ||
      err.message.includes("Incorrect email")
    ) {
      errors.email = "Invalid email or password";
      return errors;
    }

    // duplicate email
    if (err.code === 11000) {
      errors.email = "Email already registered";
      return errors;
    }

    if (err.message.includes("user validation failed")) {
      Object.values(err.errors).forEach(({ properties }) => {
        errors[properties.path] = properties.message;
      });
      return errors;
    }

    return errors;
  }

  /**
   * Create access token
   */
  createAccessToken(id) {
    return jwt.sign({ id }, SECRET, { expiresIn: this.accessTokenExpiry });
  }

  /**
   * Create refresh token
   */
  createRefreshToken(id) {
    return jwt.sign({ id }, REFRESH_SECRET, {
      expiresIn: this.refreshTokenExpiry,
    });
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, REFRESH_SECRET);
    } catch (error) {
      throw new Error("Invalid refresh token");
    }
  }

  /**
   * User registration endpoint
   *
   * Creates a new user account with email and password validation.
   * Returns access and refresh tokens upon successful registration.
   *
   * @async
   * @method signup
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/auth/signup
   * Body: { firstName: "John", lastName: "Doe", email: "john@example.com", password: "secure123" }
   * Response: { user: {...}, accessToken: "...", refreshToken: "..." }
   */
  async signup(req, res) {
    try {
      const { firstName, lastName, email, password } = req.body;

      // Validate required parameters
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Missing required parameters: firstName, lastName, email, and password are required",
          },
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid email format",
          },
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Password must be at least 8 characters long",
          },
        });
      }
      const userId = uuidv4();

      console.log(`Creating new user account for: ${email}`);

      const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        userId,
        preferences: {
          baseCurrency: "USD",
          benchmark: "SPY",
          riskFree: "FF_RF",
        },
      });

      // Create SnapTrade user
      try {
        console.log(`Creating SnapTrade user for: ${email}`);
        const snapTradeUser = await this.userService.createUser(userId);
        console.log(`SnapTrade user created successfully for: ${email}`);

        // Update local user with SnapTrade userSecret
        user.userSecret = snapTradeUser.userSecret;
        await user.save();
      } catch (snapTradeError) {
        console.error(
          `Failed to create SnapTrade user for ${email}:`,
          snapTradeError
        );
        // Continue with signup even if SnapTrade user creation fails
        // User can create SnapTrade user later when needed
      }

      const accessToken = this.createAccessToken(user._id);
      const refreshToken = this.createRefreshToken(user._id);

      // Set refresh token and access token as httpOnly cookies so the
      // browser will send them automatically and server middleware can
      // read `req.cookies.jwt` for authentication.
      // Note: for local development the frontend and backend run on
      // different ports (e.g. 5173 -> 3000). To allow the browser to
      // send cookies on cross-site XHR/POST requests during development
      // we set `sameSite: 'none'`. `secure` remains enabled for
      // production but disabled locally.
      res.cookie(
        "refreshToken",
        refreshToken,
        this.cookieOptions(this.refreshTokenExpiry)
      );

      res.cookie(
        "jwt",
        accessToken,
        this.cookieOptions(
          typeof this.accessTokenExpiry === "number"
            ? this.accessTokenExpiry * 1000
            : ACCESS_TOKEN_DEFAULT_MS
        )
      );

      res.status(201).json({
        user: {
          id: user._id.toString(),
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          preferences: user.preferences,
        },
        accessToken: accessToken,
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(400).json({
        error: {
          code: "SIGNUP_FAILED",
          message: "Failed to create user account",
          details: this.handleError(error),
        },
      });
    }
  }

  /**
   * User login endpoint
   *
   * Authenticates user with email and password, returning access
   * and refresh tokens upon successful authentication.
   *
   * @async
   * @method login
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/auth/login
   * Body: { email: "john@example.com", password: "secure123" }
   * Response: { user: {...}, accessToken: "...", refreshToken: "..." }
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      // Validate required parameters
      if (!email || !password) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Missing required parameters: email and password are required",
          },
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid email format",
          },
        });
      }

      console.log(`User login attempt for: ${email}`);

      const user = await User.login(email, password);
      const accessToken = this.createAccessToken(user._id);
      const refreshToken = this.createRefreshToken(user._id);

      // Set refresh token as httpOnly cookie
      // Use SameSite=None so the cookie is sent on cross-site XHR (5173 -> 3000)
      // Secure is required when SameSite=None. Modern browsers treat localhost as a secure context.
      // For local development allow non-secure cookies so localhost works.
      res.cookie(
        "refreshToken",
        refreshToken,
        this.cookieOptions(this.refreshTokenExpiry)
      );

      // Also set the access token as an httpOnly cookie named 'jwt'
      res.cookie(
        "jwt",
        accessToken,
        this.cookieOptions(
          typeof this.accessTokenExpiry === "number"
            ? this.accessTokenExpiry * 1000
            : ACCESS_TOKEN_DEFAULT_MS
        )
      );

      // User data will be passed in req.body for subsequent requests
      res.status(200).json({
        user: {
          id: user._id.toString(),
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          preferences: user.preferences,
        },
        accessToken: accessToken,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(401).json({
        error: {
          code: "LOGIN_FAILED",
          message: "Authentication failed",
          details: this.handleError(error),
        },
      });
      // Clear user data from response
    }
  }

  /**
   * Token refresh endpoint
   *
   * Refreshes expired access tokens using a valid refresh token.
   * Returns a new access token while maintaining the refresh token.
   *
   * @async
   * @method refresh
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/auth/refresh
   * Response: { accessToken: "..." }
   */
  async refresh(req, res) {
    try {
      // Be defensive: req.cookies may be undefined if cookie-parser
      // middleware wasn't applied for some reason or the request
      // didn't include cookies. Use optional chaining to avoid
      // throwing when accessing refreshToken.
      const refreshToken =
        req?.cookies?.refreshToken ?? req?.body?.refreshToken;

      if (!refreshToken) {
        console.warn(
          "Refresh token not provided. req.cookies=",
          req?.cookies,
          "req.body=",
          req?.body
        );
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Refresh token not provided",
          },
        });
      }

      const decoded = this.verifyRefreshToken(refreshToken);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "User not found",
          },
        });
      }

      const accessToken = this.createAccessToken(user._id);

      // Also set the access token as an httpOnly cookie so subsequent
      // requests send it automatically and middleware can validate it.
      res.cookie(
        "jwt",
        accessToken,
        this.cookieOptions(
          typeof this.accessTokenExpiry === "number"
            ? this.accessTokenExpiry * 1000
            : ACCESS_TOKEN_DEFAULT_MS
        )
      );

      res.status(200).json({
        accessToken: accessToken,
      });
    } catch (error) {
      console.error(
        "Token refresh error:",
        error,
        "req.cookies=",
        req?.cookies,
        "req.body=",
        req?.body
      );
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid refresh token",
        },
      });
    }
  }

  /**
   * User logout endpoint
   *
   * Invalidates the refresh token cookie and clears user session.
   *
   * @method logout
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {void}
   *
   * @example
   * POST /api/auth/logout
   * Response: { message: "Logged out successfully" }
   */
  logout(req, res) {
    res.cookie("refreshToken", "", this.cookieOptions(0));
    res.cookie("jwt", "", this.cookieOptions(0));
    res.locals.user = null;
    res.status(200).json({
      message: "Logged out successfully",
    });
  }

  /**
   * Get current user profile
   *
   * Returns the authenticated user's profile information.
   *
   * @async
   * @method getCurrentUser
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/user/me
   * Headers: { Authorization: "Bearer <accessToken>" }
   * Response: { user: {...} }
   */
  async getCurrentUser(req, res) {
    try {
      // Get user from JWT token (set by auth middleware)
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        });
      }

      res.status(200).json({
        user: {
          id: user._id.toString(),
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          preferences: user.preferences,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      console.error("Get current user error:", error);
      res.status(500).json({
        error: {
          code: "USER_RETRIEVAL_FAILED",
          message: "Failed to retrieve user information",
        },
      });
    }
  }

  /**
   * Update user profile
   *
   * Updates the authenticated user's profile information.
   *
   * @async
   * @method updateProfile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * PATCH /api/user/me
   * Body: { user: {...}, firstName: "John", preferences: {...} }
   * Response: { user: {...} }
   */
  async updateProfile(req, res) {
    try {
      // Prefer the authenticated user from middleware (req.user).
      // Fall back to req.body.user if present for backward compatibility.
      let user = req.user || req.body.user;
      const updateData = req.body || {};

      // Validate user exists (either from middleware or in body)
      if (!user) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
      }

      // Use an allowlist of fields that clients may update.
      // Any new sensitive field added to the User model will NOT be writable
      // unless explicitly added here.
      const ALLOWED_FIELDS = ["firstName", "lastName", "email", "preferences"];
      const allowedUpdates = {};
      for (const field of ALLOWED_FIELDS) {
        if (field in updateData) {
          allowedUpdates[field] = updateData[field];
        }
      }
      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "No valid fields provided for update",
          },
        });
      }

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $set: allowedUpdates },
        { new: true, runValidators: true }
      );

      res.status(200).json({
        user: {
          id: updatedUser._id.toString(),
          userId: updatedUser.userId,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          preferences: updatedUser.preferences,
          updatedAt: updatedUser.updatedAt,
        },
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(400).json({
        error: {
          code: "PROFILE_UPDATE_FAILED",
          message: "Failed to update profile",
          details: this.handleError(error),
        },
      });
    }
  }
}

export default new AuthController();
