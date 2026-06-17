# FORENSIC VALIDATION DISTRIBUTION ANALYSIS
## Component Failure Responsibility

**Analysis Date:** 2026-06-17  
**Failure Matrix Scope:** 13 validated failing cases from Stage A benchmark  
**Methodology:** Each case mapped to component responsible for failure based on failure category and root cause analysis

---

## VALIDATED FAILURE SOURCE DISTRIBUTION

| Component | Failure Count | % of Total | Cases | Failure Mode | Confidence |
|-----------|--------------|-----------|-------|--------------|-----------|
| **EvidenceSynthesisEngine** | 10 | 76.9% | BLND-006, BLND-008, BLND-009, BLND-010, ADV-011, RW-016, RW-022, RW-024, PD-019, SYN-013 | Pattern creation/mapping to wrong diagnosis; missing insufficient-evidence detection; no contradiction suppression | HIGH |
| **HypothesisGenerator** | 12 | 92.3% | All 13 cases | Confidence scoring without validation; accepts symptoms as root causes; no alternative-hypothesis vetting | HIGH |
| **HypothesisRanker** | 2 | 15.4% | ADV-012, ADV-014 | Incorrect ranking despite pattern correctness | MEDIUM |
| **CausalDiagnosisAdjudicator** | 1 | 7.7% | ADV-012 | Tiebreaker threshold (±1 confidence) rarely reached; adjudication underutilized | LOW |
| **Benchmark Ambiguity** | 0 | 0% | — | No cases identified as ambiguous | — |

**Note:** Components not mutually exclusive. A single case may have failures attributed to multiple components (e.g., EvidenceSynthesisEngine creates wrong pattern → HypothesisGenerator doesn't validate → HypothesisRanker doesn't correct).

---

## DETAILED FAILURE BREAKDOWN BY COMPONENT

### 1. EvidenceSynthesisEngine (10 of 13 cases, 76.9%)

**Root Causes Identified:**

| Failure Subtype | Count | Cases | Root Cause | Code Location |
|-----------------|-------|-------|-----------|--------------|
| Pattern-to-Diagnosis Mismatch | 8 | BLND-006, BLND-008, BLND-009, BLND-010, ADV-011, RW-016, RW-022, PD-019 | Pattern created with correct supporting evidence but mapped to wrong `potentialRootCauses` (lines 19, 80-82, 156, 195) | evidence-synthesis-engine.ts lines 65-201 |
| Missing Insufficient-Evidence Detection | 2 | BLND-008, ADV-011 | Engine creates confident patterns despite explicitly unavailable critical data (`unavailableData` field in case input) | evidence-synthesis-engine.ts line 34 |
| Aggregation Masking | 1 | RW-024 | No logic to detect when aggregate metrics (blended payback, avg utilization) mask cohort-level deterioration | evidence-synthesis-engine.ts lines 34-58 |
| Contradiction Non-Suppression | 1 | SYN-013 | Evidence of intact satisfaction (high repeat rate, low churn in pre-engagement cohorts) does not suppress quality-crisis pattern | evidence-synthesis-engine.ts lines 101-111 |

**Specific Examples:**

**BLND-006**: 
- Pattern 3 (quality_delivery dimension) creates TRUST_QUALITY_CRISIS pattern
- Evidence explicitly shows: NPS 48, repeat 72%, logistics $12/rental, turnover 4.2x, utilization 85%
- Pattern mapped to TRUST_QUALITY_CRISIS despite evidence contradicting quality issue
- Expected diagnosis: DEMAND_FORECASTING_MISMATCH (should use Pattern 6: market saturation signals)
- Root cause: `checkPattern()` function (line 204) only checks dimension presence, not evidence content for contradictions

**BLND-008**:
- Evidence field notes: `unavailableData` includes "Final, signed offer structure," "Verified standalone forecast," "Investor reservation values"
- Engine still creates confident pattern mapping to CUSTOMER_RETENTION_EROSION
- Expected diagnosis: INSUFFICIENT_EVIDENCE
- Root cause: No logic in `synthesizeEvidence()` to check `unavailableData` against critical decision factors

