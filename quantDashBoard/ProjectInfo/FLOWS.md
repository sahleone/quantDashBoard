# Quant Dashboard – Project Flows

This document records the main flows in the project: authentication, data sync, metrics calculation, and how the UI consumes data.

---

## 1. Authentication

### 1.1 Sign up

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Client** `Signup.jsx` | User submits form (firstName, lastName, email, password). |
| 2 | **Client** `apiClient.js` | `authenticatedPost("/api/auth/signup", formData)` with `withCredentials: true` (no auth header needed for signup). |
| 3 | **Server** `authRoutes.js` → `authController.signup` | Validates input, creates user via `User` model (MongoDB), may register user with SnapTrade via `userClient`. Creates JWT access + refresh tokens. |
| 4 | **Server** `authController` | Sets httpOnly cookies: `refreshToken` (long-lived), `jwt` (access token). Returns `{ user, accessToken }` in body. |
| 5 | **Client** `Signup.jsx` | On success: `setUserId(u.userId \|\| u.id)`, `setUser(u)`, `navigate("/dashboard")`. No tokens stored in localStorage. |

### 1.2 Sign in (login)

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Client** `Login.jsx` | User submits email + password. |
| 2 | **Client** | `authenticatedPost("/api/auth/login", { email, password })`. |
| 3 | **Server** `authRoutes.js` → `authController.login` | Validates email/password, `User.login(email, password)`. Creates access + refresh JWTs. |
| 4 | **Server** | Sets httpOnly cookies: `refreshToken`, `jwt`. Returns `{ user, accessToken }`. |
| 5 | **Client** `Login.jsx` | On success: `setUserId`, `setUser` from `response.data.user`, `navigate("/dashboard")`. |

### 1.3 Session restore on app load

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Client** `App.jsx` | On mount, `axios.defaults.withCredentials = true` and `setupAuthInterceptors()` run. |
| 2 | **Client** `App.jsx` | `checkAuth()` calls `authenticatedGet("/api/user/me")`. Browser sends `jwt` cookie. |
| 3 | **Server** `user.js` (requireAuth) → `authController.getCurrentUser` | Middleware reads token from `Authorization: Bearer` or `req.cookies.jwt`, verifies JWT, loads user, sets `req.user`. Returns `{ user }`. |
| 4 | **Client** `App.jsx` | Response normalized to `userId`; `setUser(normalized)`. If 401 or no user, context stays null. |
| 5 | **Client** `ProtectedRoutes.jsx` | Routes under `<ProtectedRoutes />` render `<Outlet />` only if `!!userId`; otherwise redirect to `/`. |

### 1.4 Token refresh (401 handling)

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Client** `authInterceptor.js` | Response interceptor sees 401 on an authenticated request. |
| 2 | **Client** | Calls `refreshAxios.post("/api/auth/refresh")` with cookies (including `refreshToken`). If another request already triggered refresh, others are queued. |
| 3 | **Server** `authController.refresh` | Reads `refreshToken` from `req.cookies` or body, verifies with REFRESH_SECRET, loads user, issues new access token. Sets new `jwt` cookie, returns `{ accessToken }`. |
| 4 | **Client** | On success: optionally sets `Authorization: Bearer` from body; retries original request. On failure: rejects so caller can redirect to login. |

### 1.5 Sign out (logout)

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Client** User hits logout (e.g. route `/logout`). | `Logout.jsx` mounts. |
| 2 | **Client** `Logout.jsx` | `authenticatedPost("/api/auth/logout")` then `clearAuth()` (clears refresh queue), then `navigate("/")`. |
| 3 | **Server** `authController.logout` | Clears cookies: `refreshToken` and `jwt` (maxAge 0). Returns `{ message: "Logged out successfully" }`. |
| 4 | **Client** | Context is not cleared by server; `clearAuth()` + navigation away from protected routes effectively “log out” the UI. User state is gone on next load because cookies are cleared. |

### 1.6 Auth middleware (protected API routes)

- **File:** `server/src/middleware/authMiddleware.js`
- **Behavior:** `requireAuth` reads JWT from `Authorization: Bearer` or `req.cookies.jwt`, verifies with `config.jwt.secret`, loads user with `User.findById(decoded.id)`, sets `req.user`. If no/invalid token or user missing → 401.
- **Usage:** All `/api/user/*`, `/api/accounts/*`, `/api/connections/*`, `/api/portfolio/*`, `/api/metrics/*` (and similar) use `router.use(requireAuth)` or equivalent.

---

## 2. Data: Where it comes from and how it’s stored

### 2.1 Source of truth: SnapTrade

