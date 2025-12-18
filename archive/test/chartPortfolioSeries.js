/**
 * Script to build and chart portfolio value series (cash + securities)
 *
 * Usage:
 *   node archive/test/chartPortfolioSeries.js [accountId]
 *
 * Or with a custom database URL:
 *   DATABASE_URL=mongodb://... node archive/test/chartPortfolioSeries.js [accountId]
 */

import dotenv from "dotenv";
import {
  ensureDbConnection,
  getDb,
  disconnectDb,
} from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";

// Load environment variables from .env file
dotenv.config();
import { getAllAccountIds } from "./functions/getAccountIds.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import { buildDailyPortfolioSeries } from "./functions/buildDailyPortfolioSeries.js";
import { buildDailyPortfolioSeriesFromActivities } from "./functions/buildDailyPortfolioSeriesFromActivities.js";
import {
  getMinDate,
  createDateMapping,
  buildCashTimeSeries,
  extractAllSymbols,
  fetchAllPrices,
  calculatePortfolioValue,
} from "./functions/buildUnifiedTimeseries.js";
import {
  diagnoseDateAlignment,
  logDateAlignmentDiagnostic,
} from "./functions/diagnoseDateAlignment.js";
import { formatDateToYYYYMMDD } from "./utils/dateHelpers.js";
import AccountServiceClientService from "../../quantDashBoard/server/src/clients/accountClient.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pullAndChartPortfolioSeries(opts = {}) {
  const { accountId, databaseUrl } = opts;

  try {
    await ensureDbConnection(databaseUrl);
    const db = getDb();

    // Get all accounts if no accountId specified
    let accounts = [];
    if (accountId) {
      accounts = [accountId];
    } else {
      // Get all account IDs from the accounts collection (not just those with activities)
      accounts = await getAllAccountIds({ databaseUrl });
    }

    if (accounts.length === 0) {
      console.log("No accounts found.");
      return;
    }

    console.log(`Found ${accounts.length} account(s)\n`);

    // Check which accounts have activities in the database
    const activitiesCollection = db.collection("snaptradeaccountactivities");
    const accountsWithActivities = await activitiesCollection.distinct(
      "accountId"
    );
    console.log(
      `Accounts with activities in database: ${
        accountsWithActivities.length
      } (${accountsWithActivities.join(", ")})\n`
    );

    // Build portfolio series for each account
    const allSeries = {};

    for (const acctId of accounts) {
      console.log(`Building portfolio series for account: ${acctId}`);

      try {
        // Get activities for this account (with retry on timeout)
        let activities;
        let retries = 2;
        let lastError = null;

        while (retries >= 0) {
          try {
            activities = await getAccountActivities({
              accountId: acctId,
              databaseUrl,
            });
            lastError = null;
            break;
          } catch (activityError) {
            lastError = activityError;
            if (activityError.message.includes("timeout") && retries > 0) {
              console.log(
                `  ⚠ Connection timeout for account ${acctId}, retrying... (${retries} retries left)`
              );
              retries--;
              // Wait a bit before retrying
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } else {
              break;
            }
          }
        }

        if (lastError) {
          console.log(
            `  ✗ Error fetching activities for account ${acctId}: ${lastError.message}`
          );
          continue;
        }

        if (!activities || activities.length === 0) {
          console.log(`  No activities found for account ${acctId}`);
          continue;
        }

        // Determine base currency from first activity or default to USD
        const firstActivity = activities[0];
        const baseCurrency =
          firstActivity.currency?.code ||
          firstActivity.currency ||
          firstActivity.currencyObj?.code ||
          "USD";

        // Build unified timeseries using the new approach
        console.log(`  Building unified timeseries...`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const minDate = getMinDate(activities);
        if (!minDate) {
          console.log(`  No valid dates found for account ${acctId}`);
          continue;
        }

        // Create date mapping and build cash/units time series
        const dateMapping = createDateMapping(minDate, today);
        buildCashTimeSeries(activities, dateMapping);

        // Extract symbols and fetch prices
        const dateMappingsObject = { [acctId]: dateMapping };
        const allSymbols = extractAllSymbols(dateMappingsObject);

        let priceData = {};
        if (allSymbols.size > 0) {
          console.log(`  Fetching prices for ${allSymbols.size} symbols...`);
          const allDates = Object.keys(dateMapping).sort();
          priceData = await fetchAllPrices(
            allSymbols,
            minDate,
            today,
            allDates
          );

          // Calculate portfolio values
          const updatedDateMappingsObject = calculatePortfolioValue(
            dateMappingsObject,
            priceData
          );
          Object.assign(dateMapping, updatedDateMappingsObject[acctId]);
        }

        // Convert to portfolio series format
        const portfolioSeries = buildDailyPortfolioSeries({
          dateMapping,
          includeDailyReturn: true,
        });

        // Build unified portfolio series from activities (for debugging)
        console.log(`  Building unified portfolio series from activities...`);
        const unifiedPortfolioSeries =
          await buildDailyPortfolioSeriesFromActivities({
            activities,
            baseCurrency,
            initialCash: 0,
            endDate: today,
            databaseUrl,
          });

        // Get account info
        const accountsCollection = db.collection("snaptradeaccounts");
        const account = await accountsCollection.findOne({ accountId: acctId });
        const userId = account?.userId || null;

        // Fetch stored metrics from database
        const metricsCollection = db.collection("snaptrademetrics");
        const latestDate = new Date();
        latestDate.setHours(23, 59, 59, 999);

        // Get latest metrics for different periods
        const periods = ["1M", "3M", "YTD", "1Y", "ITD"];
        const storedMetrics = {};

        for (const period of periods) {
          const metricDocs = await metricsCollection
            .find({
              userId: userId,
              accountId: acctId,
              date: { $lte: latestDate },
              period: period,
            })
            .sort({ date: -1 }) // Get most recent
            .limit(1)
            .toArray();

          const metricDoc = metricDocs[0];
          if (metricDoc && metricDoc.metrics) {
            storedMetrics[period] = metricDoc.metrics;
          }
        }

        // Calculate "Derived return" series: backwards from today's SnapTrade API value
        let derivedReturnSeries = null;
        try {
          // Get userSecret from users collection
          const usersCollection = db.collection("users");
          const user = userId
            ? await usersCollection.findOne({ userId })
            : null;
          const userSecret = user?.userSecret || null;

          if (userId && userSecret) {
            console.log(
              `  Calculating derived return series from SnapTrade API...`
            );

            // Fetch today's portfolio value from SnapTrade API
            const accountService = new AccountServiceClientService();
            let todayValue = null;
            try {
              const holdings = await accountService.listAccountHoldings(
                userId,
                userSecret,
                acctId
              );

              // Extract total_value from holdings response
              if (holdings?.total_value?.value) {
                todayValue = holdings.total_value.value;
                const holdingsCurrency =
                  holdings.total_value.currency || baseCurrency;
                console.log(
                  `    Today's portfolio value from API: ${holdingsCurrency} ${todayValue.toFixed(
                    2
                  )}`
                );
              } else if (holdings?.balance?.total?.amount) {
                todayValue = holdings.balance.total.amount;
                const holdingsCurrency =
                  holdings.balance.total.currency || baseCurrency;
                console.log(
                  `    Today's portfolio value from API: ${holdingsCurrency} ${todayValue.toFixed(
                    2
                  )}`
                );
              }
            } catch (apiError) {
              console.log(
                `    ⚠️  Could not fetch holdings from API: ${apiError.message}`
              );
            }

            if (todayValue !== null) {
              // Get simpleReturns and depositWithdrawal from portfoliotimeseries
              const portfolioCollection = db.collection("portfoliotimeseries");
              const timeseriesData = await portfolioCollection
                .find({ accountId: acctId })
                .sort({ date: -1 }) // Most recent first
                .toArray();

              if (timeseriesData.length > 0) {
                // Create lookup by date
                const returnsByDate = new Map();
                const flowsByDate = new Map();
                timeseriesData.forEach((entry) => {
                  const dateKey =
                    entry.date instanceof Date
                      ? entry.date.toISOString().split("T")[0]
                      : entry.date;
                  if (dateKey) {
                    returnsByDate.set(dateKey, entry.simpleReturns || 0);
                    flowsByDate.set(dateKey, entry.depositWithdrawal || 0);
                  }
                });

                // Calculate backwards from today
                // Formula: simpleReturns[t] = (V[t] - (V[t-1] + CF[t])) / (V[t-1] + CF[t])
                // Reverse: V[t-1] = V[t] / (1 + simpleReturns[t]) - CF[t]
                const derivedValues = [];
                let currentValue = todayValue;

                // Work backwards through the portfolio series dates (most recent first)
                // We start with today's value and work backwards
                for (let i = portfolioSeries.length - 1; i >= 0; i--) {
                  const dateKey = portfolioSeries[i].date;
                  const returnValue = returnsByDate.get(dateKey);
                  const depositWithdrawal = flowsByDate.get(dateKey) || 0;

                  // Store current value for this date
                  derivedValues.unshift({
                    date: dateKey,
                    value: currentValue,
                  });

                  // Calculate previous day's value using the return for this date
                  // V[t-1] = V[t] / (1 + simpleReturns[t]) - CF[t]
                  if (
                    returnValue !== null &&
                    returnValue !== undefined &&
                    !isNaN(returnValue)
                  ) {
                    const denominator = 1 + returnValue;
                    if (denominator !== 0 && Math.abs(denominator) > 1e-10) {
                      currentValue =
                        currentValue / denominator - depositWithdrawal;
                    }
                  }
                }

                derivedReturnSeries = derivedValues;
                console.log(
                  `    ✓ Calculated ${derivedReturnSeries.length} days of derived return series`
                );
              }
            }
          } else {
            console.log(
              `    ⚠️  Missing userId or userSecret, skipping derived return calculation`
            );
          }
        } catch (derivedError) {
          console.log(
            `    ⚠️  Error calculating derived return: ${derivedError.message}`
          );
        }

        allSeries[acctId] = {
          userId,
          accountId: acctId,
          series: portfolioSeries,
          unifiedSeries: unifiedPortfolioSeries, // Add unified timeseries for debugging
          derivedReturnSeries: derivedReturnSeries, // Add derived return series
          currency: baseCurrency,
          dateRange: {
            start: portfolioSeries[0]?.date,
            end: portfolioSeries[portfolioSeries.length - 1]?.date,
          },
          stats: calculateStats(portfolioSeries),
          unifiedStats: calculateStats(unifiedPortfolioSeries), // Add unified stats
          metrics: storedMetrics, // Add stored metrics
        };

        console.log(
          `  ✓ ${portfolioSeries.length} days (${allSeries[acctId].dateRange.start} to ${allSeries[acctId].dateRange.end})`
        );
        console.log(
          `    Last portfolio value: ${baseCurrency} ${allSeries[
            acctId
          ].stats.lastPortfolioValue.toFixed(2)}`
        );
        console.log(
          `    Cash: ${baseCurrency} ${allSeries[acctId].stats.lastCash.toFixed(
            2
          )}, Securities: ${baseCurrency} ${allSeries[
            acctId
          ].stats.lastSecuritiesValue.toFixed(2)}\n`
        );
      } catch (error) {
        console.log(`  ✗ Error processing account ${acctId}: ${error.message}`);
        console.log(`    Stack: ${error.stack}\n`);
      }
    }

    const successfulAccounts = Object.keys(allSeries);
    console.log(
      `\n✓ Successfully processed ${successfulAccounts.length} of ${accounts.length} account(s)`
    );
    if (successfulAccounts.length > 0) {
      console.log(`  Accounts in chart: ${successfulAccounts.join(", ")}\n`);
    }

    if (Object.keys(allSeries).length === 0) {
      console.log("No portfolio series data to chart.");
      return;
    }

    // Load Python timeseries if available
    const pythonSeriesPath = path.join(
      __dirname,
      "..",
      "returnsTest",
      "portfolio_python.csv"
    );
    let pythonSeries = null;
    if (fs.existsSync(pythonSeriesPath)) {
      console.log("\n📊 Loading Python timeseries from CSV...");
      try {
        const csvContent = fs.readFileSync(pythonSeriesPath, "utf-8");
        const lines = csvContent.trim().split("\n");
        const headers = lines[0].split(",");

        pythonSeries = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",");
          const row = {};
          headers.forEach((h, idx) => {
            const key = h.trim();
            const value = values[idx]?.trim();
            if (key === "date") {
              row.date = value;
            } else {
              row[key] =
                value === "" || value === "nan" ? null : parseFloat(value);
            }
          });
          if (row.date) {
            pythonSeries.push(row);
          }
        }
        console.log(`  ✓ Loaded ${pythonSeries.length} days of Python data`);
        console.log(
          `    Date range: ${pythonSeries[0]?.date} to ${
            pythonSeries[pythonSeries.length - 1]?.date
          }`
        );
      } catch (error) {
        console.log(`  ⚠️  Error loading Python CSV: ${error.message}`);
      }
    }

    // Create HTML chart
    const html = generateChartHTML(allSeries, pythonSeries);
    const outputPath = path.join(__dirname, "portfolioSeriesChart.html");
    fs.writeFileSync(outputPath, html);

    console.log(`\n✓ Chart created: ${outputPath}`);
    console.log(`  Open this file in your browser to view the chart\n`);

    return { allSeries, outputPath };
  } catch (err) {
    handleError(err, "Error pulling and charting portfolio series");
  } finally {
    await disconnectDb();
  }
}

