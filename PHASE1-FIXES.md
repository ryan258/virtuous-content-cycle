# Phase 1: Database Migration & Hardening - Fixes Applied

## Critical Bug Fixes

### 1. Schema Validation Restored ✅
**Issue**: `server.js:48-114` removed `iterationStateSchema` validation, allowing malformed metadata into DB
**Fix**: Re-added Zod validation before database insertion
- Validates all metadata fields (contentType, targetAudience, maxCycles, convergenceThreshold)
- Returns clean 400 Bad Request errors instead of database constraint errors
- Location: `server.js:56-80`

### 2. Proper 404 Error Handling ✅
**Issue**: Endpoints assumed content/cycles exist, causing 500 errors instead of 404s
**Fix**: Added NotFoundError checks to all endpoints:
- `getContent` (server.js:116-136)
- `runFocusGroup` (server.js:138-200)
- `runEditor` (server.js:202-272)
- `userReview` (server.js:274-345)
- `getContentHistory` (server.js:347-368)
- `exportContent` (server.js:370-398)

**Result**: Proper 404 responses for non-existent resources instead of 500 errors

### 3. AI Metadata Persistence ✅
**Issue**: `runFocusGroup` didn't persist aiMode, focusModel, lastError from getFocusGroupFeedback
**Fix**: Added UPDATE query to persist AI metadata (server.js:181-190)
- Stores `aiMode` (live/mock/live-fallback)
- Stores `focusModel` (model used for focus group)
- Stores `lastError` (any API errors)

### 4. averageRating Edge Case ✅
**Issue**: `databaseService.js:466` used truthy check, suppressing feedback when averageRating = 0
**Fix**: Changed to null check (`cycle.averageRating !== null`)
- Correctly handles edge case of all ratings being 0
- Prevents aggregatedFeedback from being suppressed

### 5. Repository Hygiene ✅
**Issue**: SQLite artifacts (vcc.db, vcc.db-shm, vcc.db-wal) were staged for commit
**Fix**: Added to .gitignore:
```
*.db
*.db-shm
*.db-wal
```

### 6. AI Model Alignment ✅
**Issue**: Mismatch between .env (sherlock-think-alpha) and aiService.js defaults (sherlock-dash-alpha)
**Fix**: Updated defaults to use `openrouter/sherlock-think-alpha` (reasoning model)
**Rationale**:
- Reasoning capability needed for quality feedback
- Better suited for thoughtful content refinement
- FREE during alpha testing (1.8M context window)
- Mock mode automatically activates if no API key

### 7. Focus Group Config Ignored ✅
**Issue**: `runFocusGroup` used hardcoded `{targetMarketCount: 3, randomCount: 2}`, ignoring UI settings
**Fix**: Store and use user-supplied focusGroupConfig
- Added `targetMarketCount` and `randomCount` columns to ContentItems table (databaseService.js:25-26)
- Added migration code to add columns to existing databases (databaseService.js:33-42)
- Store user config in `createContent` (server.js:94-95)
- Retrieve and use config in `runFocusGroup` (server.js:161-164)
- Return config in API responses (databaseService.js:516-519)

**Result**: Focus group size now respects UI participant count settings