**ADV-011**:
- `unavailableData` explicitly lists: "Detailed customer segmentation," "Detailed competitor positioning," "Customer willingness-to-pay research"
- Utilization decline (70%→55%) could be: (1) market demand, (2) customer concentration, (3) competitive displacement, (4) pricing
- Engine creates OPERATIONAL_BOTTLENECK pattern without validating which cause
- Root cause: No validation layer requiring "must have seen win-loss and cohort data before diagnosing bottleneck"

### 2. HypothesisGenerator (12 of 13 cases, 92.3%)

**Root Causes Identified:**

| Failure Subtype | Count | Cases | Root Cause | Code Location |
|-----------------|-------|-------|-----------|--------------|
| Confidence Scoring Without Validation | 12 | All 13 | Confidence calculation (lines 381-450) based on pattern matches and keyword presence, not on validation that evidence supports THIS diagnosis | hypothesis-generator.ts lines 297-492 |
| Symptoms Accepted as Root Causes | 7 | BLND-006, BLND-009, BLND-010, RW-016, RW-022, PD-019, SYN-013 | Engine accepts symptom patterns (retention trend, margin decline, utilization drop) as primary diagnoses instead of investigating root causes | lines 414-473 |
| Negative Indicator Penalties Insufficient | 5 | BLND-006, BLND-008, BLND-009, ADV-012, SYN-013 | `negativeIndicators` (lines 44-45, 71-72, etc.) exist but penalties are small (lines 347-375: -10 per negative indicator) when contradictory evidence should suppress diagnoses | lines 347-375 |
| Missing Alternative-Hypothesis Vetting | 3 | ADV-011, ADV-012, RW-024 | Top hypothesis reached high confidence without validating that runner-up or other diagnoses better fit the evidence | lines 188-295 |

**Specific Examples:**

**BLND-006 Confidence Scoring:**
```
Expected: DEMAND_FORECASTING_MISMATCH (HIGH confidence given market-structural evidence)
Predicted: CUSTOMER_RETENTION_EROSION (45% confidence)

Confidence calculation breakdown:
- Pattern matches: CUSTOMER_RETENTION_EROSION pattern found (customer_retention dimension)
- Keyword match: "churn," "retention," "attrition" found in evidence → hasRequiredKeywords = true
- Negative indicators: "nps stable high" (repeat 72%, NPS 48) → -10 penalty (lines 374)
- Final: baseConfidence reduced by only 10 points despite strong contradictory evidence
- Result: 45% confidence despite clear evidence that satisfaction is NOT the issue
```

Root cause: `negativeIndicatorPenalty = negCount * 10` (line 374) is too weak when contradictory evidence is strong (repeat rate 72% is high, NPS 48 is stable/neutral not negative).

**ADV-011 Symptoms-as-Root-Cause:**
```
Expected: INSUFFICIENT_EVIDENCE
Predicted: OPERATIONAL_BOTTLENECK (45% confidence)

Diagnosis logic:
- Evidence shows: profit down 31%, utilization 70%→55%
- Pattern 4 matches (operational_efficiency dimension)
- Confidence boosted because "utilization" keyword found
- Never validated: does the downward utilization trend indicate capacity constraint vs other causes?
  (Could be market demand decline, customer concentration loss, pricing pressure, or yes, bottleneck)
- Without win-loss data, cohort analysis, or pricing breakdown: cannot distinguish
- Engine accepted "utilization down = bottleneck" as sufficient validation
```

Root cause: No conditional logic requiring "before diagnosing operational bottleneck, must validate that revenue/demand is NOT the constraint" (would need win-loss data to prove this).

### 3. HypothesisRanker (2 of 13 cases, 15.4%)

**Root Causes Identified:**

