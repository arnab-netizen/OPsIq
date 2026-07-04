# Phase 29–35: DB Verification Readiness Decision
**Date:** 2026-06-19  
**Branch:** claude/cool-ptolemy-dxrpm7

---

## Decision

**BLOCKED_NEEDS_FIXES**

---

## Evidence

### What passed

1. `tsc --noEmit` — 0 errors
2. `prisma validate` — schema valid
3. All 301 tests across 8 files — PASS
4. All 7 Phase 29–35 migrations are additive-only (no DROP, no TRUNCATE, no DELETE)
5. All models have `workspaceId`, workspace FK to `client_accounts`, and `workspaceId` indexes
6. No automatic learning mutations — every promotion/admission requires human actor identity
7. AI-generated evidence correctly blocked by domain classifier
8. `promotionLocked` correctly enforced in candidate service

### Blockers before LANE_B

**Blocker 1 — CRITICAL (security invariant violated):**  
10 of 11 controlled learning services skip `assertWorkspaceScopedQuery()` at function entry. The security rules in `src/domain/owner-mode/security-rules.ts` explicitly state: `"assertWorkspaceScopedQuery enforced at every domain entry point"`. Every service except `controlled-learning-candidate.service.ts` violates this stated invariant. Effective workspace isolation exists at the DB query layer (all `where` clauses include `workspaceId`), but the defense-in-depth guard is absent. An empty-string workspaceId would not throw; it would silently produce "not found" rather than a security error. This must be fixed before DB verification runs, or the test suite confirms behavior that violates documented invariants.

**Blocker 2 — HIGH (zero runtime path for Phases 30–35):**  
Phases 30–35 delivered service+schema but no API routes. There is no HTTP surface for any of: reviews, admissions, formal rejections, privacy/consent/retention, regression results, rollout flags, rollback events, harm events, or attribution reviews. LANE_B migration verification can still run (migrations are self-contained), but functional DB verification of Phase 30–35 logic is impossible without API routes or a direct DB test harness. If LANE_B is strictly "migrate and verify schema tables exist", it can proceed. If LANE_B includes functional smoke testing of the full lifecycle, it is blocked.

### Non-blockers (noted but do not block LANE_B migration verification)

- Admission service does not re-check `EVIDENCE_ORIGIN_FORBIDDEN` (relies on upstream classification — acceptable but fragile)
- Rollout service has no cross-tenant test
- Retention policy lacks candidateId FK (possibly intentional)
- All tests use mock Prisma — LANE_B is needed precisely to verify real schema

---

## Blocker List

| # | Blocker | Blocks LANE_B schema-only? | Blocks LANE_B functional? |
|---|---------|---------------------------|--------------------------|
| 1 | Missing `assertWorkspaceScopedQuery` in 10 services | No | Yes |
| 2 | No API routes for Phases 30–35 | No | Yes |

---

## LANE_A Recommendation

**LANE_A (code fixes) SHOULD RUN first**, specifically to:
1. Add `assertWorkspaceScopedQuery` calls at entry points of the 10 affected services
2. (Optional, confirm scope) Determine whether Phases 30–35 API routes are in-scope for this build or deferred

LANE_A does NOT need to touch migrations or the DB.

---

## LANE_B Conditions

LANE_B (schema migration deploy to Neon test DB) can run under the following conditions:

- **If scope is schema-only verification** (confirm tables exist, indexes correct, FK constraints correct): **Can run now** — migrations are clean and additive.
- **If scope includes functional smoke testing** (create candidate → review → admit → harm → rollout): **Blocked** — no API surface for steps 2 onward.

**Recommendation:** Run LANE_B in schema-only mode now (verify the 7 migrations apply cleanly). Hold full functional LANE_B until LANE_A fixes are in.

---

## Summary

| Can run LANE_B schema-only | YES — migrations are clean |
|---|---|
| Can run LANE_B functional | NO — API routes for Phases 30–35 missing |
| Can run LANE_A | YES — code fixes only, no schema changes needed |
| Next step | LANE_A: add assertWorkspaceScopedQuery to 10 services, then re-audit, then LANE_B full |
