# Securities Values Anomalies Analysis

## Key Findings

### 1. Option Exercise/Assignment Timing Issues

**Problem**: Option exercises and assignments create positions on different dates than the actual activities, causing securities values to appear/disappear on wrong dates.

#### Example 1: 2025-05-07 (Tuesday) - QQQ Position Appeared
- **Anomaly**: QQQ position went from 0 → 100 shares, value jumped from -$8.61 to $48,321.51
- **Actual Activity**: BUY of 100 QQQ shares on **2025-05-08** (Wednesday) for -$49,184
- **Issue**: Position was created on 5/7 but BUY activity is dated 5/8
- **Root Cause**: Option exercise likely happened on 5/7, but the resulting stock position was recorded on 5/7 while the BUY activity was dated 5/8

#### Example 2: 2025-05-11 (Saturday) - QQQ Position Disappeared  
- **Anomaly**: QQQ position went from 100 → 0 shares, value dropped from $48,821.85 to $1,143.05
- **Actual Activity**: SELL of 100 QQQ shares on **2025-05-12** (Sunday) for $50,360.50
- **Issue**: Position disappeared on Saturday but SELL activity is dated Sunday
- **Root Cause**: Option assignment likely happened on 5/11, but the resulting stock sale was recorded on 5/12

#### Example 3: 2025-04-21 (Sunday) - SPY Position Disappeared
- **Anomaly**: SPY position went from 100 → 0 shares, value dropped from $52,558.82 to -$6.99
- **Actual Activity**: OPTIONASSIGNMENT on **2025-04-22** (Monday) for SPY CALL
- **Issue**: Position disappeared on Sunday but assignment activity is dated Monday
- **Root Cause**: Option assignment happened on 4/22, but the position was removed on 4/21 (weekend)

### 2. Weekend Price Availability Issues

**Problem**: Weekend dates don't have stock/ETF prices, causing securities values to be $0 or missing.

#### Weekend Dates with Anomalies:
- **2025-04-21 (Sunday)**: SPY position disappeared, value dropped $52,565.81
- **2025-05-11 (Saturday)**: QQQ position disappeared, value dropped $47,678.80
- **2025-06-23 (Sunday)**: Many positions appeared, value jumped $45,559.86

**Current Behavior**:
- When prices are missing, securities values are set to $0 or forward-filled
- When prices become available later, values suddenly appear/disappear
- This creates huge jumps that don't correspond to actual transactions

**Expected Behavior**:
- **For stocks/ETFs**: Use Friday's price for weekends (prices should be available)
- **For crypto**: Prices should be available on weekends (markets are open 24/7)

### 3. Option Exercise/Assignment Activity Types

**Current Handling** (from `buildDailyUnitsSeries.js`):
```javascript
if (
  type === "OPTIONASSIGNMENT" ||
  type === "OPTIONEXERCISE" ||
  type === "OPTIONEXPIRATION"
) {
  return -Math.abs(units); // Always decreases units
}
```

**Issues**:
1. **OPTIONEXERCISE**: When you exercise a call option, you BUY the underlying stock
   - Should INCREASE units of the underlying stock
   - Should DECREASE units of the option
   - Current code only decreases units (treats it as closing the option)

2. **OPTIONASSIGNMENT**: When you're assigned on a short call, you SELL the underlying stock
   - Should DECREASE units of the underlying stock
   - Should DECREASE units of the option (closes the short position)
   - Current code decreases units (correct for closing option, but missing the stock transaction)

3. **Missing Stock Transactions**: Option exercises/assignments create stock positions but may not have corresponding BUY/SELL activities on the same date

### 4. Price Lookup Issues

**Current Behavior** (from `buildDailySecurityValuesSeries.js`):
- Looks for price on exact date
- If not found, looks back to find latest available price
- If still not found, sets value to $0 or forward-fills

