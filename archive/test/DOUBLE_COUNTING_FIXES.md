# Double Counting Fixes - Complete Logic Review

## Summary

This document outlines all the fixes applied to prevent double counting in the portfolio timeseries pipeline.

## Root Causes Identified

1. **Duplicate Activities**: Same activity processed multiple times
2. **Option Exercise/Assignment Double Counting**: Both option activity AND resulting BUY/SELL processed
3. **Inconsistent Activity Filtering**: Different logic between cash and units series

## Fixes Applied

### 1. Activity Deduplication ✅

**Location**: `buildDailyCashSeries.js` (Step 0) and `buildDailyUnitsSeries.js` (Step 0)

**Fix**: Deduplicate activities by `activityId` before processing

```javascript
// Step 0: Deduplicate activities by activityId to prevent double counting
const seenActivityIds = new Set();
const deduplicatedActivities = activities.filter((activity) => {
  const activityId = activity.activityId || activity.id;
  if (!activityId) {
    return true; // Keep activities without IDs
  }
  if (seenActivityIds.has(activityId)) {
    console.warn(`Duplicate activity detected and removed: ${activityId}`);
    return false;
  }
  seenActivityIds.add(activityId);
  return true;
});
```

**Impact**: Prevents the same activity from being processed multiple times

---

### 2. Option Activities Filtering ✅

**Location**: `buildDailyUnitsSeries.js` (Step 2.5)

**Problem**: When an option is exercised/assigned, SnapTrade creates:
- An `OPTIONEXERCISE`/`OPTIONASSIGNMENT` activity (metadata)
- A `BUY`/`SELL` activity for the underlying stock (actual transaction)

**Previous Behavior**: 
- Filtered out BUY/SELL activities from option exercises
- Still processed option activities themselves
- Result: Option activities affected positions incorrectly

**New Behavior**:
- Filter out `OPTIONEXERCISE`, `OPTIONASSIGNMENT`, `OPTIONEXPIRATION` activities entirely
- Process the resulting `BUY`/`SELL` activities (the actual stock transactions)
- Option activities are just metadata - only the stock transaction matters

**Fix**:
```javascript
function filterOutOptionActivities(activities) {
  return activities.filter((activity) => {
    const type = String(activity.type || "").toUpperCase();
    
    // Filter out option activities - we only care about the resulting BUY/SELL
    if (
      type === "OPTIONEXERCISE" ||
      type === "OPTIONASSIGNMENT" ||
      type === "OPTIONEXPIRATION"
    ) {
      return false; // Exclude option activities
    }
    
    return true; // Keep all other activities (including BUY/SELL from option exercises)
  });
}
```

**Impact**: Prevents double counting of stock positions from option exercises/assignments

---

### 3. Cash Series Option Activity Exclusion ✅

**Location**: `buildDailyCashSeries.js` (Step 5)

**Problem**: `OPTIONEXERCISE` and `OPTIONASSIGNMENT` were not excluded from cash processing

**Fix**: Added to `EXCLUDE_FROM_CASH` set:
```javascript
const EXCLUDE_FROM_CASH = new Set([
  "OPTIONEXERCISE",    // Option exercise doesn't change cash - the resulting BUY does
  "OPTIONASSIGNMENT",  // Option assignment doesn't change cash - the resulting SELL does
  "OPTIONEXPIRATION",  // Option expiration doesn't change cash, just closes position
]);
```

**Impact**: Ensures consistency - option activities don't affect cash (they have `amount: null` anyway, but this makes it explicit)

---

### 4. Timezone Fix for Date Arithmetic ✅

**Location**: `buildDailyUnitsSeries.js` - `filterOutOptionActivities` (now removed, but was an issue)

**Problem**: Date string parsing used local timezone, causing date shifts

**Fix**: Created `addDaysToDateString()` helper that uses UTC:
```javascript
export function addDaysToDateString(dateStr, days) {
  // Parse as UTC, add days using UTC methods, format back as YYYY-MM-DD
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  // Format back using UTC methods
  return `${year}-${month}-${day}`;
}
```

