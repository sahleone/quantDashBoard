/**
 * EXAMPLE: Parallel Processing Implementation for updatePriceData.js
 * 
 * This shows how to modify the sequential loop (lines 256-280) to use parallel batches.
 * 
 * Expected improvement: 5-10x faster (from 46 min → 5-10 min for 383 symbols)
 */

/**
 * Process symbols in parallel batches while respecting rate limits
 */
async function processSymbolsInBatches(symbols, batchSize, processFn) {
  const results = [];
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(symbols.length / batchSize);
    
    console.log(
      `\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} symbols in parallel...`
    );
    
    // Process batch in parallel
    const batchStartTime = Date.now();
    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          return await processFn(symbol);
        } catch (error) {
          return {
            symbol,
            status: "error",
            reason: error.message || String(error),
          };
        }
      })
    );
    
    const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    console.log(
      `  Batch ${batchNum} completed in ${batchDuration}s (${batch.length} symbols)`
    );
    
    results.push(...batchResults);
    
    // Log progress
    const processed = Math.min(i + batchSize, symbols.length);
    const progress = ((processed / symbols.length) * 100).toFixed(1);
    console.log(`  Overall progress: ${processed}/${symbols.length} (${progress}%)`);
    
    // Small delay between batches to respect rate limits
    // (Yahoo Finance: 2000/hour = ~33/min = ~1 every 2 seconds)
    // With batchSize=15, each batch takes ~2 seconds, so minimal delay needed
    if (i + batchSize < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay
    }
  }
  
  return results;
}

/**
 * REPLACE the sequential loop in updatePriceData() function (lines 256-280)
 * with this parallel batch processing:
 */
export async function updatePriceDataParallel(opts = {}) {
  // ... existing setup code (lines 205-255) ...
  
  try {
    const symbols = await getUniqueSymbols({ userId, accountId });
    summary.totalSymbols = symbols.length;

    if (symbols.length === 0) {
      console.log("No symbols found in EquitiesWeightTimeseries");
      await mongoose.disconnect();
      return summary;
    }

    console.log(
      `Processing ${symbols.length} symbol(s) (fullSync: ${fullSync}, forceRefresh: ${forceRefresh})`
    );
    
    // OPTION 1: Use configurable batch size (recommended)
    const BATCH_SIZE = opts.batchSize || 15; // Default: 15 parallel requests
    
    // OPTION 2: Auto-calculate batch size based on rate limits
    // Yahoo Finance: 2000/hour = ~33/min = ~1 every 2 seconds
    // const BATCH_SIZE = Math.min(15, Math.max(5, Math.floor(symbols.length / 20)));
    
    console.log(`Using batch size: ${BATCH_SIZE} (processing in parallel)`);
    
    const startTime = Date.now();
    
    // Process symbols in parallel batches
    const results = await processSymbolsInBatches(
      symbols,
      BATCH_SIZE,
      async (symbol) => {
        return await processSymbol(symbol, {
          userId,
          accountId,
          fullSync,
          forceRefresh,
        });
      }
    );
    
    // Process results
    for (const result of results) {
      if (result.status === "success") {
        summary.processed++;
        summary.newPrices += result.pricesStored || 0;
        console.log(
          `  ✓ ${result.symbol}: stored ${result.pricesStored} prices (fetched ${result.pricesFetched})`
        );
      } else if (result.status === "skipped") {
        summary.skipped++;
        console.log(`  - ${result.symbol}: ${result.reason}`);
      } else {
        summary.errors.push(result);
        console.error(`  ✗ ${result.symbol}: ${result.reason}`);
      }
    }
    
    const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log("\n=== Summary ===");
    console.log(`Total symbols: ${summary.totalSymbols}`);
    console.log(`Processed: ${summary.processed}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`New prices stored: ${summary.newPrices}`);
    console.log(`Errors: ${summary.errors.length}`);
    console.log(`Total time: ${totalDuration} minutes`);
    
  } catch (error) {
    console.error("Error in updatePriceData:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }

  return summary;
}

/**
 * ADDITIONAL OPTIMIZATION: Filter expired options before processing
 */
function isExpiredOption(symbol) {
  // Option symbols typically have format like "AAPL 230120C00150000"
  // Extract expiration date and check if it's in the past
  const match = symbol.match(/(\d{6})[CP]/);
  if (!match) return false;
  
  try {
    const expDateStr = match[1];
    const year = 2000 + parseInt(expDateStr.substring(0, 2));
    const month = parseInt(expDateStr.substring(2, 4)) - 1;
    const day = parseInt(expDateStr.substring(4, 6));
    const expDate = new Date(year, month, day);
    
    return expDate < new Date();
  } catch (error) {
    return false; // If we can't parse, don't skip it
  }
}

/**
 * ADDITIONAL OPTIMIZATION: Cache invalid symbols
 */
const invalidSymbolsCache = new Set();

function shouldSkipSymbol(symbol) {
  // Check cache
  if (invalidSymbolsCache.has(symbol)) {
    return { skip: true, reason: "known_invalid" };
  }
  
  // Check if expired option
  if (isExpiredOption(symbol)) {
    return { skip: true, reason: "expired_option" };
  }
  
  return { skip: false };
}

/**
 * Usage in processSymbol function:
 */
async function processSymbolWithCache(symbol, opts = {}) {
  // Check if should skip
  const skipCheck = shouldSkipSymbol(symbol);
  if (skipCheck.skip) {
    return { symbol, status: "skipped", reason: skipCheck.reason };
  }
  
  try {
    // ... existing processSymbol logic ...
    const result = await processSymbol(symbol, opts);
    
    // If error due to invalid symbol, cache it
    if (result.status === "error" && 
        (result.reason.includes("Invalid symbol") || 
         result.reason.includes("not found"))) {
      invalidSymbolsCache.add(symbol);
    }
    
    return result;
  } catch (error) {
    // Cache invalid symbols
    if (error.message && error.message.includes("Invalid symbol")) {
      invalidSymbolsCache.add(symbol);
    }
    throw error;
  }
}

