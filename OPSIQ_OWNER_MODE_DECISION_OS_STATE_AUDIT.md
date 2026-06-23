# OPSIQ OWNER MODE DECISION OS — STATE AUDIT (Phase 0)

Last updated: 2026-06-23
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Commit at audit start: `35085c7` (Merge — Mission 4 NIST AI RMF hardening)
Working tree at audit start: clean
Audit type: **Phase 0 — Repo Truth + Owner Mode State Audit (DOC_ONLY, no feature code)**
Execution prompt: *OpsIQ Owner Mode Decision Operating System — Strict Minimum-Code Continuous Build*

> Controlling rule for this audit: **Do not assume repo state.** Every claim below was derived by inspecting `prisma/schema.prisma`, `src/`, `tests/`, `.github/workflows/`, and `package.json` directly. No prior chat claims were relied on.

---

## 0. HEADLINE FINDING

OpsIQ is **not** a greenfield repo. It is a large, mature codebase that **already implements the overwhelming majority of the Owner Mode Decision OS** described by the execution prompt, under a previous execution plan (`execution.md` phases 0–28, tracked in the prior `CURRENT_WORKFLOW_STATE.md`).

Therefore the dominant risk for this execution is **NOT under-building** — it is:

1. **Duplicate parallel systems** (creating `OwnerDecisionV2`, a second portfolio engine, a second dashboard, etc.) — explicitly forbidden by §6 and §1 of the prompt.
2. **Overbuilding** net-new abstractions for capabilities that already exist (forbidden by §1.5).
3. **Misclassifying existing code as "implemented"** without re-running its tests (forbidden by §5 / §14 Definition of Real Implementation).

The correct posture for every subsequent slice is **reuse-and-verify**, not build. New code is justified only where a concrete gap is proven (see §7 Gap Register).

---

## 1. ENVIRONMENT / BASELINE EXECUTION STATUS

| Item | Status | Evidence |
|---|---|---|
| Git branch correct | ✅ `claude/opsiq-owner-mode-decision-os-3tgwkm` | `git branch --show-current` |
| Working tree clean at start | ✅ | `git status` |
| `node_modules` present in fresh container | ❌ **MISSING (0 packages)** at audit start | `ls node_modules` → 0 |
| Dependency install | ⏳ Run during Phase 0 (`npm install`) | required before ANY test can run |
| `npx prisma validate` (cold) | ⚠️ Inconclusive cold (npm noise only) — must re-run after install | — |
| `npx vitest` (cold) | ❌ Fails cold: `MODULE_NOT_FOUND` for vite — caused by absent `node_modules`, not a code defect | — |

**Baseline blocker (documented, not hidden):** The fresh remote container ships **without dependencies installed**. No test suite (vitest), Prisma generate, or typecheck can execute until `npm install` completes. This is an environment/setup blocker, **not** a code regression. Per §1.20 and §11, baseline test results must be captured *after* install; until then, no "baseline pass" may be claimed. See `CURRENT_WORKFLOW_STATE.md` for the live baseline-command checklist.

**Toolchain (from `package.json`):**
- Next.js `16.2.3` (App Router), React `19.2.4`, TypeScript, Zod, Prisma `^7.7.0` + PostgreSQL, Vitest `^4.1.4`.
- Test scripts: `test` (vitest run), `test:all` (`TEST_WITH_DB=true`), `test:db` (`[db]` named tests), `test:ci`, `test:owner-real-world-smb`, `test:owner-real-world-simulation`.
- DB tests are gated by `TEST_WITH_DB=true` via `src/__tests__/test-helpers/db-test-gate.ts` and require PostgreSQL.

---

## 2. SCHEMA TRUTH (prisma/schema.prisma — 4234 lines, ~87 models, 67 migrations)

The schema already contains a dedicated **`Owner*` model family** plus a legacy engagement/consulting model family. Mapping each Decision-OS concept to existing models:

