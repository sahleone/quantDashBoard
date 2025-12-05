/**
 * Script to chart portfolio value series from PortfolioTimeseries collection
 *
 * Usage:
 *   DATABASE_URL=mongodb://... node metrics/chartPortfolioValue.js [accountId]
 *
 * If no accountId is provided, charts all accounts
 */

import mongoose from "mongoose";
import PortfolioTimeseries from "../quantDashBoard/server/src/models/PortfolioTimeseries.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function chartPortfolioValue(opts = {}) {
  const databaseUrl =
    opts.databaseUrl ||
    process.env.DATABASE_URL ||
    (() => {
      throw new Error(
        "DATABASE_URL environment variable is required. Please set it in your .env file."
      );
    })();

  const accountId = opts.accountId || null;

  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(databaseUrl, {
        serverSelectionTimeoutMS: 60000,
        connectTimeoutMS: 60000,
        socketTimeoutMS: 300000,
        maxPoolSize: 10,
      });
      console.log("Connected to MongoDB");
    } catch (err) {
      console.error("Failed to connect to MongoDB:", err?.message || err);
      throw err;
    }
  }

  try {
    const db = mongoose.connection.db;
    const collection = db.collection("portfoliotimeseries");

    // Build query
    const query = {};
    if (accountId) {
      query.accountId = accountId;
    }

    // Get all unique accounts using aggregation (more efficient)
    const accounts = await collection.distinct("accountId", query);

    if (accounts.length === 0) {
      console.log("No accounts found in PortfolioTimeseries");
      await mongoose.disconnect();
      return;
    }

    console.log(`Found ${accounts.length} account(s)\n`);

    const allSeries = {};

    for (const acctId of accounts) {
      console.log(`Processing account: ${acctId}`);

      // Get all portfolio timeseries data for this account, sorted by date
      // Use native MongoDB collection for better performance
      const timeseries = await collection
        .find({ accountId: acctId })
        .sort({ date: 1 })
        .toArray();

      if (timeseries.length === 0) {
        console.log(`  No data found for account ${acctId}`);
        continue;
      }

      // Get userId from first record
      const userId = timeseries[0].userId;

      // Extract data
      const dates = timeseries.map((t) => {
        const date = t.date instanceof Date ? t.date : new Date(t.date);
        return date.toISOString().split("T")[0];
      });
      const cashValues = timeseries.map((t) => t.cashValue || 0);
      const stockValues = timeseries.map((t) => t.stockValue || 0);
      const totalValues = timeseries.map((t) => t.totalValue || 0);
      const returns = timeseries.map((t) => (t.simpleReturns || 0) * 100); // Convert to percentage

      // Calculate stats
      const startValue = totalValues[0] || 0;
      const endValue = totalValues[totalValues.length - 1] || 0;
      const totalReturn = startValue !== 0 ? (endValue - startValue) / startValue : 0;
      const minValue = Math.min(...totalValues);
      const maxValue = Math.max(...totalValues);
      const avgDailyReturn =
        returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;

      allSeries[acctId] = {
        userId,
        accountId: acctId,
        currency: "USD",
        dates,
        cash: cashValues,
        securitiesValue: stockValues,
        portfolioValue: totalValues,
        dailyReturn: returns,
        stats: {
          startValue,
          endValue,
          minValue,
          maxValue,
          totalReturn,
          avgDailyReturn,
          dataPoints: timeseries.length,
          dateRange: {
            start: dates[0],
            end: dates[dates.length - 1],
          },
        },
      };

      console.log(
        `  ✓ ${timeseries.length} days (${dates[0]} to ${dates[dates.length - 1]})`
      );
      console.log(
        `    Start: $${startValue.toFixed(2)}, End: $${endValue.toFixed(2)}, Return: ${(totalReturn * 100).toFixed(2)}%`
      );
    }

    if (Object.keys(allSeries).length === 0) {
      console.log("No portfolio data to chart");
      await mongoose.disconnect();
      return;
    }

    // Generate chart HTML
    const html = generateChartHTML(allSeries);
    const outputPath = path.join(__dirname, "portfolioValueChart.html");
    fs.writeFileSync(outputPath, html);

    console.log(`\n✓ Chart created: ${outputPath}`);
    console.log(`  Open this file in your browser to view the chart\n`);

    await mongoose.disconnect();
    return { allSeries, outputPath };
  } catch (error) {
    console.error("Error charting portfolio value:", error);
    throw error;
  }
}

