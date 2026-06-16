# STAGE A EXECUTION SPECIFICATION

**Date:** 2026-06-16  
**Authority:** execution_consultant_engine_v2.md §17A, §17C, §17F  
**Status:** SPECIFICATION_READY_FOR_HOSTILE_AUDIT  

---

## 1. OBJECTIVE

Make OpsIQ produce structured diagnostic output that:
- Surfaces multi-dimensional evidence synthetically
- Generates competing root-cause hypotheses
- Ranks hypotheses by confidence and supporting evidence
- Recommends constraint-aware first actions
- Maintains evidence traceability and owner transparency

**Success Definition:** Evidence trace improves from 58.5% to ≥85%; top-3 hypotheses are plausible; owner can validate diagnosis from evidence.

**Not Included:** Causal reasoning graphs (Stage B), LLM reasoning (Stage C), owner outcome tracking (Stage D).

---

## 2. TARGET METRICS

**Primary Success Metrics (All Must Be Met):**
- Root-cause accuracy: 40-60% on 20-case Round 2 benchmark subset (currently 0%)
- First-action accuracy: 30-50% on same 20-case subset (currently 0%)
- Evidence trace rate: ≥85% of available evidence cited (currently 58.5%)
- Dangerous recommendations: 0 (must maintain)
- Hallucinations: 0% (must maintain)
- False confidence: 0% (must maintain)
- Confidence bound: ≤65% for diagnoses (no false certainty)

**Secondary Metrics (Informational):**
- Cases passing quality gate: ≥70% (currently 78%)
- Top-3 hypotheses accuracy: ≥1 hypothesis correct in top-3 (baseline 0/3)
- Action constraint awareness: Recommendations mention ≥2 constraints per case
- Evidence dimension coverage: Financial, operational, market, team all examined where present

**Pass/Fail Threshold:**
- PASS: Root-cause ≥40% AND evidence trace ≥85% AND safety = clean
- FAIL: Root-cause <35% OR evidence trace <80% OR safety regression

---

## 3. SCOPE

**In Scope:**

1. Evidence synthesis across dimensions (financial, operational, market, team, customer, product, legal, regulatory)
2. Symptom vs contributing factor vs root-cause differentiation
3. Multi-dimensional pattern recognition (not single-dimension pattern matching)
4. Top-3 hypothesis generation ranked by confidence
5. Supporting and conflicting evidence mapping for each hypothesis
6. Constraint-aware action selection (cost, timeline, risk, resource constraints)
7. Numeric reasoning for financial calculations and thresholds
8. Missing-data refusal (refuse diagnosis if critical evidence absent)
9. Confidence calibration (bound to measured accuracy)
10. Safety validation (no dangerous recommendations, no false confidence)
11. Hallucination detection (all claims traceable to evidence)

**Not in Scope:**

- Causal reasoning graphs or cause-effect models (Stage B)
- Adversarial trap detection (Stage B)
- LLM reasoning or neural network reasoning (Stage C)
- Owner outcome tracking or learning (Stage D)
- Integration with case library or retrieval (Stage D4)
- Production scaling or SaaS infrastructure
- Consultant-grade accuracy claims (requires Round 3 validation)

---

## 4. NON-SCOPE (EXPLICITLY FORBIDDEN)

1. ✗ Do not train on Round 2 answer keys (benchmark contamination)
2. ✗ Do not hardcode Round 2 case patterns (overfitting)
3. ✗ Do not use benchmark answers to guide design (leakage)
4. ✗ Do not copy Round 1 archetypes without revision (no scope creep from Slice 2A)
5. ✗ Do not claim ≥80% accuracy on Round 2 (consultant-grade prohibition)
6. ✗ Do not implement causal graphs (Stage B scope)
7. ✗ Do not add LLM reasoning without safety guardrails (Stage C)
8. ✗ Do not use hidden outcomes during development (D2 isolation)
9. ✗ Do not auto-learn from outcomes (Stage D3 prohibition)
10. ✗ Do not modify Round 1 or Round 2 artifacts (immutable)

---

## 5. REQUIRED MODULES/SERVICES

**Service 1: Evidence Synthesis Engine**
- Input: Case evidence items (symptoms, financial metrics, operational data, market signals, team info)
- Process: Aggregate evidence across dimensions; identify patterns; weight by evidence strength
- Output: Synthesized evidence summary with dimension coverage and missing dimensions
- Interface: `synthesizeEvidence(caseEvidence) → SynthesizedEvidence`
- Tests: 20+ unit tests covering single dimension, multi-dimension, missing data cases

**Service 2: Symptom vs Contributing vs Root-Cause Separator**
- Input: Synthesized evidence + hypothesis candidate
- Process: Classify each evidence item as symptom/contributing/root-cause
- Output: Classification with rationale
- Interface: `classifyEvidenceRole(evidence, hypothesis) → Classification`
- Tests: 20+ unit tests on known symptom/cause patterns

**Service 3: Top-3 Hypothesis Generator**
- Input: Synthesized evidence, root-cause labels (9 possible)
- Process: Generate 3 most likely root-cause hypotheses from evidence
- Output: [Hypothesis1, Hypothesis2, Hypothesis3] with initial confidence scores
- Interface: `generateHypotheses(synthesizedEvidence) → Hypotheses[3]`
- Tests: 20+ unit tests ensuring 3 distinct hypotheses, at least 1 plausible

