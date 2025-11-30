/**
 * runMetricsPipeline.js
 *
 * Main pipeline script that runs all metrics calculation steps in sequence.
 * Supports both fullSync (for new connections) and incremental (for daily refresh).
 *
 * Options (opts):
 *  - databaseUrl: MongoDB connection string
 *  - userId: optional; process specific user
 *  - accountId: optional; process specific account
 *  - fullSync: boolean; if true, full historical sync; if false, incremental (default: false)
 *  - steps: optional array of steps to run ['price', 'valuation', 'returns', 'metrics', 'validate']
 *           if not provided, runs all steps
 *  - dryRun: boolean; if true, only log what would be done (default: false)
 */

import { updatePriceData } from "./updateTable/updatePriceData.js";
import { updatePortfolioTimeseries } from "./updateTable/updatePortfolioTimeseries.js";
import { calculateMetrics } from "./calculateMetrics.js";
import { validateMetrics } from "./validateMetrics.js";

/**
 * Run the complete metrics pipeline
 */
export async function runMetricsPipeline(opts = {}) {
  const {
    databaseUrl,
    userId,
    accountId,
    fullSync = false,
    steps = ["price", "valuation", "returns", "metrics", "validate"],
    dryRun = false,
  } = opts;

  const commonOpts = {
    databaseUrl,
    userId,
    accountId,
    fullSync,
  };

  console.log("=== Metrics Pipeline ===");
  console.log(`Mode: ${fullSync ? "Full Sync" : "Incremental"}`);
  console.log(`Steps: ${steps.join(", ")}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log("");

  const results = {
    price: null,
    valuation: null,
    returns: null,
    metrics: null,
    validate: null,
    errors: [],
  };

  // Step 1: Price Enrichment
  if (steps.includes("price")) {
    try {
      console.log("Step 1: Price Enrichment...");
      if (!dryRun) {
        results.price = await updatePriceData(commonOpts);
        console.log(`  ✓ Price enrichment completed`);
      } else {
        console.log("  [DRY RUN] Would run updatePriceData");
      }
    } catch (error) {
      console.error("  ✗ Price enrichment failed:", error?.message || error);
      results.errors.push({ step: "price", error: error?.message || String(error) });
    }
  }

  // Step 2-3: Portfolio Valuation and Returns (combined in updatePortfolioTimeseries)
  if (steps.includes("valuation") || steps.includes("returns")) {
    try {
      console.log("Step 2-3: Portfolio Valuation and Returns...");
      if (!dryRun) {
        results.valuation = await updatePortfolioTimeseries(commonOpts);
        results.returns = results.valuation; // Returns are calculated in the same step
        console.log(`  ✓ Portfolio valuation and returns completed`);
      } else {
        console.log("  [DRY RUN] Would run updatePortfolioTimeseries");
      }
    } catch (error) {
      console.error("  ✗ Portfolio valuation failed:", error?.message || error);
      results.errors.push({
        step: "valuation",
        error: error?.message || String(error),
      });
    }
  }

  // Step 4: Metrics Calculation
  if (steps.includes("metrics")) {
    try {
      console.log("Step 4: Metrics Calculation...");
      if (!dryRun) {
        results.metrics = await calculateMetrics(commonOpts);
        console.log(`  ✓ Metrics calculation completed`);
      } else {
        console.log("  [DRY RUN] Would run calculateMetrics");
      }
    } catch (error) {
      console.error("  ✗ Metrics calculation failed:", error?.message || error);
      results.errors.push({
        step: "metrics",
        error: error?.message || String(error),
      });
    }
  }

  // Step 5: Validation
  if (steps.includes("validate")) {
    try {
      console.log("Step 5: Validation...");
      if (!dryRun) {
        results.validate = await validateMetrics({
          ...commonOpts,
          sendAlerts: false, // Can be enabled via opts
        });
        console.log(`  ✓ Validation completed`);
      } else {
        console.log("  [DRY RUN] Would run validateMetrics");
      }
    } catch (error) {
      console.error("  ✗ Validation failed:", error?.message || error);
      results.errors.push({
        step: "validate",
        error: error?.message || String(error),
      });
    }
  }

  console.log("\n=== Pipeline Summary ===");
  console.log(`Completed steps: ${steps.filter((s) => results[s] !== null).length}/${steps.length}`);
  console.log(`Errors: ${results.errors.length}`);

  return results;
}

// CLI runner
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("runMetricsPipeline.js")
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const opts = {};

      if (args.includes("--fullSync")) {
        opts.fullSync = true;
      }
      if (args.includes("--dryRun")) {
        opts.dryRun = true;
      }

      // Parse steps if provided
      const stepsIndex = args.indexOf("--steps");
      if (stepsIndex !== -1 && args[stepsIndex + 1]) {
        opts.steps = args[stepsIndex + 1].split(",");
      }

      console.log("Starting metrics pipeline...");
      const result = await runMetricsPipeline(opts);
      console.log("Pipeline result:", JSON.stringify(result, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("Pipeline failed:", err);
      process.exit(2);
    }
  })();
}

