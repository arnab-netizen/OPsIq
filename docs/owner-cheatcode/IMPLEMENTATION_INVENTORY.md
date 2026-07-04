# OpsIQ Owner Cheat-Code — Implementation Inventory (Phase 0)

Status: **INVENTORIED_ONLY** (Phase 0 exit-gate artifact).
This file is required by `execution.md` Phase 0 before any implementation begins.
It records what already exists, what must be reused, what must not be duplicated,
and where the genuine gaps are against the 23-concept Full Owner Wealth Loop.

All findings below are evidence-backed with concrete file paths per the Bulletproof
Amendment (Rule A: "No evidence = not complete").

---

## 1. Baseline verification

| Item | Value |
|---|---|
| Branch | `claude/owner-cheatcode-full-implementation` |
| Base | branched from `claude/opsiq-cheatcode-file-org-yispoe` (which is `main` + docs reorg) |
| HEAD at inventory | `a3947d9` (docs: organize owner cheat-code control files) |
| Working tree | clean at start |
| Control files | `execution.md` at repo root; 12 support files under `docs/owner-cheatcode/` (verified present) |

### Toolchain

- Stack: **Next.js 16 (App Router)**, **React 19**, **Prisma 7 + PostgreSQL**, **Zod 4**, **Vitest 4**, **Playwright**, TypeScript.
- `node_modules` installed; `prisma generate` output at `src/generated/prisma/`.
- Baseline test signal: `npx vitest run src/__tests__/owner-mode/pilot-readiness/command-center-priorities.test.ts` → **6/6 passed** (non-DB path healthy).
- DB-tagged (`[db]`) and `runtime-proof`/`phase-*` tests require `TEST_WITH_DB=true` + Postgres; skipped locally, run in CI (see §5).

---

## 2. Repository shape (source)

- `src/domain/` — 70+ domain modules (pure logic), incl. `owner-*` per-domain packs, `business-facts`, `owner-budget`, `execution`, `domain-training`, `collective-training`, `consulting-engine` inputs, `survival`, `benchmark`, `remote-operations`.
- `src/services/` — 100+ service modules (runtime/DB behavior), incl. `owner-*`, `execution`, `outcome`, `outcome-core`, `business-condition`, `owner-budget`, `consulting-engine`, `recommendation`, `best-path-engine`.
- `src/engines/` — `DiagnosisOrchestrator`, `FinancialEngine`, `DataValidationEngine`.
- `src/lib/` — canonical auth/enforcement (`canonical-route-enforcement.ts`), workspace isolation, idempotency, optimistic locking.
- `src/app/` — ~290 API `route.ts` handlers + App-Router pages (owner-mode is the largest surface).
- `prisma/schema.prisma` — **168 models**, 99 migrations, `workspaceId` isolation on ~318 model fields.

---

## 3. Database models (reuse targets — do NOT duplicate)

Source: `prisma/schema.prisma` (single file, 168 models, provider `postgresql`).

- **Business state / intake:** `OwnerBusiness`, `OwnerDataIntake`, `OwnerInputRecord`, `OwnerInputQualityAssessment`, `OwnerMetricSnapshot`, `BusinessConditionProfile`, `Entity`/`EntityLink`.
- **Work / execution / delegation:** `WorkOrder`, `DelegatedTask`, `Action`, `OperatorItem`, `TaskStatusHistory`, `Escalation`.
- **Proof / evidence:** `ProofRequirement`, `Proof`, `Evidence`/`EvidenceItem`/`EvidenceBundle`, per-domain `*Verification`.
- **Outcomes / learning:** `OwnerActionOutcome`, `OwnerReassessmentEvent`, controlled-learning cluster (13 models), `BehavioralLearningArtifact`.
- **Finance / capital:** `FinancialBaseline`, `OwnerFinancialSnapshot`, `OwnerCashflowSnapshot`, `OwnerServiceEconomics`, `BudgetPeriod`/`BudgetLine`/`SpendEntry`/`BudgetAuthority`/`OwnerBudgetOverride`, `KPI`/`KPISnapshot`/`ThresholdConfig`.
- **Recommendations / diagnosis:** `Recommendation`, `RecommendationBusinessImpact`, `AIProposalSandbox`, `Finding`/`Risk`, `OwnerGuidanceSnapshot`, `DecisionSnapshot`/`OverrideRecord`/`InterventionState`.
- **Wisdom / benchmarks:** `CaseStudy`/`CaseBenchmarkResult`, `PublicDataset`, `OwnerArchetypeMetric`, `OwnerSopDocument`/`OwnerProcess`, `OwnerDoNotRepeatRule`, `OwnerApprovalMemory`.
- **Per-domain recovery cycle pattern** (repeated for finance, cashflow, sales, operations, sop, marketing, strategy, recovery): `Owner{Domain}Snapshot / Cycle / Finding / Action / Verification`.
- **Audit:** `AuditEvent` (hash-chained via `previousHash`, workspace-scoped).
- **Compliance/governance:** `OwnerComplianceItem`, `ApprovalRequest`, `PrivateModeAccess`.

