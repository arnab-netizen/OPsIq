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

13A. UNIVERSAL BENCHMARK ARTIFACT QUALITY GATE

## UNIVERSAL BENCHMARK ARTIFACT QUALITY GATE

This gate applies to every benchmark artifact, every case pack, every case subset, every future round, every rerun, and every slice validation pack.

It applies to:
- Round 2,
- Round 3,
- Round 4,
- every future benchmark round,
- every case pack,
- every synthetic / adversarial / blind / public-dataset / real-world pack,
- every slice-validation benchmark subset,
- every post-remediation rerun,
- every future owner-mode simulation pack.

No benchmark execution may begin unless this gate passes.

```yaml
universal_benchmark_artifact_quality_gate:
  complete_case_pairs: required_count/required_count
  case_specific_answer_keys: required_count/required_count
  duplicate_inputs: 0
  duplicate_answer_keys: 0
  near_duplicate_inputs: 0
  near_duplicate_answer_keys: 0
  generic_template_answer_keys: 0
  placeholder_cases: 0
  empty_directories: 0
  scorable_answer_keys: required_count/required_count
  parser_valid_cases: required_count/required_count
  empty_criteria_cases: 0
  malformed_answer_keys: 0
  fallback_required_cases: 0
  degenerate_score_risk_cases: 0
  leakage_events: 0
  high_similarity_to_prior_rounds: 0
  hidden_outcome_leakage: 0
  answer_key_terms_in_visible_prompt: 0
  average_case_quality: ">=8.0"
  easy_case_rate: "<=20%"
  adversarial_leakage_resistance: ">=9/10"
  blind_leakage_resistance: ">=9/10"
  public_dataset_expected_values_present: all_public_dataset_cases
  public_dataset_tolerances_present: all_public_dataset_cases
  owner_decision_pressure_present: required_count/required_count
  source_references_present_for_real_world: all_real_world_cases
  final_verdict: BENCHMARK_ARTIFACTS_READY
```

If any condition fails:
- Claude must not execute the benchmark.
- Claude must not mark the round complete.
- Claude must not mark the slice complete.
- Claude must not claim readiness.
- Claude must fix defects.
- Claude must rerun the full quality gate.
- Claude must repeat until pass or BLOCKED_WITH_EVIDENCE.

step_completion_rule:
  No step may be marked complete unless:
    - all expected artifacts exist,
    - all artifacts are non-empty,
    - all artifacts are case-specific where applicable,
    - all parser/scoring compatibility checks pass,
    - all leakage checks pass,
    - all duplicate checks pass,
    - all quality gates pass,
    - closeout claims match file evidence.

after_every_artifact_change_self_audit:
  after every created or modified benchmark artifact, Claude must run:
    - inventory audit,
    - duplicate audit,
    - near-duplicate audit,
    - leakage audit,
    - parser compatibility audit,
    - scoring specificity audit,
    - case quality audit,
    - closeout consistency audit.
  If any fail, Claude must fix before marking the step complete.

closeout_truth_rule:
  every closeout claim must be source-verified against files.
  If file evidence contradicts the closeout, the closeout is invalid.
  Invalid closeouts must be corrected before proceeding.

no_generic_template_rule:
  template reuse is allowed only for structural fields.
  The following must be case-specific:
    - factual content,
    - root cause rationale,
    - symptom vs contributing factor vs root cause,
    - first action,
    - reason first action is first,
    - scoring guide,
    - source references,
    - expected answer,
    - automatic-fail conditions.

benchmark_execution_prohibition:
  Benchmark execution is prohibited unless:
    - UNIVERSAL_BENCHMARK_ARTIFACT_QUALITY_GATE.final_verdict = BENCHMARK_ARTIFACTS_READY
    - CURRENT_WORKFLOW_STATE.md records the benchmark artifact gate as passed
    - all expected case artifacts are present and parser-compatible.

all_rounds_rule:
  These rules apply to every benchmark round:
    - Round 2,
    - Round 3,
    - Round 4,
    - every future validation round,
    - every rerun used for promotion,
    - every slice-validation case subset.

