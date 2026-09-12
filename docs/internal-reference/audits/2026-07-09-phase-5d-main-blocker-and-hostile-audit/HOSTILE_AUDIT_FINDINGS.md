# Phase 5D — main-repo hostile audit (report-only, read-only)

**Date:** 2026-07-09 · **Base:** main @ `5badd9b` · **Method:** 6 parallel adversarial hunters + manual
verification of the top claims. **No code was modified; no fix is included here — this is a documented
backlog** (each item is a candidate for its own small, test-backed remediation PR once main is green).

Legend: **[V]** = personally verified against code/schema/config. **[A]** = agent-reported, high-plausibility,
not line-verified.

## CRITICAL / HIGH — owner-facing raw-500s (the mission's own defect class, still on main)

### F1 [V] `findings.ts` invalid-select cluster → raw 500 on core findings endpoints
The `Finding` model (schema.prisma) has **no** `linkedEvidence` / `description` / `findingType` /
`provisionalFlag` columns (evidence is via `primaryEvidenceId` + `evidence` relation). Yet:
- `listFindingsForEngagement` `findings.ts:582` → `select: { …, linkedEvidence: true }` → **500 on
  `GET /api/engagements/[engagementId]/findings`** (primary findings list).
- `getFindingDetail` `~700–764` selects `linkedEvidence, description, findingType, provisionalFlag` → **500 on
  `GET /api/findings/[findingId]`** and the PATCH re-read.
- `linkEvidenceToFinding` `:421` / `unlinkEvidenceFromFinding` `:496` select + write `linkedEvidence` → **500 on
  `POST`/`DELETE /api/findings/[findingId]/evidence`**.
- `validateFinding` `:260`, `supersedeFinding` `:357–367` — same (reachability unconfirmed).
Same class as the Phase 3 `getRecommendation` fix → `PrismaClientValidationError`, uncaught, raw 500. Survived
because these endpoints are covered only by placebo tests (see F4).
**Fix approach:** select real columns (`summary`, not `description`); derive linked evidence from the `evidence`
relation / join model; add a REAL db-backed test that asserts 200 + shape.

### F2 [V] `db.KPI` typo → owner dashboard non-functional
`owner/dashboard/route.ts:125` `db.KPI.findMany(...)` — the only capital-`KPI` in the repo (13 other sites use
`db.kPI`; the generated delegate is `kPI`). `db` is a Proxy typed `any`, so tsc can't catch it →
`undefined.findMany()` throws on every `GET /api/owner/dashboard`; caught as a **400** (owner dashboard 100%
broken). `buildOwnerDashboardPayload` is reused by `internal/owner-dashboard-runtime-proof`. **Fix:** `db.KPI` → `db.kPI` + a test.

## CRITICAL / HIGH — CI integrity (green board hides real breakage)

### F3 [V] "Security Baseline Check" is a structural no-op
`mvp-readiness.yml:120` sets `continue-on-error: true` at **job level** (+ `:134 npm audit … || true`). If this
check is a required branch-protection gate, it can **never fail** — a new critical/high CVE passes green.
**Fix:** make the audit step blocking (or drop the "required" label so it isn't mistaken for a security gate).

### F4 [V] 871 vacuous `expect(true).toBe(true)` asserts across 31 ACTIVE test files
They run in the blocking `build-and-test` lane and assert nothing. Top offenders: `api/operator-queue` 112,
`api/execution-certainty` 111, `api/constraint-checks` 108, `api/escalation-checks` 91, `api/review-cycles` 88,
`api/experiments` 65, `api/decisions` 50, `api/actions` 47, `api/health` 38, `security/hostile-auth-tests` 25.
The entire API-route + hostile-auth surface is placebo — this is *why* F1 slipped through. Tagged
`TODO_A2_FAKE_TEST_QUARANTINED`, inventoried in `.claude/A2_FAKE_TEST_INVENTORY.md`. **Fix approach:** convert to
real assertions (or move to a clearly-labelled non-gating lane) in waves — do NOT delete silently.

### F5 [A] MVP Readiness collapses to a build check
`scripts/mvp-readiness-check.sh` uses `warn` (not `fail`) on the MVP flow test and `grep -q "passed|✓"` for the
DB test — business-logic checks are decorative; the required gate is effectively a second build.

### F6 [A] tsc gates blind to all `__tests__` / `tests` / `__ignored_tests__` paths
`tsconfig.json` excludes those dirs, so `next build` + `tsc --noEmit` never type-check test files or product
fixtures placed under them.

### F7 [A] `*.integration.test.ts` never runs in any lane
`vitest.config.ts` excludes it unconditionally; `services/__tests__/diagnosis.integration.test.ts` +
`recommendation.integration.test.ts` look live but are dead coverage.

## HIGH — governance / governed-record integrity

### F8 [V] `approval/workflow.ts` — $100k approvals with NO audit, no status guard, no idempotency
`approveOutcome`/`rejectOutcome`/`requestApproval`: 0 `emitAuditEvent`; `update where:{id}` flips
`approvalStatus` with no current-status check (an `approved` request can be silently flipped to `rejected`);
read-then-write, no tx, no idempotency key. Violates CLAUDE.md "all mutations emit audit" + "no silent mutation
of approved records". (approve/reject route-reachability unconfirmed; `requestApproval` create reached via
`enforceApprovalRequirement`.)

