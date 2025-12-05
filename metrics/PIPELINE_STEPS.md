# Metrics Pipeline Steps

This document outlines the complete steps of the metrics pipeline for both **bulk (full sync)** and **daily refresh** modes.

## Overview

The metrics pipeline transforms raw brokerage account activities into a comprehensive portfolio timeseries with calculated metrics. The pipeline consists of 5 main steps that can be run individually or as a complete sequence.

**Key Data Flow:**

- For all portfolios (or filtered by user), the pipeline identifies all unique equities (stocks, options, etc.)
- Processes by symbol (across all users), not by user - each symbol is fetched once even if multiple users hold it
- Fetches and updates price data for each unique equity symbol
- Fetches corporate actions (stock splits, dividends) for each unique equity symbol
- Stores both price data and corporate actions in the database (symbol-based, not user-based)
- Uses this data to calculate accurate portfolio valuations and metrics

## Pipeline Steps

### Step 1: Update Activities Table

**Script:** `updateTable/updateActivitiesTable.js`  
**Function:** `updateAccountActivitiesTable(opts)`

Fetches account activities from SnapTrade API and stores them in MongoDB.

#### Bulk Mode (Full Sync)

- **Behavior:** Fetches all historical activities for all accounts
- **Process:**
  1. Connect to MongoDB
  2. Iterate through all users in `Users` collection
  3. For each user's accounts:
     - Query `AccountActivities` to find last activity date
     - If no previous activities exist, fetch from beginning
     - Call SnapTrade API to get all activities from start date
     - Transform activities using `AccountServiceClientService.transformActivitiesForMongoDB()`
     - Upsert into `snaptradeaccountactivities` collection by `(accountId, activityId)`
- **Output:** All historical activities stored in `AccountActivities` collection

#### Daily Refresh Mode

- **Behavior:** Fetches only new activities since last run
- **Process:**
  1. Connect to MongoDB
  2. For each account (or specific user/account if specified):
     - Query `AccountActivities` to find last activity date using `getLastActivityDate()`
     - Call SnapTrade API starting from last activity date (inclusive)
     - Transform and upsert only new activities
- **Output:** New activities appended to `AccountActivities` collection

#### Options

- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `activityTypes`: Comma-separated list of activity types (default: `"BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER"`)
- `userId`: Optional; process only this user's accounts
- `userSecret`: Optional; SnapTrade userSecret for the specified userId

---

### Step 2: Update Equities Weight Table

**Script:** `updateTable/updateEquitiesWeightTable.js`  
**Function:** `updateEquitiesWeightTable(opts)`

Processes activities to build daily position timeseries (signed units per symbol per date), accounting for corporate actions like stock splits. Uses corporate actions data stored in Step 3.

#### Bulk Mode (Full Sync)

- **Behavior:** Builds complete historical positions timeseries from all activities
- **Process:**
  1. Read all activities from `AccountActivities` collection
  2. Filter to position-affecting types: `BUY`, `SELL`, `REI`, `OPTIONASSIGNMENT`, `OPTIONEXERCISE`, `OPTIONEXPIRATION`
  3. Normalize dates and extract symbols
  4. Compute signed units (positive for buys, negative for sells)
  5. Aggregate transactions by date and symbol
  6. **Corporate Action Application:**
     - Collect all unique symbols from activities
     - For each symbol (skipping option tickers that contain spaces):
       - **Load corporate actions from database** (stock splits stored in Step 3)
       - If not found in database, fetch from Yahoo Finance API and store for future use
       - Get split dates and split factors (e.g., 2:1 split = factor of 2.0)
     - Include all split dates in the date range calculation
  7. Build full calendar from earliest transaction/split date to latest transaction/split date
  8. Roll-forward positions day by day:
     - **Apply corporate actions first:** On split effective dates, multiply existing position units by the split factor
     - **Then apply transactions:** Add/subtract units from buy/sell activities
  9. Remove positions with near-zero units (< 1e-3)
  10. Upsert all daily position snapshots into `equitiesweighttimeseries` collection
- **Output:** Complete historical positions timeseries in `EquitiesWeightTimeseries` collection with split-adjusted units