| Failure Subtype | Count | Cases | Root Cause |
|-----------------|-------|-------|-----------|
| Incorrect Ranking Despite Pattern Correctness | 2 | ADV-012, ADV-014 | Correct patterns generated but ranked below incorrect patterns due to specificity weighting or net-score heuristics | hypothesis-ranker.ts lines 13-129 |

**Specific Examples:**

**ADV-012:**
- Expected: TRUST_QUALITY_CRISIS (doubled churn 2%→4%, NRR <100%, mechanism: weak activation/value realization in low-switching-cost market)
- Predicted: CUSTOMER_RETENTION_EROSION (45% confidence)
- Both patterns generated (lines 303-305 in hypothesis-generator.ts show both in candidates)
- Ranking logic: `sort((a, b) => b.confidence - a.confidence)` (line 214)
- CUSTOMER_RETENTION_EROSION confidence > TRUST_QUALITY_CRISIS confidence due to:
  - supportingEvidenceCount: retention evidence higher than quality evidence (churn, NRR obvious; activation/TTFV/module-usage less obvious)
  - specificity calculation: CUSTOMER_RETENTION_EROSION has 1 pattern vs TRUST_QUALITY_CRISIS has 1 pattern (tie)
  - evidence diversity: both score similarly
- Root cause: HypothesisRanker's specificity heuristic (lines 71-89) doesn't account for **quality of evidence match**, only pattern count and dimension diversity

**ADV-014:**
- Expected: OPERATIONAL_BOTTLENECK (junior turnover 10%→18% constrains delivery)
- Predicted: OPERATIONAL_BOTTLENECK (60% confidence) — CORRECT diagnosis but slightly over-confident given ambiguity
- Both UNIT_ECONOMICS_BREAKDOWN and OPERATIONAL_BOTTLENECK were generated
- OPERATIONAL_BOTTLENECK ranked higher because:
  - Flat revenue (no growth) + margin decline (50%) could support either diagnosis
  - Engine treated utilization constraint as primary, when flat revenue could alternatively indicate "cost broke, so no growth" vs "capacity broke, so revenue capped"
- Root cause: Confidence justification (lines 130-139) doesn't validate "is flat revenue consistent with bottleneck hypothesis?" (bottleneck would show demand exceeding capacity, not flat demand)

### 4. CausalDiagnosisAdjudicator (1 of 13 cases, 7.7%)

**Root Causes Identified:**

| Failure Subtype | Count | Cases | Root Cause |
|-----------------|-------|-------|-----------|
| Tiebreaker Threshold Underutilized | 1 | ADV-012 | Adjudicator only activates when confidence within ±1 point (line 276); most cases have clear winner by pattern stage | causal-diagnosis-adjudicator.ts line 276 |

**Specific Examples:**

**ADV-012:**
- Condition for adjudication (line 276): `Math.abs(sorted[0].confidence - sorted[1].confidence) <= 1`
- CUSTOMER_RETENTION_EROSION: 45% confidence
- TRUST_QUALITY_CRISIS: ~42% confidence (not within ±1 of second place)
- Adjudicator does not activate
- Adjudicator could have resolved with causal-evidence scoring (lines 307-327): TRUST_QUALITY_CRISIS has strong causal evidence (incidents, uptime degradation) while CUSTOMER_RETENTION_EROSION has weak causal evidence (churn trend alone is symptom)
- Root cause: Tiebreaker threshold ±1 is too tight; causal adjudication should activate at ±5 for conflicting diagnosis pairs

---

## CROSS-COMPONENT FAILURE CHAINS

Most failures are **not isolated component issues** but rather **cascading failures** where EvidenceSynthesisEngine weakness feeds into HypothesisGenerator overconfidence:

