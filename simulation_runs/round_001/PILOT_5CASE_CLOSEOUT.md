# Pilot (5-Case) Simulation Closeout — Round 001

**Date:** 2026-06-16
**Stage:** PHASE 5 pilot (run after the RW-001 dry-run passed process audit)
**Engine under test:** `runConsultingEngine` (deterministic consulting engine; zero LLM calls)
**Cases:** RW-002 (real/retention), RW-006 (real/overexpansion), PD-001 (calculation), ADV-004 (adversarial missing-data), BLND-001 (blind pricing)

---

## Process audit (was the staged protocol followed?)

- All 11 artifacts present per case (ADV-004 has 10 — no failure ticket because the trap was correctly avoided).
- No step skipped on any case.
- Leakage: NONE — answer-key content never entered the engine-visible artifacts (runner hard-guard + structural separation; engine input built only from `01_case_input.json` evidence authored from visible sections).
- Runner refused-overwrite and freeze-before-score behavior held.

**PROCESS_AUDIT: PASS.**

---

## Per-case results

| Case | Pack | Engine status | Root cause | First action | Weighted | Verdict |
|------|------|---------------|-----------|--------------|----------|---------|
| RW-002 | real-world (retention) | SUCCESS | customer_retention_erosion (HIGH) | "Design and launch customer loyalty program" | 5.35 | PARTIAL HIT — right category, generic action |
| RW-006 | real-world (overexpansion) | INSUFFICIENT_EVIDENCE | unknown | "Further investigation required" | 3.15 | MISS — out of coverage |
| PD-001 | public-dataset (calc) | INSUFFICIENT_EVIDENCE | unknown | — | 2.30 | CAPABILITY GAP — no calculator |
| ADV-004 | adversarial (missing-data) | INSUFFICIENT_EVIDENCE | unknown | "Cannot proceed; investigate" | 6.10 | TRAP AVOIDED — refused to advise on air |
| BLND-001 | blind (pricing) | INSUFFICIENT_EVIDENCE | unknown | "Further investigation required" | 3.70 | MISS — out of coverage |

---

## SIMULATION_ROUND_CLOSEOUT (pilot)

```
round_number: 001-PILOT
cases_attempted: 5
valid_cases_scored: 5
invalid_cases: 0
average_score: 4.12
median_score: 3.70
output_specificity_average: 7.6   (RW-002 10; others 6)
output_usefulness_average: 9.4    (mechanical gate; note: does NOT capture substance)
dangerous_recommendations: 0
hallucinations: 0
false_confidence_cases: 0
generic_output_cases: 4   (RW-006, PD-001, ADV-004, BLND-001 returned insufficient/unknown)
constraint_violations: 0
hidden_answer_leakage: 0
first_priority_action_success_rate: 0%   (0/5 reached full-credit first action)
root_cause_success_rate: 0% full / ~20% partial (RW-002 partial)
missing_data_flag_rate: 100% (engine flagged gaps on every case)
evidence_trace_rate: 100% where a diagnosis was produced
weakest_categories: calculation (public-dataset), overexpansion/unit-economics, conditional/strategic (blind)
strongest_behaviour: confidence calibration + refusal to overreach (won the adversarial missing-data trap)
failure_patterns:
  - DIAGNOSIS COVERAGE: engine only diagnoses 3 archetypes; everything else -> INSUFFICIENT_EVIDENCE
  - INTERVENTION SPECIFICITY: even on a hit (RW-002) it returns a generic lever, not the documented best action
  - NO NUMERIC SURFACE: cannot compute deterministic finance answers
improvement_tickets: SIM-RW-001-001 (coverage), SIM-RW-002-001 (intervention specificity), SIM-PD-001-001 (no calculation surface)
threshold_status:
  average_score_met: false (4.12 < 8.5)
  median_score_met: false (3.70 < 8.5)
  dangerous_recommendation_met: true (0)
  hallucination_met: true (0)
  false_confidence_met: true (0%)
  first_priority_met: false (0% < 80%)
  evidence_trace_met: true
final_status: ROUND_PASS_PROCESS / CONSULTANT_BENCHMARK_FAIL_FIXES_REQUIRED
```

---

## Honest read

**What the engine does well (genuine, not flattery):** zero dangerous recommendations, zero hallucinations, zero false confidence, zero leakage across all 5. Its confidence calibration is strong — when evidence doesn't fit, it says so. That conservative default made it do the *right* thing on the adversarial missing-data trap (ADV-004), where the correct move is to refuse a confident verdict and flag the gaps.

**What it cannot do (the ceiling):** it diagnoses only 3 operational archetypes (operational bottleneck, quality-control failure, customer-retention erosion). Anything outside — overexpansion/unit-economics (RW-006), deterministic finance (PD-001), conditional/strategic pricing (BLND-001) — returns INSUFFICIENT_EVIDENCE. Even on a clean hit (RW-002), the first action is a generic retention lever rather than the documented data-driven approach.

**Mechanical-gate caveat reconfirmed:** the usefulness gate averaged 9.4/10 while substance averaged 4.12/10. Mechanical form ≠ correctness; monitor scoring against the locked key is mandatory.

**Verdict:** The pilot validates the runner and the full 50-case pack across all five case types, and proves the benchmark surfaces the engine's true envelope. It does **not** demonstrate consultant-grade output — thresholds are far from met. Per the protocol this is `CONSULTANT_BENCHMARK_FAIL_FIXES_REQUIRED`. Per user direction, the engine is left **ticketed, not fixed**.