**Issues**:
1. **Weekends**: Should use Friday's price for stocks/ETFs
2. **Holidays**: Should use last trading day's price
3. **Missing Prices**: Should not set to $0, should use last known price or mark as unavailable

## Detailed Anomaly Analysis

### Anomaly 1: 2025-04-21 (Sunday) - SPY Disappeared
- **Date**: Sunday (day 0)
- **Change**: -$52,565.81 (-100.0%)
- **Position Change**: SPY 100 → 0 shares
- **Activities**: 
  - 2025-04-22: OPTIONASSIGNMENT for SPY CALL (1 unit)
  - Only small option transactions on 4/21
- **Issue**: 
  - 100 SPY shares disappeared on Sunday
  - OPTIONASSIGNMENT activity is dated Monday
  - Likely: Option was assigned on Monday, but position was removed on Sunday (weekend)
  - Missing: SELL activity for 100 SPY shares

### Anomaly 2: 2025-05-07 (Tuesday) - QQQ Appeared
- **Date**: Tuesday (day 2)
- **Change**: +$48,330.12 (+561,325.4%)
- **Position Change**: QQQ 0 → 100 shares
- **Activities**: 
  - 2025-05-08: BUY 100 QQQ shares for -$49,184
- **Issue**:
  - Position appeared on Tuesday
  - BUY activity is dated Wednesday
  - Likely: Option was exercised on Tuesday, creating the position, but BUY activity was recorded on Wednesday
  - Missing: OPTIONEXERCISE activity or it's dated differently

### Anomaly 3: 2025-05-11 (Saturday) - QQQ Disappeared
- **Date**: Saturday (day 6)
- **Change**: -$47,678.80 (-97.7%)
- **Position Change**: QQQ 100 → 0 shares
- **Activities**:
  - 2025-05-12: SELL 100 QQQ shares for $50,360.50
- **Issue**:
  - Position disappeared on Saturday
  - SELL activity is dated Sunday
  - Likely: Option was assigned on Saturday, but SELL activity was recorded on Sunday
  - Missing: OPTIONASSIGNMENT activity or it's dated differently

### Anomaly 4: 2025-06-23 (Sunday) - Many Positions Appeared
- **Date**: Sunday (day 0)
- **Change**: +$45,559.86 (+405,497.8%)
- **Position Changes**: Many positions existed but values suddenly appeared
- **Activities**:
  - 2025-06-23: BUY CTRE and O (small amounts)
- **Issue**:
  - Positions existed but had $0 value until Sunday
  - Prices became available on Sunday (weekend)
  - Should have used Friday's prices for weekend

## Current Price Lookup Behavior

The `getPriceForSymbolOnDate` function currently:
1. Tries exact date first
2. If not found, looks back to find latest available price before the date
3. Returns null if no price found

