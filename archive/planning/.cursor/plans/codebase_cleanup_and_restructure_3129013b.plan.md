---
name: Codebase Cleanup and Restructure
overview: Clean up and reorganize the MERN stack codebase following React best practices, moving unused files to archive, and improving overall structure.
todos:
  - id: move-metrics
    content: Move metrics/ folder to quantDashBoard/server/src/metrics/ and update all relative imports
    status: pending
  - id: update-metrics-imports
    content: Update all files that import from metrics (server controllers, tests, scripts)
    status: pending
    dependencies:
      - move-metrics
  - id: move-utility-scripts
    content: Move root-level utility scripts (clearAndRunPipeline.js, syncSourceData.js, sanityCheckValuation.js, debugMaxValue.js) to server/scripts/
    status: pending
  - id: fix-react-structure
    content: "Fix React structure: remove/archive pages/metrics.js (frontend should not calculate metrics), move Signup.jsx to pages/auth/, standardize component naming"
    status: pending
  - id: organize-docs
    content: Move root-level documentation files to docs/ folder
    status: pending
  - id: clean-root
    content: Clean up root directory, move pipeline_output.log to archive if unused
    status: pending
    dependencies:
      - move-utility-scripts
      - organize-docs
  - id: update-all-imports
    content: Update all import paths throughout codebase after file moves
    status: pending
    dependencies:
      - move-metrics
      - move-utility-scripts
      - fix-react-structure
  - id: integrate-pipeline
    content: Integrate metrics pipeline into cron job (daily sync) and refresh button (manual refresh)
    status: pending
    dependencies:
      - move-metrics
      - update-metrics-imports
  - id: cleanup-database-collections
    content: "Clean up database collections: standardize naming, fix model inconsistencies, replace hardcoded collection names with model references, identify and remove unused/duplicate collections"
    status: pending
    dependencies:
      - move-metrics
      - update-metrics-imports
  - id: cleanup-endpoints-controllers
    content: "Clean up endpoints and controllers: remove unused/redundant endpoints, standardize error responses, improve code organization, remove AppUsers.js if unused"
    status: pending
  - id: create-api-documentation
    content: "Create comprehensive API README documenting all endpoints: request/response formats, authentication requirements, error codes, examples"
    status: pending
    dependencies:
      - cleanup-endpoints-controllers
  - id: verify-tests
    content: Verify all tests still work after restructuring
    status: pending
    dependencies:
      - update-all-imports
      - integrate-pipeline
      - cleanup-database-collections
      - cleanup-endpoints-controllers
---

# Codebase Cleanup and Restructure Plan

## Current Issues Identified

1. **Root-level clutter**: Utility scripts (`clearAndRunPipeline.js`, `syncSourceData.js`, `sanityCheckValuation.js`, `debugMaxValue.js`), documentation files, and `metrics/` folder at root
2. **Metrics folder location**: `metrics/` at root imports server models with relative paths (`../../quantDashBoard/server/src/models/`)
3. **React structure issues**: 

- `pages/metrics.js` contains utility functions, not a React component
- Inconsistent component naming (some lowercase, some PascalCase)
- `Signup.jsx` and `Logout.jsx` in components instead of pages

4. **Test organization**: Tests at root level, should be better organized
5. **Documentation**: Scattered markdown files at root level
6. **Data pipeline integration**: Daily data sync and metrics calculation should be integrated into cron job and refresh button workflow

## Restructuring Plan

### 1. Move Metrics to Server

- **Move** `metrics/` folder → `quantDashBoard/server/src/metrics/`
- **Update imports** in metrics files to use relative paths from new location
- **Update** server files that import from metrics (e.g., `metricsController.js`, `test_helper.js`)
- **Update** test files that reference metrics

### 2. Organize Root-Level Scripts

- **Move** utility scripts to `quantDashBoard/server/scripts/`:
- `clearAndRunPipeline.js` → `server/scripts/clearAndRunPipeline.js`
- `syncSourceData.js` → `server/scripts/syncSourceData.js`
- `sanityCheckValuation.js` → `server/scripts/sanityCheckValuation.js`
- `debugMaxValue.js` → `server/scripts/debugMaxValue.js`
- **Update** import paths in these scripts

### 3. Fix React Structure (Following Best Practices)