- **Brokerage data** (accounts, positions, holdings, orders, activities) comes from **SnapTrade**.
- The server uses **SnapTrade API clients** (`userClient.js`, `accountClient.js`, `optionsClient.js`) with `userId` and `userSecret`. `userSecret` is stored in the **Users** model (MongoDB) and resolved when not passed (e.g. in cron or sync endpoints).

### 2.2 Connecting a brokerage (SnapTrade portal + exchange)

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Client** e.g. `ConnectBrokerage.jsx` / Settings | User selects broker and clicks connect. |
| 2 | **Client** | `authenticatedPost("/api/connections/snaptrade/portal", { broker })`. |
| 3 | **Server** `connectionsController.generatePortal` | Uses SnapTrade client to create portal; returns `redirectUrl`. |
| 4 | **Client** | `window.open(response.data.redirectUrl)`; sets `window.snaptradeConnectionsBefore = -1` for polling. |
| 5 | **User** | Completes broker auth in SnapTrade; broker redirects back (e.g. to Settings with `?authorizationId=...` or `connection_id=...`). |
| 6 | **Client** `Settings.jsx` | On URL params (e.g. `authorizationId`), calls `POST /api/connections/snaptrade/exchange` with `{ authorizationId, sessionId }`. |
| 7 | **Server** `connectionsController.exchangeAuthorization` | Exchanges authorization with SnapTrade; stores/updates connection and account info. Returns connection details. |
| 8 | **Client** | Then `POST /api/accounts/sync/holdings` (with `fullSync: true` when from “new connection” flow) to pull and store holdings. May show “Connection established successfully!” |

**Alternative:** Settings page can also **poll** `GET /api/connections` and compare count to `window.snaptradeConnectionsBefore`; when count increases, it triggers sync (e.g. `POST /api/accounts/sync/holdings` with `fullSync: true`).

### 2.3 Syncing account data from SnapTrade into MongoDB

Two main entry points:

- **POST /api/accounts/sync/all**  
  - **Handler:** `server/src/routes/accounts.js` → `syncAllUserData(userId, null, { fullSync })`.  
  - **Does not** run the metrics pipeline.  
  - Used by the **Refresh (accounts)** button in the UI.

- **POST /api/accounts/sync/full**  
  - **Handler:** `server/src/routes/accounts.js` → `fullSyncForUser(userId, null, { fullSync })`.  
  - **Does:** (1) SnapTrade sync, (2) metrics pipeline (prices → timeseries → metrics → validate).  
  - Used by “Update All Data” / full sync and by cron.

**syncAllUserData** (`server/src/utils/syncAllUserData.js`):

1. Resolves `userSecret` from `User` if not provided.
2. **updateAccountsForUser** – syncs account list from SnapTrade, upserts into **Accounts** (and related) collections.
3. **updateAccountHoldingsForUser** – for each account (optionally filtered by connection), calls **accountClient.syncAllAccountData(userId, userSecret, accountId, options)** which:
   - Fetches from SnapTrade: accounts, accountDetail, balances, holdings, positions, orders, activities.
   - Transforms and upserts into MongoDB: **Account**, **AccountDetail**, **AccountBalances**, **AccountHoldings**, **AccountPositions**, **AccountOrders**, **AccountActivities**.
4. **Options sync** – for each account, fetches option holdings via options client and upserts into **Options**.

**Stored collections (examples):** AccountsList, AccountDetail, AccountBalances, AccountHoldings, AccountPositions, AccountOrders, AccountActivities, Options. All keyed by `userId`, `accountId`, and relevant dates/ids.

---

## 3. Metrics pipeline (how metrics are calculated and stored)

Metrics are **not** computed on-the-fly for the main dashboard; they are **pre-calculated** by a server-side pipeline and **read** from the database by the API.

### 3.1 When the pipeline runs

- **Cron:** `server/cron_jobs/job.js` runs `fullSyncForUser(userId, userSecret, { fullSync })` per user (periodically).
- **API:** `POST /api/accounts/sync/full` runs the same `fullSyncForUser` (source sync + pipeline).
- **POST /api/accounts/sync/all** does **not** run the pipeline; it only syncs SnapTrade → MongoDB.

### 3.2 fullSyncForUser (high level)

**File:** `server/src/utils/fullSyncForUser.js`

1. **Step 1 – Source sync:** `syncAllUserData(userId, userSecret, { fullSync })` (as above). If this fails, pipeline is not run.
2. **Step 2 – Metrics pipeline:** `runMetricsPipeline({ userId, fullSync, databaseUrl, steps })`. Default steps: `["price", "valuation", "returns", "metrics", "validate"]`.

### 3.3 runMetricsPipeline (step-by-step)

**File:** `server/src/metrics/runMetricsPipeline.js`

