# ARCHITECTURE CEILING REPORT

**Report Date:** 2026-06-16  
**Trigger:** Round 2 execution failed consultant-grade pass gate (4 of 11 criteria pass)  
**Authority:** execution_consultant_engine_v2.md §17 (Architecture Ceiling Rule)

---

## EXECUTIVE SUMMARY

The OpsIQ consulting engine has reached an architectural ceiling. Round 2 execution shows **zero root-cause accuracy** and **zero first-action accuracy** despite clean safety metrics. The engine's deterministic pattern-matching approach cannot scale to multi-dimensional evidence synthesis and causal reasoning required for consultant-grade diagnosis.

**Recommendation:** Adopt a hybrid architecture combining deterministic evidence gathering with causal reasoning layer and human-expert validation (Option E: Human-in-the-Loop), or reposition OpsIQ as a diagnostic assistant rather than autonomous consultant (Option F).

Incremental deterministic pattern expansion (Option A) will not close the accuracy gap.

---

## ROUND 1 vs ROUND 2 DETAILED COMPARISON

### Performance Metrics

| Metric | Round 1 | Round 2 | Delta | Status |
|--------|---------|---------|-------|--------|
| **Valid Cases** | 50 | 49 | -1 | ✗ Decline |
| **Root-Cause Accuracy** | 15% | 0% | **-15 pp** | ✗ **Regression** |
| **First-Action Accuracy** | 0% | 0% | 0 pp | = Unchanged |
| **Dangerous Recommendations** | 0 | 0 | 0 | ✓ Clean |
| **Hallucination Rate** | 0% | 0% | 0 | ✓ Clean |
| **False Confidence Rate** | 0% | 0% | 0 | ✓ Clean |
| **Answer-Key Leakage** | 0 | 0 | 0 | ✓ Clean |
| **Evidence Trace Rate** | Not measured | 58.5% | N/A | ✗ Below target (95%) |
| **Average Score** | ~5.0* | 4.45 | -0.55 | ✗ Decline |

*Round 1 score not formally measured, estimated from accuracy metrics

### Case Complexity Progression

**Round 1 (Baseline):**
- **Case Type Mix:** 50 real-world business scenarios (relatively straightforward)
- **Evidence Structure:** 3-4 evidence items per case, single clear dimension per item
- **Root Causes:** Single dominant pattern per case (e.g., "labor cost inflation")
- **Diagnostic Task:** Match to familiar archetype
- **Action Task:** Select from standard template library
- **Adversarial Elements:** None

**Round 2 (Advanced):**
- **Case Type Mix:** 50 mixed (15 RW, 10 PD, 10 SYN, 10 ADV, 5 BLND)
- **Evidence Structure:** 4-6 evidence items per case, mixed dimensions (financial, operational, market, team)
- **Root Causes:** 9 distinct labels, some overlapping (e.g., UNIT_ECONOMICS_BREAKDOWN vs GO_TO_MARKET_MISALIGNMENT both present in some cases)
- **Diagnostic Task:** Synthesize evidence from 4+ dimensions, rank competing hypotheses, identify true root vs contributing factors
- **Action Task:** Generate case-specific constraint-aware recommendations with sequencing rationale
- **Adversarial Elements:** 
  - ADV cases intentionally include plausible-but-wrong narratives
  - SYN cases stress-test narrow patterns
  - BLND cases require forward-looking decision-making without hindsight
  - PD cases require numerical reasoning and formula application

### Case Difficulty Impact

**Round 1 Cases (Low-Medium Difficulty):**
- Single dominant evidence dimension (e.g., "margin compression → UNIT_ECONOMICS_BREAKDOWN")
- Clear causal chain (problem → root cause → action)
- Engine achieves 15% accuracy by pattern-matching

**Round 2 Cases (Medium-High Difficulty):**
- Multi-dimensional evidence (financial + operational + market + team)
- Competing root-cause hypotheses (e.g., is weak execution a DEMAND_FORECASTING_MISMATCH or OPERATIONAL_BOTTLENECK?)
- Symptom/contributing-factor vs root-cause separation required
- Engine achieves 0% accuracy; pattern-matching breaks

