# Performance Improvement Guide

This guide provides actionable steps to improve the metrics pipeline run speed, from quick wins to advanced optimizations.

## 🎯 Quick Summary

**Current Performance:** ~46 minutes for 383 symbols (full sync)  
**Target Performance:** 5-10 minutes (full sync) or 2-8 minutes (incremental)

**Biggest Wins:**

1. **Parallel symbol processing** → 5-10x faster (46 min → 5-10 min)
2. **Database indexes** → 5-10x faster queries
3. **Incremental mode** → 10-50x faster for daily runs
4. **Skip expired options** → Reduces wasted API calls

**Start Here:** See "Implementation Priority" section at the bottom.

## Quick Wins (No Code Changes)

### 1. ✅ **Always Use Incremental Mode**

**Impact:** 10-50x faster for daily runs

```bash
# ❌ DON'T do this (slow)
node metrics/runMetricsPipeline.js --fullSync

# ✅ DO this (fast)
node metrics/runMetricsPipeline.js
```

**For API calls:**

```javascript
// Always default to incremental
const fullSync = req.body.fullSync === true; // Default to false
```

### 2. ✅ **Add Database Indexes**

**Impact:** 5-10x faster queries

Run these MongoDB commands to create indexes:

```javascript
// Connect to MongoDB
mongosh "your-connection-string"

// PriceHistory indexes
db.pricehistories.createIndex({ symbol: 1, date: 1 }, { unique: true });
db.pricehistories.createIndex({ date: 1 });
db.pricehistories.createIndex({ symbol: 1 });

// EquitiesWeightTimeseries indexes
db.equitiesweighttimeseries.createIndex(
  { accountId: 1, date: 1, symbol: 1 },
  { unique: true }
);
db.equitiesweighttimeseries.createIndex({ userId: 1, date: 1 });
db.equitiesweighttimeseries.createIndex({ symbol: 1 });
db.equitiesweighttimeseries.createIndex({ accountId: 1, date: 1 });

// PortfolioTimeseries indexes
db.portfoliotimeseries.createIndex(
  { userId: 1, accountId: 1, date: 1 },
  { unique: true }
);
db.portfoliotimeseries.createIndex({ accountId: 1, date: 1 });
db.portfoliotimeseries.createIndex({ date: 1 });

// AccountActivities indexes
db.snaptradeaccountactivities.createIndex({ accountId: 1, trade_date: 1 });
db.snaptradeaccountactivities.createIndex({ accountId: 1, date: 1 });
db.snaptradeaccountactivities.createIndex({ type: 1 });
db.snaptradeaccountactivities.createIndex({ accountId: 1, type: 1 });
```

**Verify indexes exist:**

```javascript
db.pricehistories.getIndexes();
db.equitiesweighttimeseries.getIndexes();
db.portfoliotimeseries.getIndexes();
```

### 3. ✅ **Increase MongoDB Connection Pool**

**Impact:** Prevents connection timeouts, faster concurrent operations

Add to your connection string:

```env
DATABASE_URL=mongodb+srv://...?maxPoolSize=50&minPoolSize=10&maxIdleTimeMS=45000
```

### 4. ✅ **Use Steps Parameter to Skip Completed Work**

**Impact:** Skip unnecessary steps

```bash
# Only run metrics calculation (skip price/valuation if already done)
node metrics/runMetricsPipeline.js --steps metrics
```

### 5. ✅ **Filter Invalid Symbols Early**

**Impact:** Reduces API calls and processing time

Before processing, skip:

- Expired options (check expiration date in symbol)
- Known delisted symbols
- Invalid symbol formats

## Code Optimizations (Requires Changes)

### 6. ⚡ **Parallel Symbol Processing for Price Data**

**Impact:** 5-10x faster price fetching (from 46 min → 5-10 min for 383 symbols)

**Current:** Processes symbols sequentially (one at a time)
**Optimized:** Process 10-20 symbols in parallel batches

**Implementation in `updatePriceData.js`:**

