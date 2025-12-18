/**
 * Returns & Performance Metrics
 *
 * Functions for calculating returns and performance metrics from portfolio timeseries:
 * - Point-to-Point Returns / ROI
 * - Annualized Return (CAGR)
 * - Time-Weighted Return (TWR)
 */

import { ensureDbConnection, getDb } from "../../utils/dbConnection.js";
import { formatDateToYYYYMMDD } from "../../utils/dateHelpers.js";

/**
 * Gets the date range for a given period ending at asOfDate
 *
 * @param {string} period - Period identifier: "1M", "3M", "YTD", "1Y", "ITD"
 * @param {Date} asOfDate - End date for the period
 * @returns {{startDate: Date|null, endDate: Date}} Date range object
 */
function getPeriodDateRange(period, asOfDate) {
  const endDate = new Date(asOfDate);
  endDate.setHours(23, 59, 59, 999);

  const startDate = new Date(endDate);

  switch (period) {
    case "1M":
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "3M":
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "YTD":
      startDate.setMonth(0);
      startDate.setDate(1);
      break;
    case "1Y":
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case "ITD":
      return { startDate: null, endDate };
    default:
      throw new Error(`Unknown period: ${period}`);
  }

  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate };
}

/**
 * Calculates point-to-point return from portfolio series
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.portfolioSeries - Array of portfolio series objects with { date, portfolioValue }
 * @param {string} opts.period - Period: "1M" | "3M" | "YTD" | "1Y" | "ITD" (default: "ITD")
 * @param {Date} opts.asOfDate - End date for calculations (default: today)
 * @returns {Object} Object with { return, startValue, endValue, startDate, endDate }
 */
export function calculatePointToPointReturn(opts = {}) {
  const { portfolioSeries, period = "ITD", asOfDate = new Date() } = opts;

  if (!Array.isArray(portfolioSeries) || portfolioSeries.length === 0) {
    throw new Error("portfolioSeries is required and must be non-empty");
  }

  const { startDate: periodStart, endDate } = getPeriodDateRange(
    period,
    asOfDate
  );

  // Filter portfolio series by date range
  let filtered = portfolioSeries;
  if (periodStart) {
    filtered = portfolioSeries.filter((p) => {
      const pDate = new Date(p.date);
      return pDate >= periodStart && pDate <= endDate;
    });
  } else {
    // ITD: use all data
    filtered = portfolioSeries.filter((p) => {
      const pDate = new Date(p.date);
      return pDate <= endDate;
    });
  }

  if (filtered.length === 0) {
    throw new Error(`No portfolio data found for period ${period}`);
  }

  const first = filtered[0];
  const last = filtered[filtered.length - 1];

  const startValue = first.portfolioValue || 0;
  const endValue = last.portfolioValue || 0;

  if (startValue <= 0) {
    return {
      return: 0,
      startValue,
      endValue,
      startDate: formatDateToYYYYMMDD(first.date),
      endDate: formatDateToYYYYMMDD(last.date),
    };
  }

  const returnValue = (endValue - startValue) / startValue;

  return {
    return: returnValue,
    startValue,
    endValue,
    startDate: formatDateToYYYYMMDD(first.date),
    endDate: formatDateToYYYYMMDD(last.date),
  };
}

/**
 * Calculates Compound Annual Growth Rate (CAGR)
 *
 * @param {Object} opts - Options object
 * @param {number} opts.startValue - Initial portfolio value
 * @param {number} opts.endValue - Final portfolio value
 * @param {Date|string} opts.startDate - Start date
 * @param {Date|string} opts.endDate - End date
 * @returns {Object} Object with { cagr, years }
 */
