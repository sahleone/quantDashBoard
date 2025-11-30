# Missing Steps for Metrics Calculation

## Overview

This document outlines the missing steps needed to calculate the portfolio metrics required by the app. The current implementation has completed the data extraction and position tracking phases, but is missing the valuation, returns calculation, and metrics computation phases.

## Current Status

### ✅ Implemented

1. **Step 1: Fetch Activities** (`updateActivitiesTable.js`)

   - Fetches account activities from SnapTrade API
   - Stores in `snaptradeaccountactivities` collection
   - Handles incremental updates

2. **Steps 2-6: Build Positions Timeseries** (`updateEquitiesWeightTable.js`)
   - Processes activities to build daily position snapshots
   - Stores in `equitiesweighttimeseries` collection
   - Tracks signed units per symbol per day per account

### ⏳ Missing Steps

## Step 7: Price Enrichment

**Purpose:** Fetch daily close prices for all symbols in `EquitiesWeightTimeseries` to enable portfolio valuation.

**What's Needed:**

- Script: `updatePriceData.js` (or similar)
- Function: Fetch historical daily close prices for all unique symbols across all dates
- Data Source Options:
  - Alpha Vantage API (already integrated via `alphavantageProxy.js`)
  - Yahoo Finance (via yfinance or similar)
  - Financial Modeling Prep API
- Storage: New collection `PriceHistory` or `DailyPrices` with schema:
  ```javascript
  {
    symbol: String,
    date: Date,
    close: Number,
    open: Number,  // optional
    high: Number,  // optional
    low: Number,   // optional
    volume: Number // optional
  }
  ```
- Index: `{ symbol: 1, date: 1 }` (unique)
- Logic:
  - Query `EquitiesWeightTimeseries` to get all unique `(symbol, date)` pairs
  - For each symbol, determine date range needed
  - Fetch prices from API (with rate limiting and caching)
  - Handle missing data (forward fill, mark as degraded, or skip)
  - Upsert into price collection

**Dependencies:**

- API keys for price data providers
- Rate limiting logic to avoid API throttling
- Caching strategy to avoid redundant API calls

**Reference Implementation:**

- See `returnsTest/activities.py` lines 100-200 for Python reference
- The Python code uses `yfinance` to fetch prices

---

## Step 8: Valuation and Cash Series

**Purpose:** Calculate daily portfolio values (stock value + cash value) and track cash flows.

**What's Needed:**

- Script: `updatePortfolioTimeseries.js` (or similar)
- Function: Build portfolio valuation timeseries from positions and prices
- Input Data:
  - `EquitiesWeightTimeseries`: positions (units per symbol per day)
  - `PriceHistory`: daily prices per symbol
  - `AccountActivities`: cash flows (DIVIDEND, INTEREST, CONTRIBUTION, WITHDRAWAL, FEE)
- Output: New collection `PortfolioTimeseries` with schema:
  ```javascript
  {
    userId: String,
    accountId: String,
    date: Date,
    stockValue: Number,        // sum of (units * price) for all positions
    cashValue: Number,          // cash balance (from activities)
    totalValue: Number,          // stockValue + cashValue
    depositWithdrawal: Number,   // net external flow for this day
    externalFlowCumulative: Number, // cumulative external flows
    // Optional: breakdown by symbol
    positions: [{
      symbol: String,
      units: Number,
      price: Number,
      value: Number
    }]
  }
  ```
- Index: `{ userId: 1, accountId: 1, date: 1 }` (unique)

**Calculation Logic:**

1. **Stock Value per Day:**

   - For each date, query `EquitiesWeightTimeseries` for all positions
   - Join with `PriceHistory` to get prices
   - Calculate: `stockValue = sum(units * price)` for all symbols
   - Handle missing prices (forward fill last known price, or mark as degraded)

2. **Cash Value per Day:**

   - Process activities of type: `DIVIDEND`, `INTEREST`, `CONTRIBUTION`, `WITHDRAWAL`, `FEE`
   - Build cash flow series: start with initial balance (if available) or 0
   - For each day: `cashValue[t] = cashValue[t-1] + dividends + interest - fees + contributions - withdrawals`
   - Handle multiple accounts separately

3. **External Flows:**
   - Track `CONTRIBUTION` and `WITHDRAWAL` activities
   - `depositWithdrawal[t] = contributions[t] - withdrawals[t]`
   - `externalFlowCumulative[t] = cumulative sum of depositWithdrawal`

**Reference Implementation:**

- See `returnsTest/activities.py` function `build_cash_and_flows()` (lines 242-300)
- See `returnsTest/activities.py` function `build_portfolio_timeseries()` (lines 307-401)

---

## Step 9: Flow-Adjusted Returns and Indices

**Purpose:** Calculate daily returns that account for cash flows, and build cumulative return indices.

**What's Needed:**