- **Remove/Move** `pages/metrics.js` (contains metric calculation functions that should NOT be in frontend):
- **IMPORTANT**: Metrics calculation happens ONLY on backend and is stored in MongoDB `snaptrademetrics` collection
- Frontend should ONLY fetch metrics from backend API endpoints (already correct in Dashboard.jsx)
- `pages/metrics.js` contains calculation functions (expectedReturn, volatility, sharpeRatio, etc.) that are not used
- **Action**: Move to `archive/frontend-unused/metrics-calculations.js` or delete if confirmed unused
- **Create** proper `pages/Metrics.jsx` component if needed (for displaying metrics, not calculating)
- **Move** `components/Signup.jsx` → `pages/auth/Signup.jsx`
- **Move** `components/Logout.jsx` → `components/auth/Logout.jsx` (or keep as component if used in layout)
- **Standardize** component naming: ensure all components use PascalCase
- **Check** component organization: ensure related components are grouped

### 4. Organize Documentation

- **Move** root-level docs to `docs/` folder:
- `ENDPOINTS.md` → `docs/ENDPOINTS.md`
- `SANITY_CHECK_APPROACH.md` → `docs/SANITY_CHECK_APPROACH.md`
- `OPTIONS_DEBUG_SUMMARY.md` → `docs/OPTIONS_DEBUG_SUMMARY.md`
- **Keep** `Readme.md` at root (main project readme)
- **Move** metrics documentation to `quantDashBoard/server/src/metrics/docs/` or keep in metrics folder

### 5. Archive Unused/Experimental Files

- **Move** to `archive/scripts/`:
- `pipeline_output.log` → `archive/logs/pipeline_output.log` (if not actively used)
- **Review** `archive/` folder structure and ensure it's well-organized

### 6. Test Organization

- **Keep** `tests/` at root (standard practice)
- **Update** test imports after metrics move
- **Ensure** test structure follows best practices

### 7. Clean Up Root Directory

- **Remove** or archive any temporary files
- **Ensure** only essential files remain at root:
- `package.json` (root dependencies)
- `Readme.md`
- `.gitignore`
- `quantDashBoard/` (main app)
- `tests/` (test suite)
- `archive/` (archived code)

### 8. Database Collection Cleanup

- **Collection Naming Issues Identified**:
- Hardcoded collection names in code instead of using `Model.collection.name`
- Inconsistent naming: some use "snaptrade" prefix, some don't
- Model name inconsistencies:
- `AccountHoldings.js` exports `AccountPositions` but model is `SnapTradeAccountPositions` (confusing)
- `AccountPositions.js` uses `SnapTradeAccountPositionsV2` (V2 suggests legacy version exists)
- `Users.js` uses lowercase `"user"` model name (inconsistent with other models)
- Potential duplicate collections: `AccountDetail` vs `AccountsList` (both store account info)

- **Actions to Take**:

1. **Standardize Model Names**:

- Fix `AccountHoldings.js` to export correct model name or rename file
- Decide on `AccountPositions` vs `AccountPositionsV2` - consolidate if V1 exists
- Change `Users.js` model name from `"user"` to `"User"` for consistency
- Review if `AccountDetail` and `AccountsList` can be consolidated

2. **Replace Hardcoded Collection Names**:

- Replace `db.collection("snaptradeaccountactivities")` with `Activities.collection.name`
- Replace `db.collection("portfoliotimeseries")` with `PortfolioTimeseries.collection.name`
- Replace `db.collection("snaptrademetrics")` with `Metrics.collection.name`
- Replace all hardcoded collection names throughout codebase

3. **Collection Naming Convention**:

- Standardize on consistent naming (either all with "snaptrade" prefix or remove prefix)
- Document collection names in a central location
- Use Mongoose model names consistently (Mongoose auto-pluralizes and lowercases)

4. **Identify Unused Collections**:

- Check for legacy collections that are no longer used
- Document which collections are active vs archived
- Create migration script to clean up unused collections (if needed)

