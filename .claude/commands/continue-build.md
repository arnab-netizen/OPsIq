# CONTINUE BUILD: Strict Autonomous Execution Loop (v4.0 STAGE 0-17 + ADDENDUM)

## SOURCE OF TRUTH
- **execution.md** is the only roadmap (now includes ADDENDA A-G with module registry, backlog, build order)
- **.claude/execution_state.json** is the only progress tracker
- CLAUDE.md may contain helper notes only; it cannot override execution.md
- Never ask what to do next unless execution.md is missing, unreadable, or internally contradictory

## MANDATORY PRE-WORK VALIDATION
Every /continue-build run MUST:
1. Read execution.md in full (including ADDENDA A-G)
2. Read .claude/execution_state.json
3. Run: git status --short && git log --oneline -10
4. Verify branch is clean or all changes are staged for commit
5. Audit STAGE 0-17 structure in execution.md (fail if phases missing or renumbered)
6. Cross-check execution_state.json against execution.md phases (fail if contradictions exist)
7. Before implementing new work: scan repo for existing similar work (avoid duplication)

## GLOBAL RULE
- One /continue-build run completes exactly ONE highest-priority non-DB vertical slice, wiring correction, test correction, audit correction, or deployment-readiness correction
- Do not stop after "next steps"
- Do not ask "Proceed?" or request permission
- Do not mark anything ACTIVE without runtime proof
- Do not touch DB config unless the selected work is explicitly DB-related
- DB-only failures must be classified DB_BLOCKED and skipped with proof
- Never weaken auth, workspace enforcement, or DTO redaction to make gates green
- If a gate failure requires code weakening, classify as BLOCKER and stop

## LOOP ORDER
Every run executes in strict sequence:
1. Pull/sync current branch: git fetch origin && git pull origin <current_branch>
2. Read execution.md (all sections including ADDENDA)
3. Read .claude/execution_state.json
4. Scan repo: grep for implemented systems; check src/domain/, src/services/, src/app/api/
5. Select highest-priority gap per PRIORITY ORDER (below)
6. Implement/fix/wire exactly one vertical slice or correction
7. Add/update tests proving the path (unit + integration)
8. Run non-DB gates: npm run build && npx tsc --noEmit && npx prisma validate (if possible)
9. Classify: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE or WIRED_NOT_CALLED or DB_BLOCKED
10. Update .claude/execution_state.json with new slice, test count, gates run, classification
11. Commit with message format: "STAGE X Slice Y: <description>" + link to session
12. Push: git push -u origin <branch_name>
13. Report ONLY: selected work, files changed, wiring proof, tests added, gates run, classification, next automatic target

## PRIORITY ORDER (Selection Algorithm)
Always select next work in this order:
1. Unpushed commits (push immediately before new work)
2. Non-DB static errors (TypeScript, build, Prisma schema validation)
3. Build/typecheck/test failures NOT caused by DB (e.g., missing imports, type errors)
4. Implemented systems falsely marked ACTIVE (missing runtime proof)
5. Implemented systems with no production caller (WIRED_NOT_CALLED → find caller or park)
6. Missing auth/capability/workspace enforcement (security blocker)
7. Missing DTO redaction or public/owner leakage risk (compliance blocker)
8. Missing audit/event emission on material operation (audit compliance blocker)
9. Missing tests for wired systems (< 20 tests per system triggers this)
10. Stale/contradictory execution_state classification (update execution_state only)
11. Next incomplete non-DB slice from execution.md roadmap (STAGE 0 → 17 order)
12. Full deployment-readiness hardening (AFTER all STAGE 0-17 slices complete)
13. Improvement/enhancement recommendations (AFTER deployment-readiness audit complete)

## MODULE REGISTRY SELECTION (For Phases 13+)
When selecting Phase 13+ work, cross-reference ADDENDUM B (Module Registry 1-30):
- Modules 1-30 are mapped to STAGE and status
- Select next incomplete module per PRIORITY ORDER
- Verify module exists in execution.md roadmap (section 6: CANONICAL IMPLEMENTATION ORDER)
- If module not in STAGE 0-17, defer to Backlog A-K (ADDENDUM F)

