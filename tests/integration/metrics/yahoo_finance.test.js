// Quick test for yahoo-finance2
// Usage:
// 1) npm install yahoo-finance2
// 2) node test_yahoo.js

(async () => {
  try {
    // Dynamically import so this script works whether the project uses CommonJS or ESM
    const mod = await import("yahoo-finance2");
    // yahoo-finance2 exports a default constructor
    const YahooFinance = mod.default || mod;

    const yahooFinance = new YahooFinance();

    console.log("Searching for Apple...");
    const results = await yahooFinance.search("Apple");
    console.log(
      "Search results (first 3):",
      results && results.length ? results.slice(0, 3) : results
    );

    console.log("Fetching AAPL quote...");
    const quote = await yahooFinance.quote("AAPL");
    const { regularMarketPrice: price, currency } = quote || {};

    console.log("AAPL price:", price);
    console.log("Currency:", currency);

    // Historical data: fetch ~1 year of daily data for AAPL
    console.log("Fetching AAPL historical (1 year)...");
    const to = new Date();
    const from = new Date();
    from.setFullYear(to.getFullYear() - 1);

    // yahoo-finance2 accepted options include period1/period2 (Date or timestamp) and interval (e.g. '1d')
    const historical = await yahooFinance.historical("AAPL", {
      period1: from,
      period2: to,
      interval: "1d",
    });

    if (Array.isArray(historical)) {
      console.log("Historical points:", historical.length);
      if (historical.length) {
        const last = historical[historical.length - 1];
        console.log("Most recent historical row (last):", last);
        console.log("Most recent close:", last.close, "date:", last.date);
        console.log("First 3 historical rows:", historical.slice(0, 3));
      }
    } else {
      console.log("Historical result:", historical);
    }

    process.exit(0);
  } catch (err) {
    console.error(
      "Error running yahoo-finance2 test:",
      err && (err.stack || err.message || err)
    );
    process.exit(1);
  }
})();