### 8. Stale currentVersion in New Cycle ✅
**Issue**: When user rejects editor pass, new cycle uses stale `cycle.currentVersion` instead of reset value
**Fix**: Determine correct currentVersion based on user action (server.js:331-342)
- If user provided edits → use `userEdits`
- Else if approved → use `cycle.currentVersion` (editor's revision)
- Else (rejected) → use `contentItem.originalInput`

**Result**: Rejected content properly resets to original input for next cycle

### 9. Export Endpoint HTTP Verb Mismatch ✅
**Issue**: Export route registered as POST but UI calls it with GET (server.js:40 vs public/script.js:388-403)
**Fix**: Changed route to GET (server.js:40)
```javascript
app.get('/api/content/:id/export', exportContent);
```

**Result**: Export functionality now works, no more 404 errors

### 10. Duplicate Feedback & Missing Status Gate ✅
**Issue**: `runFocusGroup` had two critical problems:
- No status check: could run on any cycle status
- No cleanup: re-running appended duplicate Feedback rows
- Result: focusGroupRatings and aggregatedFeedback mismatch, inflated averages

**Fix**: Added status gate and cleanup (server.js:161-175)
1. **Status Gate**: Only allow on `'created'` or `'awaiting_focus_group'` status
2. **Cleanup**: Delete existing feedback before inserting new rows
   ```javascript
   databaseService.db.prepare('DELETE FROM Feedback WHERE cycleId = ?').run(cycle.id);
   ```

**Result**: Clean retries without duplicates, accurate feedback aggregation

### 11. Initial Cycle Status Prevents Retry ✅
**Issue**: New content created with status `'created'`, but UI only shows retry button for `'awaiting_focus_group'`
- If automatic focus group fails → no way to manually retry
- Button stays hidden/disabled

**Fix**: Initialize first cycle as `'awaiting_focus_group'` (server.js:63-64, 103)
- Updated validation state
- Updated database insert
- Updated test expectation (tests/server.test.js:29)

**Result**: Manual retry always available after creation

### 12. Export Endpoint Breaking Change ✅
**Issue**: Changed export route from POST to GET, but existing clients still expect POST (breaking change)
- Documentation still advertised POST method
- Existing integrations would break with 404 errors

**Fix**: Support both GET and POST for backward compatibility (server.js:41-42)
```javascript
app.get('/api/content/:id/export', exportContent);
app.post('/api/content/:id/export', exportContent); // Backward compatibility
```

**Result**: Both methods work, no breaking changes for existing clients

### 13. Missing Transaction Wrapping ✅
**Issue**: Multi-step database operations not atomic - partial writes on errors
1. **runFocusGroup** (server.js:175-215): Delete feedback → insert many rows → update aggregates → update status
2. **runEditor** (server.js:283-297): Update editor pass → update current version → update status
3. **userReview** (server.js:337-356): Update review → update current version → update status

If any step fails mid-way → inconsistent database state (e.g., deleted feedback with old status)

**Fix**: Wrapped all multi-step operations in transactions using `db.transaction()`
```javascript
const saveFocusGroupResults = databaseService.db.transaction(() => {
  // All database operations here
  // Automatically commits on success, rolls back on error
});
saveFocusGroupResults();
```

**Result**: Database stays consistent even on errors - all or nothing writes

### 14. Documentation Out of Sync ✅
**Issue**: README listed old model defaults (Gemini/Claude) but code uses Sherlock
- README.md:150-151 said `google/gemini-1.5-flash` and `anthropic/claude-3.5-sonnet`
- .env.example and aiService.js both default to `openrouter/sherlock-think-alpha`
- Confusing for new users following documentation

**Fix**: Updated README to match current defaults (README.md:150-155)
- Changed defaults to `openrouter/sherlock-think-alpha`
- Added note about FREE alpha testing
- Listed alternatives (Claude, Gemini) as paid options

**Result**: Documentation accurately reflects code configuration

### 15. costEstimate Not Persisted ✅
**Issue**: User-provided `metadata.costEstimate` silently dropped (CODE-REVIEW-FINDINGS.md #1)
- ContentItems table missing `costEstimate` column
- createContentItem didn't store the value
- getIterationState returned `cycle.totalCost` (actual cost) instead of user's budget estimate
- Result: Budgeting features broken, data loss

**Fix**: Added costEstimate persistence (databaseService.js:21, 35-37, 170, 522; server.js:96)
1. Added `costEstimate REAL DEFAULT 0` column to ContentItems table
2. Added migration for existing databases: `ALTER TABLE ContentItems ADD COLUMN costEstimate`
3. Updated createContentItem INSERT to include costEstimate with `data.costEstimate ?? 0`
4. Updated getIterationState to return `contentItem.costEstimate ?? 0` instead of cycle.totalCost
5. Updated server.js createContent to pass costEstimate from validated metadata

**Result**: User budget estimates now properly stored and returned in API responses

### 16. randomCount/targetMarketCount: 0 Impossible ✅
**Issue**: `||` operator treats 0 as falsy, forcing unwanted defaults (CODE-REVIEW-FINDINGS.md #2)
- User sets `randomCount: 0` (no random personas) or `targetMarketCount: 0`
- Code forces it to default (2 for random, 3 for target market)
- **Functional regression**: Cannot disable random personas or target market personas
- Locations: aiService.js:119-120, server.js:97-98, 170-171, databaseService.js:171-172, 524-525

**Fix**: Changed ALL `||` operators to `??` (nullish coalescing) for numeric fields
```javascript
// BEFORE (broken)
data.randomCount || 2           // Treats 0 as falsy
focusGroupConfig.targetMarketCount || 3

// AFTER (correct)
data.randomCount ?? 2           // Only defaults null/undefined
focusGroupConfig.targetMarketCount ?? 3
```

**Files Modified**:
- aiService.js:119-120 - getFocusGroupFeedback parameters
- server.js:97-98 - createContent ContentItem creation
- server.js:170-171 - runFocusGroup config retrieval
- databaseService.js:171-172 - createContentItem INSERT
- databaseService.js:524-525 - getIterationState response

**Result**: Zero values now work correctly, users can disable persona groups

### 17. Status History Never Surfaced ✅
**Issue**: Status history written but never stored or returned (CODE-REVIEW-FINDINGS.md #3)
- Schema includes statusHistory (models.js:80)
- Initial history created (server.js:66 in old code)
- But NEVER stored in database - always returns empty array
- Status changes not tracked, lost audit trail

**Fix**: Implemented full status history tracking (databaseService.js:89, 149-154, 205-207, 221, 254-266, 540)
1. Added `statusHistory TEXT DEFAULT '[]'` column to Cycles table
2. Added migration: `ALTER TABLE Cycles ADD COLUMN statusHistory`
3. Updated createCycle to initialize with first status entry:
   ```javascript
   const initialStatusHistory = JSON.stringify([
     { status: data.status, timestamp: now }
   ]);
   ```
4. Updated updateCycleStatus to append to history instead of just changing status:
   ```javascript
   const currentHistory = JSON.parse(cycle.statusHistory || '[]');
   currentHistory.push({ status, timestamp: now });
   const updatedHistory = JSON.stringify(currentHistory);
   ```
5. Updated getIterationState to return actual history:
   ```javascript
   statusHistory: JSON.parse(cycle.statusHistory || '[]')
   ```

**Result**: Complete status change audit trail now tracked and returned

### 18. createContent Not Wrapped in Transaction ✅
**Issue**: createContent performs 2 database operations without atomicity (CODE-REVIEW-FINDINGS.md #7)
- Creates ContentItem
- Creates initial Cycle
- If second fails → orphaned ContentItem in database
- Inconsistent database state

**Fix**: Wrapped both operations in transaction (server.js:89-116)
```javascript
const createContentAndCycle = databaseService.db.transaction(() => {
  databaseService.createContentItem({...});
  databaseService.createCycle({...});
});
createContentAndCycle();  // Execute atomically
```

**Result**: Content creation is now atomic - both succeed or both fail, no orphaned records

## Test Results

✅ **Unit Tests**: 7/7 passing (on Node v18-v20)
✅ **404 Handling**: 3/3 passing
✅ **Server Startup**: Working
✅ **Database**: Initialized with 5 personas
✅ **Edge Case Verification**:
  - costEstimate: 5.50 persisted correctly
  - targetMarketCount: 0 works (no longer forced to 3)
  - randomCount: 0 works (no longer forced to 2)
  - statusHistory populated with initial entry

⚠️ **Known Environment Issue**: Node v25+ not yet supported
- better-sqlite3 native module built for Node v20 (module version 115)
- Node v25 uses module version 127, causing binary incompatibility
- **Solution**: Use Node v18-v20 (recommended: v20)
- Added `.nvmrc` file and `package.json` engines field to enforce version
- See README.md Prerequisites for setup instructions

## Implementation Summary

### Database Service
- Created `databaseService.js` with 4 normalized tables
- Implemented complete CRUD operations
- Added backward-compatible `getIterationState()` helper
- Included cost tracking fields
- **NEW**: Added costEstimate column with migration
- **NEW**: Added statusHistory column with migration
- **NEW**: All numeric defaults use `??` instead of `||`

### Security Hardening
- Fixed all XSS vulnerabilities in `public/script.js`
- Added `escapeHtml()` helper function
- Fixed hardcoded API URL for portability

### Migration
- Created `migrate.js` to seed personas
- Database created: `vcc.db` (48KB)
- 5 personas seeded successfully

## Files Modified

### Core Application
- ✏️ `package.json` - Added better-sqlite3
- ✏️ `server.js` - Refactored to use database
- ✏️ `aiService.js` - Aligned model defaults to sherlock-think-alpha
- ➕ `databaseService.js` - New database layer (600+ lines)
- ➕ `migrate.js` - Database seeding script

### Security & Frontend
- ✏️ `public/script.js` - Fixed XSS vulnerabilities, fixed hardcoded API URL

### Configuration & Documentation
- ✏️ `.gitignore` - Added SQLite files (*.db, *.db-shm, *.db-wal)
- ✏️ `.env.example` - Updated with Sherlock models, comprehensive documentation
- ➕ `PHASE1-FIXES.md` - This document

### Database (Not Committed)
- 🚫 `vcc.db` - SQLite database (gitignored, created via migrate.js)

## Setup Instructions for New Environments

```bash
# 1. Clone repository and install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY (or leave empty for mock mode)

# 3. Initialize database
node migrate.js
# Output: ✅ Seeded 5 personas

# 4. Start server
npm start              # Production
npm run dev           # Development with auto-reload

# 5. Access application
# Open http://localhost:3000
```

## Ready for Phase 2

The foundation is now solid for Phase 2: Persona Management UI. All critical issues resolved, proper error handling in place, and database properly configured.
