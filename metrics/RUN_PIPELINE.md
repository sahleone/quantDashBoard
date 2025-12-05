# How to Run the Metrics Pipeline

## Quick Start

### 1. Set DATABASE_URL Environment Variable

**Option A: Export in your terminal session**
```bash
export DATABASE_URL="mongodb://localhost:27017/quantDashboard"
# Or for MongoDB Atlas:
# export DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/database-name"
```

**Option B: Create a .env file in project root**
```bash
# In project root directory
echo 'DATABASE_URL=mongodb://localhost:27017/quantDashboard' > .env
```

**Option C: Pass directly when running**
```bash
DATABASE_URL="mongodb://localhost:27017/quantDashboard" node metrics/runMetricsPipeline.js
```

### 2. Run the Complete Pipeline

**Daily refresh (incremental - recommended):**
```bash
node metrics/runMetricsPipeline.js
```

**Full sync (all historical data):**
```bash
node metrics/runMetricsPipeline.js --fullSync
```

**Dry run (preview only):**
```bash
node metrics/runMetricsPipeline.js --dryRun
```

**Run specific steps:**
```bash
node metrics/runMetricsPipeline.js --steps price,metrics
```

## Running Individual Scripts

### Step 1: Update Activities Table
```bash
node metrics/updateTable/updateActivitiesTable.js
```

### Step 2: Update Equities Weight Table
```bash
node metrics/updateTable/updateEquitiesWeightTable.js
```

### Step 3: Update Price Data and Corporate Actions
```bash
# Incremental (default)
node metrics/updateTable/updatePriceData.js

# Full sync
node metrics/updateTable/updatePriceData.js --fullSync

# Force refresh
node metrics/updateTable/updatePriceData.js --forceRefresh
```

### Step 4: Update Portfolio Timeseries
```bash
node metrics/updateTable/updatePortfolioTimeseries.js
```

### Step 5: Calculate Metrics
```bash
node metrics/calculateMetrics.js
```

### Step 6: Validate Metrics
```bash
node metrics/validateMetrics.js
```

## Pipeline Steps Order

The complete pipeline runs in this order:

1. **Price Data and Corporate Actions** (`price`)
   - Fetches price data for all symbols
   - Fetches corporate actions (splits, dividends)
   - Stores in database

2. **Portfolio Valuation** (`valuation`)
   - Calculates portfolio values from positions and prices

3. **Returns Calculation** (`returns`)
   - Calculates flow-adjusted returns
   - Computes equity indices

4. **Metrics Calculation** (`metrics`)
   - Calculates portfolio metrics (Sharpe, Sortino, etc.)
   - For different time periods (1M, 3M, YTD, 1Y, ITD)

5. **Validation** (`validate`)
   - Performs data quality checks

## Common Issues

### DATABASE_URL not set
```bash
# Solution: Set the environment variable
export DATABASE_URL="your-mongodb-connection-string"
```

### MongoDB not running
```bash
# For local MongoDB, start it:
mongod

# Or check if it's running:
ps aux | grep mongod
```

### Permission errors
```bash
# Make sure you have read/write access to MongoDB
# Check your connection string and credentials
```

## Example: Complete Setup and Run

```bash
# 1. Set DATABASE_URL
export DATABASE_URL="mongodb://localhost:27017/quantDashboard"

# 2. Verify it's set
echo $DATABASE_URL

# 3. Run the pipeline (incremental mode)
node metrics/runMetricsPipeline.js

# Or run full sync
node metrics/runMetricsPipeline.js --fullSync
```

## Pipeline Options

When calling from code:
```javascript
import { runMetricsPipeline } from "./metrics/runMetricsPipeline.js";

await runMetricsPipeline({
  databaseUrl: process.env.DATABASE_URL,
  fullSync: false, // or true for full sync
  userId: "optional-user-id",
  accountId: "optional-account-id",
  steps: ["price", "valuation", "returns", "metrics", "validate"],
});
```

