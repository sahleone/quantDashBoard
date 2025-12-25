# Quantitative Finance Dashboard — Capstone Proposal (Next.js)

## Stack
- **Frontend:** Next.js (React framework)  
- **Backend:** Node.js + Express.js  
- **Database:** MongoDB  
- **Auth/Charts:** JWT for authentication; Chart.js for visualizations

## Focus
- **Backend:** Financial analytics, dividend forecasting, and metrics computation  
- **Frontend:** Interactive charts and dashboards for data visualization

## Type
- Website optimized for desktop browsers

## Goal
Enable individual investors to analyze, monitor, and improve their portfolios with insights on returns, risks, cash flow (dividends), and overall financial health.

## Users
- Retail investors optimizing portfolios and dividend income  
- Dividend-focused investors planning passive income  
- Finance students/enthusiasts seeking hands-on portfolio analysis

## Data
- Historical price data for equities and ETFs  
- Fundamental data (financial ratios, balance sheet info)  
- Factor model data (CAPM, Fama-French, etc.)  
- Dividend data (historical, forward yield estimates, growth rates)  
- User portfolio data (holdings, transactions)

## Sources
- **SnapTrade:** secure portfolio holdings and transactions from brokerages  
- **Financial Modeling Prep / Alpha Vantage:** prices and fundamentals  
- **Kenneth French Data Library:** factor model data  
- **Dividend Forecast Data:** (to be determined)

## Database Schema (Collections)
- **Users:** auth details, settings, SnapTrade connection metadata  
- **Portfolios:** per-user portfolios (base currency, benchmark, metadata)  
- **Holdings:** positions (quantity, cost basis, value, sector/country)  
- **Transactions:** buys, sells, dividends, fees, splits  
- **Dividends:** actual + forecast, schedules, yield estimates, “Dividend Ratings”  
- **Price History:** time-series prices, fundamentals, factor exposures  
- **Benchmarks:** index data for comparisons (e.g., S&P 500, Nasdaq)

## Features
### Dividend Insights & Calendar
- Track actual and projected payouts  
- Yield forecasts and payout calendar  
- Metrics: expected future income, dividend growth, net yield after taxes

### Performance Analytics & Benchmarks
- Total profit (realized/unrealized, dividends, fees, taxes)  
- Risk-adjusted metrics: Sharpe, beta, volatility, max drawdown  
- Benchmarking vs. indices like S&P 500, BTC, and Nasdaq

## API Considerations
- Align/merge data from SnapTrade, FMP, Alpha Vantage  
- Handle missing data, update frequencies, and rate limits  
- Secure user consent and authentication for brokerage connections

## Security
- JWT for secure user sessions  
- Environment variables for API keys and sensitive config

## Functionality
- User authentication and secure portfolio connections (SnapTrade or manual)  
- Real-time or periodic performance tracking  
- Dividend income forecasting and calendar visualization  
- Fundamental analysis and health metrics (FMP/Alpha Vantage)  
- Interactive benchmarking and scenario analysis  
- Dynamic, personalized data visualizations

## User Flow
1. Sign up or log in  
2. Connect brokerage via SnapTrade or add holdings manually  
3. View portfolio overview and performance  
4. Explore dividend projections and calendar  
5. Analyze fundamentals and ratings  
6. Benchmark against indices and simulate strategies

## Beyond CRUD
- Advanced financial analytics and risk-adjusted metrics  
- Dividend cash-flow forecasting and insights  
- Fundamental and factor analysis

## Stretch Goals
- Automated rebalancing recommendations  
- Factor attribution and advanced performance decomposition


# Note/Limitations 
- when construction the balance time series some stocks recorded a negative balance this should not happen and need to be looked at again
- Splits are handled by multiplying existing share counts by the split factor on the split date. More complex corporate actions (mergers, spin-offs, etc.) aren’t modeled.