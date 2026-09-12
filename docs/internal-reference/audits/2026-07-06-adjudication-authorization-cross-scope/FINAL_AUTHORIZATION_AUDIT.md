# Adjudication Authorization Re-Audit + Two-Tenant Cross-Scope Proof

**Date:** 2026-07-06
**Audited main HEAD:** `6bb628d6355c8901a2e5f1260a93830d1ec25094`
**Branch:** `claude/adjudication-authorization-cross-scope-proof`
**Restriction targeted:** R4 — adjudication authorization scope
**Classification:** **`ADJUDICATION_AUTHORIZATION_PROVEN`** · **R4 → REMOVED**

This is a targeted authorization audit of the **trusted execution spine**, not a generic security scan. It inspected the source and proved behaviour with a two-tenant real-Postgres simulation. Two genuine gaps were found and fixed; everything else was already correctly workspace-scoped.

## Files inspected
`canonical-route-enforcement.ts`, `process-execution-bridge.service.ts`, `reassessment-event.service.ts`, `process-execution/route.ts`, `proof-risk-adjudication.service.ts`, `evidence-credibility.service.ts`, `business-scope.ts`, `capabilities.ts`, `capability-check.ts`, and every by-id load in `src/services/owner-mode`.

## Routes / services inspected
POST + GET `/api/owner/process-execution`; `applyProcessExecutionAction`; `completeProcessTask`; `persistProcessExecutionRoutes`; `getPersistedProcessTasks`; `createReassessmentEvent`; `proofRiskAdjudication`; `withCanonicalEnforcement` workspace + capability derivation.

## What was already correct (inspection-confirmed)
- **Workspace derivation is fail-closed and server-authoritative.** `verifiedWorkspaceId` comes from an active `workspaceMembership`, never from a header; unauthenticated / unauthorized / no-membership all fail closed (403).
- **Every** process-execution query filters by `workspaceId`; no task is ever loaded by `taskKey`/`id` alone. `persistProcessExecutionRoutes` even has an in-loop `r.workspaceId !== workspaceId` skip.
- **Proof-risk adjudication is the gold-standard pattern:** proofs are loaded `where { workspaceId, id in proofIds }` with a length check, and `businessId` is **derived** from those scoped rows rather than trusted from the caller.
- **All by-id loads** in owner-mode services carry a workspace (or workspace-relation) filter; the only bare `findUnique({ where: { id } })` calls target the workspace/ClientAccount row itself (`id === workspaceId`).

## Auth gaps found — and fixed

1. **Unvalidated `businessId` → cross-workspace reassessment linkage (A/B).**
   The POST route accepted `businessId` (UUID-only) and it flowed into `createReassessmentEvent`, which wrote it with no workspace-ownership check. A crafted request could persist a reassessment (owned by the caller's workspace) referencing a business in **another** workspace.
   **Fix:** a `businessInWorkspace()` guard on `applyProcessExecutionAction` and `completeProcessTask` validates any supplied `businessId` against `ownerBusiness(id, workspaceId)` **before** any reassessment write; failure returns `WRONG_WORKSPACE` (403). Enforced at the **service** layer, so every caller — not just this route — is protected.

2. **`actorRole` read from a phantom field → owner-only actions silently always-rejected (C/D).**
   The route read `ctx.verifiedSessionSnapshot.role`, which does not exist on the snapshot, so `actorRole` was always `null`. Owner-only `APPROVE`/`COMPLETE` were therefore **always rejected** through the real HTTP route (fail-closed, but the owner could never approve — a correctness bug hidden because the DB sims call the service directly with `"owner"`).
   **Fix:** `actorRole` is derived server-authoritatively from the **verified capability set** — `ctx.verifiedCapabilities.has(OWNER_MANAGE) ? "owner" : null`. Because the route is `OWNER_MANAGE`-gated, a reaching actor holds owner authority, so owner-only transitions are authorized by **proven capability**, and the phantom-field trust is removed.

Both fixes add explicit non-leaky failure codes (`WRONG_WORKSPACE`, `OWNER_APPROVAL_REQUIRED`, `EVIDENCE_REQUIRED`, `INVALID_TRANSITION`, `NEVER_AUTO`, `NOT_FOUND_OR_FORBIDDEN`, `MISSING_INPUT`); the route maps `WRONG_WORKSPACE` → 403 and the rest → 400.

## Tests added
`adjudication-authorization-cross-scope.db.test.ts` — 10 real-Postgres cases across two fully-populated tenants seeded with the **same** taskKeys (so assertions prove scoping, not key uniqueness):
- **Positive:** owner START→DELEGATE→staff SUBMIT_EVIDENCE→manager COMPLETE (same-workspace reassessment + scoped audit); owner APPROVE / owner REJECT with reason.
- **Cross-scope fail-closed:** scoped cockpit read; foreign-task actions never mutate the other tenant; cross-workspace `businessId` → `WRONG_WORKSPACE` with zero foreign linkage; manager/staff cannot approve owner-only; stale/unknown task + unknown workspace fail closed; duplicate completion → `INVALID_TRANSITION` with no double reassessment; audit rows never cross tenants; clean workspace fabricates nothing.

## DB sim result & LANE_B proof
The sim passes locally (10/10) and is wired into LANE_B and LANE_A in `db-verification.yml`. Broad reconfirmation: **60 files / 352 tests** green across the execution + security suites (includes the new sim and all prior execution/security tests). LANE_B execution will be confirmed from the CI run's job log (the file appears in the explicit LANE_B test list; the vitest summary count increases by 10) before merge.

## Commands run
`git status`, `git rev-parse HEAD`, `prisma validate`, `prisma generate`, `tsc --noEmit`, `governance:scan:strict` (0 new), `lint:ratchet` (0 changed-file errors), execution + security DB suites (352 green), `next build` (compiles). None failed or were blocked.

## R4 status
**REMOVED.** Route-level + service-level authorization, owner-only enforcement, manager/staff delegated boundaries, cross-workspace read/write/action fail-closed, evidence + reassessment + audit scoping, cockpit query scoping, and clean-workspace no-fabrication are all proven, and the two genuine gaps are fixed. Adjudication/execution authorization scope no longer applies as a restriction.

## Remaining restrictions
- **R6 — exhaustive read/audit proofs:** `RETAINED_SAFELY` (non-blocking proof-scope; covered incrementally by per-pass DB sims + CI, not a single whole-corpus artifact).
- **R3 caution** on effectiveness / SOP-adherence classification: addressed next in PASS 26.

## No safety weakened
No permission was loosened, no forbidden item was made visible for convenience, no unsafe autonomy or external action was added, and no fabricated money/score was introduced. The `actorRole` fix **restores** a legitimate owner capability that was accidentally broken while keeping every owner-only guard intact.

## Next safest pass
**PASS 26 — Effectiveness / SOP adherence classification hardening** (remaining R3 caution): make effectiveness/adherence states first-class and impossible to overstate.
