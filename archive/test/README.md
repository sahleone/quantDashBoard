# Test Scripts - Timeseries Pipeline

This directory contains test scripts for the complete timeseries data pipeline. The scripts fetch account activities, extract symbols, normalize crypto symbols, fetch price history from Yahoo Finance, build daily cash balance series from activities, and build daily units series (positions) from activities. It also includes charting utilities to visualize the data.

## Directory Structure

```
archive/test/
├── timeseries.js                    # Main orchestration script
├── chartCashSeries.js              # Generate HTML chart for cash series
├── chartUnitsSeries.js              # Generate HTML chart for units series
├── chartPortfolioSeries.js          # Generate HTML chart for portfolio value series
├── testUnitsSeries.js               # Test script for buildDailyUnitsSeries function
├── clearPipelineData.js             # Utility to clear pipeline data from MongoDB
├── functions/                       # Core function modules
│   ├── getAccountIds.js             # Get all account IDs from database
│   ├── getAccountActivities.js      # Fetch and sync account activities
│   ├── getActivityDateRange.js      # Get min/max dates from activities
│   ├── getActivitySymbols.js        # Extract unique symbols from activities
│   ├── normalizeCryptoSymbols.js    # Normalize crypto symbols (add -USD suffix)
│   ├── fetchPriceHistory.js         # Fetch and store price history
│   ├── fetchStockSplits.js          # Fetch and store stock splits from Yahoo Finance
│   ├── buildDailyCashSeries.js      # Build daily cash balance series from activities
│   ├── buildDailyUnitsSeries.js     # Build daily units held per security series from activities
│   ├── buildDailySecurityValuesSeries.js # Build daily securities values from units and prices
│   └── buildDailyPortfolioSeries.js # Build daily portfolio value series (cash + securities)
├── utils/                           # Shared utilities
│   ├── dbConnection.js              # MongoDB connection management
│   ├── dateHelpers.js               # Date formatting utilities
│   └── errorHandling.js             # Error handling utilities
└── README.md                        # This file
```

## Overview

The pipeline consists of 9 main steps:

1. **Get Account IDs** - Retrieves all account IDs from the database
2. **Sync Activities** - Fetches and syncs account activities from SnapTrade API
3. **Get Date Range** - Determines the min/max dates from activities
4. **Get Symbols** - Extracts all unique equity symbols from activities
5. **Normalize Crypto** - Normalizes crypto symbols by appending "-USD" suffix
6. **Fetch Stock Splits** - Fetches stock splits from Yahoo Finance and stores in database
7. **Fetch Price History** - Fetches missing price data from Yahoo Finance and stores in database
8. **Build Cash Series** - Builds daily cash balance time series from activities
9. **Build Units Series** - Builds daily units held per security time series from activities (with split adjustments)

### Additional Series Building Functions

Beyond the core pipeline, there are additional functions to build more complex time series:

- **Build Securities Values Series** - Computes daily market values of securities from units series and price data
- **Build Portfolio Series** - Combines cash and securities values into a complete portfolio value time series with daily returns

## Usage

### Running the Complete Pipeline

```bash
# Using environment variable
DATABASE_URL="mongodb+srv://user:pass@cluster.mongodb.net/dbname" node archive/test/timeseries.js

# Or set in .env file
node archive/test/timeseries.js
```

### Using Individual Functions

Each function can be imported and used independently:

