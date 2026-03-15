# Quant Dashboard – Architecture

High-level structure of the application: stack, directories, and how the main parts interact.

---

## Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React (Vite), React Router, Axios |
| **Backend** | Node.js, Express |
| **Database** | MongoDB (Mongoose) |
| **Auth** | JWT (access + refresh), httpOnly cookies |
| **Brokerage data** | SnapTrade API (userClient, accountClient, optionsClient) |
| **Prices** | Yahoo Finance (yahooFinanceClient), Alpha Vantage (proxy) |
| **Factors / risk-free rate** | Kenneth French Data Library (famaFrenchService) |
| **Scheduled jobs** | Cron (server/cron_jobs) |

---

## Repository layout (under `quantDashBoard/`)

```
quantDashBoard/
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── components/     # Reusable UI (Login, Logout, RefreshButton, ConnectBrokerage, …)
│   │   ├── context/        # UserContext (user, userId, setUser, setUserId)
│   │   ├── Layouts/         # RootLayout
│   │   ├── pages/           # Route-level views (Dashboard, Portfolio, Settings, Home, …)
│   │   ├── utils/           # apiClient, authInterceptor, ProtectedRoutes
│   │   └── App.jsx          # Router, UserContext provider, auth check on load
│   └── public/
│
├── server/
│   ├── src/
│   │   ├── clients/         # SnapTrade & external API clients (userClient, accountClient, optionsClient, …)
│   │   ├── config/          # environment (JWT, DB, etc.)
│   │   ├── controllers/     # authController, metricsController, accountsController, connectionsController, …
│   │   ├── middleware/      # authMiddleware (requireAuth, checkUser)
│   │   ├── metrics/         # Pipeline + helpers (runMetricsPipeline, calculateMetrics, updateTable/*, helpers/*)
│   │   ├── models/          # Mongoose models (Users, AccountHoldings, PortfolioTimeseries, Metrics, …)
│   │   ├── routes/          # Express routers (api.js, authRoutes, user, accounts, connections, metrics, …)
│   │   ├── services/        # famaFrenchService
│   │   ├── utils/           # syncAllUserData, fullSyncForUser, updateAccounts, updateAccountHoldings, yahooFinanceClient, …
│   │   └── app.js           # Express app, mounts /api via api.js
│   ├── cron_jobs/           # Scheduled fullSyncForUser per user
│   └── scripts/             # One-off/CLI scripts (e.g. syncSourceData)
│
└── ProjectInfo/             # Docs for humans and LLMs
    ├── ARCHITECTURE.md      # This file
    ├── FLOWS.md             # Auth, data sync, metrics pipeline, UI data flow
    └── INDEX.md             # Quick file index by concern
```

---

## Request flow (API)

1. **Entry:** All API under `/api` – `server/src/app.js` mounts `apiRoutes` at `/api`; `server/src/routes/api.js` distributes to auth, user, connections, accounts, snaptrade, alphavantage/massive, and metrics (portfolio + metrics).
2. **Auth:** Protected routes use `requireAuth` (JWT from header or `jwt` cookie → load user → `req.user`). Public: signup, login, refresh.
3. **Handlers:** Routes call controller methods; controllers use models, utils, and external clients. No server-side session store; state is JWT + MongoDB.

---

## Data flow (conceptual)

- **Brokerage:** SnapTrade is the source of accounts, holdings, positions, orders, activities. Stored in MongoDB via sync (see FLOWS.md).
- **Prices:** Yahoo Finance (and optionally Alpha Vantage) → `PriceHistory` and pipeline use.
- **Metrics:** Pre-computed by the metrics pipeline (price → portfolio timeseries → metrics → validate), stored in MongoDB. Dashboard and API read from DB; they do not run the full pipeline on each request.
- **Cron:** Runs full sync (SnapTrade + metrics pipeline) per user on a schedule.

---

## Main MongoDB collections (conceptual)

| Area | Examples |
|------|----------|
| **Identity / config** | Users (incl. userSecret for SnapTrade) |
| **SnapTrade sync** | AccountsList, AccountDetail, AccountBalances, AccountHoldings, AccountPositions, AccountOrders, AccountActivities, Options, Connection |
| **Pipeline inputs** | PriceHistory, (activities/positions from above) |
| **Pipeline outputs** | PortfolioTimeseries, EquitiesWeightTimeseries, Metrics (snaptrademetrics) |
| **Reference** | FamaFrenchFactors |

---

## Frontend routing

- **Public:** `/` (Home: login/signup).
- **Protected (require `userId`):** `/dashboard`, `/portfolio`, `/asset-allocation`, `/dividends`, `/settings`, `/stock-info`, `/logout`.
- **Protected routes** implemented via `ProtectedRoutes` wrapper; redirect to `/` if not authenticated.

See **FLOWS.md** for step-by-step auth, sync, and metrics flows; see **INDEX.md** for a short file index by concern.
