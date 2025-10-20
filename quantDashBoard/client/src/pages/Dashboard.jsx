import React, { useEffect } from "react";
import Chart from "../components/chart";
import TabPanel from "../components/TabPanel";
import ConnectBrokerage from "../components/ConnectBrokerage";
import { authenticatedGet } from "../utils/apiClient";

function Dashboard({ children }) {
  useEffect(() => {
    const fetchReturnRates = async () => {
      try {
        // Call the user-level returnRates endpoint which will pick an account using server-side credentials
        const ratesRes = await authenticatedGet("/api/accounts/returnRates");

        // If the server responds with a helpful error (no accounts or missing credentials), log it
        if (ratesRes?.data?.error) {
          console.log(
            "Return rates endpoint responded with error:",
            ratesRes.data.error
          );
          return;
        }

        // Log full output to console as requested
        console.log("Return rates full response:", ratesRes?.data);
      } catch (error) {
        console.error("Error fetching return rates:", error);
        if (error.response) {
          console.error("Server response:", error.response.data);
        }
      }
    };

    fetchReturnRates();
  }, []);

  return (
    <div className="dashboard">
      <Chart />
      <TabPanel />

      {children}
    </div>
  );
}

export default Dashboard;