### F9 [A] Other governed-record gaps
`private-mode/role-access.service.ts` grant/approve/revoke with 0 audit (+ approve TOCTOU); `createDecision`
(`decisions/decision-creation-service.ts`) no audit / no idempotency; `changeDecisionStatus`
(`decision/status-management.ts`) non-atomic with swallowed off-chain audit (safe sibling `transitionDecisionState`
exists); `deliverable.ts` approval carries `version` but `where:{id}` only (guard unused → lost update + silent
re-approval).

## HIGH — drift-500 / auth

### F10 [V] `middleware/workspace-enforcement.ts:37` bare-select membership read on 39 owner routes
`enforceWorkspaceScoping()` default-selects `workspaceMembership` (consumes only `.isActive`/`.role`), reached by
**39 route files** (engagements/*, evidence-bundles, growth/*, …). Under prod drift → P2022 → `catch` returns
`null` → owners **denied across 39 routes** (fail-closed, not a bypass). Phase 5C gap on a still-live gate.
**Fix:** `select: { isActive: true, role: true }`.

### F11 [V] `onboarding/invite/route.ts:49` broken boolean → privilege escalation (latent)
`if (!userRole || (userRole.role !== "admin" && userRole.isActive === false))` → an **active non-admin** is NOT
denied → any active member can invite users at any role incl. `admin`. **Latent today** because line 22
`withAuth()` fails closed (F12). **Fix:** `userRole.role !== "admin" || !userRole.isActive`.

### F12 [V] `withAuth()` defaults `workspaceId = "system"` → every legacy `withAuth()` route 401s all users
No `"system"` workspace exists → `requirePolicyContext("system")` throws → the entire legacy `withAuth()` surface
(80 call sites, none pass a workspace) fails closed for real users. This masks F11 but is itself an availability
finding, and a latent-authz time bomb: if the default is ever "fixed" without migrating routes to the canonical
wrapper, F11 + capability-misscoping go live. **Fix approach:** migrate legacy routes onto
`withCanonicalEnforcement`.

## Tenant isolation — mostly healthy (for the record)
- The 4 old workspace-isolation-scanner flags are **false positives / unreachable** (verified):
  `diagnosis/route.ts` debug ternary; `entitlement.resetQuota` test-only in-memory; `execution-auditor`
  optional-workspaceId has **zero callers**.
- **Structural note [V/A]:** the Prisma "enforcement" extension does **not** scope reads or single writes (only
  requires `workspaceId` on create + non-empty `where` on updateMany/deleteMany) and excludes several governed
  models — tenant isolation is a disciplined service-layer convention, not a DB invariant. No live unscoped read
  found.
- **F13 [A] MED** — `diagnosis/{bottleneck,root-cause,maturity}` routes trust `body.workspaceId` (authorize in the
  `"system"` context, no membership check). Mitigated today: engines are pure computation (no DB). Latent
  cross-tenant if they ever persist.

## Recommended remediation order (each = its own small, test-backed wave, once main is green)
1. **F1 + F2** — real owner-facing 500s (findings.ts cluster; db.KPI). Highest value; exact mission class.
2. **F3** — Security-Baseline no-op gate.
3. **F10** — workspace-enforcement narrow-select (drift lockout on 39 routes).
4. **F8** — approval-workflow audit + status guard.
5. **F11** — invite boolean (cheap) + plan the legacy→canonical migration (F12).
6. **F4** — placebo-test conversion, in waves (this is also the likely home of the F1-class blind spots and the
   `build-and-test` flake).
