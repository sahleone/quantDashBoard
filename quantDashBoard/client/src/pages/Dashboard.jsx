import React from "react";
import Chart from "../components/chart/chart";
import TabPanel from "../components/tabPanel/TabPanel";
import ConnectBrokerage from "../components/connectBrokerage/ConnectBrokerage";

function Dashboard({ children }) {
  return (
    <div className="dashboard">
      <Chart />
      <TabPanel />

      {children}
    </div>
  );
}

export default Dashboard;
