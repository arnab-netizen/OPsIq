# OpsIQ Real-World Chaos Replay + Observer/Audit Harness — Plan

> Hostile-skeptical good/bad/ugly real-world outcome validation. Claude acts as **observer/auditor only,
> after** OpsIQ output is produced — it never influences the production runtime decision. Expected outcomes
> are **locked before** grading. No parallel brain, no LLM in the runtime, no autonomy, no gate weakening.
> Reuse-first / minimum-code over the deterministic runtime + the existing real-world public corpus.

- **Branch:** `claude/real-world-chaos-replay-audit`
- **Base main HEAD:** `8684fc09c641a4c22223f2686d183dc1c7a3c8e9`

## 1. Existing scenario / case infrastructure (REUSE)
- `src/behavioral-validation/public-cases/library.ts` → **`PUBLIC_CORPUS` = 4032 cases; 1008 `realFlag:"real"`,
  all `productionRuntimeEligible`**, across **36 business categories × 28 patterns**, each carrying a
  **`sourceRef` (SRC-…)** and a **locked `goldSkeleton`** (rootCause, dominantConstraint, whatNotToDo,
  nextBestAction, proofRequired, reassessment, stopLoss).
- `public-cases/schema.ts` → `PublicCase`/`PublicCaseMeta`/`GoldSkeleton`; **`severity`** ∈ {best_case,
  good_fragile, normal, bad_management, ugly_spiral, fraud, extreme} → maps to **good/bad/ugly**.
- `public-cases/source-register.ts` → `SOURCE_REGISTER` (20 sources) + **privacy gates** (`findPII`,
  `hasLongCopiedText`, `validateSourceRegister`) — PII / long-copied-text already blocked.
- `behavioral-validation/schema.ts` → `BehavioralCase` (temptingBadDecision, correctExpertDecision,
  opsiqShouldSay/Block, proofRequired, reassessmentTrigger, learningRuleIfFails, flags).
- 28 patterns include every required chaos type: `cashflow_squeeze`, `receivables_terms_trap`, `dead_stock`,
  `over_expansion`, `underpriced_contract`, `capacity_bottleneck`, `quality_complaints`, `owner_overload`,
  `fake_vendor_fraud`, `fake_completion_proof`, `compliance_shutdown_risk`, `turnaround_sequence`,
  `weak_unit_economics_scale`, `ghost_payroll`, `staff_sop_training`, `staff_overwork_hiring`,
  `maintenance_downtime`, `delivery_logistics_fail`, `price_war_response`, `seasonality_planning`,
  **`cyber_payment_fraud`**, `insurance_disaster`, `reputation_social_crisis`, `franchise_brand_conflict`,
  `exit_sale_readiness`, `asset_purchase_payback`, `local_market_remote`, `sales_pipeline`.

## 2. Existing runtime replay capability (REUSE)
- `src/services/owner-mode/owner-advice-runtime.service.ts` → **`runOwnerAdvice({workspaceId, context},
  {store, providers?})`** — the approved production runtime (advisor + arbitration + whole-plan + collective
  scorer + learning + domain ingestion). Returns `{ plan, arbitration, collective, ingestion, unsafeCount,
  learningApplied, learningArtifactIds }`.
- `whole-business/production-runner.ts` → **`caseToContext(case, expectedTopPriority)`** turns a case into an
  `OwnerBusinessContext`.
- `services/owner-mode/owner-whole-business-plan.service.ts` → the DB wrapper that maps `plan + ingestion +
  arbitration` → **`SupervisorInput`** → `buildSupervisorSummary`. The chaos replay reproduces this exact
  mapping (no DB) so the supervisor summary is genuine runtime output.
- `public-cases/public-runner.ts` → already runs the corpus through `runOwnerAdvice`.

## 3. Existing DB / browser proof capability (REUSE)
- `owner-db-providers.ts` (prefetch + build providers, workspace+business scoped); `*.db.test.ts` isolation
  pattern (`owner-whole-business-plan.db.test.ts`, `owner-business-isolation.db.test.ts`).
- `tests/browser/13–18*.spec.ts` + `owner-pilot-fixtures.ts` (SupervisorSummary panel data-testids).

## 4. Existing auditor / scorer capability (REUSE)
- `scorer.ts` (`scoreAdvice`, `detectUnsafe`, UNSAFE_RULES, FAILURE_LABELS), `whole-business/collective-scorer.ts`
  (`scoreCollectivePlan`), `max-reliability/{fmea,assurance,source-quality,evidence-trace,learning-governance,
  adjudication-queue}.ts`, `expert/business-math.ts` (`deriveCalcs`, revenueUpCashDown), `expert/ratchet.ts`.

## 5. Real gaps only (what does NOT yet exist)
1. A **chaos-scenario lens** that adds explicit good/bad/ugly + chaos-type tags + real-world-consequence over
   `PublicCase`, validated by a schema with the 39 required fields.