function generateChartHTML(allSeries) {
  const accounts = Object.keys(allSeries);
  const accountData = accounts.map((accountId) => {
    const data = allSeries[accountId];
    return {
      accountId,
      label: `Account ${accountId.substring(0, 8)}...`,
      currency: data.currency || "USD",
      dates: data.dates,
      cash: data.cash,
      securitiesValue: data.securitiesValue,
      portfolioValue: data.portfolioValue,
      dailyReturn: data.dailyReturn,
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
            gap: 20px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .checkbox-group label {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 14px;
        }
        .checkbox-group input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Portfolio Value Series Chart</h1>
        <p>Generated from PortfolioTimeseries data</p>
        
        <div class="account-selector">
            <label for="accountSelect">Select Account:</label>
            <select id="accountSelect">
                ${accountData
                  .map(
                    (data, idx) =>
                      `<option value="${idx}">${data.label} (${data.stats.dataPoints} days)</option>`
                  )
                  .join("")}
            </select>
        </div>

        <div class="checkbox-group">
            <label>
                <input type="checkbox" id="showCash" checked>
                Show Cash
            </label>
            <label>
                <input type="checkbox" id="showSecurities" checked>
                Show Securities Value
            </label>
            <label>
                <input type="checkbox" id="showPortfolio" checked>
                Show Portfolio Total
            </label>
        </div>

        <div id="statsContainer"></div>
        <div class="chart-container">
            <canvas id="portfolioChart"></canvas>
        </div>
    </div>

    <script>
        const accountData = ${JSON.stringify(accountData)};
        let chart = null;

        function updateChart() {
            const accountIndex = parseInt(document.getElementById('accountSelect').value);
            const data = accountData[accountIndex];
            const showCash = document.getElementById('showCash').checked;
            const showSecurities = document.getElementById('showSecurities').checked;
            const showPortfolio = document.getElementById('showPortfolio').checked;
            const currency = data.currency || 'USD';

            // Update stats
            const statsHtml = \`
                <div class="stats">
                    <div class="stat-card">
                        <h3>Start Value</h3>
                        <div class="value">\${currency} \${data.stats.startValue.toFixed(2)}</div>
                    </div>
                    <div class="stat-card">
                        <h3>End Value</h3>
                        <div class="value">\${currency} \${data.stats.endValue.toFixed(2)}</div>
                    </div>
                    <div class="stat-card">
                        <h3>Total Return</h3>
                        <div class="value \${data.stats.totalReturn >= 0 ? 'positive' : 'negative'}">
                            \${(data.stats.totalReturn * 100).toFixed(2)}%
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>Min Value</h3>
                        <div class="value">\${currency} \${data.stats.minValue.toFixed(2)}</div>
                    </div>
                    <div class="stat-card">
                        <h3>Max Value</h3>
                        <div class="value">\${currency} \${data.stats.maxValue.toFixed(2)}</div>
                    </div>
                    <div class="stat-card">
                        <h3>Avg Daily Return</h3>
                        <div class="value \${data.stats.avgDailyReturn >= 0 ? 'positive' : 'negative'}">
                            \${data.stats.avgDailyReturn.toFixed(3)}%
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>Data Points</h3>
                        <div class="value">\${data.stats.dataPoints}</div>
                    </div>
                    <div class="stat-card">
                        <h3>Date Range</h3>
                        <div class="value" style="font-size: 14px;">\${data.stats.dateRange.start}<br>to<br>\${data.stats.dateRange.end}</div>
                    </div>
                </div>
            \`;
            document.getElementById('statsContainer').innerHTML = statsHtml;

            // Destroy existing chart
            if (chart) {
                chart.destroy();
            }

            const ctx = document.getElementById('portfolioChart').getContext('2d');

            // Prepare datasets
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
                                text: 'Value (' + currency + ')'
                            },
                            ticks: {
                                callback: function(value) {
                                    return currency + ' ' + value.toLocaleString();
                                }
                            }
                        }
                    }
                }
            });
        }

        // Event listeners
        document.getElementById('accountSelect').addEventListener('change', updateChart);
        document.getElementById('showCash').addEventListener('change', updateChart);
        document.getElementById('showSecurities').addEventListener('change', updateChart);
        document.getElementById('showPortfolio').addEventListener('change', updateChart);

        // Initial chart
        updateChart();
    </script>
</body>
</html>`;
}

// CLI entry point
if (
  typeof process !== "undefined" &&
  process.argv &&
  process.argv[1] &&
  process.argv[1].endsWith("chartPortfolioValue.js")
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const opts = {};
      if (args[0]) {
        opts.accountId = args[0];
      }

      console.log("Starting portfolio value chart generation...");
      const result = await chartPortfolioValue(opts);
      console.log("Chart generation completed");
      process.exit(0);
    } catch (err) {
      console.error("Chart generation failed:", err);
      process.exit(2);
    }
  })();
}

export { chartPortfolioValue };