| Step | Name | What it does |
|------|------|--------------|
| 1 | **price** | `updatePriceData(opts)` – ensures **PriceHistory** (and any corporate-action data) is populated for all symbols used in portfolio/activities. |
| 2–3 | **valuation** / **returns** | `updatePortfolioTimeseries(opts)` – builds **PortfolioTimeseries** (and **EquitiesWeightTimeseries**) from positions, activities, and prices; computes daily returns and TWR-related fields. |
| 4 | **metrics** | `calculateMetrics(opts)` – reads **PortfolioTimeseries** and **AccountActivities**, computes period metrics (1M, 3M, YTD, 1Y, ALL), writes to **Metrics** (e.g. `snaptrademetrics`). |
| 5 | **validate** | `validateMetrics(opts)` – data quality checks (no sendAlerts by default). |

Failure of an earlier step can skip dependent steps (e.g. if price fails, valuation and metrics are skipped).

### 3.4 Price data (step 1)

**File:** `server/src/metrics/updateTable/updatePriceData.js`

- **Input:** Unique symbols from **EquitiesWeightTimeseries** and **AccountActivities** (filtered by userId/accountId if provided).
- **Process:** For each symbol, determines date range needed, then uses **Yahoo Finance** (e.g. `yahooFinanceClient.fetchHistoricalPrices` / `fetchMultipleSymbols`) to get adjusted close prices.
- **Output:** Upserts into **PriceHistory** (symbol, date, price, etc.). Crypto symbols may be normalized (e.g. ETH → ETH-USD).

### 3.5 Portfolio timeseries and returns (steps 2–3)

**File:** `server/src/metrics/updateTable/updatePortfolioTimeseries.js`

- **Input:** Account activities, positions, and **PriceHistory**.
- **Process:** Builds units per symbol per day from activities (BUY, SELL, REI, options, etc.); values positions using prices; aggregates to portfolio total value per day; treats CONTRIBUTION/DEPOSIT/WITHDRAWAL/DIVIDEND/option flows as external cash flows for TWR; computes daily returns and period TWR (e.g. 3M, YTD, all-time).
- **Output:** Upserts **PortfolioTimeseries** (and **EquitiesWeightTimeseries**). Fields include `totalValue`, `simpleReturns`, `dailyTWRReturn`, `twr3Months`, `twrYearToDate`, `twrAllTime`, etc.

### 3.6 Calculate metrics (step 4)

**File:** `server/src/metrics/calculateMetrics.js`

- **Input:** **PortfolioTimeseries**, **AccountActivities**, **PriceHistory**; risk-free rate from **Fama-French service** (see below).
- **Date ranges:** Uses `getDateRange(period, asOfDate)` for 1M, 3M, YTD, 1Y, ALL.
- **Per account, per period:**  
  - **Portfolio snapshot:** AUM, asset allocation, HHI, diversification score.  
  - **Income:** Dividend/interest from activities, total income yield.  
  - **Returns:** TWR from timeseries (or pre-calculated TWR fields where available), then CAGR derived from TWR.  
  - **Risk:** Volatility, beta (vs SPY), drawdown, VaR, etc. (from **riskMetrics**, **riskAdjustedMetrics**).  
  - **Risk-adjusted:** Sharpe, Sortino, etc., using Fama-French risk-free rate.
- **Output:** One document per (userId, accountId, date, period) upserted into **Metrics** (e.g. `snaptrademetrics` collection) with a `metrics` object and `computedAtUtc`.

### 3.7 Risk-free rate and factors (Fama-French)

**File:** `server/src/services/famaFrenchService.js`

- **Source:** Kenneth French daily factors (CSV zip from Dartmouth).  
- **Storage:** Parsed and stored in **FamaFrenchFactors** (MongoDB). Cache TTL ~7 days; re-downloads when stale.  
- **Usage:** `getAnnualizedRiskFreeRate()` (and factor series) used in **calculateMetrics** and **metricsController** for Sharpe/Sortino and factor models.

---

## 4. How the UI gets data

### 4.1 Dashboard (portfolio value and metrics)

**File:** `client/src/pages/Dashboard.jsx`

- **Auth:** Uses `userId` from **UserContext**; only fetches when `userId` is set.
- **Accounts:** Fetches `GET /api/accounts` to get list of accounts and optionally `selectedAccountId`.
- **Data in one go:** For a chosen `selectedRange` and optional `accountId`, runs in parallel:
  - `GET /api/portfolio/value?range=...&accountId=...`
  - `GET /api/metrics/performance?range=...&accountId=...`
  - `GET /api/metrics/risk?range=...&accountId=...`
  - `GET /api/metrics/factors?model=FF3&range=...&accountId=...`
- **Server:** These endpoints use **requireAuth**; they read **PortfolioTimeseries** and **Metrics** (and related) from MongoDB and return JSON. No on-the-fly calculation of the main metrics; they were computed by the pipeline.

