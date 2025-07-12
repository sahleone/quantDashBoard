import React from "react";
import Chart from "../chart";
import TabPanel from "../TabPanel";
import ConnectBrokerage from "../ConnectBrokerage";

function Dashboard({ children }) {
  return (
    <div className="dashboard">
      <Chart />
      <TabPanel />
      <ConnectBrokerage />
      {children}
    </div>
  );
}

export default Dashboard;
