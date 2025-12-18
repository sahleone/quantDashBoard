import React, { useContext, useEffect, useState } from "react";
import BarChart from "../../components/barChart/BarChart";
import UserContext from "../../context/UserContext";
import { authenticatedGet } from "../../utils/apiClient";
import "./Dividends.css";

function Dividends() {
  const { userId } = useContext(UserContext) || {};
  const [dividendsData, setDividendsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);

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

  // Fetch dividends data
  useEffect(() => {
    const fetchDividends = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const url = selectedAccountId
          ? `/api/accounts/dividends/by-month?accountId=${encodeURIComponent(selectedAccountId)}`
          : `/api/accounts/dividends/by-month`;

        const response = await authenticatedGet(url);

        if (response?.data?.error) {
          setError(response.data.error.message || "Failed to fetch dividends");
        } else {
          setDividendsData(response?.data || null);
        }
      } catch (err) {
        console.error("Error fetching dividends:", err);
        setError(
          err?.response?.data?.error?.message ||
            err?.message ||
            "Failed to load dividends data"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDividends();
  }, [userId, selectedAccountId]);

  const handleAccountChange = (event) => {
    const value = event.target.value;
    setSelectedAccountId(value === "all" ? null : value);
  };

  // Format month labels for display (e.g., "Jan 2024")
  const formatMonthLabel = (monthKey) => {
    const [year, month] = monthKey.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Prepare chart data
  const chartLabels =
    dividendsData?.months?.map((m) => formatMonthLabel(m.month)) || [];
  const chartData = dividendsData?.months?.map((m) => m.amount || 0) || [];
  const totalDividends = dividendsData?.total || 0;

  return (
    <div className="dividends-page">
      <div className="dividends-header">
        <h1>Dividends by Month</h1>
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
                {account.institutionName ? `(${account.institutionName})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="dividends-loading">Loading dividends data...</div>
      ) : error ? (
        <div className="dividends-error">Error: {error}</div>
      ) : dividendsData && dividendsData.months ? (
        <>
          <div className="dividends-summary">
            <div className="summary-card">
              <h3>Total Dividends (Last 12 Months)</h3>
              <div className="summary-value">
                ${totalDividends.toFixed(2)}
              </div>
            </div>
          </div>
          <BarChart
            title="Dividends Collected by Month"
            labels={chartLabels}
            data={chartData}
            dataLabel="Dividends ($)"
          />
        </>
      ) : (
        <div className="dividends-empty">
          No dividend data available. Connect a brokerage account to view
          dividends.
        </div>
      )}
    </div>
  );
}

export default Dividends;