#### Daily Refresh Mode

- **Behavior:** Updates positions timeseries with new activities only
- **Process:**
  1. Read activities from `AccountActivities` since last positions update
  2. Filter and process new activities (same logic as bulk mode)
  3. **Corporate Action Application:**
     - Check for corporate actions in the date range since last update
     - **Load corporate actions from database** (previously stored in Step 3)
     - If new splits occurred, fetch and store them in database
     - Apply split factors retroactively if splits occurred in the update period
  4. Merge new position changes with existing positions timeseries
  5. Update affected date ranges in `equitiesweighttimeseries` collection
- **Output:** Updated positions timeseries in `EquitiesWeightTimeseries` collection with split-adjusted units

#### Note on Corporate Actions

Corporate actions (stock splits, dividends) are fetched and stored in **Step 3** to avoid redundant API calls. Step 2 reads the stored corporate actions from the database rather than fetching them directly. This separation ensures:

- Corporate actions are fetched once per symbol and reused
- Price data and corporate actions are stored together for each equity
- Better performance through database caching

#### Options

- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `userId`: Optional; process only this user's accounts
- `accountId`: Optional; process only this specific account

---

### Step 3: Update Price Data and Corporate Actions

**Script:** `updateTable/updatePriceData.js`  
**Function:** `updatePriceData(opts)`

For all portfolios (or filtered by user), looks at all unique equities, fetches/updates price data, and fetches corporate actions (stock splits, dividends). Stores both price data and corporate actions in the database.

#### Overview

This step processes **by symbol** (across all users or filtered users), not by user. This is more efficient because:

- **Price data is symbol-based:** If User A and User B both hold AAPL, the price is the same - fetch it once
- **Automatic deduplication:** Each symbol is processed once, even if multiple users hold it
- **Better API efficiency:** No redundant API calls for shared symbols (AAPL, SPY, etc.)

**Process:**

1. **Get all unique symbols:**
   - Query `EquitiesWeightTimeseries` collection to get all unique symbols
   - Optionally filter by `userId` or `accountId` if specified
   - Symbols are automatically deduplicated (if multiple users hold the same symbol, it appears once)
2. **For each unique symbol:**
   - **Fetch/update price data:** Get daily price data (check database first to avoid redundant API calls)
   - **Fetch corporate actions:** Get stock splits and other corporate actions (check database first)
   - **Store in database:** Persist both price data and corporate actions to MongoDB (symbol-based storage)

#### Bulk Mode (Full Sync)

- **Behavior:** Fetches all historical prices and corporate actions for all unique symbols (across all users or filtered users)
- **Process:**
  1. **Get all unique symbols:**
     - Query `EquitiesWeightTimeseries` collection to get all unique symbols
     - Optionally filter by `userId` or `accountId` if specified in options
     - Symbols are automatically deduplicated (if User A and User B both hold AAPL, it appears once in the list)
  2. **For each unique symbol:**
     - Determine date range from first position date (across all users) to today
     - Check existing prices in `PriceHistory` collection (symbol-based, not user-based)
     - Fetch all historical prices from Yahoo Finance API (only if missing)
     - Store prices in `pricehistories` collection (keyed by `symbol`, not `userId`)
  3. **Fetch corporate actions:**
     - For each equity symbol (skipping option tickers that contain spaces):
       - Check database first for existing corporate actions
       - If not found, fetch stock split data from Yahoo Finance API
       - Fetch dividend history if needed
       - Store corporate actions in database (symbol-based, see Corporate Actions Storage below)
- **Output:**
  - Complete historical price data in `PriceHistory` collection (symbol-based, shared across all users)
  - Corporate actions data stored in database (symbol-based, shared across all users)

#### Daily Refresh Mode

