import React from "react";
import Chart from "../components/chart";
import TabPanel from "../components/TabPanel";
import ConnectBrokerage from "../components/ConnectBrokerage";

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
