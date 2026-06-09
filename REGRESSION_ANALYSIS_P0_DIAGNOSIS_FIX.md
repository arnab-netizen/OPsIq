# Regression Analysis: Browser/API Idempotency Contract Mismatch

## Summary

Found 12 routes requiring `idempotency-key` header that are called by browser components WITHOUT sending the header.

Current fix addresses diagnosis only. Remaining routes create architectural risk.

## Classification

### P0 (Current Product Hunt Journey - Blocked)
- ✅ FIXED THIS SESSION: `/api/diagnosis`
  - Called by: `/app/(authenticated)/diagnosis/page.tsx`
  - Impact: Cannot run diagnosis from browser (404/500)
  - Status: FIXED - now sends idempotency-key

### P1 (Near-term - Core Features Broken)
- `/api/clients` - Create new client (BROKEN)
  - Called by: `/app/(authenticated)/clients/new/page.tsx`
  - Impact: Client creation flow fails at route
  - Risk: Data creation in broken state

- `/api/engagements` - Create engagement (BROKEN)
  - Called by: Multiple pages (engagements/new, decision-evidence, dashboard)
  - Impact: Engagement creation broken
  - Risk: Central feature failure

- `/api/evidence` - Upload evidence (BROKEN)
  - Called by: 8 components (file upload, manual entry, bundles)
  - Impact: Evidence upload broken
  - Risk: Core data collection feature broken

- `/api/evidence-bundles` - Create evidence bundles (BROKEN)
  - Called by: 4 components (bundle creation, evidence management)
  - Impact: Bundle organization broken
  - Risk: Evidence workflow blocked

- `/api/leads` - Create leads (BROKEN)
  - Called by: `/app/(authenticated)/leads/new/page.tsx`
  - Impact: Lead creation blocked
  - Risk: Sales pipeline entry broken

### P2 (Later - Less-Used Features)
- `/api/actions` - Update/complete actions
  - Called by: Business impact page, owner dashboard
  - Impact: Action management broken
  - Risk: Workflow automation blocked

- `/api/findings` - Create findings
  - Called by: Findings manager
  - Impact: Finding creation broken
  - Risk: Analysis workflow blocked

- `/api/operator` - Operator mutations
  - Called by: OperatorItem component
  - Impact: Operator updates broken
  - Risk: User management broken

- `/api/recommendations` - Update recommendations
  - Called by: Recommendations manager
  - Impact: Recommendation mutations broken
  - Risk: Recommendation workflow broken

- `/api/users` - User management
  - Called by: Users page
  - Impact: User operations broken
  - Risk: Admin workflow broken

## Immediate Recommendation

For this P0 fix:
1. ✅ Fix `/api/diagnosis` (COMPLETED)
2. ⚠️ Document the remaining 11 routes as blocking in backlog
3. ⏭️ Plan P1 fixes for next session (engagements, evidence, clients, leads)
4. 📅 Schedule P2 cleanup for later

## Architecture Decision

The root cause is architectural: Routes enforce `idempotency-key` but provide no mechanism for browser to know this requirement.

Options:
A. Continue fixing browser components individually (current approach)
B. Make idempotency optional in routes (breaks contract, not recommended)
C. Add middleware to auto-generate if missing (defeats idempotency purpose)
D. Move idempotency key generation to canonical wrapper (large refactor)

**Current choice: A** - Fix components as they're encountered, establish pattern with diagnosis.

## Remaining Risks

- 11 routes still broken in browser context
- Tests pass (smoke scripts manually add headers)
- Feature coverage appears complete but browser paths fail
- New routes will inherit same problem unless aware of pattern
- No shared browser utility for other routes yet (establish with diagnosis first)

## Follow-up Tasks

Session 2:
- [ ] Create/update shared fetch wrapper for all routes
- [ ] Apply to P1 routes: clients, engagements, evidence, bundles, leads
- [ ] Add browser smoke tests (not just script tests)

Session 3:
- [ ] Apply to P2 routes: actions, findings, operator, recommendations, users
- [ ] Consider architecture shift if pattern becomes problematic

Session 4+:
- [ ] Standardize all routes on single idempotency pattern
- [ ] Document API contract for new engineers
- [ ] Consider middleware-based solution if manual pattern too error-prone
