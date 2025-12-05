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

