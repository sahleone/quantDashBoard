import express from "express";
import fetch from "node-fetch";
import { config } from "../config/environment.js";

const router = express.Router();

const ALPHA_BASE = "https://www.alphavantage.co/query";
const API_KEY =
  (config && config.ALPHA_VANTAGE_API_KEY) ||
  process.env.ALPHA_VANTAGE_API_KEY ||
  process.env.VITE_ALPHA_VANTAGE_API_KEY;

if (!API_KEY) {
  console.warn(
    "Warning: ALPHA_VANTAGE_API_KEY is not set. The /api/alphavantage/* proxy endpoints will return 500 until configured."
  );
}

// Overview: /api/alphavantage/overview/:ticker -> maps to Alpha Vantage FUNCTION=OVERVIEW
router.get("/overview/:ticker", async (req, res) => {
  try {
    if (!API_KEY)
      return res
        .status(500)
        .json({ error: "Server missing ALPHA_VANTAGE_API_KEY" });

    const { ticker } = req.params;
    const url = `${ALPHA_BASE}?function=OVERVIEW&symbol=${encodeURIComponent(
      ticker
    )}&apikey=${API_KEY}`;
    const resp = await fetch(url);
    const json = await resp.json();

    // Detect Alpha Vantage rate-limit or error responses which arrive as JSON
    if (json["Note"] || json["Error Message"] || json["Information"]) {
      console.warn(
        `Alpha Vantage overview responded with an error/note for ${ticker}:`,
        json["Note"] || json["Error Message"] || json["Information"]
      );
      return res.status(502).json({
        error: "AlphaVantageError",
        details: json["Note"] || json["Error Message"] || json["Information"],
        upstream: json,
      });
    }

    res.status(resp.status).json(json);
  } catch (err) {
    console.error("alphavantage.proxy.overview error", err);
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

// Daily time series: /api/alphavantage/daily/:ticker?from=YYYY-MM-DD&to=YYYY-MM-DD&outputsize=full
// This will fetch TIME_SERIES_DAILY_ADJUSTED and transform it into { results: [ { t: ms, c: close }, ... ] }
router.get("/daily/:ticker", async (req, res) => {
  try {
    if (!API_KEY)
      return res
        .status(500)
        .json({ error: "Server missing ALPHA_VANTAGE_API_KEY" });

    const { ticker } = req.params;
    const { from, to, outputsize = "full" } = req.query;

    const url = `${ALPHA_BASE}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(
      ticker
    )}&outputsize=${encodeURIComponent(outputsize)}&apikey=${API_KEY}`;

    const resp = await fetch(url);
    const json = await resp.json();

    // If Alpha Vantage returns a Note (rate limit) or Error Message, surface that
    if (json["Note"] || json["Error Message"] || json["Information"]) {
      console.warn(
        `Alpha Vantage TIME_SERIES response for ${ticker} included a Note/Error:`,
        json["Note"] || json["Error Message"] || json["Information"]
      );
      return res.status(502).json({
        error: "AlphaVantageError",
        details: json["Note"] || json["Error Message"] || json["Information"],
        upstream: json,
      });
    }

    const series =
      json["Time Series (Daily)"] || json["Time Series (60min)"] || {};

    // Transform into array of { t: ms, c: close }
    const entries = Object.entries(series).map(([dateStr, values]) => {
      // dateStr is YYYY-MM-DD
      const ms = Date.parse(dateStr);
      const close = parseFloat(values["4. close"] || values.close || 0);
      return { dateStr, t: ms, c: close };
    });

    // Sort ascending by date
    entries.sort((a, b) => a.t - b.t);

    // Filter by from/to if provided
    const fromMs = from ? Date.parse(from) : null;
    const toMs = to ? Date.parse(to) : null;

    const filtered = entries.filter((e) => {
      if (fromMs && e.t < fromMs) return false;
      if (toMs && e.t > toMs) return false;
      return true;
    });

    // If no results were found, include the raw upstream payload for debugging
    if (!filtered || filtered.length === 0) {
      console.warn(`Alpha Vantage returned no time-series data for ${ticker}`);
      return res.status(200).json({ results: [], upstream: json });
    }

    res.status(200).json({ results: filtered });
  } catch (err) {
    console.error("alphavantage.proxy.daily error", err);
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

export default router;
