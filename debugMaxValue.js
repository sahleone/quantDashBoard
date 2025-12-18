/**
 * Debug script to find the max totalValue in PortfolioTimeseries
 * and compare with SnapTrade balances + positions + options
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const databaseUrl =
  process.env.DATABASE_URL ||
  "mongodb+srv://rhysjervis2:RgRYOx97CgzHdemQ@cluster0.3vrnf.mongodb.net/node_auth";

async function debugMaxValue() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log("Connected to MongoDB\n");

    const db = mongoose.connection.db;
    const PortfolioTimeseries = db.collection("portfoliotimeseries");

    // Find the record with max totalValue
    const maxRecord = await PortfolioTimeseries.findOne(
      {},
      { sort: { totalValue: -1 } }
    );

    if (!maxRecord) {
      console.log("No records found in PortfolioTimeseries");
      await mongoose.disconnect();
      return;
    }

    console.log("=== MAX TOTAL VALUE RECORD ===");
    console.log(`Account ID: ${maxRecord.accountId}`);
    console.log(`User ID: ${maxRecord.userId}`);
    console.log(`Date: ${maxRecord.date}`);
    console.log(`Total Value: $${maxRecord.totalValue?.toLocaleString()}`);
    console.log(`Cash Value: $${maxRecord.cashValue?.toLocaleString()}`);
    console.log(`Stock Value: $${maxRecord.stockValue?.toLocaleString()}`);
    console.log(`Deposit/Withdrawal: $${maxRecord.depositWithdrawal?.toLocaleString()}`);
    console.log(`External Flow Cumulative: $${maxRecord.externalFlowCumulative?.toLocaleString()}`);

    if (maxRecord.positions && maxRecord.positions.length > 0) {
      console.log(`\nPositions (${maxRecord.positions.length}):`);
      maxRecord.positions.forEach((pos, idx) => {
        console.log(
          `  ${idx + 1}. ${pos.symbol}: ${pos.units} units @ $${pos.price} = $${pos.value?.toLocaleString()}`
        );
      });
    } else {
      console.log("\nNo positions array in record");
    }

    // Check what dates are available for this account
    const AccountBalances = mongoose.connection.db.collection("accountbalances");
    const allBalances = await AccountBalances.find({
      accountId: maxRecord.accountId,
    })
      .sort({ asOfDate: -1 })
      .limit(5)
      .toArray();

    console.log(`\n=== Recent AccountBalances for this account (${allBalances.length} found) ===`);
    allBalances.forEach((bal) => {
      console.log(`  Date: ${bal.asOfDate}, Cash: $${bal.cash?.toLocaleString()}, Equity: $${bal.totalEquity?.toLocaleString()}`);
    });

    // Check AccountBalances for the same date
    const balanceRecord = await AccountBalances.findOne({
      accountId: maxRecord.accountId,
      asOfDate: {
        $gte: new Date(new Date(maxRecord.date).setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(maxRecord.date).setHours(23, 59, 59, 999)),
      },
    });

    if (balanceRecord) {
      console.log("\n=== ACCOUNT BALANCES (from DB) ===");
      console.log(`Date: ${balanceRecord.asOfDate}`);
      console.log(`Cash: $${balanceRecord.cash?.toLocaleString()}`);
      console.log(`Buying Power: $${balanceRecord.buyingPower?.toLocaleString()}`);
      console.log(`Total Equity: $${balanceRecord.totalEquity?.toLocaleString()}`);
    } else {
      console.log("\n=== No AccountBalances record found for this exact date ===");
      // Try to find closest date
      const closestBalance = await AccountBalances.findOne(
        { accountId: maxRecord.accountId },
        { sort: { asOfDate: -1 } }
      );
      if (closestBalance) {
        console.log(`\nClosest AccountBalances record:`);
        console.log(`  Date: ${closestBalance.asOfDate}`);
        console.log(`  Cash: $${closestBalance.cash?.toLocaleString()}`);
        console.log(`  Total Equity: $${closestBalance.totalEquity?.toLocaleString()}`);
      }
    }

    // Check what dates are available for positions
    const AccountPositions = mongoose.connection.db.collection("accountpositions");
    const recentPositions = await AccountPositions.find({
      accountId: maxRecord.accountId,
    })
      .sort({ asOfDate: -1 })
      .limit(10)
      .toArray();

    console.log(`\n=== Recent AccountPositions for this account (${recentPositions.length} found) ===`);
    const positionsByDate = new Map();
    recentPositions.forEach((pos) => {
      const dateKey = pos.asOfDate.toISOString().split("T")[0];
      if (!positionsByDate.has(dateKey)) {
        positionsByDate.set(dateKey, []);
      }
      positionsByDate.get(dateKey).push(pos);
    });
    positionsByDate.forEach((posList, date) => {
      console.log(`  Date: ${date}, Positions: ${posList.length}`);
    });

    // Check AccountPositions for the same date
    const positions = await AccountPositions.find({
      accountId: maxRecord.accountId,
      asOfDate: {
        $gte: new Date(new Date(maxRecord.date).setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(maxRecord.date).setHours(23, 59, 59, 999)),
      },
    }).toArray();

    if (positions.length > 0) {
      console.log(`\n=== ACCOUNT POSITIONS (from DB) - ${positions.length} positions ===`);
      let totalPositionValue = 0;
      positions.forEach((pos, idx) => {
        const units = pos.units || 0;
        const price = pos.price || 0;
        const marketValue = units * price;
        totalPositionValue += marketValue;
        const symbol = pos.symbolTicker || pos.positionSymbol?.symbol?.symbol || "UNKNOWN";
        const typeCode = pos.positionSymbol?.symbol?.type?.code || "UNKNOWN";
        console.log(
          `  ${idx + 1}. ${symbol} (${typeCode}): ${units} units @ $${price} = $${marketValue.toLocaleString()}`
        );
      });
      console.log(`\nTotal Position Value: $${totalPositionValue.toLocaleString()}`);
    } else {
      console.log("\n=== No AccountPositions found for this exact date ===");
      // Try to find closest date
      const closestPositions = await AccountPositions.find({
        accountId: maxRecord.accountId,
      })
        .sort({ asOfDate: -1 })
        .limit(20)
        .toArray();
      if (closestPositions.length > 0) {
        console.log(`\nClosest AccountPositions (${closestPositions.length} positions):`);
        const closestDate = closestPositions[0].asOfDate;
        const sameDatePositions = closestPositions.filter(
          (p) => p.asOfDate.toISOString().split("T")[0] === closestDate.toISOString().split("T")[0]
        );
        let totalPositionValue = 0;
        sameDatePositions.forEach((pos, idx) => {
          const units = pos.units || 0;
          const price = pos.price || 0;
          const marketValue = units * price;
          totalPositionValue += marketValue;
          const symbol = pos.symbolTicker || pos.positionSymbol?.symbol?.symbol || "UNKNOWN";
          const typeCode = pos.positionSymbol?.symbol?.type?.code || "UNKNOWN";
          console.log(
            `  ${idx + 1}. ${symbol} (${typeCode}): ${units} units @ $${price} = $${marketValue.toLocaleString()}`
          );
        });
        console.log(`  Date: ${closestDate.toISOString().split("T")[0]}`);
        console.log(`  Total Position Value: $${totalPositionValue.toLocaleString()}`);
      }
    }

    // Check what dates are available for options
    const Options = mongoose.connection.db.collection("options");
    const allOptions = await Options.find({
      accountId: maxRecord.accountId,
    })
      .sort({ asOfDate: -1 })
      .limit(10)
      .toArray();

    console.log(`\n=== Recent Options for this account (${allOptions.length} found) ===`);
    const optionsByDate = new Map();
    allOptions.forEach((opt) => {
      const dateKey = opt.asOfDate.toISOString().split("T")[0];
      if (!optionsByDate.has(dateKey)) {
        optionsByDate.set(dateKey, []);
      }
      optionsByDate.get(dateKey).push(opt);
    });
    optionsByDate.forEach((optList, date) => {
      console.log(`  Date: ${date}, Options: ${optList.length}`);
    });

    // Check Options for the same date
    const options = await Options.find({
      accountId: maxRecord.accountId,
      asOfDate: {
        $gte: new Date(new Date(maxRecord.date).setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(maxRecord.date).setHours(23, 59, 59, 999)),
      },
    }).toArray();

    if (options.length > 0) {
      console.log(`\n=== OPTIONS (from DB) - ${options.length} options ===`);
      let totalOptionsValue = 0;
      options.forEach((opt, idx) => {
        const marketValue = opt.market_value || opt.marketValue || 0;
        const price = opt.price || 0;
        const units = opt.units || 0;
        const isMini = opt.option_symbol?.is_mini_option || opt.is_mini_option || false;
        const multiplier = isMini ? 10 : 100;
        const calculatedValue = price * Math.abs(units) * multiplier;
        const value = marketValue || calculatedValue;
        totalOptionsValue += value;
        const symbol = opt.option_symbol?.underlying_symbol?.symbol || opt.symbol || "UNKNOWN";
        console.log(
          `  ${idx + 1}. ${symbol}: ${units} contracts @ $${price} (${isMini ? "mini" : "standard"}) = $${value.toLocaleString()}`
        );
      });
      console.log(`\nTotal Options Value: $${totalOptionsValue.toLocaleString()}`);
    } else {
      console.log("\n=== No Options found for this exact date ===");
      // Try to find closest date
      const closestOptions = await Options.find({
        accountId: maxRecord.accountId,
      })
        .sort({ asOfDate: -1 })
        .limit(20)
        .toArray();
      if (closestOptions.length > 0) {
        console.log(`\nClosest Options (${closestOptions.length} options):`);
        const closestDate = closestOptions[0].asOfDate;
        const sameDateOptions = closestOptions.filter(
          (o) => o.asOfDate.toISOString().split("T")[0] === closestDate.toISOString().split("T")[0]
        );
        let totalOptionsValue = 0;
        sameDateOptions.forEach((opt, idx) => {
          const marketValue = opt.market_value || opt.marketValue || 0;
          const price = opt.price || 0;
          const units = opt.units || 0;
          const isMini = opt.option_symbol?.is_mini_option || opt.is_mini_option || false;
          const multiplier = isMini ? 10 : 100;
          const calculatedValue = price * Math.abs(units) * multiplier;
          const value = marketValue || calculatedValue;
          totalOptionsValue += value;
          const symbol = opt.option_symbol?.underlying_symbol?.symbol || opt.symbol || "UNKNOWN";
          console.log(
            `  ${idx + 1}. ${symbol}: ${units} contracts @ $${price} (${isMini ? "mini" : "standard"}) = $${value.toLocaleString()}`
          );
        });
        console.log(`  Date: ${closestDate.toISOString().split("T")[0]}`);
        console.log(`  Total Options Value: $${totalOptionsValue.toLocaleString()}`);
      } else {
        // Check if there are ANY options in the database
        const anyOptions = await Options.countDocuments({});
        console.log(`\nTotal options in database: ${anyOptions}`);
      }
    }

    // Calculate expected total
    const balanceCash = balanceRecord?.cash || 0;
    const balanceEquity = balanceRecord?.totalEquity || 0;
    let positionsValue = 0;
    positions.forEach((pos) => {
      positionsValue += (pos.units || 0) * (pos.price || 0);
    });
    let optionsValue = 0;
    options.forEach((opt) => {
      const marketValue = opt.market_value || opt.marketValue || 0;
      const price = opt.price || 0;
      const units = opt.units || 0;
      const isMini = opt.option_symbol?.is_mini_option || opt.is_mini_option || false;
      const multiplier = isMini ? 10 : 100;
      const calculatedValue = price * Math.abs(units) * multiplier;
      optionsValue += marketValue || calculatedValue;
    });

    console.log("\n=== COMPARISON ===");
    console.log(`PortfolioTimeseries Total Value: $${maxRecord.totalValue?.toLocaleString()}`);
    console.log(`PortfolioTimeseries Cash: $${maxRecord.cashValue?.toLocaleString()}`);
    console.log(`PortfolioTimeseries Stock: $${maxRecord.stockValue?.toLocaleString()}`);
    console.log(`\nAccountBalances Cash: $${balanceCash.toLocaleString()}`);
    console.log(`AccountBalances Total Equity: $${balanceEquity.toLocaleString()}`);
    console.log(`AccountPositions Total: $${positionsValue.toLocaleString()}`);
    console.log(`Options Total: $${optionsValue.toLocaleString()}`);
    console.log(`\nExpected Total (Cash + Positions + Options): $${(balanceCash + positionsValue + optionsValue).toLocaleString()}`);
    console.log(`\nDifference: $${((balanceCash + positionsValue + optionsValue) - maxRecord.totalValue).toLocaleString()}`);

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

debugMaxValue();

