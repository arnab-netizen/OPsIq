# OPSIQ FULL REPO-WIDE JARVIS HOSTILE GAP REGISTER

Read-only repo-wide hostile audit of OpsIQ on `main` @ `fc65b3d` (audited code = merge commit `227b034`).
Every finding below was **verified by reading the cited code** (agent findings were independently
spot-checked; severities calibrated to runtime reachability, not worst-case theory). No source, test,
migration, or workflow was modified.

Severity key: BLOCKER > CRITICAL > HIGH > MEDIUM > LOW.
Status key: OPEN / PARTIAL / CLOSED / NEEDS_E2E / CI_INFRA_ONLY.

## Summary counts
- Routes inspected: 302 API route files (170 mutation). Mutation routes without an auth wrapper: 6 — all legitimately protected (auth/webhook/api-key/diagnostic-key).
- Services: 391 · Domain files: 474 · Prisma models: 193 · Migrations: 93 (167 CREATE TABLE) · Tests: 759 · Workflows: 58.
- Findings: 1 BLOCKER, 3 CRITICAL, 9 HIGH, 7 MEDIUM, 4 LOW/INFO.

---

## A. AUTH / RBAC / WORKSPACE ISOLATION

### GAP-RBAC-01 — auth coverage — **CLOSED (strong)**
- **Severity:** — (verified safe). **Status:** CLOSED.
- 273/302 routes carry an auth/enforcement symbol; **all 133 owner routes** use `withCanonicalEnforcement`. Of 170 mutation routes, only 6 lack a wrapper, each protected by an alternative: `auth/signup`+`auth/login` (bcrypt/session), `webhooks/stripe` (signature, fail-closed), `decisions/submit-external` (disabled — `throw "Endpoint disabled"`), `internal/demo-*-proof` (diagnostic-key, 404 on fail). **No unprotected business-state mutation route found.**

### GAP-ISO-01 — legacy consulting models isolate by join, not column — **OPEN (HIGH)**
- **File:** `prisma/schema.prisma` — `Action`, `Finding`, `Risk`, `Evidence`, `EvidenceItem`, `EvidenceBundle`, `Deliverable`, `KPI`, `KPISnapshot`, `Stage`, `ShockEvent`, `InterventionState`, `FinancialBaseline`, `DecisionSnapshot`.
- **Issue:** scoped only by `engagementId`; workspace reachable solely via `Engagement.workspaceId` join (e.g. `owner-dashboard.service.ts:84`). Isolation depends on every query remembering `engagement: { workspaceId }`. `KPISnapshot` has neither field (two-hop). Owner-mode, by contrast, scopes by direct `workspaceId` column.
- **Risk:** cross-workspace leak is one missing `where` clause away on the legacy path. **Blocks behavioral validation:** PARTIAL.

### GAP-ISO-02 — `Engagement.workspaceId` nullable + unindexed — **OPEN (HIGH)**
- **File:** `prisma/schema.prisma:359` (`workspaceId String?`, no `@@index`).
- **Issue:** a NULL-workspace Engagement is invisible to every `engagement:{workspaceId}` filter (its Findings/Actions/Evidence escape scoping — compounds GAP-ISO-01); unindexed relational subquery at scale. **Blocks validation:** NO (correctness/perf).

### GAP-ISO-03 — `completeTraining` updates by id only, no workspace guard, no audit — **OPEN (MEDIUM)**
- **File:** `src/services/owner-mode/staff-training.service.ts:167-177`.
- **Issue (verified):** `db.ownerTrainingRecommendation.update({ where: { id }, data: { status:"completed", ... }})` — `workspaceId` is in the input but **not** in the `where`; a known id is completable across workspace boundaries, and the governed mutation emits **no audit event**. Violates the repo rules "all meaningful mutations emit audit events" and workspace-scoped updates. **Blocks validation:** PARTIAL.

---

## B. FINANCE / BUDGET / DYNAMIC-BUDGET vs JARVIS GATES

