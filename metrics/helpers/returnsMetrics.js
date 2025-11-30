/**
 * Returns and Performance Metrics
 * 
 * Functions for calculating returns and performance metrics:
 * - Point-to-point returns
 * - CAGR (Compound Annual Growth Rate)
 * - Time-Weighted Return (TWR)
 */

/**
 * Calculates point-to-point return
 * @param {number} startValue - Initial portfolio value
 * @param {number} endValue - Final portfolio value
 * @returns {number} - Return as a decimal (e.g., 0.1 = 10%)
 */
export function calculatePointToPointReturn(startValue, endValue) {
  if (!startValue || startValue <= 0) {
    return 0;
  }
  return (endValue - startValue) / startValue;
}

/**
 * Calculates Compound Annual Growth Rate (CAGR)
 * @param {number} startValue - Initial portfolio value
 * @param {number} endValue - Final portfolio value
 * @param {number} years - Number of years
 * @returns {number} - CAGR as a decimal (e.g., 0.1 = 10%), or -1 for total loss
 */
export function calculateCAGR(startValue, endValue, years) {
  if (!startValue || startValue <= 0 || !years || years <= 0) {
    return 0;
  }
  if (endValue <= 0) {
    return -1; // Total loss
  }
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Calculates CAGR from daily returns
 * @param {Array<number>} returns - Array of daily returns
 * @param {number} days - Number of trading days
 * @returns {number} - CAGR as a decimal
 */
export function calculateCAGRFromReturns(returns, days) {
  if (!returns || returns.length === 0 || !days || days <= 0) {
    return 0;
  }

  let product = 1;
  for (const ret of returns) {
    product *= 1 + (ret || 0);
  }

  const totalReturn = product - 1;
  const years = days / 252; // Approximate trading days per year

  if (years <= 0) {
    return 0;
  }

  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

/**
 * Calculates Time-Weighted Return (TWR) by splitting periods at cash flows
 * @param {Array} portfolioTimeseries - Array of portfolio timeseries records
 * @param {Array<Date>} cashFlowDates - Array of dates with cash flows
 * @returns {number} - TWR as a decimal
 */
export function calculateTWR(portfolioTimeseries, cashFlowDates) {
  if (!portfolioTimeseries || portfolioTimeseries.length === 0) {
    return 0;
  }

  if (!cashFlowDates || cashFlowDates.length === 0) {
    const first = portfolioTimeseries[0];
    const last = portfolioTimeseries[portfolioTimeseries.length - 1];
    return calculatePointToPointReturn(
      first.totalValue || 0,
      last.totalValue || 0
    );
  }

  const subperiods = [];
  let currentPeriodStart = 0;

  for (const cfDate of cashFlowDates) {
    const cfIndex = portfolioTimeseries.findIndex(
      (pt) =>
        new Date(pt.date).toISOString().split("T")[0] ===
        new Date(cfDate).toISOString().split("T")[0]
    );

    if (cfIndex > currentPeriodStart) {
      const periodStart = portfolioTimeseries[currentPeriodStart];
      const periodEnd = portfolioTimeseries[cfIndex - 1];
      const periodReturn = calculatePointToPointReturn(
        periodStart.totalValue || 0,
        periodEnd.totalValue || 0
      );
      subperiods.push(periodReturn);
      currentPeriodStart = cfIndex;
    }
  }

  if (currentPeriodStart < portfolioTimeseries.length - 1) {
    const periodStart = portfolioTimeseries[currentPeriodStart];
    const periodEnd = portfolioTimeseries[portfolioTimeseries.length - 1];
    const periodReturn = calculatePointToPointReturn(
      periodStart.totalValue || 0,
      periodEnd.totalValue || 0
    );
    subperiods.push(periodReturn);
  }

  let twr = 1;
  for (const periodReturn of subperiods) {
    twr *= 1 + periodReturn;
  }

  return twr - 1;
}

