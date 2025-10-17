/**
 * Connections Service Client
 *
 * This service handles all connection-related operations with SnapTrade,
 * including brokerage authorization management, connection creation, listing,
 * deletion, and status monitoring. It provides a comprehensive interface for
 * managing user-brokerage connections through the SnapTrade API.
 *
 * @class ConnectionServiceClientService
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2024
 */

import SnapTradeClientService from "./snapTradeClient.js";

// Instantiate the SnapTrade client service
const snapTradeClient = new SnapTradeClientService();

/**
 * Connection Service Client Service
 *
 * Provides methods to interact with SnapTrade connection management endpoints.
 * Handles brokerage authorization, connection status monitoring, and user
 * account management through the SnapTrade API.
 *
 * @class ConnectionServiceClientService
 */
class ConnectionServiceClientService {
  /**
   * Creates an instance of ConnectionServiceClientService
   *
   * Initializes the SnapTrade client for making API calls to connection endpoints.
   * The client is obtained from the singleton SnapTradeClientService instance.
   *
   * @constructor
   * @example
   * const connectionService = new ConnectionServiceClientService();
   */
  constructor() {
    this.client = snapTradeClient.getClient();
  }

  /**
   * Retrieves all brokerage authorizations for a user
   *
   * Fetches all brokerage connections associated with the specified user from SnapTrade.
   * This includes both active and inactive connections with their current status.
   *
   * @async
   * @method listBrokerageAuthorizations
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @returns {Promise<Array>} Array of brokerage authorization objects
   * @throws {Error} When API call fails or authentication is invalid
   *
   * @example
   * try {
   *   const connections = await connectionService.listBrokerageAuthorizations('user123', 'secret456');
   *   console.log(`Found ${connections.length} brokerage connections`);
   *   connections.forEach(connection => {
   *     console.log(`Brokerage: ${connection.brokerage} - Status: ${connection.status}`);
   *   });
   * } catch (error) {
   *   console.error('Failed to list connections:', error.message);
   * }
   */
  async listBrokerageAuthorizations(userId, userSecret) {
    try {
      console.log(
        "ConnectionServiceClient.listBrokerageAuthorizations called with:",
        {
          userId,
          userSecret: userSecret ? "***" : "missing",
        }
      );

      const response =
        await this.client.connections.listBrokerageAuthorizations({
          userId: userId,
          userSecret: userSecret,
        });

      console.log(
        "SnapTrade API response:",
        response?.data?.length || 0,
        "connections"
      );

      // Validate response data
      if (!response.data) {
        console.log("No data in response, returning empty array");
        return [];
      }

      if (!Array.isArray(response.data)) {
        console.log("Response data is not an array:", typeof response.data);
        return [];
      }

      return response.data;
    } catch (error) {
      console.error(
        "ConnectionServiceClient.listBrokerageAuthorizations error:",
        error
      );
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Retrieves detailed information about a specific brokerage authorization
   *
   * Fetches comprehensive details about a specific brokerage connection including
   * status, configuration, and metadata associated with the authorization.
   *
   * @async
   * @method getBrokerageAuthorizationDetails
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} authorizationId - The unique identifier for the brokerage authorization
   * @returns {Promise<Object>} Detailed brokerage authorization object
   * @throws {Error} When API call fails, authorization not found, or authentication is invalid
   *
   * @example
   * try {
   *   const details = await connectionService.getBrokerageAuthorizationDetails('user123', 'secret456', 'auth789');
   *   console.log(`Authorization Status: ${details.status}`);
   *   console.log(`Brokerage: ${details.brokerage}`);
   * } catch (error) {
   *   console.error('Failed to get authorization details:', error.message);
   * }
   */
  async getBrokerageAuthorizationDetails(userId, userSecret, authorizationId) {
    try {
      console.log(
        "ConnectionServiceClient.getBrokerageAuthorizationDetails called with:",
        {
          userId,
          authorizationId,
          userSecret: userSecret ? "***" : "missing",
        }
      );

      const response =
        await this.client.connections.detailBrokerageAuthorization({
          authorizationId: authorizationId,
          userId: userId,
          userSecret: userSecret,
        });

      console.log(
        "SnapTrade API response for authorization details:",
        response?.data?.id || "No data"
      );
      return response.data;
    } catch (error) {
      console.error(
        "ConnectionServiceClient.getBrokerageAuthorizationDetails error:",
        error
      );
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Removes a brokerage authorization (disconnects a brokerage account)
   *
   * Permanently removes the connection between a user and their brokerage account.
   * This action cannot be undone and will require re-authorization to reconnect.
   *
   * @async
   * @method removeBrokerageAuthorization
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {string} authorizationId - The unique identifier for the brokerage authorization to remove
   * @returns {Promise<Object>} Confirmation object indicating successful removal
   * @throws {Error} When API call fails, authorization not found, or authentication is invalid
   *
   * @example
   * try {
   *   const result = await connectionService.removeBrokerageAuthorization('user123', 'secret456', 'auth789');
   *   console.log('Brokerage authorization removed successfully');
   * } catch (error) {
   *   console.error('Failed to remove authorization:', error.message);
   * }
   */
  async removeBrokerageAuthorization(userId, userSecret, authorizationId) {
    try {
      console.log(
        "ConnectionServiceClient.removeBrokerageAuthorization called with:",
        {
          userId,
          authorizationId,
          userSecret: userSecret ? "***" : "missing",
        }
      );

      const response =
        await this.client.connections.removeBrokerageAuthorization({
          authorizationId: authorizationId,
          userId: userId,
          userSecret: userSecret,
        });

      console.log(
        "SnapTrade API response for authorization removal:",
        response?.data || "No data"
      );
      return response.data;
    } catch (error) {
      console.error(
        "ConnectionServiceClient.removeBrokerageAuthorization error:",
        error
      );
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Transforms SnapTrade brokerage authorization data for MongoDB storage
   *
   * Converts SnapTrade API response format to match a generic connections schema
   * structure for efficient MongoDB storage and querying.
   *
   * @method transformConnectionsForMongoDB
   * @param {Array} connections - Raw connections data from SnapTrade API
   * @param {string} userId - The user ID these connections belong to
   * @returns {Array} Transformed connections data ready for MongoDB insertion
   *
   * @example
   * const rawConnections = await connectionService.listBrokerageAuthorizations(userId, userSecret);
   * const transformedConnections = connectionService.transformConnectionsForMongoDB(rawConnections, userId);
   * await Connections.insertMany(transformedConnections);
   */
  transformConnectionsForMongoDB(connections, userId) {
    return connections.map((connection) => ({
      userId: userId,
      authorizationId: connection.id,
      brokerageId: connection.brokerage?.id,
      brokerageName: connection.brokerage?.name,
      status: connection.status,
      createdAt: connection.created_at
        ? new Date(connection.created_at)
        : new Date(),
      updatedAt: connection.updated_at
        ? new Date(connection.updated_at)
        : new Date(),
      lastSyncAt: connection.last_sync_at
        ? new Date(connection.last_sync_at)
        : null,
      isActive: connection.status === "active",
      metadata: {
        brokerage: connection.brokerage,
        accounts: connection.accounts || [],
        permissions: connection.permissions || [],
      },
    }));
  }

  /**
   * Checks the health status of all user connections
   *
   * Validates that all brokerage authorizations are active and functioning properly.
   * Useful for monitoring connection health and identifying issues.
   *
   * @async
   * @method checkConnectionsHealth
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @returns {Promise<Object>} Health status report for all connections
   * @throws {Error} When API call fails or authentication is invalid
   *
   * @example
   * try {
   *   const healthReport = await connectionService.checkConnectionsHealth('user123', 'secret456');
   *   console.log(`Total connections: ${healthReport.total}`);
   *   console.log(`Active connections: ${healthReport.active}`);
   *   console.log(`Issues found: ${healthReport.issues.length}`);
   * } catch (error) {
   *   console.error('Failed to check connection health:', error.message);
   * }
   */
  async checkConnectionsHealth(userId, userSecret) {
    try {
      console.log(
        "ConnectionServiceClient.checkConnectionsHealth called for user:",
        userId
      );

      const connections = await this.listBrokerageAuthorizations(
        userId,
        userSecret
      );

      const healthReport = {
        total: connections.length,
        active: 0,
        inactive: 0,
        issues: [],
        lastChecked: new Date(),
        connections: [],
      };

      for (const connection of connections) {
        const connectionHealth = {
          authorizationId: connection.id,
          brokerage: connection.brokerage?.name || "Unknown",
          status: connection.status,
          isHealthy: connection.status === "active",
          lastSync: connection.last_sync_at,
          accounts: connection.accounts?.length || 0,
        };

        if (connection.status === "active") {
          healthReport.active++;
        } else {
          healthReport.inactive++;
          healthReport.issues.push({
            authorizationId: connection.id,
            brokerage: connection.brokerage?.name,
            issue: `Connection status: ${connection.status}`,
            severity: connection.status === "error" ? "high" : "medium",
          });
        }

        healthReport.connections.push(connectionHealth);
      }

      console.log(
        `Health check completed: ${healthReport.active}/${healthReport.total} connections active`
      );
      return healthReport;
    } catch (error) {
      console.error(
        "ConnectionServiceClient.checkConnectionsHealth error:",
        error
      );
      throw error;
    }
  }

  /**
   * Comprehensive connection management method
   *
   * Provides a complete overview of user connections including health status,
   * account counts, and connection metadata. This method orchestrates multiple
   * API calls to provide comprehensive connection information.
   *
   * @async
   * @method getConnectionOverview
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @returns {Promise<Object>} Complete connection overview with health and metadata
   * @throws {Error} When API calls fail or authentication is invalid
   *
   * @example
   * try {
   *   const overview = await connectionService.getConnectionOverview('user123', 'secret456');
   *   console.log(`User has ${overview.totalConnections} connections`);
   *   console.log(`Total accounts: ${overview.totalAccounts}`);
   *   console.log(`Health status: ${overview.health.status}`);
   * } catch (error) {
   *   console.error('Failed to get connection overview:', error.message);
   * }
   */
  async getConnectionOverview(userId, userSecret) {
    try {
      console.log(`Starting connection overview for user: ${userId}`);

      // Get connections and health status in parallel
      const [connections, healthReport] = await Promise.all([
        this.listBrokerageAuthorizations(userId, userSecret),
        this.checkConnectionsHealth(userId, userSecret),
      ]);

      // Calculate total accounts across all connections
      const totalAccounts = connections.reduce((total, connection) => {
        return total + (connection.accounts?.length || 0);
      }, 0);

      const overview = {
        userId: userId,
        totalConnections: connections.length,
        totalAccounts: totalAccounts,
        health: healthReport,
        connections: connections.map((connection) => ({
          authorizationId: connection.id,
          brokerage: connection.brokerage?.name,
          status: connection.status,
          accountCount: connection.accounts?.length || 0,
          createdAt: connection.created_at,
          lastSync: connection.last_sync_at,
        })),
        summary: {
          activeConnections: healthReport.active,
          inactiveConnections: healthReport.inactive,
          totalIssues: healthReport.issues.length,
          lastChecked: new Date(),
        },
      };

      console.log(`Connection overview completed for user ${userId}:`, {
        connections: overview.totalConnections,
        accounts: overview.totalAccounts,
        active: overview.summary.activeConnections,
      });

      return overview;
    } catch (error) {
      console.error(
        `Failed to get connection overview for user ${userId}:`,
        error
      );
      throw error;
    }
  }
}

/**
 * Default export of ConnectionServiceClientService
 *
 * Provides a singleton instance of the connection service client for use throughout
 * the application. This service handles all SnapTrade connection-related operations
 * including brokerage authorization management, connection health monitoring, and
 * connection status tracking.
 *
 * @module ConnectionServiceClientService
 * @default ConnectionServiceClientService
 *
 * @example
 * import ConnectionServiceClientService from './connectionsClient.js';
 *
 * const connectionService = new ConnectionServiceClientService();
 *
 * // List all brokerage authorizations for a user
 * const connections = await connectionService.listBrokerageAuthorizations(userId, userSecret);
 *
 * // Get comprehensive connection overview
 * const overview = await connectionService.getConnectionOverview(userId, userSecret);
 */
export default ConnectionServiceClientService;