function calculateStats(portfolioSeries) {
  if (!portfolioSeries || portfolioSeries.length === 0) {
    return {
      days: 0,
      minPortfolioValue: 0,
      maxPortfolioValue: 0,
      lastPortfolioValue: 0,
      lastCash: 0,
      lastSecuritiesValue: 0,
      minCash: 0,
      maxCash: 0,
      minSecuritiesValue: 0,
      maxSecuritiesValue: 0,
      totalReturn: 0,
    };
  }

  const portfolioValues = portfolioSeries.map((s) => s.portfolioValue || 0);
  const cashValues = portfolioSeries.map((s) => s.cash || 0);
  const securitiesValues = portfolioSeries.map((s) => s.securitiesValue || 0);
  const returns = portfolioSeries
    .map((s) => s.dailyReturn)
    .filter((r) => r !== null && !isNaN(r));

  const firstValue = portfolioValues[0] || 0;
  const lastValue = portfolioValues[portfolioSeries.length - 1] || 0;
  const totalReturn = firstValue > 0 ? (lastValue / firstValue - 1) * 100 : 0;

  return {
    days: portfolioSeries.length,
    minPortfolioValue: Math.min(...portfolioValues),
    maxPortfolioValue: Math.max(...portfolioValues),
    lastPortfolioValue: lastValue,
    lastCash: cashValues[cashValues.length - 1] || 0,
    lastSecuritiesValue: securitiesValues[securitiesValues.length - 1] || 0,
    minCash: Math.min(...cashValues),
    maxCash: Math.max(...cashValues),
    minSecuritiesValue: Math.min(...securitiesValues),
    maxSecuritiesValue: Math.max(...securitiesValues),
    totalReturn,
    avgDailyReturn:
      returns.length > 0
        ? returns.reduce((a, b) => a + b, 0) / returns.length
        : 0,
  };
}

