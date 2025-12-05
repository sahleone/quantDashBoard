/**
 * Script to pull units series from activities and create a chart
 *
 * Usage:
 *   node archive/test/chartUnitsSeries.js [accountId]
 *
 * Or with a custom database URL:
 *   DATABASE_URL=mongodb://... node archive/test/chartUnitsSeries.js [accountId]
 */

import { ensureDbConnection, getDb, disconnectDb } from "./utils/dbConnection.js";
import { handleError } from "./utils/errorHandling.js";
import { getAccountActivities } from "./functions/getAccountActivities.js";
import { buildDailyUnitsSeries } from "./functions/buildDailyUnitsSeries.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pullAndChartUnitsSeries(opts = {}) {
  const { accountId, databaseUrl } = opts;

  try {
    await ensureDbConnection(databaseUrl);
    const db = getDb();

    // Get all accounts if no accountId specified
    let accounts = [];
    if (accountId) {
      accounts = [accountId];
    } else {
      // Get all account IDs from activities collection
      const activitiesCollection = db.collection("snaptradeaccountactivities");
      accounts = await activitiesCollection.distinct("accountId");
    }

    if (accounts.length === 0) {
      console.log("No accounts found.");
      return;
    }

    console.log(`Found ${accounts.length} account(s)\n`);

    // Pull units series for each account
    const allSeries = {};

    for (const acctId of accounts) {
      console.log(`Building units series for account: ${acctId}`);

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

        // Build units series
        const unitsSeries = await buildDailyUnitsSeries({
          activities,
          databaseUrl,
          applySplits: true,
        });

        if (unitsSeries.length === 0) {
          console.log(`  No unit-related activities for account ${acctId}`);
          continue;
        }

        // Get account info
        const accountsCollection = db.collection("snaptradeaccounts");
        const account = await accountsCollection.findOne({ accountId: acctId });
        const userId = account?.userId || null;

        // Collect all unique symbols
        const allSymbols = new Set();
        unitsSeries.forEach((entry) => {
          Object.keys(entry.positions).forEach((sym) => allSymbols.add(sym));
        });

        // Calculate stats
        const symbolStats = {};
        allSymbols.forEach((sym) => {
          const unitsOverTime = unitsSeries.map((entry) => entry.positions[sym] || 0);
          symbolStats[sym] = {
            maxUnits: Math.max(...unitsOverTime),
            minUnits: Math.min(...unitsOverTime),
            lastUnits: unitsOverTime[unitsOverTime.length - 1] || 0,
            daysHeld: unitsOverTime.filter((u) => u > 0).length,
          };
        });

        allSeries[acctId] = {
          userId,
          accountId: acctId,
          series: unitsSeries,
          symbols: Array.from(allSymbols).sort(),
          symbolStats,
          dateRange: {
            start: unitsSeries[0]?.date,
            end: unitsSeries[unitsSeries.length - 1]?.date,
          },
          stats: {
            totalDays: unitsSeries.length,
            uniqueSymbols: allSymbols.size,
            lastPositions: unitsSeries[unitsSeries.length - 1]?.positions || {},
          },
        };

        console.log(
          `  ✓ ${unitsSeries.length} days (${allSeries[acctId].dateRange.start} to ${allSeries[acctId].dateRange.end})`
        );
        console.log(`    ${allSymbols.size} unique symbols tracked\n`);
      } catch (error) {
        console.log(`  ✗ Error processing account ${acctId}: ${error.message}\n`);
      }
    }

    if (Object.keys(allSeries).length === 0) {
      console.log("No units series data to chart.");
      return;
    }

    // Create HTML chart
    const html = generateChartHTML(allSeries);
    const outputPath = path.join(__dirname, "unitsSeriesChart.html");
    fs.writeFileSync(outputPath, html);

    console.log(`\n✓ Chart created: ${outputPath}`);
    console.log(`  Open this file in your browser to view the chart\n`);

    return { allSeries, outputPath };
  } catch (err) {
    handleError(err, "Error pulling and charting units series");
  } finally {
    await disconnectDb();
  }
}