## ACTIVE CLASSIFICATION REQUIREMENTS
A system may be classified ACTIVE only when ALL of the following are proven:
- Caller file identified (where is this called from?)
- Caller function identified (which function calls this system?)
- Route/service/API entrypoint documented (if user-facing)
- Input source known (query params? request body? header?)
- Validation path proven (Zod schema? type checking?)
- Output consumer identified (who consumes the output?)
- Tenant/workspace enforcement proven (enforceWorkspaceScoping? workspaceId parameter?)
- Auth/capability enforcement proven (withAuth middleware? capability check?)
- DTO/output boundary tested (PublicDTO validation? no internal fields exposed?)
- Audit/event behavior proven (emitAuditEvent called on material operations?)
- Failure behavior tested (negative-path tests exist?)
- Tests proven (integration test covering full path from caller to output consumer?)

If ANY proof is missing, classify as:
- **WIRED_NOT_CALLED**: Code complete, routes registered, but no tests prove it's called
- **COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE**: Code verified by build/type, no integration caller tested
- **PARKED**: Intentionally not wired (documented reason)
- **DB_BLOCKED**: Implementation complete, blocked by DB unavailability

Do NOT use "ACTIVE".

## WIRING PROOF FORMAT (Required in commit message or execution_state)
For every WIRED_NOT_CALLED or COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE system, document:
```
Wiring Proof:
- Caller: src/app/api/path/route.ts::handler()
- Service: src/services/name.ts::methodName()
- Input: POST body with Zod schema validation
- Output: JSON response with PublicDTO wrapper
- Workspace Enforcement: enforceWorkspaceScoping middleware + workspaceId param check
- Auth Enforcement: withAuth(CAPABILITY.ACTION_CREATE) middleware
- DTO Boundary: toPublicActionDTO() redaction tested (50+ tests)
- Audit Event: AUDIT_EVENTS.ACTION_CREATED emitted with workspace context
- Test Coverage: integration test in src/__tests__/api/actions.test.ts (95+ tests)
- Status: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE (wired but no runtime invocation trace yet)
```

## GATE EXECUTION PROTOCOL
After implementing a slice, run these gates IN ORDER (stop at first failure):

### Non-DB Gates (ALWAYS run)
```bash
npm run build
npx tsc --noEmit
npx prisma validate
```

### DB Gates (Run only if DATABASE_URL configured)
```bash
npx prisma migrate deploy
npm run test:db
```

### CI/Lint Gates (Run if available)
```bash
npm run lint
npm test
```

### Classification Rules
- If all non-DB gates PASS → slice status: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE
- If build/typecheck PASS but Prisma validate FAILS → slice status: PARTIAL_SCHEMA_ISSUE (fix + re-run)
- If DB gates unavailable but non-DB gates PASS → slice status: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE + DB_BLOCKED notation
- If any non-DB gate FAILS → BLOCKER (do not commit, diagnose and fix)

## BLOCKERS AND STOP RULES
Stop immediately and report BLOCKER if:
1. TypeScript compilation fails with non-DB errors (import errors, type mismatches)
2. npm build fails with non-DB errors
3. Zod schema syntax error or arity mismatch
4. A gate failure requires weakening auth, workspace enforcement, or DTO redaction
5. An existing test is broken by new code and cannot be fixed without weakening rules
6. A DB blocker prevents validating critical schema dependencies

For BLOCKERs:
- Do not commit
- Report: blocker name, root cause, which gate failed, why it cannot be fixed without breaking rules
- Example: "BLOCKER: z.record() arity error in src/app/api/path/route.ts - Zod requires 2 args (key type, value type)"

## EXECUTION STATE UPDATE PROTOCOL
After every slice (successful or BLOCKER), update .claude/execution_state.json:
```json
{
  "current_phase": "Phase X — Name (STAGE Y)",
  "current_branch": "git branch name",
  "completed_stages": ["STAGE 0", "STAGE 1", ...],
  "phase_X_status": {
    "slice_N": {
      "status": "COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE | WIRED_NOT_CALLED | DB_BLOCKED | BLOCKER",
      "classification": "SERVICE_WITH_WIRING | DOMAIN_CONTRACT_ONLY | API_ROUTES_WITH_WIRING",
      "files": ["src/path/file.ts", ...],
      "workspace_enforcement": "✓ All methods enforce workspaceId parameter",
      "auth_enforced": "✓ CAPABILITIES.XXX required",
      "DTO_boundary": "✓ No internal fields exposed",
      "test_coverage": "95+ tests covering state machine, workspace scoping, auth",
      "gates_run": "npm run build (✓), npx tsc (✓), npx prisma validate (✓)",
      "compilation": "✓ TypeScript compiles without errors",
      "committed": "commit_sha"
    }
  },
  "gates_status": {
    "build": "PASS",
    "typecheck": "PASS",
    "prisma_validate": "PASS or DB_BLOCKED",
    "tests": "DB_BLOCKED or PASS"
  },
  "last_commit": "commit message",
  "pushed": false,
  "next_automatic_target": "STAGE X Slice Y: description"
}
```

