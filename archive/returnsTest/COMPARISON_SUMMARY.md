# Python vs JavaScript Pipeline Comparison

## Summary

Based on the pipeline runs, here are the key differences:

## Python Pipeline Results

From the Python script output (2025-12-05):
- **Cash Value**: -$4,556.04
- **Stock Value**: $7,546.47
- **Total Value**: ~$2,990.43
- **External Flows (Net Deposits/Withdrawals)**: $50,051.65
- **Date Range**: 2017-06-12 to 2025-12-05
- **Total Days**: ~3,099 days

## JavaScript Pipeline Results

From the JavaScript script output (2025-12-07):
- **Cash Value**: -$12,846.62
- **Securities Value**: $0.00
- **Total Value**: -$12,846.62
- **Date Range**: 2017-06-13 to 2025-12-07
- **Total Days**: ~3,098 days

## Key Differences

### 1. Securities Value
- **Python**: $7,546.47 (has stock value)
- **JavaScript**: $0.00 (no stock value)
- **Issue**: JavaScript pipeline shows "Loaded prices for 0 symbols" - prices are not being loaded

### 2. Cash Value
- **Python**: -$4,556.04
- **JavaScript**: -$12,846.62
- **Difference**: $8,290.58
- **Possible Causes**:
  - Different activity processing
  - Different date handling
  - Missing or duplicate activities

### 3. Total Portfolio Value
- **Python**: ~$2,990.43 (positive)
- **JavaScript**: -$12,846.62 (negative)
- **Difference**: $15,837.05

## Root Causes

1. **Price Loading Failure**: JavaScript pipeline shows "Loaded prices for 0 symbols", meaning no prices are being fetched/loaded for securities
2. **Cash Calculation Differences**: The $8,290 difference in cash suggests:
   - Different activity filtering
   - Different date handling (settlement vs trade date)
   - Potential double counting or missing activities

## Recommendations

1. **Fix Price Loading**: Investigate why prices aren't being loaded in the JavaScript pipeline
2. **Verify Activity Processing**: Compare which activities are being processed in each pipeline
3. **Date Alignment**: Ensure both pipelines use the same date field (trade_date vs date)
4. **External Flows**: Verify external flows calculation matches (Python: $50,051.65)

## Next Steps

1. Check why `buildDailySecurityValuesSeries` is returning 0 for all securities
2. Compare activity counts between Python and JavaScript
3. Verify date normalization is consistent
4. Check for missing price data in MongoDB

