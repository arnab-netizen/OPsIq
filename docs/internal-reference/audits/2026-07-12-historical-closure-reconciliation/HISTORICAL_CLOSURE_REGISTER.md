# Historical Closure Register
**Date:** 2026-07-12  
**Branch:** `claude/phase-6f-governance-findings-5gkiec` @ `59f7e246`  
**Machine-readable version:** `HISTORICAL_CLOSURE_REGISTER.json`

---

## Summary

| Status | Count |
|--------|-------|
| Closed on branch, NOT on main | 22 |
| Gate installed on branch only | 6 |
| Open (unfixed gap) | 1 |
| Gate enforced in CI | 1 (DC-12 via TypeScript) |
| Gates NOT in CI | 17 |

**Critical finding:** 0 of the 25 DC/F/G-class closures have been merged to `origin/main`. Every security fix exists exclusively on `claude/phase-6f-governance-findings-5gkiec`.

---

## Defect Class Register

### DC-01 — x-workspace-id header reads as authoritative workspace identity

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-Batch13 (`034cab64`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-01 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Fix:** Branded types `ClaimedWorkspaceId`/`VerifiedWorkspaceId`. Header reads typed as `ClaimedWorkspaceId`. Conversion via `asVerifiedWorkspaceId()` restricted to canonical enforcement (DC-16).  
**Denominator:** 8 files read x-workspace-id header; all allowlisted and typed correctly.

---

### DC-02 — requireWorkspaceContext from session-reading context.ts

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-Batch12 (`e2df9bb8`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-02 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

**Fix:** All callers removed (was 6: operator/store.ts, metrics routes, audit-log.ts, run/route.ts, inbox page, activation-context). `context.ts` exists as orphan — no external callers remain.  
**Residual risk:** `context.ts` is still importable. Deletion would fully eliminate the risk.

---

### DC-03 — Non-canonical auth wrappers in route files

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-Batches1–12 (multiple commits) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-03 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Fix:** 311 of 338 routes now use `withCanonicalEnforcement`. The 27 without it are all legitimate exceptions (pre-auth, health, internal, ops, Stripe webhook).

---

### DC-04 — Client-supplied actor identity fields persisted as authoritative

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7 (gate only — 0 violations found) |
| Branch status | **GATE INSTALLED** |
| Main status | **UNPROTECTED** |
| Gate | DC-04 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Fix:** Gate detects `body.(approvedBy|rejectedBy|...)` reads in route files. Prevents future client-supplied actor identity from reaching persistence.

---

### DC-05 — Direct db.auditEvent.create outside approved paths

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-Batch14 (`e12d406a`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-05 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Fix:** Allowlist tightened to 6 approved callers. All unauthorized direct audit writes removed.

---

### DC-06 — logAuditEvent usage (deleted legacy module)

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-Batch14 (`568e18b8`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-06 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

**Fix:** 19 production callers migrated to `emitAuditEvent`. `src/services/audit/audit-log.ts` DELETED. Gate prevents re-import.

---

### DC-07 — State-transition maps outside authoritative state machine files

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-DC07 (`0aa6b3a0`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-07-SM in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Fix:** `proof/review` no longer accepts `body.requiredPermission`. DC-15 gate enforces this. DC-07-SM prevents new state-transition maps outside authoritative files.

---

### DC-08 — Production stubs returning fabricated success

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7 (gate only) |
| Branch status | **GATE INSTALLED** |
| Main status | **UNPROTECTED** |
| Gate | DC-08 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-09 — Route-to-domain business logic imports (bypassing services layer)

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7 (gate only) |
| Branch status | **GATE INSTALLED** |
| Main status | **UNPROTECTED** |
| Gate | DC-09 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-10 — Duplicate workspace resolver implementations

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7 (gate only) |
| Branch status | **GATE INSTALLED** |
| Main status | **UNPROTECTED** |
| Gate | DC-10 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-11 — New enforceWorkspaceScoping implementations

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7 (gate only) |
| Branch status | **GATE INSTALLED** |
| Main status | **UNPROTECTED** |
| Gate | DC-11 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-12 — Unregistered permission action strings in hasPermission() calls

| Field | Value |
|-------|-------|
| Phase discovered | A7.6 |
| Phase closed | A7.6-I5-DC06 (`c67fa206`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** (fix not merged) |
| Gate | TypeScript type system (`WorkspaceAction` union) |
| Gate in CI | **YES** — `npx tsc --noEmit` is in CI |
| Recurrence risk | LOW |

**Note:** This is the only DC class whose gate is enforced in CI. TypeScript catches any unregistered action string at compile time.

---

### DC-13 — Duplicate error sanitization utility exports

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7 (gate only) |
| Branch status | **GATE INSTALLED** |
| Main status | **UNPROTECTED** |
| Gate | DC-13 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-14 — New emitAuditEvent re-implementations

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-Batch14 |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-14 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-15 — proof/review accepts body.requiredPermission (client permission elevation)

| Field | Value |
|-------|-------|
| Phase discovered | A7.7 |
| Phase closed | A7.7-DC07 (`0aa6b3a0`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-15 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-16 — asVerifiedWorkspaceId() called outside canonical-route-enforcement

| Field | Value |
|-------|-------|
| Phase discovered | A7.7-Batch13 |
| Phase closed | A7.7-Batch13 (`034cab64`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-16 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-17 — claimWorkspaceId + resolveWorkspaceTier in same file (claimed→tier poisoning)

| Field | Value |
|-------|-------|
| Phase discovered | A7.7-Batch13 |
| Phase closed | A7.7-Batch13 (`034cab64`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-17 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

---

### DC-18 — Raw auditError in console.error without classifyOperatorError

| Field | Value |
|-------|-------|
| Phase discovered | A7.7-Batch18 |
| Phase closed | A7.7-Batch18 (`59f7e246`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | DC-18 in `governance:scan:a77` |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Fix:** 3 routes (value, scenario, governance/alerts) fixed. Gate detects `console.error(`...${auditError}`)` pattern.

---

### F1 — Missing audit on decision creation

| Field | Value |
|-------|-------|
| Phase discovered / closed | Phase 6F |
| Branch status | **CLOSED** |
| Main status | UNKNOWN (Phase 6F commits — check merge history) |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

---

### F2 — Non-atomic status change with swallowed audit (changeDecisionStatus)

| Field | Value |
|-------|-------|
| Phase discovered / closed | Phase 6F |
| Branch status | **CLOSED** |
| Main status | UNKNOWN |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

---

### F3 — Zero audit + TOCTOU in PrivateModeRoleAccessService (4 mutations)

| Field | Value |
|-------|-------|
| Phase discovered / closed | Phase 6F |
| Branch status | **CLOSED** |
| Main status | UNKNOWN |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

---

### F4 — Version guard no-op in updateDeliverableReviewStatus

| Field | Value |
|-------|-------|
| Phase discovered / closed | Phase 6F |
| Branch status | **CLOSED** |
| Main status | UNKNOWN |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

---

### G-AUDIT-FAIL-OPEN — Audit .catch() swallowing failures on post-mutation write paths

| Field | Value |
|-------|-------|
| Phase discovered | Phases 6H, 6J |
| Phase closed | A7.7-Batch15 (`4ce3f184`) — last known instance |
| Branch status | **CLOSED** (known instances) |
| Main status | **OPEN** |
| Gate | NONE — no automated detection for new write-path `.catch()` introductions |
| Gate in CI | NO |
| Recurrence risk | HIGH |

**Pattern:** Read paths may use `.catch()` (fail-open intentional). Write paths (post-mutation) must NOT use `.catch()` — audit failure must propagate and cause the request to fail.  
**Gap:** No prevention gate exists for this pattern. Any new route with a governed write mutation could silently introduce `.catch()` on the audit call without detection.

---

### G-DEAD-IMPORT — Dead imports expanding auth surface without purpose

| Field | Value |
|-------|-------|
| Phase discovered | A7.7-Batch17 |
| Phase closed | A7.7-Batch17 (`2ebe7716`) |
| Branch status | **CLOSED** (known instances) |
| Main status | **OPEN** |
| Gate | TypeScript `noUnusedLocals` (NOT enabled in tsconfig) |
| Gate in CI | NO |
| Recurrence risk | MEDIUM |

---

### G-DEDUP-UNWIRED — isDuplicateRequest imported but never called

| Field | Value |
|-------|-------|
| Phase discovered | A7.7-Batch16 |
| Phase closed | A7.7-Batch16 (`7f786127`) |
| Branch status | **CLOSED** |
| Main status | **OPEN** |
| Gate | None |
| Gate in CI | NO |
| Recurrence risk | LOW |

---

### G-SCAN-A77-NOT-IN-CI — 18-gate security suite not wired into CI ⚠️ OPEN

| Field | Value |
|-------|-------|
| Phase discovered | 2026-07-12 reconciliation |
| Phase closed | **OPEN — unfixed** |
| Branch status | OPEN |
| Main status | OPEN |
| Gate | None (this IS the meta-gap) |
| Gate in CI | NO |
| Recurrence risk | **CRITICAL** |

**Description:** `npm run governance:scan:a77` exists in `package.json` but is not referenced in `.github/workflows/ci.yml`. The CI workflow runs only `governance:scan:strict` and `governance:scan:auth`. The entire 18-gate DC-01 through DC-18 prevention suite can be bypassed by any commit that pushes directly without running the scan locally.

**Required action:** Wire `npm run governance:scan:a77` into `.github/workflows/ci.yml` as a blocking required check.

---

## Coverage Gaps Not Yet Gated

| Gap | Risk |
|-----|------|
| Write-path `.catch()` on `emitAuditEvent` | HIGH — no automated detection |
| Dead imports expanding auth surface | MEDIUM — `noUnusedLocals` not enabled |
| Full-repo fail-open/fail-closed audit classification | MEDIUM — pattern known, no gate |
| `src/services/workspace/context.ts` as importable orphan | LOW — no callers, but callable |