```javascript
import { getAllAccountIds } from "./functions/getAccountIds.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import { getActivityDateRange } from "./functions/getActivityDateRange.js";
import { getActivitySymbols } from "./functions/getActivitySymbols.js";
import { normalizeCryptoSymbols } from "./functions/normalizeCryptoSymbols.js";
import { fetchStockSplits } from "./functions/fetchStockSplits.js";
import { fetchPriceHistory } from "./functions/fetchPriceHistory.js";
import { buildDailyCashSeries } from "./functions/buildDailyCashSeries.js";
import { buildDailyUnitsSeries } from "./functions/buildDailyUnitsSeries.js";
import { buildDailySecurityValuesSeries } from "./functions/buildDailySecurityValuesSeries.js";
import { buildDailyPortfolioSeries } from "./functions/buildDailyPortfolioSeries.js";

// Example: Get all account IDs
const accountIds = await getAllAccountIds();

// Example: Get activities for a specific account
const activities = await getAccountActivities({
  accountId: "account-id-here",
});

// Example: Get date range
const dateRange = await getActivityDateRange();
console.log(
  `Date range: ${dateRange.minDateString} to ${dateRange.maxDateString}`
);

// Example: Get all symbols
const symbols = await getActivitySymbols();

// Example: Normalize crypto symbols
const normalized = await normalizeCryptoSymbols({
  symbols: ["BTC", "ETH", "AAPL"],
});
// Returns: ['BTC-USD', 'ETH-USD', 'AAPL']

// Example: Build daily cash series
const cashSeries = await buildDailyCashSeries({
  activities,
  baseCurrency: "USD",
  initialCash: 0,
});
// Returns: [{ date: '2020-03-17', cash: 1000, currency: 'USD' }, ...]

// Example: Build daily units series
const unitsSeries = buildDailyUnitsSeries({
  activities,
  endDate: null, // Optional: defaults to last activity date
});
// Returns: [{ date: '2020-03-17', positions: { 'AAPL': 10, 'VTI': 5 } }, ...]

// Example: Build daily securities values series
const securitiesValueSeries = await buildDailySecurityValuesSeries({
  unitsSeries,
  databaseUrl: process.env.DATABASE_URL,
});
// Returns: [{ date: '2020-03-17', values: { 'AAPL': 1500, 'VTI': 1000 }, totalSecuritiesValue: 2500 }, ...]

// Example: Build daily portfolio series
const portfolioSeries = buildDailyPortfolioSeries({
  cashSeries,
  securitiesValueSeries,
  includeDailyReturn: true,
});
// Returns: [{ date: '2020-03-17', cash: 1000, securitiesValue: 2500, portfolioValue: 3500, dailyReturn: 0.02 }, ...]

// Example: Fetch price history
const result = await fetchPriceHistory({ forceRefresh: false });
```

## Function Documentation

### `getAllAccountIds(opts)`

Retrieves all account IDs from the database.

**Parameters:**

- `opts.databaseUrl` (optional) - MongoDB connection string

**Returns:** `Promise<string[]>` - Array of account IDs

**Example:**

```javascript
const accountIds = await getAllAccountIds();
```

---

### `getAccountActivities(opts)`

Fetches all activities for a given account. If the last activity date is not today, automatically fetches missing data from SnapTrade and updates MongoDB.

**Parameters:**

- `opts.accountId` (required) - Account ID to fetch activities for
- `opts.databaseUrl` (optional) - MongoDB connection string
- `opts.userId` (optional) - User ID (will be fetched from account if not provided)
- `opts.userSecret` (optional) - User secret (will be fetched from user if not provided)

**Returns:** `Promise<Array>` - Sorted array of account activities

**Example:**

```javascript
const activities = await getAccountActivities({
  accountId: "b199b32e-a5c2-44ab-b646-06901040df0c",
});
```

---

### `getActivityDateRange(opts)`

Finds the minimum and maximum date of activities stored in the database. Prefers `trade_date` over `date` field.

**Parameters:**

- `opts.databaseUrl` (optional) - MongoDB connection string
- `opts.accountId` (optional) - Filter by specific account

**Returns:** `Promise<Object>` - Object with:

- `minDate` - Date object
- `maxDate` - Date object
- `minDateString` - Formatted as "yyyy-mm-dd"
- `maxDateString` - Formatted as "yyyy-mm-dd"

**Example:**

```javascript
const dateRange = await getActivityDateRange();
console.log(dateRange.minDateString); // "2017-06-15"
console.log(dateRange.maxDateString); // "2025-12-01"
```

---

### `getActivitySymbols(opts)`

Finds all unique equity symbols from activities stored in the database.

**Parameters:**

- `opts.databaseUrl` (optional) - MongoDB connection string
- `opts.accountId` (optional) - Filter by specific account

**Returns:** `Promise<string[]>` - Sorted array of unique symbols

**Example:**

```javascript
const symbols = await getActivitySymbols();
// Returns: ['AAPL', 'BTC', 'ETH', 'MSFT', ...]
```

---

### `normalizeCryptoSymbols(opts)`

Normalizes crypto symbols by appending "-USD" suffix for Yahoo Finance API compatibility.

**Parameters:**

