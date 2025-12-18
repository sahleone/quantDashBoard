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

/**
 * Calculate Time-Weighted Rate of Return (TWR) from portfolio timeseries
 *
 * TWR eliminates the impact of external cash flows by breaking the investment period
 * into sub-periods at each cash flow event, calculating returns for each sub-period,
 * and then linking them geometrically.
 *
 * Formula: TWR = [(1 + HP1) × (1 + HP2) × ... × (1 + HPn)] - 1
 * where HP = (End Value Before Cash Flow - Start Value) / Start Value
 *
 * Reference: https://www.investopedia.com/terms/t/time-weightedror.asp
 *
 * @param {Array} portfolioTimeseries - Array of {date, totalValue, depositWithdrawal} objects sorted by date
 * @returns {number} Time-weighted return as a decimal (e.g., 0.15 for 15%)
 */
export function calculateTWRFromTimeseries(portfolioTimeseries) {
  if (!portfolioTimeseries || portfolioTimeseries.length < 2) {
    return 0;
  }

  const subPeriodReturns = [];
  let subPeriodStartIdx = 0;

  // Process each day to identify sub-periods
  for (let i = 1; i < portfolioTimeseries.length; i++) {
    const hasCashFlow =
      Math.abs(portfolioTimeseries[i].depositWithdrawal || 0) > 1e-6;
    const isLastDay = i === portfolioTimeseries.length - 1;

    // A sub-period ends when we encounter a cash flow or reach the last day
    if (hasCashFlow || isLastDay) {
      const startValue = portfolioTimeseries[subPeriodStartIdx].totalValue || 0;
      const endValue = portfolioTimeseries[i].totalValue || 0;
      const cashFlow = portfolioTimeseries[i].depositWithdrawal || 0;

      // Calculate holding period return for this sub-period
      // The end value should be adjusted to exclude the cash flow for return calculation
      // End Value Before Cash Flow = End Value - Cash Flow
      const endValueBeforeCashFlow = endValue - cashFlow;

      let holdingPeriodReturn = 0;
      if (Math.abs(startValue) > 1e-6) {
        holdingPeriodReturn =
          (endValueBeforeCashFlow - startValue) / startValue;
      } else if (Math.abs(endValueBeforeCashFlow) > 1e-6) {
        // If start value is zero but we have an end value, return is undefined
        // In practice, this might indicate a new account - skip this sub-period
        holdingPeriodReturn = 0;
      }

      subPeriodReturns.push(holdingPeriodReturn);

      // Next sub-period starts after this cash flow (or continues if no cash flow on last day)
      if (hasCashFlow) {
        subPeriodStartIdx = i;
      }
    }
  }

  // If no sub-periods were created (shouldn't happen, but handle edge case)
  if (subPeriodReturns.length === 0) {
    const startValue = portfolioTimeseries[0].totalValue || 0;
    const endValue =
      portfolioTimeseries[portfolioTimeseries.length - 1].totalValue || 0;
    if (Math.abs(startValue) > 1e-6) {
      return (endValue - startValue) / startValue;
    }
    return 0;
  }

  // Link sub-period returns geometrically: TWR = product of (1 + HP) - 1
  const twr =
    subPeriodReturns.reduce((product, hp) => {
      // Handle edge cases where return might be very negative
      // Allow negative factors (losses) - only check for finite values
      const factor = 1 + hp;
      return product * (isFinite(factor) ? factor : 1);
    }, 1) - 1;

  return isFinite(twr) ? twr : 0;
}