no_round_specific_loophole_rule:
  Claude may not interpret benchmark quality gates as Round-2-only.
  If a future round, rerun, or slice-validation subset uses cases, answer keys,
  scoring guides, or benchmark outputs, the universal gate applies.

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

17A. OWNER_MODE_CONSULTANT_GRADE_ARCHITECTURE ROADMAP

The Architecture Ceiling Rule triggered Round 2 failure (0% root-cause accuracy, 0% first-action accuracy).
No consultant-grade claim is possible with current deterministic pattern-matching architecture.

Owner-mode must pivot to a long-term architecture roadmap toward practical consultant-grade capability.
However, no claim of consultant-grade may ever be made until measured by benchmark and validated by real-business evidence.

The roadmap comprises four stages: A (evidence synthesis), B (causal reasoning), C (LLM reviewer), D (owner validation).

### STAGE A: Evidence Synthesis + Hypothesis Ranking + Constraint-Aware Action + Numeric Reasoning

**Target Metrics:**
* root-cause accuracy: 40-60%
* first-action accuracy: 30-50%
* evidence trace rate: ≥85%
* dangerous recommendations: 0
* hallucinations: ≤2%

**Required Components:**
1. Evidence synthesis engine — aggregate multi-dimensional evidence (financial, operational, market, team)
2. Symptom vs contributing factor vs root-cause separator — distinguish symptom from root diagnosis
3. Top-3 hypothesis generator — surface competing hypotheses ranked by confidence
4. Hypothesis ranking with supporting/conflicting evidence — show why alternatives are weaker
5. Constraint-aware first-action selector — weight actions by constraint impact (cost, timeline, risk)
6. Numeric reasoning layer — handle quantitative decision logic, margin calculations, financial thresholds
7. Missing-data refusal rules — refuse diagnosis if required evidence is absent
8. Confidence calibration — bound confidence to measured accuracy; no false certainty

**Minimum Scope (no scope creep):**
* Do not include causal graphs (Stage B)
* Do not include adversarial trap detection (Stage B)
* Do not include LLM reasoning (Stage C)
* Do not include owner outcome tracking (Stage D)

---

### STAGE B: Multi-Hypothesis Causal Reasoning + Adversarial/Blind Outcome Logic

**Target Metrics:**
* root-cause accuracy: 60-75%
* first-action accuracy: 50-70%
* adversarial pass rate: ≥80%
* blind-outcome pass rate: ≥75%

**Required Components:**
1. Causal reasoning graph — model cause-effect relationships between business factors
2. Competing hypothesis eliminator — use evidence to reject false hypotheses
3. Adversarial trap detector — recognize patterns that trick deterministic reasoning
4. Blind-outcome decision evaluator — decide without knowing future outcome
5. Counterfactual action comparison — compare what would happen under alternative actions
6. Second-order consequence check — identify unintended consequences of recommended action

**Minimum Scope (no scope creep):**
* Do not include LLM reasoning (Stage C)
* Do not include human review at scale (Stage C)
* Do not include owner outcome tracking (Stage D)

---

### STAGE C: Evidence-Grounded LLM Reasoning Reviewer + Verification Layer

**Target Metrics:**
* root-cause accuracy: 75-90%+
* first-action accuracy: 75-90%+
* evidence trace rate: ≥95%
* confidence calibration error: ≤3%
* dangerous recommendations: 0

**Required Components:**
1. LLM reasoning reviewer — use LLM to reason about evidence from Stage A/B outputs
2. Strict evidence-only grounding — LLM can only reference evidence provided by deterministic engine
3. No unsupported claims — LLM cannot suggest facts not in the evidence
4. Deterministic safety validator — check all recommendations against safety rules
5. Hallucination detector — reject LLM output if it claims facts not in evidence
6. Contradiction detector — reject LLM output if it contradicts deterministic output without evidence
7. Owner approval gate — no action taken without explicit owner approval
8. Final recommendation verifier — verify output is specific, actionable, and constraint-aware

**Minimum Scope (no scope creep):**
* Do not train LLM on cases (keep deterministic-first)
* Do not auto-apply recommendations (owner approval required)
* Do not include outcome tracking (Stage D)

---

### STAGE D: Real-Business Owner Validation

