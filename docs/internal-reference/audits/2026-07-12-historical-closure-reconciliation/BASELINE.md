# Historical Closure Reconciliation — Baseline
**Date:** 2026-07-12  
**Branch:** `claude/phase-6f-governance-findings-5gkiec`  
**HEAD (reconciliation start):** `59f7e246`  
**origin/main HEAD:** `8aef45a5`  
**Merge base:** `8aef45a5` (branch is 48 commits ahead of main, 0 behind)  
**Working tree:** CLEAN

---

## Branch Provenance

All 48 commits on this branch descend from `8aef45a5` which is the tip of `origin/main`.

```
origin/main: 8aef45a5 (docs: permanent PR cost control and root-cause closure policy)
    |
    +---- [48 A7.7 commits] ----→ HEAD: 59f7e246
```

Every security fix, defect-class closure, and prevention gate implemented in Stage A7.7 exists **exclusively on this branch**. None has been merged to `origin/main`.

---

## Gate Status at Reconciliation Start

| Gate | Status | Notes |
|------|--------|-------|
| `npx tsc --noEmit` | PASS | 0 errors |
| `npm run build` | PASS | All 338 routes compile |
| `npx prisma validate` | PASS | Schema valid |
| `npm run governance:scan:strict` | PASS | Baseline-tracked violations only |
| `npm run governance:scan:auth` | PASS | No forbidden patterns detected |
| `npm run governance:scan:a77` (18 gates) | PASS | All 18 DC gates pass |
| `TEST_WITH_DB=true npm test` | DB_BLOCKED_ENVIRONMENT_NETWORK | Neon endpoint unreachable in this executor; CI provisions its own postgres:16 service |

---

## Route Inventory (Verified at Reconciliation Start)

| Metric | Count | Source |
|--------|-------|--------|
| Total route files | 338 | `find src/app/api -name "route.ts" \| wc -l` |
| Routes using `withCanonicalEnforcement` | 311 | grep count |
| Routes WITHOUT `withCanonicalEnforcement` | 27 | list below |

### The 27 Routes Without `withCanonicalEnforcement` (All Legitimate)

| Route | Reason |
|-------|--------|
| `auth/login`, `auth/signup` | Pre-auth endpoints — no session exists yet |
| `decisions/submit-external` | External submission endpoint (different auth path) |
| `health`, `liveness`, `readiness` | Infrastructure probes — no user session |
| `internal/*` (17 routes) | Debug/proof endpoints — internal non-production use |
| `ops/errors`, `ops/metrics`, `ops/readiness`, `ops/runtime` | Ops telemetry |
| `startup` | Server startup signal |
| `webhooks/stripe` | Stripe → server call, verified by Stripe signature not user session |

---

## Prevention Gate Inventory at Baseline

18 gates total (DC-01 through DC-18), all passing as of HEAD `59f7e246`.

```
✓ DC-01  No x-workspace-id header reads in production code
✓ DC-02  No new callers of context.ts::requireWorkspaceContext
✓ DC-03  No new non-canonical auth wrappers in route files
✓ DC-04  No client-supplied actor identity fields persisted
✓ DC-05  No new direct db.auditEvent.create outside approved callers
✓ DC-06  No new logAuditEvent callers
✓ DC-07  No new state-transition maps outside authoritative files
✓ DC-08  No new production stubs returning fabricated success
✓ DC-09  No new route-to-domain business logic imports
✓ DC-10  No new workspace resolver implementations
✓ DC-11  No new enforceWorkspaceScoping implementations
✓ DC-12  All hasPermission() calls use WorkspaceAction union
✓ DC-13  No new exported error sanitization utilities
✓ DC-14  No new emitAuditEvent re-implementations
✓ DC-15  proof/review does not accept body.requiredPermission
✓ DC-16  asVerifiedWorkspaceId() called only in canonical-route-enforcement
✓ DC-17  No file calls both claimWorkspaceId and resolveWorkspaceTier
✓ DC-18  No raw auditError in console.error
```

---

## Reconciliation Scope

This document is the baseline for:  
- `HISTORICAL_CLOSURE_REGISTER.md` / `.json` — machine-readable defect class status  
- `PRIOR_CLAIM_RECONCILIATION.md` — accuracy of prior broad closure claims  
- `BRANCH_AND_MERGE_RECONCILIATION.md` — branch vs main status of every fix  
- `PREVENTION_GATE_HISTORY_AND_GAPS.md` — gate coverage vs actual risk surface  
- `DATABASE_PROOF_LANE_RECONCILIATION.md` — DB proof claim accuracy  
- `MAIN_BRANCH_CLOSURE_STATUS.md` — what is actually closed on main  
- `REQUIRED_CORRECTIVE_ACTIONS.md` — actions needed to convert branch status to main status