- Extend `updatePortfolioTimeseries.js` to calculate returns
- Add fields to `PortfolioTimeseries`:
  ```javascript
  {
    // ... existing fields ...
    simpleReturns: Number,      // flow-adjusted daily return
    cumReturn: Number,          // cumulative return (per active segment)
    equityIndex: Number          // normalized equity curve (starts at 1 per segment)
  }
  ```

**Calculation Logic:**

1. **Simple Returns (Flow-Adjusted):**

   ```
   simpleReturns[t] = (totalValue[t] - (totalValue[t-1] + depositWithdrawal[t])) / (totalValue[t-1] + depositWithdrawal[t])
   ```

   - This accounts for deposits/withdrawals in the denominator
   - If denominator <= 0, set return to 0

2. **Active Segments:**

   - Identify periods where portfolio has non-trivial value (`totalValue > threshold`, e.g., 1e-3)
   - Each "alive" segment starts when value goes from 0 to > threshold
   - Dead periods (value = 0) are handled separately

3. **Cumulative Return:**

   - For each alive segment separately:
     - Start with `cumReturn = 0` at segment start
     - Compound: `cumReturn[t] = (1 + simpleReturns[t]) * (1 + cumReturn[t-1]) - 1`
   - For dead periods: carry last value forward (or set to 0)

4. **Equity Index:**
   - For each alive segment separately:
     - Start with `equityIndex = 1` at segment start
     - Compound: `equityIndex[t] = (1 + simpleReturns[t]) * equityIndex[t-1]`
   - For dead periods: set to `NaN` (so charts show gaps)

**Reference Implementation:**

- See `returnsTest/activities.py` function `build_portfolio_timeseries()` lines 345-398

---

## Step 10: Metrics Calculation and Persistence

**Purpose:** Calculate all metrics defined in `Metrics.md` and store them for quick retrieval.

**What's Needed:**

- Script: `calculateMetrics.js` (or similar)
- Function: Calculate metrics from `PortfolioTimeseries` and store in `Metrics` collection
- Update `metricsController.js` to use calculated metrics instead of placeholders

**Metrics to Calculate:**

### 1. Portfolio Snapshot Metrics

- **AUM**: Current `totalValue` from latest `PortfolioTimeseries` entry
- **Asset Allocation**: Calculate weights `w_i = value_i / totalValue` for each symbol
- **HHI (Herfindahl-Hirschman Index)**: `HHI = sum(w_i^2)`
- **Diversification Score**: `1 - HHI`
- **Dividend Income**: Sum of `DIVIDEND` activities over period
- **Interest Income**: Sum of `INTEREST` activities over period
- **Total Income Yield**: `(DividendIncome + InterestIncome) / AveragePortfolioValue`

### 2. Returns & Performance Metrics

- **Point-to-Point Returns**:
  - `R = (V_T - V_0) / V_0` for different periods (1M, 3M, YTD, 1Y, ITD)
  - Or: `R = product(1 + r_t) - 1` using `simpleReturns` series
- **CAGR (Annualized Return)**:
  - `CAGR = (V_T / V_0)^(1/Y) - 1` where Y = years
  - Or: `CAGR = (product(1 + r_t))^(252/T) - 1` for daily data
- **Time-Weighted Return (TWR)**: (Optional)
  - Split period at cash flow dates
  - Calculate return for each subperiod
  - Compound: `TWR = product(1 + R_k) - 1`

### 3. Risk Metrics

- **Volatility**:
  - Calculate from `simpleReturns` series
  - `volatility = std(returns) * sqrt(252)` (annualized)
- **Beta**:
  - Need benchmark returns (e.g., SPY)
  - `beta = Cov(portfolio_returns, benchmark_returns) / Var(benchmark_returns)`
  - Requires fetching benchmark price data (Step 7)
- **Maximum Drawdown**:
  - From `equityIndex` or cumulative returns
  - `MaxDD = min((equityIndex[t] - peak[t]) / peak[t])`
  - Where `peak[t] = max(equityIndex[0:t])`
- **VaR (Value at Risk)**:
  - Historical: `VaR_95 = quantile(losses, 0.95)` where `losses = -returns`
  - Parametric: `VaR_95 = -(mean + z_0.95 * std)` where `z_0.95 ≈ 1.645`
- **CVaR (Conditional VaR)**:
  - `CVaR_95 = mean(losses | losses >= VaR_95)`

### 4. Risk-Adjusted Performance Metrics

- **Sharpe Ratio**:
  - `Sharpe = (mean_return - risk_free_rate) / volatility`
  - Annualized: `Sharpe = (mean_daily_return * 252 - R_f) / (volatility_daily * sqrt(252))`
- **Sortino Ratio**:
  - `Sortino = (mean_return - MAR) / downside_deviation`
  - `downside_deviation = sqrt(mean((returns < MAR)^2))`
  - MAR = Minimum Acceptable Return (often 0 or risk-free rate)
- **Return / Max Drawdown**:
  - `Return/MaxDD = Return_period / |MaxDD|`