- **Collection Mapping** (Current State):
- `SnapTradeAccount` → `snaptradeaccounts`
- `SnapTradeAccountActivities` → `snaptradeaccountactivities`
- `SnapTradeMetrics` → `snaptrademetrics`
- `SnapTradeAccountPositionsV2` → `snaptradeaccountpositionsv2`
- `SnapTradeAccountPositions` → `snaptradeaccountpositions` (from AccountHoldings.js)
- `SnapTradeAccountOptions` → `snaptradeaccountoptions`
- `SnapTradeConnection` → `snaptradeconnections`
- `SnapTradeAccountDetails` → `snaptradeaccountdetails`
- `PortfolioTimeseries` → `portfoliotimeseries`
- `PriceHistory` → `pricehistories`
- `EquitiesWeightTimeseries` → `equitiesweighttimeseries`
- `CorporateActions` → `corporateactions`
- `user` → `users` (should be `User` → `users`)

### 9. Endpoints and Controllers Cleanup

- **Current Issues**:
- `AppUsers.js` controller exists but may be unused/redundant (check if used)
- Inconsistent error response formats across controllers
- Some endpoints may be redundant (e.g., `/api/snaptrade/` vs `/api/accounts/`)
- Missing or incomplete JSDoc comments
- Inconsistent request/response validation
- ENDPOINTS.md exists but may be outdated

- **Actions to Take**:

1. **Review and Remove Unused Code**:

- Check if `AppUsers.js` is used anywhere, remove if unused
- Identify duplicate/redundant endpoints
- Remove deprecated endpoints

2. **Standardize Error Responses**:

- Create consistent error response format across all controllers
- Use standard HTTP status codes
- Include error codes and messages consistently

3. **Improve Code Organization**:

- Ensure each controller has clear responsibilities
- Add JSDoc comments to all controller methods
- Standardize request validation
- Add response type definitions

4. **Route Organization**:

- Review route structure for logical grouping
- Ensure RESTful conventions are followed
- Remove any duplicate routes

### 10. API Documentation README

- **Create Comprehensive API Documentation**:
- Location: `quantDashBoard/server/API.md` or `quantDashBoard/server/README.md`
- Update existing `ENDPOINTS.md` or create new comprehensive doc

- **Documentation Should Include**:

1. **Overview**:

- Base URL and authentication requirements
- Common request/response formats
- Error handling conventions

2. **For Each Endpoint**:

- HTTP method and path
- Description
- Authentication requirements
- Request parameters (query, path, body)
- Request body schema (if applicable)
- Response schema with examples
- Error responses with codes
- Example requests/responses

3. **Endpoint Categories**:

- Authentication (`/api/auth/*`)
- User Management (`/api/user/*`)
- Connections (`/api/connections/*`)
- Accounts (`/api/accounts/*`)
- SnapTrade Integration (`/api/snaptrade/*`)
- Metrics (`/api/metrics/*`, `/api/portfolio/*`)
- Proxies (`/api/alphavantage/*`, `/api/massive/*`)

4. **Additional Sections**:

- Authentication flow
- Rate limiting (if applicable)
- Webhooks (if any)
- Versioning strategy
- Migration guide (if breaking changes)

### 11. Data Pipeline Integration

- **Current state**: 
- Cron job exists at `quantDashBoard/server/cron_jobs/job.js` but only syncs accounts
- Refresh button calls `/api/accounts/refresh`, `/api/connections/refresh`, and `/api/accounts/sync/holdings/connections`
- Metrics pipeline exists but not fully integrated
- **Metrics Calculation Architecture** (CRITICAL):
- **Backend Only**: All metrics calculation happens on the backend via `metrics/calculateMetrics.js`
- **Storage**: Metrics are stored in MongoDB collection `snaptrademetrics` (via Metrics model)
- **Collection**: Uses `SnapTradeMetrics` model which maps to `snaptrademetrics` collection
- **Frontend**: Frontend ONLY fetches pre-calculated metrics from API endpoints (no calculations on frontend)
- **Returns Timeseries Source** (IMPORTANT):
- **Original Implementation**: `archive/test/attempt.js` contains the original TWR (Time-Weighted Return) calculation logic
- **Current Production**: `metrics/updateTable/updatePortfolioTimeseries.js` implements similar logic (comments reference "like attempt.js")
- **Data Flow**: 
  1. `updatePortfolioTimeseries.js` calculates and stores returns in `PortfolioTimeseries` collection
  2. Stores: `simpleReturns`, `dailyTWRReturn`, `twr1Day`, `twr3Months`, `twrYearToDate`, `twrAllTime`, `equityIndex`
  3. `calculateMetrics.js` reads from `PortfolioTimeseries` collection to calculate metrics
