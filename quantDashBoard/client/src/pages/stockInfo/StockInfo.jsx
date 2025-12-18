import "./StockInfo.css";
import { useState } from "react";
import LineGraph from "../../components/lineGraph/LineGraph";
import CompanyOverview from "../../components/companyOverview/CompanyOverview";

// Resolve backend API base (use Vite env when present, otherwise localhost:3000)
const API_BASE =
  (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://localhost:3000";

// Using Alpha Vantage for ticker data
// We proxy requests through the server so the API key is stored server-side.

const get_chart_data = async (ticker, from, to, timespan = "day") => {
  const pad = (n) => n.toString().padStart(2, "0");
  const formatDate = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const today = new Date();
  const defaultTo = formatDate(today);
  const twoYearsAgo = new Date(today);
  // Keep default range to at most two years previous (free tier requirement)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const defaultFrom = formatDate(twoYearsAgo);

  const fromDate = defaultFrom;
  const toDate = defaultTo;

  // Call the server-side Alpha Vantage proxy. We request daily series and then
  // the server will transform/filter the response into the shape the client expects.
  const chart_data = `${API_BASE}/api/alphavantage/daily/${encodeURIComponent(
    ticker
  )}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(
    toDate
  )}&outputsize=full`;
  const response = await fetch(chart_data);

  // Surface clearer error when API returns non-2xx (e.g. 401 Unauthorized)
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Alpha Vantage API error ${response.status}: ${text}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Likely an HTML error page (e.g. dev server served index.html or a 404 page)
    const text = await response.text().catch(() => "");
    console.error(
      "Alpha Vantage daily endpoint returned non-JSON response:",
      text
    );
    throw new Error(
      `Alpha Vantage daily returned non-JSON content: ${text.slice(0, 200)}`
    );
  }

  const data = await response.json();
  return data;
};

function StockInfo() {
  const [ticker, setTicker] = useState("");
  const [tickerOverviewData, setTickerOverviewData] = useState(null);
  const [closePrices, setClosePrices] = useState(null);
  const [timestamps, setTimestamps] = useState(null);

  const get_close_prices = (chartData) => {
    if (!chartData || !Array.isArray(chartData.results)) {
      console.warn(
        "get_close_prices: chartData.results is missing or invalid",
        chartData
      );
      setClosePrices([]);
      return;
    }

    const closePrices = chartData.results.map((item) => item.c);
    setClosePrices(closePrices);
  };

  const get_timestamps = (chartData) => {
    if (!chartData || !Array.isArray(chartData.results)) {
      console.warn(
        "get_timestamps: chartData.results is missing or invalid",
        chartData
      );
      setTimestamps([]);
      return;
    }

    const timestamps = chartData.results.map((item) => item.t);
    const dates = timestamps.map((ms) => new Date(ms).toLocaleString());
    setTimestamps(dates);
  };

  const handleChange = (e) => {
    console.log(e.target.value);
    setTicker(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Use server proxy for ticker overview so the API key is never exposed in the client
    const ticker_overview = `${API_BASE}/api/alphavantage/overview/${encodeURIComponent(
      ticker
    )}`;

    try {
      // Fetch ticker overview
      const overviewResponse = await fetch(ticker_overview);
      if (!overviewResponse.ok) {
        const text = await overviewResponse.text().catch(() => "");
        throw new Error(
          `Alpha Vantage API overview error ${overviewResponse.status}: ${text}`
        );
      }
      const overviewContentType =
        overviewResponse.headers.get("content-type") || "";
      if (!overviewContentType.includes("application/json")) {
        const text = await overviewResponse.text().catch(() => "");
        console.error(
          "Alpha Vantage overview returned non-JSON response:",
          text
        );
        throw new Error(
          `Alpha Vantage overview returned non-JSON content: ${text.slice(
            0,
            200
          )}`
        );
      }

      const overviewData = await overviewResponse.json();
      setTickerOverviewData(overviewData);

      // Fetch chart data
      const chartDataResult = await get_chart_data(ticker);
      // chartDataResult may contain an error payload if upstream failed; the getters are defensive
      get_close_prices(chartDataResult);
      get_timestamps(chartDataResult);
    } catch (error) {
      console.error("Error fetching stock data:", error);
    }
  };

  return (
    <div className="stock-info">
      <h1>Stock Info</h1>
      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Stock Ticker"
            value={ticker}
            onChange={handleChange}
          />
          <button type="submit">Search</button>
        </form>
      </div>
      <div className="chart-wrapper">
        <LineGraph ticker={ticker} labels={timestamps} data={closePrices} />
      </div>
      <CompanyOverview tickerOverviewData={tickerOverviewData} />
    </div>
  );
}

export default StockInfo;