**Target Metrics:**
* validated on actual owner business data
* recommendations tracked to outcomes
* failed recommendations logged and analyzed
* learning candidates manually approved before implementation

**Required Components:**
1. Action/outcome tracking — record which recommendations were taken and what happened
2. Owner feedback capture — owner reports actual outcome vs predicted outcome
3. Result verification — validate that improvement actually happened
4. Learning approval gate — before any pattern is learned from owner data, owner approves
5. Regression monitoring — detect if old recommendations start failing

**Minimum Scope (no scope creep):**
* No auto-learning without approval
* No modification of answer keys from owner feedback
* No re-benchmark based on owner data without Stage C complete

---

⸻

17B. STAGE EXECUTION HOSTILE RULES

These rules apply to every stage implementation:

1. **No stage may be marked complete unless all target metrics for that stage are measured.**
   - Metrics must come from actual benchmark execution, not unit tests or claims.
   - If metrics cannot be measured (e.g., Stage D outcome tracking requires owner data), defer the stage.

2. **No "expected improvement" may be treated as actual improvement.**
   - Only measured, benchmark-validated improvement counts.
   - Design claims do not count.
   - Unit test improvements do not count.
   - Partial results do not count until all metrics for the stage pass.

3. **No benchmark pass may be claimed from Round 1 alone.**
   - Round 1 is used only for regression testing and failure pattern analysis.
   - Final stage validation requires Round 2.

4. **No benchmark pass may be claimed from Round 2 if cases were used during implementation.**
   - Round 2 is fixed before Stage A implementation begins.
   - Cases used during Slice 2A design are contaminated for Stage A final validation.
   - Fresh Round 3 required if Stage A uses Round 2 cases during design.

5. **Every stage must run: static gates, unit tests, regression tests, adversarial tests, benchmark subset, full benchmark where required, manual review where required.**
   - No shortcutting; no skipping tests.
   - If a test fails, stop and fix.

6. **Every output must preserve: evidence citations, confidence score, missing-data statement, root-cause reasoning, first-action rationale, owner constraint mapping.**
   - Engine output must be auditable to evidence.
   - Owner must understand why action was recommended.

7. **Any hallucination, unsafe recommendation, answer-key leakage, benchmark contamination, or frozen-artifact mutation causes immediate hard stop.**
   - BLOCKED_WITH_EVIDENCE status.
   - No progress until root cause fixed.

8. **If two consecutive architecture stages fail to materially improve root-cause accuracy and first-action accuracy, stop and produce architecture redesign report.**
   - Stage A targets 40-60% accuracy; if Stage A achieves only 5-10%, HALT.
   - Stage B targets 60-75% accuracy; if Stage A+B achieves only 35-45%, HALT.
   - No continuation without architecture redesign.

9. **If any closeout claim is not directly supported by repository files, tests, benchmark artifacts, and audit evidence, the closeout is invalid.**
   - All claims must be traceable to files.
   - "Expected to improve" ≠ "improved".
   - "Should work" ≠ "works".

10. **Claude must not skip, merge, compress, or silently mark complete any stage, gate, audit, test, benchmark, manual review, or closeout.**
    - Every step is required.
    - Every gate is required.
    - Skipping is not an option.

⸻

17C. NEXT REQUIRED STEP: DESIGN_STAGE_A_EXECUTION_SPEC

Round 2 execution failed (0% accuracy). The current deterministic pattern-matching architecture has reached its ceiling.

The next required step is NOT to implement Stage A immediately.

The next required step is to DESIGN the Stage A Execution Specification.

**Stage A implementation must not start until the Stage A execution specification is created, reviewed, and hostile-audited.**

**Stage A Spec must define:**

1. **Data Structures**
   - Evidence schema (dimensions, fields, enrichment)
   - Hypothesis structure (name, confidence, supporting/conflicting evidence)
   - Action structure (description, constraint impact, ranking)

2. **Services/Modules**
   - Evidence synthesis service
   - Symptom/contributing/root-cause separator
   - Hypothesis generator
   - Hypothesis ranker
   - Action selector
   - Numeric reasoning module
   - Confidence calibrator