Note: there is **no dedicated `Experiment` model** and **no dedicated "playbook" table** (wisdom is spread across CaseStudy/SOP/DoNotRepeat/ApprovalMemory/BehavioralLearningArtifact).

---

## 4. API routes & UI surfaces (reuse targets)

- **Canonical enforcement (mandatory for new routes):** `src/lib/canonical-route-enforcement.ts` → `withCanonicalEnforcement(handler, { requireCapabilities, requireWorkspace })`. Handler receives verified-only `CanonicalAuthContext` (`verifiedWorkspaceId`, `verifiedActorId`, `verifiedCapabilities`). Routes must **not** import auth libs directly. Legacy `auth-guard.ts`/`enforced-route.ts` exist but are "do not use in new code."
- **Owner-mode API** (`src/app/api/owner/**`) is the largest surface: `command-center`, `home`, `now-view`, `dashboard`, `control-center`, per-domain `finance/cashflow/marketing/operations/sales/sop/strategy/recovery/*`, `budget/*`, `portfolio/*`, `intake/*`, decisions/approvals/guardrails, learning-governance.
- **Command center (owner home):** UI `src/app/(authenticated)/owner/page.tsx` (route `/owner`) + API `src/app/api/owner/command-center/route.ts`; renders `PriorityCommandStrip` + `SupervisorSummary`.
- **Proof/evidence UI:** `/engagements/[id]/evidence`, `/evidence/[evidenceId]`, `/evidence/bundles`.
- Capability constants: `@/domain/constants/capabilities` (`CAPABILITIES.OWNER_VIEW`, …).

---

## 5. Tests & CI (reuse targets / evidence gates)

- **Vitest** config `vitest.config.ts` (jsdom, setup `vitest.setup.ts`, global `vitest-global-setup.ts`). Includes `src/**/*.test.ts(x)` + `tests/owner-mode/**`. Excludes DB/runtime-proof/phase tests unless `TEST_WITH_DB=true`.
- **Playwright** config `playwright.config.ts` (`tests/browser`, chromium, `baseURL :3001`).
- Test volume: `src/__tests__/` **787** tests (incl. `owner-mode/` 55, `scenarios/` 22, `behavioral-validation/`); `tests/owner-mode/` **21** harness tests (real-world-simulation, real-world-smb-cases, holdout).
- **Simulation harness:** `simulation_runner/run-case.ts` (blind case replay through `runConsultingEngine`), `simulation_runs/` result corpora (historical validation, adversarial probes, round_002 retrials).
- **CI primary gate `ci.yml`:** `governance:scan:strict` + `:auth` → `tsc --noEmit` → `prisma validate`/`migrate deploy`/`generate` → `next build` → `audit:wrapped-handlers:ratchet` → `vitest run --maxWorkers 1` (DB-backed) → lint/ratchet. 75 workflows total incl. per-module runtime-proof + DB verification.

---

## 6. Full Owner Wealth Loop — 23-concept mapping

Legend: **FOUND** = exists, reuse it. **PARTIAL** = exists in adjacent form, extend it (do not rebuild). **GAP** = genuinely missing in the required form; new code justified.

