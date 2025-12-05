import mongoose from "mongoose";

/**
 * Gets the last activity date for an account from the Activities collection.
 * Prefers `trade_date` (SnapTrade) then `date` (normalized).
 * @param {Object} ActivitiesModel - Mongoose model (unused, kept for compatibility)
 * @param {string} accountId - Account ID to query
 * @returns {Promise<string|null>} - Date string in YYYY-MM-DD format or null if no activity
 */
export async function getLastActivityDate(ActivitiesModel, accountId) {
  if (!accountId) throw new Error("getLastActivityDate: accountId is required");

  const db = mongoose.connection.db;
  const activitiesCollection = db.collection("snaptradeaccountactivities");

  const activity = await activitiesCollection.findOne(
    { accountId },
    { sort: { trade_date: -1, date: -1 } }
  );

  if (!activity) return null;

  const dateValue = activity.trade_date || activity.date || null;
  if (!dateValue) return null;

  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);
}

export default getLastActivityDate;
