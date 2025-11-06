import React, { useState } from "react";
import "./TabPanel.css";

import Positions from "../positions/positions";

const tabs = [
  { label: "Performance", key: "performance" },
  { label: "Positions", key: "positions" },
  { label: "Risk", key: "risk" },
  { label: "Factor", key: "factor" },
  { label: "Distribution", key: "distribution" },
  { label: "Correlation", key: "correlation" },
];

function TabPanel() {
  const [activeTab, setActiveTab] = useState(tabs[0].key);

  const renderContent = () => {
    switch (activeTab) {
      case "performance":
        return <div> Total Return, Sharpe, Sortino</div>;
      case "positions":
        return <Positions />;
      case "risk":
        return <div>Volatility, Beta, VaR, CVaR, Drawdownt</div>;
      case "factor":
        return <div>CAPM/Fama-French/Carhart </div>;
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
