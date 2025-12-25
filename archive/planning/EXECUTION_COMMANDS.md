# Execution Commands for Codebase Cleanup

This document provides phase-by-phase commands for an LLM to execute the codebase cleanup and restructuring plan.

## Pre-Execution Checklist

Before starting, verify:

- [ ] You have a backup/commit of current state
- [ ] Database is accessible (if testing)
- [ ] All dependencies are installed (`npm install` in root, client, and server)
- [ ] You understand the current codebase structure

---

## Phase 1: File Organization (Low Risk)

**Estimated Time:** 30-45 minutes  
**Risk Level:** Low  
**Testing:** Verify imports work, app starts

### Commands for LLM:

```
Execute Phase 1: File Organization

1. MOVE METRICS FOLDER:
   - Move `metrics/` folder to `quantDashBoard/server/src/metrics/`
   - Update all imports within metrics files to use relative paths from new location
   - Files to update imports in:
     * All files in metrics/helpers/
     * All files in metrics/updateTable/
     * metrics/calculateMetrics.js
     * metrics/runMetricsPipeline.js
     * metrics/validateMetrics.js
   - Change imports like `../quantDashBoard/server/src/models/` to `../../models/`

2. MOVE UTILITY SCRIPTS:
   - Move `clearAndRunPipeline.js` → `quantDashBoard/server/scripts/clearAndRunPipeline.js`
   - Move `syncSourceData.js` → `quantDashBoard/server/scripts/syncSourceData.js`
   - Move `sanityCheckValuation.js` → `quantDashBoard/server/scripts/sanityCheckValuation.js`
   - Move `debugMaxValue.js` → `quantDashBoard/server/scripts/debugMaxValue.js`
   - Update import paths in these scripts to use relative paths from new location

3. MOVE DOCUMENTATION:
   - Create `docs/` folder at root if it doesn't exist
   - Move `ENDPOINTS.md` → `docs/ENDPOINTS.md`
   - Move `SANITY_CHECK_APPROACH.md` → `docs/SANITY_CHECK_APPROACH.md`
   - Move `OPTIONS_DEBUG_SUMMARY.md` → `docs/OPTIONS_DEBUG_SUMMARY.md`
   - Keep `Readme.md` at root

4. FIX REACT STRUCTURE:
   - Check if `quantDashBoard/client/src/pages/metrics.js` is used anywhere
   - If unused, move to `archive/frontend-unused/metrics-calculations.js`
   - If used, check what uses it and decide on action
   - Move `quantDashBoard/client/src/components/Signup.jsx` → `quantDashBoard/client/src/pages/auth/Signup.jsx`
   - Check if `Logout.jsx` is used in layout - if yes, keep in components; if no, move to `components/auth/Logout.jsx`
   - Update all imports that reference moved components

5. ARCHIVE FILES:
   - Create `archive/logs/` if it doesn't exist
   - Move `pipeline_output.log` → `archive/logs/pipeline_output.log` (if exists and not actively used)

6. UPDATE IMPORTS IN SERVER FILES:
   - Update `quantDashBoard/server/src/controllers/metricsController.js` to import from new metrics location
   - Update `quantDashBoard/server/scripts/test_helper.js` to import from new metrics location
   - Update any other server files that import from metrics/

7. UPDATE IMPORTS IN TEST FILES:
   - Update `tests/integration/metrics/endpoint.test.js` to import from new metrics location
   - Update any other test files that reference metrics/

8. VERIFY:
   - Check that all moved files have correct import paths
   - Verify no broken imports remain
   - Ensure file structure is correct
```

---

## Phase 2: Code Cleanup (Medium Risk)

**Estimated Time:** 45-60 minutes  
**Risk Level:** Medium  
**Testing:** Run tests, verify endpoints work

### Commands for LLM:

```
Execute Phase 2: Code Cleanup

1. CLEAN UP ENDPOINTS AND CONTROLLERS:
   - Check if `quantDashBoard/server/src/controllers/AppUsers.js` is used anywhere
   - If unused, delete it
   - If used, document where and decide if functionality should be moved
   - Review all controllers for unused methods
   - Standardize error response format across all controllers:
     * Use format: { error: { code: "ERROR_CODE", message: "message", details: "optional" } }
     * Use appropriate HTTP status codes (400, 401, 404, 500, etc.)
   - Add JSDoc comments to all controller methods that are missing them
   - Ensure consistent request validation patterns

2. STANDARDIZE ERROR RESPONSES:
   - Create a helper function or middleware for consistent error responses (optional)
   - Update all controllers to use consistent error format
   - Update error handling in routes if needed

3. REMOVE DUPLICATE/REDUNDANT ENDPOINTS:
   - Review routes for duplicate functionality
   - Check if `/api/snaptrade/` and `/api/accounts/` have overlapping endpoints
   - Document which endpoints are redundant
   - Remove or consolidate redundant endpoints (be careful - check usage first)

4. UPDATE ROUTE DOCUMENTATION:
   - Add JSDoc comments to route files
   - Ensure route handlers are well-documented

5. CREATE API DOCUMENTATION:
   - Create `quantDashBoard/server/API.md` (or update existing ENDPOINTS.md in docs/)
   - Document all endpoints with:
     * HTTP method and path
     * Description
     * Authentication requirements
     * Request parameters (query, path, body)
     * Request body schema
     * Response schema with examples
     * Error responses with codes
     * Example requests/responses
   - Organize by category: auth, user, connections, accounts, snaptrade, metrics, proxies

6. VERIFY:
   - Check that all endpoints still work
   - Verify error responses are consistent
   - Ensure no broken routes
```

