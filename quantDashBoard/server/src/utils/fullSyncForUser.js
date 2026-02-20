/**
 * Full Sync for User
 *
 * Orchestrates the complete data refresh pipeline for a single user:
 *  1. Sync source data from SnapTrade (accounts, holdings, options)
 *  2. Run the metrics pipeline (prices, portfolio timeseries, metrics, validation)
 *
 * Designed to be called from both the cron job and the API endpoint
 * so the logic lives in one place.
 *
 * @param {string} userId
 * @param {string|null} userSecret - optional; resolved from DB if null
 * @param {object} options
 * @param {boolean} options.fullSync - full historical sync vs incremental (default false)
 * @param {string[]} options.steps - metrics pipeline steps to run (default all)
 * @param {string} options.databaseUrl - MongoDB connection string (only needed when running outside the app server)
 * @returns {Promise<object>} combined results from sync + metrics
 */

import syncAllUserData from "./syncAllUserData.js";
import { runMetricsPipeline } from "../metrics/runMetricsPipeline.js";

export default async function fullSyncForUser(userId, userSecret = null, options = {}) {
  if (!userId) {
    throw new Error("Missing userId");
  }

  const {
    fullSync = false,
    steps,
    databaseUrl,
  } = options;

  const result = {
    userId,
    sync: null,
    metrics: null,
    errors: [],
    success: false,
  };

  // Step 1: Sync source data from SnapTrade
  console.log(`[${userId}] Full sync — step 1: syncing source data...`);
  try {
    result.sync = await syncAllUserData(userId, userSecret, { fullSync });
    console.log(`[${userId}] Source data sync completed`);
  } catch (err) {
    console.error(`[${userId}] Source data sync failed:`, err.message);
    result.errors.push({ step: "sync", error: err.message });
    // CRITICAL: Do not run metrics pipeline with stale/missing source data
    console.error(`[${userId}] Aborting pipeline — source data sync failed, metrics would use stale data`);
    result.success = false;
    return result;
  }

  // Step 2: Run metrics pipeline (prices -> timeseries -> metrics -> validate)
  console.log(`[${userId}] Full sync — step 2: running metrics pipeline...`);
  try {
    const pipelineOpts = {
      userId,
      fullSync,
      ...(databaseUrl && { databaseUrl }),
      ...(steps && { steps }),
    };
    result.metrics = await runMetricsPipeline(pipelineOpts);
    console.log(`[${userId}] Metrics pipeline completed`);

    // Check if metrics pipeline had critical errors
    if (result.metrics?.errors?.length > 0) {
      console.warn(`[${userId}] Metrics pipeline completed with ${result.metrics.errors.length} error(s)`);
      result.errors.push(...result.metrics.errors.map(e => ({ step: "metrics-sub", ...e })));
    }
  } catch (err) {
    console.error(`[${userId}] Metrics pipeline failed:`, err.message);
    result.errors.push({ step: "metrics", error: err.message });
  }

  result.success = result.errors.length === 0;

  return result;
}