```javascript
// Add this helper function
async function processSymbolsInBatches(symbols, batchSize, processFn) {
  const results = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((symbol) => processFn(symbol))
    );
    results.push(...batchResults);

    // Log progress
    console.log(
      `Processed ${Math.min(i + batchSize, symbols.length)}/${
        symbols.length
      } symbols`
    );
  }
  return results;
}

// Replace the sequential loop (line 256) with:
const BATCH_SIZE = 15; // Process 15 symbols in parallel (respects rate limits)
const results = await processSymbolsInBatches(
  symbols,
  BATCH_SIZE,
  async (symbol) => {
    console.log(`Processing ${symbol}...`);
    return await processSymbol(symbol, {
      userId,
      accountId,
      fullSync,
      forceRefresh,
    });
  }
);

// Then process results
for (const result of results) {
  if (result.status === "success") {
    summary.processed++;
    summary.newPrices += result.pricesStored || 0;
    console.log(`  ✓ ${result.symbol}: stored ${result.pricesStored} prices`);
  } else if (result.status === "skipped") {
    summary.skipped++;
    console.log(`  - ${result.symbol}: ${result.reason}`);
  } else {
    summary.errors.push(result);
    console.error(`  ✗ ${result.symbol}: ${result.reason}`);
  }
}
```

**Rate Limit Consideration:**

- Yahoo Finance: 2000 requests/hour = ~33/min = ~1 every 2 seconds
- With 15 parallel requests, each batch takes ~2 seconds
- 383 symbols ÷ 15 = ~26 batches × 2 seconds = ~52 seconds (vs 46 minutes!)

### 7. ⚡ **Parallel Account Processing**

**Impact:** 2-5x faster for multiple accounts

**In `updateEquitiesWeightTable.js`:**

```javascript
// Replace sequential loop (line 249) with parallel processing
const BATCH_SIZE = 5; // Process 5 accounts in parallel
for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
  const batch = accounts.slice(i, i + BATCH_SIZE);
  await Promise.all(
    batch.map(async (acctId) => {
      // ... existing account processing logic ...
    })
  );
}
```

### 8. ⚡ **Optimize Database Queries**

**Impact:** 2-3x faster queries

**In `updatePortfolioTimeseries.js` - `calculateStockValue` function:**

```javascript
// Instead of separate queries, use aggregation pipeline
async function calculateStockValue(accountId, date, db) {
  const timeseriesCollection = db.collection("equitiesweighttimeseries");
  const priceHistoryCollection = db.collection("pricehistories");

  // Use aggregation to join and get latest prices
  const positions = await timeseriesCollection
    .aggregate([
      { $match: { accountId: accountId, date: date } },
      {
        $lookup: {
          from: "pricehistories",
          let: { symbol: "$symbol" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$symbol", "$$symbol"] },
                    { $lte: ["$date", date] },
                  ],
                },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 1 },
          ],
          as: "price",
        },
      },
      {
        $project: {
          symbol: 1,
          units: 1,
          price: { $arrayElemAt: ["$price.close", 0] },
        },
      },
    ])
    .toArray();

  // Calculate values
  let totalStockValue = 0;
  const positionDetails = positions.map((p) => {
    const price = p.price || 0;
    const value = (p.units || 0) * price;
    totalStockValue += value;
    return {
      symbol: p.symbol,
      units: p.units,
      price: price,
      value: value,
    };
  });

  return { stockValue: totalStockValue, positions: positionDetails };
}
```

### 9. ⚡ **Cache Symbol Validation**

**Impact:** Reduces redundant API calls

**Create a cache for invalid symbols:**

```javascript
// At top of updatePriceData.js
const invalidSymbolsCache = new Set();

// In processSymbol function, before fetching:
if (invalidSymbolsCache.has(symbol)) {
  return { symbol, status: "skipped", reason: "known_invalid" };
}

// After error, add to cache:
if (result.status === "error" && result.reason.includes("Invalid symbol")) {
  invalidSymbolsCache.add(symbol);
}
```

### 10. ⚡ **Batch Database Writes**

**Impact:** 2-3x faster writes

**Already implemented in `updateEquitiesWeightTable.js` (good!), but ensure all steps use batching:**