- `opts.symbols` (required) - Array of symbols to normalize

**Returns:** `Promise<string[]>` - Array of normalized symbols

**Example:**

```javascript
const normalized = await normalizeCryptoSymbols({
  symbols: ["BTC", "ETH", "AAPL"],
});
// Returns: ['BTC-USD', 'ETH-USD', 'AAPL']
```

---

### `fetchPriceHistory(opts)`

Fetches and stores price history for all symbols from activities. Checks the database first and only fetches missing dates.

**Parameters:**

- `opts.databaseUrl` (optional) - MongoDB connection string
- `opts.accountId` (optional) - Filter by specific account
- `opts.forceRefresh` (optional) - If true, re-fetch all prices even if they exist (default: false)

**Returns:** `Promise<Object>` - Summary object with:

- `success` - Boolean indicating success
- `summary` - Object with statistics:
  - `symbolsProcessed` - Total symbols processed
  - `symbolsSucceeded` - Number of successful fetches
  - `symbolsSkipped` - Number of skipped symbols
  - `symbolsErrored` - Number of errors
  - `totalPricesStored` - Total number of price records stored
- `results` - Array of detailed results for each symbol

**Example:**

```javascript
const result = await fetchPriceHistory({ forceRefresh: false });
console.log(`Stored ${result.summary.totalPricesStored} prices`);
```

---

### `fetchStockSplits(opts)`

Fetches stock splits from Yahoo Finance and stores them in the CorporateActions collection. Checks the database first and only fetches missing splits unless `forceRefresh` is true.

**Parameters:**

- `opts.symbols` (optional) - Array of symbols to process (if not provided, fetches from activities)
- `opts.accountId` (optional) - Filter by specific account
- `opts.startDate` (optional) - Start date for splits (defaults to activity min date)
- `opts.endDate` (optional) - End date for splits (defaults to activity max date or today)
- `opts.databaseUrl` (optional) - MongoDB connection string
- `opts.forceRefresh` (optional) - If true, re-fetch all splits even if already in DB (default: false)

**Returns:** `Promise<Object>` - Summary object with:

- `success` - Boolean indicating success
- `summary` - Object with statistics:
  - `symbolsProcessed` - Total symbols processed
  - `symbolsWithSplits` - Number of symbols with splits found
  - `splitsUpserted` - Total number of split records stored
  - `symbolsErrored` - Number of errors
- `results` - Array of detailed results for each symbol

**Example:**

```javascript
const result = await fetchStockSplits({
  symbols: ["AAPL", "TSLA", "MSFT"],
  forceRefresh: false,
});
console.log(`Stored ${result.summary.splitsUpserted} split records`);
```

**Notes:**

- Splits are stored in the `corporateactions` collection
- Each split record includes: `date`, `factor`, `ratio`, `ratioFrom`, `ratioTo`
- Splits are automatically applied in `buildDailyUnitsSeries` when `applySplits: true`
- Option tickers (containing spaces) are automatically skipped

---

### `buildDailyCashSeries(opts)`

Builds a daily cash balance time series from SnapTrade activities for one account. Processes activities chronologically, applying the `amount` field (which already has the correct sign per SnapTrade docs) to calculate daily cash balances.

**Parameters:**

- `opts.activities` (required) - Array of activity objects from SnapTrade API or MongoDB
- `opts.baseCurrency` (optional) - Base currency code to track (e.g., "USD"). If not provided, uses first activity's currency
- `opts.endDate` (optional) - End date for the series (defaults to last activity date or today)
- `opts.initialCash` (optional) - Starting cash balance (default: 0)

**Returns:** `Promise<Array>` - Array of objects with `{ date, cash, currency }` for each day

**Example:**

```javascript
const activities = await getAccountActivities({ accountId: "account-id" });
const cashSeries = await buildDailyCashSeries({
  activities,
  baseCurrency: "USD",
  initialCash: 0,
});
// Returns: [
//   { date: '2020-03-17', cash: 1000, currency: 'USD' },
//   { date: '2020-03-18', cash: 950, currency: 'USD' },
//   ...
// ]
```

**Notes:**

- Activities are automatically reversed (SnapTrade returns reverse chronological)
- Only activities in the base currency are processed
- The `amount` field is used directly (positive increases balance, negative decreases)
- Works with both SnapTrade API format and MongoDB-stored activities