3. **Scoring Targets**
   - Root-cause accuracy 40-60% (what evidence patterns distinguish root causes?)
   - First-action accuracy 30-50% (what constraints matter for action selection?)
   - Evidence trace 85% (what evidence is currently missed?)

4. **Test Cases**
   - Unit tests for each service (20+ test cases per service)
   - Regression tests on Round 1 (must not worsen)
   - Adversarial tests on Round 2 adversarial cases (must improve from 0%)

5. **Benchmark Cases**
   - Target subset of Round 2: 20 cases representing all root-cause types
   - Expected result: At least 8/20 correct (40% accuracy on subset = Stage A target lower bound)

6. **Safety Gates**
   - 0 dangerous recommendations (same as Round 1)
   - Confidence ≤ 65% for diagnosis (no false certainty)
   - Evidence trace ≥ 85% (at least 85% of evidence examined)

7. **Hallucination Gates**
   - All evidence cited must exist in case input
   - No facts claimed beyond input evidence
   - If LLM used, deterministic safety check blocks unsupported claims

8. **Rollback Rules**
   - If evidence trace drops below 75%, HALT and fix evidence service
   - If safety metrics worsen, HALT and review changes
   - If unit tests fail >10%, HALT and redesign

9. **Manual Review Rules**
   - Manual review required for all 20 benchmark cases
   - Manual review of 5 failed cases (understand why)
   - Manual review of 5 passed cases (verify not accidental)

10. **Exact Pass/Fail Criteria**
    - Stage A PASS: root-cause accuracy ≥40% on benchmark subset, evidence trace ≥85%, safety = clean
    - Stage A FAIL: root-cause accuracy <35% on benchmark subset, or evidence trace <80%, or safety regression

⸻

17D. LOOP RULE UPDATE

When /continue-consultant-remediation is invoked:

1. Read execution_consultant_engine_v2.md (all sections)
2. Verify branch, commit, and working tree
3. Verify frozen artifacts are unchanged
4. Read latest closeouts
5. Identify the next incomplete required step
6. Execute only that step

**The next required step is no longer incremental Slice 2.**

**The next required step is: DESIGN_STAGE_A_EXECUTION_SPEC**

Claude must not implement Stage A code until the Stage A execution specification is complete.

The spec is a design document, not code. It may be created and reviewed without implementation.

Once the Stage A spec is approved, the next invocation will implement Stage A per the specification.

---

⸻

17E. OWNER_MODE_LEARNING_AND_VALIDATION_ARCHITECTURE

Building 90-100% practical owner decision quality requires learning and validation beyond Stage D.
This section defines stages D1-D5 for learning, retrieval, and real-world validation.

### STAGE D1: DEVELOPMENT CASE LIBRARY

**Purpose:**
Build a large case library used for development, learning, and pattern discovery.

**Target Scale:**
* Minimum: 500 validated cases
* Stretch: 2000+ cases
* Diversity: Multi-industry, multi-business-model, multi-stage, multi-geography

**Required Sources:**
* Public company failures (SEC filings, bankruptcy records)
* Turnarounds (documented case studies, business press)
* Earnings calls (transcripts, analysis)
* Consulting case studies (published, licensed, or commissioned)
* Business-school cases (Harvard, Kellogg, INSEAD archives)
* SMB failures (credit agency data, interviews, archival)
* SMB successes (growth trajectories, published interviews)
* Owner-submitted cases (with permission and verification)

**Required Metadata for Every Case:**
* symptoms (observable business indicators at time of diagnosis)
* constraints (timeline, budget, leadership, market, regulatory)
* evidence available at decision time (what was known, not known, or ambiguous)
* actual root cause (verified retrospectively)
* actual intervention (what was actually done)
* actual outcome (measured result, verified independently)
* outcome confidence level (how certain is the historical record)
* source quality rating (1-5 star, based on documentation)
* date of diagnosis
* date of outcome measurement

**STRICT RULES:**

1. No case may enter the library without source attribution.
2. No synthetic answer key may be marked as "verified" — only "expert opinion" or "researcher inference"
3. No unverifiable internet anecdote may be treated as ground truth
4. No benchmark case may be copied into the learning library
5. No learning case may be copied into benchmark packs
6. Every case requires provenance documentation
7. Cases must be searchable by industry, business model, root-cause type, intervention type, outcome

