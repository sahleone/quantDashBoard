/**
 * Portfolio Snapshot Metrics
 *
 * Functions for calculating portfolio snapshot metrics:
 * - AUM (Assets Under Management)
 * - Asset Allocation
 * - HHI (Herfindahl-Hirschman Index)
 * - Diversification Score
 * - Income metrics (dividends, interest, yield)
 */

/**
 * Calculates Assets Under Management (AUM) from the latest portfolio value
 * @param {Array} portfolioTimeseries - Array of portfolio timeseries records
 * @returns {number} - Latest total portfolio value
 */
export function calculateAUM(portfolioTimeseries) {
  if (!portfolioTimeseries || portfolioTimeseries.length === 0) {
    return 0;
  }

  const latest = portfolioTimeseries[portfolioTimeseries.length - 1];
  return latest.totalValue || 0;
}

/**
 * Calculates asset allocation weights from positions
 * @param {Array} positions - Array of position objects with symbol and value
 * @param {number} totalValue - Total portfolio value
 * @returns {Object} - Object mapping symbols to their weight (0-1)
 */
export function calculateAssetAllocation(positions, totalValue) {
  if (!positions || positions.length === 0 || totalValue <= 0) {
    return {};
  }

  const allocation = {};
  for (const pos of positions) {
    const weight = (pos.value || 0) / totalValue;
    if (weight > 0) {
      allocation[pos.symbol] = weight;
    }
  }

  return allocation;
}

/**
 * Calculates Herfindahl-Hirschman Index (HHI) for portfolio concentration
 * @param {Object} weights - Object mapping symbols to portfolio weights
 * @returns {number} - HHI value (0-1, higher = more concentrated)
 */
export function calculateHHI(weights) {
  if (!weights || Object.keys(weights).length === 0) {
    return 0;
  }

  let hhi = 0;
  for (const weight of Object.values(weights)) {
    hhi += weight * weight;
  }

  return hhi;
}

/**
 * Calculates diversification score from HHI
 * @param {number} hhi - Herfindahl-Hirschman Index value
 * @returns {number} - Diversification score (0-1, higher = more diversified)
 */
export function calculateDiversificationScore(hhi) {
  return 1 - hhi;
}

/**
 * Calculates total dividend income from activities within a date range
 * @param {Array} activities - Array of activity records
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 * @returns {number} - Total dividend income amount
 */
export function calculateDividendIncome(activities, startDate, endDate) {
  if (!activities || activities.length === 0) {
    return 0;
  }

  let total = 0;
  for (const activity of activities) {
    const type = String(activity.type || "").toUpperCase();
    if (type === "DIVIDEND" || type === "STOCK_DIVIDEND") {
      const date = new Date(activity.trade_date || activity.date);
      if (date >= startDate && date <= endDate) {
        const amount = parseFloat(activity.amount || 0);
        if (!isNaN(amount) && amount > 0) {
          total += amount;
        }
      }
    }
  }

  return total;
}

/**
 * Calculates total interest income from activities within a date range
 * @param {Array} activities - Array of activity records
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 * @returns {number} - Total interest income amount
 */
export function calculateInterestIncome(activities, startDate, endDate) {
  if (!activities || activities.length === 0) {
    return 0;
  }

  let total = 0;
  for (const activity of activities) {
    const type = String(activity.type || "").toUpperCase();
    if (type === "INTEREST") {
      const date = new Date(activity.trade_date || activity.date);
      if (date >= startDate && date <= endDate) {
        const amount = parseFloat(activity.amount || 0);
        if (!isNaN(amount) && amount > 0) {
          total += amount;
        }
      }
    }
  }

  return total;
}

/**
 * Calculates total income yield as a percentage
 * @param {number} dividendIncome - Total dividend income
 * @param {number} interestIncome - Total interest income
 * @param {number} avgPortfolioValue - Average portfolio value over the period
 * @returns {number} - Income yield as a decimal (e.g., 0.05 = 5%)
 */
export function calculateTotalIncomeYield(
  dividendIncome,
  interestIncome,
  avgPortfolioValue
) {
  if (!avgPortfolioValue || avgPortfolioValue <= 0) {
    return 0;
  }

  const totalIncome = dividendIncome + interestIncome;
  return totalIncome / avgPortfolioValue;
}
