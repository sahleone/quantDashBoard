import { ensureDbConnection, getDb } from "../utils/dbConnection.js";

/**
 * Finds all equity symbols in activities stored in the database
 * Returns a unique array of symbols
 *
 * @param {Object} opts - Options object
 * @param {string} opts.databaseUrl - MongoDB connection string (defaults to DATABASE_URL env var)
 * @param {string} opts.accountId - Optional accountId to filter by specific account
 * @returns {Promise<string[]>} Array of unique equity symbols
 */
export async function getActivitySymbols(opts = {}) {
  const { databaseUrl, accountId } = opts;

  await ensureDbConnection(databaseUrl);

  const db = getDb();
  const activitiesCollection = db.collection("snaptradeaccountactivities");

  try {
    const query = {
      symbol: { $ne: null, $exists: true },
    };
    if (accountId) {
      query.accountId = accountId;
    }

    const symbols = await activitiesCollection.distinct("symbol", query);
    const uniqueSymbols = [...new Set(symbols.filter((s) => s && s.trim() !== ""))];

    return uniqueSymbols.sort();
  } catch (err) {
    console.error("Error fetching activity symbols:", err?.message || err);
    throw err;
  }
}

