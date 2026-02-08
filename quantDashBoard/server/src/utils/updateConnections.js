import ConnectionModel from "../models/Connection.js";
import User from "../models/Users.js";
import ConnectionServiceClientService from "../clients/connectionsClient.js";

/**
 * Fetch brokerage authorizations (connections) for a given userId from SnapTrade
 * and upsert them into MongoDB.
 *
 * If `userSecret` is provided it will be used directly. Otherwise the function
 * will look up the user in our DB to read the stored SnapTrade `userSecret`.
 *
 * @param {string} userId - internal userId stored in our Users collection
 * @param {string} [userSecret] - optional SnapTrade userSecret; if supplied no DB lookup is required
 * @returns {Promise<Array>} - array of upserted connection documents
 */
export default async function updateConnectionsForUser(
  userId,
  userSecret = null
) {
  if (!userId) {
    throw new Error("Missing userId");
  }

  let user = null;
  let effectiveSecret = userSecret || null;

  if (!effectiveSecret) {
    user = await User.findOne({ userId });
    if (!user) {
      throw new Error(`User not found for userId=${userId}`);
    }

    if (!user.userSecret) {
      throw new Error(`SnapTrade userSecret missing for userId=${userId}`);
    }

    effectiveSecret = user.userSecret;
  } else {
    // try to load user for metadata but don't require it
    user = await User.findOne({ userId }).catch(() => null);
  }

  const connectionService = new ConnectionServiceClientService();

  let connections = [];
  try {
    connections = await connectionService.listBrokerageAuthorizations(
      userId,
      effectiveSecret
    );
  } catch (err) {
    console.error(
      `Failed to list connections for user ${userId}:`,
      err?.message || err
    );
    throw err;
  }

  if (!Array.isArray(connections) || connections.length === 0) return [];

  const results = [];

  const ALLOWED_STATUSES = ["ACTIVE", "INACTIVE", "PENDING", "ERROR"];

  for (const raw of connections) {
    try {
      if (!raw || !raw.id) continue;

      const normalizedStatus = (raw.status || "ACTIVE")
        .toString()
        .toUpperCase();
      const status = ALLOWED_STATUSES.includes(normalizedStatus)
        ? normalizedStatus
        : "ACTIVE";

      const mapped = {
        userId: user?.userId || userId,
        connectionId: raw.id,
        brokerageName: raw.brokerage?.name || raw.brokerage_name || "Unknown",
        status,
        isActive: status === "ACTIVE",
        lastSyncDate: raw.last_sync_at
          ? new Date(raw.last_sync_at)
          : raw.lastSyncAt
          ? new Date(raw.lastSyncAt)
          : null,
        // derive created/updated timestamps but avoid passing createdAt in $set
        createdAt: raw.created_at
          ? new Date(raw.created_at)
          : raw.createdAt
          ? new Date(raw.createdAt)
          : new Date(),
        updatedAt: raw.updated_at
          ? new Date(raw.updated_at)
          : raw.updatedAt
          ? new Date(raw.updatedAt)
          : new Date(),
        metadata: {
          raw: raw,
        },
      };

      // Build $set payload without createdAt to avoid Mongo conflict when using
      // $setOnInsert for createdAt. Keep updatedAt in $set so it updates on every upsert.
      const setPayload = { ...mapped };
      delete setPayload.createdAt;

      const updated = await ConnectionModel.findOneAndUpdate(
        { connectionId: mapped.connectionId },
        { $set: setPayload, $setOnInsert: { createdAt: mapped.createdAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (updated) results.push(updated);
    } catch (err) {
      console.error(
        `Error upserting connection for user ${userId}:`,
        err?.message || err
      );
      // continue processing other connections
    }
  }

  return results;
}

export { updateConnectionsForUser };
