execution_consultant_engine_v2.md

0. PURPOSE

This is the controlling execution contract for OpsIQ Consultant Engine remediation.

The objective is to make OpsIQ produce business-consultant output that is:

* correct on root cause,
* correct on first priority action,
* specific to the business,
* evidence-backed,
* constraint-aware,
* safe,
* calibrated,
* useful to an owner,
* validated on unseen cases.

The objective is not to pass Round 1 by overfitting.

This file supersedes weaker consultant-engine remediation instructions.

⸻

1. LOOP COMMAND

/continue-consultant-remediation

When invoked, Claude must:

1. Read this file fully.
2. Verify branch, commit, and working tree.
3. Verify frozen artifacts are unchanged.
4. Read latest closeouts.
5. Identify the next incomplete required step.
6. Execute only that step.
7. Run all required gates.
8. Produce required closeout.
9. Stop if a stop condition is triggered.
10. Never skip a required round, gate, audit, or manual review.

⸻

2. TRUSTED BASELINE

Frozen trusted baseline:

benchmark_status: TRUSTED
cases_manually_reviewed: 40
average_manual_score: 5.53
median_manual_score: 5.25
root_cause_accuracy: 15%
root_cause_missed_rate: 72.5%
first_action_accuracy: 0%
dangerous_recommendations: 0
hallucinations: 0
false_confidence: 0
answer_key_leakage: 0
slice_1_status: NO_EFFECT

These values may only be replaced by a new manually validated benchmark closeout.

⸻

3. IMMUTABLE ARTIFACTS

Never modify:

immutable_artifacts:
  - simulation_case_pack_real_world_v1.md
  - simulation_case_pack_public_dataset_v1.md
  - simulation_case_pack_synthetic_v1.md
  - simulation_case_pack_adversarial_v1.md
  - simulation_case_pack_blind_outcome_v1.md
  - simulation_runs/round_001/**/09_frozen_opsiq_output.json
  - simulation_runs/round_001/**/10_scoring_record.json
  - simulation_runs/round_001/**/11_failure_ticket.json
  - MANUAL_BASELINE_VALIDATION_PER_CASE.json
  - MANUAL_BASELINE_VALIDATION_AGGREGATE.json
  - MANUAL_BASELINE_VALIDATION_CLOSEOUT.md

Before every run, verify they are unchanged.

If changed, stop with BLOCKED_WITH_EVIDENCE.

⸻

4. NON-NEGOTIABLE RULES

Claude must not:

1. Use the old branch claude/continue-post-owner-build-wabkf5.
2. Modify immutable artifacts.
3. Use answer keys during engine execution.
4. Use hidden outcomes during engine execution.
5. Use scoring guides as retrieval material.
6. Hardcode case IDs.
7. Hardcode benchmark answers.
8. Delete failed cases.
9. Replace failed cases.
10. Lower thresholds.
11. Count automated-assisted scores as final without manual review where required.
12. Treat unit tests as benchmark proof.
13. Treat weighted score alone as consultant proof.
14. Treat safe refusal as correct when evidence was sufficient for diagnosis.
15. Claim consultant-grade before Round 2 passes.
16. Claim production readiness.
17. Continue after static gate failure.
18. Continue after safety regression.
19. Continue after leakage.
20. Continue after branch confusion.
21. Continue after three no-effect slices.
22. Skip the strategy audit before Slice 2.
23. Skip Round 2 before consultant-grade claim.
24. Skip manual review before final benchmark claim.

Any violation requires immediate stop.

⸻

5. PRIMARY METRICS

Primary metrics:

primary_metrics:
  root_cause_accuracy
  first_priority_action_accuracy
  business_relevance
  constraint_awareness
  confidence_calibration
  evidence_traceability
  safety

Secondary metrics:

secondary_metrics:
  weighted_score
  output_structure
  formatting

A slice cannot pass unless at least one primary metric improves and no safety metric worsens.

⸻

6. REQUIRED PRE-RUN GATE

Every loop run must begin with:

PRE_RUN_GATE:
  current_branch:
  current_commit:
  working_tree_clean:
  immutable_artifacts_unchanged:
  latest_closeout_read:
  current_required_step:
  old_diverged_branch_used: false
  production_db_used: false
  hosted_neon_used: false
  final_status:
    - PRE_RUN_PASS
    - PRE_RUN_BLOCKED_WITH_EVIDENCE

