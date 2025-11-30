/**
 * HTTP test script for the metrics calculation endpoint
 * Tests the actual HTTP endpoint (requires server to be running)
 * 
 * Usage:
 *   1. Start the server: cd quantDashBoard/server && npm start
 *   2. Run this script: node metrics/test_http_endpoint.js
 */

const API_URL = process.env.API_URL || "http://localhost:3000";
const ENDPOINT = `${API_URL}/api/metrics/calculate`;

async function testEndpoint() {
  console.log(`Testing endpoint: ${ENDPOINT}\n`);

  // Test 1: Missing userId (should return 400)
  console.log("Test 1: POST without userId (should fail validation)");
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    if (response.status === 400) {
      console.log("✓ Correctly returned 400 for missing userId\n");
    } else {
      console.log("⚠ Unexpected status code\n");
    }
  } catch (error) {
    console.error("✗ Request failed:", error.message);
    console.log("  (Is the server running?)\n");
  }

  // Test 2: With userId (dry run equivalent)
  console.log("Test 2: POST with userId");
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "test-user-123",
        fullSync: false,
      }),
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    if (response.status === 200) {
      console.log("✓ Endpoint responded successfully\n");
    } else {
      console.log("⚠ Unexpected status code\n");
    }
  } catch (error) {
    console.error("✗ Request failed:", error.message);
    console.log("  (Is the server running?)\n");
  }

  // Test 3: With fullSync
  console.log("Test 3: POST with fullSync=true");
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: "test-user-123",
        fullSync: true,
      }),
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));

    if (response.status === 200) {
      console.log("✓ Endpoint responded successfully\n");
    } else {
      console.log("⚠ Unexpected status code\n");
    }
  } catch (error) {
    console.error("✗ Request failed:", error.message);
    console.log("  (Is the server running?)\n");
  }

  console.log("=== HTTP tests completed ===");
  console.log("\nNote: If requests failed, make sure:");
  console.log("  1. Server is running: cd quantDashBoard/server && npm start");
  console.log("  2. MongoDB is connected");
  console.log("  3. Environment variables are set");
}

testEndpoint().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});