| Decision-OS concept | Existing model(s) | Classification |
|---|---|---|
| Workspace / tenancy | `Workspace`, `ClientAccount`, `WorkspaceMembership` | PRESENT |
| Business identity | `OwnerBusiness` (`workspaceId`, `businessType`, `operatingModel`, `b2cSupported`, `b2bSupported`) | PRESENT |
| Business archetype | `OwnerBusiness.businessType` (String) + KPI profiles (see §5). **No archetype enum.** | PARTIAL |
| Diagnosis | `OwnerDiagnosisEvidence` (`diagnosisStatus`, `confidenceScore`, `evidenceFor`, `evidenceAgainst`, `missingData`, `assumptions`, `whatWouldChangeThis`, `supersededById`); legacy `Finding` | PRESENT |
| Recommendation | `OwnerRecommendation` (`confidenceScore`, `confidenceReason`, `riskLevel`, `targetMetricName`, `baselineValue`, `targetValue`, `measurementWindowDays`, + `evidence`/`assumptions`/`constraints` relations); legacy `Recommendation` | PRESENT |
| Decision object | `OwnerDecision` (`decisionStatus` **free String**, default `needs_more_data`; `approvedBy`, `deferredUntil`) + `OwnerDecisionRights` + `OwnerDecisionMemory` | PARTIAL (status not enum-backed; states differ from prompt canon) |
| Evidence bundle / snapshot | `EvidenceBundle` + `EvidenceItem` (with `validationStatus`, `sourceType`, `visibility`, `captureMethod`); `OwnerEvidenceRecord`; `OwnerRecommendationEvidence` | PRESENT |
| Action / execution | `OwnerAction`, `OwnerActionExecutionLog` (`proofText`, `proofAttachmentUrl`, `executionComplianceScore`), `OwnerBlocker`, `RecoveryAction`, legacy `Action` | PRESENT |
| Outcome verification | `OwnerActionOutcome` (`outcomeStatus`, before/after values, `evidenceQuality`, `externalEventFlag`), `RecoveryVerification`, `OwnerCausalAttribution` (`attributionClass`) | PRESENT |
| Learning eligibility | `OwnerLearningEligibilityReview` (rich gate flags: `actionWasExecuted`, `hasVerifiedEvidence`, `adjudicationCompleted`, `causalAttributionCompleted`, `isTerminalRejection`), `ControlledLearningCandidate` (+ privacy/consent/regression/rollback/harm relations) | PRESENT |
| Audit trail | `AuditEvent` (hash-chained via `previousHash`), `CanonicalEvent` (event-sourcing) | PRESENT |
| Snapshots (data quality / financial / unit econ) | `OwnerFinancialSnapshot`, `OwnerCashflowSnapshot`, `OwnerSalesSnapshot`, `OwnerOperationsSnapshot`, `OwnerSopSnapshot`, `OwnerMarketingSnapshot`, `OwnerStrategySnapshot`, `OwnerMetricSnapshot` — all carry `dataConfidenceScore` + `missingCriticalData` (Json) | PRESENT |
| Confidence cap fields | `confidenceScore`/`confidenceReason` across owner models; `ThresholdConfig` / `confidenceMinThreshold` | PRESENT |
| Source classification | `evidence_source_type` enum (`PERSON`/`DOCUMENT`/`SYSTEM`/`REPORT`); `OwnerEvidenceRecord.sourceType`; `OwnerDataProvenanceRecord` (`freshness`). **Prompt's canon (`VERIFIED_RECORD`/`OWNER_REPORTED`/…) not a single enum.** | PARTIAL |
| Role model | `User`, `UserRoleAssignment`, `WorkspaceMembership`, `EngagementMembership`, `PrivateModeAccess` (`OWNER`/`CONSULTANT`/`ANALYST`), `OwnerDecisionRights` | PRESENT |

---

## 3. SERVICES / POLICIES / ROUTES TRUTH (src/)

### Services (`src/services/`, 150+ files grouped by concept)
- **Diagnosis:** `diagnosis.ts`, `diagnostic-core/{archetype-engine,root-cause-engine,bottleneck-engine,maturity-engine}.ts`, plus per-domain `owner-*/diagnosis.service.ts` (cashflow, finance, marketing, operations, sales, sop, strategy).
- **Recommendation:** `recommendation.ts`, `recommendation/{engine,attribution}.ts`, `governance/recommendation-{debt,expiry}.ts`, `decisions/priority-engine.ts` (constraint-aware ranking), `decisions/{credibility-engine,roi-validator}.ts`.
- **Decision:** `decision/{engine,status-management,transaction-layer,decision-timeline}.ts`, `decision-confidence/`, `decision-evidence/`, `decision-validation/`, `decision-control/`, `decision-core/{best-path-selector,constraint-enforcer,audit-output-generator}.ts`, `decisions/decision-lifecycle.service.ts`.
- **Execution:** `execution/`, `execution-core/{action-fsm,execution-orchestrator,capacity-controller,failure-classifier,rollback-validator,…}.ts`, `execution-drift/`, `action.ts`, `action-lifecycle.ts`.
- **Outcome:** `outcome/{outcome.service,verification,verification-approval.service}.ts`, `outcome-core/{confidence-updater,impact-tracker,variance-calculator,…}.ts`, `operator/outcome-classifier.ts`.
- **Learning:** 12 `controlled-learning-*.service.ts` files (admission, candidate, attribution, regression, consent, harm, privacy, rejection, retention, review, rollback, rollout) + `learning/store.ts`.
- **Evidence / data quality:** `evidence.ts`, `domain/business-facts/data-quality.ts` (pure `scoreDataQuality()`).
- **Financial:** `financial-constraints.ts`, `financial/financial-mapping.service.ts`, `consulting-engine/survival-prioritization.ts` (`SURVIVAL_RUNWAY_MONTHS=3`), `owner-finance/` + `owner-cashflow/`.
- **Audit:** `audit-trail.ts`, `audit/{audit-log,log}.ts`, `audit-event-hash-chain-validator.ts`.

