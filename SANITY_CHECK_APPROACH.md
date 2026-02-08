# Best Approach for Sanity Check

## Summary

The best way to verify valuation logic is to:

1. **Sync source data** from SnapTrade (balances, positions, options)
2. **Run sanity check** to compare PortfolioTimeseries with source data
3. **Identify discrepancies** and fix the pipeline if needed

## Step-by-Step Process

### Step 1: Sync Source Data

Run the sync script to fetch current data from SnapTrade:

```bash
DATABASE_URL="mongodb+srv://..." node syncSourceData.js
```

**What it does:**

- Uses existing `updateAccountHoldingsForUser` utility to sync:
  - AccountBalances (cash, equity)
  - AccountPositions (stock/ETF positions)
  - AccountHoldings
  - AccountOrders
  - Activities
- Separately syncs Options using SnapTrade API
- Stores all data in MongoDB with today's date

### Step 2: Run Sanity Check

Compare PortfolioTimeseries with synced source data:

```bash
DATABASE_URL="mongodb+srv://..." node sanityCheckValuation.js
```

**What it does:**

- Finds most recent PortfolioTimeseries record for each account
- Finds most recent AccountBalances, AccountPositions, and Options
- Calculates expected total: `Cash + Positions + Options`
- Compares with PortfolioTimeseries total value
- Shows breakdown and identifies discrepancies

### Step 3: Analyze Results

**Expected Output:**

```
PortfolioTimeseries Total: $51,914.74

Calculated from Components:
  Cash (from AccountBalances): $7,647.04
  Positions Value: $44,267.70
  Options Value: $0.00  ← This should show actual options value
  ─────────────────────────────────────────────
  TOTAL: $51,914.74

Difference: $0.00
✅ MATCH - Valuation logic is correct!
```

**If Options Value is $0 but you have options:**

- Options are not being included in PortfolioTimeseries calculation
- Need to fix the pipeline to include options

**If there's a large difference:**

- Check if options are missing from calculation
- Verify cash flow calculations
- Check for data sync issues

## Why This Approach?

1. **Uses Existing Infrastructure**

   - Leverages `updateAccountHoldingsForUser` utility
   - Reuses SnapTrade client services
   - Follows existing data models

2. **Comprehensive**

   - Syncs all relevant data (balances, positions, options)
   - Compares complete picture
   - Identifies specific missing components

3. **Repeatable**

   - Can run sync + check anytime
   - Useful for ongoing validation
   - Helps catch regressions

4. **Clear Output**
   - Shows exact breakdown
   - Highlights discrepancies
   - Easy to identify issues

## Alternative: Manual API Check

If you prefer to check via API directly:

1. Call SnapTrade API endpoints:

   - `/api/snaptrade/balances?accountId=...`
   - `/api/snaptrade/positions?accountId=...`
   - `/api/snaptrade/options/holdings?accountId=...`

2. Manually calculate: `Cash + Positions + Options`

3. Compare with PortfolioTimeseries

**Downside:** Doesn't persist data for future checks, more manual work

## Next Steps After Sanity Check

If options are missing:

1. Fix `buildCashTimeSeries` to extract option symbols
2. Add option value calculation to `calculatePortfolioValue`
3. Re-run pipeline
4. Re-run sanity check to verify

