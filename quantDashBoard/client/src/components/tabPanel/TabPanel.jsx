import React, { useState } from "react";
import "./TabPanel.css";

const tabs = [
  { label: "Performance", key: "performance" },
  { label: "Risk", key: "risk" },
  { label: "Factor", key: "factor" },
  { label: "Distribution", key: "distribution" },
  { label: "Correlation", key: "correlation" },
];

const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatNumber = (value, decimals = 4) => {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

function TabPanel({ performanceMetrics, riskMetrics, factorMetrics }) {
  const [activeTab, setActiveTab] = useState(tabs[0].key);

  const renderPerformanceContent = () => {
    if (!performanceMetrics || !performanceMetrics.performance) {
      return <div>No performance data available.</div>;
    }

    const perf = performanceMetrics.performance;

    return (
      <div className="metrics-content">
        <h3>Performance Metrics</h3>
        <div className="metrics-grid">
          {perf.totalReturn !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Total Return:</span>
              <span
                className="metric-value"
                style={{
                  color: perf.totalReturn >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(perf.totalReturn)}
              </span>
            </div>
          )}
          {perf.sharpe !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Sharpe Ratio:</span>
              <span className="metric-value">{formatNumber(perf.sharpe, 2)}</span>
            </div>
          )}
          {perf.sortino !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Sortino Ratio:</span>
              <span className="metric-value">{formatNumber(perf.sortino, 2)}</span>
            </div>
          )}
          {perf.ytd !== undefined && (
            <div className="metric-item">
              <span className="metric-label">YTD Return:</span>
              <span
                className="metric-value"
                style={{
                  color: perf.ytd >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(perf.ytd)}
              </span>
            </div>
          )}
          {perf.volatility !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Volatility:</span>
              <span className="metric-value">{formatPercent(perf.volatility)}</span>
            </div>
          )}
          {perf.beta !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Beta:</span>
              <span className="metric-value">{formatNumber(perf.beta, 2)}</span>
            </div>
          )}
          {perf.maxDrawdown !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Max Drawdown:</span>
              <span
                className="metric-value"
                style={{
                  color: perf.maxDrawdown >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(perf.maxDrawdown)}
              </span>
            </div>
          )}
          {perf.calmar !== undefined && perf.calmar !== null && (
            <div className="metric-item">
              <span className="metric-label">Calmar Ratio:</span>
              <span className="metric-value">{formatNumber(perf.calmar, 2)}</span>
            </div>
          )}
          {perf.cagr !== undefined && perf.cagr !== null && (
            <div className="metric-item">
              <span className="metric-label">CAGR:</span>
              <span
                className="metric-value"
                style={{
                  color: perf.cagr >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(perf.cagr)}
              </span>
            </div>
          )}
          {perf.alpha !== undefined && perf.alpha !== null && (
            <div className="metric-item">
              <span className="metric-label">Alpha (CAPM):</span>
              <span
                className="metric-value"
                style={{
                  color: perf.alpha >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(perf.alpha)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRiskContent = () => {
    if (!riskMetrics || !riskMetrics.riskMetrics) {
      return <div>No risk data available.</div>;
    }

    const risk = riskMetrics.riskMetrics;

    return (
      <div className="metrics-content">
        <h3>Risk Metrics</h3>
        <div className="metrics-grid">
          {risk.volatility !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Volatility:</span>
              <span className="metric-value">{formatPercent(risk.volatility)}</span>
            </div>
          )}
          {risk.beta !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Beta:</span>
              <span className="metric-value">{formatNumber(risk.beta, 2)}</span>
            </div>
          )}
          {risk.var95 !== undefined && risk.var95 !== null && (
            <div className="metric-item">
              <span className="metric-label">VaR (95%):</span>
              <span className="metric-value">{formatPercent(risk.var95)}</span>
            </div>
          )}
          {risk.var !== undefined && risk.var !== null && (
            <div className="metric-item">
              <span className="metric-label">VaR (Value at Risk):</span>
              <span className="metric-value">{formatPercent(risk.var)}</span>
            </div>
          )}
          {risk.cvar95 !== undefined && risk.cvar95 !== null && (
            <div className="metric-item">
              <span className="metric-label">CVaR (95%):</span>
              <span className="metric-value">{formatPercent(risk.cvar95)}</span>
            </div>
          )}
          {risk.cvar !== undefined && risk.cvar !== null && (
            <div className="metric-item">
              <span className="metric-label">CVaR (Conditional VaR):</span>
              <span className="metric-value">{formatPercent(risk.cvar)}</span>
            </div>
          )}
          {risk.downsideDeviation !== undefined && risk.downsideDeviation !== null && (
            <div className="metric-item">
              <span className="metric-label">Downside Deviation:</span>
              <span className="metric-value">{formatPercent(risk.downsideDeviation)}</span>
            </div>
          )}
          {risk.omega !== undefined && risk.omega !== null && (
            <div className="metric-item">
              <span className="metric-label">Omega Ratio:</span>
              <span className="metric-value">
                {risk.omega === Infinity ? "∞" : formatNumber(risk.omega, 2)}
              </span>
            </div>
          )}
          {risk.sharpeConfidenceInterval !== undefined && risk.sharpeConfidenceInterval !== null && (
            <div className="metric-item">
              <span className="metric-label">Sharpe Ratio (95% CI):</span>
              <span className="metric-value">
                {formatNumber(risk.sharpeConfidenceInterval.sharpeRatio || risk.sharpeConfidenceInterval, 2)}
                {risk.sharpeConfidenceInterval.lowerBound !== undefined && risk.sharpeConfidenceInterval.upperBound !== undefined && (
                  <span style={{ fontSize: "0.85em", color: "#666", marginLeft: "8px" }}>
                    [{formatNumber(risk.sharpeConfidenceInterval.lowerBound, 2)}, {formatNumber(risk.sharpeConfidenceInterval.upperBound, 2)}]
                  </span>
                )}
              </span>
            </div>
          )}
          {risk.maxDrawdown !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Max Drawdown:</span>
              <span
                className="metric-value"
                style={{
                  color: risk.maxDrawdown >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(risk.maxDrawdown)}
              </span>
            </div>
          )}
          {risk.correlation !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Correlation (to Benchmark):</span>
              <span className="metric-value">{formatNumber(risk.correlation, 2)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFactorContent = () => {
    if (!factorMetrics || !factorMetrics.exposures) {
      return <div>No factor exposure data available.</div>;
    }

    const exposures = factorMetrics.exposures;
    const stats = factorMetrics.statistics;

    return (
      <div className="metrics-content">
        <h3>Factor Exposures ({factorMetrics.model || "FF3"})</h3>
        <div className="metrics-grid">
          {exposures.market !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Market (Beta):</span>
              <span className="metric-value">{formatNumber(exposures.market, 2)}</span>
            </div>
          )}
          {exposures.smb !== undefined && (
            <div className="metric-item">
              <span className="metric-label">SMB (Small Minus Big):</span>
              <span className="metric-value">{formatNumber(exposures.smb, 2)}</span>
            </div>
          )}
          {exposures.hml !== undefined && (
            <div className="metric-item">
              <span className="metric-label">HML (High Minus Low):</span>
              <span className="metric-value">{formatNumber(exposures.hml, 2)}</span>
            </div>
          )}
          {exposures.umd !== undefined && (
            <div className="metric-item">
              <span className="metric-label">UMD (Momentum):</span>
              <span className="metric-value">{formatNumber(exposures.umd, 2)}</span>
            </div>
          )}
          {exposures.rmw !== undefined && (
            <div className="metric-item">
              <span className="metric-label">RMW (Robust Minus Weak):</span>
              <span className="metric-value">{formatNumber(exposures.rmw, 2)}</span>
            </div>
          )}
          {exposures.cma !== undefined && (
            <div className="metric-item">
              <span className="metric-label">CMA (Conservative Minus Aggressive):</span>
              <span className="metric-value">{formatNumber(exposures.cma, 2)}</span>
            </div>
          )}
          {exposures.alpha !== undefined && (
            <div className="metric-item">
              <span className="metric-label">Alpha:</span>
              <span
                className="metric-value"
                style={{
                  color: exposures.alpha >= 0 ? "#0a8a00" : "#d32f2f",
                }}
              >
                {formatPercent(exposures.alpha)}
              </span>
            </div>
          )}
        </div>
        {stats && (
          <div className="metrics-stats">
            <h4>Statistics</h4>
            {stats.rSquared !== undefined && (
              <div className="metric-item">
                <span className="metric-label">R²:</span>
                <span className="metric-value">{formatNumber(stats.rSquared, 4)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "performance":
        return renderPerformanceContent();
      case "risk":
        return renderRiskContent();
      case "factor":
        return renderFactorContent();
      case "distribution":
        return <div>Skewness, Kurtosis, Tail risk stats</div>;
      case "correlation":
        return <div>Correlation content</div>;
      default:
        return null;
    }
  };

  return (
    <div className="tab-panel">
      <ul className="tab-panel-tabs">
        {tabs.map((tab) => (
          <li
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
            style={{ cursor: "pointer" }}
          >
            {tab.label}
          </li>
        ))}
      </ul>
      <div className="tab-panel-content">{renderContent()}</div>
    </div>
  );
}

export default TabPanel;