**Impact**: Prevents incorrect date matching when checking for option exercises/assignments

---

## Current Logic Flow

### Cash Series (`buildDailyCashSeries.js`)

1. **Deduplicate** activities by `activityId`
2. **Normalize** and sort activities (oldest → newest)
3. **Filter** by currency
4. **Group** by date
5. **Exclude** option activities (`OPTIONEXERCISE`, `OPTIONASSIGNMENT`, `OPTIONEXPIRATION`)
6. **Process** remaining activities (BUY/SELL, CONTRIBUTION, DIVIDEND, etc.)
7. **Extend** to today (default behavior)

### Units Series (`buildDailyUnitsSeries.js`)

1. **Deduplicate** activities by `activityId`
2. **Normalize** and sort activities (oldest → newest)
3. **Filter** to unit-related activities (must have symbol and units)
4. **Filter out** option activities (`OPTIONEXERCISE`, `OPTIONASSIGNMENT`, `OPTIONEXPIRATION`)
5. **Process** remaining activities (BUY/SELL, REI, STOCK_DIVIDEND, etc.)
6. **Apply** stock splits
7. **Extend** to today (default behavior)

### Securities Values Series (`buildDailySecurityValuesSeries.js`)

1. **Uses** units series (already filtered)
2. **Multiplies** units × prices
3. **Handles** missing prices (forward-fill or $0)
4. **Options** are valued at $0 (by design)

### Portfolio Series (`buildDailyPortfolioSeries.js`)

1. **Combines** cash + securities values
2. **Validates** portfolio = cash + securities (if `DEBUG_PORTFOLIO=1`)
3. **Extends** to today (default behavior)

---

## Key Principles

1. **Option activities are metadata only**: They don't directly affect cash or positions
2. **Only process actual transactions**: BUY/SELL activities represent real stock transactions
3. **Deduplicate first**: Remove duplicates before any processing
4. **Consistent filtering**: Same exclusion rules across cash and units series
5. **Extend to today**: All series default to extending to current date

---

## Testing Recommendations

1. **Run with validation enabled**:
   ```bash
   DEBUG_PORTFOLIO=1 node archive/test/chartPortfolioSeries.js
   ```

2. **Check for warnings**:
   - Duplicate activity warnings
   - Option activity filtering warnings
   - Portfolio validation warnings

3. **Verify specific dates**:
   - Dates with option exercises/assignments
   - Dates with large cash/securities changes
   - Weekend dates (price availability)

4. **Compare before/after**:
   - Run `analyzeCashAnomalies.js` and `analyzeSecuritiesAnomalies.js`
   - Check for reduction in anomalies
   - Verify portfolio values are consistent

---

## Remaining Known Issues

1. **Weekend Price Handling**: Should explicitly use Friday's price for weekends (stocks/ETFs)
2. **Option Positions**: Options are tracked but valued at $0 (by design - historical option pricing is expensive)
3. **Date Mismatches**: Option exercise/assignment dates may differ from stock transaction dates (handled by processing BUY/SELL only)

---

## Files Modified

- `archive/test/functions/buildDailyCashSeries.js`
  - Added deduplication (Step 0)
  - Added option activity exclusion (Step 5)
  - Extended to today by default

- `archive/test/functions/buildDailyUnitsSeries.js`
  - Added deduplication (Step 0)
  - Added option activity filtering (Step 2.5)
  - Updated `computeUnitAdjustment` to ignore option activities
  - Extended to today by default

- `archive/test/utils/dateHelpers.js`
  - Added `addDaysToDateString()` for UTC-based date arithmetic

- `archive/test/functions/buildDailyPortfolioSeries.js`
  - Added portfolio validation (if `DEBUG_PORTFOLIO=1`)
  - Extended to today by default

---

**Last Updated**: 2025-01-27

