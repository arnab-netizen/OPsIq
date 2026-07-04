# OpsIQ Runtime-Readiness Remediation Plan

> Sequenced, file-level remediation for the blockers/majors in `OPSIQ_HOSTILE_READINESS_AUDIT.md`. Not a roadmap —
> each item names the affected files, the exact broken→required behavior, the minimum-code fix, DB/API/UI impact, the
> proof required, the regression gates, acceptance criteria, the recommended PR slice, and whether it can be deferred.
> **HARD RULE: do NOT start public SaaS, billing, launch, integrations, or external automation until P0–P3 are closed
> and verified.** Do not weaken any existing gate. Do not create duplicate engines or a parallel AI brain. One slice
> per PR.

Base: `main @ bfa427a2`. Priority order: **P0 → P1 → P2 → P3 → P4**.

---

## P0 — Real-business ingestion unblock (highest priority; nothing else matters until this is done)

### B1 — Critical ingestion domains `equipment_capacity` + `owner_workload_memory` are unwritable
- **Severity:** BLOCKER.
- **Why it blocks real owner use:** these 2 of 9 `CRITICAL_INGESTION_DOMAINS` can only be written by seed scripts, so
  `criticalDomainsAllReal` is always false → every real business is permanently `need_more_data` / cannot proceed.
- **Affected files:** `src/services/owner-operations/capacity-snapshot.service.ts` (`saveCapacitySnapshot` — built, no
  caller), `src/services/owner-operations/owner-workload-snapshot.service.ts` (`saveOwnerWorkloadSnapshot` — built, no
  caller), `src/services/owner-mode/owner-db-providers.ts:75,156,178` (reader), `owner-domain-ingestion.ts:23,109`.
  NEW: `src/app/api/owner/operations/businesses/[businessId]/capacity-snapshots/route.ts`,
  `.../workload-snapshots/route.ts`.
- **Current broken behavior:** no API route imports either service; grep `src/app → 0`.
- **Required behavior:** an authenticated owner (OWNER_MANAGE, workspace-scoped, business-scoped) can POST a capacity
  snapshot and a workload snapshot for their business; the plan then sees `equipment_capacity` /
  `owner_workload_memory` as real.
- **Minimum-code fix:** add GET+POST routes mirroring `owner/finance/businesses/[businessId]/snapshots/route.ts`
  (`withCanonicalEnforcement`, `CAPABILITIES.OWNER_MANAGE`, `requireWorkspace:true`, `businessId` in path required),
  each parsing a zod body and calling the existing service. No service change (services already scope via
  `assertBusinessInWorkspace`).
- **DB/migration impact:** none (`OwnerCapacitySnapshot`/`OwnerWorkloadSnapshot` tables already exist).
- **API impact:** 2 new routes (additive).
- **UI impact:** none in this slice (P0-A backend); owner forms deferred to P0-B.
- **Proof/test required:** DB test — write both through the service the route calls; cross-business write rejected
  (`assertBusinessInWorkspace`); with capacity+workload missing the owner plan stays `need_more_data`; with all 9
  critical domains present via real service paths the plan is no longer structurally stuck. Route test — POST without
  OWNER_MANAGE is rejected.
- **Regression gates:** corpus invariants + all 10 DB proofs + owner-mode + behavioral-validation + tsc + ratchet green.
- **Acceptance criteria:** `equipment_capacity` and `owner_workload_memory` writable without seed scripts; missing data
  still blocks; all-present can leave `need_more_data`; isolation enforced.
- **Recommended PR slice:** **P0-A** (this slice).
- **Safely deferred?** No — this is the root blocker.

### B2 — `manual-entry`/CSV intake dead-ends (CSV confirm never materializes; manual-entry has no UI)
- **Severity:** BLOCKER.
- **Why it blocks:** owners who upload CSV or expect the 20-category manual-entry catalog get "ready to analyze" but no
  number reaches the snapshot tables diagnosis reads → still `need_more_data`.