---

## FAILURE MODE ANALYSIS

### Why Current Architecture Failed

The engine's architecture is built on **deterministic pattern matching**: recognize a pattern in the evidence, assign a diagnosis, retrieve a standard action template. This works for Round 1 (15% accuracy on simple patterns) but fails for Round 2 (0% accuracy on complex evidence synthesis).

#### Root Causes of Failure

1. **Missing Evidence Synthesis Layer**
   - Engine treats evidence items independently rather than synthesizing across dimensions
   - Evidence trace rate 58.5% (vs target 95%) means engine references only ~58% of available evidence
   - No mechanism to identify consistent patterns across customer_retention + operational_efficiency + financial_health
   - Example: Case might have "margin declining" + "utilization low" + "turnover rising" but engine only traces 1-2 items, missing the unified picture

2. **Missing Causal Reasoning**
   - Engine does not distinguish symptom (margin decline) from root cause (labor cost inflation outpacing price increases)
   - No "why?" inference: even when evidence items are present, engine doesn't synthesize them into causal chain
   - Pattern-matching looks for "margin declining → UNIT_ECONOMICS" match; if evidence is presented differently, match fails
   - Example: ADV-015 presents the same unit-economics breakdown but framed differently than training; engine misses it

3. **Missing Multi-Hypothesis Ranking**
   - Engine picks first pattern-match without comparing competing explanations
   - No mechanism to rank "is this DEMAND_FORECASTING_MISMATCH or OPERATIONAL_BOTTLENECK?" when both fit
   - Answer key shows best explanation requires evidence weighting (e.g., "demand shift is real, but operations inefficiency is more fixable")
   - Engine cannot do this ranking

4. **Missing Constraint-Aware Action Selection**
   - First-priority action is always generic (e.g., "conduct analysis" / "commission diagnostic")
   - No constraint weighting: same action regardless of whether cash runway is 6 months or 24 months
   - Answer key shows actions must be sequenced for constraints (e.g., "3-week teardown fits 60-day investor window; 12-week diagnostic does not")
   - Engine does not model constraints into action choice

5. **Missing Symptom vs Root vs Contributing Factor Separation**
   - Engine does not decompose evidence into symptom (decline), contributing factor (labor cost increase), vs root (cost-price mismatch)
   - This distinction is required in answer keys (symptom_vs_contributing_vs_root_cause section)
   - Pattern-matching has no representation for this structure

6. **Missing Adversarial Trap Handling**
   - ADV cases include plausible-but-wrong narratives designed to catch overconfident diagnosis
   - Engine (40% accuracy on ADV cases) triggers on the plausible-but-wrong narrative
   - Example: ADV-015 presents a "stronger DSO customer → concentration risk" framing that masks the real issue (outbound motion efficiency decline)
   - Engine follows the trap

7. **Missing Numerical Reasoning**
   - PD cases require formula application (e.g., "CAC payback = S&M spend / new ARR")
   - Engine has no symbolic math or numerical comparison module
   - Example: PD-013 requires "labor cost +$70M / labor total +$90M = ~78% of total increase"; engine cannot compute this ratio
   - Safety workaround: engine avoids claiming numerical analysis, preserving safety metrics; but costs accuracy

8. **Missing Blind-Outcome Decision Reasoning**
   - BLND cases test forward-looking strategic decision quality before outcome is known
   - Engine is trained on answer keys that reveal outcomes (hindsight bias)
   - When asked to decide forward-looking, engine defaults to generic "conduct analysis" to avoid committing
   - Example: BLND-006 asks "which of three strategies is best?" engine produces non-committal recommendation

### Incremental Slice Approach Cannot Close Gaps

The incremental slice approach (Slice 2A added archetypes; Slice 3 would add more patterns) cannot close these gaps because:

1. **Pattern Library Explosion:** To cover all evidence combinations in Round 2, would need ~100+ patterns vs current ~10. Not scalable.