---

### `buildDailyUnitsSeries(opts)`

Builds a daily time series of units held per security from SnapTrade activities for one account. Processes activities chronologically, tracking positions (units) for each security (stock, ETF, bond, crypto, etc.) across all dates.

**Parameters:**

- `opts.activities` (required) - Array of activity objects from SnapTrade API or MongoDB (for one account)
- `opts.endDate` (optional) - End date for the series (defaults to last activity date or today)

**Returns:** `Array` - Array of objects with `{ date, positions }` for each day, where `positions` is a map of symbol → units

**Example:**

```javascript
const activities = await getAccountActivities({ accountId: "account-id" });
const unitsSeries = buildDailyUnitsSeries({
  activities,
  endDate: null,
});
// Returns: [
//   { date: '2020-03-17', positions: { 'AAPL': 10, 'VTI': 5, 'BTC-USD': 0.1 } },
//   { date: '2020-03-18', positions: { 'AAPL': 8, 'VTI': 6, 'BTC-USD': 0.1 } },
//   ...
// ]
```

**Notes:**

- Activities are automatically reversed (SnapTrade returns reverse chronological)
- Only activities with symbols and non-zero units are processed
- Handles multiple activity types: BUY, SELL, REI, STOCK_DIVIDEND, transfers, splits, options, etc.
- Supports all security types: stocks, ETFs, bonds, crypto, options
- Zero positions are automatically cleaned from snapshots
- **Stock splits are automatically applied** when `applySplits: true` (default)
- Splits are loaded from the `corporateactions` collection and applied at the start of each day
- Works with both SnapTrade API format and MongoDB-stored activities

---

### `buildDailySecurityValuesSeries(opts)`

Builds a daily time series of securities values from units series and price data. Computes the market value of each security (units × price) for each day.

**Parameters:**

- `opts.unitsSeries` (required) - Array of `{ date, positions }` from `buildDailyUnitsSeries`
- `opts.databaseUrl` (optional) - MongoDB connection string for loading prices
- `opts.pricesBySymbolDate` (optional) - Preloaded price lookup map (Map of symbol → Map of date → price)
- `opts.getPriceForSymbolOnDate` (optional) - Custom price lookup function

**Returns:** `Promise<Array>` - Array of objects with:

- `date` - Date string (YYYY-MM-DD)
- `values` - Object mapping symbol → market value
- `totalSecuritiesValue` - Sum of all security values for the day

**Example:**

```javascript
const unitsSeries = buildDailyUnitsSeries({ activities });
const securitiesValueSeries = await buildDailySecurityValuesSeries({
  unitsSeries,
  databaseUrl: process.env.DATABASE_URL,
});
// Returns: [
//   { date: '2020-03-17', values: { 'AAPL': 1500, 'VTI': 1000 }, totalSecuritiesValue: 2500 },
//   { date: '2020-03-18', values: { 'AAPL': 1520, 'VTI': 1010 }, totalSecuritiesValue: 2530 },
//   ...
// ]
```

**Notes:**

- Prices are loaded from the `pricehistories` collection
- If a price is not available for a specific date, it looks back to find the most recent available price
- Missing prices are treated as 0 (could be marked as missing in future versions)
- Works with normalized crypto symbols (e.g., "BTC-USD")

---

### `buildDailyPortfolioSeries(opts)`

Builds a daily portfolio value time series by combining cash and securities values. Creates a complete portfolio snapshot with cash, securities value, total portfolio value, and optional daily returns.

**Parameters:**

- `opts.cashSeries` (required) - Array of `{ date, cash, currency }` from `buildDailyCashSeries`
- `opts.securitiesValueSeries` (required) - Array of `{ date, totalSecuritiesValue, values }` from `buildDailySecurityValuesSeries`
- `opts.startDate` (optional) - Start date (defaults to earliest date in either series)
- `opts.endDate` (optional) - End date (defaults to latest date in either series)
- `opts.includeDailyReturn` (optional) - Whether to compute daily returns (default: false)

**Returns:** `Array` - Array of objects with:

- `date` - Date string (YYYY-MM-DD)
- `cash` - Cash balance for the day
- `securitiesValue` - Total securities value for the day
- `portfolioValue` - Total portfolio value (cash + securities)
- `dailyReturn` - Daily return percentage (if `includeDailyReturn: true`)