| # | Concept | Status | Existing anchor (reuse/extend) |
|---|---|---|---|
| 1 | Business State Model | PARTIAL | `src/domain/business-facts/contract.ts`, `intake-adapter.ts`; `src/services/owner-intake/intake.service.ts`; `src/domain/owner-mode/business-state-timeline.ts`; `src/services/owner-mode/owner-context-derivation.ts` |
| 2 | Business Model Quality Score | **DONE (Phase 2 slice 1)** | `src/domain/owner-strategy/wealth-path.ts` → `scoreBusinessModelQuality` (7 weighted structural dimensions, Rule-D disclosure). Tests: `src/__tests__/owner-strategy/wealth-path.test.ts`. Closes GAP-002. Runtime surface (slice 2): `services/owner-strategy/wealth-path.service.ts` + `GET /api/owner/wealth-path`. |
| 3 | Wealth Path Classifier | **DONE (Phase 2 slice 1)** | `src/domain/owner-strategy/wealth-path.ts` → `classifyWealthPath` (all 10 categories incl. owner-job/dead-end/trap). Tests as above. Closes GAP-001. Runtime surface (slice 2): `services/owner-strategy/wealth-path.service.ts` (`getWealthPath`) + `GET /api/owner/wealth-path` (OWNER_VIEW), `[db]` tests. |
| 4 | Risk-Adjusted Wealth Score | **DONE (Phase 3)** | `src/domain/owner-strategy/risk-adjusted-wealth.ts` → `scoreRiskAdjustedWealth` (evidence-weighted risk-adjusted score). Tests: `src/__tests__/owner-strategy/risk-adjusted-wealth.test.ts`. Closes GAP-003. |
| 5 | Opportunity Cost Review | **DONE (Phase 3)** | `src/domain/owner-strategy/risk-adjusted-wealth.ts` → `reviewOpportunityCost` (ranks proposed vs alternatives, names rejected). Distinct from `opportunity-decision.service.ts` (single-opportunity decision). Closes GAP-004. |
| 6 | Capital Allocation Engine | FOUND | `src/domain/owner-budget/capital-allocation.ts` (`rankCapitalAllocation`), `confidence-gate.ts` |
| 7 | Financial Governor | FOUND | `src/domain/owner-budget/spend-governance.ts` (`evaluateSpend`, `SpendDecisionType`), `budget-authority.ts`, `services/owner-budget/governance.service.ts` |
| 8 | Business Wisdom / Playbook Layer | **PARTIAL→ tiers DONE (Phase 5)** | Retrieval/workflow: `domain/domain-training/domains/*`, `execution/workflow-library.ts` (existing). A/B/C/D source tiers + anti-guru high-risk gate: `src/domain/owner-strategy/business-wisdom.ts` (`classifyWisdom`/`admitAdvice`, closes GAP-007). Retrieval→Work-Package conversion tracked under GAP-006 (Phase 7). |
| 9 | Diagnosis Engine | FOUND | `src/services/consulting-engine/diagnosis-engine.ts`, `domain/business-facts/diagnosis.ts` |
| 10 | Next Best Move Engine | FOUND | `src/domain/owner-guidance/next-best-step.ts`, `collective-training/priority-engine.ts` |
| 11 | Workload Execution Engine (levels 0–5) | **DONE (Phase 7)** | `src/domain/owner-strategy/work-package.ts` → `determineMaxTransferLevel` (LEVEL_0/1/2/5 active; 3/4 future). Closes GAP-005. |
| 12 | Work Package Generator | **DONE (Phase 7)** | `src/domain/owner-strategy/work-package.ts` → `generateWorkPackage` (20-field bundle + prepared artifacts + proof + owner-workload transfer). Closes GAP-006. Persists later via existing `services/execution/task-assignment.service.ts`. |
| 13 | Guided Action Runner | FOUND | `src/services/routes/guided-execution-handlers.ts`, `domain/owner-guidance/guidance-orchestrator.ts` |
| 14 | Proof Validation Engine | FOUND | `src/services/execution/proof.service.ts`, `verification-engine.ts` (self-review/wrong-user/duplicate/fake-completion) |
| 15 | Outcome Measurement Engine | FOUND | `src/domain/owner-mode/outcome-tracking.ts`, `services/outcome-core/*` |
| 16 | Causality-Aware Learning | FOUND | `src/domain/execution/outcome-causality.ts` (`assessCausality`, `assertCausalBeforeLearning`) |
| 17 | Owner Workload Transfer Score | PARTIAL | `services/owner-operations/owner-workload-snapshot.service.ts` (snapshots) — no transfer-score metric. |
| 18 | Owner Discipline Guardrail | PARTIAL | `owner-budget/budget-authority.ts`, `services/owner-mode/owner-action-gate.service.ts`, `gate-enforcement-policy.ts` — no unified behavioral detector. |
| 19 | Scale Readiness Gate | FOUND | `src/domain/execution/scale-readiness.ts` (`assessScaleReadiness`, `NotScaleReadyError`) |
| 20 | Domain Hardening Layer | FOUND | `src/domain/domain-training/`, `collective-training/`, `owner-{finance,sales,marketing,operations,sop,strategy}` |
| 21 | Startup Validation + Launch Workbench | **GAP** | Entirely absent (pilot/onboarding readiness ≠ new-venture validation/launch). |
| 22 | Local Context / Compliance Confidence Gate | PARTIAL | `domain/remote-operations/compliance-gate.ts`, `owner-mode/compliance-boundary.ts`, `remote-operations/location-readiness.ts` — spread, not one combined gate. |
| 23 | Owner Daily Command Center | FOUND | `src/domain/execution/owner-command-center.ts`, `owner-mode/command-center-priorities.ts`, `services/owner-dashboard.service.ts` |

