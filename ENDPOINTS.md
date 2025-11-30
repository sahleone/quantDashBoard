# API Endpoints Documentation

This document provides a comprehensive list of all API endpoints in the QuantDashBoard application.

**Base URL:** `/api` (all endpoints are prefixed with `/api`)

**Authentication:** Most endpoints require authentication via JWT token in the `Authorization` header as `Bearer <token>` or via the `jwt` cookie.

---

## Root Endpoint

### GET /
- **Description:** Health check endpoint to verify server is running
- **Authentication:** Not required
- **Response:** `"Hello, World!\n The server is running!\n woohoo!"`

---

## Authentication Routes (`/api/auth`)

### POST /api/auth/signup
- **Description:** Register a new user account
- **Authentication:** Not required
- **Request Body:**
  ```json
  {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "password": "string"
  }
  ```
- **Response:** `{ user, accessToken, refreshToken }`
- **Notes:** Creates a SnapTrade user automatically during signup

### POST /api/auth/login
- **Description:** Authenticate user and receive access/refresh tokens
- **Authentication:** Not required
- **Request Body:**
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response:** `{ user, accessToken, refreshToken }`

### POST /api/auth/refresh
- **Description:** Refresh expired access token using refresh token
- **Authentication:** Not required (uses refresh token from cookie or body)
- **Request Body (optional):** `{ refreshToken: "string" }`
- **Response:** `{ accessToken }`
- **Notes:** Refresh token can be provided in cookie or request body

### POST /api/auth/logout
- **Description:** Logout user and invalidate refresh token
- **Authentication:** Not required
- **Response:** `{ message: "Logged out successfully" }`

---

## User Routes (`/api/user`)

### GET /api/user/me
- **Description:** Get current authenticated user's profile information
- **Authentication:** Required
- **Response:** `{ user: {...} }`
- **Notes:** Returns user profile including preferences

### PATCH /api/user/me
- **Description:** Update current user's profile information
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "firstName": "string (optional)",
    "lastName": "string (optional)",
    "preferences": { ... } (optional)
  }
  ```
- **Response:** `{ user: {...} }`

---

## Connection Routes (`/api/connections`)

### POST /api/connections/snaptrade/portal
- **Description:** Generate SnapTrade connection portal URL for brokerage linking
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string",
    "broker": "string (optional)",
    "customRedirect": "string (optional)",
    "connectionType": "string (optional)"
  }
  ```
- **Response:** `{ redirectUrl, portalId, expiresAt }`