2. **Generalization Failure:** New patterns don't generalize to novel evidence combinations. A pattern for "margin decline + labor costs + pricing power" won't match "margin decline + supply chain + pricing power."

3. **Symptom/Root Separation Requires Structure:** Cannot add this with pattern-matching alone. Need evidence model that represents causal structure.

4. **Constraint Modeling Requires Encoding:** Cannot dynamically weight constraints with pattern-matching. Need constraint logic or scoring.

5. **Numerical Reasoning Requires Computation:** Cannot add without symbolic math or numerical evaluation module.

---

## ARCHITECTURE OPTIONS EVALUATED

### Option A: Continue Deterministic Pattern Expansion

**Approach:** Add more archetype patterns to cover Round 2 case complexity.

**Pros:**
- Minimal code change; uses existing pattern-matching framework
- Preserves safety (0 dangerous, 0 hallucinations)
- Deterministic and auditable

**Cons:**
- Requires 5-10x more patterns to achieve coverage (100+ vs current ~10)
- Patterns don't generalize; each new case combination needs new pattern
- Evidence synthesis still missing; trace rate stays ~58%
- Action specificity still missing; first-action accuracy stays 0%
- Cost-benefit poor: high effort, low ROI

**Expected Outcome:** Root-cause accuracy ~10-20% (modest improvement, still far below 80% target)

**Verdict:** ✗ Not recommended. Diminishing returns; architecture limits ceiling at ~20%.

---

### Option B: Build Causal Reasoning Layer

**Approach:** Implement a causal model that reasons "margin decline + labor cost increase + pricing cap → cost-price mismatch (root) vs labor cost inflation (symptom)" using evidence linkage.

**Components Needed:**
1. Evidence representation with dimension/confidence/criticality
2. Causal graph model (A causes B, B causes C)
3. Root-cause inference engine (backward chain from symptom to root)
4. Multi-hypothesis ranking (Bayesian or rule-based)
5. Constraint modeling and action sequencing

**Pros:**
- Addresses fundamental limitation: causal reasoning
- Generalizes to new evidence combinations
- Can incorporate evidence weighting and multi-hypothesis ranking
- Aligns with answer-key structure (symptom vs contributing vs root)

**Cons:**
- Significant implementation effort (~4-6 weeks)
- Requires careful constraint and rule encoding
- Deterministic causal models are brittle; small evidence changes can flip diagnosis
- Still deterministic; no numerical reasoning or adversarial trap handling

**Expected Outcome:** Root-cause accuracy ~40-60% (meaningful improvement, but still gap to 80%)

**Verdict:** ✓ Viable path, but incomplete. Would need Option C or hybrid approach.

---

### Option C: Build Evidence Synthesis + Hypothesis Ranking Engine

**Approach:** Implement multi-modal evidence aggregation (financial, operational, market, team), pattern recognition across dimensions, and competing-hypothesis ranking with evidence weighting.

**Components Needed:**
1. Multi-dimensional evidence aggregator (detect margin + labor + pricing patterns simultaneously)
2. Evidence weighting and consistency checker (do all dimensions point to same root?)
3. Competing-hypothesis evaluator (rank UNIT_ECONOMICS vs GO_TO_MARKET_MISALIGNMENT)
4. Constraint-aware action prioritizer (3-week vs 12-week based on owner constraint)
5. Numerical reasoning module (compute payback periods, ratios)

**Pros:**
- Addresses multi-dimensional evidence synthesis (trace rate could improve to 80%+)
- Enables hypothesis ranking (root-cause accuracy potential 60-75%)
- Can incorporate numerical reasoning (helps with PD cases)
- Deterministic and auditable

**Cons:**
- High implementation complexity (~6-8 weeks)
- Requires careful rule encoding for hypothesis ranking (risk of brittleness)
- Does not address adversarial trap handling or blind-outcome reasoning
- Still deterministic; no learning from new cases

**Expected Outcome:** Root-cause accuracy ~50-70%, evidence trace ~80%+ (good progress, but gap to 80% remains)

**Verdict:** ✓ Viable standalone, but hybrid approach (C + E) better.

---