---

### STAGE D2: BLIND VALIDATION LIBRARY

**Purpose:**
Prevent overfitting and false-positive learning by validating on hidden cases.

**Requirements:**

All validation cases must:
* hide the outcome (what actually happened)
* hide the answer key (expert diagnosis)
* hide the intervention (what was actually done)
* hide the result metrics (did it work or fail)

**Validation Process:**

1. OpsIQ generates diagnosis from evidence
2. OpsIQ generates first action from evidence
3. OpsIQ generates confidence scores
4. Output is frozen (before revealing answer)
5. Expert answer is revealed
6. Score comparison performed (engine vs expert)
7. Metrics recorded and analyzed

**STRICT RULES:**

1. No tuning allowed using blind validation cases
2. No architecture change may use hidden answers for guidance
3. No benchmark score may be claimed if blind validation contamination occurs
4. Any contamination immediately invalidates benchmark status
5. Blind validation cases must remain separate from development library
6. No pattern learned from blind validation cases without Stage C complete
7. Blind validation results must be independently verified

---

### STAGE D3: VERIFIED OUTCOME LEARNING

**Purpose:**
Learn only from real-world outcomes, not simulations or benchmarks.

**Learning Workflow:**

```
OpsIQ generates diagnosis + action
→ Owner chooses to implement (or not)
→ Action is taken in real business
→ Outcome observed over time
→ Outcome verified independently
→ Owner approves learning from this case
→ Learning candidate enters corpus
→ Learning acceptance review
→ Pattern extracted (or rejected)
```

**STRICT RULES:**

1. No recommendation automatically becomes training data
2. No learning without verified outcome
3. No learning from assumptions (must be actual outcome)
4. No learning from simulated success
5. No learning from benchmark performance
6. Only verified real outcomes may enter the learning corpus
7. Owner must approve before case becomes training data
8. Learning approval gate is mandatory, not optional
9. If outcome contradicts diagnosis, case is flagged for analysis, not learning
10. Failures are as valuable as successes — both must be logged

---

### STAGE D4: CONSULTING MEMORY AND RETRIEVAL

**Purpose:**
Retrieve relevant historical cases before diagnosis to inform reasoning.

**Required Capabilities:**

1. Similar case retrieval — find cases with matching symptoms
2. Similar failure retrieval — find cases where same root cause occurred
3. Similar turnaround retrieval — find cases where similar action succeeded
4. Industry analogs — find cases in same or analogous industry
5. Constraint analogs — find cases with similar constraints (timeline, budget, leadership)
6. Action success rates — what percentage of similar interventions succeeded
7. Action failure rates — what percentage of similar interventions failed
8. Outcome timing — how long did similar turnarounds take

**Retrieval Process:**

1. OpsIQ identifies case characteristics (industry, business model, root-cause type, constraint profile)
2. Retrieval engine finds 3-5 most similar cases
3. Historical cases shown to owner as "similar situations and what happened"
4. Retrieved cases inform reasoning but do not determine diagnosis

**STRICT RULES:**

1. Retrieved cases are evidence input, not truth
2. Retrieved cases are NOT authority
3. Historical similarity cannot override current evidence
4. Evidence always outranks retrieval
5. Retrieval confidence must be bounded
6. Owner must understand why cases were retrieved
7. Failure to retrieve similar cases does not invalidate diagnosis
8. Retrieval results must cite source and confidence level

---

### STAGE D5: REAL OWNER VALIDATION

**Purpose:**
Validate actual usefulness on real businesses owned or operated by the user.

**Required Validation Domains:**

1. Tumbledry (primary owner business)
2. Personal finance (household optimization)
3. Maritime operations (if applicable)
4. Future ventures (new business launches)
5. Additional owner businesses (portfolio companies)

**Measurement Protocol:**

```
OpsIQ generates diagnosis + recommendation for owner's real case
→ Owner implements (or doesn't)
→ Outcome is measured over agreed-upon time period
→ Before/after metrics are captured
→ Owner verifies outcome independently
→ Score recorded (did recommendation help?)
→ Learning candidate reviewed (should this be added to corpus?)
```