**Tally:** FOUND 11 · PARTIAL 8 · GAP 4 (concepts 2, 3, 4, 21).

---

## 7. Genuine gaps → phase map (drives implementation order)

The codebase predates the "Owner Wealth Loop" naming; most execution loop machinery
(diagnosis → next move → work → proof → outcome → learning → command center) already
exists. The **strategic wealth-scoring layer is the true missing core** — precisely the
"cheat code" that separates trap/dead-end/owner-job businesses from real wealth vehicles.

| Phase | Requirement | Status | Action |
|---|---|---|---|
| 0 | Repo inventory + baseline | **DONE** (this file) | — |
| 1 | Canonical Business State Model | PARTIAL — prove existing | Prove via existing intake + business-facts + condition profile; extend only if exit gate unmet. |
| **2** | **Business Model Quality Score + Wealth Path Classifier** | **GAP** | **First implementation slice.** New deterministic domain module; reuse condition health scores as inputs. |
| 3 | Risk-Adjusted Wealth Score + Opportunity Cost | GAP/PARTIAL | Follows Phase 2 (consumes wealth-path + quality). |
| 4 | Capital Allocation + Financial Governor | FOUND | Prove existing + wire to wealth loop. |
| 5–20 | Playbook, diagnosis, next move, work packages, proof, outcome, learning, guardrail, scale gate, domains | mostly FOUND/PARTIAL | Prove + extend; register gaps (levels 0–5 ladder, Work Package bundle, A/B/C/D tiers, transfer score). |
| 21 | Startup Validation/Launch Workbench | GAP | New module (later phase). |
| 22–28 | Compliance gate consolidation, cross-domain, command center, simulations, E2E, final audit | PARTIAL/FOUND | Prove + consolidate. |

---

## 8. First authorized implementation slice (decision)

**Phase 2, Slice 1 — Wealth Path Classifier + Business Model Quality Score** (`src/domain/owner-strategy/wealth-path.ts` + `wealth-path.types.ts`).

Rationale:
- Earliest genuine **GAP** in phase order that requires new code (Phase 1 is PARTIAL/provable).
- Directly delivers `execution.md` Absolute Objective #3 ("separate good businesses from weak, dead-end, trap, or owner-job businesses") and the K-rule (stop/pivot/sell/exit honesty).
- Cleanly implementable as a **pure deterministic domain module** (no DB migration, no new dependency, fully unit-testable without DB) mirroring the existing `business-condition-profile.ts` / `capital-allocation.ts` pattern.
- No duplicate engine: the only adjacent classifier (`stage-classifier.ts`) answers a different question (operating condition, not structural wealth vehicle).

Exit gate for the slice (from `execution.md` Phase 2): tests cover high-quality, weak,
dead-end, trap, and owner-job businesses; outputs include score, classification, evidence,
missing data, and confidence (Score-Integrity Rule D); classifier may recommend
stabilize/pivot/pause/sell/exit/stop-investing.

---

## 9. Reuse commitments (no-duplicate contract)

For every subsequent slice, the following existing engines are the mandated integration
points and MUST NOT be re-implemented:

- Spend/finance safety → `owner-budget/spend-governance.ts` + `capital-allocation.ts`.
- Diagnosis → `consulting-engine/diagnosis-engine.ts`.
- Next move → `owner-guidance/next-best-step.ts`.
- Proof → `services/execution/proof.service.ts` + `verification-engine.ts`.
- Outcome + causality → `owner-mode/outcome-tracking.ts` + `execution/outcome-causality.ts`.
- Scale gate → `execution/scale-readiness.ts`.
- Command center → `execution/owner-command-center.ts`.
- Auth/workspace → `lib/canonical-route-enforcement.ts` (never import auth libs directly).
- Audit → `AuditEvent` (hash-chained).
</content>