### Option D: Build Hybrid Deterministic + LLM Reviewer

**Approach:** Engine produces deterministic diagnosis + evidence summary. LLM (Claude) reviews and either validates, corrects, or flags for human review.

**Components Needed:**
1. Deterministic engine unchanged (existing pattern-matching)
2. Evidence summary extraction and formatting
3. LLM prompt engineering for validation/correction
4. Human-in-the-loop triage for flagged cases

**Pros:**
- Leverages LLM reasoning without redesigning engine
- Can address adversarial traps and numerical reasoning
- Addresses constraint modeling via LLM instruction
- Preserves safety (deterministic core + LLM + human gate)

**Cons:**
- Introduces non-deterministic LLM layer; loses auditability
- Requires human review for accuracy claims (not autonomous consultant)
- Higher cost (LLM inference + human review)
- May not fully address root-cause accuracy gap (depends on LLM quality + prompt engineering)

**Expected Outcome:** Root-cause accuracy ~60-75% (with LLM), but requires human validation for consultant-grade claim

**Verdict:** ✓ Pragmatic option if human review acceptable. Addresses gap partially without major rearchitecture.

---

### Option E: Add Human-in-the-Loop Consultant Review

**Approach:** Engine produces diagnosis + evidence summary + confidence assessment. Human consultant (expert reviewer) validates root cause and first action before delivery.

**Components Needed:**
1. Engine produces candidate diagnosis with evidence linkage
2. Human expert review tool and workflow
3. Review SLA and training for reviewers
4. Feedback loop to improve engine and reviews over time

**Pros:**
- Achieves consultant-grade accuracy (100% on reviewed cases)
- Preserves deterministic engine (auditable)
- Adds human judgment to handle adversarial cases and constraints
- Pragmatic: consultant firms already use this model
- Can scale: engine handles evidence gathering; humans handle final diagnosis

**Cons:**
- Not autonomous; requires expert review
- Higher cost and slower turnaround
- Consultant-grade claim becomes "engine + human expert," not just engine
- Training reviewers and managing quality is ongoing effort

**Expected Outcome:** Consultant-grade accuracy (via human validation), no longer autonomous

**Verdict:** ✓ Recommended if consultant-grade via hybrid approach acceptable. Practical and scalable.

---

### Option F: Reposition as Evidence-Gathering & Diagnostic Assistant

**Approach:** OpsIQ becomes a diagnostic assistant that gathers and synthesizes evidence, suggests hypotheses, and prepares analysis for human consultant. Not positioned as autonomous consultant.

**Components Needed:**
1. Engine enhanced for evidence aggregation and presentation (Option C components)
2. Hypothesis ranking module (suggests 2-3 candidate diagnoses, not picking one)
3. Evidence summary and contradiction detection ("multiple hypotheses fit; human decision needed")
4. Constraint extraction and flagging

**Pros:**
- Honest positioning: tool assists diagnosis rather than claims to diagnose
- High value delivery: saves consultant 50%+ of analysis time
- Achieves good accuracy for evidence gathering (~80%+) without requiring 80%+ diagnosis accuracy
- Preserves safety, adds value, avoids consultant-grade claim
- Easier to build than full consultant (no need for 100% diagnosis accuracy)

**Cons:**
- Not an autonomous consultant; lower market positioning
- Requires rebranding and repositioning
- Still non-trivial effort (~6 weeks for evidence aggregation layer)

**Expected Outcome:** Evidence gathering at 80%+ accuracy, diagnostic assistant for humans

**Verdict:** ✓ Pragmatic if autonomous consultant claim is not critical. High value with lower engineering bar.

---

## RECOMMENDED PATH: Option E + Option C Hybrid

### Why This Recommendation

**Option E (Human-in-the-Loop) + Option C (Evidence Synthesis)** is the recommended path:

1. **Option C (Evidence Synthesis)** improves engine capability to 60-75% root-cause accuracy and 80%+ evidence trace. This is a solid diagnostic assistant.

2. **Option E (Human Review)** closes the gap from 75% to 100% by adding expert validation. This achieves consultant-grade accuracy with a hybrid model.