- **Behavior:** Fetches only missing prices and new corporate actions for all unique symbols (across all users or filtered users)
- **Process:**
  1. **Get all unique symbols:**
     - Get unique symbols from `EquitiesWeightTimeseries` collection
     - Optionally filter by `userId` or `accountId` if specified
     - Symbols are automatically deduplicated
  2. **For each unique symbol:**
     - Determine required date range (from first position date to today)
     - Check existing prices in `PriceHistory` collection (symbol-based lookup)
     - Identify missing dates
     - Fetch only missing prices from Yahoo Finance API
     - Store new prices in `pricehistories` collection (symbol-based storage)
  3. **Update corporate actions:**
     - Check database for existing corporate actions per symbol
     - Check for new corporate actions in the date range since last update
     - Fetch split/dividend data for symbols that have positions in the affected date range
     - Update corporate actions in database (symbol-based storage)
- **Output:**
  - New/missing prices added to `PriceHistory` collection (symbol-based, shared across all users)
  - Updated corporate actions in database (symbol-based, shared across all users)

#### Corporate Actions Storage

Corporate actions (stock splits, dividends) are stored in the database for reuse:

- **Stock Splits:** Stored with symbol, split date, and split factor (e.g., 2:1 split = factor of 2.0)
- **Dividends:** Stored with symbol, ex-dividend date, and dividend amount
- **Collection:** Corporate actions can be stored in a dedicated collection (e.g., `stocksplits`, `corporatedctions`) or as part of symbol metadata
- **Benefits:**
  - Avoids repeated API calls for historical corporate action data
  - Enables accurate position adjustments in Step 2
  - Improves performance by caching rarely-changing historical data

#### Processing Strategy: By User vs. For Every User

**Important Consideration:** Price data and corporate actions are **symbol-based**, not user-based. If User A and User B both hold AAPL, the price data for AAPL is the same for both.

**Option 1: Process By User (Current Approach)**

- **Pros:**
  - ✅ Better error isolation (one user's failure doesn't affect others)
  - ✅ Easier incremental updates (only process users that need updates)
  - ✅ Better progress tracking per user
  - ✅ Supports user-specific filtering (`userId` parameter)
  - ✅ Better resource management (memory, API rate limits per user)
  - ✅ Can parallelize at user level if needed
- **Cons:**
  - ❌ May fetch same symbol multiple times if multiple users hold it (though database deduplication helps)
  - ❌ More complex logic if coordinating across users

**Option 2: Process For Every User (All Users at Once)**

- **Pros:**
  - ✅ Automatic symbol deduplication (fetch each symbol once across all users)
  - ✅ Simpler code (single pass through all symbols)
  - ✅ Potentially faster for shared symbols (AAPL, SPY, etc.)
- **Cons:**
  - ❌ Harder to isolate errors per user
  - ❌ Must process all users even if only one needs updates
  - ❌ Harder to track progress
  - ❌ Less efficient for incremental updates
  - ❌ Higher memory usage (all symbols at once)

**Recommended Approach: Process By Symbol (Current Implementation)**

The optimal strategy is to **process by symbol across all users** (or filtered users), not by user. This is what the current implementation does:

1. **Get all unique symbols** from `EquitiesWeightTimeseries` (optionally filtered by `userId`)
2. **Automatic deduplication** - MongoDB's `distinct()` ensures each symbol appears once
3. **Process each symbol once:**
   - Fetch price data (check database first to avoid redundant API calls)
   - Fetch corporate actions (check database first)
   - Store in database (symbol-based, not user-based)
4. **Benefits:**
   - ✅ Automatic deduplication (no redundant API calls)
   - ✅ Efficient for shared symbols (AAPL, SPY, etc.)
   - ✅ Still supports `userId` filtering for specific use cases
   - ✅ Database already stores prices by symbol (not by user)
   - ✅ Better API rate limit management
   - ✅ One symbol fetch benefits all users who hold it

**Implementation:** The current code already implements this! The `getUniqueSymbols()` function uses MongoDB's `distinct()` which automatically deduplicates symbols. The `PriceHistory` collection stores prices by `symbol` (not by `userId`), so each symbol is only fetched once regardless of how many users hold it.

**Note on User Filtering:**

- If `userId` is provided, the function filters symbols to only those held by that user
- However, price data is still stored symbol-based (not user-based)
- This means if User A's symbols are processed first, User B benefits from cached prices for shared symbols
- This is the most efficient approach for both single-user and multi-user scenarios

#### Options

- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `userId`: Optional; process only this user's symbols
- `accountId`: Optional; process only this account's symbols
- `fullSync`: Boolean; if true, fetch all historical prices (default: false)
- `forceRefresh`: Boolean; if true, re-fetch even if price exists (default: false)

#### Performance Considerations

- **Bottleneck:** This step is typically the slowest (46+ minutes for 383 symbols in full sync)
- **Optimization Strategies:**
  - ✅ **Always use incremental mode** (`fullSync: false`) for daily runs - 10-50x faster
  - ⚡ **Parallel processing:** Process 10-20 symbols in parallel batches (5-10x faster)
  - ⚡ **Skip invalid symbols:** Filter expired options and delisted symbols before processing
  - ⚡ **Symbol validation cache:** Store invalid symbols in MongoDB to avoid repeated API failures
  - See "Performance Optimization" section below for details

---

### Step 4: Update Portfolio Timeseries

**Script:** `updateTable/updatePortfolioTimeseries.js`  
**Function:** `updatePortfolioTimeseries(opts)`

Builds portfolio valuation timeseries from positions, prices, and cash flows. Calculates returns and equity indices.

#### Bulk Mode (Full Sync)

- **Behavior:** Calculates portfolio values and returns for all historical dates
- **Process:**
  1. For each account:
     - Get date range from first position date to today
     - Build cash flow series from activities (CONTRIBUTION, DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, FEE)
     - For each date in range:
       - Calculate stock value: sum of `positions × prices` for each symbol
       - Get cash value from cash flow series
       - Calculate total value = stock value + cash value
       - Calculate deposit/withdrawal flows
     - Calculate flow-adjusted returns:
       - `simpleReturns[i] = (totalValue[i] - (totalValue[i-1] + depositWithdrawal[i])) / (totalValue[i-1] + depositWithdrawal[i])`
     - Identify alive segments (where totalValue > threshold)
     - Calculate cumulative returns and equity index per segment
  2. Store all portfolio records in `portfoliotimeseries` collection
- **Output:** Complete historical portfolio timeseries in `PortfolioTimeseries` collection with:
  - `stockValue`, `cashValue`, `totalValue`
  - `depositWithdrawal`, `externalFlowCumulative`
  - `simpleReturns`, `cumReturn`, `equityIndex`
  - `positions` array with symbol details

#### Daily Refresh Mode

- **Behavior:** Calculates portfolio values and returns only for new dates
- **Process:**
  1. For each account:
     - Get date range from last `PortfolioTimeseries` entry to today
     - If no previous entries exist, fall back to full sync
     - Build/update cash flow series from activities
     - For each new date:
       - Calculate stock value, cash value, total value
       - Calculate returns and equity indices
     - Store new portfolio records
- **Output:** New portfolio records appended to `PortfolioTimeseries` collection

#### Options

- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `userId`: Optional; process only this user's accounts
- `accountId`: Optional; process only this specific account
- `fullSync`: Boolean; if true, process all historical data (default: false)

---

### Step 5: Calculate Metrics

**Script:** `calculateMetrics.js`  
**Function:** `calculateMetrics(opts)`

Calculates portfolio metrics for different time periods and stores them in the Metrics collection.

#### Bulk Mode (Full Sync)

- **Behavior:** Calculates metrics for all periods for all accounts
- **Process:**
  1. For each account in `PortfolioTimeseries`:
     - For each period (`1M`, `3M`, `YTD`, `1Y`, `ITD`):
       - Get date range for period ending at today
       - Fetch portfolio timeseries data for period
       - Fetch activities for period
       - Calculate metrics:
         - **Portfolio Snapshot:** AUM, HHI, Diversification Score, Dividend Income, Interest Income, Total Income Yield
         - **Returns:** Total Return, CAGR
         - **Risk:** Volatility, Max Drawdown, VaR (95%), CVaR (95%), Beta (vs SPY)
         - **Risk-Adjusted:** Sharpe Ratio, Sortino Ratio
         - **NAV:** Latest total value
       - Store metrics in `snaptrademetrics` collection
- **Output:** Complete metrics for all periods in `Metrics` collection

#### Daily Refresh Mode