2. A **locked-expectation contract** with a lock/hash so expectations cannot be edited after seeing output.
3. A **Claude/observer auditor contract** that compares runtime output vs locked expectations and emits the
   30-field audit result (module routing, dominant constraint, supervisor behaviour, evidence sufficiency,
   do-not-do, safe action, proof/reassessment, confidence/missing-data, fake-confidence, impact, owner/delegate,
   dashboard usefulness, owner comprehension, generic-advice, unsafe, bad-outcome-if-followed, business outcome,
   real-world-consequence-avoided, pass/fail, failure labels, adjudication/regression/learning recs).
4. A **good/bad/ugly real-world outcome rubric** + chaos scoring + the `REAL_WORLD_CHAOS_REPLAY_*` ladder.
5. A **layer-by-layer coverage matrix** (30 layers) asserting replay hits every OpsIQ layer.
6. A **failure → adjudication/regression/scoped-learning loop** with before/after evidence.

## 6. Minimum-code implementation plan (new module `src/behavioral-validation/chaos-replay/`)
- `chaos-schema.ts` — Zod `chaosScenarioSchema` (39 fields) + `GOOD_BAD_UGLY` severity map + `CHAOS_TYPES`
  + `realWorldConsequence(dominant, tempting)` (deterministic) + `publicCaseToChaosScenario(pc)` derivation.
- `chaos-corpus.ts` — `COUNTED_CHAOS_SCENARIOS` (deterministic selection from the 1008 real cases that
  guarantees coverage) + `SYNTHETIC_EDGE_SCENARIOS` (marked `synthetic:true`, `countedForReadiness:false`).
- `chaos-replay.ts` — `replayScenario(scenario, store, workspaceId)` → `ChaosReplayResult` (runs
  `runOwnerAdvice` + reproduces the service's `plan→SupervisorInput→buildSupervisorSummary` mapping; captures
  modules used, dominant, accepted/rejected, confidence/missing-data, assumption ledger, action/proof/
  reassessment, impact, owner/delegate, learning). `lockExpectations(scenario)` returns a frozen, hashed
  expectation snapshot loaded **before** replay output.
- `chaos-auditor.ts` — `auditReplay(lockedExpectation, result)` → `ChaosAuditResult` (pure; inputs frozen).
- `chaos-scoring.ts` — `scoreChaosRun(audits)` → dimension scores + thresholds + `classifyChaos(...)`.
- `chaos-layers.ts` — `OPSIQ_LAYERS` (30) + `layerCoverage(audits)` matrix.
- `chaos-learning.ts` — `failureToArtifacts(audit)` → adjudication item + regression case + scoped learning
  candidate (reuses adjudication-queue / learning-governance; never global-promotes from one case).

## 7. Case-source strategy
Counted cases reuse the existing **source register** (real public patterns, privacy-gated). Every counted
scenario links to a real `SRC-…` source (inherited from its `PublicCase`), carries source reliability +
completeness + limitation labels, and **0 synthetic cases count** toward readiness. Synthetic edge cases are
allowed only marked `synthetic:true` and are excluded from every readiness threshold.

## 8. Real-world outcome strategy
Each scenario carries an expected **real-world consequence if OpsIQ is wrong** (derived deterministically from
the dominant constraint + the tempting wrong action — e.g. cash_survival → "insolvency / missed payroll";
proof_fraud_block → "paying on fraudulent/unverifiable proof"; below_margin → "selling at a per-unit loss").
The outcome rubric (Section 10) grades whether OpsIQ's recommendation would protect profit/cash/margin/workload/
quality/proof and avoid premature growth / bad contracts / fake completion.

## 9. Good / bad / ugly coverage plan
Severity → class: **GOOD** = {best_case, good_fragile, normal}; **BAD** = {bad_management};
**UGLY** = {ugly_spiral, fraud, extreme}. Per the measured corpus, **each of the 36 categories already has
good_fragile+normal (10 good), bad_management (7 bad), ugly (11 ugly)** — so ≥1 good / ≥2 bad / ≥2 ugly per
category is guaranteed. The counted selection takes ≥1 good + ≥2 bad + ≥2 ugly from **≥15 categories** (≥75
counted), and tags each scenario with its chaos type(s) so the cross-cutting minimums are met:
- collective ≥20 (all real cases are collective), owner-pressure ≥15 (`owner_overload`/`local_market_remote`
  + every case's tempting bad idea), missing-data/fake-confidence ≥15 (runtime: no real provider ⇒ confidence
  capped + data requested; uncertain patterns), novelty/OOD ≥10 (`local_market_remote`, `seasonality_planning`,
  `exit_sale_readiness`, `franchise_brand_conflict`, `price_war_response`, `insurance_disaster`), stop/reject/
  pause ≥15 (compliance/proof-fraud dominant + ugly), shutdown/pivot/stop-loss ≥10 (gold `stopLoss` present),
  high-revenue/bad-business ≥10 (`cashflow_squeeze`/`receivables_terms_trap`/`underpriced_contract`,
  revenueUpCashDown), manipulation/collusion/fraud ≥10 (`fake_vendor_fraud`/`fake_completion_proof`/
  `ghost_payroll`, hostile), compliance ≥ (`compliance_shutdown_risk`), vendor (`fake_vendor_fraud`/
  `delivery_logistics_fail`), cyber/payment/data-loss (`cyber_payment_fraud`, 36 cases).

