# ETL / ELT Process for metrics

## Purpose

Provide an operational, reproducible pipeline to turn raw brokerage/account activities into a daily portfolio timeseries and derived metrics used in the app.
The pipeline is designed to run on cron jobs or via refresh button.

## Current Implementation Status

**Implemented:**
- ✅ Step 1: Fetch and store account activities from SnapTrade (`updateActivitiesTable.js`)
- ✅ Steps 2-6: Process activities into daily positions timeseries (`updateEquitiesWeightTable.js`)

**Not Yet Implemented:**
- ⏳ Step 7: Price enrichment (fetching daily close prices)
- ⏳ Step 8: Valuation and cash series (portfolio value timeseries)
- ⏳ Step 9: Flow-adjusted returns and indices
- ⏳ Step 10: Metrics calculation and persistence
- ⏳ Step 11: Post-run validation and alerts

## Limitations

- Daily option prices not available but will be included in future
- Corporate actions (splits) not yet handled
- Cash flow series and portfolio valuation not yet implemented

## High-level contract

### Input

- Account activities (from SnapTrade API)
- Market Prices (to be implemented)
- Account cash balances (to be implemented)

### Output to db

- ✅ **EquitiesWeightTimeseries**: Daily position weights (date × account × symbol) with signed units
- ⏳ Daily portfolio timeseries (indexed by date) with fields: cash_value, stock_value, total_value, deposit_withdrawal, simple_returns, cum_return
- ⏳ Metrics time series

## Implementation Details

### Scripts

1. **`updateActivitiesTable.js`**: Fetches activities from SnapTrade and stores them in MongoDB
2. **`updateEquitiesWeightTable.js`**: Processes activities to build daily positions timeseries

### Database Collections

- **`snaptradeaccountactivities`**: Raw account activities from SnapTrade
  - Model: `AccountActivities`
  - Key fields: `accountId`, `userId`, `activityId`, `type`, `trade_date`, `date`, `symbol`, `symbolObj`, `option_symbol`, `units`, `quantity`, `amount`
  - Indexed by: `accountId`, `userId`, `activityId`, `date`
  
- **`equitiesweighttimeseries`**: Daily position weights per symbol
  - Model: `EquitiesWeightTimeseries`
  - Key fields: `userId`, `accountId`, `date`, `symbol`, `units`
  - Compound unique index: `(accountId, date, symbol)`

## On creating connection to new brokerage

1. Run `updateActivitiesTable.js` to fetch all historical activities for the new account
2. Run `updateEquitiesWeightTable.js` to build positions timeseries from activities
3. (Future) Calculate portfolio values and metrics

## On daily refresh (cron) or refresh button press

1. Run `updateActivitiesTable.js` to fetch new activities since last run
2. Run `updateEquitiesWeightTable.js` to update positions timeseries
3. (Future) Update portfolio values, returns, and metrics

## Detailed Implementation

### Step 1: Fetch and Store Activities (`updateActivitiesTable.js`)

**Function:** `updateAccountActivitiesTable(opts)`

**Options:**
- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `activityTypes`: Comma-separated list of activity types (default: `"BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER"`)
- `userId`: Optional; process only this user's accounts
- `userSecret`: Optional; SnapTrade userSecret for the specified userId

**Process:**
1. Connect to MongoDB
2. Determine which users/accounts to process:
   - If `userId` provided: process only that user (lookup `userSecret` from `Users` collection if not provided)
   - Otherwise: bulk mode - iterate all users from `Users` collection
3. For each account:
   - Query `AccountActivities` collection to find last activity date using `getLastActivityDate()`
   - Call SnapTrade API via `AccountServiceClientService.listAllAccountActivities()` starting from last date
   - Transform activities using `AccountServiceClientService.transformActivitiesForMongoDB()`
   - Upsert into `snaptradeaccountactivities` collection by `(accountId, activityId)`
4. Return summary: `{ totalAccounts, processed, skipped, upsertedDocs, errors }`

**Data Source:**
- SnapTrade API via `AccountServiceClientService`
- Uses `userSecret` from `Users` collection for authentication

### Steps 2-6: Build Daily Positions Timeseries (`updateEquitiesWeightTable.js`)

**Function:** `updateEquitiesWeightTable(opts)`

**Options:**
- `databaseUrl`: MongoDB connection string (defaults to `DATABASE_URL` env var)
- `userId`: Optional; process only this user's accounts
- `accountId`: Optional; process only this specific account

**Process:**

1. **Read activities from database**
   - Query `snaptradeaccountactivities` collection
   - Filter by `userId` and/or `accountId` if provided
   - Sort by `trade_date` and `date` (ascending)
   - Use cursor with batching (1000 records) and timeout (5 minutes)

2. **Normalize & filter relevant types**
   - Filter activities to position-affecting types: `BUY`, `SELL`, `REI`, `OPTIONASSIGNMENT`, `OPTIONEXERCISE`, `OPTIONEXPIRATION`
   - Normalize `trade_date` or `date` to date (remove time component)
   - Extract symbol using `extractPositionSymbol()`:
     - For options: use `option_symbol.ticker`
     - For equities: use `symbolObj.symbol` or `symbolObj.raw_symbol` or `symbol` (string)
   - Compute signed units using `signedUnits()`:
     - `SELL` => negative units
     - `BUY` / `REI` => positive units
     - `OPTIONASSIGNMENT` / `OPTIONEXERCISE` / `OPTIONEXPIRATION` => negative units
     - Other types => 0

3. **Aggregate transactions by date & symbol**
   - Group activities by date (YYYY-MM-DD format)
   - Sum signed units per `(date, symbol)` combination

4. **Build full calendar and roll-forward positions**
   - Create date range from earliest to latest transaction date
   - For each date in range:
     - Apply transactions for that date to current positions
     - Store snapshot of positions (Map of symbol -> units)
     - Carry positions forward to next day
   - Remove positions with near-zero units (< 1e-3)

5. **Persist to database**
   - Upsert records into `equitiesweighttimeseries` collection
   - Structure: `{ userId, accountId, date, symbol, units }`
   - Process in batches of 1000 to avoid timeouts
   - Return summary: `{ totalAccounts, processed, skipped, totalRecords, errors }`

**Note:** Corporate actions (splits) are not yet handled in the current implementation.

### Steps 7-11: Future Implementation

**Step 7: Price enrichment**
- Fetch daily close prices for all tickers in `EquitiesWeightTimeseries` over date range
- Use price provider API (e.g., Alpha Vantage, Yahoo Finance)
- Cache prices to avoid redundant API calls
- Handle missing data (forward fill, zero, or mark as degraded)

**Step 8: Valuation and cash series**
- Calculate `stock_value` per day: sum of `positions × price` for each symbol
- Build `cash_time_series` from cash flow activities (CONTRIBUTION, DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, FEE)
- Calculate `total_value = stock_value + cash_value`
- Store in new `PortfolioTimeseries` collection

**Step 9: Compute flow-adjusted returns and indices**
- Calculate `simple_returns[i] = (total_value[i] - (total_value[i-1] + ext_daily[i])) / (total_value[i-1] + ext_daily[i])`
- Identify alive segments where `total_value > threshold`
- Compute cumulative returns and equity index per segment

**Step 10: Persist outputs and emit metrics**
- Persist portfolio timeseries to database
- Calculate and store metrics (Sharpe ratio, max drawdown, etc.)
- Emit run metrics and data-quality warnings

**Step 11: Post-run validation and alerts**
- Sanity checks: AUM within tolerance, no unexpected NaNs, price gaps
- Alert on validation failures


