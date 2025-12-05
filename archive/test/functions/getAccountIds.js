import { ensureDbConnection, getDb } from "../utils/dbConnection.js";

/**
 * Gets all account IDs from the database
 *
 * @param {Object} opts - Options object
 * @param {string} opts.databaseUrl - MongoDB connection string (defaults to DATABASE_URL env var)
 * @returns {Promise<string[]>} Array of account IDs
 */
export async function getAllAccountIds(opts = {}) {
  await ensureDbConnection(opts.databaseUrl);

  try {
    const db = getDb();
    const accountsCollection = db.collection("snaptradeaccounts");

    const accounts = await accountsCollection
      .find({}, { projection: { accountId: 1, _id: 0 } })
      .toArray();

    const accountIds = accounts.map((account) => account.accountId);
    return accountIds;
  } catch (err) {
    console.error("Error fetching account IDs:", err?.message || err);
    throw err;
  }
}