---

## Phase 3: Database & Integration (High Risk)

**Estimated Time:** 60-90 minutes  
**Risk Level:** High  
**Testing:** Full integration test, verify data pipeline

### Commands for LLM:

```
Execute Phase 3: Database & Integration

1. DATABASE COLLECTION CLEANUP:
   - Review model files in `quantDashBoard/server/src/models/`
   - Fix `AccountHoldings.js` - check if it should export AccountPositions or be renamed
   - Check if `AccountPositionsV2` has a V1 version - if so, decide on consolidation
   - Change `Users.js` model name from "user" to "User" for consistency
   - Review `AccountDetail.js` vs `AccountsList.js` - check if both are needed or can be consolidated
   - Document all model names and their collection names

2. REPLACE HARDCODED COLLECTION NAMES:
   - Search for all instances of `db.collection("...")` in codebase
   - Replace with model references using `Model.collection.name`
   - Files to update:
     * All files in metrics/ (now in server/src/metrics/)
     * All utility scripts in server/scripts/
     * All controllers that use direct collection access
     * Any other files using hardcoded collection names
   - Example replacements:
     * `db.collection("snaptradeaccountactivities")` → `Activities.collection.name`
     * `db.collection("portfoliotimeseries")` → `PortfolioTimeseries.collection.name`
     * `db.collection("snaptrademetrics")` → `Metrics.collection.name`

3. STANDARDIZE COLLECTION NAMING:
   - Document collection naming convention
   - Create a reference file listing all collections and their models
   - Ensure consistency (either all with "snaptrade" prefix or remove prefix)

4. INTEGRATE METRICS PIPELINE INTO CRON JOB:
   - Open `quantDashBoard/server/cron_jobs/job.js`
   - After syncing accounts, add:
     * Sync connections and holdings (if not already done)
     * Import and call metrics pipeline with `fullSync: false`
   - Update imports to use new metrics location: `../src/metrics/runMetricsPipeline.js`
   - Ensure error handling is in place

5. INTEGRATE METRICS PIPELINE INTO REFRESH BUTTON:
   - Open `quantDashBoard/client/src/components/refreshButton/refreshButton.jsx`
   - After existing refresh calls, add:
     * `authenticatedPost("/api/metrics/calculate", { userId, fullSync: false })`
   - Ensure error handling and user feedback

6. UPDATE METRICS CONTROLLER:
   - Update `quantDashBoard/server/src/controllers/metricsController.js`
   - Update import path for metrics pipeline to use new location
   - Ensure `calculateMetrics` method uses correct import path

7. VERIFY DATABASE CONNECTIONS:
   - Check that all model imports are correct
   - Verify collection names are accessed via models, not hardcoded
   - Test database queries still work

8. VERIFY:
   - Check that metrics pipeline can be imported and run
   - Verify cron job structure is correct
   - Ensure refresh button integration is correct
   - Check all database references use models
```

---

## Testing Checklist (For User)

After each phase, verify:

### Phase 1 Testing:

- [ ] Server starts without errors
- [ ] Client starts without errors
- [ ] No import errors in console
- [ ] Basic navigation works in client
- [ ] API endpoints respond (even if errors, should not be import errors)

### Phase 2 Testing:

- [ ] All tests pass (if test suite exists)
- [ ] Key API endpoints work correctly
- [ ] Error responses are consistent
- [ ] API documentation is accurate
- [ ] No broken routes

### Phase 3 Testing:

- [ ] Database connections work
- [ ] Metrics calculation pipeline runs successfully
- [ ] Cron job can execute (test with --run-once)
- [ ] Refresh button triggers metrics calculation
- [ ] All data is accessible
- [ ] No collection name errors
- [ ] Full integration test passes

---

## Notes

- Always commit after each successful phase
- Test thoroughly before moving to next phase
- Keep `archive/test/attempt.js` as reference - it contains original TWR logic
- Metrics calculation depends on `PortfolioTimeseries` collection being populated correctly
- Ensure backward compatibility if this is production code
