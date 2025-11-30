/**
 * Returns and Performance Metrics
 * 
 * Functions for calculating returns and performance metrics:
 * - Point-to-point returns
 * - CAGR (Compound Annual Growth Rate)
 * - Time-Weighted Return (TWR)
 */

/**
 * Calculate point-to-point return
 * R = (V_T - V_0) / V_0
 */
export function calculatePointToPointReturn(startValue, endValue) {
  if (!startValue || startValue <= 0) {
    return 0;
  }
  return (endValue - startValue) / startValue;
}

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * CAGR = (V_T / V_0)^(1/Y) - 1 where Y = years
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
 * Calculate CAGR from daily returns
 * CAGR = (product(1 + r_t))^(252/T) - 1 for daily data
 * where 252 = trading days per year, T = number of days
 */
export function calculateCAGRFromReturns(returns, days) {
  if (!returns || returns.length === 0 || !days || days <= 0) {
    return 0;
  }

  // Calculate cumulative return
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
 * Calculate Time-Weighted Return (TWR)
 * Split period at cash flow dates and compound subperiod returns
 */
export function calculateTWR(portfolioTimeseries, cashFlowDates) {
  if (!portfolioTimeseries || portfolioTimeseries.length === 0) {
    return 0;
  }

  // If no cash flows, use simple cumulative return
  if (!cashFlowDates || cashFlowDates.length === 0) {
    const first = portfolioTimeseries[0];
    const last = portfolioTimeseries[portfolioTimeseries.length - 1];
    return calculatePointToPointReturn(
      first.totalValue || 0,
      last.totalValue || 0
    );
  }

  // Split into subperiods at cash flow dates
  const subperiods = [];
  let currentPeriodStart = 0;

  for (const cfDate of cashFlowDates) {
    // Find index of cash flow date
    const cfIndex = portfolioTimeseries.findIndex(
      (pt) =>
        new Date(pt.date).toISOString().split("T")[0] ===
        new Date(cfDate).toISOString().split("T")[0]
    );

    if (cfIndex > currentPeriodStart) {
      // Calculate return for this subperiod
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

  // Calculate return for final subperiod
  if (currentPeriodStart < portfolioTimeseries.length - 1) {
    const periodStart = portfolioTimeseries[currentPeriodStart];
    const periodEnd = portfolioTimeseries[portfolioTimeseries.length - 1];
    const periodReturn = calculatePointToPointReturn(
      periodStart.totalValue || 0,
      periodEnd.totalValue || 0
    );
    subperiods.push(periodReturn);
  }

  // Compound subperiod returns
  let twr = 1;
  for (const periodReturn of subperiods) {
    twr *= 1 + periodReturn;
  }

  return twr - 1;
}