### Policies (`src/policies/`)
- `capability-check.ts` — centralized capability/RBAC (`hasCapability`, `requireCapability`, `hasInternalAccess`, internal-only capability denylist). Roles in `src/domain/constants/roles.ts` (owner/operator/analyst tiers).
- `state-transition.ts` — FSMs for stage / action / evidence / decision / recommendation / risk transitions.
- Workspace isolation: `src/services/workspace/context.ts` (`requireWorkspaceContext`, `validateWorkspaceAccess`), `src/middleware/workspace-enforcement.ts`, `src/lib/prisma-workspace-enforcement.ts`.

### API routes (`src/app/api/`, 280+ route.ts)
- **Dashboard:** `owner/dashboard`, `owner/home`, `owner/command-center`, `owner/config`, `operator/myday`, `control/today`, `intelligence/summary`, `observability/summary`.
- **Diagnosis:** `diagnosis/{archetype,bottleneck,maturity,root-cause}`, `owner/<domain>/diagnoses/[cycleId]/{,actions,findings}`.
- **Recommendation/Decision:** `recommendations/…`, `decisions/{create,intake,list,[id]/{accept,reject,execute,evaluate,fail,close,verify}}`, `scenario`.
- **Action/execution:** `actions/[id]/{start,complete,impact-delta}`, `owner/<domain>/actions/[id]/{,verify}`, `execute`.
- **Outcome:** `outcomes`, `decisions/[id]/record-outcome`, `value/*`, `business-impact/*`.
- **Learning (owner-private):** 15 `owner/learning-*` routes (admissions, candidates, attribution-reviews, consent, harm-events, privacy, regression-results, rejections, retention, reviews, rollback-events, rollout-flags).
- **Evidence:** `evidence/*`, `evidence-bundles/*`, `findings/*`.
- **Trust/audit:** `audit/*`, `owner/trust/{audit-trail,cycles,explanations}`.

### Central config / status canon
- Thresholds: `src/services/thresholds/threshold-service.ts` (`DEFAULT_THRESHOLDS`, `getWorkspaceThresholds`) + per-domain `src/domain/owner-*/thresholds.ts`.
- Canonical status enums: `src/domain/constants/statuses.ts` (action/evidence/approval/recommendation/intervention-mode/intervention-phase/business-condition, etc.). Transition maps in `policies/state-transition.ts`.

---

## 4. UI / DASHBOARD TRUTH

Owner dashboard already exists: `src/ui/owner-dashboard.tsx`, owner app pages under `src/app/(authenticated)/owner/{page,home,execution,recovery,finance,sales,operations,marketing,strategy,cashflow}`. Supporting UI: `alerts-panel.tsx`, `recommendations-manager.tsx`, `recommendations-view.tsx`, `findings-manager.tsx`, `execution-certainty-card.tsx`, `engagement-workspace.tsx`. Health system in `src/runtime/health/health-system.ts`.

Mapping to the prompt's required panels: Alert Bar (PRESENT), Health Score (PRESENT), Root Cause (PRESENT via engine+UI), Decision Queue (PARTIAL — recommendations manager), Scenario Simulator (engine PRESENT, panel PARTIAL), Execution Board (PRESENT), Outcome Ledger (PARTIAL), Missing-Data Panel (PRESENT via intake validation), Decision Trace Drawer (PARTIAL via `lib/canonical-execution-trace.ts`).

---

## 5. ARCHETYPE TRUTH