## 10. Scenario schema (39 fields)
`chaosScenarioSchema`: scenarioId, countedForReadiness, synthetic, sourceRefs, sourceLimitations,
goodBadUgly, businessProfile, businessCategory, businessStage, ownerRole, workspace/business handling,
location/branch, availableData, missingData, staleData, conflictingData, ownerPressure, temptingWrongAction,
staffVendorCustomerNoise, financialState, operationalState, staffWorkloadState, customerReputationState,
proofCompletionState, growthOpportunityState, complianceBoundaryState, expectedModules, expectedNonDominantModules,
expectedDominantConstraint, expectedRejectedTemptingAction, expectedSupervisorActionStatus, expectedDashboardFields,
expectedProofReassessment, expectedBusinessOutcomeRationale, expected7DaySignal, expected30DaySignal,
expectedStopLossThreshold?, expectedLearningOnFail, expectedRealWorldConsequenceIfWrong, chaosTypes[].

## 11. Locked expected-outcome schema
`lockExpectations(scenario)` → `{ expectation, lockHash }` frozen (`Object.freeze`, deep). Replay/audit consume
the locked snapshot; a post-output mutation changes the hash and the audit rejects it unless an explicit
`expectationUpdate` marker + report entry exists. Lucky-right-answer with wrong dominant/evidence cannot fully pass.

## 12. Observer / audit schema
`ChaosAuditResult` (30 fields per Section 8 of the prompt). Pure function over **frozen** inputs (auditor cannot
mutate runtime output or locked expectation). Emits pass/fail + failure labels + adjudication/regression/learning
recommendations.

## 13. DB / browser workflow design
- DB: a `.db.test.ts` seeds an **isolated workspace+business**, runs the real `getOwnerWholeBusinessPlan`
  (DB provider path), audits the resulting supervisor summary, and asserts **no cross-workspace/business leakage**.
- Browser: reuse the existing Playwright lane (specs 13–18) as the browser no-regression gate; add a jsdom
  dashboard-chaos component proof over representative good/bad/ugly scenarios (runtime-fed, no static fallback,
  ≤3 priorities, blocked≠proceed, mobile-bounded).

## 14. Learning / regression loop
On any audited failure: create an adjudication item + a regression case + (only if safe) a **scoped** learning
candidate; never global-promote from one case; rerun the affected scenario; preserve before/after audit; keep
unresolved high-risk failures visible and **blocking** readiness.

## 15. No-regression gates (must stay green)
max-reliability ratchet · AI supervisor · owner-pilot · DB owner-mode · business-scope isolation · source/privacy ·
learning-governance/adjudication · Playwright 13–18 · the new chaos-replay tests. Baseline captured: tsc 0,
prisma valid, supervisor+max-reliability+pilot 360 pass/6 skip, lint ratchet PASS.

## 16. Final classification gates
`REAL_WORLD_CHAOS_REPLAY_READY` only when: ≥75 counted real scenarios run; synthetic not counted; ≥15 categories;
good/bad/ugly per category; all mandatory chaos types; every OpsIQ layer covered; module routing ≥90; dominant
constraint ≥90; supervisor behaviour ≥90; evidence sufficiency ≥90; dashboard usefulness ≥85; owner comprehension
≥85; business outcome usefulness ≥90; good/bad/ugly correctness ≥90 each; unsafe = 0; generic advice = 0; fake high
confidence = 0; bad-outcome-if-followed high-risk = 0; unresolved high-risk failures = 0; browser/mobile + DB proof
pass; max-reliability + owner-pilot + AI supervisor green. Ladder: CHAOS_REPLAY_FAILED → SOURCE_READY → RUNTIME_READY
→ AUDITOR_READY → BROWSER_READY → REAL_WORLD_CHAOS_REPLAY_READY.

## 17. What will NOT be built
No public SaaS / billing / launch / enterprise polish; no parallel AI brain; no autonomous AI; no LLM in the
runtime; no new advice engine; no weakening of any gate; no toy/clean textbook-only cases; no synthetic cases
counted toward readiness; no auditor influence on the runtime decision; the auditor only reads frozen output.