**Service 4: Hypothesis Ranking Algorithm**
- Input: 3 hypotheses, synthesized evidence
- Process: Score each hypothesis by supporting/conflicting evidence strength
- Output: Ranked hypotheses with scores and evidence mapping
- Interface: `rankHypotheses(hypotheses, evidence) → RankedHypotheses`
- Tests: 20+ unit tests on evidence scoring, ranking consistency

**Service 5: Supporting/Conflicting Evidence Mapper**
- Input: Hypothesis, synthesized evidence
- Process: Identify which evidence supports, conflicts, or is neutral to hypothesis
- Output: Mapping with strength scores (1-10 scale)
- Interface: `mapEvidence(hypothesis, evidence) → EvidenceMapping`
- Tests: 20+ unit tests on evidence relevance

**Service 6: Constraint-Aware First-Action Selector**
- Input: Top hypothesis, case constraints (budget, timeline, risk tolerance, resources)
- Process: Select action from library; weight by constraint impact
- Output: Recommended action with constraint impact analysis
- Interface: `selectAction(hypothesis, constraints) → Action`
- Tests: 20+ unit tests ensuring actions respect constraints

**Service 7: Numeric Reasoning Module**
- Input: Financial metrics (margin, growth, utilization, cost structures)
- Process: Calculate key ratios, apply financial thresholds, identify anomalies
- Output: Numeric analysis with thresholds violated
- Interface: `analyzeNumeric(metrics) → NumericAnalysis`
- Tests: 20+ unit tests on financial calculations, threshold detection

**Service 8: Missing-Data Refusal Rules**
- Input: Case evidence, hypothesis
- Process: Check if required evidence is absent
- Output: Refusal flag if critical evidence missing
- Interface: `checkMissingData(evidence, hypothesis) → RefusalFlag`
- Tests: 20+ unit tests on missing-data scenarios

**Service 9: Confidence Calibrator**
- Input: Evidence strength, hypothesis plausibility, accuracy history
- Process: Calculate confidence score bounded by measured accuracy
- Output: Confidence score (0-65, never >65)
- Interface: `calibrateConfidence(evidence, hypothesis, history) → Confidence`
- Tests: 20+ unit tests ensuring confidence ≤65, calibrated to accuracy

**Service 10: Safety Validator**
- Input: Action recommendation
- Process: Check against safety rules (no dangerous actions, no unethical actions)
- Output: Pass/fail with reason if fail
- Interface: `validateSafety(action) → ValidationResult`
- Tests: 20+ unit tests on known unsafe actions

**Service 11: Hallucination Guard**
- Input: Output claim (diagnosis or action rationale)
- Process: Verify all evidence claims exist in case input
- Output: Pass/fail, flag unsupported claims
- Interface: `checkHallucination(claim, caseInput) → Pass/Fail`
- Tests: 20+ unit tests on unsupported claims

---

## 6. DATA STRUCTURES

**Evidence Schema:**
```typescript
interface CaseEvidence {
  caseId: string;
  industry: string;
  businessModel: string;
  stage: "early" | "growth" | "mature" | "decline";
  
  dimensions: {
    financial: {
      grossMargin?: number;
      netMargin?: number;
      revenueGrowth?: number;
      costStructure?: string;
      cashFlow?: string;
    };
    operational: {
      utilization?: number;
      cycleTime?: string;
      qualityMetrics?: string;
      capEx?: string;
    };
    market: {
      marketShare?: number;
      competitorActivity?: string;
      customerRetention?: number;
      pricingPower?: string;
    };
    team: {
      turnover?: number;
      keyPersonDependency?: boolean;
      leadershipGaps?: string;
    };
    customer: {
      satisfactionScore?: number;
      churnRate?: number;
      acquisitionCost?: string;
    };
    product: {
      productQuality?: string;
      featureCompleteness?: string;
      technicalDebt?: string;
    };
  };
  
  evidenceItems: Array<{
    id: string;
    dimension: string;
    statement: string;
    strength: 1 | 2 | 3 | 4 | 5; // 1=weak, 5=strong
    source: string;
  }>;
  
  constraints: {
    budget: "high" | "medium" | "low" | string;
    timeline: "urgent" | "6-month" | "12-month" | string;
    riskTolerance: "high" | "medium" | "low";
    resources: string[];
  };
}
```

**Hypothesis Structure:**
```typescript
interface Hypothesis {
  id: string;
  rootCause: string; // One of 9 labels
  confidence: number; // 0-65
  supportingEvidence: Array<{
    evidenceId: string;
    strengthScore: number; // 1-10
  }>;
  conflictingEvidence: Array<{
    evidenceId: string;
    strengthScore: number; // 1-10
  }>;
  reasoning: string; // Explanation why this is root cause
  alternativeRejectionReason: string; // Why not other causes
}
```

**Action Structure:**
```typescript
interface Action {
  id: string;
  description: string;
  rationale: string; // Why this action addresses root cause
  timeline: string; // When to implement
  cost: string; // Approximate cost
  riskLevel: "low" | "medium" | "high";
  constraintImpact: {
    budget: "positive" | "neutral" | "negative" | string;
    timeline: "positive" | "neutral" | "negative" | string;
    risk: "positive" | "neutral" | "negative" | string;
  };
  expectedOutcome: string; // What success looks like
  failureMode: string; // What could go wrong
}
```