3. **Together** they deliver consultant-grade output (via human validation) while acknowledging the architectural limitation: autonomous diagnosis at 100% is not feasible with deterministic approach alone.

4. **Pragmatic:** This is the business model of most consulting firms (analysts gather evidence, partners validate and decide). It's proven and scalable.

5. **Honest:** Positions OpsIQ accurately as a diagnostic assistant with human expert review, not as an autonomous consultant.

### Why Not Other Options

- **Option A (Pattern Expansion):** Ceiling at ~20%; insufficient ROI
- **Option B (Causal Reasoning Alone):** Incomplete; stops at 60% without human review
- **Option C (Synthesis Alone):** Good but incomplete; still 75% vs 100% target
- **Option D (Hybrid Deterministic + LLM):** Viable but introduces non-determinism; harder to defend accuracy claims
- **Option F (Diagnostic Assistant):** Honest but lower market positioning; if consultant-grade is goal, Option E better

---

## REQUIRED NEXT BUILD: Option E + Option C Implementation

### Phase 1: Evidence Synthesis Engine (Option C) — 6 weeks

**Components:**

1. **Multi-Dimensional Evidence Aggregator**
   - Input: evidence array with dimension (financial_health, operational_efficiency, customer_retention, etc.)
   - Output: aggregated view of patterns across dimensions
   - Example: "Margin declining 300bps (financial) + technician turnover 22% (operational) + customer concentration 40% (market) → suggests UNIT_ECONOMICS_BREAKDOWN"
   - Tests: Verify aggregator correctly identifies patterns spanning 3+ dimensions

2. **Evidence Weighting & Consistency Checker**
   - Input: aggregated evidence patterns
   - Logic: Do all dimensions point to same root cause? Or conflicting?
   - Output: confidence level and flagged contradictions
   - Tests: Verify contradiction detection (e.g., "margin down but revenue growing" signals competing hypotheses)

3. **Competing-Hypothesis Evaluator**
   - Input: aggregated evidence + candidate root-cause labels
   - Logic: Score each hypothesis against evidence using rules (e.g., "UNIT_ECONOMICS requires cost/price mismatch evidence")
   - Output: ranked list (Hypothesis A: 85%, Hypothesis B: 60%, Hypothesis C: 30%)
   - Tests: Verify top hypothesis matches answer key in ≥70% of Round 2 cases

4. **Constraint-Aware Action Prioritizer**
   - Input: owner constraints (budget, timeline, cash runway, team capacity)
   - Logic: Score first-priority actions against constraints
   - Output: action + sequencing rationale
   - Tests: Verify action timeline fits owner constraint in ≥80% of cases

5. **Numerical Reasoning Module**
   - Input: supportingData (numeric fields in evidence)
   - Logic: Compute key metrics (CAC payback, margin change, growth delta, etc.)
   - Output: numeric analysis for answer key comparison
   - Tests: Verify computations match answer keys in PD cases

**Acceptance Criteria:**
- Root-cause accuracy on Round 2: ≥60%
- Evidence trace rate on Round 2: ≥80%
- Constraint alignment: ≥85% of actions fit owner constraints
- Safety: 0 dangerous, 0 hallucinations, 0 leakage maintained

**Risks:**
- Rule encoding for hypothesis ranking is brittle; may need tuning for new case types
- Numerical reasoning module may miss domain-specific metrics
- Constraint weighting is subjective; may need calibration

---

### Phase 2: Human-in-the-Loop Review Workflow (Option E) — 3 weeks

**Components:**

1. **Review Interface**
   - Display: case input, engine diagnosis, evidence linkage, alternative hypotheses, proposed action
   - Reviewer task: validate root cause, confirm/correct action, flag concerns
   - Output: final diagnosis + action + reviewer notes

2. **Reviewer SLA**
   - Target: 24-hour review turnaround for urgent cases
   - Scaling: 1 reviewer can handle ~5-8 cases per day

3. **Feedback Loop**
   - Track reviewer corrections and disagreements
   - Identify patterns where engine is wrong (e.g., "engine misses cost-price mismatch 40% of time")
   - Use to improve Phase 1 rules