**STRICT RULES:**

1. No recommendation counted as successful until outcome measured
2. No self-reported success accepted without evidence
3. No claimed improvement without before/after metrics
4. No anecdotal success counted toward readiness
5. Every real owner case must have documented outcome
6. Owner approval required for every measurement
7. Failures are more valuable than successes — analyze every failure
8. Recommendations that fail must be understood (why failed?)
9. Results must be independently verifiable (not just owner opinion)
10. Real owner validation is mandatory before consultant-grade claim

---

⸻

17F. UNIVERSAL HOSTILE EXECUTION RULES

These 15 rules apply globally to every execution phase, every stage, every iteration, and every closeout.

**Rule 1: Nothing is complete until measured.**
- Expected improvement = zero improvement
- Projected accuracy = zero accuracy
- Claimed performance = zero performance until benchmarked
- Benchmark improvement = invalid until independently verified
- Only measured results count

**Rule 2: Every stage requires implementation proof, test proof, benchmark proof, audit proof, closeout proof.**
- Implementation: Code must exist and be in repository
- Test: Unit tests, regression tests, adversarial tests must pass
- Benchmark: Cases executed, scores recorded, metrics calculated
- Audit: Hostile audit performed, contamination checked, integrity verified
- Closeout: Claims matched to file evidence, not speculative

**Rule 3: Every closeout must contain evidence, metrics, failures, limitations, unresolved risks.**
- Evidence: File paths to code, tests, benchmarks, data
- Metrics: Actual numbers, not ranges or projections
- Failures: Cases that didn't work, why they failed
- Limitations: What the implementation doesn't do
- Unresolved Risks: What could still go wrong

**Rule 4: Any benchmark contamination triggers immediate hard stop.**
- Benchmark contamination = using answer keys during implementation
- Using hidden outcomes during development
- Copying benchmark cases into learning library
- Leaking case IDs to engine training
- Using benchmark scores for tuning
- Status: BLOCKED_WITH_EVIDENCE (not COMPLETE)

**Rule 5: Any answer-key leakage triggers immediate hard stop.**
- Leakage = engine seeing correct answer during case execution
- Leakage = prompt containing answer key fragments
- Leakage = output training using ground truth
- Leakage = learned patterns from answer keys
- Status: BLOCKED_WITH_EVIDENCE (not COMPLETE)

**Rule 6: Any hallucinated metric triggers immediate hard stop.**
- Hallucinated metric = claimed improvement not in benchmark data
- Hallucinated metric = expected vs actual confusion
- Hallucinated metric = statistically invalid comparison
- Hallucinated metric = single case extrapolated to population
- Status: BLOCKED_WITH_EVIDENCE (not COMPLETE)

**Rule 7: Any unsupported claim invalidates the closeout.**
- Unsupported claim = statement not traceable to repository file
- Unsupported claim = inference without data
- Unsupported claim = consultant-grade before Round 3 validates
- Unsupported claim = accuracy claim without benchmark
- Unsupported claim = "expected to improve" as if already improved
- Closeout status: INVALID

**Rule 8: Claude must not skip stages, merge stages, compress stages, mark partial work complete, bypass audits, bypass benchmarks, or bypass manual review.**
- Every stage is required
- Every gate is required
- Every audit is required
- Partial work is not complete
- Compression is not allowed
- Skipping is not allowed

**Rule 9: After every completed step, perform: hostile audit, regression audit, contamination audit, benchmark integrity audit, roadmap integrity audit.**
- Hostile audit: Can this be gamed? Cheated? Circumvented?
- Regression audit: Did we break anything else?
- Contamination audit: Did benchmark/learning/validation isolation hold?
- Benchmark integrity audit: Are cases, outputs, scores, metrics uncorrupted?
- Roadmap integrity audit: Is roadmap state accurate in CURRENT_WORKFLOW_STATE.md?

**Rule 10: If any audit fails, status = BLOCKED_WITH_EVIDENCE (not COMPLETE).**
- Failed audit = issues identified
- Issues identified = must be fixed
- Fixed = must be re-audited
- Re-audit fails = BLOCKED again
- Only after all audits pass = status can change

