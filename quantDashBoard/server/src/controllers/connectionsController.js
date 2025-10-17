/**
 * Connections Controller
 *
 * Handles all SnapTrade connection management operations including
 * portal generation, authorization exchange, and connection status monitoring.
 * Implements the connections API endpoints from the product spec.
 *
 * @class ConnectionsController
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2024
 */

import ConnectionServiceClientService from "../clients/connectionsClient.js";
import UserServiceClientService from "../clients/userClient.js";
import Connection from "../models/Connection.js";

const ALLOWED_STATUSES = ["ACTIVE", "INACTIVE", "PENDING", "ERROR"];

/**
 * Connections Controller
 *
 * Provides REST API endpoints for managing SnapTrade brokerage connections.
 * Handles portal generation, authorization exchange, connection listing,
 * and health monitoring operations.
 *
 * @class ConnectionsController
 */
class ConnectionsController {
  constructor() {
    this.connectionService = new ConnectionServiceClientService();
    this.userService = new UserServiceClientService();
  }

  /**
   * Generate SnapTrade connection portal URL
   *
   * Creates a connection portal URL for users to authenticate with their
   * brokerage accounts through SnapTrade's OAuth flow.
   *
   * @async
   * @method generatePortal
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/connections/snaptrade/portal
   * Body: { userId: "user123", userSecret: "secret456", broker: "ROBINHOOD", customRedirect: "https://app.com/success" }
   * Response: { redirectUrl: "https://snaptrade.com/portal/..." }
   */
  async generatePortal(req, res) {
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

      const { broker, customRedirect, connectionType } = req.body;

      console.log(`Generating connection portal for user: ${user.userId}`);

      const portalData = await this.userService.generateConnectionPortalUrl(
        user.userId,
        user.userSecret,
        {
          broker: broker || "ROBINHOOD",
          customRedirect: customRedirect || `http://localhost:5173/settings`,
          connectionType: connectionType || "read",
        }
      );

      res.status(200).json({
        redirectUrl: portalData.redirectURI,
        portalId: portalData.id,
        expiresAt: portalData.expiresAt,
      });
    } catch (error) {
      console.error("Error generating connection portal:", error);
      res.status(500).json({
        error: {
          code: "PORTAL_GENERATION_FAILED",
          message: "Failed to generate connection portal",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Exchange authorization ID for connection details
   *
   * Processes the authorization ID returned from SnapTrade portal
   * and exchanges it for persistent connection credentials.
   *
   * @async
   * @method exchangeAuthorization
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * POST /api/connections/snaptrade/exchange
   * Body: { userId: "user123", userSecret: "secret456", authorizationId: "auth-123" }
   * Response: { connectionId: "conn-456", accounts: [...] }
   */
  async exchangeAuthorization(req, res) {
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

      const { authorizationId, sessionId } = req.body;

      // Validate required parameters
      if (!authorizationId) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required parameter: authorizationId is required",
          },
        });
      }

      console.log(
        `Exchanging authorization ${authorizationId} for user: ${user.userId}`
      );

      // Get connection details from SnapTrade
      const connectionDetails =
        await this.connectionService.getBrokerageAuthorizationDetails(
          user.userId,
          user.userSecret,
          authorizationId
        );

      // Normalise status to match schema enum
      const normalizedStatus = (connectionDetails.status || "ACTIVE")
        .toString()
        .toUpperCase();
      const status = ALLOWED_STATUSES.includes(normalizedStatus)
        ? normalizedStatus
        : "ACTIVE";

      // Persist connection using schema-compliant fields
      const connection = new Connection({
        userId: user.userId,
        connectionId: connectionDetails.id,
        brokerageName: connectionDetails.brokerage?.name || "Unknown",
        status: status,
        isActive: status === "ACTIVE",
        lastSyncDate: connectionDetails.last_sync_at
          ? new Date(connectionDetails.last_sync_at)
          : new Date(),
      });

      await connection.save();

      // Get accounts for this connection
      const accounts = connectionDetails.accounts || [];

      res.status(200).json({
        connectionId: connection._id,
        authorizationId: authorizationId,
        accounts: accounts,
        brokerage: {
          name: connectionDetails.brokerage?.name || "Unknown",
          id: connectionDetails.brokerage?.id || connectionDetails.id,
        },
        status: status,
      });
    } catch (error) {
      console.error("Error exchanging authorization:", error);
      res.status(500).json({
        error: {
          code: "AUTHORIZATION_EXCHANGE_FAILED",
          message: "Failed to exchange authorization",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * List all user connections
   *
   * Retrieves all brokerage connections for the authenticated user
   * with their current status and health information.
   *
   * @async
   * @method listConnections
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/connections
   * Body: { userId: "user123", userSecret: "secret456" }
   * Response: { connections: [...], health: {...} }
   */
  async listConnections(req, res) {
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

      console.log(`Listing connections for user: ${user.userId}`);
      console.log(`User secret present: ${user.userSecret ? "Yes" : "No"}`);

      // Check if user has SnapTrade credentials
      if (!user.userSecret) {
        return res.status(400).json({
          error: {
            code: "MISSING_SNAPTRADE_CREDENTIALS",
            message: "User does not have SnapTrade credentials",
          },
        });
      }

      // Start with connections stored in MongoDB
      let storedConnections = await Connection.find({
        userId: user.userId,
      })
        .sort({ createdAt: 1 })
        .lean();

      let fetchedFromSnapTrade = false;

      if (!storedConnections.length) {
        try {
          const snapTradeConnections =
            await this.connectionService.listBrokerageAuthorizations(
              user.userId,
              user.userSecret
            );

          if (snapTradeConnections.length) {
            const savedConnections = [];

            for (const snapConnection of snapTradeConnections) {
              const normalizedStatus = (snapConnection.status || "ACTIVE")
                .toString()
                .toUpperCase();

              const status = ALLOWED_STATUSES.includes(normalizedStatus)
                ? normalizedStatus
                : "ACTIVE";

              const lastSyncDate = snapConnection.last_sync_at
                ? new Date(snapConnection.last_sync_at)
                : new Date();

              const updatePayload = {
                userId: user.userId,
                connectionId: snapConnection.id,
                brokerageName: snapConnection.brokerage?.name || "Unknown",
                status: status,
                isActive: status === "ACTIVE",
                lastSyncDate,
                updatedAt: new Date(),
              };

              const savedConnection = await Connection.findOneAndUpdate(
                {
                  userId: user.userId,
                  connectionId: snapConnection.id,
                },
                {
                  $set: updatePayload,
                  $setOnInsert: {
                    createdAt: new Date(),
                  },
                },
                {
                  upsert: true,
                  new: true,
                  setDefaultsOnInsert: true,
                }
              );

              savedConnections.push(savedConnection.toObject());
            }

            storedConnections = savedConnections;
            fetchedFromSnapTrade = true;
          }
        } catch (snapError) {
          console.error(
            "Error pulling connections from SnapTrade when database empty:",
            snapError
          );
        }
      }

      const totalConnections = storedConnections.length;
      const activeConnections = storedConnections.filter(
        (connection) => connection.status === "ACTIVE"
      ).length;
      const inactiveConnections = totalConnections - activeConnections;

      const issues = storedConnections
        .filter((connection) => connection.status !== "ACTIVE")
        .map((connection) => ({
          connectionId: connection.connectionId,
          brokerageName: connection.brokerageName,
          status: connection.status,
        }));

      const responseConnections = storedConnections.map((connection) => ({
        id: connection._id,
        connectionId: connection.connectionId,
        authorizationId: connection.connectionId,
        brokerageName: connection.brokerageName,
        status: connection.status,
        isActive: connection.isActive,
        lastSyncDate: connection.lastSyncDate,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      }));

      res.status(200).json({
        connections: responseConnections,
        health: {
          total: totalConnections,
          active: activeConnections,
          inactive: inactiveConnections,
          issues,
          lastChecked: new Date(),
          source: fetchedFromSnapTrade ? "snaptrade" : "database",
        },
        summary: {
          totalConnections,
          activeConnections,
          inactiveConnections,
          totalIssues: issues.length,
          lastChecked: new Date(),
          source: fetchedFromSnapTrade ? "snaptrade" : "database",
        },
      });
    } catch (error) {
      console.error("Error listing connections:", error);
      res.status(500).json({
        error: {
          code: "CONNECTIONS_LIST_FAILED",
          message: "Failed to retrieve connections",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Remove a brokerage connection
   *
   * Permanently removes a brokerage connection and cleans up
   * all associated data from both SnapTrade and local database.
   *
   * @async
   * @method removeConnection
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * DELETE /api/connections/:connectionId
   * Body: { userId: "user123", userSecret: "secret456" }
   * Response: { message: "Connection removed successfully" }
   */
  async removeConnection(req, res) {
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

      const { connectionId } = req.params;

      console.log(
        `Removing connection ${connectionId} for user: ${user.userId}`
      );

      // Find the connection
      const connection = await Connection.findOne({
        _id: connectionId,
        userId: user.userId,
      });

      if (!connection) {
        return res.status(404).json({
          error: {
            code: "NOT_FOUND",
            message: "Connection not found",
          },
        });
      }

      if (!connection.connectionId) {
        console.error(
          `Stored connection ${connectionId} missing SnapTrade connectionId`
        );
        return res.status(500).json({
          error: {
            code: "INVALID_CONNECTION_STATE",
            message: "Stored connection is missing SnapTrade identifiers",
          },
        });
      }

      // Remove from SnapTrade using stored SnapTrade connection identifier
      await this.connectionService.removeBrokerageAuthorization(
        user.userId,
        user.userSecret,
        connection.connectionId
      );

      // Remove from local database
      await Connection.findByIdAndDelete(connectionId);

      res.status(200).json({
        message: "Connection removed successfully",
        connectionId: connectionId,
      });
    } catch (error) {
      console.error("Error removing connection:", error);
      res.status(500).json({
        error: {
          code: "CONNECTION_REMOVAL_FAILED",
          message: "Failed to remove connection",
          retryAfter: 60,
        },
      });
    }
  }

  /**
   * Check connection health status
   *
   * Validates the health status of all user connections
   * and provides detailed status information.
   *
   * @async
   * @method checkHealth
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   *
   * @example
   * GET /api/connections/health
   * Body: { userId: "user123", userSecret: "secret456" }
   * Response: { health: {...}, issues: [...] }
   */
  async checkHealth(req, res) {
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

      console.log(`Checking connection health for user: ${user.userId}`);

      const healthReport = await this.connectionService.checkConnectionsHealth(
        user.userId,
        user.userSecret
      );

      res.status(200).json({
        health: healthReport,
        lastChecked: new Date(),
      });
    } catch (error) {
      console.error("Error checking connection health:", error);
      res.status(500).json({
        error: {
          code: "HEALTH_CHECK_FAILED",
          message: "Failed to check connection health",
          retryAfter: 60,
        },
      });
    }
  }
}

export default new ConnectionsController();
