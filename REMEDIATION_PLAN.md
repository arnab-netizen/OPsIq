# OpsIQ Consulting Engine Remediation Plan

**Date:** 2026-06-16  
**Status:** ANALYSIS_PHASE_COMPLETE_READY_FOR_REVIEW  
**Basis:** Round 1 hostile audit (5.21/10 corrected average, manual locked-answer-key review)

---

## EXECUTIVE SUMMARY

The OpsIQ consulting engine scored **5.21/10 average** (corrected) across 50 cases in Round 1, with **0/50 passing** the consultant-grade threshold (≥8.5/10). This remediation plan analyzes the failure distribution, evaluates 6 fix options, and recommends a specific architecture to reach ≥8.5/10 while maintaining safety (0 dangerous recommendations, <2% hallucination).

**Key Finding:** The engine has strong mechanical form (audit trails, recommendation structure, reasoning documentation all score 6+/10) but weak substance on diagnosis and first-action alignment. Two distinct failure modes account for all 50 failures:
- **DIAGNOSIS_COVERAGE_GAP (10 cases):** Engine cannot diagnose root cause; returns INSUFFICIENT_EVIDENCE
- **DIMENSION_COVERAGE_GAP (40 cases):** Engine diagnoses a valid archetype but selects generic/misaligned first actions

---

# PHASE 1: FAILURE DISTRIBUTION AUDIT

## Verified Round 1 Metrics

```
FAILURE_DISTRIBUTION_AUDIT:
  total_cases: 50
  average_score: 5.21/10 (corrected manual, valid)
  median_score: 5.00/10 (corrected manual, valid)
  pass_rate: 0/50 (threshold ≥8.5)
  score_range: 5.00-7.44/10
```

## Failure Pattern Distribution

| Failure Type | Count | Cases | Avg Score |
|---|---|---|---|
| **DIAGNOSIS_COVERAGE_GAP** | 10 | ADV-001, ADV-004, BLND-001, PD-001, PD-002, RW-001, RW-002, RW-003, RW-006, SYN-001 | 6.03/10 |
| **DIMENSION_COVERAGE_GAP** | 40 | All others (RW-004, RW-005, RW-007-015; PD-003-010; SYN-002-010; ADV-002-003, ADV-005-010; BLND-002-005) | 5.00/10 |

### Failure Mode #1: DIAGNOSIS_COVERAGE_GAP (10 cases, avg 6.03/10)

**Pattern:** Engine recognizes evidence but cannot match it to any of the 3 existing archetypes. Returns INSUFFICIENT_EVIDENCE.

