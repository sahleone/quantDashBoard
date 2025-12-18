import React, { useContext, useEffect, useState } from "react";
import Chart from "../components/chart/chart";
import TabPanel from "../components/tabPanel/TabPanel";
import ConnectBrokerage from "../components/connectBrokerage/ConnectBrokerage";
import UserContext from "../context/UserContext";
import { authenticatedGet } from "../utils/apiClient";
import "./Dashboard.css";

function Dashboard({ children }) {
  const { userId } = useContext(UserContext) || {};
  const [portfolioValue, setPortfolioValue] = useState(null);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [riskMetrics, setRiskMetrics] = useState(null);
  const [factorMetrics, setFactorMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedRange, setSelectedRange] = useState("YTD");

  // Fetch accounts list
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!userId) return;

      try {
        const response = await authenticatedGet("/api/accounts");
        const accountsList = response?.data?.accounts || [];
        setAccounts(accountsList);
      } catch (err) {
        console.error("Error fetching accounts:", err);
      }
    };

    fetchAccounts();
  }, [userId]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Build query params with optional accountId
        const accountParam = selectedAccountId
          ? `&accountId=${encodeURIComponent(selectedAccountId)}`
          : "";

        // Fetch all dashboard data in parallel
        // Server extracts userId from authenticated user (req.user) set by auth middleware
        const [portfolioValueRes, performanceRes, riskRes, factorRes] =
          await Promise.allSettled([
            authenticatedGet(
              `/api/portfolio/value?range=${selectedRange}${accountParam}`
            ),
            authenticatedGet(
              `/api/metrics/performance?range=${selectedRange}${accountParam}`
            ),
            authenticatedGet(
              `/api/metrics/risk?range=${selectedRange}${accountParam}`
            ),
            authenticatedGet(
              `/api/metrics/factors?model=FF3&range=${selectedRange}${accountParam}`
            ),
          ]);

        // Track errors to set error state if all critical requests fail
        const errors = [];

        // Handle portfolio value response
        if (portfolioValueRes.status === "fulfilled") {
          const data = portfolioValueRes.value?.data;
          if (data?.error) {
            const errorMsg = data.error.message || "Portfolio value API error";
            console.error("Portfolio value API error:", data.error);
            errors.push(errorMsg);
          } else {
            setPortfolioValue(data || null);
            // Debug: Log TWR metrics if available
            if (data?.twrMetrics) {
              console.log("TWR Metrics received:", data.twrMetrics);
            } else {
              console.log("No TWR metrics in response");
            }
          }
        } else {
          const reason = portfolioValueRes.reason;
          const errorMsg =
            reason?.response?.data?.error?.message ||
            reason?.message ||
            "Failed to fetch portfolio value";
          console.error("Error fetching portfolio value:", {
            message: errorMsg,
            status: reason?.response?.status,
            data: reason?.response?.data,
          });
          errors.push(errorMsg);
        }

        // Handle performance metrics response
        if (performanceRes.status === "fulfilled") {
          const data = performanceRes.value?.data;
          if (data?.error) {
            const errorMsg =
              data.error.message || "Performance metrics API error";
            console.error("Performance metrics API error:", data.error);
            errors.push(errorMsg);
          } else {
            setPerformanceMetrics(data || null);
          }
        } else {
          const reason = performanceRes.reason;
          const errorMsg =
            reason?.response?.data?.error?.message ||
            reason?.message ||
            "Failed to fetch performance metrics";
          console.error("Error fetching performance metrics:", {
            message: errorMsg,
            status: reason?.response?.status,
          });
          errors.push(errorMsg);
        }

        // Handle risk metrics response
        if (riskRes.status === "fulfilled") {
          const data = riskRes.value?.data;
          if (data?.error) {
            const errorMsg = data.error.message || "Risk metrics API error";
            console.error("Risk metrics API error:", data.error);
            errors.push(errorMsg);
          } else {
            setRiskMetrics(data || null);
          }
        } else {
          const reason = riskRes.reason;
          const errorMsg =
            reason?.response?.data?.error?.message ||
            reason?.message ||
            "Failed to fetch risk metrics";
          console.error("Error fetching risk metrics:", {
            message: errorMsg,
            status: reason?.response?.status,
          });
          errors.push(errorMsg);
        }

        // Handle factor metrics response
        if (factorRes.status === "fulfilled") {
          const data = factorRes.value?.data;
          if (data?.error) {
            const errorMsg = data.error.message || "Factor metrics API error";
            console.error("Factor metrics API error:", data.error);
            errors.push(errorMsg);
          } else {
            setFactorMetrics(data || null);
          }
        } else {
          const reason = factorRes.reason;
          const errorMsg =
            reason?.response?.data?.error?.message ||
            reason?.message ||
            "Failed to fetch factor metrics";
          console.error("Error fetching factor metrics:", {
            message: errorMsg,
            status: reason?.response?.status,
          });
          errors.push(errorMsg);
        }

        // Set error state if all requests failed or if critical errors occurred
        if (errors.length > 0) {
          // If all requests failed, show error. Otherwise, log partial failures but don't block UI
          const allFailed =
            portfolioValueRes.status === "rejected" &&
            performanceRes.status === "rejected" &&
            riskRes.status === "rejected" &&
            factorRes.status === "rejected";

          if (allFailed) {
            setError(`Failed to load dashboard data: ${errors.join("; ")}`);
          } else {
            // Some requests succeeded, log partial failures but don't show error state
            console.warn("Some dashboard requests failed:", errors);
          }
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError(
          err?.response?.data || err?.message || "Failed to load dashboard data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId, selectedAccountId, selectedRange]);

  const handleAccountChange = (event) => {
    const value = event.target.value;
    setSelectedAccountId(value === "all" ? null : value);
  };

  const handleRangeChange = (event) => {
    setSelectedRange(event.target.value);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-controls">
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
                  {account.institutionName
                    ? `(${account.institutionName})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="time-range-selector">
            <label htmlFor="time-range-select">Time Range: </label>
            <select
              id="time-range-select"
              value={selectedRange}
              onChange={handleRangeChange}
              className="portfolio-select-dropdown"
            >
              <option value="1M">1 Month</option>
              <option value="3M">3 Months</option>
              <option value="YTD">Year to Date</option>
              <option value="1Y">1 Year</option>
              <option value="ALL">All Time</option>
            </select>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="dashboard-loading">Loading dashboard data...</div>
      ) : error ? (
        <div className="dashboard-error">Error: {JSON.stringify(error)}</div>
      ) : (
        <>
          {portfolioValue && (
            <div className="portfolio-stats">
              <h2>Portfolio Value</h2>
              {portfolioValue?.twrMetrics ? (
                <div className="twr-metrics">
                  <h3>Time-Weighted Returns (TWR)</h3>
                  <div className="stats-grid">
                    {portfolioValue.twrMetrics.twr1Day !== null &&
                      portfolioValue.twrMetrics.twr1Day !== undefined && (
                        <div className="stat-card">
                          <h4>1 Day</h4>
                          <div
                            className={`value ${
                              portfolioValue.twrMetrics.twr1Day >= 0
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {(portfolioValue.twrMetrics.twr1Day * 100).toFixed(
                              2
                            )}
                            %
                          </div>
                        </div>
                      )}
                    {portfolioValue.twrMetrics.twr3Months !== null &&
                      portfolioValue.twrMetrics.twr3Months !== undefined && (
                        <div className="stat-card">
                          <h4>3 Months</h4>
                          <div
                            className={`value ${
                              portfolioValue.twrMetrics.twr3Months >= 0
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {(
                              portfolioValue.twrMetrics.twr3Months * 100
                            ).toFixed(2)}
                            %
                          </div>
                        </div>
                      )}
                    {portfolioValue.twrMetrics.twrYearToDate !== null &&
                      portfolioValue.twrMetrics.twrYearToDate !== undefined && (
                        <div className="stat-card">
                          <h4>Year to Date</h4>
                          <div
                            className={`value ${
                              portfolioValue.twrMetrics.twrYearToDate >= 0
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {(
                              portfolioValue.twrMetrics.twrYearToDate * 100
                            ).toFixed(2)}
                            %
                          </div>
                        </div>
                      )}
                    {portfolioValue.twrMetrics.twrAllTime !== null &&
                      portfolioValue.twrMetrics.twrAllTime !== undefined && (
                        <div className="stat-card">
                          <h4>All Time</h4>
                          <div
                            className={`value ${
                              portfolioValue.twrMetrics.twrAllTime >= 0
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {(
                              portfolioValue.twrMetrics.twrAllTime * 100
                            ).toFixed(2)}
                            %
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              ) : (
                <div className="twr-metrics">
                  <h3>Time-Weighted Returns (TWR)</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <h4>No TWR Data Available</h4>
                      <div className="value" style={{ color: "#666" }}>
                        Run metrics pipeline to calculate TWR returns
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <Chart portfolioValue={portfolioValue} />
          <TabPanel
            performanceMetrics={performanceMetrics}
            riskMetrics={riskMetrics}
            factorMetrics={factorMetrics}
          />
        </>
      )}

      {children}
    </div>
  );
}

export default Dashboard;
