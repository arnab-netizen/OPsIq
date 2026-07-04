# OpsIQ — Slice 10 Proper (User-Facing Route Wrappers) + Slice 26 (Owner-Data Dry-Run Prep) Closeout

Branch: `claude/opsiq-owner-mode-build-219oib`
Commits: `81e6558` (Slice 10 proper), `7f6d1b3` (Slice 26)
Date: 2026-06-25

---

## SLICE 10 PROPER — Thin user-facing guided-execution route wrappers

### A. Files created
- `src/services/routes/guided-execution-handlers.ts` — DI-injectable handlers wiring the proven guards.
- `src/app/api/owner/guided-choice/route.ts` — GET, owner guided-choice surface.
- `src/app/api/owner/execution-plan/route.ts` — GET, owner execution-plan / guidance-start.
- `src/app/api/employee/tasks/route.ts` — GET, employee's own task list.
- `src/app/api/employee/tasks/[taskId]/guidance/route.ts` — POST, the `gateEmployeeGuidance` call site.
- `src/app/api/proof/submit/route.ts` — POST, employee proof submission.
- `src/app/api/proof/review/route.ts` — POST, manager/owner proof review.
- `src/app/api/escalation/route.ts` — POST, blocker/escalation raise.
- `src/__tests__/services/routes/guided-execution-handlers.test.ts` — 14 tests (all 18 required scenarios).

### B. Files changed
None. Purely additive — no existing service, gate, or schema was modified (`git status` showed only new files).

### C. Schema changes
None. The routes consume tables already added by the migration lane (`DelegatedTask`, proof/escalation tables).

### D. Backend logic implemented
Six handlers, each enforcing guards in fixed order then delegating to the proven service:
- `ownerGuidedChoiceHandler` → `requireActiveMembership` → `requireDashboardAccess(OWNER)` → `scopedResponse`.
- `employeeTaskListHandler` → `requireActiveMembership` → `requireDashboardAccess(EMPLOYEE)` → `scopedResponse`.
- `employeeTaskGuidanceHandler` → `requireActiveMembership` → `requireTaskAccess` → `generateEmployeeGuidance`
  (boundary gate + untrusted containment + durable AI-ledger); returns the employee-safe projection only.
- `proofSubmitHandler` → `requireActiveMembership` → `requireTaskAccess` → `submitProof`.
- `proofReviewHandler` → `requireActiveMembership` → `requirePermission` → `reviewProof`.
- `raiseEscalationHandler` → `requireActiveMembership` → `raiseBlocker` (severity-routed).

### E. Frontend logic implemented
Seven thin `withCanonicalEnforcement` route entrypoints (no business/permission/state logic in the route body):
they read `verifiedSessionSnapshot.actorId` + `verifiedWorkspaceId`, do a workspace-scoped data load where
needed, and call the matching handler. The guidance route seals the owner-approved boundary server-side and
overwrites the instruction's version-pinning fields from the sealed boundary, so a client cannot forge a
hash/version to bypass the gate.

### F. Acceptance criteria checklist
- [x] Every route enforces `requireActiveMembership` (suspended/offboarded denial).
- [x] Owner routes enforce `requireDashboardAccess(OWNER)`; employee list enforces `EMPLOYEE` scope.
- [x] Task-scoped routes enforce `requireTaskAccess` (cross-employee + cross-workspace denial).
- [x] Proof review enforces `requirePermission`.
- [x] `scopedResponse` redaction applied; employee payloads exclude owner-only fields.
- [x] Guidance route flows through `gateEmployeeGuidance`; no guidance unless BOUNDARY_VALIDATION_PASSED.
- [x] Untrusted text contained; unsafe instruction never returned (`JSON.stringify` leak assertion).
- [x] Durable AI-ledger record written on every guidance attempt.
- [x] No business/permission/state-transition logic in route bodies (centralized services only).

### G. Known limitations
- Boundaries are owner-approved and supplied per request and sealed server-side; there is no boundary
  persistence table yet, so a future "boundary store" slice would let the guidance route load a sealed
  boundary by id instead of receiving the draft. Current behavior is correct and tamper-safe (server seals
  + pins), just not yet persisted.
- These are functional JSON routes, not styled UI pages. Visual presentation is the remaining
  `PASS_FUNCTIONAL_ROUTE_WRAPPERS_VISUAL_POLISH_PENDING` item.

### H. Manual verification steps
1. `npx tsc --noEmit` → 0 errors.
2. `npx eslint` the 8 new files → clean.
3. `npx vitest run src/__tests__/services/routes/guided-execution-handlers.test.ts` → 14/14 pass.

### I. Trigger map
- Suspended/offboarded actor on any route → `requireActiveMembership` denial.
- Employee hitting owner routes → `requireDashboardAccess(OWNER)` denial.
- Actor requesting another employee's / another workspace's task → `requireTaskAccess` denial.
- Blocked/escalation instruction → guidance withheld, gate message only, AI-ledger records the attempt.