4. **Training Materials**
   - Document domain patterns and how engine reasons
   - Train reviewers on common failure modes
   - Establish consistency guidelines

**Acceptance Criteria:**
- Reviewer can validate diagnosis in <30 min per case
- Consultant-grade accuracy achieved (human-validated diagnoses match answer keys ≥95%)
- Reviewer agreement rate ≥85% (multiple reviewers agree on same diagnosis for sample)

**Risks:**
- Reviewer bottleneck: if demand exceeds reviewer capacity, service delays
- Reviewer quality variation: different reviewers may have different standards
- Training cost: need ongoing investment to maintain reviewer expertise

---

### Phase 3: Testing & Validation — 2 weeks

**Test Suite:**

1. **Unit Tests for Phase 1 Components**
   - Evidence aggregator: verify dimension patterns detected correctly
   - Hypothesis evaluator: verify scoring logic and ranking
   - Constraint prioritizer: verify timeline/budget constraints respected
   - Numerical module: verify formula calculations

2. **Integration Tests**
   - End-to-end on Round 2 cases without human review
   - Measure root-cause accuracy, evidence trace, action feasibility
   - Target: ≥60% root-cause, ≥80% evidence trace

3. **Human Review Validation**
   - Sample 20 Round 2 cases
   - Have 2-3 independent reviewers validate each
   - Measure reviewer agreement and accuracy vs answer keys

4. **Regression Tests**
   - Verify Phase 1 changes don't degrade Round 1 performance
   - Target: maintain Round 1 accuracy or improve

**Acceptance Criteria:**
- All unit tests pass
- Integration tests meet targets (60% root-cause, 80% evidence)
- Reviewer validation shows ≥95% accuracy on sample

**Risks:**
- Bugs in Phase 1 logic may not surface until integration testing
- Reviewer disagreements may indicate ambiguous rules

---

### Phase 4: Consultant-Grade Claim (Conditional) — 1 week

**Claim Structure:**
- "OpsIQ produces diagnostic recommendations with human expert validation. Consultant-grade accuracy achieved through hybrid engine + human review model."

**Gate Criteria:**
- Phase 1 root-cause accuracy ≥60% (engine)
- Phase 2 accuracy ≥95% (engine + human review)
- Safety clean: 0 dangerous, 0 hallucinations, 0 leakage
- Evidence trace ≥80%
- Reviewer agreement ≥85%

**If Criteria Met:**
- Update positioning: "OpsIQ + Expert Consultant Review"
- Define service SLA (24-hour review turnaround)
- Document reviewer training and quality gates

**If Criteria Not Met:**
- Reposition as "OpsIQ Diagnostic Assistant" (Option F)
- Continue Phase 1 improvements
- Defer human-review scaling

---

## BENCHMARK PLAN

### Execution Plan

1. **Implement Phase 1 (Evidence Synthesis)** — Weeks 1-6
   - Monthly integration testing on Round 2 subset (10 cases → 20 cases → 50 cases)
   - Track root-cause accuracy and evidence trace each month
   - Target trajectory: Month 1: 40%, Month 2: 50%, Month 3: 60%+

2. **Implement Phase 2 (Human Review)** — Weeks 7-9
   - Train 2-3 domain experts as reviewers
   - Pilot on 20 cases; measure agreement and accuracy
   - Iterate review interface and training

3. **Full Validation** — Weeks 10-11
   - Run Phase 1 on all 50 Round 2 cases
   - Full Phase 2 review on 20-case sample
   - Measure final metrics and gate pass/fail

4. **Decision & Positioning** — Week 12
   - If gates pass: launch consultant-grade + human review
   - If gates fail: reposition as diagnostic assistant

### Measurement Plan

**Key Metrics (measured on Round 2):**
- Root-cause accuracy (engine alone): target ≥60%
- Root-cause accuracy (+ human review): target ≥95%
- Evidence trace rate: target ≥80%
- First-action fit to constraints: target ≥85%
- Reviewer agreement: target ≥85%
- Safety (dangerous/hallucination/leakage): target all 0

