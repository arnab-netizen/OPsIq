# Execution: Realistic Owner-Mode Simulation Protocol

**Status:** ACTIVE
**Created:** 2026-06-16
**Purpose:** Define a staged, owner-realistic process for benchmarking whether OpsIQ produces correct, useful, specific, evidence-backed consultant output under realistic owner inputs, messy/missing data, constraints, and decision pressure.

This is the single source of truth for how the OpsIQ simulation benchmark is executed, monitored, scored, and closed out. It overrides any casual prompt-answer approach.

---

## 0. Non-Negotiable Rules

- Do **not** claim consultant-grade until benchmark thresholds are met with valid cases.
- Do **not** claim production readiness from simulation results.
- Do **not** claim dangerous-recommendation safety until proven by scored cases.
- Do **not** pass any `CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ` content into the OpsIQ engine input.
- Do **not** score before the OpsIQ output is frozen.
- Do **not** score using an answer key that was not locked (committed) before the run.
- Do **not** silently modify OpsIQ production logic between cases.
- Do **not** overfit the engine to the case pack.
- Do **not** treat 15 real-world cases as a full Round 1. Round 1 requires ≥ 50 valid cases unless the user explicitly re-scopes.
- Every skipped step invalidates the case run.
- Every failed workflow/script must be inspected (logs) before rerun.

---

## 1. What "OpsIQ" Means In This Benchmark

The OpsIQ engine under test is the deterministic consulting engine:

- Entry point: `runConsultingEngine(input: ConsultingEngineInput): ConsultingEngineOutput`
  (`src/services/consulting-engine/orchestrator.ts`)
- Pipeline: evidence analysis → constraint identification → diagnosis → intervention design → prioritization → scenarios → decision memo.
- **It contains no LLM/external calls. It is fully deterministic pattern matching.**
- Input contract: `ConsultingEngineInput` (`src/domain/consulting-engine/types.ts`):
  `engagementId`, `businessProblem`, `evidence[]` (dimension/finding/confidence/source/isCritical/supportingData), optional `existingConstraints`, `clientContext` (industry/size/revenueImpactUrgency).
- Output contract: `ConsultingEngineOutput`: `decisionMemo` (rootCauseDiagnosis, recommendedInterventions, scenarios, constraints, implementation, limitations, nextReviewTriggers), `status`, `warnings`.

**Known engine capability boundary (must be reflected in scoring, not hidden):**
The diagnosis engine recognizes only three root-cause patterns plus UNKNOWN:
`OPERATIONAL_BOTTLENECK`, `QUALITY_CONTROL_FAILURE`, `CUSTOMER_RETENTION_EROSION`, `UNKNOWN`.
Cases whose true root cause lies outside these patterns are expected to return
`UNKNOWN` / `INSUFFICIENT_EVIDENCE`. This is a legitimate, faithful benchmark result —
it is the engine telling the truth about its limits — and must be scored honestly,
not engineered around.

---

## 2. Staged Owner Simulation Steps

Every case runs through ten ordered steps. Steps 1–4 are owner/intake inputs derived **only** from `CASE_INPUT_VISIBLE_TO_OPSIQ`. Steps 5–7 are OpsIQ engine output. Step 8 is a quality gate. Step 9 is scoring against the locked answer key. Step 10 is a failure ticket.

```
REAL_WORLD_OWNER_SIMULATION_STEPS:

step_1_owner_intake:           # artifact 02
  purpose: collect business context and owner goal
  required_output: [business_type, stage, owner_goal, owner_constraints,
                    immediate_concern, available_data, unavailable_data,
                    time_horizon, risk_appetite]

step_2_data_submission:        # captured in case input (artifact 01)
  purpose: simulate actual uploaded/manual data
  required_output: [financial_data, sales_customer_data, operations_data,
                    marketing_data, staff_capacity_data, debt_cash_data,
                    data_source_label, data_quality_rating]

step_3_data_quality_check:     # artifact 03
  purpose: OpsIQ/runner must detect weak/missing/contradictory data BEFORE advice
  required_output: [missing_critical_data, contradictions, stale_data,
                    unreliable_fields, confidence_cap, what_cannot_be_concluded]

step_4_business_fact_confirmation:  # artifact 04
  purpose: owner confirms facts before they are used
  required_output: [facts_accepted, facts_rejected, facts_needing_clarification,
                    corrected_facts, final_facts_used_for_diagnosis]

step_5_diagnosis:              # artifact 05 (from engine)
  required_output: [root_causes_ranked, evidence_per_root_cause,
                    confidence_per_root_cause, rejected_hypotheses, missing_evidence]

step_6_recommendation:         # artifact 06 (from engine)
  required_output: [first_priority_action, why_first, blocked_actions,
                    low_risk_alternative, expected_impact,
                    cost_time_staff_requirement, risk, verification_metric, review_date]

step_7_owner_constraint_check: # artifact 07 (engine constraints + runner fit check)
  required_output: [budget_fit, time_fit, staff_fit, operational_feasibility,
                    cash_runway_fit, legal_compliance_risk, actions_removed_due_to_constraints]

step_8_output_quality_gate:    # artifact 08
  required_output: [generic_advice_detected, hallucination_detected,
                    unsupported_claim_detected, false_confidence_detected,
                    missing_data_ignored, dangerous_recommendation_detected, pass_or_fail]

step_9_scoring_against_answer_key:  # artifact 10 (monitor-authored, post-freeze)
  required_output: [root_cause_score, first_action_score, financial_logic_score,
                    constraint_score, risk_score, missing_data_score, evidence_score,
                    actionability_score, final_weighted_score, pass_fail]

step_10_failure_ticket:        # artifact 11
  required_output: [failure_type, affected_module, evidence, required_fix,
                    tests_needed, regression_cases_needed, approval_required]
```

