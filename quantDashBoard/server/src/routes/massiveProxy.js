import express from "express";
import fetch from "node-fetch";
import { config } from "../config/environment.js";

const router = express.Router();

const MASSIVE_BASE = "https://api.massive.com";
const API_KEY =
  (config && config.MASSIVE_API_KEY) || process.env.MASSIVE_API_KEY;

if (!API_KEY) {
  console.warn(
    "Warning: MASSIVE_API_KEY is not set. The /api/massive/* proxy endpoints will return 500 until configured."
  );
}

// Proxy for reference tickers: /api/massive/reference/tickers/:ticker
router.get("/reference/tickers/:ticker", async (req, res) => {
  try {
    if (!API_KEY)
      return res.status(500).json({ error: "Server missing MASSIVE_API_KEY" });

    const { ticker } = req.params;
    const url = `${MASSIVE_BASE}/v3/reference/tickers/${encodeURIComponent(
      ticker
    )}?apiKey=${API_KEY}`;
    const resp = await fetch(url);
    const text = await resp.text();

    res.status(resp.status).send(text);
  } catch (err) {
    console.error("massive.proxy.reference error", err);
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

// Proxy for aggregates (chart data). This route mirrors the client usage.
// Example: GET /api/massive/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-12-31
router.get(
  "/aggs/ticker/:ticker/range/1/:timespan/:from/:to",
  async (req, res) => {
    try {
      if (!API_KEY)
        return res
          .status(500)
          .json({ error: "Server missing MASSIVE_API_KEY" });

      const { ticker, timespan, from, to } = req.params;
      // Preserve query params if provided (adjusted, sort, limit, etc.)
      const query = new URLSearchParams({
        ...(req.query || {}),
        apiKey: API_KEY,
      });
      const url = `${MASSIVE_BASE}/v2/aggs/ticker/${encodeURIComponent(
        ticker
      )}/range/1/${encodeURIComponent(timespan)}/${encodeURIComponent(
        from
      )}/${encodeURIComponent(to)}?${query.toString()}`;

      const resp = await fetch(url);
      const text = await resp.text();

      res.status(resp.status).send(text);
    } catch (err) {
      console.error("massive.proxy.aggs error", err);
      res.status(500).json({ error: "Proxy error", details: err.message });
    }
  }
);

export default router;
