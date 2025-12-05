/**
 * Script to build and chart portfolio value series (cash + securities)
 *
 * Usage:
 *   node archive/test/chartPortfolioSeries.js [accountId]
 *
 * Or with a custom database URL:
 *   DATABASE_URL=mongodb://... node archive/test/chartPortfolioSeries.js [accountId]
 */

import { ensureDbConnection, getDb, disconnectDb } from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";
import { getAllAccountIds } from "./functions/getAccountIds.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import { buildDailyCashSeries } from "./functions/buildDailyCashSeries.js";
import { buildDailyUnitsSeries } from "./functions/buildDailyUnitsSeries.js";
import { buildDailySecurityValuesSeries } from "./functions/buildDailySecurityValuesSeries.js";
import { buildDailyPortfolioSeries } from "./functions/buildDailyPortfolioSeries.js";
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

    // Build portfolio series for each account
    const allSeries = {};

    for (const acctId of accounts) {
      console.log(`Building portfolio series for account: ${acctId}`);

      try {
        // Get activities for this account
        const activities = await getAccountActivities({
          accountId: acctId,
          databaseUrl,
        });

        if (activities.length === 0) {
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

        // Build cash series
        console.log(`  Building cash series...`);
        const cashSeries = await buildDailyCashSeries({
          activities,
          baseCurrency,
          initialCash: 0,
        });

        // Build units series
        console.log(`  Building units series...`);
        const unitsSeries = await buildDailyUnitsSeries({
          activities,
          databaseUrl,
          applySplits: true,
        });

        if (unitsSeries.length === 0) {
          console.log(`  No unit-related activities for account ${acctId}`);
          // Still create portfolio series with just cash
          const portfolioSeries = buildDailyPortfolioSeries({
            cashSeries,
            securitiesValueSeries: [],
            includeDailyReturn: true,
          });

          // Get account info
          const accountsCollection = db.collection("snaptradeaccounts");
          const account = await accountsCollection.findOne({ accountId: acctId });
          const userId = account?.userId || null;

          allSeries[acctId] = {
            userId,
            accountId: acctId,
            series: portfolioSeries,
            currency: baseCurrency,
            dateRange: {
              start: portfolioSeries[0]?.date,
              end: portfolioSeries[portfolioSeries.length - 1]?.date,
            },
            stats: calculateStats(portfolioSeries),
          };

          console.log(
            `  ✓ ${portfolioSeries.length} days (cash only, no securities)\n`
          );
          continue;
        }

        // Build securities values series
        console.log(`  Building securities values series...`);
        const securitiesValueSeries = await buildDailySecurityValuesSeries({
          unitsSeries,
          databaseUrl,
        });

        // Build portfolio series (combines cash + securities)
        console.log(`  Building portfolio series...`);
        const portfolioSeries = buildDailyPortfolioSeries({
          cashSeries,
          securitiesValueSeries,
          includeDailyReturn: true,
        });

        // Get account info
        const accountsCollection = db.collection("snaptradeaccounts");
        const account = await accountsCollection.findOne({ accountId: acctId });
        const userId = account?.userId || null;

        allSeries[acctId] = {
          userId,
          accountId: acctId,
          series: portfolioSeries,
          currency: baseCurrency,
          dateRange: {
            start: portfolioSeries[0]?.date,
            end: portfolioSeries[portfolioSeries.length - 1]?.date,
          },
          stats: calculateStats(portfolioSeries),
        };

        console.log(
          `  ✓ ${portfolioSeries.length} days (${allSeries[acctId].dateRange.start} to ${allSeries[acctId].dateRange.end})`
        );
        console.log(
          `    Last portfolio value: ${baseCurrency} ${allSeries[acctId].stats.lastPortfolioValue.toFixed(2)}`
        );
        console.log(
          `    Cash: ${baseCurrency} ${allSeries[acctId].stats.lastCash.toFixed(2)}, Securities: ${baseCurrency} ${allSeries[acctId].stats.lastSecuritiesValue.toFixed(2)}\n`
        );
      } catch (error) {
        console.log(`  ✗ Error processing account ${acctId}: ${error.message}\n`);
      }
    }

    if (Object.keys(allSeries).length === 0) {
      console.log("No portfolio series data to chart.");
      return;
    }

    // Create HTML chart
    const html = generateChartHTML(allSeries);
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
  const securitiesValues = portfolioSeries.map(
    (s) => s.securitiesValue || 0
  );
  const returns = portfolioSeries
    .map((s) => s.dailyReturn)
    .filter((r) => r !== null && !isNaN(r));

  const firstValue = portfolioValues[0] || 0;
  const lastValue = portfolioValues[portfolioSeries.length - 1] || 0;
  const totalReturn =
    firstValue > 0 ? (lastValue / firstValue - 1) * 100 : 0;

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
    avgDailyReturn: returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0,
  };
}

function generateChartHTML(allSeries) {
  const accounts = Object.keys(allSeries);
  const accountData = accounts.map((accountId) => {
    const data = allSeries[accountId];
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
                ${accounts.map((accountId, index) => 
                  `<option value="${index}">${accountId.substring(0, 8)}... (${allSeries[accountId].stats.days} days)</option>`
                ).join('')}
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

        function updateChart(accountIndex) {
            const data = accountData[accountIndex];
            const ctx = document.getElementById('portfolioChart').getContext('2d');

            // Destroy existing chart if it exists
            if (chart) {
                chart.destroy();
            }

            // Update stats
            const stats = data.stats;
            const currency = data.currency || 'USD';
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
                    <h3>Last Portfolio Value</h3>
                    <div class="value">\${currency} \${stats.lastPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Last Cash</h3>
                    <div class="value">\${currency} \${stats.lastCash.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Last Securities Value</h3>
                    <div class="value">\${currency} \${stats.lastSecuritiesValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Return</h3>
                    <div class="value \${stats.totalReturn >= 0 ? 'positive' : 'negative'}">\${stats.totalReturn >= 0 ? '+' : ''}\${stats.totalReturn.toFixed(2)}%</div>
                </div>
                <div class="stat-card">
                    <h3>Max Portfolio Value</h3>
                    <div class="value">\${currency} \${stats.maxPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Min Portfolio Value</h3>
                    <div class="value">\${currency} \${stats.minPortfolioValue.toFixed(2)}</div>
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

