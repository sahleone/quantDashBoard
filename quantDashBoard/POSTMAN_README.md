Quick guide to testing the quantDashBoard server with Postman

Setup

- Start the server: the backend port defaults to 3000 (see server/src/config/environment.js). Ensure MongoDB is running and .env contains required SNAPTRADE vars.

Import collection

1. Open Postman -> Import -> File -> select `postman_collection.json` in the project root.
2. Set environment or collection variables:
   - baseUrl: http://localhost:3000 (or your deployed URL)
   - accessToken: (leave blank until you login)
   - refreshToken: (optional)
   - userId: (optional - set to the user's userId for SnapTrade ops)

Auth flow notes

- Login (`POST /api/auth/login`) returns JSON with accessToken and refreshToken and also sets an httpOnly cookie `refreshToken`.
- For authenticated requests set the header `Authorization: Bearer {{accessToken}}`.
- You can refresh an access token via `POST /api/auth/refresh` (send `refreshToken` in body or rely on cookie set by login).

Quick curl examples (replace values)

Signup

```bash
curl -X POST {{baseUrl}}/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Test","lastName":"User","email":"test@example.com","password":"password123"}'
```

Login

```bash
curl -X POST {{baseUrl}}/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```

Get current user

```bash
curl -X GET {{baseUrl}}/api/user/me \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

List accounts

```bash
curl -X GET {{baseUrl}}/api/accounts \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Generate SnapTrade portal

```bash
curl -X POST {{baseUrl}}/api/connections/snaptrade/portal \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>"}'
```

Exchange authorization (portal -> saved connection)

```bash
curl -X POST {{baseUrl}}/api/connections/snaptrade/exchange \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>","authorizationId":"<AUTHORIZATION_ID>"}'
```

List connections

```bash
curl -X GET {{baseUrl}}/api/connections \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Connection debug

```bash
curl -X GET {{baseUrl}}/api/connections/debug \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Connection test

```bash
curl -X GET {{baseUrl}}/api/connections/test \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Connection health

```bash
curl -X GET {{baseUrl}}/api/connections/health \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Remove connection

```bash
curl -X DELETE {{baseUrl}}/api/connections/<CONNECTION_ID> \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Accounts & Positions

```bash
# Get holdings (with query)
curl -X GET "{{baseUrl}}/api/accounts/holdings?accountId=<ACCOUNT_ID>&page=1&pageSize=50&symbol=AAPL" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Get balances
curl -X GET "{{baseUrl}}/api/accounts/balances?accountId=<ACCOUNT_ID>" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Get positions
curl -X GET "{{baseUrl}}/api/accounts/positions?accountId=<ACCOUNT_ID>&asOf=2025-01-01" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Get return rates (account)
curl -X GET {{baseUrl}}/api/accounts/<ACCOUNT_ID>/returnRates \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Get return rates (user)
curl -X GET {{baseUrl}}/api/accounts/returnRates \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Sync holdings (trigger)
curl -X POST {{baseUrl}}/api/sync/holdings \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>","accountIds":[],"fullSync":true}'

# Get position details by symbol
curl -X GET {{baseUrl}}/api/positions/AAPL \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

SnapTrade Sync

```bash
# Sync connections
curl -X POST {{baseUrl}}/api/snaptrade/sync/connections \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>"}'

# Sync accounts
curl -X POST {{baseUrl}}/api/snaptrade/sync/accounts \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>"}'

# Sync balances for an account
curl -X POST {{baseUrl}}/api/snaptrade/sync/balances \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>","accountId":"<ACCOUNT_ID>"}'

# Sync positions for an account
curl -X POST {{baseUrl}}/api/snaptrade/sync/positions \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USERID>","userSecret":"<SNAPTRADE_USER_SECRET>","accountId":"<ACCOUNT_ID>"}'

# Get user portfolio by id
curl -X GET {{baseUrl}}/api/snaptrade/portfolio/<USERID> \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Get user portfolio (me)
curl -X GET {{baseUrl}}/api/snaptrade/portfolio \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Metrics

```bash
# Portfolio value
curl -X GET "{{baseUrl}}/api/portfolio/value?range=YTD&benchmark=SPY" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Performance metrics
curl -X GET "{{baseUrl}}/api/metrics/performance?range=1Y&benchmark=SPY" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Risk metrics
curl -X GET "{{baseUrl}}/api/metrics/risk?range=1Y&confidence=0.95" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Factor exposures
curl -X GET "{{baseUrl}}/api/metrics/factors?model=FF3&range=1Y" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# KPIs
curl -X GET "{{baseUrl}}/api/metrics/kpis?range=1Y" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'

# Time series
curl -X GET "{{baseUrl}}/api/metrics/timeseries?series=returns,vol&range=1Y" \
  -H 'Authorization: Bearer <ACCESS_TOKEN>'
```

Notes and caveats

- Many SnapTrade-related endpoints require a `userSecret` created by the system when the user was registered. If missing, some calls will fail.
- The server accepts `refreshToken` either as an httpOnly cookie or in the POST body for `/api/auth/refresh`.

If you'd like, I can also:

- Run a quick smoke test against your running server (I can run curl from here if you start the server), or
- Extend the Postman collection to include tests that automatically set `accessToken` variable after login.

Auto-set accessToken in Postman (optional)

- In the Login request in the imported collection, open the "Tests" tab and add this snippet to save the accessToken and refreshToken to collection variables:

```javascript
const json = pm.response.json();
if (json.accessToken) {
  pm.collectionVariables.set("accessToken", json.accessToken);
}
if (json.refreshToken) {
  pm.collectionVariables.set("refreshToken", json.refreshToken);
}
if (json.user && json.user.userId) {
  pm.collectionVariables.set("userId", json.user.userId);
}
```

Validation checklist (static)

- Ensure server is running and ports match `baseUrl`.
- Confirm environment variables: `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_SECRET`, `DATABASE_URL` (if not using default local MongoDB).
- When testing SnapTrade endpoints, ensure the user has a `userSecret` created (signup attempts to create it but may fail if SnapTrade creds are invalid).

Done — the Postman collection `postman_collection.json` and this README include all endpoints and example requests.