**Rule 11: If two consecutive major architecture stages fail to materially improve root-cause accuracy and first-action accuracy, then generate ARCHITECTURE_REDESIGN_REPORT and halt roadmap progression.**
- Stage A targets 40-60% accuracy; if Stage A achieves <35%, HALT
- Stage B targets 60-75% accuracy; if Stage A+B achieves <50%, HALT
- Material improvement = improvement ≥20 percentage points
- Non-material improvement = halt progression
- Halt status: BLOCKED_WITH_EVIDENCE

**Rule 12: Every benchmark artifact modification requires re-audit before proceeding.**
- Any change to Round 1 artifacts = HALT (immutable)
- Any change to Round 2 artifacts = HALT (locked)
- Any change to Round 3 artifacts = re-audit required
- Any case addition = full quality gate required
- Re-audit failure = BLOCKED_WITH_EVIDENCE

**Rule 13: Every learning case requires provenance, source attribution, outcome verification, and owner approval.**
- No case without source = rejected
- No case without outcome verification = rejected
- No case without owner approval = rejected
- Provenance = traceable to public/licensed/permitted source
- Verification = independent confirmation of outcome
- Approval = owner signed off in writing (documented in code comment)

**Rule 14: Consultant-grade claim is prohibited until: Stage C complete, Round 3 benchmarks pass, real owner validation shows ≥80% practical accuracy, manual review sign-off complete.**
- Stage C must be implemented and benchmarked
- Round 3 must be fresh cases (not Round 2)
- Round 3 accuracy must be ≥80% on measured primary metrics
- Real owner validation must show ≥80% practical utility
- Manual review of all Round 3 failures required
- Only then: consultant-grade claim allowed

**Rule 15: If any stage produces no primary metric improvement over two consecutive iterations, produce stage redesign report and halt progression.**
- Iteration 1 produces no improvement = continue to iteration 2
- Iteration 2 produces no improvement = HALT
- Halt action: Produce redesign report
- Halt status: BLOCKED_WITH_EVIDENCE
- Redesign report must explain: why no improvement, what is root cause, what architecture change is needed

---

⸻

17G. FAST_TRACK_OWNER_MODE_PROGRAM

**Purpose:**
Accelerate learning while preserving benchmark integrity and preventing contamination.

**Allowed Parallel Workstreams:**

1. **Stage A Implementation** (code + tests + benchmarking)
2. **Case Library Construction** (D1: source cases, verify outcomes, create metadata)
3. **Retrieval Architecture Design** (D4: design similar-case retrieval, build index)
4. **Outcome Learning Design** (D3: design learning workflow, define corpus)
5. **Benchmark Expansion** (Round 3: design new cases, create answer keys, peer review)

**Workstream Isolation Rules:**

1. Stage A implementation is isolated from case library construction
2. Case library does NOT feed Stage A during implementation
3. Retrieval design does NOT require Stage A implementation
4. Outcome learning design does NOT require Stage A implementation
5. Round 3 case creation is isolated from Stage A benchmarking

**Not Allowed:**

- Parallel benchmark execution and benchmark tuning (must be sequential)
- Benchmark cases used during Stage A design
- Learning corpus used during Stage A implementation
- Blind validation corpus used during any tuning
- Round 1 or Round 2 artifacts modified
- Answer-key leakage during any workstream

**Checkpoint Schedule:**

- Week 1-2: Stage A design complete, Round 3 case design complete
- Week 3-4: Case library sourcing 100 cases, retrieval design complete
- Week 5-6: Stage A implementation complete, Round 3 cases complete (50), first 50 D1 cases sourced
- Week 7-8: Stage A benchmarking on Round 2 subset (20 cases), case library expansion (200 cases)
- Week 9-10: Outcome learning design complete, D1 cases verified (100+)
- Week 11: Stage A results analyzed, failures understood, next stage planned

**Fast-Track Constraints:**

1. Implementation blocked until specification approved
2. All checkpoints require hostile audit before proceeding
3. All inter-workstream dependencies must be explicitly documented
4. Contamination check required at each checkpoint
5. If contamination detected, full isolation audit required

---



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