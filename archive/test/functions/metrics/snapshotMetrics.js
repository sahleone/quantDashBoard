/**
 * Portfolio Snapshot Metrics
 *
 * Functions for calculating portfolio snapshot metrics using SnapTrade API:
 * - AUM (Assets Under Management)
 * - Asset Allocation
 * - HHI (Herfindahl-Hirschman Index)
 * - Diversification Score
 */

import { ensureDbConnection, getDb } from "../../utils/dbConnection.js";
import AccountServiceClientService from "../../../../quantDashBoard/server/src/clients/accountClient.js";
import OptionsServiceClientService from "../../../../quantDashBoard/server/src/clients/optionsClient.js";

/**
 * Calculates Assets Under Management (AUM) from SnapTrade API
 * Fetches balances and positions, calculates total portfolio value
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {string} opts.baseCurrency - Base currency for conversion (default: "USD")
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Object>} Object with { aum, cash, securitiesValue, breakdown }
 */
export async function calculateAUMFromSnapTrade(opts = {}) {
  const {
    userId,
    userSecret,
    accountId,
    baseCurrency = "USD",
    databaseUrl,
  } = opts;

  if (!userId || !userSecret || !accountId) {
    throw new Error("userId, userSecret, and accountId are required");
  }

  await ensureDbConnection(databaseUrl);

  try {
    const accountService = new AccountServiceClientService();

    // Fetch balances
    const balances = await accountService.listAccountBalances(
      userId,
      userSecret,
      accountId
    );

    // Fetch positions
    const positions = await accountService.listAccountPositions(
      userId,
      userSecret,
      accountId
    );

    // Calculate total cash (sum across all currencies, convert to base currency if needed)
    let totalCash = 0;
    const cashBreakdown = {};
    for (const balance of balances) {
      const currency = balance.currency?.code || "USD";
      const cash = balance.cash || 0;
      cashBreakdown[currency] = cash;
      // TODO: Add currency conversion if baseCurrency differs
      if (currency === baseCurrency) {
        totalCash += cash;
      } else {
        // For now, only sum same currency (multi-currency conversion would require exchange rates)
        console.warn(
          `Multi-currency balance detected (${currency}). Only ${baseCurrency} balances are included in AUM.`
        );
      }
    }

    // Calculate total securities value
    let totalSecuritiesValue = 0;
    const securitiesBreakdown = {};
    for (const position of positions) {
      const units = position.units || 0;
      const price = position.price || 0;
      const value = units * price;
      const symbol =
        position.symbol?.symbol?.symbol ||
        position.symbol?.symbol ||
        "UNKNOWN";

      if (value > 0) {
        totalSecuritiesValue += value;
        securitiesBreakdown[symbol] = {
          units,
          price,
          value,
          currency: position.currency?.code || "USD",
        };
      }
    }

    const aum = totalCash + totalSecuritiesValue;

    return {
      aum,
      cash: totalCash,
      securitiesValue: totalSecuritiesValue,
      breakdown: {
        cash: cashBreakdown,
        securities: securitiesBreakdown,
      },
      currency: baseCurrency,
      asOf: new Date().toISOString().split("T")[0],
    };
  } catch (error) {
    console.error("Error calculating AUM from SnapTrade:", error);
    throw error;
  }
}

/**
 * Calculates asset allocation and diversification metrics
 * Fetches positions (equity + options) and calculates weights, HHI, diversification score
 *
 * @param {Object} opts - Options object
 * @param {string} opts.userId - User ID (required)
 * @param {string} opts.userSecret - User secret (required)
 * @param {string} opts.accountId - Account ID (required)
 * @param {string} opts.groupBy - Grouping method: 'symbol' | 'assetClass' | 'sector' (default: 'symbol')
 * @param {boolean} opts.includeCash - Whether to include cash in allocation (default: true)
 * @param {string} opts.databaseUrl - MongoDB connection string (optional)
 * @returns {Promise<Object>} Object with { allocation, hhi, diversificationScore, totalValue }
 */