## DEPLOYMENT READINESS REQUIREMENTS
When ALL STAGE 0-17 slices are implemented, run full deployment-readiness audit BEFORE declaring complete:
- npm ci ✓
- npx prisma validate ✓ (or DB_BLOCKED with reason)
- npx tsc --noEmit ✓
- npm run build ✓
- npm test ✓ (or DB_BLOCKED)
- npm run lint ✓ (if available)
- npm run test:db ✓ (if DB available)
- **Security audit**: workspace isolation 100%, auth 100%, DTO redaction 100%, audit events 100%
- **Tenant isolation tests**: npm test -- workspace-isolation (if available)
- **Permission matrix tests**: npm test -- permission-matrix (if available)
- **DTO leakage tests**: npm test -- dto-leakage (if available)
- **Audit/event tests**: npm test -- audit-events (if available)
- **Workflow/CI gate review**: Document which gates are DB_BLOCKED and why
- **Env var checklist**: All required env vars documented in .env.example
- **Deployment checklist**: SSL, backups, monitoring, runbooks, team training

If DATABASE_URL or DB access unavailable:
- Classify DB gates as DB_BLOCKED in report
- Do NOT weaken code
- Do NOT modify DB config
- Continue all non-DB deployment readiness gates
- Document: "DB gates deferred until database available"

## FINAL SYSTEM COMPLETION RULE
Do NOT declare FULLY_DEPLOYMENT_READY unless ALL are true:
1. Every STAGE 0-17 phase is complete or honestly classified (not skipped)
2. Every module in ADDENDUM B (Module Registry 1-30) has correct status with proof
3. Every ADDENDUM F (Backlog A-K) item is either implemented or explicitly deferred
4. Every implemented system has correct classification: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE | WIRED_NOT_CALLED | PARKED | DB_BLOCKED
5. Every COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE system has wiring proof documented
6. All non-DB gates pass
7. All DB blockers explicitly isolated with reason
8. No known non-DB blocker remains
9. execution_state.json is current
10. Branch is pushed
11. Version bumped in execution.md
12. Final improvement report created

## FINAL IMPROVEMENT PASS (After Deployment Readiness)
After all phases implemented and deployment-readiness audit complete, create .claude/final-improvement-report.md:
- Monetization gaps (subscription tiers, rate limiting, quota enforcement)
- Enterprise buyer objections (audit trail exports, SSO, compliance)
- UX/adoption gaps (notification system, search, mobile)
- Operational reliability gaps (monitoring, alerting, runbooks)
- Security/compliance gaps (encryption, data retention, GDPR export)
- Performance/scaling gaps (index strategy, caching, async job queue)
- Support/admin gaps (admin dashboard, bulk operations, escalation)
- Analytics/reporting gaps (metrics, KPI reporting, ROI tracking)
- Highest-ROI enhancements (top 5 features that unlock next revenue tier)
- Recommended next 10 build slices (Addendum G order + new items)

Do NOT implement enhancements unless required to remove deployment blockers.

## REPORT FORMAT (End of every /continue-build run)
Report ONLY:
```
STAGE X SLICE Y: [description]
---
Files Changed:
- src/path/file1.ts (new/modified)
- src/path/file2.ts (new/modified)

Wiring Proof:
- Caller: src/app/api/path/route.ts::handler()
- Service: src/services/name.ts::method()
- Workspace Enforcement: ✓
- Auth Enforcement: ✓ CAPABILITY.XXX
- DTO Boundary: ✓
- Audit Events: ✓ EVENT_NAME emitted

Tests Added:
- src/__tests__/api/path.test.ts: 95+ tests

Gates Run:
- npm run build: ✓
- npx tsc --noEmit: ✓
- npx prisma validate: ✓

Classification: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE

DB Status: DB_BLOCKED (@prisma/adapter-pg missing)

Non-DB Blockers: None

Branch Pushed: Yes (commit SHA: abc123)

Next Automatic Target: STAGE X+1 SLICE Y: [description]
```