If PRE_RUN_PASS is not achieved, stop.

⸻

7. CURRENT ROADMAP STATE

slice_0:
  status: COMPLETE
slice_1:
  status: COMPLETE_NO_EFFECT
benchmark_harness:
  status: REMEDIATED
manual_baseline:
  status: TRUSTED
slice_2:
  status: BLOCKED_PENDING_STRATEGY_AUDIT
slice_3:
  status: PENDING
slice_4:
  status: DEFERRED_UNTIL_ROUND_2
slice_5:
  status: PENDING
round_2:
  status: NOT_CREATED
consultant_grade_claim:
  status: PROHIBITED

⸻

8. NEXT REQUIRED STEP

The next required step is:

REMEDIATION_STRATEGY_DECISION_AUDIT

Reason:

slice_1: NO_EFFECT
root_cause_accuracy: 15%
first_action_accuracy: 0%
slice_2_numeric_layer_may_not_address_top_failure: true

Claude must not implement Slice 2 until this audit is complete.

⸻

9. STRATEGY DECISION AUDIT

Before Slice 2, produce:

REMEDIATION_STRATEGY_DECISION_AUDIT:
  failure_modes_ranked:
  cases_affected:
  owner_use_impact:
  score_impact:
  root_cause_accuracy_impact:
  first_action_accuracy_impact:
  whether_slice_2_addresses_top_failure:
  alternatives:
    revise_slice_1_triggers:
    evidence_dimension_classifier:
    first_priority_action_selector:
    business_context_integration:
    numeric_layer:
    round_2_case_pack_first:
  recommended_next_step:
  reason:
  final_status:
    - AUTHORIZE_SLICE_2
    - DEFER_SLICE_2
    - REVISE_ROADMAP
    - BLOCKED_WITH_EVIDENCE

If the audit says REVISE_ROADMAP, update the execution plan before implementation.

⸻

10. IMPLEMENTATION SLICE RULES

For every implemented slice:

1. Define target failure mode.
2. Define target cases.
3. Define expected primary metric improvement.
4. Implement narrow change.
5. Add unit tests.
6. Add regression tests.
7. Run static gates.
8. Run targeted benchmark subset.
9. Preserve baseline outputs.
10. Store new outputs separately.
11. Score with trusted harness.
12. Manually review where required.
13. Compare primary metrics.
14. Produce closeout.
15. Stop.

Required gates:

static_gates:
  npm_ci: pass
  prisma_validate: pass
  prisma_generate: pass
  tsc_noEmit: pass
  build: pass

⸻

11. SLICE PROMOTION RULE

A slice passes only if:

promotion_gate:
  static_gates_pass: true
  tests_pass: true
  immutable_artifacts_unchanged: true
  answer_key_leakage: 0
  dangerous_recommendations_delta: 0
  hallucinations_delta: 0
  false_confidence_delta: 0
  constraint_violation_delta: 0
  at_least_one_primary_metric_improved: true

If no primary metric improves:

status: SLICE_NO_EFFECT

If safety worsens:

status: SLICE_REGRESSION

If benchmark cannot measure impact:

status: SLICE_UNMEASURABLE_BLOCKED

⸻

12. ROUND 1 USE RULES

Round 1 may be used for:

* regression testing,
* targeted before/after comparison,
* failure pattern analysis,
* safety preservation.

Round 1 may not be used for:

* final consultant-grade validation,
* retrieval answer source,
* hidden answer source,
* score-only optimization,
* overfitted hardcoding.

⸻

13. ROUND 2 CREATION RULES

Round 2 is mandatory before consultant-grade claim.

Round 2 must contain at least 50 fresh cases:

round_2_case_mix:
  real_world_cases: >=15
  public_dataset_cases: >=10
  synthetic_cases: >=10
  adversarial_cases: >=10
  blind_outcome_cases: >=5

Round 2 must have:

round_2_requirements:
  no_round_1_case_reuse: true
  no_round_1_answer_key_reuse: true
  no_round_1_scoring_guide_reuse: true
  leakage_audit: pass
  source_quality_audit: pass
  manual_answer_keys: required
  manual_scoring_guides: required

If Round 2 case quality fails, do not run benchmark.

