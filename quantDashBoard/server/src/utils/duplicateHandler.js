/**
 * Utility functions for handling duplicate records in MongoDB operations
 *
 * This module provides reusable functions for checking duplicates and performing
 * upsert operations with detailed reporting.
 */

/**
 * Generic function to upsert records with duplicate checking
 *
 * @async
 * @function upsertWithDuplicateCheck
 * @param {Object} Model - Mongoose model to operate on
 * @param {Array} records - Array of records to upsert
 * @param {Object} uniqueFields - Object defining the unique field combinations to check
 * @param {string} recordType - Human-readable name for the record type (for logging)
 * @returns {Promise<Object>} Result object with upsert statistics
 *
 * @example
 * const result = await upsertWithDuplicateCheck(
 *   AccountHoldings,
 *   holdingsData,
 *   { accountId: 'accountId', asOfDate: 'asOfDate', symbol: 'symbol' },
 *   'holdings'
 * );
 */
export async function upsertWithDuplicateCheck(
  Model,
  records,
  uniqueFields,
  recordType
) {
  const result = {
    total: records.length,
    upserted: 0,
    duplicates: 0,
    errors: 0,
    duplicateDetails: [],
    recordType,
  };

  for (const record of records) {
    try {
      // Build query object for duplicate check
      const query = {};
      Object.keys(uniqueFields).forEach((key) => {
        query[key] = record[uniqueFields[key]];
      });

      // Check if record already exists
      const existingRecord = await Model.findOne(query);

      if (existingRecord) {
        result.duplicates++;
        result.duplicateDetails.push({
          ...query,
          reason: `Duplicate found based on ${Object.keys(query).join(", ")}`,
        });

        // Update existing record with new data
        await Model.findOneAndUpdate(query, record, { upsert: true });
      } else {
        // Insert new record
        await Model.create(record);
        result.upserted++;
      }
    } catch (error) {
      console.error(`Error upserting ${recordType} record:`, error);
      result.errors++;
    }
  }

  return result;
}

/**
 * Batch upsert with duplicate checking for better performance
 *
 * @async
 * @function batchUpsertWithDuplicateCheck
 * @param {Object} Model - Mongoose model to operate on
 * @param {Array} records - Array of records to upsert
 * @param {Object} uniqueFields - Object defining the unique field combinations to check
 * @param {string} recordType - Human-readable name for the record type (for logging)
 * @param {number} batchSize - Number of records to process in each batch (default: 100)
 * @returns {Promise<Object>} Result object with upsert statistics
 */
export async function batchUpsertWithDuplicateCheck(
  Model,
  records,
  uniqueFields,
  recordType,
  batchSize = 100
) {
  const result = {
    total: records.length,
    upserted: 0,
    duplicates: 0,
    errors: 0,
    duplicateDetails: [],
    recordType,
    batches: 0,
  };

  // Process records in batches
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    result.batches++;

    try {
      // Build bulk operations for this batch
      const bulkOps = [];

      for (const record of batch) {
        const query = {};
        Object.keys(uniqueFields).forEach((key) => {
          query[key] = record[uniqueFields[key]];
        });

        bulkOps.push({
          updateOne: {
            filter: query,
            update: record,
            upsert: true,
          },
        });
      }

      // Execute bulk operation
      const bulkResult = await Model.bulkWrite(bulkOps, { ordered: false });

      result.upserted += bulkResult.upsertedCount;
      result.duplicates += bulkResult.modifiedCount;
    } catch (error) {
      console.error(
        `Error processing ${recordType} batch ${result.batches}:`,
        error
      );
      result.errors += batch.length;
    }
  }

  return result;
}

/**
 * Check for duplicates without performing upsert
 *
 * @async
 * @function checkForDuplicates
 * @param {Object} Model - Mongoose model to check
 * @param {Array} records - Array of records to check
 * @param {Object} uniqueFields - Object defining the unique field combinations to check
 * @returns {Promise<Object>} Result object with duplicate information
 */
export async function checkForDuplicates(Model, records, uniqueFields) {
  const result = {
    total: records.length,
    duplicates: 0,
    duplicateDetails: [],
  };

  for (const record of records) {
    const query = {};
    Object.keys(uniqueFields).forEach((key) => {
      query[key] = record[uniqueFields[key]];
    });

    const existingRecord = await Model.findOne(query);
    if (existingRecord) {
      result.duplicates++;
      result.duplicateDetails.push({
        ...query,
        existingId: existingRecord._id,
      });
    }
  }

  return result;
}

/**
 * Predefined field mappings for common models
 */
export const UNIQUE_FIELD_MAPPINGS = {
  AccountHoldings: {
    accountId: "accountId",
    asOfDate: "asOfDate",
    symbol: "symbol",
  },
  AccountPositions: {
    accountId: "accountId",
    asOfDate: "asOfDate",
    symbolTicker: "symbolTicker",
  },
  AccountOrders: {
    accountId: "accountId",
    brokerage_order_id: "brokerage_order_id",
  },
  AccountBalances: {
    accountId: "accountId",
    asOfDate: "asOfDate",
  },
};

export default {
  upsertWithDuplicateCheck,
  batchUpsertWithDuplicateCheck,
  checkForDuplicates,
  UNIQUE_FIELD_MAPPINGS,
};