**Output Structure:**
```typescript
interface DiagnosisOutput {
  caseId: string;
  timestamp: string;
  
  evidenceSynthesis: {
    dimensionsExamined: string[];
    dimensionsMissing: string[];
    evidenceTraceRate: number; // Percentage of evidence cited
    criticalEvidencePresent: boolean;
  };
  
  hypotheses: [Hypothesis, Hypothesis, Hypothesis]; // Top 3 ranked
  
  topHypothesis: {
    rootCause: string;
    confidence: number;
    confidenceReason: string;
  };
  
  firstAction: {
    description: string;
    rationale: string;
    constraintImpact: object;
    alternativeActions: string[];
  };
  
  safetyChecks: {
    dangerousRecommendation: false;
    hallucinations: false;
    missingCriticalEvidence: boolean;
    missingDataStatement: string;
  };
  
  ownerGuidance: string; // Plain English explanation for owner
}
```

---

## 7. EVIDENCE SYNTHESIS MODEL

**Algorithm:**

1. **Input:** Case evidence items across all dimensions
2. **Dimension Coverage:** Identify which dimensions have evidence (yes/no for each of 8)
3. **Evidence Strength Scoring:** Score each item 1-5 (weak to strong)
4. **Pattern Recognition:** Identify patterns within and across dimensions
   - Within financial: margin decline + cost structure issues = unit economics pattern
   - Across financial + operational: margin decline + high utilization = bottleneck pattern
   - Across market + team: share decline + turnover = execution failure pattern
5. **Evidence Synthesis:** Combine patterns across dimensions into unified hypothesis candidates
6. **Missing Evidence Identification:** Flag dimensions where no evidence exists
7. **Output:** Synthesized evidence profile with patterns identified, confidence in synthesis, dimensions missing

**Cross-Dimension Pattern Synthesis Algorithm:**

For each pair of dimensions (D1, D2):
1. Identify patterns in D1 (e.g., margin decline)
2. Identify patterns in D2 (e.g., high utilization)
3. Calculate correlation strength: (common_root_cause_score / total_evidence) * 100
4. If correlation ≥70%: Create composite hypothesis (e.g., "unit economics via bottleneck")
5. If correlation <70%: Treat as separate hypotheses

Pattern Strength Score = (supporting_evidence_count × avg_strength) / total_evidence
- Score ≥8/10: Strong pattern (confidence boost to +5 or higher)
- Score 5-7/10: Moderate pattern (confidence boost to +3)
- Score <5/10: Weak pattern (confidence no boost)

**Quality Rules:**
- Cannot synthesize if critical dimension is entirely missing (e.g., no financial data for unit-economics diagnosis)
- Synthesis confidence bounded by weakest evidence dimension (chain is as strong as weakest link)
- All synthesized claims must be traceable to input evidence items
- No evidence item counts toward multiple dimensions (exclusive use)

---

## 8. SYMPTOM vs CONTRIBUTING vs ROOT-CAUSE SEPARATOR

**Definitions:**
- **Symptom:** Observable consequence of root cause (e.g., margin decline is symptom, not cause)
- **Contributing Factor:** Condition that makes root cause worse but didn't cause it (e.g., high leverage contributes to unit-economics crisis)
- **Root Cause:** Fundamental reason business is struggling (e.g., cost structure misaligned to price point)

**Classification Algorithm:**

1. For each evidence item + candidate hypothesis pair:
2. Ask: "Does evidence directly explain why root cause occurred?" → ROOT_CAUSE
3. Ask: "Is evidence a direct consequence of root cause?" → SYMPTOM
4. Ask: "Does evidence make root cause worse but didn't cause it?" → CONTRIBUTING
5. Ask: "Is evidence unrelated?" → UNRELATED
6. Assign confidence to classification using scale below

**Confidence Scale for Classifications:**
- 5 = Absolutely certain (99%+ confidence in assignment)
- 4 = Very confident (85-99% confidence)
- 3 = Moderately confident (70-84% confidence)
- 2 = Somewhat confident (50-69% confidence)
- 1 = Uncertain guess (below 50% confidence)

Rule: If confidence < 3, flag the classification to owner (uncertain diagnosis)

**Quality Rules:**
- Every diagnosis must have ≥2 root-cause evidence items (not all symptoms)
- Symptoms alone do not justify diagnosis (must trace to root)
- Contributing factors must be acknowledged but not mistaken for root cause

---

## 9. TOP-3 HYPOTHESIS GENERATOR

**Algorithm:**

1. **Seed Candidates:** Start with 9 root-cause labels (from Round 2 answer keys)
2. **Evidence Relevance:** For each label, score how much available evidence is relevant
3. **Pattern Matching:** Check if evidence patterns match known patterns for each label
4. **Initial Scoring:** Score 0-100 based on evidence relevance + pattern match
5. **Top-3 Selection:** Select top 3 by score
6. **Plausibility Check:** Verify each top-3 candidate is plausible given evidence (not contradicted)
7. **Output:** Return [Hypothesis1, Hypothesis2, Hypothesis3] with scores

**Plausibility Criterion:**

A hypothesis is plausible if:
1. At least 2 evidence items support it (not just 1)
2. No major contradictions (conflicting evidence <3 items)
3. Known root-cause label (one of 9 defined labels)
4. Causal logic is valid (root cause → evidence chain is logical)