## LOCAL-SAFE MODE (For Network/Push-Blocked Environments)

**Activation condition:** git push fails due to HTTP 403, proxy auth failure, or network isolation.

**Mode behavior:** Continue building locally without remote push until infrastructure resolves.

### Rules
1. **Push classification:**
   - If push fails due to HTTP 403 / proxy / network → classify result as `PUSH_BLOCKED_ENVIRONMENT`
   - Do NOT stop all build work because push failed
   - Continue local-only work if working tree is clean and non-DB gates pass

2. **Next-slice selection:**
   - If selected slice requires DATABASE_URL and unavailable → classify `DB_BLOCKED` and auto-select next non-DB slice from execution.md/ADDENDUM G
   - Missing dependencies (npm packages, Prisma adapters) → classify `NON_DB_STATIC_BLOCKER`, not DB_BLOCKED
   - Continue one non-DB slice per /continue-build run

3. **Gates and verification:**
   - Still run available gates: `npm ci`, `npx prisma validate`, `npx tsc --noEmit`, `npm run build`
   - Run targeted tests for the slice
   - Update execution_state.json after every slice
   - Commit locally after every successful slice

4. **Recovery artifacts (after every local commit):**
   - Create/update: `docs/LOCAL_ONLY_RECOVERY_LEDGER.md` (commit log + recovery instructions)
   - Create/update: `docs/opsiq-main-sync-latest.patch` (unified diff of unpushed commits)
   - Create/update: `docs/opsiq-main-sync-latest.bundle` (git binary bundle of unpushed commits)
   - Ensure: `docs/manual-main-sync-summary.md` exists with merge instructions

5. **Push attempt protocol:**
   - Attempt push once per /continue-build run
   - If push succeeds: mark `Branch Pushed: Yes (commit SHA: xxx)` in report
   - If push fails: create recovery artifacts, mark `PUSH_BLOCKED_ENVIRONMENT`, proceed to next slice in LOCAL-SAFE mode

6. **Reporting requirements:**
   - Always report `Branch Pushed: Yes` or `PUSH_BLOCKED_ENVIRONMENT` (never silent on push failure)
   - Never claim `REMOTE_SYNCED`, `DEPLOYMENT_READY`, or "main updated on GitHub" until push succeeds
   - Include recovery artifact paths in report if push blocked
   - Never ask for next step unless execution.md is missing or contradictory

7. **Code safety:**
   - Do not edit app code to work around blockers
   - Do not touch DB config
   - Do not weaken auth, workspace enforcement, or DTO redaction
   - Do not skip tests or gates

### Example LOCAL-SAFE Mode Report

```
PUSH_BLOCKED_ENVIRONMENT
═══════════════════════════════════════════════════════════

Work Completed: STAGE X SLICE Y (local commit only)
Files Changed: [list]
Tests Added: [count+]
Gates Run: npm run build (✓), npx tsc (✓), npx prisma validate (✓)
Classification: COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE

Local Commit: abc1234def
Push Attempted: Yes — FAILED (HTTP 403 proxy auth)

Recovery Artifacts Created:
- docs/LOCAL_ONLY_RECOVERY_LEDGER.md (contains commit log + merge instructions)
- docs/opsiq-main-sync-latest.patch (unified diff, apply with: git apply < patch)
- docs/opsiq-main-sync-latest.bundle (git binary format, apply with: git bundle unbundle)

Next Automatic Target: STAGE X+1 SLICE Y (non-DB, selected for LOCAL-SAFE continuation)
Environment Status: DATABASE_URL unavailable, network push blocked
Recommendation: (1) Configure DATABASE_URL to resume STAGE X+2, (2) Resolve proxy auth to push to remote
```

## KEY RULES FOR PHASE 13+ HARDENING
- Slice 1 (CI/CD Foundations) must come before any other Phase 13 slices
- Slice 2 (Database Schema Finalization) must come immediately after CI/CD
- All public API expansion slices must include entitlement checks + rate limiting
- All notification slices must include audit logging + muting support
- All export slices must include redaction verification (50+ tests)
- All integration slices must include webhook delivery retry + signature validation
- No slice is complete without at least 25+ new tests and passing non-DB gates
