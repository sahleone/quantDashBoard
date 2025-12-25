# Performance Optimization Suggestions for `/api/metrics/calculate`

## Current Performance Issues

Based on the test run:

- **Price Enrichment**: ~46 minutes for 383 symbols
- **Valuation Step**: MongoDB connection timeouts
- **Total Time**: Over 46 minutes for full pipeline

## Optimization Strategies (No Code Changes Required)

### 1. **Run as Background Job (Recommended)**

Instead of blocking the HTTP request, trigger the pipeline asynchronously:

**Option A: Use a job queue**

- Install `bull` or `agenda` for job queues
- Return immediately with a job ID
- Client polls for status or uses webhooks

**Option B: Fire and forget**

- Start the pipeline without awaiting
- Return immediately with status: "processing"
- Log results to database for later retrieval

**Option C: Use cron job**

- Don't expose via API endpoint
- Run via scheduled cron job
- API endpoint just returns cached/pre-computed results

### 2. **Database Indexes**

Ensure these indexes exist (check with MongoDB Compass or CLI):

```javascript
// PriceHistory collection
db.pricehistories.createIndex({ symbol: 1, date: 1 }, { unique: true });
db.pricehistories.createIndex({ date: 1 });

// PortfolioTimeseries collection
db.portfoliotimeseries.createIndex(
  { userId: 1, accountId: 1, date: 1 },
  { unique: true }
);
db.portfoliotimeseries.createIndex({ accountId: 1, date: 1 });
db.portfoliotimeseries.createIndex({ date: 1 });

// EquitiesWeightTimeseries collection
db.equitiesweighttimeseries.createIndex(
  { accountId: 1, date: 1, symbol: 1 },
  { unique: true }
);
db.equitiesweighttimeseries.createIndex({ userId: 1, date: 1 });
db.equitiesweighttimeseries.createIndex({ symbol: 1 });

// AccountActivities collection
db.snaptradeaccountactivities.createIndex({ accountId: 1, trade_date: 1 });
db.snaptradeaccountactivities.createIndex({ accountId: 1, date: 1 });
db.snaptradeaccountactivities.createIndex({ type: 1 });
```

**Check existing indexes:**

```bash
# Connect to MongoDB
mongosh "your-connection-string"

# Check indexes
db.pricehistories.getIndexes()
db.portfoliotimeseries.getIndexes()
db.equitiesweighttimeseries.getIndexes()
```

### 3. **MongoDB Connection Pooling**

Increase connection pool size in your MongoDB connection string or environment:

```env
# Add to connection string or use connection options
DATABASE_URL=mongodb+srv://...?maxPoolSize=50&minPoolSize=10&maxIdleTimeMS=45000
```

Or in code (if you modify connection):

```javascript
mongoose.connect(url, {
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 45000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
```

### 4. **Incremental Updates Only**

**Current Issue**: The endpoint runs full sync which processes all historical data.

**Solution**: Always use `fullSync: false` for API calls:

- Only fetch prices for missing dates
- Only calculate portfolio values for new dates
- Only recalculate metrics if underlying data changed

**Implementation**: Change default in API calls:

```javascript
// In metricsController.js calculateMetrics method
const fullSync = req.body.fullSync === true; // Change default to false
```

### 5. **Skip Expired/Delisted Symbols**

The test showed 215 errors for expired options and delisted symbols. These slow down processing.

**Filter before processing:**

- Skip option symbols with dates in the past (expired)
- Skip known delisted symbols
- Cache list of invalid symbols to skip

### 6. **Batch Processing Optimization**

**Current**: Processes symbols one-by-one sequentially

**Optimization**: Process in parallel batches (requires code change, but can be done via environment/config):

- Process 10-20 symbols in parallel
- Use Promise.all() with batching
- Respect Yahoo Finance rate limits (2000/hour = ~33/min = ~1 every 2 seconds)

### 7. **Cache Strategy**

**Price Data**:

- Once fetched, prices don't change (historical data)
- Only fetch missing dates
- Use `fullSync: false` always for API calls

**Metrics**:

- Store calculated metrics in database
- Only recalculate if underlying portfolio data changed
- Return cached metrics if data hasn't changed

### 8. **Separate Steps into Different Endpoints**

Instead of one endpoint running all steps:

**Option A: Separate endpoints**