- Engine: `src/services/diagnostic-core/archetype-engine.ts`; domain `src/domain/diagnostic/archetype.ts`; route `api/diagnosis/archetype`.
- KPI profiles: `src/domain/business-facts/kpi-profiles.ts` — includes **laundry/dry-cleaning** (kg/pieces/day, chemical cost/kg, delivery cost ratio, repeat-customer rate, machine utilization) and local-service/housekeeping-style profiles, plus restaurant, SaaS, agency, e-commerce, manufacturing, retail, franchise.
- Note: archetype engine test currently lives under `src/__ignored_tests__/…/archetype-engine.test.ts` (ignored) — re-activation needed before claiming archetype slice TESTED.

---

## 6. TESTS / CI TRUTH

- ~529 `*.test.ts(x)` under `src/`, ~21 under `tests/`. Owner-mode tests concentrated in `src/__tests__/domain/owner-mode/` (~33 files: `owner-decision`, `outcome-tracking`, `outcome-validation`, `decision-memory`, `controlled-learning*`, `recommendation-verification`, `action-tracking`, `harm-tracking`, `evidence-capture/verification`, `full-loop-validation`) and per-domain `src/__tests__/owner-*`.
- `tests/owner-mode/` holds `holdout`, `real-world-simulation`, `real-world-smb-cases`.
- Vitest config: `vitest.config.ts` + `vitest.setup.ts` + `vitest-global-setup.ts`. DB tests gated by `TEST_WITH_DB=true` (PostgreSQL 16, db `opsiq_test`).
- CI: `.github/workflows/` (~60 files) incl. `ci.yml` (governance strict scan, typecheck, prisma validate, migrate, build, test, wrapped-handlers ratchet), `db-verification.yml`, `owner-mode-holdout.yml`, `owner-real-world-*.yml`, smoke workflows.
- **Some tests are quarantined** under `src/__ignored_tests__/` (e.g. `workspace-isolation-enforcement.test.ts`, archetype-engine test). These must be treated as NOT covering live behavior until reactivated.

### TODO/STUB markers (low, mostly optional)
- `src/services/decision/execution-stub.ts` (named placeholder), `snapshot-engine.ts` (snapshot cleanup/replay TODO), `intelligence/pattern-engine.ts` (LearningRecord model TODO), `decisions/credibility-engine.ts` (historical accuracy weight TODO), 3 engagement API routes with "implement persistent history when schema added" TODOs (constraint-checks, experiments, escalation-checks). Benchmark `round2-case-schema.ts` TODOs are intentional authoring placeholders.

---

## 7. GAP REGISTER (the only places net-new code may be justified)

Classification key: PRESENT_AND_TESTED / PRESENT_NOT_TESTED / PARTIAL / MISSING / BROKEN / UNKNOWN. Because dependencies were uninstalled at audit start, **all "tested" claims are UNKNOWN until the baseline suite runs post-install** — see §1 blocker.

| # | Concept | Classification (pre-baseline) | Gap / risk | Minimum-code disposition |
|---|---|---|---|---|
| G1 | Dependency install + baseline test run | BROKEN (env) | No deps in fresh container; cannot prove anything yet | Install deps; run targeted + owner-mode baseline; record results. **No code.** |
| G2 | Pure scoring helpers `calculateFinancialSurvival`, `calculateUnitEconomics`, `calculateAttributionConfidence`, `checkLearningEligibility` | PARTIAL | Logic exists embedded in services (survival-prioritization, growth/unit-economics route, controlled-learning-attribution/admission) but **not as named, independently-tested pure functions** as Phase 1 requires | Extract thin pure wrappers ONLY if a caller+test needs them; otherwise document existing equivalents. Avoid duplicate engines (§1.5). |
| G3 | `OwnerDecision.decisionStatus` is free String; states (`accepted/deferred/modified/rejected/needs_more_data`) differ from prompt canon (`PENDING_OWNER_DECISION/APPROVED/REJECTED/NEEDS_MORE_EVIDENCE/MARKED_INFEASIBLE/CONVERTED_TO_EXPERIMENT/OWNER_OVERRIDE/SUPERSEDED`) | PARTIAL | Risk of duplicate status systems | Prefer a **mapping layer** in `domain/constants` over a breaking enum migration (§1.16, §9). |
| G4 | Source classification canon (`VERIFIED_RECORD` etc.) | PARTIAL | Multiple `sourceType` vocabularies; no single canonical map | Add canonical map + mapping helper only when a consumer needs it. |
| G5 | Quarantined tests (`src/__ignored_tests__/`) incl. workspace isolation + archetype | PARTIAL/UNKNOWN | Security/archetype behavior may be under-proven | Reactivate + run before claiming those slices TESTED (§13 security matrix). |
| G6 | Central threshold file | PRESENT but split (`threshold-service.ts` + per-domain `thresholds.ts`) | Magic numbers like `SURVIVAL_RUNWAY_MONTHS` live outside it | Consolidate references lazily; do not create a 3rd config system (§35). |
| G7 | Dashboard panels Decision Queue / Scenario Simulator / Outcome Ledger / Trace Drawer | PARTIAL | Backend contracts largely exist; UI panels partial | Defer per §1.7 until backend contract proven; reuse existing components. |