### GAP-BUDGET-01 — budget action completion bypasses the owner-action gate — **OPEN (CRITICAL)**
- **File:** `src/services/owner-budget/action-link.service.ts:153-166` (`updateBudgetAction`); route `src/app/api/owner/budget/actions/[actionId]/route.ts:19-25` (OWNER_MANAGE, workspace).
- **Issue (verified):** transitions a budget action `in_progress`/`completed` via `canTransition` only; it **never calls `enforceOwnerActionGates`** and is **not** in `material-gate-registry.ts` (0 budget entries). The same FSM transition through `owner-finance/action.service.ts` IS gated. So a budget action can be completed while finance survivalState=CRITICAL / cashflow=AT_RISK / gross margin below floor / compliance expired — exactly the states the Jarvis gate 409-blocks elsewhere.
- **Contradiction:** budget says "yes" where Jarvis says "no." RBAC/workspace are fine; the **safety gate** is bypassed. **Blocks validation:** YES.

### GAP-BUDGET-02 — spend entry committed regardless of governance decision — **OPEN (HIGH)**
- **File:** `src/services/owner-budget/budget.service.ts:217` (`db.spendEntry.create` unconditional), decision logic `src/domain/owner-budget/spend-governance.ts`.
- **Issue (verified):** `evaluateSpend` returns `HOLD`/`REQUIRE_OWNER_APPROVAL`/`AUTO_LOG`, but `recordSpendEntry` persists the row in every case and returns the decision as advisory (`{spend, governance, plan}`). No enforcing chokepoint consumes `HOLD` to refuse the write; no cash/margin gate. (Row is `state:"requested"`, so it is a request not an executed payment — but nothing downstream blocks the HOLD before it feeds obligations/forecasts.) **Blocks validation:** PARTIAL.

### GAP-BUDGET-03 — budget line allocation changes ungated — **OPEN (MEDIUM)**
- **File:** `src/services/owner-budget/budget.service.ts:111-162` (`addBudgetLine`/`updateBudgetLineAmount`).
- **Issue:** mutate `plannedAmount` directly then call advisory `reassessBudget`; an offensive allocation can be raised in EMERGENCY/reserve-breached mode. Audited (`OWNER_BUDGET_LINE_CHANGED`) but **no override reason required**. Capital-allocation reserve/margin math (`domain/owner-budget/capital-allocation.ts`) is advisory only — it labels BLOCK/DEFER but never refuses a commit. **Blocks validation:** PARTIAL.

### Budget controls that DO hold (not gaps)
- `vendor.service` bank-change → `bankVerified=false` + hold (real hard control); `governance.service.recordOwnerOverride` enforces 3 non-overridable hard blocks (vendor-unverified, statutory-reserve, unlawful) and requires a reason; all budget mutations emit audit events. The bypass is specifically **cash/margin/reserve enforcement on the action-completion and spend-commit paths**.

---

## C. RECOMMENDATION / AI / ADVISORY

### GAP-REC-01 — `/api/diagnosis` generates + persists un-arbitrated, un-gated advice — **OPEN (HIGH)**
- **File:** `src/services/diagnosis.ts:297` (`generateRecommendations`), called `:608`, persisted `tx.recommendation.create` `:770`; route `src/app/api/diagnosis/route.ts:31` (auth-wrapped, ENGAGEMENT_CREATE).
- **Issue (verified):** produces template advice scored only by size/industry/health, then persists it — with **no `arbitrateInterventions`** (no chosen-vs-rejected / what-not-to-do), no cash/margin/capacity **at generation**, no do-not-repeat, no rec-level confidence. **Mitigant (verified):** promotion to `approved` is funneled through the single chokepoint `recommendation.ts:720 updateRecommendationStatus → enforceOwnerGatesForPromotion`, so **acting** on the advice is still gated. Net: ungated/un-arbitrated **advice surfaced**, gated **action**. **Blocks validation:** PARTIAL (advice quality/safety, not action bypass).

### GAP-REC-02 — `/api/intelligence/recommendations` skips arbitration + cash/margin/capacity — **OPEN (MEDIUM)**
- **File:** `src/app/api/intelligence/recommendations/route.ts:153,180`.
- **Issue:** returns `generateRecommendation`/`generateMultipleRecommendations` raw. Has a data-sufficiency fail-closed gate + guardrails + confidence disclosure; lacks arbitration, cash, margin, capacity, do-not-repeat. Not persisted as governed records. **Blocks validation:** NO.

### GAP-REC-03 — owner-now-view `unsafeToGuide` hardcoded `false` — **OPEN (LOW)**
- **File:** `src/services/owner-guidance/owner-now-view.service.ts:348`.
- **Issue:** the terminal `GUIDANCE_BLOCKED_UNSAFE` path can never fire from live data; secondary gates (missing-data, professional-review, owner-decision, low-confidence cap) still cover the surface. Defense-in-depth gap. **Blocks validation:** NO.