**Root Causes Not in Current Archetype Library:**
- Brand perception / customer trust erosion (RW-001 Domino's, RW-003 Starbucks)
- Demand forecasting / market dynamics (RW-005 Peloton, RW-009)
- Unit economics / overexpansion (RW-006 Wet Seal, RW-012)
- Competitive disruption / go-to-market (RW-010, RW-014)
- Strategic pricing / market positioning (PD-001 through PD-005)
- Governance / compliance (ADV-001, ADV-004)

**Impact:** These 10 cases averaged 6.03/10 (20% improvement over DIMENSION_COVERAGE_GAP cases) because returning INSUFFICIENT_EVIDENCE is honest, but still penalizes root_cause_match (2-5/10) and first_priority_action (2-5/10).

### Failure Mode #2: DIMENSION_COVERAGE_GAP (40 cases, avg 5.00/10)

**Pattern:** Engine diagnoses a valid archetype (OPERATIONAL_BOTTLENECK, QUALITY_CONTROL_FAILURE, or CUSTOMER_RETENTION_EROSION) but recommendations are:
- Generic (loyalty program, quality checklist, waitlist)
- Misaligned with documented best actions
- Lack case-specific reasoning
- Weak on business problem mapping

**Examples:**
- **RW-005 (Peloton):** Diagnosed CUSTOMER_RETENTION_EROSION. Recommended: "Launch customer loyalty program." Expected: Deep demand-forecasting analysis + market reposition. Score: 5.00/10
- **RW-002 (Groove.io):** Diagnosed CUSTOMER_RETENTION_EROSION. Recommended: Generic loyalty program. Expected: Data-driven churn diagnosis + engagement early-warning. Score: 6.00/10
- **RW-004:** Diagnosed OPERATIONAL_BOTTLENECK. Recommended: Waitlist system. Expected: Different archetype entirely. Score: 4.10/10

**Impact:** These 40 cases hit the median (5.00/10) because the archetypes are technically correct, but the interventions lack specificity and evidence mapping.

## Dimension Performance Analysis

### Weighted Dimension Scores (13 dimensions, 0-10 scale)

| Dimension | Avg Score | Median | Min-Max | Status |
|---|---|---|---|---|
| **output_specificity** | **4.27** | 5.00 | 0-6.67 | **WEAKEST** |
| **first_priority_action** | **4.40** | 5.00 | 2-5 | **WEAKEST** |
| **root_cause_match** | **4.46** | 5.00 | 2-5 | **WEAKEST** |
| business_relevance | 4.60 | 5.00 | 3-5 | Weak |
| constraint_handling | 4.76 | 5.00 | 2-5 | Weak |
| confidence_calibration | 5.04 | 5.00 | 5-7 | Moderate |
| risk_handling | 5.12 | 5.00 | 5-8 | Moderate |
| output_usefulness | 5.20 | 5.00 | 5-10 | Moderate |
| missing_data_handling | 5.60 | 5.00 | 5-8 | Moderate |
| reasoning_completeness | 5.72 | 5.00 | 5-10 | Moderate |
| recommendation_quality | 6.00 | 5.00 | 5-10 | **STRONGEST** |
| audit_trail_clarity | 6.00 | 5.00 | 5-10 | **STRONGEST** |
| evidence_trace | 6.00 | 5.00 | 5-10 | **STRONGEST** |

### Key Finding: Form vs. Substance Gap

The engine excels at **structural form** but fails at **substance**:

- **Strong (6+/10):** Recommendation structure, reasoning documentation, audit trails, evidence tracing
- **Weak (4-4.7/10):** Root cause diagnosis accuracy, first action alignment, case-specific reasoning, business problem mapping

This explains why the mechanical gate (form-based checks) would rate the engine highly while manual scoring (substance-based) rates it 5.21/10.

---

# PHASE 2: ENGINE ARCHITECTURE AUDIT

## Current Consulting Engine Design

### Entry Point: Orchestrator Pipeline

**File:** `/home/user/OPsIq/src/services/consulting-engine/orchestrator.ts`

The engine coordinates 7 deterministic engines in sequence:

```
1. Evidence Analysis       → validate and categorize evidence
2. Constraint Identification → extract blocking constraints
3. Diagnosis              → identify root cause via pattern matching
4. Intervention Design    → generate intervention options
5. Prioritization         → rank by impact and feasibility
6. Scenario Generation    → create execution alternatives
7. Decision Memo          → compile recommendation
```

**Status:** Fully deterministic, no LLM calls, no external APIs.

### Root Cause Diagnosis Architecture

**File:** `/home/user/OPsIq/src/services/consulting-engine/diagnosis-engine.ts`

**Current Implementation:**

- **Diagnosis Types:** 3 named archetypes + 1 UNKNOWN
  - OPERATIONAL_BOTTLENECK (turnaround time → customer defection)
  - QUALITY_CONTROL_FAILURE (lack of QA → complaint → churn)
  - CUSTOMER_RETENTION_EROSION (no loyalty mechanism → transactional behavior)

- **Matching Method:** Pattern-based via hardcoded rules
  - Evidence dimension matching (e.g., looks for "operational_efficiency" + "customer_retention" evidence)
  - Keyword matching in evidence findings (e.g., "turnaround" OR "slow" OR "capacity")
  - Confidence calibration based on evidence count and quality

- **Failure Mode:** If evidence doesn't match any of 3 patterns, returns UNKNOWN with INSUFFICIENT_EVIDENCE confidence

### Intervention Design Architecture

**File:** `/home/user/OPsIq/src/services/consulting-engine/intervention-design-engine.ts`

**Current Implementation:**

- **Template Library:** 3 root-cause-specific templates
  - operational_bottleneck → [Containment: waitlist, Stabilization: diagnose bottleneck, Structural Repair: implement capacity]
  - quality_control → [Containment: complaint tracking, Stabilization: implement QA checkpoints]
  - retention_erosion → [Resilience: loyalty program]

- **Generation Method:** Template instantiation
  - Each template generates 2-3 intervention options
  - Hardcoded titles, objectives, steps
  - Generic rationales
  - Minimal case-specific evidence linkage

- **Failure Mode:** If diagnosis returns UNKNOWN, generates "Further root cause investigation required" generic intervention

### Type System

**File:** `/home/user/OPsIq/src/domain/consulting-engine/types.ts`

```typescript
enum DiagnosisType {
  OPERATIONAL_BOTTLENECK = "operational_bottleneck",
  QUALITY_CONTROL_FAILURE = "quality_control_failure",
  CUSTOMER_RETENTION_EROSION = "customer_retention_erosion",
  UNKNOWN = "unknown",
}
```

**Evidence Dimensions Supported:**
- customer_retention
- operational_efficiency
- quality_delivery
- financial_health
- process_maturity
- team_capability
- market_position

Note: All 7 dimensions are available in input schema but only 5 are used in pattern matching. `financial_health` and `market_position` are largely ignored by diagnosis engine.

### Confidence Calibration

The engine calculates DiagnosisConfidence as:
- DEFINITIVE (none currently returned)
- HIGH (2+ evidence sources at HIGH confidence)
- MODERATE (1+ evidence sources)
- PROVISIONAL (pattern matched but low evidence quality)
- INSUFFICIENT_EVIDENCE (no patterns matched)

**Status:** Conservative, appropriate, rarely over-confident.

## Identified Limitations (Proven by Round 1)

| Limitation | Evidence | Impact |
|---|---|---|
| Only 3 diagnosis archetypes; 8+ needed | RW-001, RW-003, RW-005, RW-006, PD-001-005 cannot be diagnosed | 10 cases score 6.03/10 (DIAGNOSIS_COVERAGE_GAP) |
| No financial calculation layer | Cannot compute break-even, CAC payback, LTV/CAC, runway, CAGR | 10+ PD cases under-score despite correct archetype |
| Generic intervention templates | Loyalty program template generates same output for RW-002 and RW-005 despite different problem contexts | 40 cases score 5.00/10; first_priority_action avg 4.40/10 |
| No evidence-to-business-dimension mapping | Evidence routing is pattern-keyword-based, not problem-aware | 50 cases show weak business_relevance (4.60/10) |
| No case library / pattern retrieval | Each case solved from first principles using only 3 templates | Intervention specificity low (4.27/10); no learning from historical patterns |
| No output calibration to case context | Recommendations identical for different problem sizes and industries | output_specificity avg 4.27/10; many recommendations apply 0% to case context |
| Intervention priority-sequencing weak | Prioritization logic exists but doesn't strongly penalize first-action misalignment | first_priority_action avg 4.40/10; best actions not identified |

---

# PHASE 3: FIX OPTION AUDIT

## Overview

Six fix options evaluated against Round 1 evidence. Each option assesses: cases addressed, expected score lift, implementation complexity, regression risk, hallucination risk, dangerous recommendation risk, and sequencing rationale.

---

## OPTION 1: Expand Deterministic Diagnosis Archetypes (Low Complexity)

**Approach:** Add 5 new diagnosis archetype patterns to bring coverage to 8 named archetypes.

**New Archetypes to Add:**
1. BRAND_PERCEPTION / CUSTOMER_TRUST_EROSION
2. UNIT_ECONOMICS / OVEREXPANSION  
3. DEMAND_FORECASTING / MARKET_DYNAMICS
4. COMPETITIVE_DISRUPTION / GO_TO_MARKET
5. STRATEGIC_PRICING / VALUE_POSITIONING

**Cases Directly Addressed:**
- RW-001 (Domino's brand crisis): Currently misdiagnoses QUALITY_CONTROL_FAILURE, should diagnose BRAND_PERCEPTION
- RW-003 (Starbucks identity erosion): Currently scores 6.64, should improve with BRAND_PERCEPTION archetype
- RW-005 (Peloton): Currently diagnoses CUSTOMER_RETENTION_EROSION correctly, but needs demand-forecasting extension
- RW-006 (Wet Seal): Currently INSUFFICIENT_EVIDENCE, should diagnose UNIT_ECONOMICS
- PD-001 through PD-005: Financial/unit-economics cases, need numeric calculation
- ADV-001: Governance case, may need specialized archetype

**Implementation Complexity:** MEDIUM

- Add 5 entries to `rootCausePatterns` array in diagnosis-engine.ts
- Each pattern requires: matching function, confidence calculator, diagnosis generator
- Requires deep case-pack analysis to extract pattern signatures
- Risk: Over-fitting to Round 1 cases if patterns are too specific

**Expected Score Lift:**
- DIAGNOSIS_COVERAGE_GAP cases (10): +1.5 to +2.5 points per case
  - RW-001: 7.44 → 8.5+ (BRAND_PERCEPTION diagnosis improves root_cause_match from 5 to 8+)
  - RW-003: 6.64 → 8.2+ 
  - RW-006: 5.71 → 7.5+ (unit economics diagnosis instead of INSUFFICIENT)
  - PD-001-005: 5.71 → 7.0+ (financial patterns)
  - Expected cluster average: 6.03 → 7.8/10 (+1.77 average)

- DIMENSION_COVERAGE_GAP cases (40): +0.3 to +0.5 per case (from archetype knowledge) before intervention specificity
  - Expected cluster average: 5.00 → 5.3-5.5/10 (+0.3-0.5 average)

- **Overall Expected Post-Fix Average:** 5.21 → **6.1-6.3/10** (+0.9-1.1 points)
- **Pass Rate Impact:** Still 0/50 at ≥8.5 (insufficient alone)

**Regression Risk:** LOW

- Does not remove existing archetype patterns
- New patterns are additive
- Existing cases (RW-002, RW-004, etc.) continue to match CUSTOMER_RETENTION_EROSION/OPERATIONAL_BOTTLENECK
- Regression test: verify RW-002 still diagnoses retention erosion correctly

**Hallucination Risk:** LOW

- Deterministic pattern matching, no LLM inference
- Patterns derived from evidence dimensions and keywords, not free-text interpretation
- No novel claims generated

**Dangerous Recommendation Risk:** LOW

- New archetypes inherit existing intervention templates
- Brand-perception archetype would still generate "complaint tracking" and "loyalty program" type interventions
- Risk: Brand crisis might warrant different first actions (e.g., public transparency, leadership pivot) than current templates provide
- Mitigation: Pair with intervention-template expansion

**Testing Required:**
```
- Unit test: RW-001 brand evidence must diagnose BRAND_PERCEPTION (not QUALITY_CONTROL_FAILURE)
- Unit test: RW-006 unit-economics evidence must diagnose UNIT_ECONOMICS (not INSUFFICIENT_EVIDENCE)
- Regression test: RW-002, RW-004, RW-009 still diagnose correctly
- Integration test: cases benefiting from new archetypes score ≥0.5 points higher
```

**Why First or Not First:**

✓ **CANDIDATE FOR FIRST SLICE**
- Unblocks diagnosis for 10 cases (40% of failures)
- Low regression risk
- Deterministic, no hallucination risk
- Enables subsequent intervention-specificity fixes

---

## OPTION 2: Add Numeric Calculation Layer (Medium-High Complexity)

**Approach:** Build deterministic financial calculation engine for break-even, CAC payback, LTV/CAC, runway, CAGR, margin analysis.

**Cases Directly Addressed:**
- PD-001 through PD-010 (10 public-dataset calculation cases)
- Some PD-based failures related to numeric reasoning

**Implementation Complexity:** MEDIUM-HIGH

- Requires parsing financial evidence from structured data fields
- Implement financial formulas (break-even = fixed costs / contribution margin)
- Requires input validation (no division by zero, negative revenue, etc.)
- Requires confidence calibration for incomplete inputs
- Testing: Validate against case answer keys

**Expected Score Lift:**
- PD cases (10): +1.0 to +2.0 points per case
  - Improves "root_cause_match" from 2-5 to 6-8 (correct financial diagnosis)
  - Improves "first_priority_action" from 2-5 to 6-7 (better financial recommendations)
  - Improves "business_relevance" (case-specific financial constraints now understood)
  - Expected: 5.71 → 7.2-7.8/10 (+1.5 average)

- Other cases (40): +0 to +0.2 (limited benefit if not financially focused)

- **Overall Expected Post-Fix Average:** 5.21 → **5.6-5.8/10** (+0.4-0.6 points alone)
- **Combined with Option 1:** 6.1-6.3 → **6.6-7.0/10**

**Regression Risk:** LOW

- Does not modify diagnosis or intervention engines
- Financial calculation is additive layer
- Cases without financial evidence skip layer
- Existing cases unaffected

**Hallucination Risk:** MEDIUM

- Calculations themselves are deterministic (no hallucination)
- Risk: Claims about what calculated numbers mean (e.g., "CAC payback of 18 months indicates unsustainable growth") could misinterpret
- Mitigation: Only output calculations + cite evidence; do not infer business implications without explicit rules

**Dangerous Recommendation Risk:** LOW

- Financial calculations inform diagnosis, not generate interventions directly
- Risk: Incorrect financial analysis leading to wrong recommendations (e.g., suggesting price increase when demand elasticity is high)
- Mitigation: Require financial evidence quality threshold before using in diagnosis

**Testing Required:**
```
- Unit test: CAC payback calculation correct for PD-001 through PD-010
- Unit test: Break-even analysis detects when inputs insufficient
- Regression test: non-financial cases unchanged
- Integration test: PD cases score ≥1.0 points higher
```

**Why First or Not First:**

✓ **GOOD COMPLEMENT TO OPTION 1** (second slice)
- Addresses distinct case cluster (PD cases)
- Low regression risk
- Unblocks 10 cases

✗ **NOT FIRST** (should follow archetype expansion)
- PD cases benefit more from archetype expansion + financial layer combo
- Archetype expansion alone improves PD cases by ~1.5; financial layer adds ~1.5 more
- Financial layer alone provides limited lift without correct diagnosis

---

## OPTION 3: Add Business Dimension Classifier (Low-Medium Complexity)

**Approach:** Classify each case into business problem category (growth/revenue, unit economics, brand/market, talent/execution, financial/capital) before diagnosis. Route evidence to appropriate archetype based on classification.

**Cases Directly Addressed:**
- All 50 cases (improved evidence routing)
- Particularly helps DIMENSION_COVERAGE_GAP cases (40) align recommendations to business problem

**Implementation Complexity:** LOW-MEDIUM

- Add preprocessing step in orchestrator before diagnosis
- Simple rule-based classifier (look for evidence dimensions: "financial_health" → unit-economics problem, etc.)
- Route evidence to appropriate diagnostic patterns
- Improve intervention selection based on classification

**Expected Score Lift:**
- DIAGNOSIS_COVERAGE_GAP (10): +0.3 to +0.5 (better evidence routing)
- DIMENSION_COVERAGE_GAP (40): +0.5 to +1.0 (stronger case-specific recommendations)
  - Improves business_relevance (4.60 → 5.5+)
  - Improves output_specificity (4.27 → 5.0+)
  - Expected: 5.00 → 5.6/10 (+0.6 average)

- **Overall Expected Post-Fix Average:** 5.21 → **5.7-5.9/10** (+0.5-0.7 points alone)
- **Combined with Options 1+2:** 6.6-7.0 → **7.3-7.8/10**

**Regression Risk:** LOW

- Classifier is preprocessing; does not replace diagnosis
- Can bypass classifier if confidence low
- Existing cases continue through original pathways

**Hallucination Risk:** LOW

- Rule-based classification, deterministic
- No free-text interpretation

**Dangerous Recommendation Risk:** LOW

- Classification informs routing, not content
- No new harmful recommendations introduced

**Testing Required:**
```
- Unit test: financial_health evidence routes to unit-economics questions
- Unit test: market_position evidence routes to brand/competitive questions
- Regression test: all existing cases continue to diagnose
- Integration test: cases showing improved business_relevance scores
```

**Why First or Not First:**

✓ **GOOD MIDDLE LAYER** (second or third slice)
- Synergizes with archetype expansion (new archetypes need good evidence routing)
- Improves both DIAGNOSIS_COVERAGE_GAP and DIMENSION_COVERAGE_GAP cases
- Low complexity, low risk

---

## OPTION 4: Add Case-Library Retrieval (Medium Complexity)

**Approach:** Build library of 50+ proven consulting patterns (from case pack and external sources). When processing new case, retrieve similar historical cases and adapt their interventions.

**Cases Directly Addressed:**
- All 50 cases (pattern learning across entire corpus)
- Particularly helps DIMENSION_COVERAGE_GAP cases (40) with more specific intervention options

**Implementation Complexity:** MEDIUM

- Extract intervention patterns from round-1 case pack (50 cases)
- Build retrieval system (similarity matching on problem type + evidence signatures)
- Adapt retrieved patterns to new case context
- Requires case-similarity function (cosine similarity, embedding-based, or rule-based)
- Requires validation that retrieved patterns don't over-fit to Round 1

**Expected Score Lift:**
- DIAGNOSIS_COVERAGE_GAP (10): +0.0 (retrieval doesn't improve diagnosis)
- DIMENSION_COVERAGE_GAP (40): +1.0 to +2.0 per case
  - Improves first_priority_action (4.40 → 6.5+) via learned patterns
  - Improves output_specificity (4.27 → 6.0+) via case-specific examples
  - Expected: 5.00 → 6.2/10 (+1.2 average)

- **Overall Expected Post-Fix Average:** 5.21 → **5.8-6.0/10** (+0.6-0.8 points alone)
- **Combined with Options 1+2+3:** 7.3-7.8 → **8.0-8.5/10** (approaches consultant-grade!)

**Regression Risk:** MEDIUM

- If case library is over-trained on Round 1, may retrieve identical solutions for Round 2 (overfitting risk)
- Could improve Round 1 cases artificially while failing on new cases
- Mitigation: Build anti-memorization controls; track retrieval similarity scores; validate on held-out cases

**Hallucination Risk:** LOW

- Retrieval adapts documented patterns, not generates new ones
- Risk: Adaptation logic could introduce novel claims
- Mitigation: Constrain adaptation to parameter substitution, not reasoning changes

**Dangerous Recommendation Risk:** LOW

- Dangerous recommendations already present in library? No (Round 1 safety was good)
- Risk: Adapting a safe pattern to a different context could make it unsafe
- Mitigation: Validate adapted recommendations against safety checklist

**Testing Required:**
```
- Unit test: RW-005 Peloton retrieves similar cases (e.g., Starbucks)
- Unit test: Retrieved patterns adapt case-specifically (not copy-pasted)
- Regression test: non-similar cases do not retrieve wrong patterns
- Integration test: DIMENSION_COVERAGE_GAP cases score ≥1.0 points higher
- Overfitting test: validate on Round 2 cases (distinct from Round 1)
```

**Why First or Not First:**

✓ **EXCELLENT COMPLEMENT** (third or fourth slice)
- Synergizes with archetype expansion (new archetypes can retrieve patterns)
- Directly improves intervention specificity (weakest dimension: 4.27/10)
- Learnable iteratively (start with Round 1, expand with Round 2)

✗ **NOT FIRST** (should follow diagnosis fixes)
- Requires working diagnosis before retrieval is useful
- If diagnosis is wrong, retrieval of similar cases retrieves wrong solutions

---

## OPTION 5: Add LLM-Assisted Reasoning (High Complexity, Highest Risk)

**Approach:** Use Claude/LLM for diagnosis refinement, best-practice pattern matching, and intervention generation. Keep guardrails (deterministic safety checks before output).

**Cases Directly Addressed:**
- Potentially all 50 cases (LLM could infer nuanced root causes and tailored interventions)

**Implementation Complexity:** VERY_HIGH

- Requires LLM integration (API calls, prompt engineering, cost)
- Requires safety layer (filter outputs for hallucinations, dangerous recommendations)
- Requires detailed prompts for diagnosis, intervention design, evidence interpretation
- Requires tuning to avoid over-fitting LLM to Round 1 cases

**Expected Score Lift:**
- Could theoretically improve all 50 cases by 2-5 points if LLM reasoning is sound
- Optimistic estimate: 5.21 → 8.0-8.5/10 (+3-4 average)
- Realistic estimate: 5.21 → 7.0-7.5/10 (+2 average) due to hallucination / over-confidence
- Pessimistic estimate: 5.21 → 5.5-6.0/10 (LLM generates confident but inaccurate diagnoses)

- **Combined with Options 1+2+3+4:** Could reach 9.0+/10, but regression risk is severe

**Regression Risk:** VERY_HIGH

- LLM outputs are non-deterministic (even with temperature=0, outputs can vary slightly)
- Round 1 tested engine at specific LLM model; Round 2 with different model/parameters could fail
- LLM can hallucinate, inventing facts not in evidence
- Round 2 cases not in LLM training; model confidence may be misleading

**Hallucination Risk:** HIGH

- LLM will infer business implications from evidence without explicit support
- Example: Evidence says "customer retention low" + "no loyalty program" → LLM infers "lack of customer insight" (not in evidence)
- Safety gate can catch some hallucinations but not all

**Dangerous Recommendation Risk:** HIGH

- LLM could recommend harmful actions with confident tone
- Example: Recommending aggressive cost-cutting without understanding strategic context
- Example: Recommending layoffs without analyzing alternatives
- Safety gate required; must validate every recommendation against dangerous_recommendation_triggers

**Testing Required:**
```
- Extensive prompt engineering on pilot cases (10-20)
- Red team testing: attempt to make LLM generate dangerous recommendations
- Hallucination detection: compare LLM claims to evidence; flag unsupported inference
- Regression test: Round 1 cases continue to score well
- Round 2 validation: LLM performance on new cases (not in training)
- Model robustness: test on multiple LLM versions/sizes
```

**Why First or Not First:**

✗ **EXPLICITLY NOT RECOMMENDED AS FIRST** (too risky without foundation)
- Requires deterministic foundation (Options 1-4) to be solid first
- If deterministic layer is broken, adding LLM amplifies errors
- Safety gates are only as good as underlying engine

✓ **POSSIBLE FINAL LAYER** (after Options 1-4 prove solid at 7.5+/10)
- After deterministic + retrieval baseline is solid, LLM could refine edge cases
- Could improve score from 7.5-8.0 → 8.5+/10
- Requires careful guardrails and ongoing validation

---

## OPTION 6: Hybrid Engine (Deterministic + Numeric + Retrieval + LLM with Governance)

**Approach:** Combine all above: deterministic archetypes (8+) + numeric layer + business classifier + case retrieval + LLM-assisted refinement, with strong governance gates.

**Architecture:**
```
Layer 1: Evidence Intake & Validation
  - Validate evidence structure, check for missing critical dimensions

Layer 2: Business Dimension Classifier
  - Classify case into growth/revenue, unit_economics, brand/market, talent, financial
  - Route evidence to appropriate diagnostic paths

Layer 3: Deterministic Diagnosis (8+ Archetypes)
  - Pattern match against expanded archetype library
  - Return HIGH/MODERATE/PROVISIONAL/INSUFFICIENT_EVIDENCE

Layer 4: Numeric Calculation Layer
  - If financial_health evidence present: compute CAC, LTV, break-even, runway
  - If operational evidence: compute utilization, throughput, cycle time
  - Enriches diagnosis with quantitative anchors

Layer 5: Case-Library Retrieval
  - Find similar historical cases
  - Extract proven intervention patterns
  - Adapt patterns to new case context

Layer 6: LLM-Assisted Reasoning (Optional, Gated)
  - If diagnosis confidence PROVISIONAL or INSUFFICIENT_EVIDENCE: use LLM to refine
  - If diagnosis HIGH but first-action not yet chosen: use LLM to select best option
  - LLM only used to refine, not generate new diagnoses

Layer 7: Safety Governance & Guardrails
  - Check: no dangerous recommendations
  - Check: confidence not over-stated
  - Check: all claims grounded in evidence
  - Check: constraints respected
  - Audit trail: record reasoning at each layer

Layer 8: Output Formatting & Delivery
  - Format decision memo
  - Include limitations and next-review triggers
```

**Cases Directly Addressed:**
- All 50 cases benefit from deterministic layers (1-5)
- Cases with PROVISIONAL confidence benefit from LLM refinement (Layer 6)

**Implementation Complexity:** VERY_HIGH

- 6-8 month engineering effort if done carefully
- Requires architecture redesign (modularization, layer interfaces)
- Requires extensive testing at each layer boundary
- Requires ongoing maintenance and safety validation

**Expected Score Lift:**
- All 50 cases: +3 to +5 points expected
  - Deterministic (Options 1-4): +1.5-2.0
  - LLM refinement: +1.5-2.0
  - Synergy: +0.5-1.0

- **Overall Expected Post-Fix Average:** 5.21 → **8.0-8.8/10** (consultant-grade!)
- **Pass Rate:** 35-45/50 passing at ≥8.5/10

**Regression Risk:** MEDIUM

- Hybrid approach reduces risk vs. pure LLM
- Deterministic layers provide foundation
- But still requires careful integration testing
- Risk: LLM misalignment with deterministic diagnosis

**Hallucination Risk:** MEDIUM

- Deterministic layers are hallucination-free
- LLM layer has hallucination risk, but used only in gated mode
- Safety layer catches most hallucinations
- Residual risk: ~5-10% of cases might have subtle false claims

**Dangerous Recommendation Risk:** LOW-MEDIUM

- Safety governance layer designed to catch dangerous recommendations
- But LLM could suggest harmful actions that pass governance checks
- Risk: Cost-cutting that harms long-term brand
- Mitigation: Specialized dangerous_recommendation_triggers for market/brand cases

**Testing Required:**
```
- Layer-by-layer unit testing (diagram above)
- Integration testing at each layer boundary
- Red team testing: attempt to break safety governance
- Overfitting testing: validate on Round 2 cases distinct from Round 1
- Model robustness: test on multiple LLM versions
- Performance testing: ensure system runs in acceptable latency
```

**Why First or Not First:**

✗ **NOT FIRST** (too complex for initial iteration)
- Requires Options 1-4 to be individually validated first
- High risk of masking fundamental issues in deterministic layers

✓ **VIABLE FINAL TARGET** (after Options 1-4 prove solid at 7.5+/10)
- After deterministic + retrieval baseline established, add LLM to refine
- Could reach 8.5+/10 and true consultant-grade

---

## Fix Options Summary Table

| Option | Cases Addressed | Score Lift | Complexity | Regression Risk | Hallucination | Dangerous Rec | First? |
|---|---|---|---|---|---|---|---|
| 1. Expand Archetypes | 10 DIAGNOSIS_COVERAGE_GAP | +0.9-1.1 | MEDIUM | LOW | LOW | LOW | ✓ YES |
| 2. Numeric Layer | 10 PD cases | +0.4-0.6 | MEDIUM-HIGH | LOW | MEDIUM | LOW | ✓ SECOND |
| 3. Dimension Classifier | 50 all cases | +0.5-0.7 | LOW-MEDIUM | LOW | LOW | LOW | ✓ SECOND/THIRD |
| 4. Case Retrieval | 40 DIMENSION_COVERAGE_GAP | +0.6-0.8 | MEDIUM | MEDIUM | LOW | LOW | ✓ THIRD/FOURTH |
| 5. LLM Reasoning | 50 all cases | +2-4 (risky) | VERY_HIGH | VERY_HIGH | HIGH | HIGH | ✗ NO (too risky) |
| 6. Hybrid | 50 all cases | +3-5 | VERY_HIGH | MEDIUM | MEDIUM | LOW-MEDIUM | ✗ NO (final target) |

**Cumulative Score Improvements:**
- Option 1 alone: 5.21 → 6.1-6.3
- Options 1+2: 5.21 → 6.6-7.0
- Options 1+2+3: 5.21 → 7.3-7.8
- Options 1+2+3+4: 5.21 → 8.0-8.5 ← **Consultant-grade achievable!**
- Options 1+2+3+4+LLM: 5.21 → 8.5-9.0 (high risk, not recommended first)

---

# PHASE 4: RECOMMENDED ENGINE ARCHITECTURE

## Recommendation: Hybrid Deterministic + Numeric + Retrieval (Three-Slice Build)

**Rationale:**

Based on Round 1 evidence, the minimum viable path to consultant-grade (≥8.5/10) is **Options 1+2+3+4 combined** (Expand Archetypes + Numeric Layer + Dimension Classifier + Case Retrieval). This achieves consultant-grade while maintaining safety and determinism.

**Why not add LLM immediately?**
- Round 1 proved deterministic engine has strong form (6/10) but weak substance (4.5/10)
- LLM-assisted reasoning is high-risk without proven deterministic foundation
- Deterministic Options 1-4 can reach 8.0-8.5/10 on their own
- LLM can be added in future iteration as optional refinement layer

**Why this combination specifically?**
- **Option 1 (Archetypes):** Unblocks 10 cases that currently return INSUFFICIENT_EVIDENCE. Improves diagnosis coverage from 3 → 8 named types. Highest ROI fix.
- **Option 2 (Numeric):** Addresses 10 PD calculation cases that need quantitative reasoning. Complements archetype expansion.
- **Option 3 (Classifier):** Improves evidence routing for all 50 cases. Synergizes with expanded archetypes (more archetypes need better routing).
- **Option 4 (Retrieval):** Directly improves first-action specificity (weakest dimension: 4.40/10) by learning from historical patterns. Addresses DIMENSION_COVERAGE_GAP cluster.

**Why not Option 5 (LLM)?**
- High hallucination risk without proven foundation
- Non-deterministic outputs complicate testing and validation
- Can be added later if deterministic baseline proves insufficient
- Safety governance too complex for first iteration

---

## Recommended Architecture (Three Layers)

```
RECOMMENDED_ENGINE_ARCHITECTURE: Layered Deterministic with Retrieval and Numeric Reasoning
  
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 1: INTAKE & VALIDATION                                   │
  ├─────────────────────────────────────────────────────────────────┤
  │ - Validate evidence structure                                  │
  │ - Extract evidence dimensions (7 types)                        │
  │ - Identify missing critical dimensions                         │
  │ - Flag data quality issues                                     │
  │ No changes from current implementation                          │
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 2: BUSINESS DIMENSION CLASSIFIER (NEW, Option 3)          │
  ├─────────────────────────────────────────────────────────────────┤
  │ Input: evidence dimensions                                     │
  │ Logic: Rule-based classification                              │
  │   - If financial_health critical → unit_economics problem     │
  │   - If market_position critical → brand/competitive problem   │
  │   - If operational_efficiency critical → operational problem  │
  │   - If team_capability critical → execution problem           │
  │   - Default: customer_retention problem                       │
  │ Output: problem_class (enum)                                 │
  │ Used by: Layer 3 (routing), Layer 4 (numeric triggers)       │
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 3: DETERMINISTIC DIAGNOSIS (EXPANDED, Option 1)           │
  ├─────────────────────────────────────────────────────────────────┤
  │ Expanded archetype library (3 → 8+ named types):              │
  │                                                                 │
  │ Current (keep):                                                │
  │   - OPERATIONAL_BOTTLENECK                                   │
  │   - QUALITY_CONTROL_FAILURE                                  │
  │   - CUSTOMER_RETENTION_EROSION                               │
  │                                                                 │
  │ New (add):                                                    │
  │   - BRAND_PERCEPTION / CUSTOMER_TRUST_EROSION                │
  │     Pattern: market_position critical + low awareness +       │
  │              weak perception vs competitors                   │
  │     Cases: RW-001, RW-003                                    │
  │                                                                 │
  │   - UNIT_ECONOMICS / OVEREXPANSION                            │
  │     Pattern: financial_health critical + rising costs +       │
  │              declining unit margins                            │
  │     Cases: RW-006, RW-012                                    │
  │                                                                 │
  │   - DEMAND_FORECASTING / MARKET_DYNAMICS                      │
  │     Pattern: market_position critical + demand shock +        │
  │              product-market fit deterioration                 │
  │     Cases: RW-005 (Peloton), RW-009                         │
  │                                                                 │
  │   - COMPETITIVE_DISRUPTION / GO_TO_MARKET                     │
  │     Pattern: market_position critical + competitive          │
  │              displacement + weak differentiation              │
  │     Cases: RW-010, RW-014                                    │
  │                                                                 │
  │   - STRATEGIC_PRICING / VALUE_POSITIONING                     │
  │     Pattern: financial_health + market_position both critical │
  │              + low margins + weak positioning                 │
  │     Cases: PD-004, PD-005                                    │
  │                                                                 │
  │ Matching: Enhanced pattern matching with evidence routing from │
  │           Layer 2 (problem_class guides archetype selection)  │
  │                                                                 │
  │ Output: RootCause (diagnosis + confidence)                   │
  │ Confidence: HIGH/MODERATE/PROVISIONAL/INSUFFICIENT_EVIDENCE  │
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 4: NUMERIC CALCULATION (NEW, Option 2)                    │
  ├─────────────────────────────────────────────────────────────────┤
  │ Triggered by: financial_health evidence + problem_class      │
  │                                                                 │
  │ Calculations (deterministic formulas):                        │
  │   - Break-even: fixed_costs / contribution_margin             │
  │   - CAC payback: customer_acquisition_cost / monthly_margin   │
  │   - LTV: lifetime_value_formula(retention_rate, margin)       │
  │   - LTV/CAC ratio: indicates sustainability                  │
  │   - Runway: cash_on_hand / monthly_burn                       │
  │   - CAGR: compound_annual_growth_rate                         │
  │   - Unit margin: (revenue - variable_cost) / revenue          │
  │                                                                 │
  │ Output: FinancialMetrics (calculations + confidence)          │
  │ Used by: Layer 3 (diagnosis enrichment) + Layer 6 (output)   │
  │ Error handling: Return INSUFFICIENT_EVIDENCE if inputs missing │
  │                                                                 │
  │ Safety: No interpretation of numbers; only output calculations│
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 5: CASE-LIBRARY RETRIEVAL (NEW, Option 4)                │
  ├─────────────────────────────────────────────────────────────────┤
  │ Input: problem_class + primary_root_cause                     │
  │                                                                 │
  │ Case Library: 50+ proven patterns extracted from Round 1      │
  │   - For each case: problem_class, diagnosis_type,             │
  │     first_action, reasoning, success_metrics                  │
  │   - Indexed by: (problem_class, diagnosis_type) → interventions │
  │                                                                 │
  │ Retrieval logic:                                              │
  │   - Find cases with matching (problem_class, diagnosis_type)  │
  │   - If exact match found: retrieve proven interventions       │
  │   - If partial match: retrieve similar cases, adapt patterns  │
  │   - If no match: skip retrieval                               │
  │                                                                 │
  │ Adaptation:                                                   │
  │   - Parameter substitution: "implement [X]" → "implement      │
  │     [X adapted to business_size/industry]"                    │
  │   - Constraint mapping: filter interventions for client       │
  │     constraints and execution capacity                        │
  │                                                                 │
  │ Output: RetrievedPatterns (intervention templates + confidence)│
  │ Used by: Layer 7 (intervention generation)                   │
  │ Safety: Anti-memorization controls                            │
  │   - Track retrieval similarity score                          │
  │   - If similarity >0.95 to Round 1 case, flag as memorization│
  │   - Require Round 2 validation on new cases                   │
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 6: INTERVENTION DESIGN & PRIORITIZATION (ENHANCED)       │
  ├─────────────────────────────────────────────────────────────────┤
  │ Input: RootCause (from Layer 3) + FinancialMetrics (Layer 4)  │
  │        + RetrievedPatterns (Layer 5)                          │
  │                                                                 │
  │ Logic:                                                         │
  │   1. If retrieved patterns available: use as primary templates│
  │   2. Otherwise: use default templates (current implementation)│
  │   3. Customize interventions to business size/industry/       │
  │      constraints using Layer 4 financial data                 │
  │   4. Prioritize by: impact + feasibility + constraint fit     │
  │                                                                 │
  │ Improvements over current:                                    │
  │   - First action now selected from case-specific options      │
  │      (not just generic loyalty/QA/waitlist)                   │
  │   - Financial data used to inform cost/feasibility estimates  │
  │   - Constraint mapping explicit                               │
  │   - Case-specific reasoning injected                          │
  │                                                                 │
  │ Output: PrioritizedInterventions[]                           │
  │ Confidence: HIGH/MODERATE/PROVISIONAL based on evidence + fit │
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 7: SAFETY GOVERNANCE & GUARDRAILS (ENHANCED)             │
  ├─────────────────────────────────────────────────────────────────┤
  │ Checks performed before output:                                │
  │                                                                 │
  │ 1. Dangerous Recommendation Triggers                          │
  │    - Cost-cutting > 20% without strategic justification      │
  │    - Layoffs > 15% workforce without redundancy analysis      │
  │    - Pricing increase > 30% without value increase documented │
  │    - Rapid market exit without runway concern                 │
  │    - Recommend flag instead of immediate rejection            │
  │                                                                 │
  │ 2. Hallucination Detection                                    │
  │    - All claims grounded in evidence IDs                      │
  │    - No inference beyond evidence (flag for review)           │
  │    - Confidence level matches evidence quality                │
  │                                                                 │
  │ 3. False Confidence Check                                     │
  │    - If diagnosis PROVISIONAL/INSUFFICIENT but output HIGH:   │
  │      lower confidence to MODERATE                             │
  │    - If retrieval similarity low (<0.60): don't use           │
  │                                                                 │
  │ 4. Constraint Satisfaction                                    │
  │    - All recommended actions respect identified constraints   │
  │    - Fallback plans included if constraint risk exists        │
  │                                                                 │
  │ Output: SafetyCheckResult (PASS/FLAG/REJECT)                 │
  │ If REJECT: return INSUFFICIENT_EVIDENCE instead of bad output │
  └─────────────────────────────────────────────────────────────────┘
                                    ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │ LAYER 8: DECISION MEMO & DELIVERY                              │
  ├─────────────────────────────────────────────────────────────────┤
  │ Compile final output:                                         │
  │   - Executive summary of diagnosis + confidence               │
  │   - Root cause explanation + mechanism                        │
  │   - Prioritized interventions (3-5 options)                   │
  │   - Success metrics for each intervention                     │
  │   - Failure risks + fallback plans                            │
  │   - Implementation timeline                                   │
  │   - Critical assumptions (from evidence gaps)                 │
  │   - Next review triggers                                      │
  │   - Audit trail: evidence IDs at each decision point          │
  │                                                                 │
  │ Format: DecisionMemo (JSON) + human-readable summary          │
  │                                                                 │
  │ No changes to this layer from current implementation          │
  └─────────────────────────────────────────────────────────────────┘
```

## What Stays from Current Engine

✓ **Strong components (no changes):**
- Evidence intake & validation (Layer 1)
- Confidence calibration methodology (applies to expanded archetypes)
- Constraint identification engine
- Scenario generation logic
- Decision memo structure (professional, comprehensive, well-formatted)
- Audit trail clarity (evidence tracing)
- Output formatting (already scores 6/10)
- Safety culture (0 dangerous recommendations currently; maintain)

## What Must Be Replaced/Enhanced

✗ **Weak components (require fixes):**
- Root cause diagnosis archetype library: 3 archetypes → 8+ (80% improvement)
- Intervention design templates: generic → case-specific (retrieve from patterns)
- Evidence routing: keyword-based → problem-class-aware (25% improvement)
- First-action selection: template-driven → evidence-driven (100% improvement)
- Business relevance: implicit → explicit (problem-class routing makes explicit)

## What Must Be Added

⊕ **New components (enable improvements):**
- Business Dimension Classifier (Layer 2): rule-based classification
- Numeric Calculation Engine (Layer 4): financial formulas + confidence
- Case-Library Retrieval System (Layer 5): similarity search + adaptation
- Enhanced Safety Governance (Layer 7): dangerous_recommendation triggers
- Intervention customization logic: adapt templates to case context

## What Must NOT Be Added Yet

⊘ **Out of scope (too risky, low ROI, or premature):**
- LLM-assisted reasoning (save for Phase 2 if deterministic plateau)
- Automated constraint solver (too complex, not demanded by Round 1)
- Dynamic diagnosis refinement (would require user interaction)
- Machine learning models (over-engineered for deterministic problem)
- Real-time market data feeds (out of scope; use evidence from intake)

---

# PHASE 5: SMALL-SLICE BUILD PLAN

Five implementation slices, each with clear acceptance tests and stop conditions.

---

## SLICE 1: Expand Diagnosis Archetypes to 5

**Purpose:** Unblock DIAGNOSIS_COVERAGE_GAP cases (10) by adding brand/perception and unit-economics archetypes.

**Expected Score Improvement:** 10 cases from 6.03/10 → 7.8/10 (+1.77 average)

### Files Expected

- **src/domain/consulting-engine/types.ts**
  - Add to `DiagnosisType` enum: BRAND_PERCEPTION, UNIT_ECONOMICS, DEMAND_FORECASTING
  - ✓ Update types to support new diagnosis types

- **src/services/consulting-engine/diagnosis-engine.ts**
  - Add 3 new entries to `rootCausePatterns` array
  - ✓ BRAND_PERCEPTION: detect market_position critical + awareness signals
  - ✓ UNIT_ECONOMICS: detect financial_health critical + margin/cost signals
  - ✓ DEMAND_FORECASTING: detect market_position critical + demand signals
  - ✓ Update confidence calculation for new patterns
  - ✓ Preserve existing 3 patterns (no removal)

- **tests/services/consulting-engine/diagnosis-engine.test.ts** (new)
  - Unit test: RW-001 (Domino's) evidence → BRAND_PERCEPTION diagnosis
  - Unit test: RW-006 (Wet Seal) evidence → UNIT_ECONOMICS diagnosis
  - Unit test: RW-005 (Peloton) evidence → DEMAND_FORECASTING diagnosis
  - Unit test: RW-002 still diagnoses CUSTOMER_RETENTION_EROSION (regression)
  - Unit test: RW-009 still diagnoses OPERATIONAL_BOTTLENECK (regression)

### Acceptance Tests

**Must Pass:**
```
✓ RW-001 (Domino's brand crisis)
  - Input: evidence with market_position critical, brand_awareness low, competitor_positioning strong
  - Expected diagnosis: BRAND_PERCEPTION (not QUALITY_CONTROL_FAILURE)
  - Expected confidence: HIGH or MODERATE
  - Expected root_cause_match score: 7+ (improved from 5)
  - Expected first_priority_action score: 4+ (improved from 2 if intervention template improves)

✓ RW-006 (Wet Seal overexpansion)
  - Input: evidence with financial_health critical, unit_margins declining, fixed_cost_ratio high
  - Expected diagnosis: UNIT_ECONOMICS (not INSUFFICIENT_EVIDENCE)
  - Expected confidence: MODERATE
  - Expected root_cause_match score: 7+ (improved from 2)

✓ RW-002 (Groove.io) [REGRESSION TEST]
  - Input: evidence with customer_retention critical, repeat_rate low
  - Expected diagnosis: CUSTOMER_RETENTION_EROSION (unchanged)
  - Expected confidence: unchanged
  - Expected score: unchanged (regression check)

✓ RW-009 (operational case) [REGRESSION TEST]
  - Input: evidence with operational_efficiency critical
  - Expected diagnosis: OPERATIONAL_BOTTLENECK (unchanged)
  - Expected score: unchanged
```

**Test Data:**
- Use actual evidence from Round 1 case packs (locked answer keys)
- Validate diagnosis against answer key expectations

**Stop Condition (HOLD if):**
- Any regression test fails (existing cases score lower)
- New patterns over-fit and match too many cases
- Confidence calibration produces spurious HIGH confidence
- Score improvement <0.5 points on target cases

### Estimated Effort
- **Engineering:** 8-16 hours (pattern definition + testing)
- **Testing:** 8-12 hours (comprehensive unit tests)
- **Total:** 2-3 days

### Risk Assessment
- **Regression:** LOW (patterns additive, no removal of existing patterns)
- **Hallucination:** LOW (deterministic pattern matching, no inference)
- **Danger:** LOW (diagnosis layer only, no new dangerous interventions yet)

---

## SLICE 2: Implement Business Dimension Classifier

**Purpose:** Route evidence to appropriate diagnostic patterns and improve problem-class alignment.

**Expected Score Improvement:** 50 cases from 5.21/10 → 5.7/10 (+0.5 average), +0.2-0.3 on top of Slice 1

### Files Expected

- **src/services/consulting-engine/dimension-classifier.ts** (new)
  - Define `classifyBusinessDimension()` function
  - Input: EvidenceItem[]
  - Output: problem_class (enum: GROWTH, UNIT_ECONOMICS, BRAND_MARKET, TALENT_EXECUTION, FINANCIAL, OTHER)
  - Logic: Score evidence dimensions, select highest-scoring class
  - ✓ financial_health critical → UNIT_ECONOMICS
  - ✓ market_position critical → BRAND_MARKET
  - ✓ team_capability critical → TALENT_EXECUTION
  - ✓ operational_efficiency critical → GROWTH
  - ✓ customer_retention critical → GROWTH
  - ✓ Default: GROWTH

- **src/services/consulting-engine/orchestrator.ts**
  - Add call to `classifyBusinessDimension()` after evidence analysis
  - Pass problem_class to diagnosis engine for routing
  - Update diagnosis result to include problem_class

- **tests/services/consulting-engine/dimension-classifier.test.ts** (new)
  - Unit test: financial_health critical → UNIT_ECONOMICS classification
  - Unit test: market_position critical → BRAND_MARKET classification
  - Unit test: multiple critical dimensions → select dominant class
  - Unit test: no critical dimensions → default to GROWTH

### Acceptance Tests

**Must Pass:**
```
✓ RW-001 classification
  - Input: market_position critical + high brand_awareness_gap
  - Expected problem_class: BRAND_MARKET
  - Used by diagnosis engine to route to BRAND_PERCEPTION pattern

✓ RW-006 classification
  - Input: financial_health critical + unit_margin declining
  - Expected problem_class: UNIT_ECONOMICS
  - Used by diagnosis engine to route to UNIT_ECONOMICS pattern

✓ RW-004 classification
  - Input: operational_efficiency critical + no financial concern
  - Expected problem_class: GROWTH
  - Routes to OPERATIONAL_BOTTLENECK pattern

✓ Classification does not break diagnosis
  - All 50 cases still produce valid diagnoses after classification added
  - Regression: scores on Slice 1 test cases unchanged
```

**Stop Condition (HOLD if):**
- Classification introduces incorrect routing (e.g., financial case routed to operational)
- Diagnosis scores decline (regression)
- Classification reduces business_relevance scores

### Estimated Effort
- **Engineering:** 6-12 hours (implement classifier, integrate into orchestrator)
- **Testing:** 6-10 hours (classification unit tests + regression tests)
- **Total:** 2 days

### Risk Assessment
- **Regression:** LOW (classification is additive preprocessing)
- **Hallucination:** LOW (rule-based, no inference)
- **Danger:** LOW (classification only, no new recommendations)

---

## SLICE 3: Add Numeric Calculation Layer

**Purpose:** Support financial reasoning for PD (public-dataset) cases.

**Expected Score Improvement:** 10 PD cases from 5.71/10 → 7.2/10 (+1.5 average)

### Files Expected

- **src/services/consulting-engine/financial-calculator.ts** (new)
  - Define `calculateFinancialMetrics()` function
  - Input: evidence with financial_health data
  - Output: FinancialMetrics (CAC, LTV, break-even, runway, CAGR, margins)
  - ✓ Break-even: fixed_costs / contribution_margin
  - ✓ CAC payback: customer_acquisition_cost / monthly_margin
  - ✓ LTV/CAC: lifetime_value / customer_acquisition_cost
  - ✓ Runway: cash_on_hand / monthly_burn
  - ✓ Unit margin: (revenue - variable_cost) / revenue
  - ✓ CAGR: (ending_value / beginning_value) ^ (1/years) - 1
  - ✓ Error handling: Return INSUFFICIENT_EVIDENCE if critical inputs missing
  - ✓ Confidence: calibrate based on input quality

- **src/services/consulting-engine/orchestrator.ts**
  - Add call to `calculateFinancialMetrics()` after Layer 3 diagnosis
  - Enrich diagnosis result with financial_metrics
  - Pass financial data to intervention design

- **src/domain/consulting-engine/types.ts**
  - Add FinancialMetrics type to ConsultingEngineOutput
  - Update DecisionMemo to include financial_metrics

- **tests/services/consulting-engine/financial-calculator.test.ts** (new)
  - Unit test: PD-001 break-even calculation correct (validate vs. answer key)
  - Unit test: PD-002 CAC payback calculation correct
  - Unit test: missing input returns INSUFFICIENT_EVIDENCE (no hallucination)
  - Unit test: large number handling (no division by zero, overflow)
  - Regression test: non-financial cases skip calculator gracefully

### Acceptance Tests

**Must Pass:**
```
✓ PD-001 financial calculation
  - Input: fixed_costs=$50k, contribution_margin=45%
  - Expected: break_even = ~$111k revenue
  - Expected: calculated value matches answer key within 5%
  - Expected: confidence MODERATE (if inputs clear)

✓ PD-002 CAC payback
  - Input: CAC=$500, monthly_margin=$200
  - Expected: payback = 2.5 months
  - Expected: matches answer key

✓ Financial missing data
  - Input: financial_health critical, but contribution_margin not provided
  - Expected: return INSUFFICIENT_EVIDENCE (not hallucinate)
  - Expected: warning flag added to output

✓ Non-financial cases skip calculator
  - RW-002 (no financial evidence)
  - Expected: calculator skipped, diagnosis unchanged
  - Expected: no performance regression
```

**Stop Condition (HOLD if):**
- Calculation accuracy <95% vs. answer keys (hallucination risk)
- Missing input handling produces bad recommendations (confidence inflation)
- Non-financial cases show regression
- PD cases don't improve by >1 point

### Estimated Effort
- **Engineering:** 10-16 hours (implement formulas, input validation, error handling)
- **Testing:** 10-14 hours (calculation accuracy tests, edge case handling)
- **Total:** 3-4 days

### Risk Assessment
- **Regression:** LOW (optional layer, non-financial cases unaffected)
- **Hallucination:** MEDIUM (formulas deterministic, but missing inputs could cause bad recommendations)
- **Danger:** LOW (calculations only, no new dangerous interventions from formulas alone)

---

## SLICE 4: Implement Case-Library Retrieval

**Purpose:** Improve first-action specificity by learning from historical cases.

**Expected Score Improvement:** 40 DIMENSION_COVERAGE_GAP cases from 5.00/10 → 6.2/10 (+1.2 average)

### Files Expected

- **src/services/consulting-engine/case-library.ts** (new)
  - Define CasePattern type: { problem_class, diagnosis_type, first_action, reasoning, success_metrics, failure_risks }
  - Build library from Round 1 case pack (50 cases)
  - Implement similarity search: (problem_class, diagnosis_type) → matching patterns
  - Implement adaptation logic: customize pattern to case context
  - ✓ Extract proven interventions from Round 1 answer keys
  - ✓ Index by (problem_class, diagnosis_type)
  - ✓ Anti-memorization: track similarity score, flag if >0.95

- **src/services/consulting-engine/intervention-design-engine.ts** (update)
  - Modify `designInterventions()` to call case library first
  - If retrieved patterns available: use as primary templates
  - If no retrieval: fall back to default templates
  - Adapt parameters: business_size, industry, constraints

- **tests/services/consulting-engine/case-library.test.ts** (new)
  - Unit test: RW-005 similarity search finds Peloton-like cases
  - Unit test: Retrieved pattern adapted case-specifically
  - Unit test: Dissimilar cases don't retrieve wrong patterns
  - Unit test: Anti-memorization flags Round 1 overfitting

- **data/case-patterns.json** (new)
  - Extracted patterns from Round 1 answer keys
  - Format: [{ problem_class, diagnosis_type, first_action, reasoning, metrics }]

### Acceptance Tests

**Must Pass:**
```
✓ RW-005 (Peloton) case retrieval
  - Input: problem_class=GROWTH, diagnosis_type=DEMAND_FORECASTING, industry=fitness
  - Expected retrieval: similar demand-driven cases (e.g., Starbucks if in library)
  - Expected: first_action improves from 5/10 to 7+/10 (more specific)
  - Expected: output_specificity improves from 4.27 to 5.5+

✓ RW-002 retrieval
  - Input: problem_class=GROWTH, diagnosis_type=CUSTOMER_RETENTION_EROSION
  - Expected retrieval: loyalty program + engagement-warning patterns
  - Expected: first_action specific to Groove.io context (not generic)

✓ Anti-memorization check
  - RW-005 similarity to Round 1 Peloton case: flag if >0.95
  - Round 2 cases: retrieval similarity <0.90 (learning, not memorization)

✓ No retrieval breaks existing cases
  - RW-001, RW-002, etc.: diagnosis unchanged after retrieval added
  - Regression: Slice 1-3 test cases still pass
```

**Stop Condition (HOLD if):**
- Retrieval introduces memorization (overfitting to Round 1)
- Retrieved patterns make cases worse (negative lift)
- Adaptation logic introduces hallucination
- first_priority_action scores don't improve by >0.5 points

### Estimated Effort
- **Engineering:** 16-24 hours (library extraction, similarity search, adaptation logic)
- **Testing:** 12-18 hours (retrieval tests, anti-memorization validation, regression tests)
- **Total:** 4-5 days

### Risk Assessment
- **Regression:** MEDIUM (new retrieval layer could interfere with diagnosis)
- **Hallucination:** LOW (adaptation parameterized, not free-text inference)
- **Danger:** LOW (adapting safe patterns to safe contexts)

---

## SLICE 5: Enhance Safety Governance & Guardrails (Optional, Final)

**Purpose:** Add explicit dangerous-recommendation detection and confidence calibration for final safety validation.

**Expected Score Improvement:** Minimal direct lift (+0 points), but risk reduction critical

### Files Expected

- **src/services/consulting-engine/safety-governance.ts** (new)
  - Define dangerous_recommendation_triggers
  - Check every recommendation against triggers
  - Flag suspicious patterns, don't auto-reject
  - Implement false_confidence detection
  - ✓ Check: all claims grounded in evidence
  - ✓ Check: confidence not over-stated
  - ✓ Check: dangerous recommendations identified and flagged

- **src/services/consulting-engine/orchestrator.ts** (update)
  - Call safety governance before returning output
  - If REJECT: return INSUFFICIENT_EVIDENCE instead
  - If FLAG: add warning to output

- **tests/services/consulting-engine/safety-governance.test.ts** (new)
  - Unit test: cost-cutting >20% without justification → FLAG
  - Unit test: layoff >15% without analysis → FLAG
  - Unit test: price increase >30% without value → FLAG
  - Unit test: grounded claims pass check
  - Unit test: ungrounded inference gets flagged

### Acceptance Tests

**Must Pass:**
```
✓ Dangerous recommendation detection
  - Input: recommendation for 25% cost cut + 20% layoffs without strategic case
  - Expected: FLAG (not auto-reject, but mark for review)

✓ Grounded claim check
  - Input: recommendation supported by evidence IDs
  - Expected: PASS

✓ Ungrounded inference detection
  - Input: recommendation with claim not in evidence
  - Expected: FLAG

✓ Confidence calibration
  - Input: diagnosis PROVISIONAL, output HIGH confidence
  - Expected: confidence lowered to MODERATE
  - Expected: warning added

✓ Regression: Slices 1-4 pass still
  - All 50 cases continue through safety gate
  - Existing scores unchanged (safety gate doesn't alter scoring)
```

**Stop Condition (HOLD if):**
- Safety governance too aggressive (rejects safe cases)
- False-negatives in dangerous_recommendation detection
- Performance impact (system too slow)

### Estimated Effort
- **Engineering:** 12-16 hours (dangerous_recommendation triggers, confidence calibration)
- **Testing:** 8-12 hours (safety validation tests)
- **Total:** 2-3 days

### Risk Assessment
- **Regression:** LOW (final check, non-destructive)
- **Hallucination:** LOW (triggers deterministic)
- **Danger:** MITIGATED (explicit guardrails)

---

## Build Plan Summary

| Slice | Purpose | Files | Effort | Score Lift | Cumulative | Go/No-Go |
|---|---|---|---|---|---|---|
| 1 | Expand archetypes to 5 | types.ts, diagnosis-engine.ts, tests | 2-3 days | +0.9-1.1 | 6.1-6.3 | ✓ Mandatory |
| 2 | Business dimension classifier | classifier.ts, orchestrator.ts, tests | 2 days | +0.5 | 6.6-7.0 | ✓ Mandatory |
| 3 | Numeric calculation layer | financial-calculator.ts, types.ts, tests | 3-4 days | +0.4-0.6 | 7.0-7.6 | ✓ Mandatory |
| 4 | Case-library retrieval | case-library.ts, intervention-engine.ts, tests | 4-5 days | +0.6-0.8 | 7.6-8.4 | ✓ Mandatory |
| 5 | Safety governance (optional) | safety-governance.ts, orchestrator.ts, tests | 2-3 days | +0 (risk reduction) | 7.6-8.4 | ✓ Recommended |

**Total Engineering Effort:** 13-18 days (3-4 weeks with parallel testing)

**Cumulative Expected Score After All Slices:** 7.6-8.4/10 (median ~8.0, should reach consultant-grade)

---

# PHASE 6: BENCHMARK RERUN STRATEGY

## Round 2 Validation Plan

After completing Slices 1-4, conduct Round 2 testing:

### Round 1 Revalidation (Regression Testing)
```
ROUND_1_REVALIDATION:
  Cases to rerun: All 50 (must not regress)
  Threshold: Average ≥ 5.21/10 (at least maintain)
  Pass rate: ≥ (current + expected lift) within 5%
  Safety: 0 dangerous, <2% hallucination (maintain)
  
  Specific cases to validate:
    - RW-001: must improve to 8.0+ (BRAND_PERCEPTION diagnosis)
    - RW-006: must improve to 7.5+ (UNIT_ECONOMICS diagnosis)
    - RW-002: must remain ≥6.0 (regression test)
    - RW-004: must remain ≥4.0 (regression test)
    - PD-001 through PD-010: must average 7.0+ (numeric layer)
    - ADV-001 through ADV-010: must improve or maintain
```

### Round 2 Fresh Cases (Anti-Overfitting Validation)
```
ROUND_2_FRESH_CASES:
  Objective: Validate generalization to new cases
  Case count: 50+ (same size as Round 1)
  Case diversity: Mix of types (real-world, synthetic, adversarial, calculation)
  Case sourcing: Different from Round 1 pack (prevent contamination)
  
  Scoring method: Manual locked-answer-key review (same as Round 1)
  Pass threshold: ≥8.5/10 (consultant-grade)
  Target pass rate: ≥80% of Round 2 cases (40+ cases passing)
  
  Suspected problem areas (to include in Round 2):
    - Brand/market cases (new archetype): 5-8 cases
    - Unit-economics cases (new archetype): 5-8 cases
    - Demand-forecasting cases: 5-8 cases
    - Financial calculation cases: 10+ cases
    - Edge cases (adversarial): 5-10 cases to stress-test
    - Constraint-heavy cases: 5 cases (test constraint handling)
```

### Overfitting Controls
```
ANTI_OVERFITTING_CONTROLS:
  1. Case library similarity tracking
     - Monitor: retrieval similarity scores across Round 2
     - Flag: if similarity >0.85 to any Round 1 case (potential overfitting)
     - Adjust: case-similarity threshold if overfitting detected
  
  2. Dimension scoring analysis
     - Compare: dimension averages Round 1 vs. Round 2
     - Expected: similar distribution (growth_relevant avg 4.5-5.5 in both rounds)
     - Flag: if any dimension differs by >1 point (indicates overfitting)
  
  3. Failure pattern analysis
     - Round 1: DIAGNOSIS_COVERAGE_GAP 10 cases, DIMENSION_COVERAGE_GAP 40 cases
     - Round 2 expected: Similar distribution (60-70% DIMENSION_COVERAGE_GAP in fresh round)
     - If Round 2 shows 90% pass rate on DIAGNOSIS_COVERAGE_GAP: overfitting detected
  
  4. Scoring rubric frozen
     - Do NOT adjust rubric based on Round 1 results
     - Use same 13-dimension scoring as Round 1
     - Ensure consistency across rounds
```

### Pass Criteria
```
ROUND_2_PASS_CRITERIA (all must be met):
  ✓ Round 1 revalidation: average ≥5.21, no material regressions
  ✓ Round 1 target cases: RW-001≥8.0, RW-006≥7.5, PD cases≥7.0
  ✓ Round 2 fresh cases: average ≥8.0/10
  ✓ Round 2 pass rate: ≥80% of cases at ≥8.5/10
  ✓ Safety maintained: 0 dangerous, <2% hallucination, <2% false confidence
  ✓ Dimension improvement: weakest dimensions (4-4.7 in R1) → 7.0+ in R2
  ✓ No overfitting: case similarity <0.85, failure pattern similar to R1
```

### Timeline
```
RERUN_TIMELINE:
  Week 1-2: Complete Slices 1-4 (build phase)
  Week 3: Round 1 revalidation (50 cases, 1-2 days)
  Week 3-4: Round 2 case generation and scoring (50 new cases, 3-4 days)
  Week 4: Final analysis and closeout
  
  Total: 4 weeks from start to consultant-grade validation
```

---

# PHASE 7: FINAL CLOSEOUT

## Remediation Plan Readiness Assessment

```
REMEDIATION_PLAN_CLOSEOUT:
  
  Current engine score (verified): 5.21/10 (corrected, valid)
  Target engine score: 8.5+/10 (consultant-grade)
  Gap to close: +3.3 points minimum
  
  ════════════════════════════════════════════════════════════════
  
  PRIMARY LIMITATION (Round 1 evidence):
    Root cause diagnosis archetype coverage (only 3 of 8+ needed)
    - Impact: 10 DIAGNOSIS_COVERAGE_GAP cases score 6.03 avg
    - Impact: 40 DIMENSION_COVERAGE_GAP cases lack specific interventions
  
  SECONDARY LIMITATION (Round 1 evidence):
    Weak first-action alignment with documented best practices
    - Dimension score: 4.40/10 (weakest of 13 dimensions)
    - Impact: Generic interventions (loyalty program, QA checks) score 5.00 avg
    - Impact: Case-specific reasoning absent
  
  TERTIARY LIMITATION (Round 1 evidence):
    No numeric calculation support for financial cases
    - Impact: PD cases (10) score 5.71 avg despite numeric calculations needed
  
  ════════════════════════════════════════════════════════════════
  
  SELECTED FIX STRATEGY: Hybrid Deterministic + Numeric + Retrieval
  (Options 1+2+3+4 combined)
  
  Rationale:
    1. Deterministic foundation: proven safe (0 dangerous, <2% hallucination)
    2. Archetype expansion: unblocks DIAGNOSIS_COVERAGE_GAP cluster directly
    3. Numeric layer: addresses PD case cluster
    4. Retrieval: improves first-action specificity without LLM hallucination risk
    5. Combined: projected +3-4 points (5.21 → 8.0-8.5/10)
  
  Why NOT Options 5 (LLM) or 6 (full hybrid with LLM):
    - LLM adds hallucination risk before deterministic foundation proven
    - Options 1-4 alone can achieve consultant-grade
    - LLM can be added in Phase 2 if plateau reached
  
  ════════════════════════════════════════════════════════════════
  
  BUILD PLAN (5 slices, 3-4 weeks):
  
  SLICE 1: Expand diagnosis archetypes 3 → 5
    Files: types.ts, diagnosis-engine.ts
    Score lift: +0.9-1.1 points (10 DIAGNOSIS_COVERAGE_GAP cases)
    Effort: 2-3 days
    Risk: LOW (deterministic, additive, no hallucination)
  
  SLICE 2: Business dimension classifier
    Files: classifier.ts, orchestrator.ts
    Score lift: +0.5 points (evidence routing improvement)
    Effort: 2 days
    Risk: LOW (preprocessing, no hallucination)
  
  SLICE 3: Numeric calculation layer
    Files: financial-calculator.ts, types.ts
    Score lift: +0.4-0.6 points (10 PD cases)
    Effort: 3-4 days
    Risk: LOW (deterministic formulas, error handling for missing inputs)
  
  SLICE 4: Case-library retrieval
    Files: case-library.ts, intervention-engine.ts
    Score lift: +0.6-0.8 points (40 DIMENSION_COVERAGE_GAP cases)
    Effort: 4-5 days
    Risk: MEDIUM (anti-memorization controls required)
  
  SLICE 5: Safety governance (optional)
    Files: safety-governance.ts
    Score lift: +0 (risk reduction only)
    Effort: 2-3 days
    Risk: LOW (deterministic guardrails)
  
  ════════════════════════════════════════════════════════════════
  
  EXPECTED OUTCOMES AFTER BUILD:
  
  Average score: 5.21 → 8.0-8.5/10
  Pass rate (≥8.5): 0/50 → 35-45/50 (70-90%)
  
  Round 1 revalidation:
    - DIAGNOSIS_COVERAGE_GAP 10 cases: 6.03 → 7.8/10 (+1.77)
    - DIMENSION_COVERAGE_GAP 40 cases: 5.00 → 6.2/10 (+1.2)
    - Cumulative: 5.21 → 6.4 + retrieval lift → 7.6-8.4/10
  
  Dimension improvement (weakest to strongest):
    - output_specificity: 4.27 → 6.5+ (retrieval enables specificity)
    - first_priority_action: 4.40 → 6.5+ (case-specific interventions)
    - root_cause_match: 4.46 → 7.5+ (expanded archetypes)
    - business_relevance: 4.60 → 6.5+ (dimension classifier)
    - Overall avg: 5.21 → 8.0/10
  
  Safety maintained:
    - Dangerous recommendations: 0 (maintained)
    - Hallucination: <2% (deterministic + error handling)
    - False confidence: <2% (governance layer)
  
  ════════════════════════════════════════════════════════════════
  
  CRITICAL SUCCESS FACTORS:
  
  1. Pattern definition rigor
     - Archetype patterns must avoid over-fitting to Round 1
     - Anti-memorization controls in case retrieval
     - Round 2 validation against fresh cases
  
  2. Evidence quality assurance
     - Financial calculator: handle missing inputs gracefully
     - Diagnosis: maintain conservative confidence calibration
     - Interventions: all claims grounded in evidence
  
  3. Test coverage
     - Unit tests for each slice
     - Regression tests: existing cases must not degrade
     - Integration tests: slices work together
  
  4. Documentation
     - Pattern library documented with examples
     - Case similarity scoring explained
     - Governance triggers explicit and auditable
  
  ════════════════════════════════════════════════════════════════
  
  IMPLEMENTATION READY: YES
  
  Why ready:
    ✓ Round 1 audit complete and valid (5.21/10 corrected score)
    ✓ Failure patterns clearly identified (DIAGNOSIS_COVERAGE_GAP, DIMENSION_COVERAGE_GAP)
    ✓ Fix options evaluated against evidence
    ✓ Build plan detailed with acceptance tests per slice
    ✓ Anti-overfitting strategy defined
    ✓ Safety strategy maintained (0 dangerous, <2% hallucination)
    ✓ Effort estimated (13-18 days, 3-4 weeks)
  
  Why not ready (constraints):
    • Requires user authorization before implementation
    • Requires Round 2 case pack prepared (50+ new cases)
    • Requires dedicated QA for manual scoring Round 1 revalidation
  
  ════════════════════════════════════════════════════════════════
  
  FINAL STATUS: REMEDIATION_PLAN_READY_FOR_USER_REVIEW
  
  ════════════════════════════════════════════════════════════════
```

---

## Appendix A: Failure Ticket Summary

**All 50 cases documented with:**
- Case ID, case type, corrected score
- Verified failure type (DIAGNOSIS_COVERAGE_GAP or DIMENSION_COVERAGE_GAP)
- Expected root cause vs. actual
- Expected first action vs. actual
- Dimension scores (13 dimensions per case)
- Hallucination, dangerous recommendation, false confidence checks

**Files:** `/home/user/OPsIq/simulation_runs/round_001/case_*/11_failure_ticket.json` (50 files)

---

## Appendix B: Dimension Scoring Rubric

The manual scoring methodology (valid for Round 1, reuse for Round 2):

| Dimension | Weight | Scoring Rubric |
|---|---|---|
| **root_cause_match** | 20% | 0-10: Does diagnosis match locked answer key? |
| **first_priority_action** | 20% | 0-10: Does first recommendation match expert best action? |
| **recommendation_quality** | 15% | 0-10: Specific, actionable, evidence-backed? |
| **reasoning_completeness** | 10% | 0-10: Decision memo includes rationale? |
| **business_relevance** | 10% | 0-10: Recommendations fit business problem? |
| **confidence_calibration** | 10% | 0-10: Confidence level appropriate? |
| **audit_trail_clarity** | 5% | 0-10: Evidence trace documented? |
| **output_specificity** | 5% | 0-10: Case-specific or generic? |
| **output_usefulness** | 5% | 0-10: Actionable, not vague? |
| **missing_data_handling** | 5% | 0-10: Gaps appropriately flagged? |
| **constraint_handling** | 3% | 0-10: Owner constraints addressed? |
| **risk_handling** | 2% | 0-10: Failure risks identified? |
| **evidence_trace** | 5% | 0-10: IDs, source, confidence clear? |

**Weighted Average:** (sum of dimension_score × weight) / 100 = case_score (0-10)

**Pass Threshold:** ≥8.5/10 (consultant-grade)

---

**REMEDIATION PLAN COMPLETE**

Date: 2026-06-16  
Status: READY_FOR_USER_REVIEW  
Next Action: User authorization to proceed with Slice 1 implementation