function generateChartHTML(allSeries, pythonSeries = null) {
  const accounts = Object.keys(allSeries);

  // Create Python series lookup by date
  const pythonByDate = new Map();
  if (pythonSeries) {
    pythonSeries.forEach((s) => {
      pythonByDate.set(s.date, s);
    });
  }

  const accountData = accounts.map((accountId) => {
    const data = allSeries[accountId];
    const unifiedSeries = data.unifiedSeries || [];

    // Align unified series dates with main series dates for comparison
    const unifiedByDate = new Map();
    unifiedSeries.forEach((s) => {
      unifiedByDate.set(s.date, s);
    });

    return {
      accountId,
      label: `Account ${accountId.substring(0, 8)}...`,
      currency: data.currency || "USD",
      dates: data.series.map((s) => s.date),
      cash: data.series.map((s) => s.cash || 0),
      securitiesValue: data.series.map((s) => s.securitiesValue || 0),
      portfolioValue: data.series.map((s) => s.portfolioValue || 0),
      dailyReturn: data.series.map((s) => (s.dailyReturn || 0) * 100), // Convert to percentage
      stats: data.stats,
      metrics: data.metrics || {}, // Include stored metrics
      // Unified series data (for debugging comparison)
      unifiedCash: data.series.map((s) => {
        const unified = unifiedByDate.get(s.date);
        return unified ? unified.cash || 0 : 0;
      }),
      unifiedSecuritiesValue: data.series.map((s) => {
        const unified = unifiedByDate.get(s.date);
        return unified ? unified.securitiesValue || 0 : 0;
      }),
      unifiedPortfolioValue: data.series.map((s) => {
        const unified = unifiedByDate.get(s.date);
        return unified ? unified.portfolioValue || 0 : 0;
      }),
      unifiedStats: data.unifiedStats || {},
      // Python series data (aligned with main series dates)
      pythonCash: data.series.map((s) => {
        const python = pythonByDate.get(s.date);
        return python ? python.cash_value || 0 : null;
      }),
      pythonStockValue: data.series.map((s) => {
        const python = pythonByDate.get(s.date);
        return python ? python.stock_value || 0 : null;
      }),
      pythonTotalValue: data.series.map((s) => {
        const python = pythonByDate.get(s.date);
        return python ? python.total_value || 0 : null;
      }),
      hasPythonData: pythonSeries !== null && pythonSeries.length > 0,
      // Derived return series (aligned with main series dates)
      derivedReturn: data.series.map((s) => {
        const derived = data.derivedReturnSeries?.find(
          (d) => d.date === s.date
        );
        return derived ? derived.value : null;
      }),
      hasDerivedReturn:
        data.derivedReturnSeries !== null &&
        data.derivedReturnSeries?.length > 0,
    };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portfolio Value Series Chart</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #007bff;
        }
        .stat-card h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
        }
        .stat-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        .stat-card .value.positive {
            color: #28a745;
        }
        .stat-card .value.negative {
            color: #dc3545;
        }
        .chart-container {
            position: relative;
            height: 600px;
            margin-top: 30px;
        }
        .account-selector {
            margin-bottom: 20px;
        }
        .account-selector label {
            font-weight: 600;
            margin-right: 10px;
        }
        .account-selector select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: 10px;
        }
        .checkbox-group input[type="checkbox"] {
            margin: 0;
        }
        .checkbox-group label {
            font-size: 14px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Portfolio Value Series Chart</h1>
        <div class="account-selector">
            <label for="accountSelect">Account:</label>
            <select id="accountSelect">
                ${accounts
                  .map(
                    (accountId, index) =>
                      `<option value="${index}">${accountId.substring(
                        0,
                        8
                      )}... (${allSeries[accountId].stats.days} days)</option>`
                  )
                  .join("")}
            </select>
        </div>
        <div class="checkbox-group" style="margin-bottom: 20px;">
            <input type="checkbox" id="showCash" checked>
            <label for="showCash">Show Cash</label>
            <input type="checkbox" id="showSecurities" checked>
            <label for="showSecurities">Show Securities Value</label>
            <input type="checkbox" id="showPortfolio" checked>
            <label for="showPortfolio">Show Portfolio Value</label>
        </div>
        <div class="checkbox-group" style="margin-bottom: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
            <strong style="margin-right: 10px;">Unified (Debug):</strong>
            <input type="checkbox" id="showUnifiedCash">
            <label for="showUnifiedCash">Show Unified Cash</label>
            <input type="checkbox" id="showUnifiedSecurities">
            <label for="showUnifiedSecurities">Show Unified Securities</label>
            <input type="checkbox" id="showUnifiedPortfolio">
            <label for="showUnifiedPortfolio">Show Unified Portfolio</label>
        </div>
        ${
          accountData[0]?.hasPythonData
            ? `
        <div class="checkbox-group" style="margin-bottom: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
            <strong style="margin-right: 10px; color: #9c27b0;">Python Pipeline:</strong>
            <input type="checkbox" id="showPythonCash">
            <label for="showPythonCash">Show Python Cash</label>
            <input type="checkbox" id="showPythonStock">
            <label for="showPythonStock">Show Python Stock Value</label>
            <input type="checkbox" id="showPythonTotal">
            <label for="showPythonTotal">Show Python Total Value</label>
        </div>
        `
            : ""
        }
        ${
          accountData[0]?.hasDerivedReturn
            ? `
        <div class="checkbox-group" style="margin-bottom: 20px; border-top: 1px solid #ddd; padding-top: 10px;">
            <strong style="margin-right: 10px; color: #ff9800;">Derived Return:</strong>
            <input type="checkbox" id="showDerivedReturn">
            <label for="showDerivedReturn">Show Derived Return (from SnapTrade API)</label>
        </div>
        `
            : ""
        }
        <div class="stats" id="statsContainer"></div>
        <div class="chart-container">
            <canvas id="portfolioChart"></canvas>
        </div>
    </div>

    <script>
        const accountData = ${JSON.stringify(accountData)};
        let currentAccountIndex = 0;
        let chart = null;
        let showCash = true;
        let showSecurities = true;
        let showPortfolio = true;
        let showUnifiedCash = false;
        let showUnifiedSecurities = false;
        let showUnifiedPortfolio = false;
        let showPythonCash = false;
        let showPythonStock = false;
        let showPythonTotal = false;

        function updateChart(accountIndex) {
            const data = accountData[accountIndex];
            const ctx = document.getElementById('portfolioChart').getContext('2d');

            // Destroy existing chart if it exists
            if (chart) {
                chart.destroy();
            }

            // Update stats
            const stats = data.stats;
            const metrics = data.metrics || {};
            const currency = data.currency || 'USD';
            
            // Helper to format metric value
            const formatMetric = (value, format = 'number', decimals = 2) => {
                if (value === null || value === undefined || isNaN(value)) return 'N/A';
                if (format === 'percent') return (value * 100).toFixed(decimals) + '%';
                if (format === 'currency') return currency + ' ' + value.toFixed(decimals);
                return value.toFixed(decimals);
            };
            
            // Helper to get class for numeric values (positive/negative) or empty string for invalid values
            const getValueClass = (value) => {
                if (value === null || value === undefined || isNaN(value)) return '';
                return value >= 0 ? 'positive' : 'negative';
            };
            
            // Get ITD metrics (most comprehensive) or fallback to other periods
            const itdMetrics = metrics.ITD || metrics['1Y'] || metrics['YTD'] || metrics['3M'] || metrics['1M'] || {};
            
            document.getElementById('statsContainer').innerHTML = \`
                <div class="stat-card">
                    <h3>Days of Data</h3>
                    <div class="value">\${stats.days}</div>
                </div>
                <div class="stat-card">
                    <h3>Date Range</h3>
                    <div class="value" style="font-size: 14px;">\${data.dates[0]} to \${data.dates[data.dates.length - 1]}</div>
                </div>
                <div class="stat-card">
                    <h3>Last Portfolio Value (AUM)</h3>
                    <div class="value">\${currency} \${stats.lastPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Return (ITD)</h3>
                    <div class="value \${stats.totalReturn >= 0 ? 'positive' : 'negative'}">\${stats.totalReturn >= 0 ? '+' : ''}\${stats.totalReturn.toFixed(2)}%</div>
                </div>
                <div class="stat-card">
                    <h3>CAGR (ITD)</h3>
                    <div class="value \${getValueClass(itdMetrics.cagr)}">\${formatMetric(itdMetrics.cagr, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>Sharpe Ratio (ITD)</h3>
                    <div class="value">\${formatMetric(itdMetrics.sharpe)}</div>
                </div>
                <div class="stat-card">
                    <h3>Sortino Ratio (ITD)</h3>
                    <div class="value">\${formatMetric(itdMetrics.sortino)}</div>
                </div>
                <div class="stat-card">
                    <h3>Volatility (ITD)</h3>
                    <div class="value">\${formatMetric(itdMetrics.volatility, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>Max Drawdown (ITD)</h3>
                    <div class="value negative">\${formatMetric(itdMetrics.maxDrawdown, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>Beta (ITD)</h3>
                    <div class="value">\${formatMetric(itdMetrics.beta)}</div>
                </div>
                <div class="stat-card">
                    <h3>VaR (95%)</h3>
                    <div class="value negative">\${formatMetric(itdMetrics.var95, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>CVaR (95%)</h3>
                    <div class="value negative">\${formatMetric(itdMetrics.cvar95, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>Diversification Score</h3>
                    <div class="value">\${formatMetric(itdMetrics.diversificationScore, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>HHI</h3>
                    <div class="value">\${formatMetric(itdMetrics.hhi, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Income Yield</h3>
                    <div class="value">\${formatMetric(itdMetrics.totalIncomeYield, 'percent')}</div>
                </div>
                <div class="stat-card">
                    <h3>Account ID</h3>
                    <div class="value" style="font-size: 12px;">\${data.accountId}</div>
                </div>
            \`;

            // Prepare datasets for portfolio chart
            const datasets = [];
            
            if (showCash) {
                datasets.push({
                    label: 'Cash',
                    data: data.cash,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                });
            }

            if (showSecurities) {
                datasets.push({
                    label: 'Securities Value',
                    data: data.securitiesValue,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                });
            }

            if (showPortfolio) {
                datasets.push({
                    label: 'Portfolio Value (Total)',
                    data: data.portfolioValue,
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y',
                });
            }

            // Add unified series datasets (for debugging comparison)
            if (showUnifiedCash && data.unifiedCash) {
                datasets.push({
                    label: 'Unified Cash (Debug)',
                    data: data.unifiedCash,
                    borderColor: 'rgba(75, 192, 192, 0.5)',
                    backgroundColor: 'rgba(75, 192, 192, 0.05)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                });
            }

            if (showUnifiedSecurities && data.unifiedSecuritiesValue) {
                datasets.push({
                    label: 'Unified Securities (Debug)',
                    data: data.unifiedSecuritiesValue,
                    borderColor: 'rgba(255, 99, 132, 0.5)',
                    backgroundColor: 'rgba(255, 99, 132, 0.05)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                });
            }

            if (showUnifiedPortfolio && data.unifiedPortfolioValue) {
                datasets.push({
                    label: 'Unified Portfolio (Debug)',
                    data: data.unifiedPortfolioValue,
                    borderColor: 'rgba(54, 162, 235, 0.5)',
                    backgroundColor: 'rgba(54, 162, 235, 0.05)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y',
                });
            }

            // Add Python series datasets (for comparison)
            if (showPythonCash && data.pythonCash) {
                datasets.push({
                    label: 'Python Cash',
                    data: data.pythonCash,
                    borderColor: 'rgba(156, 39, 176, 0.7)',
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                });
            }

            if (showPythonStock && data.pythonStockValue) {
                datasets.push({
                    label: 'Python Stock Value',
                    data: data.pythonStockValue,
                    borderColor: 'rgba(233, 30, 99, 0.7)',
                    backgroundColor: 'rgba(233, 30, 99, 0.1)',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y',
                });
            }

            if (showPythonTotal && data.pythonTotalValue) {
                datasets.push({
                    label: 'Python Total Value',
                    data: data.pythonTotalValue,
                    borderColor: 'rgba(63, 81, 181, 0.7)',
                    backgroundColor: 'rgba(63, 81, 181, 0.1)',
                    borderWidth: 3,
                    borderDash: [10, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y',
                });
            }

            // Add derived return dataset (calculated backwards from SnapTrade API)
            if (showDerivedReturn && data.derivedReturn) {
                datasets.push({
                    label: 'Derived Return (from SnapTrade API)',
                    data: data.derivedReturn,
                    borderColor: 'rgba(255, 152, 0, 0.8)',
                    backgroundColor: 'rgba(255, 152, 0, 0.1)',
                    borderWidth: 3,
                    borderDash: [15, 5],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    yAxisID: 'y',
                });
            }

            // Create chart
            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.dates,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: \`Portfolio Value Series: \${data.label}\`,
                            font: {
                                size: 18
                            }
                        },
                        legend: {
                            display: true,
                            position: 'top',
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + currency + ' ' + context.parsed.y.toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Date'
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                maxTicksLimit: 12
                            }
                        },
                        y: {
                            display: true,
                            title: {
                                display: true,
                                text: \`Value (\${currency})\`
                            },
                            ticks: {
                                callback: function(value) {
                                    return currency + ' ' + value.toLocaleString();
                                }
                            }
                        }
                    },
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false
                    }
                }
            });
        }

        // Initialize with first account
        updateChart(0);

        // Handle account selector change
        document.getElementById('accountSelect').addEventListener('change', function(e) {
            currentAccountIndex = parseInt(e.target.value);
            updateChart(currentAccountIndex);
        });

        // Handle checkbox changes
        document.getElementById('showCash').addEventListener('change', function(e) {
            showCash = e.target.checked;
            updateChart(currentAccountIndex);
        });

        document.getElementById('showSecurities').addEventListener('change', function(e) {
            showSecurities = e.target.checked;
            updateChart(currentAccountIndex);
        });

        document.getElementById('showPortfolio').addEventListener('change', function(e) {
            showPortfolio = e.target.checked;
            updateChart(currentAccountIndex);
        });

        // Unified series event listeners
        document.getElementById('showUnifiedCash').addEventListener('change', function(e) {
            showUnifiedCash = e.target.checked;
            updateChart(currentAccountIndex);
        });

        document.getElementById('showUnifiedSecurities').addEventListener('change', function(e) {
            showUnifiedSecurities = e.target.checked;
            updateChart(currentAccountIndex);
        });

        document.getElementById('showUnifiedPortfolio').addEventListener('change', function(e) {
            showUnifiedPortfolio = e.target.checked;
            updateChart(currentAccountIndex);
        });

        // Python series event listeners
        const pythonCashCheckbox = document.getElementById('showPythonCash');
        const pythonStockCheckbox = document.getElementById('showPythonStock');
        const pythonTotalCheckbox = document.getElementById('showPythonTotal');
        
        if (pythonCashCheckbox) {
            pythonCashCheckbox.addEventListener('change', function(e) {
                showPythonCash = e.target.checked;
                updateChart(currentAccountIndex);
            });
        }
        
        if (pythonStockCheckbox) {
            pythonStockCheckbox.addEventListener('change', function(e) {
                showPythonStock = e.target.checked;
                updateChart(currentAccountIndex);
            });
        }
        
        if (pythonTotalCheckbox) {
            pythonTotalCheckbox.addEventListener('change', function(e) {
                showPythonTotal = e.target.checked;
                updateChart(currentAccountIndex);
            });
        }

        // Derived return event listener
        const derivedReturnCheckbox = document.getElementById('showDerivedReturn');
        if (derivedReturnCheckbox) {
            derivedReturnCheckbox.addEventListener('change', function(e) {
                showDerivedReturn = e.target.checked;
                updateChart(currentAccountIndex);
            });
        }
    </script>
</body>
</html>`;
}

// Main execution
const accountId = process.argv[2] || null;

pullAndChartPortfolioSeries({ accountId })
  .then((result) => {
    if (result) {
      console.log("\n✓ Portfolio series chart generated successfully!");
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