⸻

14. ROUND 2 EXECUTION RULES

Round 2 execution must follow the same staged owner-mode process:

1. owner intake,
2. data submission,
3. data quality check,
4. fact confirmation,
5. diagnosis,
6. recommendation,
7. constraint check,
8. quality gate,
9. frozen output,
10. manual scoring,
11. failure ticket.

No step may be skipped.

If any case skips a step, invalidate that case.

⸻

15. CONSULTANT-GRADE PASS GATE

Consultant-grade may be claimed only if Round 2 meets all:

consultant_grade_gate:
  valid_cases: >=50
  average_score: >=8.5
  median_score: >=8.5
  cases_at_or_above_8_5: >=80%
  root_cause_accuracy: >=80%
  first_priority_action_accuracy: >=80%
  dangerous_recommendations: 0
  answer_key_leakage: 0
  hallucination_rate: <=2%
  false_confidence_rate: <=3%
  evidence_trace_rate: >=95%
  manual_review_complete: true

If any condition fails, consultant-grade is prohibited.

⸻

16. ANTI-OVERFITTING RULES

Claude must:

anti_overfitting:
  preserve_round_1_failures: true
  add_fresh_cases_before_final_claim: true
  compare_round_1_and_round_2_performance: true
  flag_large_round_1_gain_without_round_2_gain: true
  reject_hardcoded_case_patterns: true

If Round 1 improves but Round 2 does not, the change is not validated.

⸻

17. ARCHITECTURE CEILING RULE

If three consecutive slices produce no material improvement in:

* root cause accuracy, and
* first priority action accuracy,

stop and produce:

ARCHITECTURE_CEILING_REPORT:
  slices_attempted:
  metric_changes:
  reason_current_architecture_failed:
  recommended_architecture_change:
  options:
    hybrid_deterministic_plus_llm:
    retrieval_augmented_reasoning:
    business_context_reasoning_layer:
    action_prioritization_model:
    human_review_layer:
  final_status:
    - ARCHITECTURE_CEILING_CONFIRMED
    - MORE_EVIDENCE_REQUIRED

⸻

18. HARD STOP CONDITIONS

Stop immediately if:

hard_stop:
  immutable_artifacts_modified: true
  answer_key_leakage: true
  hidden_outcome_leakage: true
  dangerous_recommendations_increase: true
  hallucinations_increase: true
  false_confidence_increase: true
  benchmark_harness_untrusted: true
  static_gates_fail: true
  branch_confusion: true
  forbidden_branch_used: true
  production_db_used: true
  unapproved_hosted_db_used: true

⸻

19. DB RULES

Do not use production DB.

Do not use hosted Neon unless explicitly authorized.

For DB-backed changes:

db_gate:
  postgres_16_lane_b_required: true
  github_actions_proof_required: true

If no DB changes are made, DB workflow is not required.

⸻

20. REQUIRED CLOSEOUT FORMAT

Every run must end with:

CONSULTANT_REMEDIATION_RUN_CLOSEOUT:
  branch:
  commit_before:
  commit_after:
  current_step:
  action_taken:
  files_changed:
  immutable_artifacts_unchanged:
  static_gates:
    npm_ci:
    prisma_validate:
    prisma_generate:
    tsc_noEmit:
    build:
  benchmark_actions:
  manual_review_actions:
  primary_metric_changes:
  safety_changes:
  roadmap_changes:
  stop_condition_triggered:
  next_required_action:
  final_status:
    - READY_FOR_NEXT_LOOP
    - READY_FOR_USER_DECISION
    - BLOCKED_WITH_EVIDENCE
    - CONSULTANT_GRADE_VALIDATED
    - ARCHITECTURE_CEILING_CONFIRMED

No other final status is allowed.

⸻

21. FILE CREATION CLOSEOUT

When this file is created, output:

EXECUTION_CONSULTANT_ENGINE_V2_CLOSEOUT:
  file_created: execution_consultant_engine_v2.md
  branch:
  commit:
  old_execution_file_superseded:
  loop_command: /continue-consultant-remediation
  next_required_action: REMEDIATION_STRATEGY_DECISION_AUDIT
  implementation_started: false
  final_status:
    - EXECUTION_V2_READY
    - BLOCKED_WITH_EVIDENCE