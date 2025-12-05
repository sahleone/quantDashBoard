import React from "react";
import "./chart.css";
import LineGraph from "../lineGraph/LineGraph";

function Chart({ portfolioValue }) {
  if (!portfolioValue || !portfolioValue.points || portfolioValue.points.length === 0) {
    return (
      <div className="chart">
        <h2>Portfolio Value</h2>
        <p>No portfolio data available. Connect a brokerage account to view your portfolio value over time.</p>
      </div>
    );
  }

  // Extract dates and equity values from portfolio value points
  // Fix timezone issue: date strings from server (YYYY-MM-DD) are interpreted as UTC midnight
  // Parse explicitly as UTC to avoid day shift when converting to local time
  const labels = portfolioValue.points.map((point) => {
    const dateStr = point.date || point.asOfDate;
    if (!dateStr) return "";
    
    // If date string is in YYYY-MM-DD format, parse as UTC to avoid timezone shift
    // Otherwise, parse normally (handles ISO strings with timezone info)
    let date;
    if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // YYYY-MM-DD format - parse as UTC midnight
      const [year, month, day] = dateStr.split("-").map(Number);
      date = new Date(Date.UTC(year, month - 1, day));
    } else {
      // ISO string or other format - parse normally
      date = new Date(dateStr);
    }
    
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  const equityData = portfolioValue.points.map((point) => point.equity || 0);

  // If benchmark data is available, include it
  const benchmarkData = portfolioValue.points.map((point) => point.benchmark || null);
  const hasBenchmark = benchmarkData.some((val) => val !== null);

  return (
    <div className="chart">
      <h2>Portfolio Value</h2>
      {portfolioValue.summary && (
        <div className="chart-summary">
          <div>
            <span className="summary-label">Start Value: </span>
            <span className="summary-value">
              ${portfolioValue.summary.startValue?.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) || "0.00"}
            </span>
          </div>
          <div>
            <span className="summary-label">End Value: </span>
            <span className="summary-value">
              ${portfolioValue.summary.endValue?.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) || "0.00"}
            </span>
          </div>
          {portfolioValue.summary.totalReturn !== undefined && (
            <div>
              <span className="summary-label">Total Return: </span>
              <span
                className="summary-value"
                style={{
                  color: portfolioValue.summary.totalReturn >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {(portfolioValue.summary.totalReturn * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      )}
      <div className="chart-container">
        {hasBenchmark ? (
          <div className="line-graph-container">
            {/* For now, show portfolio equity. Can be enhanced to show both portfolio and benchmark */}
            <LineGraph
              ticker="Portfolio Equity"
              labels={labels}
              data={equityData}
            />
          </div>
        ) : (
          <LineGraph
            ticker="Portfolio Equity"
            labels={labels}
            data={equityData}
          />
        )}
      </div>
    </div>
  );
}

export default Chart;