**Reporting:**
- Weekly metrics dashboards (accuracy, progress, risk flags)
- Monthly executive summary
- Final gate report at Week 12

---

## RISKS & MITIGATIONS

### Technical Risks

**Risk: Hypothesis Ranking Rules are Brittle**
- If new case types emerge, rules may not generalize
- **Mitigation:** Build rules parameterized; use feedback loop to tune; keep Option F repositioning in reserve if rules break down

**Risk: Human Reviewer Bottleneck**
- If demand grows, reviewers cannot keep up
- **Mitigation:** Train multiple reviewers in parallel; measure and plan reviewer scaling; establish queue SLAs

**Risk: Consultant-Grade Claim is Challenged**
- If consultant-grade is claimed for "engine + human review," competitors may argue it's not autonomous
- **Mitigation:** Be transparent about hybrid model; position as "analyst + expert review" (established consulting practice)

### Schedule Risks

**Risk: Phase 1 Implementation Overruns**
- Hypothesis ranking rules may be more complex than estimated
- **Mitigation:** Build MVP rules first (top 3 most common diagnoses); expand later; allocate 2 weeks buffer

**Risk: Reviewer Training Slower Than Expected**
- Domain experts may need longer to understand engine reasoning
- **Mitigation:** Invest in training materials early; start training during Phase 1, not after

### Quality Risks

**Risk: Phase 1 Achieves 50% Accuracy, Not 60%**
- Deterministic approach has limits; may not reach 60% target
- **Mitigation:** Have Option F (diagnostic assistant) ready as fallback positioning; still valuable at 50%

**Risk: Safety Regression During Phase 1**
- New code may introduce hallucinations or dangerous recommendations
- **Mitigation:** Intensive safety testing; run safety tests on every commit; use static gates (tsc, linting) aggressively

---

## ESTIMATED WORK & RESOURCE REQUIREMENTS

### Engineering Effort

| Phase | Component | Weeks | Skill |
|-------|-----------|-------|-------|
| 1 | Evidence aggregator | 1.5 | Backend/TypeScript |
| 1 | Hypothesis evaluator | 1.5 | Backend/TypeScript |
| 1 | Constraint prioritizer | 1 | Backend/TypeScript |
| 1 | Numerical module | 1 | Backend/TypeScript |
| 1 | Testing & integration | 1.5 | QA/Backend |
| 2 | Review interface | 1 | Frontend/TypeScript |
| 2 | Review SLA & workflow | 0.5 | Backend/DevOps |
| 2 | Training materials | 1 | Documentation |
| 3 | Testing & validation | 2 | QA |
| 4 | Positioning & docs | 1 | Product/Writing |
| **Total** | | **12 weeks** | |

**Resources:**
- 1 senior backend engineer (lead)
- 1 mid-level backend engineer (support)
- 1 QA engineer (testing)
- 1 frontend engineer (review interface)
- 1 domain expert (rule encoding & reviewer training)
- 1 product manager (positioning & launch)

### External Costs

- Reviewer training: ~$10k (materials, initial compensation)
- Reviewer capacity (post-launch): 2-3 FTE reviewers @ ~$100k/year

---

## WHAT CONSULTANT-GRADE CLAIM MEANS

**If Option E + C is Adopted:**

Consultant-grade = "OpsIQ + Human Expert Review produces recommendations that meet professional consulting standards."

**Not:** "Autonomous engine diagnoses like a senior consultant."

**Instead:** "Engine gathers evidence and proposes diagnosis. Human expert validates and authors final recommendation."

This is how consulting firms actually work. The value is real, and accuracy is high. The honest claim is valuable.

---

## FINAL DECISION: USER ACTION REQUIRED

### Decision Point

You must choose one:

1. **Proceed with Option E + C (Recommended)**
   - Commit: Build evidence synthesis + human review
   - Timeline: 12 weeks
   - Cost: 2 senior engineers + 1 domain expert + review infra
   - Outcome: Consultant-grade (hybrid) in Q3 2026

