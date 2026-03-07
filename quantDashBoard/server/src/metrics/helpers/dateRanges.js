/**
 * Shared date-range helpers.
 *
 * getDateRange()    — UTC-safe period→{startDate, endDate} with month clamping
 * mapRangeToPeriod() — normalizes user-facing range strings to canonical keys
 */

/**
 * Returns a {startDate, endDate} pair for a given range string.
 * Uses UTC arithmetic with month-day clamping (e.g. March 31 − 1M → Feb 28).
 *
 * @param {string} range  – one of 1M, 3M, YTD, 1Y, ALL, ITD, ALLTIME (case-insensitive)
 * @param {Date}  [asOfDate=new Date()] – anchor date
 * @returns {{startDate: Date|null, endDate: Date}}
 */
export function getDateRange(range, asOfDate = new Date()) {
  const upper = range.toUpperCase();

  const endDate = new Date(asOfDate);
  endDate.setUTCHours(23, 59, 59, 999);

  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();
  const endDay = endDate.getUTCDate();

  let startDate;

  switch (upper) {
    case '1M': {
      let targetMonth = endMonth - 1;
      let targetYear = endYear;
      if (targetMonth < 0) { targetMonth += 12; targetYear -= 1; }
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(endDay, lastDay)));
      break;
    }
    case '3M': {
      let targetMonth = endMonth - 3;
      let targetYear = endYear;
      while (targetMonth < 0) { targetMonth += 12; targetYear -= 1; }
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(targetYear, targetMonth, Math.min(endDay, lastDay)));
      break;
    }
    case 'YTD':
      startDate = new Date(Date.UTC(endYear, 0, 1));
      startDate.setUTCHours(0, 0, 0, 0);
      return { startDate, endDate };
    case '1Y': {
      const lastDay = new Date(Date.UTC(endYear - 1, endMonth + 1, 0)).getUTCDate();
      startDate = new Date(Date.UTC(endYear - 1, endMonth, Math.min(endDay, lastDay)));
      break;
    }
    case 'ALL':
    case 'ITD':
    case 'ALLTIME':
      return { startDate: null, endDate };
    default:
      throw new Error(`Unknown range: ${upper}`);
  }

  startDate.setUTCHours(0, 0, 0, 0);
  return { startDate, endDate };
}

/**
 * Normalizes user-facing range strings to canonical period keys.
 * @param {string} range
 * @returns {string}
 */
export function mapRangeToPeriod(range) {
  const upper = range.toUpperCase();
  switch (upper) {
    case '1M':  return '1M';
    case '3M':  return '3M';
    case 'YTD': return 'YTD';
    case '1Y':  return '1Y';
    case 'ITD':
    case 'ALL':
    case 'ALLTIME':
      return 'ALL';
    default:
      return 'ALL';
  }
}
