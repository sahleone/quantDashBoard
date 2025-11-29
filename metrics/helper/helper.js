// Etl helper utilities

import mongoose from "mongoose";

/**
 * Get the last activity date for an account from the Activities collection.
 * Prefers `trade_date` (SnapTrade) then `date` (normalized). Returns
 * a string in YYYY-MM-DD format or null if no activity.
 *
 * This function uses direct MongoDB queries to avoid model connection issues.
 */
export async function getLastActivityDate(ActivitiesModel, accountId) {
  if (!accountId) throw new Error("getLastActivityDate: accountId is required");

  // Use direct connection query since model queries are timing out
  const db = mongoose.connection.db;
  const activitiesCollection = db.collection("snaptradeaccountactivities");
  
  // Find latest by trade_date or date (descending)
  const activity = await activitiesCollection
    .findOne(
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
