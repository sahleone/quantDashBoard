import React from "react";
import Nav from "./navbar";
import Chart from "./chart";
import TabPanel from "./TabPanel";
import ConnectBrokerage from "./ConnectBrokerage";

function DashboardLayout({ children }) {
  return (
    <div className="dashboard-layout">
      <Nav />
      <Chart />
      <TabPanel />
      <ConnectBrokerage />
    </div>
  );
}

export default DashboardLayout;