- `POST /api/metrics/calculate/prices` - Just price enrichment
- `POST /api/metrics/calculate/valuation` - Just portfolio valuation
- `POST /api/metrics/calculate/metrics` - Just metrics calculation
- `POST /api/metrics/calculate/validate` - Just validation

**Option B: Use `steps` parameter**

- Already implemented! Use it:

```javascript
// Only run specific steps
POST /api/metrics/calculate
Body: {
  "userId": "...",
  "steps": ["metrics"]  // Skip price/valuation if already done
}
```

### 9. **Database Query Optimization**

**Use aggregation pipelines** for complex queries:

- Instead of multiple queries, use `$lookup` for joins
- Use `$group` for aggregations
- Project only needed fields

**Example** (for portfolio valuation):

```javascript
// Instead of multiple queries, use aggregation
db.portfoliotimeseries.aggregate([
  { $match: { accountId: "...", date: { $gte: startDate } } },
  { $lookup: { ... } },
  { $group: { ... } }
])
```

### 10. **MongoDB Atlas Performance**

If using MongoDB Atlas:

- **Upgrade tier**: More RAM = faster queries
- **Enable Data Explorer**: For query optimization
- **Check slow queries**: Atlas shows slow operations
- **Connection string**: Use SRV connection string with proper options

### 11. **Run Steps Sequentially on Schedule**

**Best Practice**: Don't run all steps via API

**Recommended Flow**:

1. **Cron Job** (daily at 2 AM):

   - Run `updatePriceData.js` (incremental)
   - Run `updatePortfolioTimeseries.js` (incremental)
   - Run `calculateMetrics.js` (incremental)
   - Run `validateMetrics.js`

2. **API Endpoint**:

   - Just returns pre-calculated metrics from database
   - Fast response (< 1 second)

3. **Manual Refresh** (if needed):
   - Separate endpoint for manual trigger
   - Runs in background
   - Returns job ID immediately

### 12. **Filter Invalid Symbols Early**

Before processing, filter out:

- Expired options (check expiration date in symbol)
- Known delisted symbols (maintain a list)
- Crypto symbols that Yahoo Finance doesn't support
- Invalid symbol formats

### 13. **Use MongoDB Transactions Sparingly**

If using transactions, they can slow down writes. For bulk operations:

- Use `bulkWrite` with `ordered: false`
- Process in batches (1000 records at a time)
- Don't use transactions for bulk inserts

### 14. **Monitor and Log Performance**

Add timing logs to identify bottlenecks:

```javascript
console.time("price-enrichment");
// ... code ...
console.timeEnd("price-enrichment");
```

### 15. **Connection Timeout Issues**

The valuation step had connection timeouts. Fix by:

- Increasing `serverSelectionTimeoutMS`
- Increasing `socketTimeoutMS`
- Using connection pooling
- Retrying failed operations

## Immediate Actions (No Code Changes)

1. **Add database indexes** (see section 2)
2. **Use incremental mode** (`fullSync: false`) for API calls
3. **Run via cron job** instead of API endpoint
4. **Use `steps` parameter** to skip completed steps
5. **Check MongoDB connection string** for pooling options
6. **Monitor MongoDB Atlas** performance (if using Atlas)

## Recommended Architecture

```
┌─────────────────┐
│  Cron Job       │  (Daily at 2 AM)
│  - Price Data   │  (Incremental)
│  - Valuation    │  (Incremental)
│  - Metrics      │  (Incremental)
│  - Validation   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB        │  (Pre-computed data)
│  - Prices       │
│  - Portfolio    │
│  - Metrics      │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  API Endpoint   │  (Fast - just reads)
│  GET /metrics   │  (< 1 second)
└─────────────────┘
```

## Quick Wins

1. ✅ **Always use `fullSync: false`** for API calls
2. ✅ **Use `steps` parameter** to skip completed work
3. ✅ **Add database indexes** (biggest impact)
4. ✅ **Run via cron** instead of blocking API
5. ✅ **Return cached results** from database

## Expected Performance After Optimization

- **Price Enrichment** (incremental): 1-5 minutes (only new dates)
- **Portfolio Valuation** (incremental): 30 seconds - 2 minutes
- **Metrics Calculation**: 10-30 seconds
- **Validation**: 5-10 seconds
- **Total** (incremental): 2-8 minutes
- **API Response** (cached): < 1 second
