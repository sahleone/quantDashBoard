/**
 * SnapTrade Client Service
 *
 * This service handles the initialization and configuration of the SnapTrade client,
 * providing a centralized way to manage the SnapTrade API connection.
 */

import { Snaptrade } from "snaptrade-typescript-sdk";
import { config } from "../config/environment.js";

/**
 * SnapTrade Client Instance
 *
 * Creates and configures the main SnapTrade client instance using
 * environment-based credentials for secure API communication.
 */
class SnapTradeClientService {
  constructor() {
    // Fail fast with clear message if required SnapTrade config is missing
    if (!config.snapTrade.clientId || !config.snapTrade.consumerKey) {
      throw new Error(
        "SnapTrade client not configured: SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY are required"
      );
    }

    this.client = new Snaptrade({
      clientId: config.snapTrade.clientId,
      // SDK expects the consumer key; environment.js exports it as consumerKey
      consumerKey: config.snapTrade.consumerKey,
    });
  }

  /**
   * Get the configured SnapTrade client instance
   * @returns {Snaptrade} The configured SnapTrade client
   */
  getClient() {
    return this.client;
  }
  isConfigured() {
    return !!(config.snapTrade.clientId && config.snapTrade.consumerKey);
  }

  /**
   * Checks the current status and health of the SnapTrade API
   *
   */
  async checkApiStatus() {
    try {
      const response = await this.client.apiStatus.check();
      return response.data;
    } catch (error) {
      console.error("Error checking API status:", error);
      throw error;
    }
  }
}

export default SnapTradeClientService;
