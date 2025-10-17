/**
 * User Service Client
 *
 * This service handles all user-related operations with SnapTrade,
 * including user creation, authentication, management, and deletion.
 * It provides a comprehensive interface for managing SnapTrade users
 * and their authentication credentials through the SnapTrade API.
 *
 * @class UserServiceClientService
 * @author Rhys Jervis
 * @version 1.0.0
 * @since 2024
 */

import { v4 as uuidv4 } from "uuid";
import SnapTradeClientService from "./snapTradeClient.js";
import Connection from "../models/Connection.js";
import User from "../models/Users.js";

// Instantiate the SnapTrade client service
const snapTradeClient = new SnapTradeClientService();

/**
 * User Service Client Service
 *
 * Provides methods to interact with SnapTrade user management endpoints.
 * Handles user registration, authentication, credential management, and
 * user lifecycle operations through the SnapTrade API.
 *
 * @class UserServiceClientService
 */
class UserServiceClientService {
  /**
   * Creates an instance of UserServiceClientService
   *
   * Initializes the SnapTrade client and database models for user management.
   * The client is obtained from the singleton SnapTradeClientService instance.
   *
   * @constructor
   * @param {Object} [db_user=User] - MongoDB User model for database operations
   * @param {Object} [db_connection=Connection] - MongoDB Connection model for database operations
   * @example
   * const userService = new UserServiceClientService();
   */
  constructor(db_user = User, db_connection = Connection) {
    this.client = snapTradeClient.getClient();
    this.db_user = db_user;
    this.db_connection = db_connection;
  }