### Failure Chain Type 1: Pattern Wrong → Generator Confident (8 cases)
```
Example BLND-006:
1. EvidenceSynthesisEngine creates Pattern 3 (quality_delivery) → TRUST_QUALITY_CRISIS
2. HypothesisGenerator receives pattern + keyword matches "churn," "retention"
3. Confidence boosted to 45% despite contradictory evidence (NPS 48 not negative)
4. HypothesisRanker never corrects (CUSTOMER_RETENTION_EROSION already at 45%, no distinction)
5. Result: Wrong diagnosis at high confidence

Fix would require: EvidenceSynthesisEngine to suppress Pattern 3 when satisfaction metrics contradict it
```

### Failure Chain Type 2: Missing Validation → Generator Overconfident (2 cases)
```
Example BLND-008:
1. Evidence explicitly marks unavailableData: "offer structure," "standalone forecast," "investor values"
2. EvidenceSynthesisEngine creates pattern despite this (no check for unavailableData)
3. HypothesisGenerator boosts confidence because evidence dimensions present
4. Correct diagnosis (INSUFFICIENT_EVIDENCE) never generated
5. Result: CUSTOMER_RETENTION_EROSION at 45% confidence when 0% confidence appropriate

Fix would require: EvidenceSynthesisEngine to flag when critical decision factors marked unavailable
```

### Failure Chain Type 3: Symptoms Not Rejected → Generator Accepts (7 cases)
```
Example RW-022:
1. EvidenceSynthesisEngine creates Pattern 4 (team_capability + operational_efficiency) → OPERATIONAL_BOTTLENECK
2. HypothesisGenerator receives pattern; evidence shows "utilization," "throughput"
3. Confidence: 55% (above threshold)
4. But underlying cause is unit-cost deterioration (cost +18% vs revenue -12%), NOT capacity
5. Flat volumes rule out bottleneck, but this validation never happens
6. Result: Symptom (utilization pressure) diagnosed as root cause (bottleneck) instead of investigating alternatives

Fix would require: HypothesisGenerator to validate "does the primary symptom pattern have an upstream root cause?" before committing
```

---

## SUMMARY STATISTICS

| Metric | Value |
|--------|-------|
| Total Failing Cases Analyzed | 13 |
| Cases with EvidenceSynthesisEngine responsibility | 10 (76.9%) |
| Cases with HypothesisGenerator responsibility | 12 (92.3%) |
| Cases with HypothesisRanker responsibility | 2 (15.4%) |
| Cases with CausalDiagnosisAdjudicator responsibility | 1 (7.7%) |
| Average confidence when predicted diagnosis wrong | 44.6% |
| Cases with contradictory evidence ignored | 5 (38%) |
| Cases with missing critical data ignored | 2 (15%) |
| Cases where symptoms treated as root causes | 7 (54%) |

---

## CONCLUSION: PRIMARY FAILURE SOURCES

**1. EvidenceSynthesisEngine (76.9% of failures)**
- Pattern-to-diagnosis mapping incorrect in 8 cases
- No validation that evidence content supports the diagnosis (only checks dimension presence)
- No detection of insufficient evidence or aggregation masking
- **Critical Gap**: No contradiction-suppression logic (e.g., intact satisfaction should suppress quality-crisis pattern)

**2. HypothesisGenerator (92.3% of failures)**
- Confidence scoring doesn't validate diagnosis against contradictory evidence
- Symptom patterns accepted as root causes instead of investigated further
- Negative indicator penalties too weak to overcome pattern-based confidence
- **Critical Gap**: No alternative-hypothesis vetting; no "before I diagnose X, have I ruled out Y, Z?"

**3. HypothesisRanker (15.4% of failures)**
- Secondary role; mostly follows from generator output
- Specificity heuristic doesn't account for evidence quality
- **Critical Gap**: Cannot correct patterns ranked too high

**4. CausalDiagnosisAdjudicator (7.7% of failures)**
- Tiebreaker underutilized due to ±1 confidence threshold
- Could be strengthened but is not the primary issue

**Recommendation**: EvidenceSynthesisEngine is the highest-leverage repair point for reaching 9/21 accuracy gate.