- **Affected files:** `src/services/owner-intake/intake.service.ts:89-125` (`confirmDataIntake` — only flips
  `ownerConfirmed`), `src/app/api/owner/manual-entry/route.ts` (no UI), `src/app/(authenticated)/owner/intake/page.tsx`,
  `src/domain/owner-mode/input-catalog.ts:42`, the snapshot read models in `owner-db-providers.ts`.
- **Current broken behavior:** `confirmDataIntake` writes `ownerConfirmed:true` and nothing else; `records` JSON is
  never mapped into `ownerFinancialSnapshot`/`ownerCapacitySnapshot`/etc.
- **Required behavior:** on confirm, mapped intake records materialize into the correct snapshot table for the target
  domain (idempotently, workspace/business-scoped); confirming without the required mapped fields does NOT fake
  readiness.
- **Minimum-code fix:** add a `materializeIntake(intake)` step invoked inside `confirmDataIntake` that, per
  `targetDomain`, converts confirmed records → the domain's snapshot create (reuse `createFinancialSnapshot`,
  `saveCapacitySnapshot`, `saveOwnerWorkloadSnapshot`, etc.). Guard: if required fields are absent, do not confirm.
- **DB/migration impact:** none (writes to existing snapshot tables).
- **API impact:** wire `manual-entry` into the intake UI (P0-B) — no new route needed.
- **UI impact:** P0-B — expose manual-entry/critical-domain forms on the intake page.
- **Proof/test required:** confirm materializes into the read models; confirm without mapped required fields does not
  produce readiness; browser/mobile owner intake proves the flow.
- **Regression gates:** same as B1.
- **Acceptance criteria:** CSV confirm materializes into read models; missing/unmapped fields still block.
- **Recommended PR slice:** **P0-B** (immediately after P0-A).
- **Safely deferred?** No — but split from B1 to keep slices minimal.

---

## P1 — Proof and execution accountability

### B5 — Proof loop is production-inert (no proof row is ever created; gate never fires)
- **Severity:** BLOCKER.
- **Why it blocks:** owners/managers cannot require or verify proof of delegated work; staff mark tasks "done" with no
  evidence and the system accepts it — defeating the anti-gaming guarantee the corpus proved.
- **Affected files:** `src/services/execution/proof.service.ts`, `src/services/execution/task-completion.service.ts:143`
  (`proofRequirementId` never set), `src/services/execution/delegated-task.service.ts:114` (only `updateMany`, no
  `create`), `src/app/api/proof/submit/route.ts:18`, `src/app/api/owner/tasks/complete/route.ts`.
- **Current broken behavior:** zero production creators of `delegatedTask`/`proofRequirement`/`proof`/`workOrder`;
  submit route returns "Task not found"; completion never requires proof.
- **Required behavior:** an owner/manager can create a delegated task with a proof requirement; the assignee submits
  proof; completion is blocked until proof is reviewed/approved.
- **Minimum-code fix:** add a create path for `delegatedTask` + `proofRequirement` (owner/manager route → service),
  set `proofRequirementId` on task creation; keep the existing FSM. Remove the stale `MIGRATION_LANE_PENDING` comment
  (`proof.service.ts:9`) — tables are migrated.
- **DB/migration impact:** none (execution tables migrated `20260625120000_owner_mode_execution_tables`).
- **API impact:** 1–2 new routes (create delegated task + proof requirement).
- **UI impact:** owner "delegate a task / require proof" surface (P1 slice).
- **Proof/test required:** create task→require proof→submit→review→complete closes; completion blocked without approved
  proof; cross-workspace rejected.
- **Regression gates:** staff-proof-anti-gaming pack + owner-mode + isolation green.
- **Acceptance criteria:** a real completion is blocked until proof is approved; proof row exists in production path.
- **Recommended PR slice:** **P1-A.**
- **Safely deferred?** Until P0 merged; not before.

### M5 — Owner workload / standing instructions unwritable ("human execution reality" dimension empty)
- **Severity:** MAJOR (workload half overlaps B1; standing-instructions is separate).
- **Why it blocks:** OpsIQ's mandated human-execution dimension can't be populated → owner-workload/relief and standing
  instructions never inform the plan.