---

## 3. Monitoring Rules (Claude as Monitor)

Before advancing each step, the prior step's output is checked. Triggered flags:

- Owner intake incomplete → `CASE_INPUT_INCOMPLETE`.
- Weak data not flagged by OpsIQ/runner → `FALSE_CONFIDENCE`.
- Generic advice → `GENERIC_ADVICE_FAIL`.
- Recommendation violates a stated constraint → `CONSTRAINT_VIOLATION_FAIL`.
- Invented number/source/customer-behavior/outcome → `HALLUCINATION_FAIL`.
- Recommendation lacks verification metric → `ACTIONABILITY_FAIL`.
- Cash/runway ignored in a cash-sensitive case → `FINANCIAL_LOGIC_FAIL`.
- High confidence on missing data → `FALSE_CONFIDENCE_FAIL`.
- Hidden answer-key content reached the engine → `LEAKAGE_FAIL` (invalidate case).
- Any step skipped → invalidate the case run.
- Any script/workflow failure → stop, inspect logs, then rerun.

---

## 4. Output Usefulness Gate (runs before scoring)

```
OUTPUT_USEFULNESS_GATE:
  reject_if:
    - recommendation could apply to any business
    - no specific root cause
    - no numbers used where numbers were available
    - no constraints considered
    - no first priority action
    - no tradeoff
    - no evidence trail
    - no measurable follow-up
    - no timeline
    - no owner next step
    - no missing data list
    - no confidence reason
  result:
    output_specificity_score: 0-10
    output_usefulness_score: 0-10
    generic_output: true/false
    pass_gate: true/false
```

A case **fails** if `output_specificity_score < 8` OR `output_usefulness_score < 8`,
even if the root cause is partially correct.

---

## 5. Runner Behavior

The runner (`simulation_runner/run-case.ts`) enforces the staged process:

- Reads `01_case_input.json` (CASE_INPUT only). Never loads the answer key.
- Maps visible facts → `ConsultingEngineInput` using only the case-input evidence array (hand-authored from the visible section; the runner performs no answer-aware translation).
- Runs `runConsultingEngine`.
- Writes each step output as a separate artifact.
- Freezes the engine output (`09_frozen_opsiq_output.json`) before any scoring.
- Runs the deterministic data-quality assessment (step 3) and usefulness gate (step 8).
- Never overwrites a prior run (refuses if the case dir already has a frozen output unless `--force`).
- Never mutates production logic.

Scoring (artifact 10) and failure ticket (artifact 11) are authored by the monitor (Claude) **after** the freeze, by comparing `09_frozen_opsiq_output.json` against the locked `CASE_ANSWER_KEY_HIDDEN_FROM_OPSIQ` from the committed case pack.

### Artifact layout

```
simulation_runs/
  round_001/
    case_RW-001/
      01_case_input.json
      02_owner_intake_output.json
      03_data_quality_output.json
      04_confirmation_output.json
      05_diagnosis_output.json
      06_recommendation_output.json
      07_constraint_check_output.json
      08_quality_gate_output.json
      09_frozen_opsiq_output.json
      10_scoring_record.json        # monitor-authored, post-freeze
      11_failure_ticket.json        # monitor-authored, if failed
```

---

## 6. Execution Sequence (run quality must be proven before scale)

1. Dry-run **1 case only**. Audit every step was followed.
2. If dry-run passes process audit → run **5-case pilot**. Audit.
3. If pilot passes → run full **50-case Round 1** (requires 50 valid cases available).
4. If 50 valid cases are not available → **stop** and create missing case packs, or request authorized smaller-scope pilot.

---

## 7. Scoring Rubric (weighted, 0–10 final)

| Dimension | Weight |
|---|---|
| root_cause_score | 20% |
| first_action_score | 20% |
| recommendation/actionability_score | 15% |
| reasoning/evidence_score | 15% |
| business_relevance/financial_logic_score | 15% |
| confidence/constraint_score | 10% |
| risk + missing_data + audit clarity | 5% |

`final_weighted_score` is on a 0–10 scale. A case passes only if it clears the usefulness gate **and** `final_weighted_score >= 8.5` with zero automatic-fail conditions.

---

## 8. Acceptance Thresholds (consultant-quality)

```
CONSULTANT_QUALITY_THRESHOLDS:
  minimum_valid_cases: 50
  average_score: >= 8.5
  median_score: >= 8.5
  output_specificity_average: >= 8.5
  output_usefulness_average: >= 8.5
  dangerous_recommendations: 0
  hallucinated_material_facts: 0
  hidden_answer_leakage: 0
  owner_constraint_violations: 0
  false_confidence_rate: <= 3%
  generic_output_rate: <= 5%
  first_priority_action_success_rate: >= 80%
  root_cause_success_rate: >= 80%
  missing_data_flag_rate: >= 85%
  evidence_trace_rate: >= 95%
```

If any threshold is unmet → `CONSULTANT_BENCHMARK_FAIL_FIXES_REQUIRED`.

---

## 9. Stop / Fix Rules

- Case fails (non-critical): create improvement ticket, classify failure, continue round.
- Dangerous recommendation: **stop round**, create P0 ticket, await user authorization to fix.
- Hallucination: stop or mark high-severity by materiality; create P0/P1 ticket.
- Generic output: continue round, ticket as quality failure.
- Process step skipped: invalidate run, fix runner/protocol before continuing.

Fixes are never applied silently mid-round; every fix is ticketed first and, for P0, gated on user authorization.