### GAP-REC-04 — dormant ungated advisory/LLM engines (latent) — **OPEN (LOW)**
- **Files:** `src/services/ai/*` copilot (governed by `validateAiOutput` but **zero route callers** — no live LLM advice path); `src/services/growth/offer-engine.ts` / `pricing-engine.ts` (ungated discount/margin, but in-memory `Map`, handlers not HTTP-exported, persist nothing governed).
- **Issue:** safe today because unreachable; wiring any to a route creates an ungated advice/pricing path. **Blocks validation:** NO.

### Recommendation paths that ARE gated (not gaps)
`recommendation.ts createRecommendationsFromInterventions` (arbitration + promotion gates), `owner-now-view getOwnerNowView`, budget `deriveNextAction`, AI copilot `runGovernedAiTask` (guardrail) — all properly gated/advisory-by-design.

---

## D. PROOF / COMPLETION

### GAP-PROOF-CORE — proof FSM single-gate invariant — **CLOSED (verified)**
- `completeTask` (`task-completion.service.ts:134`) is the **sole** runtime caller of `applyTaskTransition`; gates on `evaluateProofClearance` (ACCEPTED ∧ non-duplicate ∧ fresh); `APPROVED_COMPLETE` has no second writer; SYSTEM/AI cannot reach ACCEPTED; `reviewProof` throws on self-review and on duplicate-at-ACCEPTED; regression-locked by `completion-bypass-regression.test.ts`. **No live proof bypass found.**

### GAP-PROOF-01 — `approveOutcomeVerification` lacks recorder-vs-verifier SoD — **OPEN (MEDIUM)**
- **File:** `src/services/outcome/verification-approval.service.ts:22-99`; route `decisions/[decisionId]/verify/route.ts:51` (admin `verify_outcome`).
- **Issue:** the only path to `verificationStatus="verified"`; admin-gated + reason required, but does **not** assert the verifying admin ≠ the actor who recorded the outcome → a privileged actor can verify their own outcome. **Blocks validation:** NO (admin-gated).

### GAP-PROOF-02 — `markSuccess`/`markFailure` ungated terminal-positive writers — **OPEN (LOW, dead code)**
- **File:** `src/services/execution/execution-service.ts:76-166`.
- **Issue:** set `executionStatus="success"`+`completedAt`+self-supplied outcome with no proof/SoD/authorization; **no route or service calls them** (grep: only `__ignored_tests__`). Delete or gate before any wiring. **Blocks validation:** NO.

### GAP-PROOF-03 — OperatorItem decision outcome on a separate FSM — **OPEN (MEDIUM, by-design mitigated)**
- **File:** `src/services/decisions/decision-lifecycle.service.ts` (`recordDecisionOutcome:313`, `closeDecision:429`).
- **Issue:** a decision reaches OUTCOME_RECORDED/CLOSED with self-supplied `actualOutcomeValue`, outside the proof FSM. **Mitigant:** `outcome/verification.ts:150` forces `verificationStatus=unverified` (or `disputed`) — self-set `verified` impossible. Parallel governance track. **Blocks validation:** PARTIAL.

### GAP-PROOF-04 — owner-domain actions accept self-attested evidence — **OPEN (LOW, by-design)**
- **Files:** `owner-{finance,…}/action.service.ts` (completion needs only notes + evidence array from the same actor).
- **Issue:** weaker bar than the proof FSM (no reviewer/SoD); intentional — separate entity from DelegatedTask; `enforceOwnerActionGates` is a *safety* gate, not a proof/authenticity gate. Audited. **Blocks validation:** NO (but "owner action completed" ≠ proof-validated work).

---

## E. UI / API MISMATCH

### GAP-UI-01 — legacy decision page renders governance controls over MOCK data — **OPEN (CRITICAL)**
- **File:** `src/app/decisions/[decisionId]/page.tsx:16-85`.
- **Issue (verified):** `fetchDecisionDetail()` returns hardcoded mock ("Approve $5M investment", status pending), `fetchAuditTrail()` returns `[]`, yet renders the real `DecisionActionPanel` with Approve/Reject/Override. A fake-implementation governed surface (violates CLAUDE.md). **Blocks validation:** YES (for decision-approval governance via this page).

