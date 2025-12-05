/**
 * Test script for buildDailyUnitsSeries function using sample activity data
 *
 * Usage:
 *   node archive/test/testUnitsSeries.js
 */

import { buildDailyUnitsSeries } from "./functions/buildDailyUnitsSeries.js";

const sampleActivities = [
  {
    id: "1",
    type: "BUY",
    trade_date: "2024-01-01T10:00:00Z",
    symbol: { symbol: "AAPL" },
    units: 10,
  },
  {
    id: "2",
    type: "BUY",
    trade_date: "2024-01-02T10:00:00Z",
    symbol: { symbol: "VTI" },
    units: 5,
  },
  {
    id: "3",
    type: "SELL",
    trade_date: "2024-01-03T10:00:00Z",
    symbol: { symbol: "AAPL" },
    units: 2,
  },
  {
    id: "4",
    type: "BUY",
    trade_date: "2024-01-03T11:00:00Z",
    symbol: { symbol: "BTC-USD" },
    units: 0.1,
  },
  {
    id: "5",
    type: "REI",
    trade_date: "2024-01-04T10:00:00Z",
    symbol: { symbol: "VTI" },
    units: 1,
  },
];

(async () => {
  try {
    const unitsSeries = await buildDailyUnitsSeries({
      activities: sampleActivities,
      applySplits: false,
    });

    console.log(`✓ Generated ${unitsSeries.length} days of units series\n`);
    console.log("Sample output:");
    unitsSeries.forEach((entry) => {
      const positionsStr = Object.entries(entry.positions)
        .map(([sym, units]) => `${sym}: ${units}`)
        .join(", ");
      console.log(`  ${entry.date}: { ${positionsStr} }`);
    });

    console.log("\n✓ Test completed successfully!");
  } catch (error) {
    console.error("✗ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();

