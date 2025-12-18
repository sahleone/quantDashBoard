# Double Counting Analysis & Suggestions

## Issues Found

### 1. Duplicate Assignment in `buildDailyCashSeries.js`

**Location:** Lines 264-266

```javascript
cash = cashToday;

cash = cashToday;  // Duplicate assignment
```

**Impact:** Minor - doesn't cause double counting but is redundant code.

**Fix:** Remove the duplicate line.

---

### 2. Potential Double Counting Scenarios

#### Scenario A: BUY/SELL Transaction Processing

**How it works:**
1. BUY transaction:
   - `buildDailyCashSeries`: Subtracts purchase amount from cash (including fees)
   - `buildDailyUnitsSeries`: Increases units
   - `buildDailySecurityValuesSeries`: Calculates securities value = units × price
   - `buildDailyPortfolioSeries`: Portfolio = cash + securities value

**Potential Issue:**
- If the `amount` in BUY activity includes fees, but the securities value is calculated using the net price (price per share × units), there could be a discrepancy
- However, this is **NOT double counting** - it's correct accounting:
  - Cash decreases by total cost (price + fees)
  - Securities value increases by market value (price × units)
  - The difference is fees, which is correct

**Verdict:** ✅ This is correct, not double counting.

---

#### Scenario B: Dividend Reinvestment (REI)

**How it works:**
1. REI transaction:
   - `buildDailyCashSeries`: Subtracts cash used to buy shares
   - `buildDailyUnitsSeries`: Increases units
   - `buildDailySecurityValuesSeries`: Calculates securities value = units × price
   - `buildDailyPortfolioSeries`: Portfolio = cash + securities value

**Potential Issue:**
- If REI amount = purchase price, and securities value = units × price, this should be balanced
- However, if there's a spread or fee, the cash reduction might not exactly match the securities value increase
- This is **NOT double counting** - it's correct accounting

**Verdict:** ✅ This is correct, not double counting.

---

#### Scenario C: Activities Being Processed Multiple Times

**Potential Issue:**
- If `getAccountActivities` is called multiple times and returns duplicate activities
- If activities are stored in database with duplicates
- If the same activity is processed in both cash and units series

**How to Check:**
1. Check for duplicate `activityId` values in the activities array
2. Verify that each activity is only processed once per series

**Verdict:** ⚠️ This could cause double counting if activities are duplicated.

---

#### Scenario D: Forward-Filling Values

**How it works:**
- `buildDailyPortfolioSeries` forward-fills cash and securities values to today
- If values are forward-filled incorrectly, they might be counted multiple times

**Potential Issue:**
- In `buildDailyPortfolioSeries.js` lines 155-165, values are forward-filled (carried forward)
- This is correct behavior - values should persist until updated
- However, if the same value is added multiple times instead of replaced, that would be double counting

**Verdict:** ✅ Forward-filling logic looks correct.

---

#### Scenario E: Cash Already Including Securities Value

**Potential Issue:**
- If cash balance from SnapTrade API already includes securities value
- Then adding securities value again would double count

**How to Check:**
- Verify that SnapTrade `balances.cash` is only cash, not total portfolio value
- According to SnapTrade docs, `cash` should be cash only

**Verdict:** ⚠️ Need to verify SnapTrade API behavior.

---

#### Scenario F: Multiple Accounts Aggregation

**Potential Issue:**
- If the same account is processed multiple times
- If activities from multiple accounts are being aggregated incorrectly

**How to Check:**
- Verify that each account is only processed once
- Verify that activities are properly filtered by `accountId`

**Verdict:** ⚠️ Need to verify account processing logic.

---

## Recommendations

### 1. Fix Duplicate Assignment

**File:** `archive/test/functions/buildDailyCashSeries.js`

**Change:**
```javascript
// Remove duplicate line 266
cash = cashToday;
// cash = cashToday;  // DELETE THIS LINE
dates.push(dateKey);
dailyCash.push(cashToday);
```

---

### 2. Add Activity Deduplication

**File:** `archive/test/functions/buildDailyCashSeries.js` and `buildDailyUnitsSeries.js`

**Add at the start of processing:**
```javascript
// Deduplicate activities by activityId
const seenActivityIds = new Set();
const deduplicatedActivities = activities.filter(activity => {
  const activityId = activity.activityId || activity.id;
  if (!activityId) return true; // Keep if no ID (shouldn't happen)
  if (seenActivityIds.has(activityId)) {
    console.warn(`Duplicate activity detected: ${activityId}`);
    return false;
  }
  seenActivityIds.add(activityId);
  return true;
});
```

---

### 3. Add Validation Checks

**Add validation to verify no double counting:**