- **Affected files:** workload solved in B1/P0-A; standing instructions: `src/services/owner-mode/owner-load.service.ts`
  (`ownerStandingInstruction` writer, no route). NEW: standing-instructions route.
- **Current broken behavior:** no route writes `ownerStandingInstruction`.
- **Required behavior:** owner records standing instructions (pre-authorised vs reserved) through the app.
- **Minimum-code fix:** add an enforced POST route calling the existing `owner-load` writer.
- **DB/migration impact:** none. **API:** 1 route. **UI:** small owner form (P1).
- **Proof/test required:** write + scope + plan consumption.
- **Regression gates:** owner-mode green.
- **Acceptance criteria:** standing instructions writable + reflected in gating (safe default stays stricter).
- **Recommended PR slice:** **P1-B.**
- **Safely deferred?** Partially — workload half rides P0-A; standing-instructions can follow.

### Related — proof/work-order/delegated-task creation paths
- Covered by B5/P1-A (the create paths are the fix).

---

## P2 — Value-output / profit math

### B3 — No quantified profit/growth upside reaches the owner
- **Severity:** BLOCKER (for the "highly profitable" claim).
- **Why it blocks:** the owner never receives a quantified action ("do X → expected ₹Y") or a runway/break-even/CAC/LTV
  figure; only status + canned strings.
- **Affected files:** `src/behavioral-validation/expert/business-math.ts:118-154` (computes but discards trace),
  `src/behavioral-validation/whole-business/whole-plan.ts:78-84` (qualitative fallbacks),
  `src/domain/owner-mode/supervisor-summary.ts:234-238`, `src/components/owner/SupervisorSummary.tsx:96-104`,
  `src/services/growth/*` (real engines, no UI, in-memory Maps).
- **Current broken behavior:** the computed `calculationTrace` (runway/break-even) is used only to gate then dropped;
  growth engines are orphaned and non-persistent.
- **Required behavior:** surface the ALREADY-COMPUTED quantified figures (runway days, break-even, contribution margin,
  net ROAS) to the owner as read-only supporting numbers, clearly labelled and never fabricated.
- **Minimum-code fix:** thread `advice.calculationTrace` into an existing SupervisorSummary field (e.g. impact detail)
  WITHOUT inventing new numbers — only display what `deriveCalcs` already computed from real inputs; show nothing when
  inputs are absent. Do NOT wire the orphaned in-memory growth engines into the owner path (would be a duplicate
  engine) — persistence/UI for those is a later, separate decision.
- **DB/migration impact:** none. **API:** none (data already in the plan result). **UI:** render existing trace.
- **Proof/test required:** when real inputs exist, the owner-visible impact includes the computed figure; when inputs
  are missing, no fabricated number appears.
- **Regression gates:** owner-mode + corpus green (no scenario disposition changes).
- **Acceptance criteria:** quantified figures are shown only when derived from real data; no placeholder numbers.
- **Recommended PR slice:** **P2-A.**
- **Safely deferred?** Yes until P0/P1, but it is the core "profit" gap.

### M3 — Hardcoded margin constants (18/22/30) in the live plan path
- **Severity:** MAJOR (CLAUDE.md "no placeholders in live path").
- **Why it blocks:** the below-margin gate and any displayed contract-margin number derive from planted constants, not
  the owner's real rate/cost/terms.
- **Affected files:** `src/services/owner-mode/owner-context-derivation.ts:145-147`.
- **Current broken behavior:** on negative margin, injects `consideredRate=18; fullyLoadedCost=22; paymentTermsDays=30`.
- **Required behavior:** use the owner's real rate/cost/terms when present; when absent, resolve the below-margin
  constraint WITHOUT fabricating specific numbers (mark the figure unknown, keep the qualitative direction).
- **Minimum-code fix:** replace the constant injection with the real values from the finance/context rows; if a value
  is genuinely unavailable, omit it (do not plant a number) and let the gate rely on the real negative-margin signal.
