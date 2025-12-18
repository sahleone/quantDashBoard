/**
 * Sanity check: Compare today's SnapTrade holdings (positions + balances + options)
 * with PortfolioTimeseries to verify valuation logic
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import AccountServiceClientService from "./quantDashBoard/server/src/clients/accountClient.js";
import OptionsServiceClientService from "./quantDashBoard/server/src/clients/optionsClient.js";

dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ||
  "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

async function sanityCheck() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB\n");

    const db = mongoose.connection.db;

    // Get all unique accountIds from PortfolioTimeseries
    const PortfolioTimeseries = db.collection("portfoliotimeseries");
    const accountIds = await PortfolioTimeseries.distinct("accountId");
    const userIds = await PortfolioTimeseries.distinct("userId");

    console.log(`Found ${accountIds.length} accounts in PortfolioTimeseries\n`);
    console.log("=".repeat(80));

    // Create accountId -> userId mapping
    const accountToUserMap = new Map();
    for (const accountId of accountIds) {
      const sampleRecord = await PortfolioTimeseries.findOne({ accountId });
      if (sampleRecord) {
        accountToUserMap.set(accountId, sampleRecord.userId);
      }
    }

    // Initialize SnapTrade clients
    const accountService = new AccountServiceClientService();
    const optionsService = new OptionsServiceClientService();

    // Get user secrets
    const Users = db.collection("users");
    const userSecrets = new Map();
    for (const userId of userIds) {
      const user = await Users.findOne({ userId });
      if (user && user.userSecret) {
        userSecrets.set(userId, user.userSecret);
      }
    }

    for (const accountId of accountIds) {
      const userId = accountToUserMap.get(accountId);
      const userSecret = userSecrets.get(userId);

      console.log(`\nAccount ID: ${accountId}`);
      console.log(`User ID: ${userId}`);
      console.log("-".repeat(80));

      // Get most recent PortfolioTimeseries record
      const ptRecord = await PortfolioTimeseries.findOne(
        { accountId: accountId },
        { sort: { date: -1 } }
      );

      // Get most recent AccountBalances
      const AccountBalances = db.collection("accountbalances");
      const recentBalance = await AccountBalances.findOne(
        { accountId: accountId },
        { sort: { asOfDate: -1 } }
      );

      // Get most recent AccountPositions (grouped by date)
      const AccountPositions = db.collection("accountpositions");
      const allPositions = await AccountPositions.find({ accountId: accountId })
        .sort({ asOfDate: -1 })
        .limit(100)
        .toArray();

      let recentPositions = [];
      if (allPositions.length > 0) {
        const mostRecentDate = allPositions[0].asOfDate;
        recentPositions = allPositions.filter(
          (p) =>
            p.asOfDate.toISOString().split("T")[0] ===
            mostRecentDate.toISOString().split("T")[0]
        );
      }

      // Get most recent Options (grouped by date)
      const Options = db.collection("options");
      const allOptions = await Options.find({ accountId: accountId })
        .sort({ asOfDate: -1 })
        .limit(100)
        .toArray();

      let recentOptions = [];
      if (allOptions.length > 0) {
        const mostRecentDate = allOptions[0].asOfDate;
        recentOptions = allOptions.filter(
          (o) =>
            o.asOfDate.toISOString().split("T")[0] ===
            mostRecentDate.toISOString().split("T")[0]
        );
      }

      // Calculate from PortfolioTimeseries
      console.log("\n📊 PORTFOLIO TIMESERIES (Current System):");
      if (ptRecord) {
        const ptDate = ptRecord.date instanceof Date ? ptRecord.date : new Date(ptRecord.date);
        console.log(`  Date: ${ptDate.toISOString().split("T")[0]}`);
        console.log(`  Cash Value: $${(ptRecord.cashValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`  Stock Value: $${(ptRecord.stockValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`  Total Value: $${(ptRecord.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      } else {
        console.log("  ❌ No PortfolioTimeseries record found");
      }

      // Calculate from AccountBalances
      console.log("\n💰 ACCOUNT BALANCES:");
      if (recentBalance) {
        const balanceDate = recentBalance.asOfDate instanceof Date ? recentBalance.asOfDate : new Date(recentBalance.asOfDate);
        console.log(`  Date: ${balanceDate.toISOString().split("T")[0]}`);
        console.log(`  Cash: $${(recentBalance.cash || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`  Total Equity: $${(recentBalance.totalEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        console.log(`  Buying Power: $${(recentBalance.buyingPower || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      } else {
        console.log("  ❌ No AccountBalances record found");
      }

      // Calculate from Positions
      console.log(`\n📈 ACCOUNT POSITIONS (${recentPositions.length} positions):`);
      let totalPositionValue = 0;
      if (recentPositions.length > 0) {
        const posDate = recentPositions[0].asOfDate instanceof Date ? recentPositions[0].asOfDate : new Date(recentPositions[0].asOfDate);
        console.log(`  Date: ${posDate.toISOString().split("T")[0]}`);
        recentPositions.forEach((pos, idx) => {
          const units = pos.units || 0;
          const price = pos.price || 0;
          const marketValue = units * price;
          totalPositionValue += marketValue;
          const symbol = pos.symbolTicker || pos.positionSymbol?.symbol?.symbol || "UNKNOWN";
          const typeCode = pos.positionSymbol?.symbol?.type?.code || "UNKNOWN";
          if (Math.abs(marketValue) > 0.01) {
            console.log(
              `  ${idx + 1}. ${symbol} (${typeCode}): ${units} units @ $${price.toFixed(2)} = $${marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            );
          }
        });
        console.log(`  Total Position Value: $${totalPositionValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      } else {
        console.log("  ❌ No AccountPositions found");
      }

      // Calculate from Options
      console.log(`\n🎯 OPTIONS (${recentOptions.length} options):`);
      let totalOptionsValue = 0;
      if (recentOptions.length > 0) {
        const optDate = recentOptions[0].asOfDate instanceof Date ? recentOptions[0].asOfDate : new Date(recentOptions[0].asOfDate);
        console.log(`  Date: ${optDate.toISOString().split("T")[0]}`);
        recentOptions.forEach((opt, idx) => {
          const marketValue = opt.market_value || opt.marketValue || 0;
          const price = opt.price || 0;
          const units = opt.units || 0;
          const isMini = opt.option_symbol?.is_mini_option || opt.is_mini_option || false;
          const multiplier = isMini ? 10 : 100;
          const calculatedValue = price * Math.abs(units) * multiplier;
          const value = marketValue || calculatedValue;
          totalOptionsValue += value;
        const symbol = opt.option_symbol?.underlying_symbol?.symbol || opt.symbol || "UNKNOWN";
        const ticker = opt.option_symbol?.ticker || "UNKNOWN";
        const optionType = opt.option_symbol?.option_type || "UNKNOWN";
        const strike = opt.option_symbol?.strike_price || "UNKNOWN";
        const expiry = opt.option_symbol?.expiration_date || "UNKNOWN";
        if (Math.abs(value) > 0.01) {
          console.log(
            `  ${idx + 1}. ${symbol} ${ticker} (${optionType} $${strike} exp ${expiry}): ${units} contracts @ $${price.toFixed(2)} (${isMini ? "mini" : "standard"}) = $${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          );
        }
        });
        console.log(`  Total Options Value: $${totalOptionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      } else {
        console.log("  ❌ No Options found");
      }

      // Fetch LIVE SnapTrade data for comparison
      let snapTradeCash = 0;
      let snapTradePositionsValue = 0;
      let snapTradeOptionsValue = 0;
      let snapTradeTotalEquity = 0;

      if (userSecret) {
        try {
          console.log(`\n📡 Fetching LIVE data from SnapTrade API...`);
          // Get balances from SnapTrade API
          const snapBalances = await accountService.listAccountBalances(
            userId,
            userSecret,
            accountId
          );
        if (Array.isArray(snapBalances)) {
          snapTradeCash = snapBalances.reduce((sum, b) => sum + (b.cash || 0), 0);
          snapTradeTotalEquity = snapBalances.reduce((sum, b) => sum + (b.total_equity || b.totalEquity || 0), 0);
        }

          // Get positions from SnapTrade API
          const snapPositions = await accountService.listAccountPositions(
            userId,
            userSecret,
            accountId
          );
        if (Array.isArray(snapPositions)) {
          snapTradePositionsValue = snapPositions.reduce((sum, p) => {
            const units = p.units || 0;
            const price = p.price || 0;
            return sum + (units * price);
          }, 0);
        }

          // Get options from SnapTrade API
          const snapOptions = await optionsService.listOptionHoldings(
            userId,
            userSecret,
            accountId
          );
        if (Array.isArray(snapOptions)) {
          snapTradeOptionsValue = snapOptions.reduce((sum, opt) => {
            const marketValue = opt.market_value || opt.marketValue || 0;
            const price = opt.price || 0;
            const units = opt.units || 0;
            const isMini = opt.option_symbol?.is_mini_option || opt.is_mini_option || false;
            const multiplier = isMini ? 10 : 100;
            const calculatedValue = price * Math.abs(units) * multiplier;
            return sum + (marketValue || calculatedValue);
          }, 0);
        }
        } catch (apiError) {
          console.log(`  ⚠️  Error fetching from SnapTrade API: ${apiError.message}`);
        }
      } else {
        console.log(`  ⚠️  No userSecret available - skipping SnapTrade API comparison`);
      }

      // Calculate expected total from database
      const balanceCash = recentBalance?.cash || 0;
      const calculatedTotal = balanceCash + totalPositionValue + totalOptionsValue;

      // Calculate expected total from SnapTrade API
      const snapTradeCalculatedTotal = snapTradeCash + snapTradePositionsValue + snapTradeOptionsValue;

      console.log("\n" + "=".repeat(80));
      console.log("📊 COMPARISON:");
      console.log("=".repeat(80));
      
      console.log(`\n1️⃣  PortfolioTimeseries (TWR Calculated):`);
      console.log(`  Total Value: $${(ptRecord?.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Cash Value: $${(ptRecord?.cashValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Stock Value: $${(ptRecord?.stockValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      console.log(`\n2️⃣  SnapTrade API (LIVE Current Value):`);
      console.log(`  Total Equity: $${snapTradeTotalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Cash: $${snapTradeCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Positions Value: $${snapTradePositionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Options Value: $${snapTradeOptionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Calculated Total (Cash + Positions + Options): $${snapTradeCalculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      console.log(`\n3️⃣  Database Components (for reference):`);
      console.log(`  Cash (from AccountBalances): $${balanceCash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Positions Value: $${totalPositionValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Options Value: $${totalOptionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`  Calculated Total: $${calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      // Compare PortfolioTimeseries with SnapTrade API
      const differenceVsSnapTrade = (ptRecord?.totalValue || 0) - snapTradeCalculatedTotal;
      const differenceVsDatabase = (ptRecord?.totalValue || 0) - calculatedTotal;
      console.log(`\n"${"=".repeat(80)}"`);
      console.log(`📈 KEY COMPARISONS:`);
      console.log(`"${"=".repeat(80)}"`);
      console.log(`PortfolioTimeseries vs SnapTrade API: $${differenceVsSnapTrade.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      if (Math.abs(differenceVsSnapTrade) > 0.01) {
        const missingFromPT = snapTradeCalculatedTotal - (ptRecord?.totalValue || 0);
        console.log(`  → PortfolioTimeseries is missing: $${missingFromPT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        if (snapTradeOptionsValue > 0 && (ptRecord?.stockValue || 0) === snapTradePositionsValue) {
          console.log(`  🔍 Options value ($${snapTradeOptionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) is likely missing from PortfolioTimeseries!`);
        }
      }

      // Check if we have complete data
      const hasCompleteData = recentBalance && recentPositions.length > 0;

      // Final verdict
      if (Math.abs(differenceVsSnapTrade) < 0.01) {
        console.log(`\n✅ PERFECT MATCH - PortfolioTimeseries matches SnapTrade API!`);
        console.log(`   TWR calculation is producing correct current portfolio value.`);
      } else if (Math.abs(differenceVsSnapTrade) < 100) {
        console.log(`\n⚠️  SMALL DIFFERENCE - May be due to rounding, timing, or data sync delay`);
      } else {
        console.log(`\n❌ SIGNIFICANT MISMATCH - PortfolioTimeseries does not match SnapTrade API`);
        if (snapTradeOptionsValue > 0) {
          console.log(`\n🔍 ROOT CAUSE ANALYSIS:`);
          console.log(`   SnapTrade Options Value: $${snapTradeOptionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
          console.log(`   PortfolioTimeseries Stock Value: $${(ptRecord?.stockValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
          console.log(`   SnapTrade Positions Value: $${snapTradePositionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
          if (Math.abs((ptRecord?.stockValue || 0) - snapTradePositionsValue) < 10) {
            console.log(`   ✅ Stock positions match - Options are the missing piece!`);
            console.log(`   💡 Fix: Include options in PortfolioTimeseries calculation`);
          }
        }
      }
    }

    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("Error:", error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
    process.exit(1);
  }
}

sanityCheck();