```javascript
// In buildDailyPortfolioSeries, add validation
function validatePortfolioSeries(portfolioSeries, activities) {
  // Check that portfolio value is reasonable
  // (cash + securities should not exceed total activity amounts by too much)
  
  // Check for sudden jumps that might indicate double counting
  for (let i = 1; i < portfolioSeries.length; i++) {
    const prev = portfolioSeries[i - 1];
    const curr = portfolioSeries[i];
    const change = curr.portfolioValue - prev.portfolioValue;
    const cashChange = curr.cash - prev.cash;
    const secChange = curr.securitiesValue - prev.securitiesValue;
    
    // If portfolio change doesn't match sum of cash and securities changes, log warning
    if (Math.abs(change - (cashChange + secChange)) > 0.01) {
      console.warn(`Portfolio value change mismatch on ${curr.date}: ${change} vs ${cashChange + secChange}`);
    }
  }
}
```

---

### 4. Add Debug Logging

**Add detailed logging to track cash and securities value changes:**

```javascript
// In buildDailyPortfolioSeries, add debug logging
if (process.env.DEBUG_PORTFOLIO) {
  console.log(`[Portfolio Debug] ${dateKey}:`);
  console.log(`  Cash: ${lastCash} (change: ${lastCash - prevCash})`);
  console.log(`  Securities: ${lastSecVal} (change: ${lastSecVal - prevSecVal})`);
  console.log(`  Portfolio: ${portfolioValue} (change: ${portfolioValue - prevPortfolioValue})`);
}
```

---

### 5. Verify SnapTrade API Behavior

**Check that:**
- `balances.cash` is cash only (not total portfolio value)
- `positions` values are separate from cash
- Activities are not duplicated in API responses

**Add test:**
```javascript
// Test that cash + securities from API matches portfolio value
const apiAUM = totalCash + totalSecuritiesValue;
const timeseriesAUM = portfolioSeries[portfolioSeries.length - 1].portfolioValue;
const diff = Math.abs(apiAUM - timeseriesAUM);
if (diff > 100) { // Threshold for significant difference
  console.warn(`AUM mismatch: API=${apiAUM}, Timeseries=${timeseriesAUM}, Diff=${diff}`);
}
```

---

### 6. Check for Activity Type Overlap

**Verify that activities are not being counted in both cash and securities incorrectly:**

```javascript
// In buildDailyCashSeries, log which activity types affect cash
const cashAffectingTypes = new Set();
activities.forEach(activity => {
  const type = activity.type?.toUpperCase();
  if (type && !EXCLUDE_FROM_CASH.has(type)) {
    cashAffectingTypes.add(type);
  }
});
console.log('Activity types affecting cash:', Array.from(cashAffectingTypes));

// In buildDailyUnitsSeries, log which activity types affect units
const unitAffectingTypes = new Set();
unitActivities.forEach(activity => {
  const type = activity.type?.toUpperCase();
  if (type) {
    unitAffectingTypes.add(type);
  }
});
console.log('Activity types affecting units:', Array.from(unitAffectingTypes));
```

---

## Most Likely Causes

Based on the code analysis, the most likely causes of double counting are:

1. **Duplicate activities in database** - Activities with same `activityId` appearing multiple times
2. **Activities processed multiple times** - Same activities being fetched/processed in multiple pipeline runs
3. **Cash balance already including securities** - If SnapTrade API returns cash that includes securities value (unlikely but possible)

---

## Next Steps

1. ✅ Fix duplicate assignment in `buildDailyCashSeries.js`
2. ⚠️ Add activity deduplication
3. ⚠️ Add validation checks
4. ⚠️ Add debug logging
5. ⚠️ Verify SnapTrade API behavior
6. ⚠️ Check for duplicate activities in database

---

## Testing

To identify where double counting occurs:

1. **Enable debug logging:**
   ```bash
   DEBUG_PORTFOLIO=1 node archive/test/chartPortfolioSeries.js
   ```

2. **Check for duplicate activities:**
   ```javascript
   const activities = await getAccountActivities({ accountId });
   const activityIds = activities.map(a => a.activityId || a.id);
   const duplicates = activityIds.filter((id, index) => activityIds.indexOf(id) !== index);
   console.log('Duplicate activity IDs:', duplicates);
   ```

3. **Compare API AUM vs Timeseries AUM:**
   - Fetch current AUM from SnapTrade API
   - Compare with latest portfolio value from timeseries
   - If difference is significant, investigate

4. **Trace a specific transaction:**
   - Pick a BUY or SELL transaction
   - Trace how it affects cash series
   - Trace how it affects units series
   - Verify the math is correct

---

**Last Updated:** 2025-01-27