export function calculateCAGR(opts = {}) {
  const { startValue, endValue, startDate, endDate } = opts;

  if (!startValue || startValue <= 0) {
    return { cagr: 0, years: 0 };
  }

  if (endValue <= 0) {
    return { cagr: -1, years: 0 }; // Total loss
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  const years = days / 365.25;

  if (years <= 0) {
    return { cagr: 0, years: 0 };
  }

  const cagr = Math.pow(endValue / startValue, 1 / years) - 1;

  return { cagr, years };
}

/**
 * Calculates CAGR from daily returns
 *
 * @param {Object} opts - Options object
 * @param {Array<number>} opts.returns - Array of daily returns
 * @param {number} opts.days - Number of trading days
 * @returns {number} CAGR as a decimal
 */
export function calculateCAGRFromReturns(opts = {}) {
  const { returns, days } = opts;

  if (!returns || returns.length === 0 || !days || days <= 0) {
    return 0;
  }

  let product = 1;
  for (const ret of returns) {
    product *= 1 + (ret || 0);
  }

  const totalReturn = product - 1;
  const years = days / 252; // Trading days per year

  if (years <= 0) {
    return 0;
  }

  return Math.pow(1 + totalReturn, 1 / years) - 1;
}

/**
 * Calculates Time-Weighted Return (TWR) by splitting periods at cash flows
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.portfolioSeries - Array of portfolio series objects
 * @param {Array} opts.activities - Array of activities to identify cash flow dates
 * @param {Date|string} opts.startDate - Start date
 * @param {Date|string} opts.endDate - End date
 * @returns {Object} Object with { twr, twrAnnualized, subperiods }
 */
export async function calculateTWR(opts = {}) {
  const { portfolioSeries, activities, startDate, endDate } = opts;

  if (!Array.isArray(portfolioSeries) || portfolioSeries.length === 0) {
    throw new Error("portfolioSeries is required and must be non-empty");
  }

  // Identify cash flow dates from activities
  const cashFlowDates = new Set();
  if (Array.isArray(activities)) {
    for (const activity of activities) {
      const type = String(activity.type || "").toUpperCase();
      if (
        type === "CONTRIBUTION" ||
        type === "WITHDRAWAL" ||
        type === "DEPOSIT" ||
        type === "WITHDRAW"
      ) {
        const date = activity.trade_date || activity.date;
        if (date) {
          cashFlowDates.add(formatDateToYYYYMMDD(date));
        }
      }
    }
  }

  const sortedFlowDates = Array.from(cashFlowDates).sort();

  if (sortedFlowDates.length === 0) {
    // No cash flows: TWR = simple return
    const returnData = calculatePointToPointReturn({
      portfolioSeries,
      period: "ITD",
      asOfDate: endDate,
    });
    const years = calculateCAGR({
      startValue: returnData.startValue,
      endValue: returnData.endValue,
      startDate: returnData.startDate,
      endDate: returnData.endDate,
    }).years;

    return {
      twr: returnData.return,
      twrAnnualized: years > 0 ? Math.pow(1 + returnData.return, 1 / years) - 1 : 0,
      subperiods: [
        {
          startDate: returnData.startDate,
          endDate: returnData.endDate,
          return: returnData.return,
        },
      ],
    };
  }

  // Split into subperiods
  const subperiods = [];
  let currentPeriodStart = 0;

  for (const flowDate of sortedFlowDates) {
    const flowIndex = portfolioSeries.findIndex(
      (p) => formatDateToYYYYMMDD(p.date) === flowDate
    );

    if (flowIndex > currentPeriodStart) {
      const periodStart = portfolioSeries[currentPeriodStart];
      const periodEnd = portfolioSeries[flowIndex - 1];
      const startValue = periodStart.portfolioValue || 0;
      const endValue = periodEnd.portfolioValue || 0;

      if (startValue > 0) {
        const periodReturn = (endValue - startValue) / startValue;
        subperiods.push({
          startDate: formatDateToYYYYMMDD(periodStart.date),
          endDate: formatDateToYYYYMMDD(periodEnd.date),
          return: periodReturn,
        });
      }
      currentPeriodStart = flowIndex;
    }
  }

  // Final subperiod
  if (currentPeriodStart < portfolioSeries.length - 1) {
    const periodStart = portfolioSeries[currentPeriodStart];
    const periodEnd = portfolioSeries[portfolioSeries.length - 1];
    const startValue = periodStart.portfolioValue || 0;
    const endValue = periodEnd.portfolioValue || 0;

    if (startValue > 0) {
      const periodReturn = (endValue - startValue) / startValue;
      subperiods.push({
        startDate: formatDateToYYYYMMDD(periodStart.date),
        endDate: formatDateToYYYYMMDD(periodEnd.date),
        return: periodReturn,
      });
    }
  }

  // Compound subperiod returns
  let twr = 1;
  for (const subperiod of subperiods) {
    twr *= 1 + subperiod.return;
  }
  twr = twr - 1;

  // Calculate annualized TWR
  const firstSubperiod = subperiods[0];
  const lastSubperiod = subperiods[subperiods.length - 1];
  const totalDays =
    (new Date(lastSubperiod.endDate) - new Date(firstSubperiod.startDate)) /
    (1000 * 60 * 60 * 24);
  const years = totalDays / 365.25;
  const twrAnnualized = years > 0 ? Math.pow(1 + twr, 1 / years) - 1 : 0;

  return {
    twr,
    twrAnnualized,
    subperiods,
  };
}