### 5. Diversification Metrics

- **Correlation**:
  - Calculate correlation between portfolio returns and benchmark
  - Or correlation between individual positions (requires position-level returns)
- **Cointegration**: (Advanced, optional)
  - Test for cointegration between position pairs
  - Requires statistical tests (ADF test, etc.)

**Storage:**

- Store calculated metrics in `Metrics` collection (already exists)
- Schema should include:
  ```javascript
  {
    userId: String,
    accountId: String,  // or null for aggregate
    date: Date,        // as-of date for metrics
    period: String,    // "1M", "3M", "YTD", "1Y", "ITD"
    metrics: {
      aum: Number,
      totalReturn: Number,
      cagr: Number,
      volatility: Number,
      sharpe: Number,
      sortino: Number,
      maxDrawdown: Number,
      beta: Number,
      var95: Number,
      cvar95: Number,
      hhi: Number,
      diversificationScore: Number,
      dividendIncome: Number,
      interestIncome: Number,
      // ... etc
    }
  }
  ```

**Update metricsController.js:**

- Replace placeholder implementations with queries to `Metrics` collection
- Or calculate on-the-fly from `PortfolioTimeseries` if metrics not pre-computed
- Remove hardcoded values (e.g., `beta: 0.94`)

**Reference Implementation:**

- See `returnsTest/metrics.py` for Python reference
- See `Metrics.md` for all formula definitions

---

## Step 11: Post-Run Validation and Alerts

**Purpose:** Validate data quality and alert on issues.

**What's Needed:**

- Validation script: `validateMetrics.js` (or add to existing scripts)
- Checks:
  1. **AUM Sanity**: Portfolio value within expected range (not negative, not unreasonably large)
  2. **Missing Prices**: Count of symbols with missing price data
  3. **Data Gaps**: Identify date ranges with missing portfolio values
  4. **Return Outliers**: Flag returns > 100% or < -100% (may indicate data error)
  5. **Consistency**: Verify `totalValue = stockValue + cashValue` for all dates
  6. **Position Consistency**: Verify positions match activities (sum of signed units should match current position)
- Alerts:
  - Log warnings/errors
  - Optionally send notifications (email, Slack, etc.)
  - Store validation results in database

---

## Integration with Existing Code

### Current Issues

1. **metricsController.js uses wrong data source:**

   - Currently queries `AccountHoldings` which is a snapshot model
   - Should use `PortfolioTimeseries` for historical data
   - `AccountHoldings` appears to be current positions only, not timeseries

2. **Missing connection between EquitiesWeightTimeseries and metrics:**

   - `EquitiesWeightTimeseries` exists but isn't used by metrics calculations
   - Need to bridge: `EquitiesWeightTimeseries` → `PortfolioTimeseries` → `Metrics`

3. **Placeholder implementations:**
   - Beta calculation returns hardcoded `0.94`
   - Factor exposures return hardcoded values
   - Need real calculations

### Recommended Implementation Order

1. **Step 7: Price Enrichment** (prerequisite for valuation)
2. **Step 8: Valuation and Cash Series** (prerequisite for returns)
3. **Step 9: Returns and Indices** (prerequisite for metrics)
4. **Step 10: Metrics Calculation** (final step)
5. **Step 11: Validation** (ongoing)

### Cron Job Integration

Update the cron job (`quantDashBoard/server/cron_jobs/job.js`) to run:

1. `updateActivitiesTable.js` (existing)
2. `updateEquitiesWeightTable.js` (existing)
3. `updatePriceData.js` (new - Step 7)
4. `updatePortfolioTimeseries.js` (new - Steps 8-9)
5. `calculateMetrics.js` (new - Step 10)
6. `validateMetrics.js` (new - Step 11)

---

## Additional Considerations

### Performance Optimization

- **Batch Processing**: Process accounts in batches to avoid memory issues
- **Incremental Updates**: Only recalculate metrics for dates that changed
- **Caching**: Cache price data and calculated metrics
- **Indexing**: Ensure proper database indexes for efficient queries

### Error Handling

- **API Rate Limits**: Handle rate limiting for price data APIs
- **Missing Data**: Define strategy for handling missing prices (forward fill, skip, or mark as degraded)
- **Data Quality**: Handle edge cases (zero positions, zero values, etc.)

### Testing

- **Unit Tests**: Test each calculation function independently
- **Integration Tests**: Test end-to-end pipeline
- **Validation Tests**: Compare against known results (e.g., from Python implementation)

---

## Summary

The main missing pieces are:

1. **Price data fetching** (Step 7)
2. **Portfolio valuation** (Step 8)
3. **Returns calculation** (Step 9)
4. **Metrics computation** (Step 10)
5. **Validation** (Step 11)

Once these are implemented, the `metricsController.js` can be updated to use real calculated metrics instead of placeholders, and the frontend will be able to display accurate portfolio analytics.