**Example:**

```javascript
const cashSeries = await buildDailyCashSeries({
  activities,
  baseCurrency: "USD",
});
const securitiesValueSeries = await buildDailySecurityValuesSeries({
  unitsSeries,
});
const portfolioSeries = buildDailyPortfolioSeries({
  cashSeries,
  securitiesValueSeries,
  includeDailyReturn: true,
});
// Returns: [
//   { date: '2020-03-17', cash: 1000, securitiesValue: 2500, portfolioValue: 3500, dailyReturn: null },
//   { date: '2020-03-18', cash: 950, securitiesValue: 2530, portfolioValue: 3480, dailyReturn: -0.0057 },
//   ...
// ]
```

**Notes:**

- Aligns cash and securities series by date
- Carries forward values for dates where one series has data but the other doesn't
- Daily return is calculated as: `(portfolioValue / previousPortfolioValue) - 1`
- First day has `dailyReturn: null` (no previous value to compare)

---

### `buildDailyUnitsSeriesForAccounts(opts)`

Convenience function to build units series for multiple accounts.

**Parameters:**

- `opts.activitiesByAccount` (required) - Map of accountId → activities array
- `opts.endDate` (optional) - End date for all series

**Returns:** `Object` - Map of accountId → units series array

**Example:**

```javascript
const activitiesByAccount = {
  "account-1": activities1,
  "account-2": activities2,
};
const results = buildDailyUnitsSeriesForAccounts({
  activitiesByAccount,
});
```

---

### `buildDailyCashSeriesForAccounts(opts)`

Convenience function to build cash series for multiple accounts.

**Parameters:**

- `opts.activitiesByAccount` (required) - Map of accountId → activities array
- `opts.baseCurrencyByAccount` (optional) - Map of accountId → currency code
- `opts.endDate` (optional) - End date for all series
- `opts.initialCashByAccount` (optional) - Map of accountId → initial cash

**Returns:** `Promise<Object>` - Map of accountId → cash series array

**Example:**

```javascript
const activitiesByAccount = {
  "account-1": activities1,
  "account-2": activities2,
};
const results = await buildDailyCashSeriesForAccounts({
  activitiesByAccount,
  baseCurrencyByAccount: { "account-1": "USD", "account-2": "CAD" },
});
```

## Chart Scripts

### `chartCashSeries.js`

Generates an interactive HTML chart visualizing cash series data from the database.

**Usage:**

```bash
# Chart all accounts
node archive/test/chartCashSeries.js

# Chart specific account
node archive/test/chartCashSeries.js [accountId]
```

**Output:** Creates `cashSeriesChart.html` (in the same directory) with an interactive Chart.js visualization showing cash balance over time.

---

### `chartUnitsSeries.js`

Generates an interactive HTML chart visualizing units series (positions) data from activities.

**Usage:**

```bash
# Chart all accounts
node archive/test/chartUnitsSeries.js

# Chart specific account
node archive/test/chartUnitsSeries.js [accountId]
```

**Output:** Creates `unitsSeriesChart.html` with an interactive Chart.js visualization showing units held per security over time. Includes:

- Account selector
- Symbol checkboxes to show/hide specific securities
- Statistics panel
- Multi-line chart with one line per symbol

---

### `chartPortfolioSeries.js`

Generates an interactive HTML chart visualizing portfolio value series (cash + securities) data.

**Usage:**

```bash
# Chart all accounts
node archive/test/chartPortfolioSeries.js

# Chart specific account
node archive/test/chartPortfolioSeries.js [accountId]
```

**Output:** Creates `portfolioSeriesChart.html` (in the same directory) with an interactive Chart.js visualization showing:

- Cash balance over time
- Securities value over time
- Total portfolio value over time
- Daily returns chart
- Account selector
- Checkboxes to show/hide cash, securities, and portfolio value
- Statistics panel with key metrics (total return, min/max values, etc.)

**Notes:**

- Builds cash series, units series, securities values series, and portfolio series for each account
- Handles accounts with no securities (cash-only portfolios)
- Includes comprehensive statistics and date range information

---

## Test Scripts

### `testUnitsSeries.js`

Quick test script for the `buildDailyUnitsSeries` function using sample activity data.

**Usage:**

