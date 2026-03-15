# Quant Dashboard – File index

Quick index of important files by concern. Paths are relative to the `quantDashBoard/` directory.

---

## Auth

| Concern | Client | Server |
|--------|--------|--------|
| Sign up | `client/src/pages/auth/Signup.jsx` | `server/src/controllers/authController.js` (signup), `server/src/routes/authRoutes.js` |
| Login | `client/src/components/login/Login.jsx` | `authController.login`, `server/src/routes/authRoutes.js` |
| Session restore | `client/src/App.jsx` | `GET /api/user/me` → `authController.getCurrentUser`, `server/src/routes/user.js` |
| Logout | `client/src/components/auth/Logout.jsx` | `authController.logout` |
| Token refresh | `client/src/utils/authInterceptor.js` | `authController.refresh` |
| Protected routes | `client/src/utils/ProtectedRoutes.jsx` | `server/src/middleware/authMiddleware.js` (requireAuth) |
| User context | `client/src/context/UserContext.js` | — |
| API client (cookies) | `client/src/utils/apiClient.js` | — |

---

## Connections & SnapTrade

| Concern | Client | Server |
|--------|--------|--------|
| Portal / exchange | `client/src/components/connectBrokerage/ConnectBrokerage.jsx`, `client/src/pages/settings/Settings.jsx` | `server/src/controllers/connectionsController.js`, `server/src/routes/connections.js` |
| SnapTrade API clients | — | `server/src/clients/userClient.js`, `server/src/clients/accountClient.js`, `server/src/clients/optionsClient.js` |
| Connection list / refresh | Settings, ConnectBrokerage | `server/src/routes/connections.js` (GET /, POST /refresh), `server/src/utils/updateConnections.js` |

---

## Data sync (SnapTrade → MongoDB)

| Concern | Client | Server |
|--------|--------|--------|
| Refresh (accounts only) | `client/src/components/refreshButton/refreshButton.jsx` → POST /api/accounts/sync/all | `server/src/routes/accounts.js` (POST /sync/all), `server/src/utils/syncAllUserData.js` |
| Full sync (source + metrics) | Settings “Update All Data” → POST /api/accounts/sync/full | `server/src/routes/accounts.js` (POST /sync/full), `server/src/utils/fullSyncForUser.js` |
| Sync holdings per account | — | `server/src/utils/updateAccountHoldings.js`, `server/src/clients/accountClient.js` (syncAllAccountData) |
| Sync accounts list | — | `server/src/utils/updateAccounts.js` |

---

## Metrics pipeline

| Step | Server files |
|------|--------------|
| Orchestration | `server/src/metrics/runMetricsPipeline.js`, `server/src/utils/fullSyncForUser.js` |
| Price data | `server/src/metrics/updateTable/updatePriceData.js`, `server/src/utils/yahooFinanceClient.js` |
| Portfolio timeseries & returns | `server/src/metrics/updateTable/updatePortfolioTimeseries.js` |
| Calculate metrics | `server/src/metrics/calculateMetrics.js` |
| Validation | `server/src/metrics/validateMetrics.js` |
| Helpers | `server/src/metrics/helpers/` (dateRanges, returnsMetrics, riskMetrics, riskAdjustedMetrics, portfolioSnapshotMetrics, diversificationMetrics) |
| Risk-free rate / factors | `server/src/services/famaFrenchService.js`, `server/src/models/FamaFrenchFactors.js` |

---

## Dashboard & metrics API

| Concern | Client | Server |
|--------|--------|--------|
| Dashboard data | `client/src/pages/Dashboard.jsx` | `server/src/controllers/metricsController.js`, `server/src/routes/metrics.js` |
| Portfolio value | Dashboard | GET /api/portfolio/value → metricsController.getPortfolioValue |
| Performance / risk / factors | Dashboard | GET /api/metrics/performance, /risk, /factors → metricsController |
| Manual metrics run | — | POST /api/metrics/calculate → metricsController.calculateMetrics |

---

## API routes (server)

| Prefix | File | Notes |
|--------|------|--------|
| `/api` | `server/src/routes/api.js` | Mounts all below |
| `/api/auth` | `server/src/routes/authRoutes.js` | signup, login, refresh, logout |
| `/api/user` | `server/src/routes/user.js` | GET/PATCH /me (requireAuth) |
| `/api/connections` | `server/src/routes/connections.js` | portal, exchange, list, delete, health, refresh |
| `/api/accounts` | `server/src/routes/accounts.js` | list, holdings, balances, positions, activities, sync/holdings, sync/all, sync/full, refresh |
| `/api/snaptrade` | `server/src/routes/snapTrade.js` | Various SnapTrade proxies |
| `/api/alphavantage`, `/api/massive` | `server/src/routes/alphavantageProxy.js` | Alpha Vantage proxy |
| `/api/portfolio/*`, `/api/metrics/*` | `server/src/routes/metrics.js` | portfolio/value, metrics/performance, risk, factors, kpis, timeseries, metrics/calculate |

---

## Models (server, Mongoose)

| Concern | File |
|--------|------|
| User | `server/src/models/Users.js` |
| Accounts / holdings / activities | `server/src/models/AccountsList.js`, `AccountHoldings.js`, `AccountPositions.js`, `AccountBalances.js`, `AccountOrders.js`, `AccountActivities.js`, `AccountDetail.js` |
| Options, connections | `server/src/models/Options.js`, `server/src/models/Connection.js` |
| Pipeline | `server/src/models/PriceHistory.js`, `server/src/models/PortfolioTimeseries.js`, `server/src/models/EquitiesWeightTimeseries.js`, `server/src/models/Metrics.js` |
| Reference | `server/src/models/FamaFrenchFactors.js`, `server/src/models/CorporateActions.js` |

---

## Other

| Concern | Location |
|--------|----------|
| App entry, router, auth check | `client/src/App.jsx` |
| Express app, middleware, mount /api | `server/src/app.js` |
| Cron (full sync per user) | `server/cron_jobs/job.js` |
| Env/config | `server/src/config/environment.js` |

For detailed flow descriptions, see **FLOWS.md**. For high-level structure, see **ARCHITECTURE.md**.