**Issue**: This should work for weekends (would find Friday's price), but the problem is:
- Prices might not be stored in database for weekends (correct - markets are closed)
- The look-back should explicitly target Friday for weekends
- For crypto, prices should be available for weekends (markets open 24/7)

## Recommendations

### 1. Fix Weekend Price Handling
- **For stocks/ETFs**: Explicitly use Friday's price for Saturday/Sunday
  - Current code does look-back, but should be more explicit
  - Friday prices should be available in database
  - Implementation: Modify `getPriceForSymbolOnDate` to explicitly look for Friday when date is weekend
  
- **For crypto**: Prices should be available on weekends (markets open 24/7)
  - If crypto prices are missing on weekends, that's a data issue
  - Should fetch crypto prices for all dates including weekends

### 2. Fix Option Exercise/Assignment Handling

**Key Insight**: 100 share positions appearing/disappearing are likely from option exercises/assignments.

**Current Code Issue** (from `buildDailyUnitsSeries.js` line 221-227):
```javascript
if (
  type === "OPTIONASSIGNMENT" ||
  type === "OPTIONEXERCISE" ||
  type === "OPTIONEXPIRATION"
) {
  return -Math.abs(units); // Always decreases units
}
```

**Problems**:
1. **OPTIONEXERCISE**: When you exercise a CALL option:
   - You BUY the underlying stock (should INCREASE stock units)
   - The option is closed (should DECREASE option units)
   - Current code only decreases units (treats it as closing the option only)
   - **Missing**: The resulting stock position (100 shares) is created but not tracked properly

2. **OPTIONASSIGNMENT**: When you're assigned on a SHORT CALL:
   - You SELL the underlying stock (should DECREASE stock units)
   - The short option is closed (should DECREASE option units - negative becomes less negative)
   - Current code decreases units (correct for closing option, but missing stock transaction)

3. **Date Mismatches**: 
   - Option exercise/assignment activities may be dated differently than the resulting stock positions
   - Example: Option exercised on Tuesday, but stock position appears on Tuesday while BUY activity is dated Wednesday
   - This causes securities values to appear/disappear on wrong dates

**Fix Needed**:
- **OPTIONEXERCISE**: 
  - Decrease option units (close the option) ✓ (current)
  - Increase underlying stock units (you now own the stock) ✗ (missing)
  - Need to identify underlying symbol from option symbol
  - May need to create synthetic BUY activity or handle in units calculation
  
- **OPTIONASSIGNMENT**:
  - Decrease option units (close the short option) ✓ (current)
  - Decrease underlying stock units (you sold the stock) ✗ (missing)
  - Need to identify underlying symbol from option symbol
  - May need to create synthetic SELL activity or handle in units calculation

### 3. Improve Price Lookup
- Check if date is weekend/holiday
- For weekends: automatically use Friday's price for stocks/ETFs
- For holidays: use last trading day's price
- Don't set values to $0 when prices are missing - use last known price

### 4. Add Validation
- Warn when positions exist but have $0 value for extended periods
- Warn when option exercises/assignments don't have corresponding stock transactions
- Validate that position changes match activity dates

### 5. Handle Date Mismatches
- Option exercises/assignments may have different dates for:
  - The option activity (exercise/assignment date)
  - The resulting stock transaction (settlement date)
  - The position change (trade date)
- Need to align these dates or handle the mismatch

## Code Changes Needed (Not Implemented Yet)

1. **`buildDailySecurityValuesSeries.js`**:
   - Add weekend detection in `getPriceForSymbolOnDate`
   - For weekends (Saturday/Sunday):
     - **Stocks/ETFs**: Explicitly look for Friday's price (should be available)
     - **Crypto**: Prices should be available (markets open 24/7)
   - Use last trading day for holidays
   - Improve look-back logic to be more explicit about weekend handling

2. **`buildDailyUnitsSeries.js`**:
   - Fix OPTIONEXERCISE to increase underlying stock units
     - Parse option symbol to extract underlying (e.g., "QQQ 250515C00500000" → "QQQ")
     - When option is exercised, add underlying stock units
     - Handle 100 share positions (standard option contract size)
   - Fix OPTIONASSIGNMENT to decrease underlying stock units
     - Parse option symbol to extract underlying
     - When assigned, remove underlying stock units
     - Handle 100 share positions
   - Handle date mismatches between option activities and stock positions
     - Option exercise date vs. stock position date vs. settlement date
     - May need to align dates or handle the mismatch gracefully

3. **`buildDailyCashSeries.js`**:
   - Ensure option exercises/assignments affect cash correctly
   - Handle synthetic stock transactions from option exercises

4. **Price lookup function**:
   - Add weekend/holiday detection
   - Implement Friday price fallback for weekends
   - Implement last trading day fallback for holidays

## Testing

After implementing fixes, verify:
1. Weekend dates use Friday's prices for stocks/ETFs
2. Option exercises create stock positions on correct dates
3. Option assignments remove stock positions on correct dates
4. Securities values don't jump from $0 to large values when prices become available
5. Position changes match activity dates

---

**Last Updated**: 2025-01-27

