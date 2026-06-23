# CURRENT WORKFLOW STATE

Last updated: 2026-06-23
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Active execution: **OpsIQ Owner Mode Decision OS — Strict Minimum-Code Continuous Build**
Companion audit: `OPSIQ_OWNER_MODE_DECISION_OS_STATE_AUDIT.md`

---

## TRIAL READINESS (post-Phase-16 audit — see `OWNER_MODE_TRIAL_READINESS_AUDIT.md`)

Classification: **NOT_READY_FOR_OWNER_TRIAL** → `OWNER_TRIAL_READY_WITH_MANUAL_INPUTS` once the two blockers below clear. Trial is feasible at **zero external cost, manual/CSV inputs**. The only hard external connection is **PostgreSQL**; there is **no LLM/AI provider, no billing, no connector** required.

**TRIAL_BLOCKER 0 — Pre-existing repo-wide CI breakage (gates everything). DISCOVERED 2026-06-23 via GitHub Actions.** `ci.yml` is RED on `main` itself (`35085c7` — this branch's base — and every main run back to 2026-06-19 are `failure`), independent of Owner Mode work. Two gates fail BEFORE the test suite runs:
  - **build-and-test → "Governance compliance scan" (`governance:scan:strict`)** fails on **3 findings NOT in any file I authored**: 2 pre-existing source findings (`services/external-systems/sync-manager.service.ts:233` raw-error-message; `domain/business-facts/contradiction-resolver.ts:196` unsafe-metric) + 1 generated-code artifact (`src/generated/prisma/internal/class.ts:40`, produced by the Prisma 7.8.0 client; `src/generated` is gitignored). Because this step fails, **typecheck, prisma migrate, build, and the ENTIRE test suite are SKIPPED** — so the CI DB-backed proof for BLOCKER 1 never even runs.
  - **lint → "Lint ratchet"** fails on total-count drift (baseline 1992 errors → current 2155); my 7 changed files are reported **lint-clean** — the rise is pre-existing debt in files I didn't touch.
  **Correction to earlier reporting:** I previously cited the free CI `postgres:16` lane as the path to clear BLOCKER 1. That was wrong — CI's test step is gated behind the governance scan, and CI was already red on main. The DB proof cannot be obtained via CI until BLOCKER 0 is resolved. Resolving it (refresh frozen governance/lint baselines vs. fix the 2 real source findings + exclude `src/generated/**` from scans) is a **maintainer/owner policy decision with real trade-offs (updating baselines would mask the 2 genuine source findings)** and is OUTSIDE minimum-code Owner Mode scope. **Not actioned without owner direction** (see open question).

**TRIAL_BLOCKER 1 — No DB-backed proof. (OPEN; now also gated by BLOCKER 0.)** Persistence + §13 security DB negatives + scored benchmark unproven (no reachable DB in-container; Neon URL present but unreachable, no local Postgres). The free CI path is itself blocked by BLOCKER 0. Needs either a reachable Postgres in a dev env, or BLOCKER 0 cleared so CI's DB lane can run.

**TRIAL_BLOCKER 2 — RESOLVED (commit pending below).** `domain/owner-intake/engine.ts` no longer degrades intake to `partial` when the optional `gstBasis` column is **absent** (an absent optional field is not "present-but-invalid"; advisory warning retained). Owner finance CSVs without `gstBasis` are now correctly `valid`. Regression: business-facts + owner-intake + owner-mode = 51 files / 2161 passed (was 1 failed) / 1 DB-skipped; tsc 0 errors. CI blocking lane no longer red on `intake-adapter`.

Next: push (triggers CI DB lane for BLOCKER 1); then the AI track per the decision below.

---

## AI READINESS (Phase A audit — see `OWNER_MODE_AI_READINESS_AUDIT.md`)

Two separate tracks. **Deterministic track:** `OWNER_INTERNAL_ALPHA` (conditional, unchanged). **AI track:** `AI_ARCHITECTURE_READY_PROVIDER_MISSING`; **live AI = `BLOCKED_NO_AI_PROVIDER`**.

Truth: there is **no AI provider, SDK, key, prompt, output schema, or LLM call** anywhere. But a deterministic **AI-governance skeleton already exists** and is reusable: `ai-observability-trace.ts` (in-memory loop trace ledger w/ public/internal redaction), `model-versioning.ts` (model/prompt/ruleset/eval versions), `AIProposalSandbox` (DB model, governed AI-proposal-requires-approval), and hard guards `AI_IS_NOT_A_VERIFIER`/`assertVerifierIsNotAI` (SEC-006), `/llm_output/i` evidence rejection, source-classification. Missing = the AI *execution* pipeline (provider boundary, prompts, output schemas, post-AI validator, context builder, calls, evals).

**Genuine owner decision blocker:** choosing an AI provider + supplying an API key (cost / data-privacy / vendor). Until then live AI cannot be proven.

**Recommended next slice "AI-1 — Governed copilot foundation (mock track)":** provider boundary (port + Unavailable/Mock impls, no SDK), task registry + one LOW-risk task (`MISSING_QUESTION_GENERATION`) schema, post-AI validator (reject taxonomy), workspace-scoped context builder, in-memory ledger extension, and mock guardrail + prompt-injection + hallucinated-evidence + AI-unavailable-fallback tests. Buildable now with **zero cost / no key / no DB** → targets `AI_MOCK_GUARDRAIL_TESTED`; live AI deferred to the owner's provider choice.

**OWNER DECISION (recorded 2026-06-23):**
- **Provider = OpenAI (GPT)** as the FIRST concrete live adapter, behind a **provider-agnostic boundary** (do not hardcode OpenAI throughout; keep mock provider for tests; no Anthropic/Gemini/local adapters now). Structured outputs / JSON Schema for all decision-relevant tasks. `OPENAI_API_KEY` gates live smoke tests; if absent → mock guardrail tests only, classify `AI_MOCK_GUARDRAIL_TESTED`/`AI_ARCHITECTURE_READY_PROVIDER_MISSING`, never `AI_OWNER_TRIAL_READY_WITH_AI`. Ledger logs model/prompt-version/schema-version/task/latency/tokens/validator-result/accept-reject. No unrelated-workspace data; AI never mutates state; deterministic services remain final authority. No public-SaaS AI, no autonomous agents, no external connectors.
- **Sequencing = clear deterministic blockers first** (this slice): BLOCKER 2 resolved; BLOCKER 1 (DB proof) rides CI on push. AI-1 mock foundation comes after.

---

## CONTROLLING STATEMENT

This execution is **Owner Mode only**. Public SaaS / billing / Product Hunt / marketing / public onboarding remain FROZEN (see SCOPE FREEZE below).

The Owner Mode loop that must be proven reliable:

```
owner/business data → data quality → financial survival → unit economics
→ diagnosis (+evidence/counter-evidence) → decision object → evidence bundle
→ ranked action portfolio → scenario comparison → owner approval/override
→ guided execution (+proof) → outcome verification → attribution/confounder review
→ private learning eligibility → regression/audit gate → dashboard proof
```

**Repo posture (critical):** OpsIQ already implements the overwhelming majority of this loop (see audit §0). The governing rule for every slice is **REUSE-AND-VERIFY, not build**. New tables/routes/services/components are justified only against the audit's §7 Gap Register. Duplicate parallel systems (`*V2`, second dashboard, second portfolio engine) are forbidden.

---

## SCOPE FREEZE (unchanged)

FROZEN until Owner Mode Decision OS is reliability-gated: Public SaaS flows, Product Hunt, Billing (Lemon Squeezy/Stripe), public onboarding, external lead intelligence, CRM/accounting integrations, browser automation, ML forecasting, cohort priors, public marketing pages, cross-customer/public learning, agentic automation, external market intelligence, third-party connectors.

---

## PHASE STATUS (this execution's minimum-code plan)

| Phase | Name | Status |
|---|---|---|
| 0 | Repo truth + Owner Mode state audit | **DOC_ONLY_COMPLETE** |
| 0.5 | Baseline regression harness (install deps, run baseline, map flows→tests) | **STATIC_TESTED_ONLY** (deps installed; owner-mode baseline green; DB tests blocked — see below) |
| 1 | Status/threshold canon + source-classification mapping | **STATIC_TESTED_ONLY** (canon verified; source-classification gap G4 closed) |
| 2 | Data quality + input guidance gate | **STATIC_TESTED_ONLY** (scoring/guidance PRESENT+verified; §15 permission-state classifier added) |
| 3 | Financial survival + unit economics | **VERIFIED (STATIC_TESTED_ONLY)** — already implemented; 229 tests green; no code added |
| 4 | Decision + evidence snapshot | **VERIFIED (STATIC_TESTED_ONLY)** — 355 tests green; route-auth DB-gated |
| 5 | Recommendation portfolio + feasibility | **VERIFIED (STATIC_TESTED_ONLY)** — ranking+feasibility+survival-first green |
| 6 | Scenario / what-if | **VERIFIED (STATIC_TESTED_ONLY)** — scenario-engine 36 tests green |
| 7 | Experiment design | **VERIFIED (STATIC_TESTED_ONLY)** — pure lifecycle 133 tests green; persistence gap documented |
| 8 | Execution orchestration | **VERIFIED (STATIC_TESTED_ONLY)** — action FSM/proof 65 tests green |
| 9 | Outcome verification + attribution | **VERIFIED (STATIC_TESTED_ONLY)** — outcome+attribution 212 tests green |
| 10 | Private owner learning eligibility gate | **VERIFIED (API_TESTED)** — 426 domain + 152 route tests green; DB persistence gated |
| 11 | Governance / audit / model risk | **VERIFIED (API_TESTED)** — 294 audit/governance tests green |
| 12 | Owner dashboard command center | **VERIFIED (UI_TESTED + API_TESTED)** — 167 tests green |
| 12.5 | Trust & explainability QA | **VERIFIED (UI_TESTED)** — 84 trust/explainability/adversarial tests green |
| 13 | Laundry vertical slice (end-to-end) | **VERIFIED (OWNER_FLOW_TESTED)** — full-loop + SMB harness 716 tests green |
| 14 | Housekeeping archetype | **IMPLEMENTED (STATIC_TESTED_ONLY)** — registered + isolated; kpi-profiles 37 tests green |
| 15 | Benchmark harness | **VERIFIED (BENCHMARK_TESTED)** — 322 benchmark tests green |
| 16 | Final reliability gate | **COMPLETE — OWNER_INTERNAL_ALPHA (conditional)** — see RELIABILITY_REPORT |

> Note: A prior execution tracked `execution.md` phases 0–28 on branch `claude/sleepy-dirac-m4bdb9`. That work produced most of the existing `Owner*` implementation. This document supersedes that tracker for the current minimum-code execution; the underlying code is reused, not discarded.

---

## BASELINE STATUS (Phase 0.5 — captured 2026-06-23)

The fresh remote container ships **without `node_modules`**. Root-cause of repeated `npm install` failures: Prisma's `postinstall` (`prisma generate` → engine binary download from an external host) aborts with `ECONNRESET` and npm rolls the whole install back. **Fix:** `npm install --ignore-scripts` installs all 632 packages cleanly; `./node_modules/.bin/prisma generate` then succeeds locally (client generated to `src/generated/prisma`). Use `--ignore-scripts` for installs in this environment.

Baseline commands run and **recorded results**:

| Command | Result |
|---|---|
| `npm install --ignore-scripts` | ✅ 632 packages |
| `./node_modules/.bin/prisma generate` | ✅ Prisma Client 7.8.0 generated |
| `./node_modules/.bin/prisma validate` | ⚠️ resets on a network update-check; schema validity confirmed by successful `generate` |
| `vitest run src/__tests__/domain/owner-mode/full-loop-validation + owner-decision` | ✅ 129/129 |
| `vitest run outcome-tracking + controlled-learning + services/auth/access` | ✅ 163/163 |
| `vitest run src/__tests__/domain/owner-mode/` (whole dir) | ✅ **34 files, 1831 tests passed** |
| Full `vitest run` (all ~529 files) | recorded in audit §1 |
| `TEST_WITH_DB=true … '[db]'` (PostgreSQL-backed) | ⛔ **BLOCKED** — no local `DATABASE_URL`; test setup skips DB init. DB-backed claims deferred until a Postgres test DB is provisioned. |

**DB-test blocker (documented per §10 anti-mock / §11):** DB-backed (`[db]`) tests cannot run in this container — the test harness logs `DATABASE_URL not configured for local testing, skipping DB initialization`. Until a Postgres test database is wired, no slice may claim `DB_TESTED`; static + non-DB API behavior is the ceiling here.

Quarantined tests to re-activate before claiming related slices TESTED:
`src/__ignored_tests__/workspace-isolation-enforcement.test.ts`,
`src/__ignored_tests__/services/diagnostic-core/__tests__/archetype-engine.test.ts`.

---

## NEXT ACTION

All phases 0–16 complete. Final classification **OWNER_INTERNAL_ALPHA (conditional)** — see `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`. The single gate to BETA/LIMITED_USE is the environment verification gap: provision a Postgres test DB and run the DB-backed persistence + §13 security matrix + a live scored benchmark + a full-suite green run. No further code is required to reach those gates — only execution on a DB-enabled environment.

### Phase 16 decision record (final reliability gate)
- Authored `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`: acceptance-scenario coverage, per-phase evidence, minimum-code surface (2 new src + 2 new tests + 1 modified profile across the whole execution; 0 tables/routes/components/migrations), evidence-by-category, gating risks, go/no-go.
- Honest classification: ALPHA, not higher — numeric reliability gates + DB-backed security/persistence are unmeasured in this container (no DATABASE_URL), so they are asserted-by-construction, not proven.

### Phase 15 decision record (benchmark harness) — VERIFICATION ONLY (no code)
- **Harness present:** `domain/benchmark/` — `scoring-rubric.ts` (fail-gates incl. `hallucinated_fact`, dangerous-recommendation gates), `synthetic-scenario.ts`, `scenario-engine.ts` (grounded-cause / no-hallucinated-critical-risk checks), `round2-case-schema.ts`; services blind-test/dataset-evaluation/learning-observation/sales-pitch/growth-opportunity/round2-intake-validator; `benchmark/adversarial-evaluator`.
- **Scoring dimensions (§34):** root-cause/first-action accuracy + dangerous/hallucinated/overclaim gates encoded in scoring-rubric.
- **Required case coverage:** benchmark cases + the Phase-13 real-world SMB harness (455) cover cash-crisis / revenue-up-profit-down / marketing-ROI / staff-bottleneck / pricing / B2B / fake-improvement / missing/misleading/conflicting data / laundry-margin / housekeeping-capacity.
- **Tests verified green:** 11 benchmark files / 322 passed.
- **Known limitation:** `round2-case-schema.ts` contains intentional authoring denylist TODOs (not stubs); full live benchmark gate scoring against a real owner dataset is DB/dataset-gated.

### Phase 14 decision record (housekeeping archetype) — NEW CODE (1 profile + tests)
- **Gap found:** `KPI_PROFILES` registered only local_service/saas/restaurant/laundry — **no dedicated housekeeping archetype** (laundry passed in Phase 13, so housekeeping is now allowed per §33).
- **Minimum-code:** added one `HOUSEKEEPING` `KPIProfile` data record + `housekeeping:` registry entry in `domain/business-facts/kpi-profiles.ts` (capacity/staff-centric KPIs: jobs/cleaner/day, staff utilization, travel-time ratio, revenue/cleaner-hour, rework rate, retention; §34 "Staff Capacity Bottleneck" failure mode; labour/travel critical ratios; capacity-scheduling action pattern). **No generic-engine change, no laundry change, no schema/route/UI.** Isolated as a registered data profile (the archetype pattern).
- **Tests:** extended `business-facts/kpi-profiles.test.ts` — registration/discoverability, capacity-centric KPIs, §34 staff-capacity failure mode, **laundry-isolation (no chemical KPI in housekeeping, no cleaner KPI in laundry)**, fail-safe null on unknown archetype. 37/37 pass; tsc 0 errors.
- **Regression:** business-facts (47 files) + owner-mode domain green EXCEPT one **PRE-EXISTING** failure (see below) unrelated to this change.

### PRE-EXISTING baseline failure (documented per §1.20 — NOT introduced, NOT worsened)
`src/__tests__/business-facts/intake-adapter.test.ts > "converts a valid finance CSV intake into a VALID business-facts contract"` — asserts `intake.validationStatus === "valid"` but gets `"partial"` (fails in `buildCsvIntake`, before any KPI-profile use; intake-adapter does not import kpi-profiles). Confirmed failing on committed HEAD with Phase-14 changes stashed. Out of owner-mode scope; left untouched to avoid speculative cross-module change. Flagged here so later slices do not hide a new regression behind it.

### Phase 13 decision record (laundry vertical slice) — VERIFICATION ONLY (no code)
- **End-to-end owner loop:** `domain/owner-mode/full-loop-validation.test.ts` exercises input-quality→diagnosis→decision→action→evidence→verification→outcome→learning-eligibility→dashboard. Laundry archetype in `domain/business-facts/kpi-profiles.ts` (kg/pieces/day, chemical cost/kg, delivery-cost ratio, repeat-customer rate, machine utilization).
- **Real-world SMB harness:** `tests/owner-mode/real-world-smb-cases` (realWorldSmbHarness, smbLeakageGuard, smbInterpolation, composerIntegration, smbRegressionLock, evidenceHintSidecar, normalizeFixtureToEvidence, …).
- **Tests verified green:** full-loop + laundry-touching domain metrics/kpi-profiles (261) + SMB case harness (455) = **26 files / 716 passed**.
- **Known limitation:** DB-backed persistence segments of the loop are gated (no DATABASE_URL) → the loop is proven at pure + service + harness level (OWNER_FLOW_TESTED), not via live Postgres.

### Phase 12.5 decision record (trust & explainability QA) — VERIFICATION ONLY (no code)
- **Already hardened (prior history):** "eliminate misleading empty states + confidence display" (Phase G owner trust). Explainability via `owner/trust/explanations`.
- **Tests verified green:** owner-trust (trust-page + explainability + routes, 46/3-skip) + UI empty/missing-data states (dashboard-first-diagnosis-cta, FactsReviewTable) + hostile `benchmark/adversarial-evaluator` = 38 → combined 84 passed.
- **Known limitation:** one owner-trust `*.db.test.ts` skipped (DB-gated).

### Phase 12 decision record (owner dashboard command center) — VERIFICATION ONLY (no code)
- **Panels backed by real backend (no fabricated data):** `ui/owner-dashboard.tsx`, `ui/alerts-panel.tsx` (Alert Bar), `runtime/health/health-system.ts` (Health Score), root-cause-engine (Root Cause), `ui/recommendations-manager.tsx` (Decision Queue), scenarios-engine (Scenario Simulator), owner/execution (Execution Board), owner-trust (Outcome Ledger / Decision Trace), intake guidance (Missing Data). Served by `services/dashboard/owner-dashboard.service.ts` + `/api/owner/dashboard`.
- **Tests verified green:** owner-dashboard (domain) + dashboard.service + api/owner-dashboard + query-parsing + portfolio-command-center-shell + owner-home summary + owner-condition home-page = 7 files / 167 (handler + render level).
- **Phase-2 classifier note:** `assessDiagnosisPermission` remains an available primitive; deliberately NOT wired into the dashboard contract this slice (no required gap; would risk the 167 green tests). The live dashboard already surfaces health/confidence/missing-data via the per-domain confidence model.
- **Known limitation:** DB-backed dashboard queries (`*.db.test.ts`) gated → render + handler verified, DB query path not.

### Phase 11 decision record (governance / audit / model risk) — VERIFICATION ONLY (no code)
- **Audit trail:** `AuditEvent` (hash-chained `previousHash`) + `CanonicalEvent` (event-sourcing); `services/audit-trail.ts`, `services/audit-event-hash-chain-validator.ts`. Who/when/why captured via audit-events constants.
- **Model/prompt/rule versioning:** `domain/owner-mode/model-versioning.ts`; AI trace `domain/owner-mode/ai-observability-trace.ts`.
- **Decision reconstruction:** decisions route + owner-trust explanations/audit-trail (`owner/trust/*`), trust-page.
- **Tests verified green:** model-versioning + ai-observability-trace + hash-chain-validator (187) + audit-trail + api/decisions + owner-trust trust-page (107) = 6 files / 294.
- **Known limitation:** DB-backed audit persistence (`*.db.test.ts`) gated → handler/logic verified, DB persistence not.

### Phase 10 decision record (private owner learning eligibility) — VERIFICATION ONLY (no code)
- **Eligibility gate (verified-outcome-only + attribution threshold):** `domain/owner-mode/learning-eligibility.ts` + `controlled-learning.ts`; consumes `causal-attribution.ATTRIBUTION_BLOCKS_LEARNING` so unverified/disputed/insufficient/confounded/external outcomes cannot create candidates. `OwnerLearningEligibilityReview` (allowsLearning/isTerminalRejection/requiresHumanReview) + `ControlledLearningCandidate`.
- **Owner-private + operator/public denial:** `domain/owner-mode/security-rules.ts`; 12 controlled-learning-* services (admission/candidate/attribution/regression/consent/harm/privacy/rejection/retention/review/rollback/rollout); 15 `owner/learning-*` routes.
- **Tests verified green:** domain learning suite (controlled-learning + learning-eligibility + admission-rejection/harm-attribution/privacy/regression/review/rollout-rollback) = 9 files / 426; learning **route** tests (admissions/attribution-reviews/candidates/consent/harm-events/privacy/rejections/retention/reviews/rollback/rollout + reviews) = 12 files / 152 → auth + validation boundaries exercised at the handler.
- **Known limitation:** `*.db.test.ts` (controlled-learning-candidate.db, admission.db) are DB-gated → full DB-backed persistence + cross-workspace denial not run here; route-handler auth is proven, DB persistence is not.

### Phase 9 decision record (outcome verification + attribution) — VERIFICATION ONLY (no code)
- **Outcome verification:** `OwnerActionOutcome` (outcomeStatus worked/partially/did_not_work/…/external_event_interference, before/after values, evidenceQuality, externalEventFlag); `domain/owner-mode/outcome-validation.ts` (`validateValidationCriteria`, `assertRecommendationHasCriteria`, `computeTargetDelta`); outcome services + outcome-core.
- **Attribution gate (§28, service-enforced + tested):** `domain/owner-mode/causal-attribution.ts` — `AttributionClass` (incl. confounded/external_event_dominant/insufficient_evidence), `ATTRIBUTION_BLOCKS_LEARNING` (confounded/external/insufficient → block), `ATTRIBUTION_LEARNING_CEILING`, `ATTRIBUTION_REQUIRES_HUMAN_REVIEW`, `classifyCausalAttribution` (CA-RULEs: confounding notes, external-event consistency, temporal proximity, `blocksLearning`). `services/governance/attribution-engine.ts`.
- **completion ≠ verified-success; disputed/unclear/insufficient → no learning candidate:** enforced via outcome status + attribution `blocksLearning` (consumed by Phase 10 eligibility).
- **Tests verified green:** outcome-tracking + outcome-validation + causal-attribution + failure-adjudication = 4 files / 212 passed.
- **Known limitation:** outcome persistence/route is DB-gated → no DB/API_TESTED claim.

### Phase 8 decision record (execution orchestration) — VERIFICATION ONLY (no code)
- **Action FSM + proof:** `domain/owner-mode/action-tracking.ts` — `ActionStatus` (pending/in_progress/completed/blocked/cancelled/overdue), `ACTION_STATUS_TRANSITIONS` (completed terminal in the action FSM — distinct from verification), `proofText` EXEC-RULE-3 (proof min length enforced), `ExecutionComplianceScore`, deviation severity. Models `OwnerAction`/`OwnerActionExecutionLog` (proofText/proofAttachmentUrl/executionComplianceScore)/`OwnerBlocker`. Execution-core engines (action-fsm, orchestrator, capacity, rollback, failure) under `services/execution-core/`.
- **completion ≠ verified (§26):** action FSM terminates at `completed`; success verification is the separate Phase-9 outcome layer — a completed action is never auto-marked verified-success.
- **Tests verified green:** action-tracking (50) + execution-core crash-recovery (15) = 65; full-loop-validation (baseline) covers the execution→verification handoff.
- **Known limitation:** operator route update + owner-sop services persistence are DB-gated (`owner-sop/services.db.test.ts`) → no DB/API_TESTED claim for the route boundary.

### Phase 7 decision record (experiment design) — VERIFICATION ONLY (no code)
- **Design + lifecycle (pure, tested):** `domain/experiment/experiment.ts` (`Hypothesis` with statement/`successMetric`/`successThreshold`/`failureThreshold`/`testDurationWeeks`/`reviewCadenceWeeks`, `validateHypothesis`, `validateExperimentPlan`) and `services/experiment/experiment-lifecycle.service.ts` (`createExperiment`→`approveExperiment`→`startExperiment`→`updateExecution`→`recordResult`→`captureLearning`, `analyzeOutcome`). Owner approval required before start. Route `engagements/[id]/experiments`.
- **Tests verified green:** experiment-lifecycle.service + api/experiments = 2 files / 133 passed.
- **Known PRE-EXISTING limitation (not introduced; not safely closable now):** there is **no `Experiment` DB model**; `createExperiment` builds an in-memory object and the engagements `GET .../experiments` returns an empty list (labeled TODO). Adding an `Experiment` table would trip the New Table Gate condition 6 (DB tests must prove it) which is impossible while DATABASE_URL is absent — so persistence is intentionally deferred, not stubbed-in. The pure experiment-design contract this phase requires is fully present + tested.

### Phase 6 decision record (scenario / what-if) — VERIFICATION ONLY (no code)
- **Engine:** `services/consulting-engine/scenario-engine.ts` `generateScenarios()` produces Aggressive (best-case) / Staged (Recommended) / Defensive (minimal-risk) options, each with explicit `assumptions[]` + `risks[]` (narrative, not fabricated projections). Richer `decision-core/scenarios-engine.ts` `ScenariosEngine` for decision-path comparison. Route `/api/scenario`.
- **Option coverage vs §24:** do-nothing/conservative→Defensive Hold; recommended→Staged; aggressive→Aggressive Recovery; defensive-cash/stop-action→Defensive. Assumptions disclosed; no fabricated numbers.
- **Tests verified green:** `benchmark/scenario-engine.test.ts` (36).
- **Known limitation:** route-level `/api/scenario` is DB-gated → no API/DB_TESTED claim.

### Phase 5 decision record (portfolio + feasibility) — VERIFICATION ONLY (no code)
- **Feasibility + ranking:** `services/decisions/priority-engine.ts` — `evaluateConstraints` (is_feasible, constraint_penalty, blocking/limiting constraints, conflicts), `calculatePriority` (impact/effort/credibility/reversibility, non-reversible-critical boost, low-effort-high-impact flag), `rankRecommendations`.
- **Survival-aware / growth-blocking ranking:** `services/consulting-engine/survival-prioritization.ts` `chooseFirstAction` (survival-first) + `services/financial-constraints.ts` (blocks growth when survival at risk) — survival actions outrank growth.
- **do-nothing / stop-action / data-collection (mapped equivalents, §1.16 — no duplicate enum):** represented at the decision layer via `deferred` (do-nothing/defer), `rejected` (stop-action), `needs_more_data` (collect-data); Stage-A `RECOMMENDATION_TYPES` also includes `investigate` (data-collection) and `stabilize`.
- **Tests verified green:** g3-priority-engine + pc01-survival-dominance (16), owner-portfolio + decisions (13, 2 DB-skipped), plus Phase-3 survival/constraints suites.
- **Known limitation:** portfolio persistence/route ranking is DB-gated → no DB_TESTED claim; do-nothing/stop/collect are decision-state equivalents rather than distinct persisted portfolio categories.

### Phase 4 decision record (decision + evidence) — VERIFICATION ONLY (no code)
- **Decision object + lifecycle:** `domain/owner-mode/owner-decision.ts` (`validateOwnerDecision` DEC-RULE-1..6, `OWNER_DECISION_STATUS_TRANSITIONS`, `validateDecisionRights`, `assertAllowsActionCreation`) on the `OwnerDecision`/`OwnerDecisionRights` models.
- **Approval state mapping (prompt canon → repo canon, no enum change per Phase-1 rule):** PENDING_OWNER_DECISION→`needs_more_data`/`needs_human_review`; APPROVED→`accepted`; REJECTED & MARKED_INFEASIBLE→`rejected` (+reason); NEEDS_MORE_EVIDENCE→`needs_more_data`; SUPERSEDED/modified→`modified`; CONVERTED_TO_EXPERIMENT→experiment infra (Phase 7); OWNER_OVERRIDE→anti-overreliance acknowledgement (below).
- **Owner-override + evidence-requirement (§1.13/§21):** `domain/owner-mode/recommendation-verification.ts` — `runVerification`, `checkAntiOverrelianceComplete`, `assertVerificationAllowsOwnerDecision` (DEC-RULE-4: `unsafe_to_recommend` blocks any decision; overreliance acknowledgement preserves the warning before an owner proceeds on weak confidence).
- **Evidence bundle/snapshot:** `EvidenceBundle`/`EvidenceItem`, `OwnerEvidenceRecord`, `OwnerRecommendationEvidence`; domain `diagnosis-evidence`, `evidence-capture`, `evidence-verification`.
- **Tests verified green:** owner-decision, recommendation-verification, recommendation-tracking, decision-memory (235) + diagnosis-evidence, evidence-capture, evidence-verification (120) = **7 files / 355 passed**.
- **Known limitation:** operator-cannot-approve / cross-workspace-denied are route-boundary checks needing DB+auth (DB-gated here) → no API/DB_TESTED claim for the security matrix this slice; domain-level gating verified.

### Phase 3 decision record (financial survival + unit economics) — VERIFICATION ONLY
Already implemented and tested; **no code added** (aliasing the prompt's `calculateFinancialSurvival`/`calculateUnitEconomics` over existing functions would be forbidden duplication, Gap G2 resolved as "exists under canonical names").
- **Survival (pure):** `domain/owner-finance/metrics.ts` — `survivalState()` (SAFE/WATCH/AT_RISK/CRITICAL/INSOLVENT_RISK), `survivalTier()`, `computeFinancialMetrics()`, `cashRunwayDays()`, `breakEvenRevenue()`, gross/net/contribution margins. Parallel `domain/owner-cashflow/metrics.ts`. `SURVIVAL_RUNWAY_MONTHS=3` in `consulting-engine/survival-prioritization.ts`.
- **Insufficient-financial-data:** `domain/owner-finance/data-confidence.ts` (`calculateDataConfidence`, `missingCriticalFinanceInputs`) lowers confidence on missing inputs.
- **Growth-affordability gate (fail-closed):** `services/financial-constraints.ts` `evaluateFinancialConstraints()` → `canAffordGrowth/Experiment/Acquisition/Talent`; blocks growth when survival at risk / runway short / debt high.
- **Cash-critical defensive priority:** `services/consulting-engine/survival-prioritization.ts` `chooseFirstAction()`.
- **Unit economics:** `services/growth/unit-economics-engine.ts` — CAC, LTV, CAC-payback, LTV:CAC ratio, contribution metrics + break-even units, `assessUnitEconomicsHealth`; route `POST /api/growth/unit-economics`.
- **Tests verified green:** owner-finance metrics+diagnosis, owner-cashflow, financial-constraints, survival-prioritization, unit-economics-engine, survival-intelligence → **11 files / 229 passed, 5 DB-gated skipped**.
- **Known limitation:** persistence (`owner-finance/persistence.db.test.ts`, `services.db.test.ts`) is DB-gated and not run here (no DATABASE_URL) → no DB_TESTED claim.

### Phase 2 decision record (data quality + input guidance)
- **Already implemented + verified:** `domain/business-facts/data-quality.ts` (`scoreDataQuality` → `data_quality_score`, 7 dimensions, `high_confidence_blocked`, `recommendation_confidence_tier/cap`), completeness/recency/source-reliability/extraction subscores, and the §12 `<50` high-confidence block. Owner-facing missing-input guidance exists live via `services/owner-intake/intake.service.ts` (`getIntakeDashboard` → `priorityGuidance`) behind route `GET /api/owner/intake/dashboard`.
- **Genuine gap closed:** the canonical §15 five-state **diagnosis-permission** vocabulary (`SAFE_TO_DIAGNOSE`…`UNSAFE_TO_CONCLUDE`) did not exist (only boolean `canPresentDiagnosis` + `high_confidence_blocked`). Added one pure helper `domain/business-facts/diagnosis-permission.ts` (`assessDiagnosisPermission`) that derives the state + §16 enforcement flags (`blocksFinalRecommendation`, `blocksHighConfidence`, capped `confidenceCap`) from an already-computed `DataQualityScore`. Tests compose the real `scoreDataQuality` → `assessDiagnosisPermission` chain.
- **Deliberately NOT done (minimum-code / regression-risk):** the live owner diagnosis services use a **separate** per-domain confidence model (`domain/owner-*/data-confidence.ts`, with a `dataConfidenceScore < 30` block + `missingCritical`). Rewiring all 7 to the business-facts pipeline + adopting the named permission status across routes would be a large, regression-prone refactor — deferred. **Known limitation:** the new permission classifier is not yet surfaced through a live route (classified STATIC_TESTED_ONLY, below the phase's API_TESTED target); the existing per-domain numeric gate already enforces input quality in production.

### Phase 1 decision record (status/threshold/source canon)
- **Status vocabulary already canonical** — `domain/constants/statuses.ts` (action/evidence/approval/recommendation/intervention/business-condition/health, etc.) and `domain/owner-mode/owner-decision.ts` (`OwnerDecisionStatus` + `OWNER_DECISION_STATUS_TRANSITIONS`). Per Phase 1 restriction, **no new status enum created**, nothing renamed. A prompt↔repo decision-status mapping helper was deliberately NOT added: it would be dead code (no caller), and the repo vocabulary is already the canonical owner decision state machine.
- **Thresholds already centralized** — `services/thresholds/threshold-service.ts` (`DEFAULT_THRESHOLDS`) + per-domain `domain/owner-*/thresholds.ts`. No new config layer created.
- **Source classification was the only genuine gap (G4)** — the canonical 8-class vocabulary (`VERIFIED_RECORD`…`UNKNOWN`) did not exist. Added one pure module `domain/owner-mode/source-classification.ts` mapping existing `ExtractionMethod`/`SourceDocumentKind`/`FactValidationStatus` → canon, with trust ordering enforcing §1.10. Tests are the active caller now; Phase 2 consumes it for evidence/data-quality weighting.
- **Pure helper extraction (G2) deferred** — `calculateFinancialSurvival`/`calculateUnitEconomics`/`calculateAttributionConfidence`/`checkLearningEligibility` are embedded in services with no standalone caller; extracting them now would be dead code. They are addressed in their own phases (3/9/10) where callers + tests exist.