### 4.2 Portfolio value API (example)

**File:** `server/src/controllers/metricsController.js` → `getPortfolioValue`

- Reads **PortfolioTimeseries** for `req.user.userId`, optional `accountId`, and date range from `getDateRange(range)`.
- Aggregates by date (equity, cashFlow), builds `points` for the chart.
- Uses pre-calculated TWR fields when available (e.g. for single account) or recalculates from aggregated data for “all portfolios”.
- Returns `{ benchmark, range, points, summary }`.

### 4.3 Other dashboard APIs

- **getPerformance**, **getRisk**, **getFactors**, **getKpis**, **getTimeseries** in **metricsController** read from **Metrics**, **PortfolioTimeseries**, **AccountHoldings**, **AccountActivities**, etc., and apply range/account filters. They do not re-run the full metrics pipeline.

### 4.4 Refresh button (accounts only)

**File:** `client/src/components/refreshButton/refreshButton.jsx`

- Calls `POST /api/accounts/sync/all` with `{ userId, fullSync: false }`.
- This only refreshes SnapTrade → MongoDB (accounts, holdings, positions, activities, options). It does **not** run the metrics pipeline. To refresh metrics, the user or cron must call **POST /api/accounts/sync/full** (or equivalent).

### 4.5 Full sync (source + metrics) from UI

- **ConnectBrokerage** (or Settings) can call **POST /api/accounts/sync/full** (e.g. “Update All Data” with `fullSync: true` or `false`). That runs `fullSyncForUser`, which does both SnapTrade sync and the metrics pipeline.

---

## 5. Summary diagram (conceptual)

```
[User]
  │
  ├─ Sign up / Login ──► authController ──► JWT cookies ──► UserContext (userId, user)
  │
  ├─ Connect broker ──► SnapTrade portal ──► exchange ──► sync holdings ──► MongoDB (Accounts, Holdings, Activities, …)
  │
  ├─ Refresh accounts ──► POST /api/accounts/sync/all ──► syncAllUserData ──► SnapTrade ──► MongoDB (source collections only)
  │
  ├─ Full sync / Cron ──► POST /api/accounts/sync/full ──► fullSyncForUser
  │                           │
  │                           ├─ syncAllUserData ──► SnapTrade ──► MongoDB
  │                           └─ runMetricsPipeline
  │                                  ├─ updatePriceData ──► Yahoo Finance ──► PriceHistory
  │                                  ├─ updatePortfolioTimeseries ──► PortfolioTimeseries, EquitiesWeightTimeseries
  │                                  ├─ calculateMetrics ──► FamaFrench + PriceHistory + Timeseries ──► Metrics
  │                                  └─ validateMetrics
  │
  └─ Dashboard / Portfolio / etc. ──► GET /api/portfolio/value, GET /api/metrics/* ──► Read from MongoDB (PortfolioTimeseries, Metrics) ──► UI
```

---

## 6. Key files reference

| Flow | Client | Server |
|------|--------|--------|
| Sign up | `client/src/pages/auth/Signup.jsx` | `server/src/controllers/authController.js` (signup), `server/src/routes/authRoutes.js` |
| Login | `client/src/components/login/Login.jsx` | `authController.login`, `authRoutes` |
| Session check | `client/src/App.jsx` | `GET /api/user/me` → `authController.getCurrentUser`, `server/src/routes/user.js` |
| Logout | `client/src/components/auth/Logout.jsx` | `authController.logout` |
| Token refresh | `client/src/utils/authInterceptor.js` | `authController.refresh` |
| Protected routes | `client/src/utils/ProtectedRoutes.jsx` | `server/src/middleware/authMiddleware.js` (requireAuth) |
| SnapTrade portal / exchange | `ConnectBrokerage.jsx`, `Settings.jsx` | `connectionsController`, `server/src/routes/connections.js` |
| Sync source data | `refreshButton.jsx` (sync/all) | `server/src/routes/accounts.js` (sync/all), `syncAllUserData.js`, `updateAccountHoldings.js`, `accountClient.syncAllAccountData` |
| Full sync (source + metrics) | Settings / “Update All Data” | `server/src/routes/accounts.js` (sync/full), `fullSyncForUser.js`, `runMetricsPipeline.js` |
| Metrics pipeline | — | `runMetricsPipeline.js`, `updatePriceData.js`, `updatePortfolioTimeseries.js`, `calculateMetrics.js`, `validateMetrics.js` |
| Dashboard data | `client/src/pages/Dashboard.jsx` | `server/src/controllers/metricsController.js`, portfolio + metrics routes |
| API client / cookies | `client/src/utils/apiClient.js` | — |

---

*Document generated from codebase exploration. Update this file when flows or entry points change.*