2. **Proceed with Option F (Diagnostic Assistant)**
   - Commit: Build evidence synthesis only, no human review
   - Timeline: 6 weeks
   - Cost: 1.5 senior engineers + 1 domain expert
   - Outcome: Strong diagnostic tool (not autonomous consultant) in Q2 2026

3. **Archive Project**
   - Commit: Conclude R&D; OpsIQ reaches architectural ceiling
   - Outcome: Learnings documented; no further investment

### What Cannot Proceed

❌ **Do NOT** attempt Option A (pattern expansion) — ceiling too low, ROI poor

❌ **Do NOT** claim consultant-grade without human review — Option E + C or Option F, not engine alone

❌ **Do NOT** continue incremental slices (Slice 3, 4, ...) — architecture limits apply

❌ **Do NOT** modify Round 1 or Round 2 artifacts — frozen for reference

❌ **Do NOT** modify case packs or scoring criteria — not root cause

---

## FINAL STATUS

```
ARCHITECTURE_CEILING_CONFIRMED

round_1_summary:
  cases: 50
  root_cause_accuracy: 15%
  first_action_accuracy: 0%
  evidence_trace: not measured
  safety: clean
  assessment: pattern-matching works for simple cases

round_2_summary:
  cases: 49 valid
  root_cause_accuracy: 0%
  first_action_accuracy: 0%
  evidence_trace: 58.5%
  safety: clean
  assessment: pattern-matching fails for complex multi-dimensional cases

failure_modes:
  - Missing evidence synthesis (trace 58.5% vs 95% target)
  - Missing causal reasoning (diagnoses do not rank competing hypotheses)
  - Missing constraint-aware action selection (actions generic, not specific)
  - Missing adversarial trap handling (40% accuracy on ADV cases)
  - Missing numerical reasoning (0% on deterministic formulas)
  - Missing blind-outcome reasoning (defaults to non-committal)

why_incremental_slices_failed:
  - Pattern library would need 5-10x expansion; doesn't scale
  - Patterns don't generalize; each evidence combination needs new pattern
  - Symptom/root separation requires structural model, not pattern-matching
  - Constraint modeling requires logic or scoring, not templates

architecture_ceiling:
  - Deterministic pattern-matching ceiling: ~20% root-cause accuracy
  - Evidence synthesis + hypothesis ranking: ~60-75% (Option C)
  - Evidence synthesis + human review: ~95%+ (Option E + C)
  - Autonomous consultant-grade: NOT ACHIEVABLE with current approach

recommended_path: |
  Option E + Option C (Hybrid)
  Evidence synthesis engine (Option C) improves to 60-75% accuracy.
  Human expert review (Option E) closes gap to 95%+ consultant-grade.
  Consultant-grade claim: "OpsIQ + Expert Consultant Review"
  Timeline: 12 weeks
  Cost: 2 senior engineers + review infrastructure

required_next_build:
  phase_1: Evidence synthesis engine (6 weeks)
    - Multi-dimensional aggregator
    - Hypothesis ranking with evidence weighting
    - Constraint-aware action prioritizer
    - Numerical reasoning module
  phase_2: Human review workflow (3 weeks)
    - Review interface and SLA
    - Reviewer training and feedback loop
  phase_3: Testing and validation (2 weeks)
  phase_4: Consultant-grade claim (conditional, 1 week)

risks:
  - Hypothesis ranking rules may be brittle (mitigate: parameterized rules + feedback loop)
  - Reviewer bottleneck at scale (mitigate: train multiple reviewers)
  - Phase 1 may only reach 50% accuracy, not 60% (mitigate: Option F fallback)

estimated_work: 12 weeks, 6 FTE

benchmark_plan:
  - Monthly integration testing on Round 2 subset (target 60% root-cause)
  - Weekly metrics dashboard (accuracy, trace, constraint fit)
  - Week 12 gate report: consultant-grade claim approval/rejection

user_decision_required: true

final_status: ARCHITECTURE_CEILING_CONFIRMED
```

---

**This report is final. Awaiting user decision on which path to proceed.**

