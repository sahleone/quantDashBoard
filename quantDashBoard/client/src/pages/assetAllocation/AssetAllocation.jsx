import React, { useContext, useEffect, useState } from "react";
import UserContext from "../../context/UserContext";
import { authenticatedGet } from "../../utils/apiClient";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import "./AssetAllocation.css";

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

function AssetAllocation() {
  const { userId } = useContext(UserContext) || {};
  const [assetData, setAssetData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [viewMode, setViewMode] = useState("aggregated"); // "aggregated" or "individual"
  const [individualHoldings, setIndividualHoldings] = useState([]);
  const [optionPositions, setOptionPositions] = useState([]);

  // Fetch accounts list and asset data
  useEffect(() => {
    const fetchData = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch accounts first
        const accountsResponse = await authenticatedGet("/api/accounts");
        const accountsList = accountsResponse?.data?.accounts || [];
        setAccounts(accountsList);

        // Get list of accounts to process
        let accountsToProcess = accountsList;
        if (selectedAccountId) {
          // Coerce both sides to string for comparison since HTML form values are always strings
          const selectedIdStr = String(selectedAccountId);
          accountsToProcess = accountsList.filter(
            (acc) => String(acc.accountId) === selectedIdStr
          );
        }

        // Initialize categories
        let stocksValue = 0;
        let etfValue = 0;
        let cashValue = 0;
        let cryptoValue = 0;
        let optionsValue = 0;

        // Store individual holdings for individual view
        const holdingsList = [];
        const optionsList = [];

        // Process each account
        for (const account of accountsToProcess) {
          // Get cash from balances
          // SnapTrade API returns an array of balance objects, each with a currency and cash field
          // We need to sum all cash values across all currencies
          try {
            const balancesRes = await authenticatedGet(
              `/api/accounts/balances?accountId=${encodeURIComponent(
                account.accountId
              )}`
            );
            // Handle both direct array response and wrapped response with totals
            const balancesArray =
              balancesRes?.data?.balances || balancesRes?.data || [];
            let accountCash = 0;

            if (Array.isArray(balancesArray)) {
              // Sum cash from all currency balances
              accountCash = balancesArray.reduce((sum, balance) => {
                return sum + Number(balance.cash || 0);
              }, 0);
            } else if (balancesRes?.data?.totals?.cash) {
              // Fallback to totals if available
              accountCash = Number(balancesRes.data.totals.cash || 0);
            }

            if (accountCash > 0) {
              cashValue += accountCash;
              // Add cash as a holding for individual view
              holdingsList.push({
                symbol: "Cash",
                name: "Cash",
                value: accountCash,
                type: "cash",
                accountId: account.accountId,
              });
            }
          } catch (balanceErr) {
            console.warn(
              `Could not fetch balances for account ${account.accountId}:`,
              balanceErr
            );
          }

          // Get positions for this account directly from SnapTrade API
          // Calculate market value as units * price and categorize by type.code
          try {
            const positionsRes = await authenticatedGet(
              `/api/snaptrade/positions?accountId=${encodeURIComponent(
                account.accountId
              )}`
            );
            const positions = positionsRes?.data?.positions || [];

            // Process positions
            for (const position of positions) {
              // Calculate market value from units * price
              // The database model stores units and price, but not marketValue
              const units = Number(position.units || 0);
              const price = Number(position.price || 0);

              // Calculate market value: units * price
              const marketValue = units * price;

              // Skip positions with invalid or zero market value
              if (!Number.isFinite(marketValue) || marketValue <= 0) continue;

              // Check if it's cash equivalent
              if (position.cashEquivalent || position.cash_equivalent) {
                cashValue += marketValue;
                holdingsList.push({
                  symbol: "Cash Equivalent",
                  name: position.symbol?.symbol?.description || "Cash Equivalent",
                  value: marketValue,
                  type: "cash",
                  accountId: account.accountId,
                });
                continue;
              }

              // Get type code from position
              // Path: symbol.symbol.type.code (SnapTrade API) or positionSymbol.symbol.type.code (DB model)
              const typeCode =
                position.symbol?.symbol?.type?.code?.toLowerCase() ||
                position.positionSymbol?.symbol?.type?.code?.toLowerCase() ||
                position.typeCode?.toLowerCase() ||
                "";

              // Get symbol ticker (the actual ticker like "AAPL", not the UUID)
              // Path: symbol.symbol.symbol contains the actual ticker
              const symbol =
                position.symbol?.symbol?.symbol ||
                position.symbol?.symbol?.raw_symbol ||
                position.positionSymbol?.symbol?.symbol ||
                position.positionSymbol?.symbol?.raw_symbol ||
                position.symbolTicker ||
                position.symbolId ||
                "Unknown";
              const name =
                position.symbol?.symbol?.description ||
                position.positionSymbol?.symbol?.description ||
                position.description ||
                symbol;

              // Store individual holding
              holdingsList.push({
                symbol: symbol,
                name: name,
                value: marketValue,
                type: typeCode,
                accountId: account.accountId,
              });

              // Categorize by type.code
              // Common type codes from SnapTrade API:
              // - "et" = ETF
              // - "cs" = Common Stock
              // - "cef" = Closed End Fund
              // - "oef" = Open Ended Fund
              // - "crypto" = Cryptocurrency
              // - "bnd" = Bond
              // - "ps" = Preferred Stock
              // etc.
              if (typeCode === "et") {
                // ETF
                etfValue += marketValue;
              } else if (typeCode === "crypto") {
                // Cryptocurrency -> separate category
                cryptoValue += marketValue;
              } else if (
                typeCode === "cs" ||
                typeCode === "ps" ||
                typeCode === "ad" ||
                typeCode === "rt" ||
                typeCode === "wt"
              ) {
                // Common Stock, Preferred Stock, ADR, Right, Warrant -> Stocks
                stocksValue += marketValue;
              } else if (typeCode === "cef" || typeCode === "oef") {
                // Closed/Open End Funds -> ETFs
                etfValue += marketValue;
              } else {
                // Default to stock for unknown types
                stocksValue += marketValue;
              }
            }
          } catch (positionsErr) {
            console.warn(
              `Could not fetch positions for account ${account.accountId}:`,
              positionsErr
            );
          }

          // Get option positions for this account directly from SnapTrade API
          try {
            const optionsRes = await authenticatedGet(
              `/api/snaptrade/options/holdings?accountId=${encodeURIComponent(
                account.accountId
              )}`
            );
            // Handle both direct holdings array and wrapped response
            const optionPositions =
              optionsRes?.data?.holdings || optionsRes?.data || [];

            if (!Array.isArray(optionPositions)) {
              console.warn(
                `Options data is not an array for account ${account.accountId}:`,
                optionPositions
              );
            } else {
              // Process option positions
              // Options market value calculation:
              // - Standard options contracts represent 100 shares per contract
              // - Price from SnapTrade API is typically per share
              // - Market value = price (per share) * units (contracts) * 100 (contract multiplier)
              // - For mini options, multiplier is 10 instead of 100
              for (const option of optionPositions) {
                // Extract option symbol data structure (can be nested or flat)
                const optionSymbolData = option?.symbol?.option_symbol || option?.option_symbol;
                const underlyingSymbolData = optionSymbolData?.underlying_symbol;

                // Check if API provides market_value directly (use it if available)
                const apiMarketValue = Number(
                  option.market_value || option.marketValue || 0
                );

                const price = Number(option.price || 0);
                const units = Number(option.units || 0);

                // Skip if units is zero or invalid
                if (units === 0 || isNaN(units)) {
                  continue;
                }

                let optionMarketValue = 0;

                if (apiMarketValue !== 0 && !isNaN(apiMarketValue)) {
                  // Use API-provided market value (already calculated correctly)
                  // Include both positive and negative values (long and short positions)
                  optionMarketValue = Math.abs(apiMarketValue);
                } else if (!isNaN(price)) {
                  // Calculate from price and units
                  // Determine contract multiplier
                  const isMiniOption =
                    optionSymbolData?.is_mini_option ||
                    option.is_mini_option ||
                    false;
                  const contractMultiplier = isMiniOption ? 10 : 100;

                  // Calculate market value: price (per share) * units (contracts) * multiplier
                  // Use absolute value for allocation purposes (both long and short positions count)
                  optionMarketValue = Math.abs(price * units * contractMultiplier);
                }

                // Include all options with valid units (even if market value is zero)
                // This ensures we capture all options positions
                if (optionMarketValue >= 0) {
                  optionsValue += optionMarketValue;

                  // Extract option ticker (the actual option symbol like "PLTY  260320P00066000")
                  let optionSymbol = "";
                  
                  // Try to get the option ticker first
                  if (
                    optionSymbolData?.ticker &&
                    typeof optionSymbolData.ticker === "string" &&
                    optionSymbolData.ticker.trim()
                  ) {
                    optionSymbol = optionSymbolData.ticker.trim();
                  } 
                  // Fallback to underlying symbol if ticker not available
                  else if (
                    underlyingSymbolData?.symbol &&
                    typeof underlyingSymbolData.symbol === "string"
                  ) {
                    optionSymbol = underlyingSymbolData.symbol;
                  } 
                  else if (
                    underlyingSymbolData?.raw_symbol &&
                    typeof underlyingSymbolData.raw_symbol === "string"
                  ) {
                    optionSymbol = underlyingSymbolData.raw_symbol;
                  } 
                  // Never use UUIDs - use "Unknown" instead
                  else {
                    optionSymbol = "Unknown";
                    console.warn("Could not extract option symbol from:", option);
                  }

                  // Build readable option name from option details
                  const underlyingSymbol =
                    underlyingSymbolData?.symbol ||
                    underlyingSymbolData?.raw_symbol ||
                    "";
                  const optionType =
                    optionSymbolData?.option_type || "";
                  const strikePrice =
                    optionSymbolData?.strike_price;
                  const expirationDate =
                    optionSymbolData?.expiration_date || "";

                  let optionName = "";
                  if (underlyingSymbol && optionType && strikePrice !== undefined && strikePrice !== null) {
                    // Format: "PLTY PUT $66.00 exp 2026-03-20"
                    const strikeStr = Number(strikePrice).toFixed(2);
                    optionName = `${underlyingSymbol} ${optionType} $${strikeStr}${
                      expirationDate ? ` exp ${expirationDate}` : ""
                    }`;
                  } else if (optionSymbolData?.ticker) {
                    // Use the ticker as name if we can't build a descriptive name
                    optionName = optionSymbolData.ticker.trim();
                  } else {
                    // Fallback to description or underlying symbol
                    optionName =
                      underlyingSymbolData?.description ||
                      option?.symbol?.description ||
                      option?.description ||
                      underlyingSymbol ||
                      optionSymbol;
                  }

                  optionsList.push({
                    symbol: optionSymbol,
                    name: optionName,
                    value: optionMarketValue,
                    units: Number(option.units || 0),
                    price: Number(option.price || 0),
                    accountId: account.accountId,
                  });
                }
              }
            }
          } catch (optionsErr) {
            console.warn(
              `Could not fetch option positions for account ${account.accountId}:`,
              optionsErr
            );
          }
        }

        const totalValue =
          stocksValue + etfValue + cashValue + cryptoValue + optionsValue;

        setAssetData({
          stocks: stocksValue,
          etf: etfValue,
          cash: cashValue,
          crypto: cryptoValue,
          options: optionsValue,
          total: totalValue,
        });

        // Store individual holdings and options
        setIndividualHoldings(holdingsList);
        setOptionPositions(optionsList);
      } catch (err) {
        console.error("Error fetching asset data:", err);
        setError(
          err?.response?.data?.error?.message ||
            err?.message ||
            "Failed to load asset allocation data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, selectedAccountId]);

  const handleAccountChange = (event) => {
    const value = event.target.value;
    setSelectedAccountId(value === "all" ? null : value);
  };

  const handleViewModeChange = (event) => {
    setViewMode(event.target.value);
  };

  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return "$0.00";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value, total) => {
    if (!total || total === 0) return "0.00%";
    return ((value / total) * 100).toFixed(2) + "%";
  };

  // Generate colors for individual holdings
  const generateColors = (count) => {
    const colors = [];
    const baseColors = [
      "rgba(54, 162, 235, 0.8)", // Blue
      "rgba(75, 192, 192, 0.8)", // Teal
      "rgba(255, 206, 86, 0.8)", // Yellow
      "rgba(153, 102, 255, 0.8)", // Purple
      "rgba(255, 99, 132, 0.8)", // Pink/Red
      "rgba(255, 159, 64, 0.8)", // Orange
      "rgba(199, 199, 199, 0.8)", // Grey
      "rgba(83, 102, 255, 0.8)", // Indigo
      "rgba(255, 99, 255, 0.8)", // Magenta
      "rgba(99, 255, 132, 0.8)", // Green
    ];

    for (let i = 0; i < count; i++) {
      colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
  };

  // Prepare aggregated chart data
  const aggregatedChartData = assetData
    ? {
        labels: ["Stocks", "ETFs", "Cash", "Crypto", "Options"],
        datasets: [
          {
            label: "Asset Allocation",
            data: [
              assetData.stocks,
              assetData.etf,
              assetData.cash,
              assetData.crypto,
              assetData.options,
            ],
            backgroundColor: [
              "rgba(54, 162, 235, 0.8)", // Blue for stocks
              "rgba(75, 192, 192, 0.8)", // Teal for ETFs
              "rgba(255, 206, 86, 0.8)", // Yellow for cash
              "rgba(153, 102, 255, 0.8)", // Purple for crypto
              "rgba(255, 99, 132, 0.8)", // Pink/Red for options
            ],
            borderColor: [
              "rgba(54, 162, 235, 1)",
              "rgba(75, 192, 192, 1)",
              "rgba(255, 206, 86, 1)",
              "rgba(153, 102, 255, 1)",
              "rgba(255, 99, 132, 1)",
            ],
            borderWidth: 2,
          },
        ],
      }
    : null;

  // Prepare individual holdings chart data
  const prepareIndividualChartData = () => {
    if (!individualHoldings.length || !assetData) return null;

    // Sort holdings by value (descending)
    const sortedHoldings = [...individualHoldings].sort(
      (a, b) => b.value - a.value
    );

    // Show all individual holdings in the pie chart
    const chartLabels = [];
    const chartData = [];

    sortedHoldings.forEach((holding) => {
      // Use symbol if available, otherwise use name
      const label = holding.symbol || holding.name || "Unknown";
      chartLabels.push(label);
      chartData.push(holding.value);
    });

    const colors = generateColors(chartLabels.length);

    return {
      labels: chartLabels,
      datasets: [
        {
          label: "Individual Holdings",
          data: chartData,
          backgroundColor: colors,
          borderColor: colors.map((c) => c.replace("0.8", "1")),
          borderWidth: 2,
        },
      ],
    };
  };

  const individualChartData = prepareIndividualChartData();

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: {
          padding: 20,
          font: {
            size: 14,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.label || "";
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage =
              total > 0 ? ((value / total) * 100).toFixed(2) : "0.00";
            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
          },
        },
      },
    },
  };

  const individualChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // Remove legend from side
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const label = context.label || "";
            const value = context.parsed || 0;
            // Calculate total excluding options for percentage
            const totalExcludingOptions = assetData
              ? assetData.total - assetData.options
              : context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage =
              totalExcludingOptions > 0
                ? ((value / totalExcludingOptions) * 100).toFixed(2)
                : "0.00";
            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
          },
        },
      },
    },
  };

  if (!userId) {
    return (
      <div className="asset-allocation">
        <div className="asset-allocation-header">
          <h1>Asset Allocation</h1>
          <p>Please log in to view your asset allocation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="asset-allocation">
      <div className="asset-allocation-header">
        <h1>Asset Allocation</h1>
        <div className="header-controls">
          <div className="portfolio-selector">
            <label htmlFor="portfolio-select">Portfolio: </label>
            <select
              id="portfolio-select"
              value={selectedAccountId || "all"}
              onChange={handleAccountChange}
              className="portfolio-select-dropdown"
            >
              <option value="all">All Portfolios</option>
              {accounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.accountName || account.accountId}{" "}
                  {account.institutionName ? `(${account.institutionName})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="view-mode-selector">
            <label htmlFor="view-mode-select">View: </label>
            <select
              id="view-mode-select"
              value={viewMode}
              onChange={handleViewModeChange}
              className="portfolio-select-dropdown"
            >
              <option value="aggregated">Aggregated View</option>
              <option value="individual">Individual Holdings</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="asset-allocation-loading">
          Loading asset allocation data...
        </div>
      ) : error ? (
        <div className="asset-allocation-error">Error: {error}</div>
      ) : !assetData || assetData.total === 0 ? (
        <div className="asset-allocation-empty">
          No asset data available. Connect a brokerage account to view your
          asset allocation.
        </div>
      ) : viewMode === "aggregated" ? (
        <div className="asset-allocation-content">
          <div className="chart-container">
            <Pie data={aggregatedChartData} options={chartOptions} />
          </div>

          <div className="asset-breakdown">
            <h2>Breakdown</h2>
            <div className="breakdown-list">
              <div className="breakdown-item">
                <div className="breakdown-label">
                  <span
                    className="breakdown-color"
                    style={{ backgroundColor: "rgba(54, 162, 235, 0.8)" }}
                  ></span>
                  <span>Stocks</span>
                </div>
                <div className="breakdown-values">
                  <span className="breakdown-value">
                    {formatCurrency(assetData.stocks)}
                  </span>
                  <span className="breakdown-percent">
                    {formatPercent(assetData.stocks, assetData.total)}
                  </span>
                </div>
              </div>

              <div className="breakdown-item">
                <div className="breakdown-label">
                  <span
                    className="breakdown-color"
                    style={{ backgroundColor: "rgba(75, 192, 192, 0.8)" }}
                  ></span>
                  <span>ETFs</span>
                </div>
                <div className="breakdown-values">
                  <span className="breakdown-value">
                    {formatCurrency(assetData.etf)}
                  </span>
                  <span className="breakdown-percent">
                    {formatPercent(assetData.etf, assetData.total)}
                  </span>
                </div>
              </div>

              <div className="breakdown-item">
                <div className="breakdown-label">
                  <span
                    className="breakdown-color"
                    style={{ backgroundColor: "rgba(255, 206, 86, 0.8)" }}
                  ></span>
                  <span>Cash</span>
                </div>
                <div className="breakdown-values">
                  <span className="breakdown-value">
                    {formatCurrency(assetData.cash)}
                  </span>
                  <span className="breakdown-percent">
                    {formatPercent(assetData.cash, assetData.total)}
                  </span>
                </div>
              </div>

              <div className="breakdown-item">
                <div className="breakdown-label">
                  <span
                    className="breakdown-color"
                    style={{ backgroundColor: "rgba(153, 102, 255, 0.8)" }}
                  ></span>
                  <span>Crypto</span>
                </div>
                <div className="breakdown-values">
                  <span className="breakdown-value">
                    {formatCurrency(assetData.crypto)}
                  </span>
                  <span className="breakdown-percent">
                    {formatPercent(assetData.crypto, assetData.total)}
                  </span>
                </div>
              </div>

              <div className="breakdown-item">
                <div className="breakdown-label">
                  <span
                    className="breakdown-color"
                    style={{ backgroundColor: "rgba(255, 99, 132, 0.8)" }}
                  ></span>
                  <span>Options</span>
                </div>
                <div className="breakdown-values">
                  <span className="breakdown-value">
                    {formatCurrency(assetData.options)}
                  </span>
                  <span className="breakdown-percent">
                    {formatPercent(assetData.options, assetData.total)}
                  </span>
                </div>
              </div>

              <div className="breakdown-total">
                <div className="breakdown-label">
                  <span>Total Portfolio Value</span>
                </div>
                <div className="breakdown-values">
                  <span className="breakdown-value breakdown-total-value">
                    {formatCurrency(assetData.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="asset-allocation-content individual-view">
          <div className="chart-container">
            {individualChartData ? (
              <Pie data={individualChartData} options={individualChartOptions} />
            ) : (
              <div className="no-data-message">
                No individual holdings data available.
              </div>
            )}
          </div>

          {optionPositions.length > 0 && (
            <div className="options-section">
              <h2>Options Positions</h2>
              <div className="options-table-container">
                <table className="options-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Name</th>
                      <th>Contracts</th>
                      <th>Price</th>
                      <th>Market Value</th>
                      <th>% of Portfolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optionPositions
                      .sort((a, b) => b.value - a.value)
                      .map((option, index) => (
                        <tr key={index}>
                          <td>{option.symbol}</td>
                          <td>{option.name}</td>
                          <td>{option.units}</td>
                          <td>{formatCurrency(option.price)}</td>
                          <td>{formatCurrency(option.value)}</td>
                          <td>
                            {formatPercent(option.value, assetData.total)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="options-total">
                      <td colSpan="4">Total Options Value</td>
                      <td>{formatCurrency(assetData.options)}</td>
                      <td>
                        {formatPercent(assetData.options, assetData.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AssetAllocation;