- **DB/migration impact:** none. **API:** none. **UI:** none.
- **Proof/test required:** below-margin still resolves from real negative margin; no `18/22/30` reaches output when
  real values are absent; corpus dispositions unchanged.
- **Regression gates:** corpus + owner-mode green.
- **Acceptance criteria:** no hardcoded margin constants in the live path.
- **Recommended PR slice:** **P2-B** (can pair with P2-A).
- **Safely deferred?** Yes, but must be closed before any profit-number claim.

---

## P3 — Learning and reassessment loop closure

### B6 — Decision/operator learning store is write-only
- **Severity:** BLOCKER (for "adjudicated learning").
- **Affected files:** `src/services/learning/store.ts:99,124` (dead read-back),
  `src/services/decisions/decision-metrics-service.ts:50,90` (zero callers),
  `src/services/operator/store.ts:245` (writer), `src/services/execution/execution-service.ts:157` (writer).
- **Current broken behavior:** lessons written, never read into any decision/recommendation.
- **Required behavior:** a repeated failure for a problem type demonstrably changes the next recommendation/confidence.
- **Minimum-code fix:** call the existing read-back (`getLearningRecordsFromDays`) at recommendation time and lower
  confidence / annotate when prior failures exist — reuse the owner-plan's learning-read pattern; do NOT add a new
  store (avoid duplicate engine — see M7).
- **DB/migration impact:** none. **API:** none. **UI:** learning note in summary.
- **Proof/test required:** N prior failures for a problem type change the next output; privacy/workspace scope kept.
- **Regression gates:** learning + owner-mode + corpus green.
- **Acceptance criteria:** decision-path learning read-back has a live caller and changes behavior.
- **Recommended PR slice:** **P3-A.**
- **Safely deferred?** Yes until P0–P2.

### M7 — Two learning subsystems (one dead) — duplicate-engine split
- **Severity:** MAJOR. **Affected files:** `@/behavioral-validation/learning-store` (read by owner plan),
  `src/services/learning/store.ts` (dead). **Required behavior:** ONE learning read-path; consolidate the decision/
  operator learning onto the store the owner plan already reads (do not create a third). **Minimum-code fix:** route
  B6's read-back through the existing `PrismaLearningStore` consumed at `owner-whole-business-plan.service.ts:137`
  instead of the dead `services/learning/store.ts`; deprecate/remove the dead duplicate. **Deferred?** Pairs with P3-A.

### M8 — Scheduled reassessment is dead code
- **Severity:** MAJOR. **Affected files:** `src/scheduler.ts` (0 bytes), `src/infra/scheduler.ts` (`getScheduler`/
  `processDue` uncalled, in-memory default). **Current:** no time-based reassessment fires. **Required:** an overdue
  action (`reviewInDays`/`dueAt`) triggers a governed reassessment. **Minimum-code fix:** a DB-backed due-scanner
  invoked by an authenticated internal route (no external cron infra) that re-runs the existing `reassessBudget`/plan
  path for overdue items; do NOT build a new scheduler engine. **DB:** none (dueAt persisted). **Deferred?** Yes until
  P0–P2; event-triggered reassessment already works, so cadence is an enhancement, not a hard runtime blocker.

### M9 — Outcome loop records but does not steer
- **Severity:** MAJOR. **Affected files:** `src/services/owner-budget/action-link.service.ts:199-222` (persists
  disposition in a JSON note), `src/domain/owner-budget/updated-plan.ts:38-49` (no outcome-history input),
  `src/services/decisions/decision-lifecycle.service.ts:352-411` (never calls learning). **Required:** a `block`ed
  prior outcome changes the next composed plan. **Minimum-code fix:** add an outcome-history input to
  `composeUpdatedPlan` and read `fundedInitiativeOutcome` dispositions at plan time; have `recordDecisionOutcome` feed
  the (consolidated) learning store. **Deferred?** Pairs with P3-A.

---

## P4 — Governance hardening (do NOT weaken any gate; these strengthen)