- **Behavior:** Recalculates metrics if portfolio data has changed
- **Process:**
  1. For each account:
     - Check if portfolio data has changed since last metrics calculation
     - If changed, recalculate metrics for all periods
     - Update metrics in `snaptrademetrics` collection
- **Output:** Updated metrics in `Metrics` collection

#### Options

- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `userId`: Optional; process only this user's accounts
- `accountId`: Optional; process only this specific account
- `fullSync`: Boolean; if true, recalculate all metrics (default: false)

#### Calculated Metrics

- **AUM:** Assets Under Management (latest total value)
- **HHI:** Herfindahl-Hirschman Index (concentration measure)
- **Diversification Score:** Derived from HHI
- **Dividend Income:** Total dividends received in period
- **Interest Income:** Total interest received in period
- **Total Income Yield:** (Dividend + Interest) / Average Portfolio Value
- **Total Return:** Point-to-point return
- **CAGR:** Compound Annual Growth Rate
- **Volatility:** Annualized standard deviation of returns
- **Max Drawdown:** Maximum peak-to-trough decline
- **VaR (95%):** Value at Risk at 95% confidence
- **CVaR (95%):** Conditional Value at Risk at 95% confidence
- **Beta:** Correlation-adjusted beta vs SPY benchmark
- **Sharpe Ratio:** Risk-adjusted return (risk-free rate = 0)
- **Sortino Ratio:** Downside risk-adjusted return
- **NAV:** Net Asset Value (latest total value)

---

### Step 6: Validate Metrics

**Script:** `validateMetrics.js`  
**Function:** `validateMetrics(opts)`

Performs data quality checks and validation on the pipeline outputs.

#### Both Modes (Same Behavior)

- **Process:**
  1. For each account:
     - **AUM Sanity Check:** Verify portfolio values are within expected range (not negative, not unreasonably large)
     - **Missing Prices Check:** Identify positions without corresponding price data
     - **Returns Consistency Check:** Verify returns calculations are consistent
     - **Data Completeness Check:** Ensure all required fields are present
     - **Price Gaps Check:** Identify missing price data that could affect calculations
  2. Collect validation results and generate summary
  3. Optionally send alerts on validation failures
- **Output:** Validation results with pass/warning/error status for each check

#### Options

- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `userId`: Optional; validate only this user
- `accountId`: Optional; validate only this account
- `sendAlerts`: Boolean; send notifications on failures (default: false)

---

## Running the Complete Pipeline

### Using `runMetricsPipeline.js`

The main pipeline orchestrator runs all steps in sequence:

```javascript
import { runMetricsPipeline } from "./runMetricsPipeline.js";

// Bulk mode (full sync)
await runMetricsPipeline({
  databaseUrl: process.env.DATABASE_URL,
  fullSync: true,
  steps: ["price", "valuation", "returns", "metrics", "validate"],
});

// Daily refresh mode
await runMetricsPipeline({
  databaseUrl: process.env.DATABASE_URL,
  fullSync: false,
  steps: ["price", "valuation", "returns", "metrics", "validate"],
});
```

### Pipeline Options

- `databaseUrl`: MongoDB connection string
- `userId`: Optional; process specific user
- `accountId`: Optional; process specific account
- `fullSync`: Boolean; if true, full historical sync; if false, incremental (default: false)
- `steps`: Optional array of steps to run `['price', 'valuation', 'returns', 'metrics', 'validate']`. If not provided, runs all steps.
- `dryRun`: Boolean; if true, only log what would be done (default: false)

### CLI Usage

```bash
# Full sync (bulk mode)
node metrics/runMetricsPipeline.js --fullSync

# Daily refresh (incremental mode)
node metrics/runMetricsPipeline.js

# Run specific steps
node metrics/runMetricsPipeline.js --steps price,valuation,metrics

# Dry run (preview only)
node metrics/runMetricsPipeline.js --dryRun
```

---

## Data Flow

