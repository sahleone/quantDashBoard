# Options Debug Summary

## Issue

Portfolio timeseries shows $84,954 total value, but options are not being included in the calculation, causing a discrepancy of approximately $80k.

## Root Causes

### 1. Options Not Extracted from Activities

**Location:** `archive/test/attempt.js:264`

- Symbol extraction only checks `activity.symbol` or `activity.symbolObj?.symbol`
- Does NOT check `activity.option_symbol`
- Result: Option activities (BUY/SELL) are ignored in units tracking

### 2. Option Symbols Skipped in Price Fetching

**Location:** `archive/test/attempt.js:471-473`

```javascript
// Skip symbols with spaces (likely options)
if (symbol.includes(" ")) {
  return { symbol, status: "skipped", reason: "contains space" };
}
```

- Option symbols typically have spaces (e.g., "AAPL 240119C00150000")
- These are skipped when fetching prices
- Result: No prices available for options

### 3. Options Not Included in Portfolio Valuation

**Location:** `archive/test/attempt.js:559-639` (`calculatePortfolioValue`)

- Only calculates value from `dayData.units` and `priceData`
- Options are never included
- Result: Portfolio value missing option positions

## Current State

- **Total options in database:** 0 (options are not being stored)
- **AccountBalances for max value date:** None found
- **AccountPositions for max value date:** None found
- **Positions array in PortfolioTimeseries:** Has 48 positions but all prices are `null`

## Solution Required

1. **Extract option symbols from activities:**

   - Check `activity.option_symbol` field
   - Use option ticker format (e.g., from `option_symbol.ticker`)

2. **Track option positions separately:**

   - Options need different valuation than stocks
   - Cannot use Yahoo Finance prices
   - Need to use SnapTrade options holdings endpoint or stored option data

3. **Include option values in portfolio calculation:**
   - Fetch option market values from SnapTrade API or database
   - Add option value to `securitiesValue` or create separate `optionsValue` field
   - Include in `totalValue = cashValue + stockValue + optionsValue`

## Next Steps

1. Modify symbol extraction to include `option_symbol`
2. Fetch option holdings from SnapTrade API for each date
3. Calculate option values using market_value from SnapTrade or price _ units _ multiplier
4. Include options in portfolio valuation calculation