  /**
   * Creates a new SnapTrade user and registers them in the system
   *
   * Registers a new user with SnapTrade API and stores their credentials
   * in the local database. If no userId is provided, generates a new UUID.
   * Updates the local user record with the received userSecret.
   *
   * @async
   * @method createUser
   * @param {string} [userId=""] - Optional user ID, generates UUID if not provided
   * @param {string} [rsaPublicKey] - Optional RSA public key for enhanced security
   * @returns {Promise<Object>} SnapTrade user registration response with userId and userSecret
   * @throws {Error} When API call fails or database update fails
   *
   * @example
   * try {
   *   const user = await userService.createUser();
   *   console.log(`User created with ID: ${user.userId}`);
   *   console.log(`UserSecret: ${user.userSecret ? 'Received' : 'Not received'}`);
   * } catch (error) {
   *   console.error('Failed to create user:', error.message);
   * }
   *
   * @example
   * // Create user with specific ID
   * try {
   *   const user = await userService.createUser('custom-user-123');
   *   console.log(`Custom user created: ${user.userId}`);
   * } catch (error) {
   *   console.error('Failed to create custom user:', error.message);
   * }
   */
  async createUser(userId = "", rsaPublicKey = null) {
    try {
      if (!userId) {
        userId = uuidv4();
      }

      console.log(`Creating SnapTrade user with ID: ${userId}`);

      const requestParams = { userId };
      if (rsaPublicKey) {
        requestParams.rsaPublicKey = rsaPublicKey;
      }

      const response = await this.client.authentication.registerSnapTradeUser(
        requestParams
      );

      console.log(`SnapTrade user created successfully: ${userId}`);
      console.log(
        `UserSecret received: ${response.data.userSecret ? "Yes" : "No"}`
      );

      // Update the user in our database with the userSecret
      const updateResult = await this.db_user.updateOne(
        { userId },
        {
          userSecret: response.data.userSecret,
          createdAt: new Date(),
          status: "active",
        }
      );

      if (updateResult.matchedCount === 0) {
        console.error(
          `Warning: No user found with userId ${userId} to update with userSecret`
        );
      } else if (updateResult.modifiedCount === 0) {
        console.error(
          `Warning: User ${userId} found but userSecret was not updated`
        );
      } else {
        console.log(`UserSecret successfully saved for user ${userId}`);
      }

      return response.data;
    } catch (error) {
      console.error(`Error creating SnapTrade user ${userId}:`, error);
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack,
      });
      throw new Error(`Failed to create SnapTrade user: ${error.message}`);
    }
  }

  /**
   * Retrieves the user secret for a given user ID
   *
   * Fetches the userSecret from the local database for the specified user.
   * This method is used internally for authentication with SnapTrade API.
   *
   * @async
   * @method getUserSecret
   * @param {string} userId - The unique identifier for the user
   * @returns {Promise<string|null>} The userSecret if found, null otherwise
   * @throws {Error} When database query fails
   *
   * @example
   * try {
   *   const userSecret = await userService.getUserSecret('user123');
   *   if (userSecret) {
   *     console.log('User secret found');
   *   } else {
   *     console.log('User not found');
   *   }
   * } catch (error) {
   *   console.error('Failed to get user secret:', error.message);
   * }
   */
  async getUserSecret(userId) {
    try {
      const user = await this.db_user.findOne({ userId });
      if (user) {
        return user.userSecret;
      }
      return null;
    } catch (error) {
      console.error(`Error retrieving user secret for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Deletes a user from both SnapTrade API and local database
   *
   * Permanently removes a user from SnapTrade and cleans up all associated
   * data from the local database. This action cannot be undone.
   *
   * @async
   * @method deleteUser
   * @param {string} userId - The unique identifier for the user to delete
   * @param {boolean} [deleteFromSnapTrade=true] - Whether to delete from SnapTrade API
   * @returns {Promise<Object>} Deletion result with success status and details
   * @throws {Error} When deletion fails or user not found
   *
   * @example
   * try {
   *   const result = await userService.deleteUser('user123');
   *   console.log(`User deleted: ${result.success}`);
   *   console.log(`SnapTrade deletion: ${result.snapTradeDeleted}`);
   *   console.log(`Database deletion: ${result.databaseDeleted}`);
   * } catch (error) {
   *   console.error('Failed to delete user:', error.message);
   * }
   */
  async deleteUser(userId, deleteFromSnapTrade = true) {
    try {
      console.log(`Deleting user: ${userId}`);

      const result = {
        success: false,
        snapTradeDeleted: false,
        databaseDeleted: false,
        userId: userId,
      };

      // Delete from SnapTrade API if requested
      if (deleteFromSnapTrade) {
        try {
          await this.client.authentication.deleteSnapTradeUser({ userId });
          result.snapTradeDeleted = true;
          console.log(`User ${userId} deleted from SnapTrade`);
        } catch (snapTradeError) {
          console.error(
            `Failed to delete user ${userId} from SnapTrade:`,
            snapTradeError
          );
          // Continue with local deletion even if SnapTrade deletion fails
        }
      }

      // Delete from local database
      const deleteResult = await this.db_user.deleteOne({ userId });
      if (deleteResult.deletedCount > 0) {
        result.databaseDeleted = true;
        console.log(`User ${userId} deleted from local database`);
      } else {
        console.log(`User ${userId} not found in local database`);
      }

      // Also clean up associated connections
      const connectionDeleteResult = await this.db_connection.deleteMany({
        userId,
      });
      if (connectionDeleteResult.deletedCount > 0) {
        console.log(
          `Deleted ${connectionDeleteResult.deletedCount} connections for user ${userId}`
        );
      }

      result.success = result.databaseDeleted;
      return result;
    } catch (error) {
      console.error(`Error deleting user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Lists all users from the local database
   *
   * Retrieves all users stored in the local database with their basic
   * information. Does not include sensitive data like userSecrets.
   *
   * @async
   * @method listUsers
   * @param {Object} [options] - Query options for filtering and pagination
   * @param {number} [options.limit=100] - Maximum number of users to return
   * @param {number} [options.skip=0] - Number of users to skip
   * @param {Object} [options.filter={}] - MongoDB filter object
   * @returns {Promise<Array>} Array of user objects (without sensitive data)
   * @throws {Error} When database query fails
   *
   * @example
   * try {
   *   const users = await userService.listUsers();
   *   console.log(`Found ${users.length} users`);
   * } catch (error) {
   *   console.error('Failed to list users:', error.message);
   * }
   *
   * @example
   * // List users with pagination
   * try {
   *   const users = await userService.listUsers({ limit: 10, skip: 0 });
   *   console.log(`Found ${users.length} users (first 10)`);
   * } catch (error) {
   *   console.error('Failed to list users:', error.message);
   * }
   */
  async listUsers(options = {}) {
    try {
      const { limit = 100, skip = 0, filter = {} } = options;

      const users = await this.db_user
        .find(filter, { userSecret: 0 }) // Exclude userSecret from results
        .limit(limit)
        .skip(skip)
        .sort({ createdAt: -1 });

      console.log(`Retrieved ${users.length} users from database`);
      return users;
    } catch (error) {
      console.error("Error listing users:", error);
      throw error;
    }
  }

  /**
   * Generates a connection portal URL for user authentication
   *
   * Creates a SnapTrade login URL that redirects users to the connection portal
   * where they can authenticate with their brokerage accounts. Supports various
   * configuration options for customization.
   *
   * @async
   * @method generateConnectionPortalUrl
   * @param {string} userId - The unique identifier for the SnapTrade user
   * @param {string} userSecret - The secret key for authenticating the user
   * @param {Object} [options] - Configuration options for the connection portal
   * @param {string} [options.broker="ROBINHOOD"] - Default broker to show in portal
   * @param {boolean} [options.immediateRedirect=true] - Whether to redirect immediately
   * @param {string} [options.customRedirect] - Custom redirect URL after connection
   * @param {string} [options.connectionPortalVersion="v4"] - Portal version to use
   * @param {string} [options.reconnect] - Authorization ID for reconnection
   * @param {string} [options.connectionType="read"] - Type of connection (read/write)
   * @returns {Promise<Object>} Connection portal response with redirect URL
   * @throws {Error} When API call fails or authentication is invalid
   *
   * @example
   * try {
   *   const portal = await userService.generateConnectionPortalUrl('user123', 'secret456');
   *   console.log(`Redirect URL: ${portal.redirectURI}`);
   * } catch (error) {
   *   console.error('Failed to generate portal URL:', error.message);
   * }
   *
   * @example
   * // Custom configuration
   * try {
   *   const portal = await userService.generateConnectionPortalUrl('user123', 'secret456', {
   *     broker: 'TD_AMERITRADE',
   *     customRedirect: 'https://myapp.com/success',
   *     connectionType: 'write'
   *   });
   *   console.log(`Custom portal URL: ${portal.redirectURI}`);
   * } catch (error) {
   *   console.error('Failed to generate custom portal:', error.message);
   * }
   */
  async generateConnectionPortalUrl(userId, userSecret, options = {}) {
    try {
      const {
        broker = "ROBINHOOD",
        immediateRedirect = true,
        customRedirect = "http://localhost:5173/dashboard",
        connectionPortalVersion = "v4",
        reconnect = null,
        connectionType = "read",
      } = options;

      console.log(`Generating connection portal URL for user: ${userId}`);
      console.log(`Broker: ${broker}, Redirect: ${customRedirect}`);

      const requestParams = {
        userId: userId,
        userSecret: userSecret,
        broker: broker,
        immediateRedirect: immediateRedirect,
        customRedirect: customRedirect,
        connectionPortalVersion: connectionPortalVersion,
        connectionType: connectionType,
      };

      if (reconnect) {
        requestParams.reconnect = reconnect;
      }

      const response = await this.client.authentication.loginSnapTradeUser(
        requestParams
      );

      console.log(
        `Connection portal URL generated successfully for user ${userId}`
      );
      return response.data;
    } catch (error) {
      console.error("Error generating connection portal:", error);
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
   * Validates user credentials and checks account status
   *
   * Verifies that a user exists and has valid credentials for SnapTrade API access.
   * This method is useful for authentication checks and user validation.
   *
   * @async
   * @method validateUser
   * @param {string} userId - The unique identifier for the user
   * @returns {Promise<Object>} User validation result with status and details
   * @throws {Error} When validation fails or user not found
   *
   * @example
   * try {
   *   const validation = await userService.validateUser('user123');
   *   if (validation.isValid) {
   *     console.log('User is valid and ready for API calls');
   *   } else {
   *     console.log('User validation failed:', validation.reason);
   *   }
   * } catch (error) {
   *   console.error('Failed to validate user:', error.message);
   * }
   */
  async validateUser(userId) {
    try {
      console.log(`Validating user: ${userId}`);

      const user = await this.db_user.findOne({ userId });

      if (!user) {
        return {
          isValid: false,
          reason: "User not found in database",
          userId: userId,
        };
      }

      if (!user.userSecret) {
        return {
          isValid: false,
          reason: "User secret not found",
          userId: userId,
        };
      }

      // Test API access by attempting to list connections
      try {
        await this.client.connections.listBrokerageAuthorizations({
          userId: userId,
          userSecret: user.userSecret,
        });

        return {
          isValid: true,
          reason: "User credentials are valid",
          userId: userId,
          userSecret: user.userSecret,
          status: user.status || "active",
          createdAt: user.createdAt,
        };
      } catch (apiError) {
        return {
          isValid: false,
          reason: `API access failed: ${apiError.message}`,
          userId: userId,
          apiError: apiError.message,
        };
      }
    } catch (error) {
      console.error(`Error validating user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Comprehensive user management method
   *
   * Provides a complete overview of user status including validation,
   * connection count, and account information. This method orchestrates
   * multiple operations to provide comprehensive user information.
   *
   * @async
   * @method getUserOverview
   * @param {string} userId - The unique identifier for the user
   * @returns {Promise<Object>} Complete user overview with status and metadata
   * @throws {Error} When API calls fail or user not found
   *
   * @example
   * try {
   *   const overview = await userService.getUserOverview('user123');
   *   console.log(`User Status: ${overview.status}`);
   *   console.log(`Connections: ${overview.connections.total}`);
   *   console.log(`Accounts: ${overview.accounts.total}`);
   * } catch (error) {
   *   console.error('Failed to get user overview:', error.message);
   * }
   */
  async getUserOverview(userId) {
    try {
      console.log(`Getting user overview for: ${userId}`);

      // Get user validation status
      const validation = await this.validateUser(userId);

      if (!validation.isValid) {
        return {
          userId: userId,
          status: "invalid",
          reason: validation.reason,
          isValid: false,
          connections: { total: 0, active: 0 },
          accounts: { total: 0 },
        };
      }

      // Get user connections
      const connections =
        await this.client.connections.listBrokerageAuthorizations({
          userId: userId,
          userSecret: validation.userSecret,
        });

      // Calculate account totals
      const totalAccounts =
        connections.data?.reduce((total, connection) => {
          return total + (connection.accounts?.length || 0);
        }, 0) || 0;

      const activeConnections =
        connections.data?.filter((conn) => conn.status === "active").length ||
        0;

      const overview = {
        userId: userId,
        status: "active",
        isValid: true,
        userSecret: validation.userSecret,
        createdAt: validation.createdAt,
        connections: {
          total: connections.data?.length || 0,
          active: activeConnections,
          inactive: (connections.data?.length || 0) - activeConnections,
        },
        accounts: {
          total: totalAccounts,
        },
        lastChecked: new Date(),
      };

      console.log(`User overview completed for ${userId}:`, {
        connections: overview.connections.total,
        accounts: overview.accounts.total,
        status: overview.status,
      });

      return overview;
    } catch (error) {
      console.error(`Failed to get user overview for ${userId}:`, error);
      throw error;
    }
  }
}

/**
 * Default export of UserServiceClientService
 *
 * Provides a singleton instance of the user service client for use throughout
 * the application. This service handles all SnapTrade user-related operations
 * including user registration, authentication, credential management, and
 * user lifecycle operations.
 *
 * @module UserServiceClientService
 * @default UserServiceClientService
 *
 * @example
 * import UserServiceClientService from './userClient.js';
 *
 * const userService = new UserServiceClientService();
 *
 * // Create a new user
 * const user = await userService.createUser();
 *
 * // Generate connection portal URL
 * const portal = await userService.generateConnectionPortalUrl(user.userId, user.userSecret);
 *
 * // Get user overview
 * const overview = await userService.getUserOverview(user.userId);
 */
export default UserServiceClientService;