```
SnapTrade API
    ↓
AccountActivities (raw activities)
    ↓
EquitiesWeightTimeseries (daily positions)
    ↓
    ├─→ Step 3: Get all unique symbols (across all users)
    │       ↓
    │   For each unique symbol:
    │   PriceHistory (daily prices, symbol-based) ────┐
    │   Corporate Actions (splits, dividends, symbol-based) ────┐
    │       ↓                                    │
    │   Both stored in database (shared across users)
    │                                            │
    └────────────────────────────────────────────┘
    ↓
PortfolioTimeseries (portfolio values & returns)
    ↓
Metrics (calculated metrics)
    ↓
Validation (data quality checks)
```

**Key Flow for Price Data and Corporate Actions:**

1. **Step 2** creates `EquitiesWeightTimeseries` with all equities from all portfolios (or filtered by user)
2. **Step 3** processes by symbol (across all users, not by user):
   - Gets all unique symbols from `EquitiesWeightTimeseries` (automatically deduplicated)
   - For each unique symbol, fetches/updates price data once (even if multiple users hold it)
   - For each unique symbol, fetches corporate actions once (splits, dividends)
   - Stores both price data and corporate actions in the database (symbol-based, shared across users)
3. **Step 2** (on subsequent runs) uses stored corporate actions from database
4. **Step 4** uses stored price data (symbol-based) to calculate portfolio valuations for all users

---

## Database Collections

### Input Collections

- `snaptradeaccountactivities` (AccountActivities): Raw account activities from SnapTrade
- `users`: User records with SnapTrade userSecret

### Intermediate Collections

- `equitiesweighttimeseries` (EquitiesWeightTimeseries): Daily position weights per symbol
- `pricehistories` (PriceHistory): Daily price data for symbols
- `stocksplits` or `corporatedctions` (Corporate Actions): Stock splits, dividends, and other corporate actions per symbol

### Output Collections

- `portfoliotimeseries` (PortfolioTimeseries): Daily portfolio valuation and returns
- `snaptrademetrics` (Metrics): Calculated metrics for different time periods

---

## When to Use Each Mode

### Bulk Mode (Full Sync)

Use when:

- Setting up a new connection/account
- Rebuilding historical data
- Fixing data quality issues
- Initial data load

### Daily Refresh Mode

Use when:

- Running scheduled cron jobs
- User triggers manual refresh
- Updating with latest data
- Incremental updates

---

## Notes

- The pipeline is designed to be idempotent: running it multiple times should produce the same results
- Steps can be run individually or as a complete sequence
- Each step handles incremental updates when `fullSync: false`
- Error handling is built into each step, allowing the pipeline to continue even if individual accounts fail
- The pipeline uses MongoDB upserts to prevent duplicates

---

## Performance Optimization

### Current Performance

- **Price Enrichment (Step 3):** ~46 minutes for 383 symbols (full sync)
- **Valuation (Step 4):** Connection timeouts in some cases
- **Total Pipeline:** >46 minutes for full sync

### Target Performance (After Optimizations)

- **Price Enrichment** (incremental): 1-5 minutes
- **Price Enrichment** (full sync, parallel): 5-10 minutes
- **Valuation** (incremental): 30 seconds - 2 minutes
- **Metrics Calculation:** 10-30 seconds
- **Validation:** 5-10 seconds
- **Total** (incremental): 2-8 minutes
- **API Response** (cached): < 1 second

### Quick Wins (No Code Changes Required)

#### 1. ✅ Always Use Incremental Mode

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

#### 2. ✅ Add Database Indexes

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

#### 3. ✅ Increase MongoDB Connection Pool

**Impact:** Prevents connection timeouts, faster concurrent operations

Add to your connection string:

```env
DATABASE_URL=mongodb+srv://...?maxPoolSize=50&minPoolSize=10&maxIdleTimeMS=45000
```

#### 4. ✅ Use Steps Parameter to Skip Completed Work

**Impact:** Skip unnecessary steps

```bash
# Only run metrics calculation (skip price/valuation if already done)
node metrics/runMetricsPipeline.js --steps metrics
```

#### 5. ✅ Filter Invalid Symbols Early

**Impact:** Reduces API calls and processing time

Before processing, skip:

- Expired options (check expiration date in symbol)
- Known delisted symbols
- Invalid symbol formats

### Code Optimizations (Requires Changes)