```javascript
// Use bulkWrite with ordered: false for better performance
await collection.bulkWrite(ops, {
  ordered: false, // Allow parallel writes
  writeConcern: { w: 1 }, // Don't wait for replication
});
```

### 11. ⚡ **Skip Expired Options**

**Impact:** Reduces processing time for invalid symbols

**Add filter in `updatePriceData.js`:**

```javascript
function isExpiredOption(symbol) {
  // Option symbols typically have format like "AAPL 230120C00150000"
  // Extract expiration date and check if it's in the past
  const match = symbol.match(/(\d{6})[CP]/);
  if (!match) return false;

  const expDateStr = match[1];
  const year = 2000 + parseInt(expDateStr.substring(0, 2));
  const month = parseInt(expDateStr.substring(2, 4)) - 1;
  const day = parseInt(expDateStr.substring(4, 6));
  const expDate = new Date(year, month, day);

  return expDate < new Date();
}

// Filter before processing
const validSymbols = symbols.filter((s) => !isExpiredOption(s));
```

## Architecture Improvements

### 12. 🏗️ **Run as Background Job**

**Impact:** Non-blocking API, better UX

**Option A: Job Queue (Recommended)**

```javascript
// Install: npm install bull
import Queue from "bull";

const metricsQueue = new Queue("metrics", {
  redis: { host: "localhost", port: 6379 },
});

// In API endpoint
metricsQueue.add("calculate", { userId, accountId, fullSync: false });
return res.json({ jobId: job.id, status: "queued" });

// Worker processes jobs
metricsQueue.process("calculate", async (job) => {
  return await runMetricsPipeline(job.data);
});
```

**Option B: Fire and Forget**

```javascript
// In API endpoint
runMetricsPipeline(opts).catch((err) => {
  console.error("Background job failed:", err);
});
return res.json({ status: "processing" });
```

### 13. 🏗️ **Separate Cron Job from API**

**Impact:** API responds instantly, cron handles heavy lifting

**Recommended Flow:**

1. **Cron Job** (daily at 2 AM):

   ```bash
   node metrics/runMetricsPipeline.js
   ```

2. **API Endpoint**:

   ```javascript
   // Just return pre-calculated metrics
   const metrics = await Metrics.find({ userId, accountId });
   return res.json(metrics);
   ```

3. **Manual Refresh Endpoint** (if needed):
   ```javascript
   // Trigger background job
   metricsQueue.add("calculate", { userId, accountId });
   return res.json({ status: "queued" });
   ```

## Performance Targets

### Current Performance

- **Price Enrichment**: ~46 minutes (383 symbols, full sync)
- **Valuation**: Timeouts
- **Total**: >46 minutes

### Target Performance (After Optimizations)

- **Price Enrichment** (incremental): 1-5 minutes
- **Price Enrichment** (full sync, parallel): 5-10 minutes
- **Valuation** (incremental): 30 seconds - 2 minutes
- **Metrics Calculation**: 10-30 seconds
- **Validation**: 5-10 seconds
- **Total** (incremental): 2-8 minutes
- **API Response** (cached): < 1 second

## Implementation Priority

### Phase 1: Quick Wins (Do First)

1. ✅ Add database indexes
2. ✅ Always use incremental mode
3. ✅ Increase connection pool
4. ✅ Use steps parameter

### Phase 2: Code Optimizations (High Impact)

1. ⚡ Parallel symbol processing (#6)
2. ⚡ Optimize database queries (#8)
3. ⚡ Skip expired options (#11)

### Phase 3: Architecture (Long-term)

1. 🏗️ Background job queue (#12)
2. 🏗️ Separate cron from API (#13)

## Monitoring

Add timing logs to measure improvements:

```javascript
console.time("price-enrichment");
await updatePriceData(opts);
console.timeEnd("price-enrichment");

console.time("valuation");
await updatePortfolioTimeseries(opts);
console.timeEnd("valuation");
```

## Expected Results

After implementing Phase 1 + Phase 2:

- **10-50x faster** for incremental runs
- **5-10x faster** for full sync runs
- **No more timeouts**
- **Better scalability** for multiple accounts
