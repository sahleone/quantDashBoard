# MongoDB Index Setup to Prevent Timeouts

## Quick Setup

Run these commands in MongoDB shell or MongoDB Compass to create indexes that will dramatically speed up queries:

```javascript
// Connect to MongoDB
// mongosh "your-connection-string"

// AccountActivities collection indexes (CRITICAL for preventing timeouts)
db.snaptradeaccountactivities.createIndex({ accountId: 1, trade_date: 1 });
db.snaptradeaccountactivities.createIndex({ accountId: 1, date: 1 });
db.snaptradeaccountactivities.createIndex({ accountId: 1 }); // Already exists but verify
db.snaptradeaccountactivities.createIndex({ accountId: 1, activityId: 1 }); // For upserts

// Verify indexes exist
db.snaptradeaccountactivities.getIndexes();
```

## Why Indexes Help

Without indexes, MongoDB must scan the entire collection to find documents matching `{ accountId: "..." }`. With large collections (100k+ documents), this can take minutes and cause timeouts.

With an index on `accountId`, MongoDB can:
- Find all documents for an account in milliseconds instead of minutes
- Sort by date efficiently
- Prevent connection timeouts

## Connection String Optimization

Add these parameters to your MongoDB connection string to increase timeouts and connection pool:

```env
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/dbname?maxPoolSize=50&minPoolSize=10&maxIdleTimeMS=45000&serverSelectionTimeoutMS=60000&connectTimeoutMS=60000&socketTimeoutMS=120000
```

Or set them in code (already done in `dbConnection.js`):
- `serverSelectionTimeoutMS: 60000` (60 seconds)
- `connectTimeoutMS: 60000` (60 seconds)  
- `socketTimeoutMS: 120000` (2 minutes)
- `maxPoolSize: 50` (more concurrent connections)

## Check Current Indexes

```javascript
// In MongoDB shell
db.snaptradeaccountactivities.getIndexes();

// Should see indexes on:
// - accountId
// - accountId + trade_date (compound)
// - accountId + date (compound)
```

## If Timeouts Persist

1. **Check collection size**: `db.snaptradeaccountactivities.countDocuments({ accountId: "your-account-id" })`
2. **Check if indexes are being used**: Use `.explain()` on queries
3. **Consider querying in batches**: Process activities in date ranges instead of all at once
4. **Use projection**: Only fetch needed fields (already implemented as fallback)

