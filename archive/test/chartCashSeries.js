/**
 * Script to pull cash series from database and create a chart
 *
 * Usage:
 *   node archive/test/chartCashSeries.js [accountId]
 *
 * Or with a custom database URL:
 *   DATABASE_URL=mongodb://... node archive/test/chartCashSeries.js [accountId]
 */

import {
  ensureDbConnection,
  getDb,
  disconnectDb,
} from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pullAndChartCashSeries(opts = {}) {
  const { accountId, databaseUrl } = opts;

  try {
    await ensureDbConnection(databaseUrl);
    const db = getDb();
    const portfolioCollection = db.collection("portfoliotimeseries");

    // Build query
    const query = {};
    if (accountId) {
      query.accountId = accountId;
    }

    // Get all accounts if no accountId specified
    const accounts = accountId
      ? [accountId]
      : await portfolioCollection.distinct("accountId", query);

    if (accounts.length === 0) {
      console.log("No accounts found with cash series data.");
      return;
    }

    console.log(`Found ${accounts.length} account(s) with cash series data\n`);

    // Pull cash series for each account
    const allSeries = {};

    for (const acctId of accounts) {
      console.log(`Pulling cash series for account: ${acctId}`);

      const cashData = await portfolioCollection
        .find({
          accountId: acctId,
          cashValue: { $exists: true },
        })
        .sort({ date: 1 })
        .toArray();

      if (cashData.length === 0) {
        console.log(`  No cash data found for account ${acctId}`);
        continue;
      }

      // Get account info
      const sample = cashData[0];
      const userId = sample.userId;

      // Format data for charting
      const series = cashData.map((doc) => ({
        date: doc.date.toISOString().split("T")[0],
        cash: doc.cashValue || 0,
        totalValue: doc.totalValue || doc.cashValue || 0,
        stockValue: doc.stockValue || 0,
      }));

      allSeries[acctId] = {
        userId,
        accountId: acctId,
        series,
        dateRange: {
          start: series[0]?.date,
          end: series[series.length - 1]?.date,
        },
        stats: {
          minCash: Math.min(...series.map((s) => s.cash)),
          maxCash: Math.max(...series.map((s) => s.cash)),
          lastCash: series[series.length - 1]?.cash || 0,
          minPortfolioValue: Math.min(...series.map((s) => s.totalValue)),
          maxPortfolioValue: Math.max(...series.map((s) => s.totalValue)),
          lastPortfolioValue: series[series.length - 1]?.totalValue || 0,
          lastStockValue: series[series.length - 1]?.stockValue || 0,
          days: series.length,
        },
      };

      console.log(
        `  ✓ ${series.length} days (${allSeries[acctId].dateRange.start} to ${allSeries[acctId].dateRange.end})`
      );
      console.log(
        `    Cash range: $${allSeries[acctId].stats.minCash.toFixed(
          2
        )} to $${allSeries[acctId].stats.maxCash.toFixed(2)}`
      );
      console.log(
        `    Last cash: $${allSeries[acctId].stats.lastCash.toFixed(2)}`
      );
      console.log(
        `    Last portfolio value: $${allSeries[
          acctId
        ].stats.lastPortfolioValue.toFixed(2)}\n`
      );
    }

    // Create HTML chart
    const html = generateChartHTML(allSeries);
    const outputPath = path.join(__dirname, "cashSeriesChart.html");
    fs.writeFileSync(outputPath, html);

    console.log(`\n✓ Chart created: ${outputPath}`);
    console.log(`  Open this file in your browser to view the chart\n`);

    return { allSeries, outputPath };
  } catch (err) {
    handleError(err, "Error pulling and charting cash series");
  } finally {
    await disconnectDb();
  }
}

function generateChartHTML(allSeries) {
  const accounts = Object.keys(allSeries);
  const accountData = accounts.map((accountId) => {
    const data = allSeries[accountId];
    return {
      accountId,
      label: `Account ${accountId.substring(0, 8)}...`,
      dates: data.series.map((s) => s.date),
      cash: data.series.map((s) => s.cash),
      portfolioValue: data.series.map((s) => s.totalValue),
      stockValue: data.series.map((s) => s.stockValue),
      stats: data.stats,
    };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cash Series Chart</title>
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
        <h1>Cash Series Chart</h1>
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
            <input type="checkbox" id="showPortfolio" checked>
            <label for="showPortfolio">Show Portfolio Value</label>
            <input type="checkbox" id="showStock" checked>
            <label for="showStock">Show Stock Value</label>
        </div>
        <div class="stats" id="statsContainer"></div>
        <div class="chart-container">
            <canvas id="cashChart"></canvas>
        </div>
    </div>

    <script>
        const accountData = ${JSON.stringify(accountData)};
        let currentAccountIndex = 0;
        let chart = null;
        let showCash = true;
        let showPortfolio = true;
        let showStock = true;

        function updateChart(accountIndex) {
            const data = accountData[accountIndex];
            const ctx = document.getElementById('cashChart').getContext('2d');

            // Destroy existing chart if it exists
            if (chart) {
                chart.destroy();
            }

            // Update stats
            const stats = data.stats;
            document.getElementById('statsContainer').innerHTML = \`
                <div class="stat-card">
                    <h3>Days of Data</h3>
                    <div class="value">\${stats.days}</div>
                </div>
                <div class="stat-card">
                    <h3>Date Range</h3>
                    <div class="value">\${data.dates[0]} to \${data.dates[data.dates.length - 1]}</div>
                </div>
                <div class="stat-card">
                    <h3>Last Cash Balance</h3>
                    <div class="value">$\${stats.lastCash.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Last Portfolio Value</h3>
                    <div class="value">$\${stats.lastPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Last Stock Value</h3>
                    <div class="value">$\${stats.lastStockValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Min Cash</h3>
                    <div class="value">$\${stats.minCash.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Max Cash</h3>
                    <div class="value">$\${stats.maxCash.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Min Portfolio Value</h3>
                    <div class="value">$\${stats.minPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Max Portfolio Value</h3>
                    <div class="value">$\${stats.maxPortfolioValue.toFixed(2)}</div>
                </div>
                <div class="stat-card">
                    <h3>Account ID</h3>
                    <div class="value" style="font-size: 12px;">\${data.accountId}</div>
                </div>
            \`;

            // Prepare datasets
            const datasets = [];
            
            if (showCash) {
                datasets.push({
                    label: 'Cash Balance',
                    data: data.cash,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                });
            }

            if (showStock) {
                datasets.push({
                    label: 'Stock Value',
                    data: data.stockValue,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
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
                            text: \`Cash Series: \${data.label}\`,
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
                                    return context.dataset.label + ': $' + context.parsed.y.toFixed(2);
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
                                text: 'Value ($)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toLocaleString();
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

        document.getElementById('showPortfolio').addEventListener('change', function(e) {
            showPortfolio = e.target.checked;
            updateChart(currentAccountIndex);
        });

        document.getElementById('showStock').addEventListener('change', function(e) {
            showStock = e.target.checked;
            updateChart(currentAccountIndex);
        });
    </script>
</body>
</html>`;
}

// Main execution
const accountId = process.argv[2] || null;

pullAndChartCashSeries({ accountId })
  .then((result) => {
    if (result) {
      console.log("\n✓ Cash series chart generated successfully!");
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