```bash
node archive/test/testUnitsSeries.js
```

**Purpose:** Validates that `buildDailyUnitsSeries` correctly processes sample activities and generates the expected units series output.

---

## Utilities

### Database Connection (`utils/dbConnection.js`)

Shared utilities for MongoDB connection management:

- `ensureDbConnection(databaseUrl)` - Ensures MongoDB connection is established
- `disconnectDb()` - Disconnects from MongoDB
- `getDb()` - Gets the MongoDB database instance

### Date Helpers (`utils/dateHelpers.js`)

Date formatting utilities:

- `formatDateToYYYYMMDD(date)` - Transforms a date to "yyyy-mm-dd" format
- `getTradeDateAsYYYYMMDD(activity)` - Gets trade_date from activity and formats it
- `addFormattedDatesToActivities(activities)` - Adds formatted date field to activities

### Error Handling (`utils/errorHandling.js`)

Error handling utilities:

- `withErrorHandling(fn, options)` - Wraps async function with error handling
- `handleError(error, exit)` - Handles errors and disconnects from database

## Dependencies

- `mongoose` - MongoDB ODM
- `yahoo-finance2` - Yahoo Finance API client (via server utils)
- SnapTrade API client (via server clients)

## Environment Variables

- `DATABASE_URL` - MongoDB connection string (required)

---

## Duplicate Prevention

All functions implement duplicate checking before inserting data:

### Price History (`fetchPriceHistory`)

- **Pre-fetch check**: Queries database for existing price dates before fetching from API
- **Filtering**: Only fetches missing dates (unless `forceRefresh: true`)
- **Upsert protection**: Uses `upsert: true` with filter on `{ symbol, date }` to prevent duplicates

### Stock Splits (`fetchStockSplits`)

- **Pre-insert check**: Uses `findOne` to check if exact split already exists (by symbol, date, ratioFrom, ratioTo)
- **Array protection**: Uses `$addToSet` operator which prevents duplicate entries in the splits array
- **Two-layer protection**: Both explicit check and MongoDB operator prevent duplicates

### Cash Series (`storeCashSeries`)

- **Upsert protection**: Uses `upsert: true` with filter on `{ userId, accountId, date }` to prevent duplicates
- **Bulk operations**: Processes all dates in a single bulk write for efficiency

## Notes

- All functions use the native MongoDB driver for better performance
- Database connections are reused across function calls
- Crypto symbols are automatically normalized for Yahoo Finance API
- Price history only fetches missing dates by default (use `forceRefresh: true` to re-fetch all)
- Option symbols (containing spaces) are handled with price 0 instead of API calls
- Portfolio series combines cash and securities values into a complete portfolio view
- Securities values are computed from units × prices, with prices loaded from the database
- All insert operations are idempotent - running the pipeline multiple times won't create duplicates

## Limitations

### Data Constraints

This implementation is designed for educational purposes and uses freely available daily market data. The following limitations apply:

#### 1. Daily Close Prices Only

- **Issue**: Portfolio valuation uses daily closing prices, which may not reflect exact trade execution prices.
- **Impact**: Creates minor timing discrepancies on trade days (cash changes on trade day, but securities are valued using closing price). These discrepancies average out over time and are generally small relative to overall portfolio value.
- **Why**: Intraday/minute-level stock and crypto data is expensive and not available in free data sources.
- **Acceptable for**: Class projects, educational analysis, long-term portfolio tracking.

#### 2. Options Not Valued

- **Issue**: Option positions are tracked in the units series but are valued at $0 due to lack of historical option pricing data.
- **Impact**: Portfolio values will be **understated** if options are held. The exact understatement depends on the value of option positions.
- **Why**: Historical option pricing data is prohibitively expensive for academic projects.
- **Detection**: The system will log warnings when option positions are detected (e.g., `⚠️ Option position detected but not valued: AAPL 240119C00150000`).
- **Acceptable for**: Class projects where options are not the primary focus, or where the limitation is clearly documented.

#### 3. No Intraday Data

- **Issue**: Trades executed during the day are valued using the day's closing price, not the actual execution price.
- **Impact**: Small daily discrepancies between cash flows and security valuations on trade days. These typically resolve within 1-2 days as prices adjust.
- **Why**: Minute-level data requires expensive data subscriptions.
- **Acceptable for**: Educational projects, portfolio analysis where daily-level accuracy is sufficient.

