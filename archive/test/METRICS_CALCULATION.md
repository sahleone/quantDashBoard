# Portfolio Metrics Calculation Guide

This document outlines how to calculate portfolio metrics using SnapTrade API endpoints and the existing portfolio timeseries data.

## Table of Contents

1. [Portfolio Snapshot Metrics](#1-portfolio-snapshot-metrics)
2. [Returns & Performance Metrics](#2-returns--performance-metrics)
3. [Risk-Adjusted Performance Metrics](#3-risk-adjusted-performance-metrics)
4. [Risk & Drawdown Metrics](#4-risk--drawdown-metrics)
5. [Diversification & Correlation Metrics](#5-diversification--correlation-metrics)
6. [Function Organization](#function-organization)
7. [SnapTrade Endpoints Reference](#snaptrade-endpoints-reference)

---

## 1. Portfolio Snapshot Metrics

### 1.1 Assets Under Management (AUM)

**Data Sources:**

- **SnapTrade API**: `GET /api/v1/accounts/{accountId}/balances`
- **SnapTrade API**: `GET /api/v1/accounts/{accountId}/positions`
- **Alternative**: Latest `portfolioValue` from portfolio timeseries

**Calculation Approach:**

1. **Fetch balances from SnapTrade**:

   ```javascript
   const balances = await accountService.listAccountBalances(
     userId,
     userSecret,
     accountId
   );
   // Returns: [{ currency: { code: "USD" }, cash: 300.71, buying_power: 410.71 }, ...]
   ```

2. **Fetch positions from SnapTrade**:

   ```javascript
   const positions = await accountService.listAccountPositions(
     userId,
     userSecret,
     accountId
   );
   // Returns: [{ symbol: {...}, units: 40, price: 113.15, currency: {...} }, ...]
   ```

3. **Calculate AUM**:
   - Sum all cash balances (convert to base currency if multi-currency)
   - Sum all position values: `value_i = units_i × price_i`
   - **AUM = Total Cash + Total Securities Value**

**Function Signature:**

```javascript
async function calculateAUMFromSnapTrade(userId, userSecret, accountId, baseCurrency = "USD")
// Returns: { aum: number, cash: number, securitiesValue: number, breakdown: {...} }
```

**Edge Cases:**

- Handle multi-currency accounts (convert or track separately)
- Handle null/undefined values in balances and positions
- Account for cash equivalents (money market funds counted in both cash and positions)

---

### 1.2 Asset Allocation & Diversification

**Data Sources:**

- **SnapTrade API**: `GET /api/v1/accounts/{accountId}/positions` (equity positions)
- **SnapTrade API**: `GET /api/v1/accounts/{accountId}/options` (option positions)
- **SnapTrade API**: `GET /api/v1/accounts/{accountId}/balances` (cash)

**Calculation Approach:**

1. **Fetch all positions**:

   ```javascript
   const equityPositions = await accountService.listAccountPositions(
     userId,
     userSecret,
     accountId
   );
   const optionPositions = await optionsService.listOptionHoldings(
     userId,
     userSecret,
     accountId
   );
   const balances = await accountService.listAccountBalances(
     userId,
     userSecret,
     accountId
   );
   ```

2. **Calculate position values**:

   - For each equity position: `value_i = units_i × price_i`
   - For each option position: `value_i = units_i × price_i` (or mark-to-market value)
   - Cash: Sum of all cash balances

3. **Calculate total portfolio value**:

   - `totalValue = sum(all position values) + cash`

4. **Calculate weights**:

   - For each position: `w_i = value_i / totalValue`

5. **Calculate HHI (Herfindahl-Hirschman Index)**:

   - `HHI = Σ(w_i²)` for all positions

6. **Calculate Diversification Score**:
   - `DiversificationScore = 1 - HHI`

**Function Signature:**

```javascript
async function calculateAssetAllocation(userId, userSecret, accountId, options = {})
// Options: { groupBy: 'symbol' | 'assetClass' | 'sector', includeCash: true }
// Returns: {
//   allocation: [{ symbol, value, weight, percentage }],
//   hhi: number,
//   diversificationScore: number,
//   totalValue: number
// }
```

**Visualization: Pie Chart**

- **Data Format**: `[{ symbol: "AAPL", value: 5000, weight: 0.25, percentage: 25, color: "#FF6384" }, ...]`
- **Grouping Options**:
  - By individual symbol (default)
  - By asset class (equity, options, bonds, crypto)
  - By sector/industry (requires additional data from Yahoo Finance)
- **Chart Library**: Chart.js, Recharts, or D3.js
- **Display**: Show symbol name, value, and percentage on each slice

**Edge Cases:**

- Handle positions with zero or null prices
- Aggregate positions with same symbol across multiple accounts
- Handle options with complex pricing (use mark-to-market if available)

---

### 1.3 Income: Dividends & Interest

**Data Source:**

- **SnapTrade API**: `GET /api/v1/accounts/{accountId}/activities`
  - Filter by `type`: `DIVIDEND`, `INTEREST`, `STOCK_DIVIDEND`

**Calculation Approach:**

1. **Fetch activities filtered by type and date range**:

   ```javascript
   const dividendActivities = await accountService.listAllAccountActivities(
     userId,
     userSecret,
     accountId,
     1000, // limit
     startDate, // YYYY-MM-DD
     endDate, // YYYY-MM-DD
     "DIVIDEND,STOCK_DIVIDEND" // types
   );

   const interestActivities = await accountService.listAllAccountActivities(
     userId,
     userSecret,
     accountId,
     1000,
     startDate,
     endDate,
     "INTEREST"
   );
   ```

2. **Sum amounts**:

   - `dividendIncome = sum(dividendActivities.map(a => a.amount))`
   - `interestIncome = sum(interestActivities.map(a => a.amount))`
   - `totalIncome = dividendIncome + interestIncome`

3. **Calculate yields**:

   - Get average portfolio value over period from portfolio timeseries
   - `avgPortfolioValue = average(portfolioSeries.map(p => p.portfolioValue))`
   - `dividendYield = dividendIncome / avgPortfolioValue`
   - `interestYield = interestIncome / avgPortfolioValue`
   - `totalIncomeYield = totalIncome / avgPortfolioValue`

4. **Group by time period** (for visualization):
   - Monthly: Group activities by month
   - Quarterly: Group activities by quarter
   - Yearly: Group activities by year

**Function Signature:**

```javascript
async function calculateIncomeMetrics(userId, userSecret, accountId, startDate, endDate, options = {})
// Options: { groupBy: 'month' | 'quarter' | 'year', includeYields: true }
// Returns: {
//   total: { dividends: number, interest: number, total: number },
//   yields: { dividendYield: number, interestYield: number, totalYield: number },
//   byPeriod: [{ period: "2024-01", dividends: 100, interest: 50, total: 150 }, ...]
// }
```

**Visualization: Bar Chart**

- **Data Format**:
  ```javascript
  {
    monthly: [
      { period: "2024-01", dividends: 100, interest: 50, total: 150 },
      { period: "2024-02", dividends: 120, interest: 45, total: 165 },
      ...
    ],
    totals: { dividends: 1200, interest: 500, total: 1700 }
  }
  ```
- **Chart Type**: Grouped or stacked bar chart
- **X-axis**: Time periods (monthly, quarterly, yearly)
- **Y-axis**: Income amount (currency)
- **Series**: Dividends, Interest, Total (stacked or grouped)
- **Display**: Show values on bars, legend for series types

**Edge Cases:**

- Handle activities with null/undefined amounts
- Filter out fees (negative amounts) if needed
- Handle multi-currency activities (convert to base currency)
- Account for stock dividends (non-cash) separately if needed

---

## 2. Returns & Performance Metrics

**Note**: These metrics use portfolio timeseries data (not SnapTrade API directly)

### 2.1 Point-to-Point Returns / ROI

**Data Source**: Portfolio series from `buildDailyPortfolioSeries`

**Calculation Approach:**

1. **Filter portfolio series by date range**:

   - 1M: Last 30 days
   - 3M: Last 90 days
   - YTD: From Jan 1 to today
   - 1Y: Last 365 days
   - ITD: From first portfolio value to today

2. **Get start and end values**:

   - `V_start = portfolioSeries[0].portfolioValue`
   - `V_end = portfolioSeries[last].portfolioValue`

3. **Calculate return**:

   - `R = (V_end / V_start) - 1`

4. **Alternative using daily returns**:
   - `R = Π(1 + dailyReturn_t) - 1` for all days in period

**Function Signature:**

```javascript
function calculatePointToPointReturn(portfolioSeries, period = "ITD")
// Period: "1M" | "3M" | "YTD" | "1Y" | "ITD"
// Returns: { return: number, startValue: number, endValue: number, startDate: string, endDate: string }
```

---

### 2.2 Annualized Return (CAGR)

**Input**: Start value, end value, time period

**Calculation:**

1. Calculate years: `Y = (endDate - startDate) / 365.25`
2. CAGR: `(V_end / V_start)^(1/Y) - 1`
3. **Alternative for daily data**:
   - `CAGR = (Π(1 + r_t))^(252/T) - 1` where T = number of trading days

**Function Signature:**

```javascript
function calculateCAGR(startValue, endValue, startDate, endDate)
// Returns: { cagr: number, years: number }
```

---

### 2.3 Time-Weighted Return (TWR) (Optional)

**Approach:**

1. Identify cash flow dates from activities
2. Split period into subperiods (between cash flows)
3. For each subperiod: `R_k = (V_k / V_{k-1}) - 1`
4. Compound: `TWR = Π(1 + R_k) - 1`

**Function Signature:**

```javascript
async function calculateTWR(portfolioSeries, activities, startDate, endDate)
// Returns: { twr: number, twrAnnualized: number, subperiods: [...] }
```

---

## 3. Risk-Adjusted Performance Metrics

**Data Source**: Portfolio series with `dailyReturn` array

### 3.1 Sharpe Ratio

**Input**: Array of daily returns, risk-free rate (default 0, annual rate)

**Calculation:**

1. Mean return: `mean_r = average(dailyReturns)` (daily)
2. Standard deviation: `std_r = std(dailyReturns)` (daily)
3. Risk-free rate: `R_f = 0` (annual rate, or fetch from Treasury rates)
4. Annualize components separately:
   - Annualized return: `annualizedReturn = mean_r * 252`
   - Annualized volatility: `annualizedVol = std_r * √252`
5. Sharpe: `(annualizedReturn - R_f) / annualizedVol`
   - Expanded: `(mean_r * 252 - R_f) / (std_r * √252)`
   - **Important**: Both numerator and denominator must be annualized separately before dividing
   - Or equivalently: `(mean_r - R_f/252) * √252 / std_r`

**Function Signature:**

```javascript
function calculateSharpeRatio(dailyReturns, riskFreeRate = 0, annualized = true)
// riskFreeRate: Annual risk-free rate (e.g., 0.05 for 5%)
// Returns: { sharpe: number, meanReturn: number, stdDev: number, annualizedReturn: number, annualizedVol: number }
```

---

### 3.2 Sortino Ratio

**Input**: Array of daily returns, MAR (Minimum Acceptable Return, default 0, annual rate)

**Calculation:**

1. Mean return: `mean_r = average(dailyReturns)` (daily)
2. Filter returns below MAR: `downsideReturns = returns.filter(r => r < MAR/252)` (MAR converted to daily)
3. Calculate downside deviation: `std_down = std(downsideReturns.map(r => r - MAR/252))` (daily)
4. Annualize components separately:
   - Annualized return: `annualizedReturn = mean_r * 252`
   - Annualized downside deviation: `annualizedDownsideDev = std_down * √252`
5. Sortino: `(annualizedReturn - MAR) / annualizedDownsideDev`
   - Expanded: `(mean_r * 252 - MAR) / (std_down * √252)`
   - **Important**: Both numerator and denominator must be annualized separately before dividing
   - Or equivalently: `(mean_r - MAR/252) * √252 / std_down`

**Function Signature:**

```javascript
function calculateSortinoRatio(dailyReturns, mar = 0, annualized = true)
// mar: Annual Minimum Acceptable Return (e.g., 0.05 for 5%)
// Returns: { sortino: number, meanReturn: number, downsideDeviation: number, annualizedReturn: number, annualizedDownsideDev: number }
```

---

### 3.3 Return / Max Drawdown

**Input**: Period return (from 2.1) and Max Drawdown (from 4.3)

**Calculation**: `Return / |MaxDD|`

**Function Signature:**

```javascript
function calculateReturnOverMaxDD(periodReturn, maxDrawdown)
// Returns: { ratio: number, return: number, maxDrawdown: number }
```

---

## 4. Risk & Drawdown Metrics

### 4.1 Volatility

**Input**: Array of daily returns

**Calculation**: `std(dailyReturns) * √252` (annualized)

**Function Signature:**

```javascript
function calculateVolatility(dailyReturns, annualized = true)
// Returns: { volatility: number, periodVolatility: number }
```

---

### 4.2 Beta

**Input**: Portfolio returns + benchmark returns (S&P 500)

**Calculation:**

1. Align arrays by date
2. Covariance: `Cov(r_p, r_m)`
3. Variance: `Var(r_m)`
4. Beta: `Cov(r_p, r_m) / Var(r_m)`

**Benchmark Data**: Fetch S&P 500 daily returns from Yahoo Finance or data provider

**Function Signature:**

```javascript
async function calculateBeta(portfolioReturns, benchmarkReturns, dates)
// Returns: { beta: number, correlation: number, alpha: number }
```

---

### 4.3 Drawdown Metrics

**Input**: Portfolio series with `portfolioValue`

**Calculation:**

1. Build equity curve: `equityIndex = portfolioSeries.map(p => p.portfolioValue)`
2. Calculate running peak: `peak[t] = max(equityIndex[0..t])`
3. Calculate drawdown: `DD[t] = (equityIndex[t] - peak[t]) / peak[t]`
4. Max Drawdown: `min(DD)` (most negative value)

**Function Signature:**

```javascript
function calculateMaxDrawdown(portfolioSeries)
// Returns: { maxDrawdown: number, maxDrawdownDate: string, drawdownSeries: [...] }
```

---

### 4.4 Tail Risk: VaR & CVaR

**Input**: Array of daily returns

**Historical VaR (95%):**

1. Convert to losses: `losses = returns.map(r => -r)`
2. Sort ascending
3. VaR = 95th percentile (or appropriate quantile)

**CVaR:**

1. Average of all losses >= VaR threshold

**Function Signature:**

```javascript
function calculateVaRAndCVaR(dailyReturns, confidenceLevel = 0.95)
// Returns: { var: number, cvar: number, confidenceLevel: number }
```

---

## 5. Diversification & Correlation Metrics

### 5.1 Correlation

**Input**: Two return series (e.g., portfolio vs benchmark, or two securities)

**Calculation**: Pearson correlation coefficient

- Formula: `Cov(X, Y) / (σ_X * σ_Y)`

**Function Signature:**

```javascript
function calculateCorrelation(returnsX, returnsY)
// Returns: { correlation: number, pValue: number }
```

---

### 5.2 Cointegration (Advanced)

**Input**: Two price series

**Approach:**

1. OLS regression: `P1_t = α + β * P2_t + ε_t`
2. Test residuals for stationarity (ADF test)
3. If stationary, calculate spread: `S_t = ε_t`
4. Standardize: `z_t = (S_t - mean(S)) / std(S)`

**Function Signature:**

```javascript
async function calculateCointegration(priceSeries1, priceSeries2)
// Returns: { isCointegrated: boolean, spread: [...], zScore: [...] }
```

---

## Function Organization

### Recommended Structure

```
archive/test/functions/metrics/
├── snapshotMetrics.js
│   ├── calculateAUMFromSnapTrade()
│   ├── calculateAssetAllocation()
│   └── calculateDiversification()
│
├── incomeMetrics.js
│   ├── calculateDividendIncome()
│   ├── calculateInterestIncome()
│   ├── calculateTotalIncome()
│   └── calculateIncomeYield()
│
├── returnsMetrics.js
│   ├── calculatePointToPointReturn()
│   ├── calculateCAGR()
│   └── calculateTWR()
│
├── riskMetrics.js
│   ├── calculateVolatility()
│   ├── calculateBeta()
│   ├── calculateMaxDrawdown()
│   └── calculateVaRAndCVaR()
│
├── riskAdjustedMetrics.js
│   ├── calculateSharpeRatio()
│   ├── calculateSortinoRatio()
│   └── calculateReturnOverMaxDD()
│
└── correlationMetrics.js
    ├── calculateCorrelation()
    └── calculateCointegration()
```

---

## SnapTrade Endpoints Reference

### Account Information Endpoints

| Endpoint                                  | Method | Client Method                               | Use Case                                |
| ----------------------------------------- | ------ | ------------------------------------------- | --------------------------------------- |
| `/api/v1/accounts/{accountId}/balances`   | GET    | `accountService.listAccountBalances()`      | AUM calculation, cash balance           |
| `/api/v1/accounts/{accountId}/positions`  | GET    | `accountService.listAccountPositions()`     | Asset allocation, portfolio composition |
| `/api/v1/accounts/{accountId}/holdings`   | GET    | `accountService.listAccountHoldings()`      | Alternative to positions                |
| `/api/v1/accounts/{accountId}/activities` | GET    | `accountService.listAllAccountActivities()` | Income metrics (dividends, interest)    |
| `/api/v1/accounts/{accountId}`            | GET    | `accountService.getAccountDetails()`        | Account metadata                        |
| `/api/v1/accounts/{accountId}/orders`     | GET    | `accountService.listAccountOrders()`        | Trade analysis, turnover                |

### Options Endpoints

| Endpoint                               | Method | Client Method                         | Use Case                                  |
| -------------------------------------- | ------ | ------------------------------------- | ----------------------------------------- |
| `/api/v1/accounts/{accountId}/options` | GET    | `optionsService.listOptionHoldings()` | Options allocation, portfolio composition |
| `/api/v1/options/chain`                | GET    | `optionsService.getOptionsChain()`    | Options pricing, Greeks analysis          |

### Data Characteristics

**Real-time vs Cached:**

- SnapTrade balances/positions can be real-time or cached (depends on API key tier)
- Check data freshness before using for metrics
- Consider caching strategy for frequent calculations

**Multi-Currency:**

- Balances endpoint returns array (one per currency)
- Convert all to base currency (USD) for unified calculations
- Track currency exposure separately if needed

**Pagination:**

- Activities endpoint supports pagination (use `listAllAccountActivities` helper)
- Default limit: 1000 activities per page
- Activities can be filtered by type and date range

---

## Implementation Notes

### Error Handling

- Handle missing data gracefully (null balances, empty positions)
- Account for disabled connections (may return cached data)
- Retry logic for rate limits (425 errors)
- Validate date ranges before API calls

### Performance Considerations

- Cache SnapTrade API responses when appropriate
- Batch requests for multiple accounts
- Use portfolio timeseries for historical data (faster than API)
- Consider async/await for parallel API calls

### Data Aggregation

- For multi-account users: aggregate across all accounts
- Combine equity positions + options positions for complete allocation
- Sum activities across accounts for income metrics
- Align dates when combining multiple data sources

### Visualization Requirements

1. **Asset Allocation (1.2) - Pie Chart**:

   - Group by symbol, asset class, or sector
   - Show percentages and values
   - Use distinct colors for each segment

2. **Income Metrics (1.3) - Bar Chart**:
   - Grouped or stacked bars
   - Monthly/quarterly/yearly periods
   - Separate series for dividends, interest, total

---

## Database Storage Structure

### Collection Name

- **Collection**: `snaptrademetrics` (MongoDB)
- **Model**: `Metrics.js` (Mongoose schema)

### Schema Structure

Metrics are stored with the following structure:

```javascript
{
  // Identifiers (indexed)
  userId: String,           // User identifier (indexed)
  accountId: String,        // Account identifier (required, indexed)
  date: Date,              // As-of date for metrics (indexed)
  period: String,          // Period type: "1M", "3M", "YTD", "1Y", "ITD" (indexed, enum)

  // Metrics object (nested)
  metrics: {
    // Portfolio Snapshot
    aum: Number,                    // Assets Under Management
    hhi: Number,                    // Herfindahl-Hirschman Index
    diversificationScore: Number,   // 1 - HHI
    dividendIncome: Number,         // Total dividend income
    interestIncome: Number,         // Total interest income
    totalIncomeYield: Number,       // (dividend + interest) / avg portfolio value

    // Returns & Performance
    totalReturn: Number,            // Point-to-point return
    cagr: Number,               // Annualized return (CAGR)
    nav: Number,                   // Net Asset Value (latest total value)

    // Risk Metrics
    volatility: Number,             // Annualized volatility
    maxDrawdown: Number,            // Maximum drawdown
    beta: Number,                   // Beta vs benchmark (SPY)
    var95: Number,                  // Value at Risk (95% confidence)
    cvar95: Number,                 // Conditional VaR (95% confidence)

    // Risk-Adjusted Performance
    sharpe: Number,                 // Sharpe ratio
    sortino: Number                 // Sortino ratio
  },

  // Metadata
  computedAtUtc: Date,              // When metrics were calculated
  createdAt: Date                   // Document creation timestamp
}
```

### Indexes

1. **Primary compound index** (unique):

   ```javascript
   { userId: 1, accountId: 1, date: 1, period: 1 }
   ```

   - Ensures one metrics record per user/account/date/period combination
   - Enables efficient queries by these fields

2. **Backward compatibility index**:
   ```javascript
   { asOfDate: 1, accountId: 1 }
   ```

### Storage Pattern

Each metrics document represents:

- **One account** (`accountId`)
- **One user** (`userId`)
- **One date** (`date` - as-of date, typically today)
- **One period** (`period` - 1M, 3M, YTD, 1Y, or ITD)

**Example Document:**

```javascript
{
  userId: "user123",
  accountId: "account456",
  date: ISODate("2025-01-27T23:59:59.999Z"),
  period: "1Y",
  metrics: {
    aum: 100000,
    totalReturn: 0.15,
    cagr: 0.14,
    volatility: 0.18,
    sharpe: 1.2,
    sortino: 1.5,
    maxDrawdown: -0.12,
    beta: 0.95,
    hhi: 0.35,
    diversificationScore: 0.65,
    dividendIncome: 2000,
    interestIncome: 500,
    totalIncomeYield: 0.025,
    var95: -0.03,
    cvar95: -0.045,
    nav: 115000
  },
  computedAtUtc: ISODate("2025-01-27T10:30:00.000Z"),
  createdAt: ISODate("2025-01-27T10:30:00.000Z")
}
```

### Storage Process

From `calculateMetrics.js`:

1. **For each account** in `PortfolioTimeseries`:
   - For each period (`1M`, `3M`, `YTD`, `1Y`, `ITD`):
     - Calculate metrics from portfolio timeseries and activities
     - Store using `updateOne` with `upsert: true`:
       ```javascript
       await metricsCollection.updateOne(
         {
           userId: acctUserId,
           accountId: acctId,
           date: asOfDate,
           period: period,
         },
         {
           $set: {
             userId: acctUserId,
             accountId: acctId,
             date: asOfDate,
             period: period,
             metrics: metrics,
             computedAtUtc: new Date(),
             createdAt: new Date(),
           },
         },
         { upsert: true }
       );
       ```

### Querying Metrics

**Get metrics for a specific account and period:**

```javascript
const metrics = await Metrics.findOne({
  userId: "user123",
  accountId: "account456",
  date: asOfDate,
  period: "1Y",
});
```

**Get all periods for an account:**

```javascript
const allPeriods = await Metrics.find({
  userId: "user123",
  accountId: "account456",
  date: asOfDate,
});
```

**Get latest metrics (most recent date):**

```javascript
const latest = await Metrics.findOne({
  userId: "user123",
  accountId: "account456",
  period: "1Y",
}).sort({ date: -1 });
```

**Get metrics for all accounts of a user:**

```javascript
const userMetrics = await Metrics.find({
  userId: "user123",
  date: asOfDate,
  period: "1Y",
});
```

### Key Points

1. **One document per account/period/date combination** - prevents duplicates
2. **Metrics are nested** in a `metrics` object for organization
3. **All metric values can be `null`** if not calculable
4. **`date` is the as-of date** (typically today or calculation date)
5. **`period` defines the lookback window** for calculations
6. **Upsert pattern** - recalculates and updates existing records

### Storage Considerations

- **Null Handling**: All metrics fields default to `null` if calculation fails or data is insufficient
- **Date Precision**: `date` field stores full timestamp but typically represents end-of-day
- **Period Enum**: Only valid periods are stored (`1M`, `3M`, `YTD`, `1Y`, `ITD`)
- **Computation Tracking**: `computedAtUtc` tracks when metrics were last calculated
- **Backward Compatibility**: Old schema fields exist but new code should use `metrics` object

---

## References

- [SnapTrade Balances API](https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getUserAccountBalance)
- [SnapTrade Positions API](https://docs.snaptrade.com/reference/Account%20Information/AccountInformation_getUserAccountPositions)
- [SnapTrade Options Holdings API](https://docs.snaptrade.com/reference/Options/Options_listOptionHoldings)
- [Metrics.md](../metrics/Metrics.md) - Complete mathematical formulas
- [README.md](./README.md) - Test folder documentation

---

**Last Updated**: 2025-01-27