**No MISSING core capability was found.** Every Decision-OS layer has a PRESENT or PARTIAL implementation; the work is verification, mapping, and targeted gap-closure — not construction.

---

## 8. PUBLIC SAAS SCOPE TOUCHED

**None.** This audit created only two Markdown docs. No billing, pricing, marketing, public-onboarding, Stripe/Lemon Squeezy, or public-analytics file was read-for-modification or changed. Public SaaS remains frozen (consistent with the prior `CURRENT_WORKFLOW_STATE.md` scope freeze).

---

## 9. WHAT IS UNSAFE TO TOUCH

- `prisma/schema.prisma` enum semantics + the 67 applied migrations (§9 migration discipline) — never edit applied migrations; never repurpose existing enum values. Prefer additive migrations / mapping layers.
- `policies/capability-check.ts`, `policies/state-transition.ts`, `middleware/workspace-enforcement.ts`, `lib/prisma-workspace-enforcement.ts` — security-critical; changes require the full §13 negative-test matrix.
- `AuditEvent` hash chain (`previousHash`) and `CanonicalEvent` ordering — corrupting these breaks tamper-evidence.
- The `Owner*` model family generally — extend, never fork into `*V2`.

---

## 10. MINIMUM-CODE IMPLEMENTATION PLAN (sliced)

Per the prompt's phase order, adapted to a brownfield repo where most phases are already PRESENT. Each slice is **verify-first**:

1. **Phase 0.5 — Baseline Regression Harness** (NEXT): after deps install, map critical owner flows → existing tests; run targeted owner-mode suites (`src/__tests__/domain/owner-mode/full-loop-validation`, `owner-decision`, `outcome-tracking`, `controlled-learning`) + `prisma validate`/`generate`; record true pass/fail; list quarantined tests. Produce the regression command checklist. No feature code.
2. **Phase 1 — Status/Threshold/Helper canon:** confirm `statuses.ts` + `threshold-service.ts`; add canonical decision-status + source-classification **mapping layer** (G3/G4) only with caller+test; extract named pure helpers (G2) only where a phase needs them.
3. **Phases 2–11:** for each (data-quality, survival/unit-econ, decision/evidence, portfolio/feasibility, scenario, experiment, execution, outcome/attribution, learning gate, governance), **prove the existing implementation with tests** and close only the specific gap rows in §7; do not rebuild.
4. **Phases 12–12.5:** dashboard panel gaps (G7) + trust/explainability audit, backend-contract-first.
5. **Phase 13:** end-to-end laundry vertical slice using existing KPI profile.
6. **Phases 14–16:** housekeeping archetype, benchmark harness, reliability report.

**Recommended next slice: Phase 0.5 — Baseline Regression Harness** (install deps, run baseline, document true state). No feature implementation until baseline truth is captured.

---

## 11. LAYER CLASSIFICATION SUMMARY

| Layer | Classification (pre-baseline) |
|---|---|
| Schema (owner models) | PRESENT_NOT_TESTED (tests exist but unrun in this container) |
| Diagnosis services | PRESENT_NOT_TESTED |
| Recommendation services | PRESENT_NOT_TESTED |
| Decision object + lifecycle | PARTIAL (status canon mapping gap) |
| Evidence bundle | PRESENT_NOT_TESTED |
| Action / execution | PRESENT_NOT_TESTED |
| Outcome / attribution | PRESENT_NOT_TESTED |
| Learning eligibility | PRESENT_NOT_TESTED |
| Audit / governance | PRESENT_NOT_TESTED |
| Policies (RBAC, workspace, FSM) | PRESENT_NOT_TESTED (some isolation tests quarantined → PARTIAL) |
| Thresholds / status canon | PARTIAL (split config; decision-status not enum) |
| Pure scoring helpers | PARTIAL (embedded, not all standalone) |
| Dashboard UI | PARTIAL |
| Archetype framework | PRESENT (archetype test quarantined → PARTIAL) |
| Baseline test harness runnable | BROKEN (deps not installed) → fix in Phase 0.5 |

Overall Phase 0 classification: **DOC_ONLY_COMPLETE**.