### B4 — Ratcheted/quarantined safety gates
- **Severity:** BLOCKER (trust). **Affected:** `.claude/lint-baseline.json` (2,155 errors incl. 30 `strict-auth`),
  `.claude/test-quarantine.json` (52 tests), `vitest.config.ts:18` (92 `__ignored_tests__`), the non-blocking security
  route-scanner. **Required:** drive the 30 `auth-enforcement/strict-auth` violations to zero and promote the security
  route-scanner (14 unwrapped routes) to a blocking lane; un-quarantine security/isolation tests incrementally.
  **Minimum-code fix (sliced):** one PR to fix the 14 unwrapped routes + 30 strict-auth violations and flip the
  scanner lane to blocking; separate PRs to un-ignore batches of `__ignored_tests__` after triage. Do NOT lower any
  threshold or delete a test. **Deferred?** Sequence after P0–P3 but before any public-facing step. **PR slice: P4-A.**

### M1 — Fabricated verified-session authz state
- **Severity:** MAJOR. **Affected:** `src/lib/canonical-verified-session.ts:182-218`. **Required:** fetch real
  `workspace.isActive` + entitlement limits instead of hardcoding `true`/empty. **Fix:** query the workspace/entitlement
  rows in the session snapshot. **DB:** none. **Deferred?** After P0; security-relevant. **PR slice: P4-B.**

### M2 — Governed decision transition TOCTOU race
- **Severity:** MAJOR. **Affected:** `src/services/decision/status-management.ts:137-160`. **Required:** guard the
  update on current status/version. **Fix:** `updateMany({ where: { id, status: currentStatus }, ... })` and assert
  `count===1` (reuse the `updateMany`-guard idempotency pattern already in the repo). **Deferred?** After P0. **P4-C.**

### M4 — Log-only escalations/alerts
- **Severity:** MAJOR. **Affected:** `src/services/execution/action-handlers.ts:101`,
  `src/services/alerts/alert-service.ts:246`. **Required:** either actually deliver or clearly mark "not delivered" in
  state so owners are not misled. **Fix (minimum):** persist a delivery record with `status:"not_delivered_stub"` and
  surface honestly; real delivery is a later integration (out of scope now — do not build external integrations).
  **Deferred?** Yes; honesty-label first. **P4-D.**

### M6 — Multi-workspace owner pinned to first membership
- **Severity:** MAJOR. **Affected:** `src/lib/canonical-route-enforcement.ts:304-312`. **Required:** deterministic
  selection + a way to choose workspace. **Fix (minimum):** add `orderBy` for determinism now; a workspace switcher is
  a later UI slice. **Deferred?** Determinism now (P4-E); switcher later.

### Minor issues
- Nullable `businessId` invisibility (`owner-db-providers.ts:80` requires businessId): make critical-domain writers
  require `businessId` (P0-A already uses a path-param businessId, closing this for capacity/workload). **P4/P0.**
- `internal/*` diagnostic routes on shared key + hardcoded `demo-password-123`
  (`internal/login-diagnostic/route.ts:7`): remove the hardcoded credential; gate behind non-prod. **P4-F.**
- `execution-stub.ts` unlocked status→executed: delete the dead footgun. **P4-F.**
- External-systems `not implemented` throws: leave as-is (external integrations are explicitly out of scope).

---

## Sequencing summary
P0-A (B1 critical-domain writes) → P0-B (B2 CSV materialization + intake UI) → P1-A (B5 proof loop) → P1-B (M5 standing
instructions) → P2-A (B3 surface computed profit figures) + P2-B (M3 remove hardcoded constants) → P3-A (B6+M7+M9
learning read-back consolidation) → P3-B (M8 due-scanner) → P4-A..F (governance hardening).

**Do not start public SaaS, billing, launch, external integrations, or automation until P0–P3 are closed and verified.**
Each item ships as its own PR with the corpus/owner-mode/isolation/max-reliability gates green and a final hostile
re-read. No gate is weakened; every P4 item strengthens governance.
