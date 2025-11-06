import AccountModel from "../models/AccountsList.js";
import AccountServiceClientService from "../clients/accountClient.js";

/**
 * Fetch accounts for a given userId from SnapTrade and upsert them into MongoDB
 *
 * Caller MUST provide the SnapTrade user id and userSecret.
 *
 * @param {string} userId - SnapTrade user id
 * @param {string} userSecret - SnapTrade user secret
 * @returns {Promise<Array>} - array of upserted account documents
 */
export default async function updateAccountsForUser(userId, userSecret) {
  if (!userId) throw new Error("Missing userId");
  if (!userSecret) throw new Error("Missing userSecret");

  const accountService = new AccountServiceClientService();

  let accounts = [];
  try {
    accounts = await accountService.listAccounts(userId, userSecret);
  } catch (err) {
    console.error(
      `Failed to list accounts for user ${userId}:`,
      err?.message || err
    );
    throw err;
  }

  if (!Array.isArray(accounts) || accounts.length === 0) return [];

  const results = [];

  for (const rawAccount of accounts) {
    try {
      if (!rawAccount || !rawAccount.id) continue;

      const mapped = {
        // use the provided userId parameter for linkage (no `user` variable here)
        userId: userId,
        brokerageAuthorizationId:
          rawAccount.authorizationId ||
          rawAccount.authorization_id ||
          rawAccount.brokerage?.id ||
          null,
        accountId: rawAccount.id,
        accountName: rawAccount.name || rawAccount.accountName || "Unknown",
        number: rawAccount.number || rawAccount.account_number || null,
        currency: rawAccount.currency?.code || rawAccount.currency || "USD",
        institutionName:
          rawAccount.institution_name ||
          rawAccount.brokerage?.name ||
          "Unknown",
        createdDate: rawAccount.created_at
          ? new Date(rawAccount.created_at)
          : rawAccount.createdDate
          ? new Date(rawAccount.createdDate)
          : null,
        raw_type: rawAccount.type || rawAccount.account_type || null,
        status: rawAccount.status || rawAccount.state || null,
      };

      const updated = await AccountModel.findOneAndUpdate(
        { accountId: mapped.accountId },
        { $set: mapped },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (updated) results.push(updated);
    } catch (err) {
      console.error(
        `Error upserting account for user ${userId}:`,
        err?.message || err
      );
      // continue processing other accounts
    }
  }

  return results;
}

export { updateAccountsForUser };
