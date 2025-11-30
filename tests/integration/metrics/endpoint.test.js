/**
 * Test script for the metrics calculation endpoint
 * Tests the endpoint logic without requiring the full server
 */

import { runMetricsPipeline } from "../../../metrics/runMetricsPipeline.js";

async function testEndpoint() {
  console.log("Testing metrics calculation endpoint logic...\n");

  // Test 1: Dry run with no userId (should fail validation)
  console.log("Test 1: Dry run with no userId");
  try {
    const result = await runMetricsPipeline({
      fullSync: false,
      dryRun: true,
    });
    console.log("✓ Dry run completed:", result);
  } catch (error) {
    console.log("Expected error (no userId):", error.message);
  }

  // Test 2: Dry run with userId
  console.log("\nTest 2: Dry run with userId");
  try {
    const result = await runMetricsPipeline({
      userId: "test-user-123",
      fullSync: false,
      dryRun: true,
    });
    console.log("✓ Dry run with userId completed");
    console.log("Results:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("✗ Error:", error.message);
  }

  // Test 3: Test with specific steps
  console.log("\nTest 3: Dry run with specific steps");
  try {
    const result = await runMetricsPipeline({
      userId: "test-user-123",
      fullSync: false,
      steps: ["price", "metrics"],
      dryRun: true,
    });
    console.log("✓ Dry run with specific steps completed");
    console.log("Results:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("✗ Error:", error.message);
  }

  console.log("\n=== All tests completed ===");
}

testEndpoint().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