### Academic Project Scope

This implementation is designed for **educational purposes** and uses freely available daily market data. The limitations above are inherent to using free data sources and are acceptable for class projects when properly documented.

**For production use**, consider:

- Integrating real-time option pricing (e.g., via broker APIs or paid data services)
- Using trade execution prices instead of closing prices (requires intraday data)
- Implementing more sophisticated valuation models
- Validating portfolio values against broker-reported balances

### Data Quality

The system includes built-in warnings for:

- Option positions detected but not valued
- Missing prices for symbols (logged as debug messages)
- Symbols with zero value (may indicate missing price data)

When running the pipeline, check console output for warnings about options or missing prices.

## Error Handling

All functions include proper error handling. The main `timeseries.js` script uses the shared error handling utilities to ensure database cleanup on errors.

## Performance

- Database connections are pooled and reused
- Price history checks existing data before fetching
- Batch operations are used for database writes
- Rate limiting is handled by the Yahoo Finance client
- Cash series processing is optimized for chronological order

## Complete Pipeline Example

Here's a complete example that runs all steps:

```javascript
import { getAllAccountIds } from "./functions/getAccountIds.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import { getActivityDateRange } from "./functions/getActivityDateRange.js";
import { getActivitySymbols } from "./functions/getActivitySymbols.js";
import { normalizeCryptoSymbols } from "./functions/normalizeCryptoSymbols.js";
import { fetchPriceHistory } from "./functions/fetchPriceHistory.js";
import { buildDailyCashSeries } from "./functions/buildDailyCashSeries.js";

// Step 1: Get all account IDs
const accountIds = await getAllAccountIds();

// Step 2: Sync activities for all accounts
for (const accountId of accountIds) {
  await getAccountActivities({ accountId });
}

// Step 3: Get date range
const dateRange = await getActivityDateRange();

// Step 4: Get all symbols
const symbols = await getActivitySymbols();

// Step 5: Normalize crypto symbols
const normalizedSymbols = await normalizeCryptoSymbols({ symbols });

// Step 6: Fetch price history
const priceResult = await fetchPriceHistory();

// Step 7: Build cash series for each account
for (const accountId of accountIds) {
  const activities = await getAccountActivities({ accountId });
  const cashSeries = await buildDailyCashSeries({
    activities,
    baseCurrency: "USD",
  });
  console.log(`Account ${accountId}: ${cashSeries.length} days of cash data`);
}

// Step 8: Build units series for each account
for (const accountId of accountIds) {
  const activities = await getAccountActivities({ accountId });
  const unitsSeries = buildDailyUnitsSeries({
    activities,
  });
  console.log(`Account ${accountId}: ${unitsSeries.length} days of units data`);
  // Access positions for a specific date:
  // const positions = unitsSeries.find(s => s.date === '2020-03-17')?.positions;
}

// Optional Step 9: Build securities values series
for (const accountId of accountIds) {
  const activities = await getAccountActivities({ accountId });
  const unitsSeries = buildDailyUnitsSeries({ activities });
  const securitiesValueSeries = await buildDailySecurityValuesSeries({
    unitsSeries,
    databaseUrl: process.env.DATABASE_URL,
  });
  console.log(
    `Account ${accountId}: ${securitiesValueSeries.length} days of securities values`
  );
}

// Optional Step 10: Build portfolio series
for (const accountId of accountIds) {
  const activities = await getAccountActivities({ accountId });
  const cashSeries = await buildDailyCashSeries({
    activities,
    baseCurrency: "USD",
  });
  const unitsSeries = buildDailyUnitsSeries({ activities });
  const securitiesValueSeries = await buildDailySecurityValuesSeries({
    unitsSeries,
    databaseUrl: process.env.DATABASE_URL,
  });
  const portfolioSeries = buildDailyPortfolioSeries({
    cashSeries,
    securitiesValueSeries,
    includeDailyReturn: true,
  });
  console.log(
    `Account ${accountId}: ${portfolioSeries.length} days of portfolio data`
  );
  // Access portfolio value for a specific date:
  // const portfolio = portfolioSeries.find(s => s.date === '2020-03-17');
  // console.log(`Portfolio value: ${portfolio.portfolioValue}`);
}
```
