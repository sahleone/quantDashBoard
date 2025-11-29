import React from "react";
import Chart from "../components/chart/chart";
import TabPanel from "../components/tabPanel/TabPanel";
import ConnectBrokerage from "../components/connectBrokerage/ConnectBrokerage";
import { authenticatedGet } from "../utils/apiClient";

function Dashboard({ children }) {
  // Return rates call removed — feature deprecated.

  return (
    <div className="dashboard">
      <Chart />
      <TabPanel />

      {children}
    </div>
  );
}

export default Dashboard;