### J. Failure modes covered
- Missing/invalid boundary → fail-closed (no guidance).
- Forged boundary hash/version in the request → server reseal + repin defeats it.
- Task not found → fail-closed BLOCKED/`ok:false` (no leak).
- Prompt injection in untrusted text → contained; cannot flip the decision.

### K. Events emitted
The underlying services emit their audit events (guidance AI-ledger, proof submit/review tx-atomic audit,
escalation routing audit). The route layer adds no new event types — it routes into the proven emitters.

### L. Automated tests added
14 tests in `guided-execution-handlers.test.ts` covering all 18 required scenarios (several scenarios asserted
per test): owner/employee/manager access, cross-employee + cross-workspace denial, suspended + offboarded
denial, owner-only redaction, boundary gate, injection containment, AI-ledger written, blocked-action no-leak,
proof task-access, proof-review permission, refund-escalation → owner routing.

**Classification: SLICE_10_PROPER_UI_API_WIRED** (functional routes complete; visual polish pending).

---

## SLICE 26 — Real Owner-Data Dry Run Preparation

No real owner data exists in this build environment, so per the rules this slice prepares the dry run
**without fabricating data**: the exact intake checklist + a fail-closed readiness assessor + a runnable script.

### A. Files created
- `src/domain/execution/owner-data-dry-run.ts` — intake checklist + `assessDryRunReadiness` + `buildBlankIntakeTemplate`.
- `scripts/owner-data-dry-run.ts` — runnable prep/exec script.
- `src/__tests__/domain/execution/owner-data-dry-run.test.ts` — 8 tests.

### B. Files changed
None (additive).

### C. Schema changes
None. Reuses the Slice 24 trial-pack and existing owner-intake tables.

### D. Backend logic implemented
- `OWNER_DATA_INTAKE_CHECKLIST`: every trial-pack section mapped to exactly one of the four product
  dimensions (consulting lifecycle, business condition, intervention mode/phase, human execution reality),
  each with concrete required fields, plain-language format, and a blocking flag.
- `assessDryRunReadiness(input)`: fail-closed — BLOCKED unless every blocking section is present AND all four
  dimensions are covered; reuses `buildProvisionalTrialOutput` so output is always provisional + owner-approval
  gated; returns blocking gaps, optional gaps, uncovered dimensions, and concrete next actions.
- `buildBlankIntakeTemplate()`: empty slots only, never invented values.

### E. Frontend logic implemented
`scripts/owner-data-dry-run.ts`: no-arg → prints checklist + blank template (exit 2); with a JSON file →
assesses readiness over the owner's real data and exits 0 (ready) / 1 (blocked) / 3 (bad file). Fabricates nothing.

### F. Acceptance criteria checklist
- [x] All four product dimensions represented by at least one blocking input.
- [x] Each checklist item names concrete required fields + format + rationale.
- [x] Empty data → BLOCKED, all 4 dimensions uncovered.
- [x] Complete blocking data → READY.
- [x] One missing blocking section → BLOCKED and flags its dimension.
- [x] Optional-only gaps → still READY, confidence reduced.
- [x] Never silently executes — provisional always requires owner approval.

### G. Known limitations
- The dry run validates data readiness + the provisional/approval gate; it does not itself spin up live
  employee tasks (by design — that is the supervised pilot, Slice 27).

### H. Manual verification steps
1. `npx vitest run src/__tests__/domain/execution/owner-data-dry-run.test.ts` → 8/8 pass.
2. `npx tsx scripts/owner-data-dry-run.ts` → prints checklist + blank template, exit 2.
3. `npx tsx scripts/owner-data-dry-run.ts <complete.json>` → READY, exit 0.
4. `npx tsx scripts/owner-data-dry-run.ts <partial.json>` → BLOCKED, exit 1.

### I. Trigger map
- Owner provides incomplete data → BLOCKED verdict + exact missing blocking inputs + uncovered dimensions.
- Owner provides all blocking data → READY verdict gated by mandatory owner approval before execution.

### J. Failure modes covered
- Unreadable/invalid JSON → exit 3, no crash.
- Empty/partial data → fail-closed BLOCKED, no fabricated values.

### K. Events emitted
None (preparation/assessment script; no governed mutations).

### L. Automated tests added
8 tests (see F).

**Classification: SLICE_26_DRY_RUN_PREP_READY** (awaiting real owner data + supervised execution).

---

## Aggregate verification
- `npx tsc --noEmit`: **0 errors**.
- `eslint` on all new files: **clean**.
- Route handler tests: **14/14**. Dry-run tests: **8/8**.
- Full local cross-slice regression: **10712 passed**, 275 skipped. The 84 failures are all in
  `external-systems/token-lifecycle.service.test.ts` — an unconditional "DB-Backed Tests" suite that requires
  a live Postgres absent locally (`TEST_WITH_DB` unset); unrelated to this work (git showed only new files),
  proven on the CI Postgres lane.
- CI Postgres lane runs on both pushes (`ci.yml`).
