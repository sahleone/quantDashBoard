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
 * Calculate AUM (Assets Under Management) from latest portfolio value
 */
export function calculateAUM(portfolioTimeseries) {
  if (!portfolioTimeseries || portfolioTimeseries.length === 0) {
    return 0;
  }
  
  // Get latest total value
  const latest = portfolioTimeseries[portfolioTimeseries.length - 1];
  return latest.totalValue || 0;
}

/**
 * Calculate asset allocation (weights) from positions
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
 * Calculate HHI (Herfindahl-Hirschman Index)
 * HHI = sum(w_i^2) where w_i are portfolio weights
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
 * Calculate Diversification Score
 * Diversification Score = 1 - HHI
 */
export function calculateDiversificationScore(hhi) {
  return 1 - hhi;
}

/**
 * Calculate dividend income from activities
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
 * Calculate interest income from activities
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
 * Calculate total income yield
 * Yield = (Dividend Income + Interest Income) / Average Portfolio Value
 */
export function calculateTotalIncomeYield(dividendIncome, interestIncome, avgPortfolioValue) {
  if (!avgPortfolioValue || avgPortfolioValue <= 0) {
    return 0;
  }

  const totalIncome = dividendIncome + interestIncome;
  return totalIncome / avgPortfolioValue;
}