export async function calculateAssetAllocation(opts = {}) {
  const {
    userId,
    userSecret,
    accountId,
    groupBy = "symbol",
    includeCash = true,
    databaseUrl,
  } = opts;

  if (!userId || !userSecret || !accountId) {
    throw new Error("userId, userSecret, and accountId are required");
  }

  await ensureDbConnection(databaseUrl);

  try {
    const accountService = new AccountServiceClientService();
    const optionsService = new OptionsServiceClientService();

    // Fetch all positions
    const equityPositions = await accountService.listAccountPositions(
      userId,
      userSecret,
      accountId
    );
    const optionPositions = await optionsService.listOptionHoldings(
      userId,
      userSecret,
      accountId
    );
    const balances = await accountService.listAccountBalances(
      userId,
      userSecret,
      accountId
    );

    // Calculate position values
    const positionValues = [];

    // Process equity positions
    for (const position of equityPositions) {
      const units = position.units || 0;
      const price = position.price || 0;
      const value = units * price;
      const symbol =
        position.symbol?.symbol?.symbol ||
        position.symbol?.symbol ||
        "UNKNOWN";
      const assetType =
        position.symbol?.symbol?.type?.code ||
        position.symbol?.type?.code ||
        "equity";

      if (value > 0) {
        positionValues.push({
          symbol,
          assetType,
          value,
          units,
          price,
        });
      }
    }

    // Process option positions
    for (const option of optionPositions || []) {
      const units = option.units || 0;
      const price = option.price || 0;
      const value = units * price;
      const symbol = option.option_symbol?.ticker || "UNKNOWN_OPTION";

      if (value > 0) {
        positionValues.push({
          symbol,
          assetType: "option",
          value,
          units,
          price,
        });
      }
    }

    // Calculate total cash
    let totalCash = 0;
    if (includeCash) {
      for (const balance of balances) {
        const cash = balance.cash || 0;
        totalCash += cash; // Simplified: assumes single currency or base currency
      }
      if (totalCash > 0) {
        positionValues.push({
          symbol: "CASH",
          assetType: "cash",
          value: totalCash,
          units: totalCash,
          price: 1,
        });
      }
    }

    // Calculate total portfolio value
    const totalValue = positionValues.reduce((sum, p) => sum + p.value, 0);

    if (totalValue === 0) {
      return {
        allocation: [],
        hhi: 0,
        diversificationScore: 0,
        totalValue: 0,
      };
    }

    // Group positions based on groupBy option
    const groupedValues = {};
    for (const pos of positionValues) {
      let key;
      switch (groupBy) {
        case "assetClass":
          key = pos.assetType || "unknown";
          break;
        case "sector":
          // TODO: Fetch sector data from Yahoo Finance or other source
          key = "unknown"; // Placeholder
          break;
        case "symbol":
        default:
          key = pos.symbol;
          break;
      }

      if (!groupedValues[key]) {
        groupedValues[key] = 0;
      }
      groupedValues[key] += pos.value;
    }

    // Calculate weights and allocation array
    const allocation = [];
    for (const [key, value] of Object.entries(groupedValues)) {
      const weight = value / totalValue;
      allocation.push({
        symbol: key,
        value,
        weight,
        percentage: weight * 100,
      });
    }

    // Sort by value descending
    allocation.sort((a, b) => b.value - a.value);

    // Calculate HHI (Herfindahl-Hirschman Index)
    const hhi = allocation.reduce((sum, item) => sum + item.weight * item.weight, 0);

    // Calculate Diversification Score
    const diversificationScore = 1 - hhi;

    return {
      allocation,
      hhi,
      diversificationScore,
      totalValue,
      currency: "USD", // TODO: Determine from balances
      asOf: new Date().toISOString().split("T")[0],
    };
  } catch (error) {
    console.error("Error calculating asset allocation:", error);
    throw error;
  }
}

/**
 * Calculates diversification metrics (HHI and Diversification Score)
 * Convenience function that calls calculateAssetAllocation and extracts diversification metrics
 *
 * @param {Object} opts - Options object (same as calculateAssetAllocation)
 * @returns {Promise<Object>} Object with { hhi, diversificationScore, totalValue }
 */
export async function calculateDiversification(opts = {}) {
  const allocation = await calculateAssetAllocation(opts);
  return {
    hhi: allocation.hhi,
    diversificationScore: allocation.diversificationScore,
    totalValue: allocation.totalValue,
  };
}