### GAP-UI-02 — `DecisionActionPanel` omits the route-required `workspaceId` — **OPEN (HIGH)**
- **File:** `src/components/decisions/DecisionActionPanel.tsx:36-86`; route `decisions/[decisionId]/route.ts:38` requires `?workspaceId`.
- **Issue:** every approve/reject/override fails with a generic "Workspace ID required"; real reason hidden. **Blocks validation:** YES (this stack).

### GAP-UI-03 — outcome buttons POST to non-existent routes — **OPEN (HIGH)**
- **File:** `src/app/dashboard/decision/[id]/DecisionDetailView.tsx:218,259` POST `/api/decisions/{id}/success` and `/failure`.
- **Issue (verified):** those route dirs do not exist (real ones: `record-outcome`, `fail`). Outcome recording — the behavioral-validation feedback loop — silently 404s. **Blocks validation:** YES.

### GAP-UI-04 — override reason stripped by route schema — **OPEN (MEDIUM)**
- **File:** `DecisionActionPanel.tsx:52-70` / `DecisionDetailView.tsx:127-168`; route Zod `{status, reason?}` discards `override_reason`/`override_approved_at`.
- **Issue:** an override becomes a plain approve with no captured justification; client-supplied timestamp ignored; override-from-blocked also non-functional. **Blocks validation:** PARTIAL.

### UI that is healthy (not gaps)
Owner command center `owner/page.tsx` (surfaces 409 gate/proof blocks, approvals-avoided, reassessments-due; secured owner routes; no route drift) and owner budget page — honest. No client-only role gating anywhere; no UI calls `/api/public/*`.

---

## F. DB / MODEL / MIGRATION

### GAP-DB-01 — ~28-model schema/migration drift (owner diagnosis/decision/action/harm lifecycle) — **OPEN (BLOCKER)**
- **File:** `prisma/schema.prisma` ~3494–4231.
- **Issue (verified):** models incl. `OwnerRecommendation`(`owner_recommendations`), `OwnerDecision`(`owner_decisions`), `OwnerAction`(`owner_actions`), `OwnerHarmEvent`(`owner_harm_events`) + ~24 siblings are declared in schema but have **zero `CREATE TABLE` in any of the 93 migrations** and **zero Prisma-accessor references in code** (the `.ownerDecision` code hits are plain object properties, not `db.ownerDecision`). 167 CREATE TABLE vs 193 models. The generated client types these tables; the deployed DB lacks them.
- **Risk:** `migrate deploy` leaves DB and schema disagreeing; `migrate dev` will emit a large diff; any code touching these models fails at runtime ("relation does not exist"). The spec's canonical owner recommendation→decision→action→harm→learning lifecycle is **declared but not realized**. **Note:** the *proven* owner spine (gate/proof/do-not-repeat/self-eval/compliance/control-center) uses a **separate, migrated** table set and is unaffected. **Blocks validation:** YES (this lifecycle cannot be exercised).

### GAP-DB-02 — unsafe `onDelete: Cascade` on governed records (latent) — **OPEN (HIGH, not reachable)**
- **File:** `prisma/schema.prisma` (101 cascade relations; `OwnerBusiness`/`ClientAccount` as cascade roots over `*Snapshot`/`*Finding`/`*Action`/`*Verification`).
- **Issue (verified):** deleting one `OwnerBusiness` would hard-delete its entire governed diagnostic corpus with no audit/preservation — violates "no destructive deletes for governed records." **Calibration:** there is **no runtime delete path** (`ownerBusiness.delete` appears only in generated-client docs). So the risk is latent (future/admin/test delete), not currently reachable. **Blocks validation:** NO today; YES for any governed-retention guarantee.

### GAP-DB-03 — duplicate / collapsed entity concepts — **OPEN (HIGH)**
- **Issue:** Recommendation ×3 (`Recommendation` live, `RecommendationLegacy` `@@ignore`, `OwnerRecommendation` dead/un-migrated); Action across `Action` (legacy), dead `OwnerAction`, 8 per-module `Owner*Action` + `RecoveryAction`/`OwnerBudgetAction`. Ambiguity over the authoritative entity. **Blocks validation:** PARTIAL.

### GAP-DB-04 — additional orphaned models — **OPEN (MEDIUM)**
- **Issue:** `AIProposalSandbox`, `CalibrationRecord`, `Entity`, `EntityLink`, `FinancialBaseline`, `InterventionState`, `OverrideRecord`, `RecommendationExpiryPolicy`, `WebhookDelivery`, `AggregateLock`, `ExternalImportTemplate/FieldMapping/ConnectionConsent` — zero non-generated references. `InterventionState` orphaned is notable (one of the four mandated dimensions). **Blocks validation:** PARTIAL.