### POST /api/connections/snaptrade/exchange
- **Description:** Exchange authorization code for connection details after user authorizes brokerage
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string",
    "authorizationId": "string"
  }
  ```
- **Response:** `{ connectionId, authorizationId, accounts, brokerage, status }`

### GET /api/connections
- **Description:** List all user's brokerage connections
- **Authentication:** Required
- **Request Body:** `{ userId, userSecret }`
- **Response:** `{ connections, health, summary }`

### DELETE /api/connections/:connectionId
- **Description:** Remove a brokerage connection
- **Authentication:** Required
- **Request Body:** `{ userId, userSecret }`
- **Response:** `{ message, connectionId }`

### GET /api/connections/health
- **Description:** Check health status of all user's connections
- **Authentication:** Required
- **Request Body:** `{ userId, userSecret }`
- **Response:** `{ health, lastChecked }`

### POST /api/connections/refresh
- **Description:** Refresh connections data from SnapTrade API
- **Authentication:** Required
- **Request Body:** `{ userId, userSecret (optional) }`
- **Response:** `{ message, connections, total }`

### GET /api/connections/debug
- **Description:** Debug endpoint to inspect authentication tokens and user info
- **Authentication:** Required
- **Response:** `{ authInfo, userInfo, token, cookies, headers }`

### GET /api/connections/test
- **Description:** Simple test endpoint to verify authentication is working
- **Authentication:** Required
- **Response:** `{ message, user }`

---

## Account Routes (`/api/accounts`)

### GET /api/accounts
- **Description:** List all user accounts
- **Authentication:** Required
- **Request Body:** `{ userId }`
- **Response:** `{ accounts, total }`

### GET /api/accounts/holdings
- **Description:** Get account holdings with pagination and filtering
- **Authentication:** Required
- **Query Parameters:**
  - `accountId` (optional): Filter by specific account
  - `page` (optional): Page number (default: 1)
  - `pageSize` (optional): Items per page (default: 50)
  - `symbol` (optional): Filter by symbol
  - `assetType` (optional): Filter by asset type (e.g., "equity")
  - `asOf` (optional): Date in YYYY-MM-DD format
- **Request Body:** `{ userId }`
- **Response:** `{ holdings, pagination, summary }`

### GET /api/accounts/balances
- **Description:** Get account balances from SnapTrade API
- **Authentication:** Required
- **Query Parameters:**
  - `accountId`: Account ID to fetch balances for
- **Request Body:** `{ userId, userSecret }` (from JWT token)
- **Response:** `{ balances, totals, asOf, source }`

### GET /api/accounts/positions
- **Description:** Get account positions
- **Authentication:** Required
- **Query Parameters:**
  - `accountId`: Account ID
  - `asOf` (optional): Date in YYYY-MM-DD format
- **Request Body:** `{ userId }`
- **Response:** `{ positions, summary, asOf }`

### GET /api/accounts/activities
- **Description:** Get account activities (transactions, trades, etc.)
- **Authentication:** Required
- **Query Parameters:**
  - `accountId`: Account ID
  - `startDate` (optional): Start date in YYYY-MM-DD format
  - `endDate` (optional): End date in YYYY-MM-DD format
  - `limit` (optional): Maximum number of results (default: 1000)
  - `type` (optional): Comma-separated activity types (e.g., "BUY,SELL")
- **Request Body:** `{ userId }`
- **Response:** `{ activities, summary }`

### GET /api/accounts/positions/:symbol
- **Description:** Get position details for a specific symbol across all accounts
- **Authentication:** Required
- **Request Body:** `{ userId }`
- **Response:** `{ symbol, currentPosition, aggregatePosition, history, accounts }`

### POST /api/accounts/sync/holdings
- **Description:** Sync holdings data from SnapTrade for specific accounts
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string",
    "accountIds": ["string"] (optional),
    "fullSync": boolean (optional, default: false)
  }
  ```
- **Response:** `{ message, results, summary }`

### POST /api/accounts/sync/holdings/connections
- **Description:** Sync holdings for all accounts across user's connections
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string (optional)",
    "fullSync": boolean (optional, default: false)
  }
  ```
- **Response:** `{ message, results }`

### POST /api/accounts/refresh
- **Description:** Refresh account data from SnapTrade API
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string"
  }
  ```
- **Response:** `{ message, accounts, total }`

---

## SnapTrade Routes (`/api/snaptrade`)

### POST /api/snaptrade/sync/connections
- **Description:** Sync user connections from SnapTrade API
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string"
  }
  ```
- **Response:** `{ message, connections }`

### POST /api/snaptrade/sync/accounts
- **Description:** Sync user accounts from SnapTrade API
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string"
  }
  ```
- **Response:** `{ message, accounts }`

### POST /api/snaptrade/sync/balances
- **Description:** Sync account balances from SnapTrade API
- **Authentication:** Required
- **Query Parameters:**
  - `userId`: User ID
  - `userSecret`: User secret
  - `accountId`: Account ID
- **Response:** `{ message, balances }`

### POST /api/snaptrade/sync/positions
- **Description:** Sync account positions from SnapTrade API
- **Authentication:** Required
- **Query Parameters:**
  - `userId`: User ID
  - `userSecret`: User secret
  - `accountId`: Account ID
- **Response:** `{ message, positions }`

### GET /api/snaptrade/portfolio/:userId
- **Description:** Get aggregated portfolio snapshot for a specific user
- **Authentication:** Required
- **Response:** `{ accounts, connections, summary }`

### GET /api/snaptrade/portfolio
- **Description:** Get aggregated portfolio snapshot for authenticated user
- **Authentication:** Required
- **Response:** `{ accounts, connections, summary }`