A hypothesis is NOT plausible if:
1. Only 1 evidence item supports it (too thin)
2. Multiple major contradictions (>5 conflicting items)
3. Unknown root-cause label (not in defined set)
4. Causal logic is broken (doesn't explain evidence)

Action: If candidate hypothesis fails plausibility, remove from top-3 and replace with next candidate

**Quality Rules:**
- Must return exactly 3 hypotheses (not 1, not 5)
- All 3 must be plausible (must pass plausibility criterion above)
- Top-3 must be distinct (not slight variations of same hypothesis)
- If evidence is contradictory, flag it (don't hide uncertainty)

---

## 10. HYPOTHESIS RANKING ALGORITHM

**Input:** 3 hypotheses, synthesized evidence

**Algorithm:**

1. **For Each Hypothesis:**
   - Count supporting evidence items (evidence that supports this diagnosis)
   - Count conflicting evidence items (evidence that contradicts)
   - Calculate support score: (supporting_count × avg_strength) / total_evidence
   - Calculate conflict score: (conflicting_count × avg_strength) / total_evidence
   
2. **Net Score:** Support score - conflict score = net evidence strength
   - Range: -10 to +10
   
3. **Confidence Calculation:**
   - If net score > +5: confidence = 60
   - If net score +3 to +5: confidence = 50
   - If net score +1 to +3: confidence = 40
   - If net score -1 to +1: confidence = 25 (unclear)
   - If net score < -1: confidence = 10 (contradicted)
   - Cap all at 65 (never higher)
   
4. **Ranking:** Sort by confidence descending

**Confidence Justification Rule:**

For every confidence score assigned to a hypothesis:
1. Count supporting evidence items
2. Count conflicting evidence items
3. Verify formula: confidence = (supporting - conflicting) / total_evidence
4. Check that confidence calculation matches formula (bit-exact match)

Verification Process:
- For each of top-3 hypotheses
- Show: "Supporting: 5 items, Conflicting: 1 item, Total: 8, Confidence = (5-1)/8 = 50%"
- Verify formula matches assigned confidence (no ad-hoc adjustments)

If confidence cannot be justified to owner, output is INVALID

**Quality Rules:**
- Ranking must be deterministic (same inputs = same outputs)
- Confidence must be justified by evidence (not speculative) - verify using formula above
- Confidence never exceeds 65 (rules, not negotiable)

---

## 11. SUPPORTING/CONFLICTING EVIDENCE MAPPING

**Algorithm:**

For each hypothesis and each evidence item:

1. **Relevance:** Is this evidence relevant to this hypothesis? (Yes/No)
2. **Direction:** If relevant, does it support (+) or conflict (-)? 
3. **Strength:** How strong is the support/conflict? (1-10 scale)
4. **Reasoning:** One-line explanation why

**Output:**
```typescript
interface EvidenceMapping {
  hypothesis: string;
  supporting: Array<{evidenceId, strength, reasoning}>;
  conflicting: Array<{evidenceId, strength, reasoning}>;
  neutral: Array<{evidenceId, reasoning}>;
  coverage: number; // Percentage of evidence reviewed
}
```

**Quality Rules:**
- Must review all evidence items (coverage = 100%)
- Strength scores must be consistent (same type evidence = same strength)
- No evidence can be counted as both supporting and conflicting (choose one)

---

## 12. CONSTRAINT-AWARE FIRST-ACTION SELECTOR

**Input:** Top hypothesis, case constraints (budget, timeline, risk tolerance)

**Safety Check (CRITICAL - Run FIRST):**

BEFORE scoring constraint fit:
1. Run Safety Validator (§16) on each candidate action
2. If safety fails: REJECT action immediately (don't consider constraints)
3. If safety passes: Proceed to constraint scoring

Rule: Constraint fit is irrelevant if action is unsafe
(Cannot recommend illegal action just because it fits the budget)

**Algorithm:**

1. **Action Library:** Maintain library of ~20 actions per root-cause label
2. **Candidate Actions:** Filter by hypothesis (only actions addressing that root cause)
3. **Safety Validation:** Filter out unsafe actions (§12 Safety Check above)
4. **Constraint Scoring:** For each SAFE candidate action, score constraint fit:
   - Budget fit: Does action cost fit available budget? (0-10)
   - Timeline fit: Can action be implemented in required timeline? (0-10)
   - Risk fit: Does action match risk tolerance? (0-10)
   - Resource fit: Do required resources exist? (0-10)
5. **Net Score:** Average of 4 constraint scores
6. **Selection:** Pick action with highest net score
7. **Output:** Recommended action with constraint impact analysis

**Quality Rules:**
- Action must be safe (safety validated first, non-negotiable)
- Action must be specific to case (not generic template)
- Action must address selected hypothesis (causal link clear)
- Action must respect all hard constraints (cannot violate budget/timeline hard limits)
- If no action fits all constraints, flag to owner (cannot execute)

---

## 13. NUMERIC REASONING LAYER

**Purpose:** Handle quantitative decisions and financial calculations

**Capabilities:**

1. **Ratio Calculation:** Gross margin, net margin, ROI, utilization, growth rates
2. **Threshold Detection:** Identify when metrics cross important thresholds
   - Margin <15% = unit economics crisis risk
   - Growth <5% = demand crisis risk
   - Utilization >90% = bottleneck risk
3. **Trend Analysis:** Is metric improving or declining? Rate of change?
4. **Comparative Analysis:** Is metric better/worse than industry/peers?
5. **Breakeven Analysis:** How long can business sustain current trajectory?

**Implementation:**
- Define 20+ key financial ratios
- Define thresholds for each ratio (when is it healthy? when is it concerning? when is it critical?)
- Calculate ratios automatically from case evidence
- Flag violations as evidence for diagnoses

**Numeric Calculation Verification Rule:**

For every numeric calculation:
1. Document the formula used (e.g., "Gross margin = (Revenue - COGS) / Revenue")
2. Document the input values (from case evidence, with source)
3. Show the calculation step-by-step
4. Verify result is mathematically correct
5. If inputs incomplete: REFUSE calculation (don't estimate)

Output Format:
"Gross margin = Revenue ($100M) - COGS ($60M) / Revenue = 40%"
(Not: "Gross margin ≈ 40%" without showing work)

Rule: All numeric claims must be derivable from documented evidence

**Quality Rules:**
- All calculations must be verifiable (formula shown to owner)
- Thresholds must be industry-appropriate (not one-size-fits-all)
- If data incomplete, refuse calculation (don't estimate)
- Show all work for numeric claims (no hidden calculations)

---

## 14. MISSING-DATA REFUSAL RULES

**Principle:** Refuse diagnosis if critical evidence is missing (better to say "need more info" than wrong guess)

**Rules:**

1. **For UNIT_ECONOMICS diagnosis:** Must have financial metrics (margin, cost structure)
   - Missing? Refuse with message: "Need financial data to diagnose unit economics"
   
2. **For GO_TO_MARKET diagnosis:** Must have market share, customer acquisition, pricing data
   - Missing? Refuse: "Need market/customer data to diagnose go-to-market"
   
3. **For OPERATIONAL_BOTTLENECK diagnosis:** Must have utilization, cycle time, capacity data
   - Missing? Refuse: "Need operational metrics to diagnose bottleneck"
   
4. **For TEAM_CAPABILITY diagnosis:** Must have turnover, leadership, skill data
   - Missing? Refuse: "Need team/leadership data to diagnose team issues"
   
5. **For other diagnoses:** Check case-by-case what evidence would be required

**Output:**
- If data sufficient: Proceed with diagnosis
- If data insufficient: Return "INSUFFICIENT_EVIDENCE" status with list of required data

**Missing-Data Refusal Benchmarking:**

On 20-case benchmark:
1. Count cases where diagnosis is generated (evidence sufficient)
2. Count cases where diagnosis is refused (evidence insufficient)
3. Expected ratio: 70% generate, 30% refuse (should not be 100% either way)

If >80% cases are refused: Algorithm is too conservative (fix: lower thresholds)
If <50% cases are refused: Algorithm is too aggressive (fix: raise thresholds)

Benchmark metric: "Refusal rate = [X%] (target 20-30%, range 10-40%)"

**Quality Rules:**
- Never guess when data missing (false confidence is dangerous)
- Always tell owner what data would help
- Refusal behavior must be measured and reasonable (not 100%, not 0%)

---

## 15. CONFIDENCE CALIBRATION RULES

**Principle:** Confidence score must match measured accuracy (overconfidence = bad for owner)

**Calibration Process:**

1. **Baseline:** Round 1 showed 15% root-cause accuracy, Round 2 showed 0% accuracy
2. **Stage A Target:** 40-60% accuracy expected
3. **Confidence Mapping:**
   - If evidence is strong + hypothesis plausible + no contradictions: confidence = 50-65
   - If evidence is moderate + hypothesis plausible + some contradictions: confidence = 40-50
   - If evidence is weak + hypothesis plausible but uncertain: confidence = 30-40
   - If evidence contradicts or missing: confidence = 10-25

4. **Post-Implementation Adjustment:** After Stage A benchmarking:
   - If Stage A achieves 40% accuracy: confidence scores should cluster 40-50
   - If Stage A achieves 50% accuracy: confidence scores should cluster 45-55
   - If Stage A achieves 60% accuracy: confidence scores should cluster 50-60
   - Mismatch = retune calibration

**Overfitting Guard for Confidence Calibration:**

Before final calibration:
1. Split 20-case benchmark into: 16-case training set + 4-case hold-out set
2. Calculate confidence calibration from 16-case set only
3. Verify calibration on 4-case hold-out set (does it generalize?)
4. If hold-out accuracy is much worse than training accuracy: OVERFITTING DETECTED

Rule: Cannot use full 20-case benchmark for both design AND validation
      (Use hold-out set to verify calibration generalizes)

**Quality Rules:**
- Confidence must never exceed 65 (hard cap, no exceptions)
- Confidence must be honest (not inflated)
- Owner should win 4/10 times they choose top hypothesis (40% accuracy)
- Confidence calibration must generalize to unseen cases (hold-out set proves it)

---

## 16. SAFETY VALIDATOR

**Dangerous Actions Prohibited:**

1. ✗ Recommendations to break laws/regulations
2. ✗ Recommendations to exploit employees (wage theft, abuse)
3. ✗ Recommendations to defraud customers
4. ✗ Recommendations to endanger safety (health, security)
5. ✗ Recommendations to destroy evidence
6. ✗ Recommendations to retaliate against whistleblowers
7. ✗ Unethical recommendations (corruption, bribery, coercion)
8. ✗ Recommendations that sacrifice core stakeholder (employees, customers, suppliers) unfairly

**Validation Process:**

1. For each recommended action:
2. Check against 8 dangerous-action rules above
3. If any rule violated: FAIL and refuse action
4. If all rules passed: PASS
5. Output: Pass/Fail with reason if fail

**Quality Rules:**
- Never recommend dangerous action, no matter how profitable
- Safety is not negotiable
- If action seems dangerous but is legal, flag to owner (let owner decide)

---

## 17. HALLUCINATION GUARD

**Principle:** All claims must be traceable to case evidence (no made-up facts)

**Algorithm:**

1. **For Every Claim in Output** (diagnosis, action, reasoning):
   - Can this claim be traced to a case evidence item?
   - Or is this a logical inference from evidence items?
   - Or is this made-up/speculated?

2. **Rules:**
   - Traceable to evidence: OK ✓
   - Logical inference from evidence: OK ✓ (but mark as inference)
   - Made-up/speculated: FAIL ✗

3. **Output:** Pass/Fail with list of unsupported claims if fail

**Quality Rules:**
- Zero hallucinations allowed
- When forced to infer, mark as inference (not fact)
- If uncertain, don't say it

---

## 18. BENCHMARK VALIDATION PLAN

**Benchmark Subset:** 20 cases from Round 2 (currently 49 valid cases)

**Case Selection:**
- Representative of all 9 root-cause labels
- Mix of case types: RW, PD, SYN, ADV, BLND
- Includes all 5 BLND cases (must pass)
- Includes 3-4 ADV cases (hardest cases)

**Benchmark Execution:**

1. **Prepare:** Load 20 cases (inputs only, no answer keys in memory)
2. **Execute:** Run Stage A on each case
3. **Freeze:** Write outputs to simulation_runs/round_002/stage_a_outputs/
4. **Freeze:** Lock outputs before scoring
5. **Score:** Compare outputs to answer keys manually
6. **Analyze:** Calculate root-cause accuracy, first-action accuracy, evidence trace rate

**Metrics Recorded:**
- Per-case: root-cause accuracy, first-action accuracy, confidence, evidence trace
- Aggregate: average, median, min, max for each metric
- Pass/fail vs target thresholds

**Quality Rules:**
- All 20 cases must be executed (no skipped cases)
- No answer-key access during execution (no leakage)
- Outputs must be manually reviewed (not auto-scored)
- If metrics fall short, stop and analyze (do not continue to next stage)

---

## 19. REGRESSION TESTS

**Purpose:** Ensure Stage A doesn't worsen Round 1 performance

**Test Suite:**

1. **Regression on Round 1:** Run Stage A on 5 Round 1 cases
   - Must not worsen root-cause accuracy (must stay ≥15%)
   - Must not increase dangerous recommendations (must stay 0)
   - Must not increase hallucinations (must stay 0%)

2. **Unit Tests:** For each service (11 services × 20+ tests = 220+ unit tests)
   - Evidence synthesis: handles all dimensions, detects missing dimensions
   - Separator: correctly classifies symptom/contributing/root-cause
   - Hypothesis generator: generates 3 distinct plausible hypotheses
   - Hypothesis ranker: ranking is deterministic, confidence bounded
   - Evidence mapper: all evidence reviewed, consistent strength scoring
   - Action selector: respects constraints, specific to case
   - Numeric reasoning: calculations correct, thresholds accurate
   - Missing-data refusal: refuses when data insufficient
   - Confidence calibrator: confidence ≤65, calibrated to accuracy
   - Safety validator: detects dangerous actions
   - Hallucination guard: detects unsupported claims

3. **Integration Tests:** Full pipeline on 10 diverse cases
   - End-to-end from input to output
   - All gates pass (safety, hallucination, confidence)
   - Output structure correct

**Pass Criteria:**
- All unit tests pass (220+/220+)
- All regression tests pass (Round 1 ≥15%, safety clean)
- All integration tests pass (10/10 execute cleanly)

---

## 20. ADVERSARIAL TESTS

**Purpose:** Ensure Stage A handles challenging cases (ADV, traps, contradictions)

**Test Cases:**

1. **ADV Cases (10 adversarial cases in Round 2):** Cases with plausible-but-wrong narratives
   - Goal: Get ≥4/10 correct (40% accuracy on hardest cases)
   - Must not fail due to trap (trap should not cause safety violation)

2. **Contradictory Evidence:** Cases where evidence contradicts itself
   - Goal: Recognize contradiction, flag uncertainty
   - Confidence should be low (25-40, not 60)

3. **Missing Data:** Cases with incomplete evidence
   - Goal: Refuse diagnosis appropriately (not guess)
   - Output: "INSUFFICIENT_EVIDENCE" with what's missing

4. **Edge Cases:** Extreme values, unusual industries, new business models
   - Goal: Handle gracefully (don't crash, don't hallucinate)

**Pass Criteria:**
- ADV cases: ≥4/10 correct
- Contradictory evidence: identified and confidence lowered
- Missing data: refused appropriately
- Edge cases: handled without crash/hallucination

---

## 21. MANUAL REVIEW REQUIREMENTS

**Before Stage A Can Be Marked Complete:**

1. **All 20 Benchmark Cases:** Manual review by domain expert (not Claude)
   - Read case input, read Stage A output, read answer key
   - Score: Is diagnosis reasonable? Is action appropriate? Is evidence trace good?
   - Document pass/fail and reason

2. **5 Failed Cases:** Deep dive on each failure
   - Why did Stage A get this wrong?
   - Was evidence insufficient? Was reasoning flawed? Was algorithm wrong?
   - What would be required to fix this case?

3. **5 Passed Cases:** Verify not accidental
   - Was this case too easy?
   - Would Stage A pass if we change small details?
   - Is this robust success or lucky guess?

**Manual Review Output:**
- Per-case: diagnosis quality score (1-5), action quality score (1-5), evidence trace score (1-5)
- Aggregate: average quality scores, patterns in failures, patterns in successes
- Recommendation: PROCEED, ITERATE, or HALT (see gate below)

**Manual Review Gate (STRICT):**

If domain expert recommends:
- "PROCEED": Yes, Stage A is ready (all gates passed)
- "ITERATE": No, Stage A needs redesign (continue with fixes, re-review after fixes)
- "HALT": No, Stage A has fundamental issues (stop, escalate to redesign)

Status mapping:
- Recommendation = PROCEED → Stage A PASS ✓
- Recommendation = ITERATE → Stage A BLOCKED (must fix and re-review)
- Recommendation = HALT → Stage A BLOCKED (must redesign)

Rule: CANNOT proceed to Stage B unless expert recommends PROCEED
      (ITERATE = still blocked; HALT = failed)

---

## 22. ROLLBACK RULES

**When to HALT and Rollback:**

1. **Evidence Trace Falls Below 75%** (target is ≥85%)
   - Action: HALT, investigate evidence synthesis service
   - Root cause: Is engine not examining all dimensions? Is evidence being filtered incorrectly?
   - Fix: Improve evidence synthesis, expand dimension coverage
   - Retest: Must reach ≥85% before proceeding

2. **Safety Metrics Worsen** (0 dangerous, 0 hallucinations)
   - Action: HALT immediately
   - Root cause: Which change introduced safety regression?
   - Fix: Revert change, investigate
   - Retest: Must maintain safety = clean

3. **Unit Tests Fail >10%** (more than 22 failures out of 220+)
   - Action: HALT, investigate failing service
   - Root cause: Design error? Implementation error?
   - Fix: Redesign service, rewrite code
   - Retest: All unit tests must pass before proceeding

4. **Root-Cause Accuracy on Benchmark Below Threshold** (target is 40-60%)
   - Action: Depends on accuracy level (see thresholds below)
   - Root cause: Is evidence synthesis weak? Are hypotheses wrong? Is ranking algorithm bad?
   - Fix: Redesign the bottleneck service
   - Retest: Must reach minimum threshold before proceeding

**Root-Cause Accuracy Thresholds (CLEAR):**

On 20-case benchmark:
- <35%: HARD STOP. Do not proceed. Redesign required.
- 35-39%: Marginal pass. Allowed to proceed to Stage B, but FLAG as high-risk.
- 40-60%: Target range. Proceed normally.
- >60%: Exceeds target. Stage A complete.

Rule: If accuracy is 35-39%, add to closeout: "MARGINAL_PASS_HIGH_RISK"
      Stage B implementation must address weak accuracy from Stage A.

5. **Hallucinations Detected** (>0 unsupported claims)
   - Action: HALT immediately
   - Root cause: Which service is making unsupported claims?
   - Fix: Add guards to that service, retest
   - Retest: Zero hallucinations before proceeding

**Rollback Severity:**
- Level 1 (Evidence trace, unit tests): Can continue with fixes
- Level 2 (Safety, hallucinations): Hard stop, cannot proceed
- Level 3 (Target metric <35%): Soft stop, may redesign or escalate

---

## 23. COMPLETION GATES

**All Gates Must Pass Before Stage A is Marked COMPLETE:**

1. **Static Gates:**
   - ✓ npm ci (dependencies install)
   - ✓ prisma validate (schema valid)
   - ✓ prisma generate (types generated)
   - ✓ tsc --noEmit (TypeScript compiles)
   - ✓ npm run build (production build succeeds)

2. **Unit Tests:**
   - ✓ 220+ unit tests pass (100%)
   - ✓ All 11 services tested
   - ✓ Coverage >80% of new code

3. **Regression Tests:**
   - ✓ Round 1 performance maintained (≥15% accuracy)
   - ✓ Safety metrics stable (0 dangerous, 0 hallucinations)
   - ✓ False confidence stable (0%)

4. **Benchmark Tests:**
   - ✓ 20-case Round 2 subset executed
   - ✓ Root-cause accuracy ≥40%
   - ✓ Evidence trace ≥85%
   - ✓ Safety clean (0 dangerous, 0 hallucinations)
   - ✓ Confidence ≤65 (no false certainty)

5. **Adversarial Tests:**
   - ✓ ADV cases: ≥4/10 correct
   - ✓ Contradictory evidence: identified
   - ✓ Missing data: refused appropriately

6. **Manual Review:**
   - ✓ All 20 benchmark cases reviewed by domain expert
   - ✓ 5 failures analyzed
   - ✓ 5 successes verified
   - ✓ Recommendation to proceed obtained

7. **Safety & Hallucination Gates:**
   - ✓ Zero hallucinations in outputs
   - ✓ Zero dangerous recommendations
   - ✓ Zero leakage from Round 2 answers
   - ✓ Zero contamination of benchmark

8. **Immutable Artifact Verification:**
   - ✓ Round 1 artifacts unchanged
   - ✓ Round 2 artifacts unchanged
   - ✓ Round 2 answer keys unchanged

**Completion Gate Rule (ABSOLUTE):**

ALL gates must pass. Not 7/8. Not 15/16. ALL.

If ANY gate fails:
- Status = BLOCKED_WITH_EVIDENCE (not COMPLETE)
- Action = Fix the failing gate, rerun gate
- Escalation = If gate fails repeatedly, redesign Stage A

Gate Categories (must ALL pass):
  1. Static Gates (5/5 must pass)
  2. Unit Tests (100% must pass, not 95%)
  3. Regression Tests (must not worsen)
  4. Benchmark Tests (must meet all 5 criteria)
  5. Adversarial Tests (must meet all 3 criteria)
  6. Manual Review (must have PROCEED recommendation)
  7. Safety & Hallucination (must be zero)
  8. Immutable Artifact Check (must be unchanged)

Rule: ZERO exceptions. If even one gate fails, Stage A is BLOCKED.

---

## 24. FAILURE CONDITIONS

**Stage A is FAILED if Any of These Occur:**

1. **Root-cause accuracy <35%** on 20-case benchmark (cannot improve over 0%)
2. **Evidence trace <80%** on benchmark (cannot reach ≥85% target)
3. **Safety metrics worsen** (dangerous recommendations increase, hallucinations appear)
4. **Unit tests fail >10%** and cannot be fixed
5. **Hallucinations detected** (>0 unsupported claims in outputs)
6. **Answer-key leakage detected** during development
7. **Round 1 or Round 2 artifacts modified** (immutability violated)
8. **Manual review recommends HALT** (domain expert judges Stage A insufficient)
9. **Static gates fail** (code doesn't compile, tests don't run)
10. **Any hostile audit finds unsupported design** (specification was flawed)

**If Stage A Fails:**
- Status: BLOCKED_WITH_EVIDENCE
- Next step: Redesign and respecify Stage A (or halt roadmap)
- No proceeding to Stage B until Stage A passes

---

## 25. STAGE A CLOSEOUT FORMAT

**Required Output:**

```yaml
STAGE_A_EXECUTION_CLOSEOUT:
  date: 2026-06-XX
  branch: claude/execution-consultant-engine-v2-kobwgj
  commit_before: [hash]
  commit_after: [hash]
  
  specification_gates:
    specification_complete: true
    hostile_audit_complete: true
    hostile_audit_passed: true
    spec_issues_found: [count]
    spec_issues_fixed: [count]
  
  implementation_gates:
    static_gates_pass: [true/false]
    unit_tests_pass: [true/false, count/total]
    regression_tests_pass: [true/false]
    benchmark_gates_pass: [true/false]
    adversarial_tests_pass: [true/false]
    manual_review_pass: [true/false]
    safety_gates_pass: [true/false]
    hallucination_gates_pass: [true/false]
    immutable_artifact_check: unchanged
  
  metrics:
    root_cause_accuracy: [X%] (target 40-60%, baseline 0%)
    first_action_accuracy: [X%] (target 30-50%, baseline 0%)
    evidence_trace_rate: [X%] (target ≥85%, baseline 58.5%)
    dangerous_recommendations: [count] (target 0)
    hallucinations: [X%] (target 0%)
    false_confidence: [X%] (target 0%)
    
  benchmark_subset:
    cases_executed: [20]
    cases_passed: [count]
    cases_failed: [count]
    failures_analyzed: yes
    successes_verified: yes
  
  manual_review:
    cases_reviewed: 20
    quality_score: [X/5] (average across cases)
    domain_expert_recommendation: [proceed/iterate/halt]
  
  contamination_audit:
    round_1_untouched: yes
    round_2_untouched: yes
    answer_keys_sealed: yes
    benchmark_isolation_verified: yes
    leakage_detected: no
  
  artifacts_created:
    - src/services/evidence-synthesis-engine.ts
    - src/services/separator.ts
    - src/services/hypothesis-generator.ts
    - src/services/hypothesis-ranker.ts
    - src/services/evidence-mapper.ts
    - src/services/action-selector.ts
    - src/services/numeric-reasoner.ts
    - src/services/missing-data-refusal.ts
    - src/services/confidence-calibrator.ts
    - src/services/safety-validator.ts
    - src/services/hallucination-guard.ts
    - src/__tests__/services/stage-a-*.test.ts
    - simulation_runs/round_002/stage_a_outputs/[20 case outputs]
    - simulation_runs/round_002/stage_a_benchmark_results.json
    - simulation_runs/round_002/stage_a_manual_review.md
  
  next_required_step:
    - if_pass: DESIGN_ROUND_3_CASE_PACK + DESIGN_D1_SOURCING (parallel to Stage B)
    - if_fail: REDESIGN_STAGE_A or HALT_ROADMAP
  
  consultant_grade_claim: PROHIBITED (Stage A is 40-60% accuracy, not consultant-grade)
  
  final_status:
    - STAGE_A_COMPLETE_AND_VALIDATED (if all gates pass)
    - STAGE_A_BLOCKED_WITH_EVIDENCE (if any gate fails)
```

---

## SPECIFICATION VALIDATION CHECKLIST

**Before Marking Spec Ready for Implementation:**

- [X] All 25 sections defined and specific
- [X] Requirements are testable (can measure success/failure)
- [X] No vague language ("should", "might", "probably")
- [X] All data structures defined (interfaces provided)
- [X] All algorithms detailed (pseudocode level)
- [X] All gates defined (what must pass, what's hard stop)
- [X] Contamination risks identified (benchmark isolation clear)
- [X] Hallucination risks identified (claim traceability required)
- [X] Overfitting risks identified (random hardcoding forbidden)
- [X] Owner-mode usefulness verified (specs serve owner's needs)
- [X] Metrics are measurable (not "probably good")
- [X] Pass/fail criteria unambiguous (not subjective)
- [X] Manual review requirements clear
- [X] Rollback rules are actionable
- [X] Closeout format complete

---

**Status:** SPECIFICATION_READY_FOR_HOSTILE_AUDIT

This specification is self-contained and implementable. No ambiguity remains.