- **Note**: `attempt.js` is archived but its logic is preserved in the current pipeline - ensure this relationship is maintained during restructuring
- **After restructuring**:
- **Cron job** should call metrics pipeline after syncing data:
- Sync accounts/connections/holdings (existing)
- Run metrics pipeline with `fullSync: false` (incremental daily update)
- Metrics calculated and stored in `snaptrademetrics` collection
- **Refresh button** should trigger metrics calculation:
- After existing refresh calls, add `POST /api/metrics/calculate` with `fullSync: false`
- Backend calculates metrics and stores in `snaptrademetrics` collection
- Frontend fetches updated metrics from API
- **Note**: Metrics pipeline will be in `server/src/metrics/` after restructuring, making it easier to integrate

## Files to Update After Moves

### Import Updates Needed:

1. **Metrics files** - Update relative imports to server models
2. **Server files** importing metrics:

- `quantDashBoard/server/src/controllers/metricsController.js`
- `quantDashBoard/server/scripts/test_helper.js`

3. **Test files**:

- `tests/integration/metrics/endpoint.test.js`

4. **Utility scripts** - Update imports to server models/clients
5. **React components** - Update imports for moved components
6. **Database collection references** - Replace hardcoded collection names with model references
7. **Controllers and routes** - Clean up unused code, standardize error responses, add documentation
8. **Returns calculation logic** - Ensure `updatePortfolioTimeseries.js` continues to work correctly (references `attempt.js` logic)

## React Best Practices to Apply

1. **Component naming**: All components should use PascalCase
2. **File organization**: 

- Pages in `pages/` with proper folder structure
- Reusable components in `components/`
- Utilities in `utils/`

3. **Component structure**: Each component in its own folder with CSS if needed
4. **Naming consistency**: Ensure all files follow consistent patterns

## Implementation Order

1. Move metrics folder to server
2. Update all imports related to metrics
3. Move utility scripts to server/scripts
4. Fix React component structure
5. Organize documentation
6. Clean up root directory
7. Update any remaining import paths
8. Clean up database collections (standardize naming, fix models, replace hardcoded names)
9. Clean up endpoints and controllers (remove unused, standardize errors, improve organization)
10. Create comprehensive API documentation README
11. Integrate metrics pipeline into cron job and refresh button
12. Verify all tests still work

## Data Pipeline Workflow (Post-Restructure)

### Metrics Calculation & Storage (Backend Only)

- **Calculation**: All metrics calculated in `server/src/metrics/calculateMetrics.js`
- **Storage**: Metrics stored in MongoDB collection `snaptrademetrics` via Metrics model
- **Collection Structure**: 
- Collection name: `snaptrademetrics`
- Indexed by: `userId`, `accountId`, `date`, `period`
- Contains: All calculated metrics (AUM, returns, volatility, Sharpe, Sortino, beta, etc.)
- **Frontend**: Only fetches pre-calculated metrics via API endpoints (`/api/metrics/performance`, `/api/metrics/risk`, etc.)

### Daily Cron Job Flow

1. Sync accounts from SnapTrade (existing in `cron_jobs/job.js`)
2. Sync connections and holdings (add to cron job)
3. Run metrics pipeline with `fullSync: false` (incremental update):
   - **Step 1**: Update activities (if needed)
   - **Step 2**: Update portfolio timeseries (calculates returns using logic from `attempt.js`)
   - **Step 3**: Calculate metrics (reads returns from `PortfolioTimeseries` collection)
   - Stores metrics in `snaptrademetrics` collection
4. Validate metrics

### Manual Refresh Flow

1. User clicks refresh button
2. Frontend calls:

- `POST /api/accounts/refresh`
- `POST /api/connections/refresh`
- `POST /api/accounts/sync/holdings/connections` (with `fullSync: false`)
- `POST /api/metrics/calculate` (with `fullSync: false`) - **to be added**

3. Backend processes incremental updates
4. UI updates with fresh data

### New Connection Flow

1. User connects new brokerage
2. Backend triggers full historical sync:

- `POST /api/accounts/sync/holdings/connections` (with `fullSync: true`)
- `POST /api/metrics/calculate` (with `fullSync: true`) - **to be added**

3. All historical data and metrics calculated