### PATCH /api/snaptrade/connections/:authorizationId
- **Description:** Update a specific connection (brokerage authorization)
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "userSecret": "string",
    "updates": { ... }
  }
  ```
- **Response:** `{ message, connection }`

### POST /api/snaptrade/sync/options/holdings
- **Description:** Sync account option holdings from SnapTrade API
- **Authentication:** Required
- **Request Body or Query:**
  - `userId`: User ID
  - `userSecret`: User secret
  - `accountId`: Account ID
- **Response:** `{ message, holdings }`

### GET /api/snaptrade/options/chain
- **Description:** Retrieve options chain from SnapTrade API
- **Authentication:** Required
- **Query Parameters:**
  - `symbol`: Stock symbol (e.g., "AAPL")
- **Response:** `{ chain, symbol }`

### GET /api/snaptrade/options/holdings
- **Description:** Fetch option holdings from SnapTrade (pass-through, no DB persistence)
- **Authentication:** Required
- **Query Parameters:**
  - `userId`: User ID
  - `userSecret`: User secret
  - `accountId`: Account ID
- **Response:** `{ holdings }`

### GET /api/snaptrade/options/dbholdings
- **Description:** Get option holdings from database; if none for today, call SnapTrade and persist
- **Authentication:** Required
- **Query Parameters:**
  - `accountId`: Account ID
- **Response:** `{ holdings, source, asOf }`

### GET /api/snaptrade/debug/resolve
- **Description:** Dev-only route to resolve a ticker to the SnapTrade universal symbol
- **Authentication:** Required
- **Query Parameters:**
  - `ticker`: Stock ticker symbol (e.g., "PLTY")
- **Response:** `{ ticker, universalSymbol }`

---

## Metrics Routes

### GET /api/portfolio/value
- **Description:** Get portfolio value over time with optional benchmark comparison
- **Authentication:** Required
- **Query Parameters:**
  - `range` (optional): Time range (e.g., "YTD", "1Y", "6M")
  - `benchmark` (optional): Benchmark symbol (e.g., "SPY")
- **Request Body:** `{ userId }`
- **Response:** `{ benchmark, points, summary }`

### GET /api/metrics/performance
- **Description:** Get portfolio performance metrics (returns, volatility, Sharpe ratio, beta, etc.)
- **Authentication:** Required
- **Query Parameters:**
  - `range` (optional): Time range (e.g., "1Y", "6M", "YTD")
  - `benchmark` (optional): Benchmark symbol (e.g., "SPY")
- **Request Body:** `{ userId }`
- **Response:** `{ returns, volatility, sharpe, beta, maxDrawdown, calmar }`

### GET /api/metrics/risk
- **Description:** Get risk metrics (VaR, CVaR, volatility, beta, correlation)
- **Authentication:** Required
- **Query Parameters:**
  - `range` (optional): Time range (e.g., "1Y")
  - `confidence` (optional): Confidence level for VaR/CVaR (default: 0.95)
- **Request Body:** `{ userId }`
- **Response:** `{ var, cvar, volatility, beta, correlation }`

### GET /api/metrics/factors
- **Description:** Get factor exposures (e.g., Fama-French 3-factor model)
- **Authentication:** Required
- **Query Parameters:**
  - `model` (optional): Factor model (e.g., "FF3", default: "FF3")
  - `range` (optional): Time range (e.g., "1Y")
- **Request Body:** `{ userId }`
- **Response:** `{ model, exposures, statistics }`

### GET /api/metrics/kpis
- **Description:** Get key performance indicators
- **Authentication:** Required
- **Query Parameters:**
  - `range` (optional): Time range (e.g., "1Y")
- **Request Body:** `{ userId }`
- **Response:** `{ kpis, summary, lastUpdated }`

### GET /api/metrics/timeseries
- **Description:** Get time series metrics (returns, volatility, etc.)
- **Authentication:** Required
- **Query Parameters:**
  - `series` (optional): Comma-separated series names (e.g., "returns,vol")
  - `range` (optional): Time range (e.g., "1Y")
- **Request Body:** `{ userId }`
- **Response:** `{ series, data, summary }`

### POST /api/metrics/calculate
- **Description:** Manually trigger metrics calculation pipeline
- **Authentication:** Required
- **Request Body:**
  ```json
  {
    "userId": "string",
    "accountId": "string (optional)",
    "fullSync": boolean (optional, default: false),
    "steps": ["string"] (optional)
  }
  ```
- **Response:** `{ success, results, summary }`

---

## Alpha Vantage Proxy Routes (`/api/alphavantage` or `/api/massive`)

**Note:** `/api/massive` is an alias for `/api/alphavantage` for backward compatibility.

### GET /api/alphavantage/overview/:ticker
- **Description:** Get company overview from Alpha Vantage API
- **Authentication:** Not required
- **Path Parameters:**
  - `ticker`: Stock ticker symbol (e.g., "AAPL")
- **Response:** Company overview data from Alpha Vantage
- **Notes:** Requires `ALPHA_VANTAGE_API_KEY` environment variable

### GET /api/alphavantage/daily/:ticker
- **Description:** Get daily time series data from Alpha Vantage API
- **Authentication:** Not required
- **Path Parameters:**
  - `ticker`: Stock ticker symbol (e.g., "AAPL")
- **Query Parameters:**
  - `from` (optional): Start date in YYYY-MM-DD format
  - `to` (optional): End date in YYYY-MM-DD format
  - `outputsize` (optional): "compact" or "full" (default: "full")
- **Response:** `{ results: [{ dateStr, t, c }, ...] }` where `t` is timestamp in milliseconds and `c` is close price
- **Notes:** Requires `ALPHA_VANTAGE_API_KEY` environment variable

---

## Massive Proxy Routes (`/api/massive`)

**Note:** These routes proxy requests to the Massive API. The `/api/massive` path also serves as an alias for Alpha Vantage routes.

### GET /api/massive/reference/tickers/:ticker
- **Description:** Proxy for Massive API reference ticker data
- **Authentication:** Not required
- **Path Parameters:**
  - `ticker`: Stock ticker symbol (e.g., "AAPL")
- **Response:** Ticker reference data from Massive API
- **Notes:** Requires `MASSIVE_API_KEY` environment variable

### GET /api/massive/aggs/ticker/:ticker/range/1/:timespan/:from/:to
- **Description:** Proxy for Massive API aggregates (chart data)
- **Authentication:** Not required
- **Path Parameters:**
  - `ticker`: Stock ticker symbol (e.g., "AAPL")
  - `timespan`: Time span (e.g., "day", "hour", "minute")
  - `from`: Start date in YYYY-MM-DD format
  - `to`: End date in YYYY-MM-DD format
- **Query Parameters:**
  - `adjusted` (optional): Boolean
  - `sort` (optional): Sort order
  - `limit` (optional): Result limit
- **Response:** Aggregates data from Massive API
- **Notes:** Requires `MASSIVE_API_KEY` environment variable

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional error details (optional)"
  }
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required or invalid token)
- `404`: Not Found
- `500`: Internal Server Error
- `502`: Bad Gateway (upstream API error)

---

## Notes

1. **Authentication:** Most endpoints require a valid JWT token. The token can be provided via:
   - `Authorization` header: `Bearer <token>`
   - `jwt` cookie (set automatically on login/signup)

2. **User Context:** For authenticated endpoints, `userId` and `userSecret` are typically extracted from the JWT token. Some endpoints allow these to be provided in the request body for flexibility.

3. **SnapTrade Integration:** Many endpoints interact with the SnapTrade API. Ensure `userSecret` is available for these operations.

4. **Environment Variables:** 
   - `ALPHA_VANTAGE_API_KEY`: Required for Alpha Vantage proxy endpoints
   - `MASSIVE_API_KEY`: Required for Massive API proxy endpoints

5. **Date Formats:** Dates should be provided in `YYYY-MM-DD` format.

6. **Pagination:** Endpoints that support pagination use `page` and `pageSize` query parameters.

---

**Last Updated:** 2025-01-27