#### 6. ⚡ Parallel Symbol Processing for Price Data

**Impact:** 5-10x faster price fetching (from 46 min → 5-10 min for 383 symbols)

**Current:** Processes symbols sequentially (one at a time)  
**Optimized:** Process 10-20 symbols in parallel batches

**Rate Limit Consideration:**

- Yahoo Finance: 2000 requests/hour = ~33/min = ~1 every 2 seconds
- With 15 parallel requests, each batch takes ~2 seconds
- 383 symbols ÷ 15 = ~26 batches × 2 seconds = ~52 seconds (vs 46 minutes!)

See `updatePriceData.parallel.example.js` for implementation example.

#### 7. ⚡ Symbol Validation Cache (MongoDB)

**Impact:** Avoids 215+ wasted API calls per run (5-10 minute savings)

Store invalid/expired/delisted symbols in MongoDB to skip them on subsequent runs:

- Create `symbolmetadata` collection
- Check cache before processing each symbol
- Update cache when errors occur

See `SYMBOL_CACHE_ANALYSIS.md` for detailed implementation.

#### 8. ⚡ Stock Split Cache (MongoDB)

**Impact:** Reduces API calls for corporate action data (1-2 minute savings)

Store stock split and corporate action history in MongoDB:

- Create `stocksplits` or `corporatedctions` collection
- Fetch splits and dividends once per symbol in Step 3
- Store with symbol, date, and split factor/dividend amount
- Reuse cached corporate actions in Step 2 (when applying splits to positions)
- Update only when new corporate actions occur

#### 9. ⚡ Optimize Database Queries

**Impact:** 2-3x faster queries

Use MongoDB aggregation pipelines instead of multiple separate queries:

- Use `$lookup` for joins
- Use `$group` for aggregations
- Project only needed fields

#### 10. ⚡ Parallel Account Processing

**Impact:** 2-5x faster for multiple accounts

Process multiple accounts in parallel batches (5 accounts at a time).

### Architecture Improvements

#### 11. 🏗️ Run as Background Job

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
```

**Option B: Fire and Forget**

```javascript
// In API endpoint
runMetricsPipeline(opts).catch((err) => {
  console.error("Background job failed:", err);
});
return res.json({ status: "processing" });
```

#### 12. 🏗️ Separate Cron Job from API

**Impact:** API responds instantly, cron handles heavy lifting

**Recommended Flow:**

1. **Cron Job** (daily at 2 AM):

   ```bash
   node metrics/runMetricsPipeline.js
   ```

2. **API Endpoint:**

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

### Implementation Priority

#### Phase 1: Quick Wins (Do First)

1. ✅ Add database indexes
2. ✅ Always use incremental mode
3. ✅ Increase connection pool
4. ✅ Use steps parameter

**Expected Impact:** 5-10x faster for incremental runs

#### Phase 2: Code Optimizations (High Impact)

1. ⚡ Parallel symbol processing (#6)
2. ⚡ Symbol validation cache (#7)
3. ⚡ Optimize database queries (#9)
4. ⚡ Skip expired options (#5)

**Expected Impact:** Additional 5-10x improvement

#### Phase 3: Architecture (Long-term)

1. 🏗️ Background job queue (#11)
2. 🏗️ Separate cron from API (#12)

**Expected Impact:** Better UX, non-blocking API

### Expected Results

After implementing Phase 1 + Phase 2:

- **10-50x faster** for incremental runs
- **5-10x faster** for full sync runs
- **No more timeouts**
- **Better scalability** for multiple accounts

### Monitoring

Add timing logs to measure improvements:

```javascript
console.time("price-enrichment");
await updatePriceData(opts);
console.timeEnd("price-enrichment");

console.time("valuation");
await updatePortfolioTimeseries(opts);
console.timeEnd("valuation");
```

### Additional Resources

- See `PERFORMANCE_IMPROVEMENTS.md` for detailed optimization strategies
- See `PERFORMANCE_OPTIMIZATION.md` for API-specific optimizations
- See `SYMBOL_CACHE_ANALYSIS.md` for MongoDB caching strategies
- See `updatePriceData.parallel.example.js` for parallel processing example
