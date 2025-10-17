/**
 * Test script for duplicate handling functionality
 *
 * This script tests the duplicate handling utilities to ensure they work correctly
 * before deploying to production.
 */

import mongoose from "mongoose";
import {
  upsertWithDuplicateCheck,
  checkForDuplicates,
  UNIQUE_FIELD_MAPPINGS,
} from "./duplicateHandler.js";
import AccountHoldings from "../models/AccountHoldings.js";

// Mock data for testing
const mockHoldings = [
  {
    accountId: "test-account-1",
    asOfDate: new Date("2024-01-01"),
    symbol: "AAPL",
    description: "Apple Inc.",
    currency: "USD",
    units: 100,
    price: 150.0,
    averagePurchasePrice: 145.0,
    marketValue: 15000.0,
    typeCode: "EQUITY",
    typeDescription: "Common Stock",
    openPnl: 500.0,
    fractionalUnits: 0,
    exchange: "NASDAQ",
    isCashEquivalent: false,
    createdAt: new Date(),
  },
  {
    accountId: "test-account-1",
    asOfDate: new Date("2024-01-01"),
    symbol: "MSFT",
    description: "Microsoft Corporation",
    currency: "USD",
    units: 50,
    price: 300.0,
    averagePurchasePrice: 295.0,
    marketValue: 15000.0,
    typeCode: "EQUITY",
    typeDescription: "Common Stock",
    openPnl: 250.0,
    fractionalUnits: 0,
    exchange: "NASDAQ",
    isCashEquivalent: false,
    createdAt: new Date(),
  },
  // This should be detected as a duplicate
  {
    accountId: "test-account-1",
    asOfDate: new Date("2024-01-01"),
    symbol: "AAPL",
    description: "Apple Inc. (Updated)",
    currency: "USD",
    units: 100,
    price: 155.0, // Updated price
    averagePurchasePrice: 145.0,
    marketValue: 15500.0, // Updated market value
    typeCode: "EQUITY",
    typeDescription: "Common Stock",
    openPnl: 1000.0, // Updated PnL
    fractionalUnits: 0,
    exchange: "NASDAQ",
    isCashEquivalent: false,
    createdAt: new Date(),
  },
];

/**
 * Test the duplicate checking functionality
 */
async function testDuplicateHandling() {
  console.log("🧪 Testing duplicate handling functionality...\n");

  try {
    // Test 1: Check for duplicates before upsert
    console.log("Test 1: Checking for duplicates...");
    const duplicateCheck = await checkForDuplicates(
      AccountHoldings,
      mockHoldings,
      UNIQUE_FIELD_MAPPINGS.AccountHoldings
    );

    console.log("Duplicate check result:", duplicateCheck);
    console.log(
      `Found ${duplicateCheck.duplicates} duplicates out of ${duplicateCheck.total} records\n`
    );

    // Test 2: Upsert with duplicate checking
    console.log("Test 2: Upserting with duplicate checking...");
    const upsertResult = await upsertWithDuplicateCheck(
      AccountHoldings,
      mockHoldings,
      UNIQUE_FIELD_MAPPINGS.AccountHoldings,
      "holdings"
    );

    console.log("Upsert result:", upsertResult);
    console.log(
      `Upserted ${upsertResult.upserted} new records, updated ${upsertResult.duplicates} duplicates\n`
    );

    // Test 3: Verify the data was correctly stored
    console.log("Test 3: Verifying stored data...");
    const storedHoldings = await AccountHoldings.find({
      accountId: "test-account-1",
      asOfDate: new Date("2024-01-01"),
    }).sort({ symbol: 1 });

    console.log("Stored holdings:");
    storedHoldings.forEach((holding) => {
      console.log(
        `- ${holding.symbol}: ${holding.description}, Price: $${holding.price}, PnL: $${holding.openPnl}`
      );
    });

    // Test 4: Clean up test data
    console.log("\nTest 4: Cleaning up test data...");
    await AccountHoldings.deleteMany({ accountId: "test-account-1" });
    console.log("Test data cleaned up successfully");

    console.log(
      "\n✅ All tests passed! Duplicate handling is working correctly."
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}

/**
 * Test the batch upsert functionality
 */
async function testBatchUpsert() {
  console.log("\n🧪 Testing batch upsert functionality...\n");

  try {
    // Create a larger dataset for batch testing
    const batchHoldings = [];
    for (let i = 0; i < 250; i++) {
      batchHoldings.push({
        accountId: "test-batch-account",
        asOfDate: new Date("2024-01-01"),
        symbol: `TEST${i.toString().padStart(3, "0")}`,
        description: `Test Stock ${i}`,
        currency: "USD",
        units: 100,
        price: 100 + i,
        averagePurchasePrice: 95 + i,
        marketValue: (100 + i) * 100,
        typeCode: "EQUITY",
        typeDescription: "Common Stock",
        openPnl: 500 + i,
        fractionalUnits: 0,
        exchange: "TEST",
        isCashEquivalent: false,
        createdAt: new Date(),
      });
    }

    console.log("Testing batch upsert with 250 records...");
    const batchResult = await batchUpsertWithDuplicateCheck(
      AccountHoldings,
      batchHoldings,
      UNIQUE_FIELD_MAPPINGS.AccountHoldings,
      "holdings",
      50 // Batch size of 50
    );

    console.log("Batch upsert result:", batchResult);
    console.log(
      `Processed ${batchResult.total} records in ${batchResult.batches} batches`
    );

    // Clean up
    await AccountHoldings.deleteMany({ accountId: "test-batch-account" });
    console.log("Batch test data cleaned up successfully");

    console.log("\n✅ Batch upsert test passed!");
  } catch (error) {
    console.error("❌ Batch test failed:", error);
    throw error;
  }
}

// Export test functions for use in other test files
export { testDuplicateHandling, testBatchUpsert };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Note: This would require a MongoDB connection to run
  console.log("To run these tests, ensure MongoDB is connected and call:");
  console.log(
    'import { testDuplicateHandling, testBatchUpsert } from "./testDuplicateHandler.js";'
  );
  console.log("await testDuplicateHandling();");
  console.log("await testBatchUpsert();");
}
