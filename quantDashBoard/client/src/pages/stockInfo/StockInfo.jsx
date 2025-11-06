import "./StockInfo.css";
import { useState } from "react";
import LineGraph from "../../components/lineGraph/LineGraph";
import CompanyOverview from "../../components/companyOverview/CompanyOverview";

const POLYGON_API_KEY = import.meta.env.VITE_POLYGON_API_KEY;

const get_chart_data = async (
  ticker,
  from = "2024-01-01",
  to = "2024-12-31",
  timespan = "day"
) => {
  const chart_data = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${POLYGON_API_KEY}`;
  const response = await fetch(chart_data);
  const data = await response.json();

  return data;
};

function StockInfo() {
  const [ticker, setTicker] = useState("");
  const [tickerOverviewData, setTickerOverviewData] = useState(null);
  const [closePrices, setClosePrices] = useState(null);
  const [timestamps, setTimestamps] = useState(null);

  const get_close_prices = (chartData) => {
    const closePrices = chartData.results.map((item) => item.c);
    setClosePrices(closePrices);
  };

  const get_timestamps = (chartData) => {
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
    const ticker_overview = `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;

    try {
      // Fetch ticker overview
      const overviewResponse = await fetch(ticker_overview);
      const overviewData = await overviewResponse.json();
      setTickerOverviewData(overviewData);

      // Fetch chart data
      const chartDataResult = await get_chart_data(ticker);
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
      <LineGraph ticker={ticker} labels={timestamps} data={closePrices} />
      <CompanyOverview tickerOverviewData={tickerOverviewData} />
    </div>
  );
}

export default StockInfo;