function generateChartHTML(allSeries) {
  const accounts = Object.keys(allSeries);
  const accountData = accounts.map((accountId) => {
    const data = allSeries[accountId];
    const dates = data.series.map((s) => s.date);
    
    // Prepare data for each symbol
    const symbolData = {};
    data.symbols.forEach((sym) => {
      symbolData[sym] = data.series.map((entry) => entry.positions[sym] || 0);
    });

    return {
      accountId,
      label: `Account ${accountId.substring(0, 8)}...`,
      dates,
      symbols: data.symbols,
      symbolData,
      symbolStats: data.symbolStats,
      stats: data.stats,
    };
  });

  // Generate color palette for symbols
  const colors = [
    "rgb(75, 192, 192)",
    "rgb(255, 99, 132)",
    "rgb(54, 162, 235)",
    "rgb(255, 206, 86)",
    "rgb(153, 102, 255)",
    "rgb(255, 159, 64)",
    "rgb(199, 199, 199)",
    "rgb(83, 102, 255)",
    "rgb(255, 99, 255)",
    "rgb(99, 255, 132)",
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Units Series Chart</title>
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
        .controls {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .control-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .control-group label {
            font-weight: 600;
            font-size: 14px;
            color: #666;
        }
        .control-group select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .symbol-checkboxes {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 10px;
            max-height: 200px;
            overflow-y: auto;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        .symbol-checkbox {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .symbol-checkbox input[type="checkbox"] {
            margin: 0;
        }
        .symbol-checkbox label {
            font-size: 13px;
            cursor: pointer;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
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
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
        .stat-card .value {
            font-size: 20px;
            font-weight: bold;
            color: #333;
        }
        .chart-container {
            position: relative;
            height: 600px;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Units Series Chart</h1>
        <div class="controls">
            <div class="control-group">
                <label for="accountSelect">Account:</label>
                <select id="accountSelect">
                    ${accounts.map((accountId, index) => 
                      `<option value="${index}">${accountId.substring(0, 8)}... (${allSeries[accountId].stats.uniqueSymbols} symbols)</option>`
                    ).join('')}
                </select>
            </div>
        </div>
        <div id="symbolControls"></div>
        <div class="stats" id="statsContainer"></div>
        <div class="chart-container">
            <canvas id="unitsChart"></canvas>
        </div>
    </div>

    <script>
        const accountData = ${JSON.stringify(accountData)};
        let currentAccountIndex = 0;
        let chart = null;
        let visibleSymbols = new Set();

        function updateChart(accountIndex) {
            const data = accountData[accountIndex];
            const ctx = document.getElementById('unitsChart').getContext('2d');

            // Destroy existing chart if it exists
            if (chart) {
                chart.destroy();
            }

            // Initialize visible symbols (show first 10 by default)
            if (visibleSymbols.size === 0) {
                data.symbols.slice(0, 10).forEach(sym => visibleSymbols.add(sym));
            }

            // Update symbol checkboxes
            const symbolControls = document.getElementById('symbolControls');
            symbolControls.innerHTML = \`
                <div class="control-group">
                    <label>Symbols (showing \${visibleSymbols.size} of \${data.symbols.length}):</label>
                    <div class="symbol-checkboxes">
                        \${data.symbols.map(sym => \`
                            <div class="symbol-checkbox">
                                <input type="checkbox" id="sym-\${sym}" value="\${sym}" \${visibleSymbols.has(sym) ? 'checked' : ''}>
                                <label for="sym-\${sym}">\${sym}</label>
                            </div>
                        \`).join('')}
                    </div>
                </div>
            \`;

            // Add event listeners to checkboxes
            data.symbols.forEach(sym => {
                const checkbox = document.getElementById(\`sym-\${sym}\`);
                if (checkbox) {
                    checkbox.addEventListener('change', function() {
                        if (this.checked) {
                            visibleSymbols.add(sym);
                        } else {
                            visibleSymbols.delete(sym);
                        }
                        updateChart(accountIndex);
                    });
                }
            });

            // Update stats
            const stats = data.stats;
            const visibleStats = data.symbols.filter(s => visibleSymbols.has(s));
            const totalVisibleUnits = visibleStats.reduce((sum, sym) => {
                const lastUnits = data.symbolStats[sym].lastUnits;
                return sum + lastUnits;
            }, 0);

            document.getElementById('statsContainer').innerHTML = \`
                <div class="stat-card">
                    <h3>Days of Data</h3>
                    <div class="value">\${stats.totalDays}</div>
                </div>
                <div class="stat-card">
                    <h3>Date Range</h3>
                    <div class="value" style="font-size: 14px;">\${data.dates[0]} to \${data.dates[data.dates.length - 1]}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Symbols</h3>
                    <div class="value">\${stats.uniqueSymbols}</div>
                </div>
                <div class="stat-card">
                    <h3>Visible Symbols</h3>
                    <div class="value">\${visibleSymbols.size}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Units (Visible)</h3>
                    <div class="value">\${totalVisibleUnits.toFixed(2)}</div>
                </div>
            \`;

            // Prepare datasets for visible symbols
            const datasets = [];
            const colors = [
                "rgb(75, 192, 192)",
                "rgb(255, 99, 132)",
                "rgb(54, 162, 235)",
                "rgb(255, 206, 86)",
                "rgb(153, 102, 255)",
                "rgb(255, 159, 64)",
                "rgb(199, 199, 199)",
                "rgb(83, 102, 255)",
                "rgb(255, 99, 255)",
                "rgb(99, 255, 132)",
                "rgb(255, 159, 64)",
                "rgb(54, 162, 235)",
                "rgb(255, 99, 132)",
                "rgb(75, 192, 192)",
                "rgb(153, 102, 255)",
            ];

            Array.from(visibleSymbols).forEach((sym, index) => {
                datasets.push({
                    label: sym,
                    data: data.symbolData[sym],
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                });
            });

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
                            text: \`Units Series: \${data.label}\`,
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
                                    return context.dataset.label + ': ' + context.parsed.y.toFixed(4) + ' units';
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
                                text: 'Units Held'
                            },
                            ticks: {
                                callback: function(value) {
                                    return value.toFixed(2);
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
            visibleSymbols.clear(); // Reset visible symbols when switching accounts
            updateChart(currentAccountIndex);
        });
    </script>
</body>
</html>`;
}

// Main execution
const accountId = process.argv[2] || null;

pullAndChartUnitsSeries({ accountId })
  .then((result) => {
    if (result) {
      console.log("\n✓ Units series chart generated successfully!");
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

