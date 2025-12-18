/**
 * Date helper functions for transforming dates to "yyyy-mm-dd" format
 */

/**
 * Transforms a date to "yyyy-mm-dd" format
 * Handles Date objects, date strings, and ISO strings
 *
 * @param {Date|string} date - Date to transform
 * @returns {string|null} Date in "yyyy-mm-dd" format or null if invalid
 */
export function formatDateToYYYYMMDD(date) {
  if (!date) return null;

  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return null;
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch (err) {
    return null;
  }
}

/**
 * Gets the trade_date from an activity, preferring trade_date over date
 * Returns the date in "yyyy-mm-dd" format
 *
 * @param {Object} activity - Activity object from database
 * @returns {string|null} Date in "yyyy-mm-dd" format or null if no date found
 */
export function getTradeDateAsYYYYMMDD(activity) {
  if (!activity) return null;

  const dateValue = activity.trade_date || activity.date;
  if (!dateValue) return null;

  return formatDateToYYYYMMDD(dateValue);
}

/**
 * Transforms an array of activities to include formatted dates
 * Adds a `tradeDateFormatted` field to each activity
 *
 * @param {Array} activities - Array of activity objects
 * @returns {Array} Array of activities with `tradeDateFormatted` field added
 */
export function addFormattedDatesToActivities(activities) {
  if (!Array.isArray(activities)) {
    return [];
  }

  return activities.map((activity) => {
    const formatted = getTradeDateAsYYYYMMDD(activity);
    return {
      ...activity,
      tradeDateFormatted: formatted,
    };
  });
}

/**
 * Adds or subtracts days from a date string in "YYYY-MM-DD" format
 * Uses UTC to avoid timezone-related date shifting issues
 *
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format
 * @param {number} days - Number of days to add (positive) or subtract (negative)
 * @returns {string} Date string in "YYYY-MM-DD" format
 */
export function addDaysToDateString(dateStr, days) {
  if (!dateStr || typeof dateStr !== "string") {
    return null;
  }

  try {
    // Parse the date string as UTC to avoid timezone issues
    const [year, month, day] = dateStr.split("-").map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return null;
    }

    // Create a UTC date object
    const date = new Date(Date.UTC(year, month - 1, day));

    // Add/subtract days using UTC methods
    date.setUTCDate(date.getUTCDate() + days);

    // Format back to YYYY-MM-DD using UTC methods
    const resultYear = date.getUTCFullYear();
    const resultMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const resultDay = String(date.getUTCDate()).padStart(2, "0");

    return `${resultYear}-${resultMonth}-${resultDay}`;
  } catch (err) {
    return null;
  }
}

/**
 * Checks if a date string represents a weekend (Saturday or Sunday)
 * Uses UTC to avoid timezone-related issues
 *
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format
 * @returns {boolean} True if the date is a Saturday (6) or Sunday (0)
 */
export function isWeekend(dateStr) {
  if (!dateStr || typeof dateStr !== "string") {
    return false;
  }

  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return false;
    }

    // Create a UTC date object
    const date = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

    return dayOfWeek === 0 || dayOfWeek === 6;
  } catch (err) {
    return false;
  }
}

/**
 * Gets the previous Friday for a weekend date, or returns the date unchanged if not a weekend
 * Uses UTC to avoid timezone-related issues
 *
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format
 * @returns {string|null} Previous Friday's date in "YYYY-MM-DD" format, or null if invalid
 */
export function getPreviousFriday(dateStr) {
  if (!dateStr || typeof dateStr !== "string") {
    return null;
  }

  if (!isWeekend(dateStr)) {
    return dateStr; // Not a weekend, return as-is
  }

  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return null;
    }

    // Create a UTC date object
    const date = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // Calculate days to subtract to get to Friday
    // Sunday (0) -> subtract 2 days to get Friday
    // Saturday (6) -> subtract 1 day to get Friday
    const daysToSubtract = dayOfWeek === 0 ? 2 : 1;

    date.setUTCDate(date.getUTCDate() - daysToSubtract);

    // Format back to YYYY-MM-DD
    const resultYear = date.getUTCFullYear();
    const resultMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const resultDay = String(date.getUTCDate()).padStart(2, "0");

    return `${resultYear}-${resultMonth}-${resultDay}`;
  } catch (err) {
    return null;
  }
}