### GAP-DB-05 — `Engagement` index gap / `migration_lock.toml` absent — **OPEN (LOW/INFO)**
- `Engagement` lacks a `workspaceId` index (see GAP-ISO-02); `prisma/migrations/migration_lock.toml` is absent (provider not pinned — possible migrate friction). Migrations are otherwise **additive and ordered** (no `DROP TABLE`/`DROP COLUMN`; only 2 forward-safe ALTERs; merge sequence clean). **Blocks validation:** NO.

---

## G. CI / TEST / BROWSER

### GAP-CI-01 — main-gate CI cannot provision a runner — **OPEN (HIGH, CI_INFRA_ONLY)**
- **Evidence:** runs `28334628190` (merge `227b034`) and `28334829907` (docs `ab95175`) both *failure* with `runner_id:0`, ~1-3s, **zero steps executed**. A docs-only commit aborting identically proves the code is not the cause — GitHub Actions runner unavailability. Pre-merge code is green on both parents (`5385d26`, `7a9161b`). **A fully-green post-merge CI has not been observed.** **Blocks validation:** YES until a clean run lands.

### GAP-CI-02 — browser/Playwright not in the main CI gate — **OPEN (MEDIUM, NEEDS_E2E)**
- **Evidence:** `ci.yml` has 0 Playwright references; only `lane-b-db-test.yml` mentions it. 6 specs in `tests/browser/`. Owner flow is not browser-proven in the blocking lane. **Blocks validation:** the browser layer specifically.

### GAP-CI-03 — quarantined test debt — **OPEN (MEDIUM)**
- **Evidence:** `.claude/test-quarantine.json` — 23 files / 52 failing tests run non-blocking (mostly runtime-proof HTTP tests needing a live server; pre-existing on main per `7634ccf8`). Tracked under FULL_SUITE_TEST_DEBT_RECOVERY. **Blocks validation:** NO (acknowledged debt), but reduces real CI coverage.

### GAP-CI-04 — DI-only coverage for some critical behaviors — **OPEN (MEDIUM, NEEDS_E2E)**
- The owner loop is proven at service + `[db]` layer; budget bypass (GAP-BUDGET-01/02) and decision UI (GAP-UI-01/02/03) have **no test asserting the gate/route contract**, which is why the bypasses survived. **Blocks validation:** PARTIAL.

---

## H. COMPOSITION FAILURES (system-as-product)

1. **Budget contradicts Jarvis gates** — GAP-BUDGET-01/02: budget completes actions / records spend that the owner-action gate would block. **Composition FAIL.**
2. **Diagnosis emits advice outside arbitration** — GAP-REC-01: ungated advice generation; action still gated. **Partial FAIL.**
3. **Decision-outcome UI broken** — GAP-UI-03: outcome recording 404s, corrupting the behavioral-validation feedback loop. **Composition FAIL.**
4. **Proof FSM not bypassable by the verify module** — holds; but outcome-verification SoD weak (GAP-PROOF-01). **Mostly PASS.**
5. **Cross-workspace** — owner-mode column-scoped (safe); legacy consulting join-scoped (discipline-dependent, GAP-ISO-01/02). **Partial.**
6. **Manager/operator → owner-only state** — no client-only role gating found; server-enforced. **PASS.**
7. **Public/demo exposure** — no UI calls public/demo routes; internal demo routes diagnostic-key-gated. **PASS.**

---

## Remaining Jarvis blockers (must close before behavioral validation)
1. GAP-BUDGET-01 (CRITICAL) — wire the owner-action gate into budget action completion + register it.
2. GAP-BUDGET-02 (HIGH) — enforce the spend governance HOLD/REQUIRE_OWNER_APPROVAL decision.
3. GAP-UI-01/02/03 (CRITICAL/HIGH) — fix or retire the legacy decision UI + the 404 outcome routes (the feedback loop).
4. GAP-DB-01 (BLOCKER) — migrate or remove the 28-model owner diagnosis/decision/action/harm block (schema drift).
5. GAP-REC-01 (HIGH) — route `/api/diagnosis` advice through arbitration (or mark advisory-only + non-persistent).
6. GAP-CI-01 (HIGH) — obtain one green post-merge CI run (currently runner-starved).
7. GAP-ISO-03 (MEDIUM) — workspace-guard + audit `completeTraining`.
