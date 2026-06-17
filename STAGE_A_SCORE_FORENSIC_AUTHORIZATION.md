# PHASE 6 — NEXT FIX AUTHORIZATION (REVISED)

**Evidence-Based Recommendation for Correct Next Fix (Forensic Trace Analysis)**

**Confidence Level:** REVISED from 90% to 30% (see below)  
**Reason for Revision:** Forensic trace analysis contradicts initial pattern strength hypothesis

---

## INITIAL RECOMMENDATION (NOW INCORRECT)

**Previous claim:** "Add pattern strength to base confidence formula"  
**Confidence:** 90%  
**Expected impact:** Fix 8-9 cases to 76-81% accuracy

**Why this was WRONG:**
- Based on code inspection + simulation, not actual measured traces
- Assumed pattern strength unused in ALL cases, but trace data shows this only affects 1 case directly
- 69% of failures are due to diagnosis-to-pattern mapping, not scoring formula
- 23% of failures have equal pattern strength for both winner and correct diagnosis

---

## REVISED FINDINGS FROM FORENSIC TRACE ANALYSIS

### Root Cause Distribution (from actual numeric scores)

| Failure Mode | Count | Diagnosis | Expected Impact of Pattern Strength Fix |
|---|---|---|---|
| **Pattern not mapped to diagnosis** | 9 | Diagnosis never generated (rank 0, confidence 0) | **ZERO** — diagnosis doesn't appear in any pattern, so strength formula irrelevant |
| **Pattern mismatch (winner has pattern, correct doesn't)** | 1 | SYN-013 | **YES** — pattern strength 3 used by winner, correct diagnosis needs pattern |
| **Equal pattern strength, different boosting** | 3 | ADV-012, RW-022, PD-019 | **ZERO** — both use same strength, gap caused by boosting logic |

### Why Pattern Strength Fix Won't Work for 12/13 Cases

**Example 1: BLND-006 (Pattern Mapping Failure)**
```
Ground truth: demand_forecasting_mismatch
Evidence: CAC rising, acquisition growth slowing, churn rising

Patterns Generated:
  1. quality_delivery-customer_retention-pattern (strength 1)
     → potentialRootCauses: [trust_quality_crisis, customer_retention_erosion]
  2. market_position-customer_retention-pattern (strength 4)
     → potentialRootCauses: [go_to_market_misalignment]

Problem:
  - demand_forecasting_mismatch is NOT in any pattern's potentialRootCauses list
  - Diagnosis never generated in hypotheses, defaults to rank 0, confidence 0
  - Pattern strength (4) completely unused
  
Pattern Strength Fix Impact:
  - Adding strength to scoring formula has ZERO effect
  - Diagnosis still not in pattern potentialRootCauses
  - Diagnosis still has confidence 0
```

**Example 2: ADV-012 (Equal Pattern Strength)**
```
Ground truth: trust_quality_crisis
Winner: customer_retention_erosion
Gap: 5 points (45 vs 40)

Both use SAME pattern:
  - quality_delivery-customer_retention-pattern (strength 3)
  - Both have 2 supporting evidence items
  - Both calculated with identical pattern strength

Score gap (5 pts) comes from:
  - Keyword matching differences ("churn" vs "quality crisis")
  - Specificity match on evidence keywords
  - Evidence diversity calculation

Pattern Strength Fix Impact:
  - Both diagnoses would use identical pattern strength (3) in new formula
  - Score gap would remain 5 pts (same boosting factors apply)
  - Variant A test confirmed: disabling keyword boost = 0 improvement
```

---

## CORRECT NEXT FIXES (Prioritized)

### PRIORITY 1: DIAGNOSIS-TO-PATTERN MAPPING REDESIGN (9 cases, 69%)

**Scope:** Make all 11 canonical diagnoses reachable from evidence patterns

**Affected Diagnoses:**
- demand_forecasting_mismatch (BLND-006)
- insufficient_evidence (BLND-008, ADV-011, ADV-013, ADV-014)
- operational_bottleneck (BLND-009, RW-024)
- strategic_pricing_error (BLND-010)

**Current Pattern Contract (BROKEN):**
```typescript
// Each pattern maps to a fixed list of diagnoses
market_position_customer_retention: {
  potentialRootCauses: ["go_to_market_misalignment"]
}
```

**Problem:** Not all diagnoses appear in any pattern's potentialRootCauses

**Proposed Fix Options:**

**Option A: Add diagnoses to existing patterns (conservative)**
- Add demand_forecasting_mismatch to market_position-customer_retention pattern
- Add operational_bottleneck to quality_delivery-operational_efficiency pattern
- Add insufficient_evidence as fallback when low confidence across all patterns

**Option B: Refactor pattern system (architectural)**
- Change from fixed potentialRootCauses lists to dynamic diagnosis scoring
- Generate diagnosis scores independently of pattern mapping
- Use pattern strength to boost scores, not gate generation
- Allows all 11 diagnoses to compete for every case

**Expected improvement if implemented correctly:**
- 9 cases: Currently 0/21, could improve to ~10-12/21 (adding diagnosis generation)
- Additional improvement from pattern strength: ~1-2 cases (if SYN-013 fixed)
- Total potential: 11-13/21 (52-62%) if combined with pattern strength fix

**Estimate:** Option A ~2-4 hours; Option B ~8-12 hours (requires testing)

---

### PRIORITY 2: ADD CUSTOMER_RETENTION PATTERN FOR ADOPTION FAILURES (1 case, 8%)

**Affected:** SYN-013 (customer_retention_erosion vs go_to_market_misalignment, gap 23 pts)

**Problem:** customer_retention_erosion lacks a pattern that maps adoption failures

**Current Pattern:**
```
market_position-customer_retention: potentialRootCauses: ["go_to_market_misalignment"]
```

**Proposed Fix:**
```typescript
// Add new pattern type
adoption_concentration_pattern: {
  triggers: hasLowAdoptionBreadth && (timeToValue > target || csmRatio > target),
  potentialRootCauses: ["customer_retention_erosion"]  // Add this
}
```

**Expected improvement:**
- SYN-013: customer_retention_erosion confidence +20-25 pts (from ~10 to ~30-35)
- Winner (go_to_market_misalignment) stays ~33
- Result: correct diagnosis ranked #1 or #2 (vs #3 currently)

**Estimate:** ~1 hour (pattern definition + test)

---

### PRIORITY 3: RECONSIDER BOOSTING LOGIC FOR EQUAL-STRENGTH CASES (3 cases, 23%)

**Affected:** ADV-012, RW-022, PD-019 (5-point gaps despite equal pattern strength)

**Problem:** When both diagnoses use equal pattern strength, boosting logic (keyword, specificity) decides winner

**Current Boosting:**
```typescript
// Line 419-425: Keyword boost
if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  confidence = Math.min(65, confidence + 5);
}
```

**Analysis of 3 equal-strength cases:**
- ADV-012: Both use strength 3; keyword matching creates 5-pt gap
- RW-022: Both use strength 4; keyword/specificity creates 5-pt gap
- PD-019: Both use strength 6; keyword/specificity creates 5-pt gap

**Options:**
1. **Keep current:** Accept that both diagnoses are valid when patterns equal; document as "ambiguous" cases
2. **Add pattern strength comparison:** When patterns equal, give edge to diagnosis with stronger pattern (but both already use same pattern)
3. **Increase specificity weighting:** Make evidence-keyword matching more decisive for these cases
4. **Review evidence for pattern strength differences:** Check if evidence actually supports equal strength or if one diagnosis needs stronger pattern

**Analysis:** These 3 cases may not have a single correct answer (evidence ambiguous). Reviewing actual evidence details recommended before proposing fix.

**Estimate:** ~4 hours (review + analysis)

---

## DECISION FRAMEWORK

### If Goal is 76-81% Accuracy (16-17/21 correct)

**Don't implement:** The simple 5-line pattern strength fix alone  
**Instead implement:** Priority 1 (diagnosis mapping) + Priority 2 (adoption pattern)  
**Expected result:** ~13-14/21 (62-67%) after Priority 1; ~14-15/21 (67-71%) after Priority 2  
**Gap:** Still need Priority 3 or deeper fixes to reach 16-17

### If Goal is 52-62% Accuracy (11-13/21 correct)

**Implement:** Priority 1 only (diagnosis mapping redesign)  
**Expected result:** ~11-13/21 (52-62%)  
**Effort:** ~2-4 hours (Option A) to ~12 hours (Option B)  
**Confidence:** MEDIUM (depends on which pattern mapping issues are underlying)

### If Accepting Current State (38% baseline)

No action. Current recommendation stands as-is.

---

## CONCLUSION

**Pattern strength scoring fix will NOT achieve 76-81% accuracy.**

Root cause is primarily **diagnosis-to-pattern mapping incomplete**, not pattern strength unused.

**Recommended action:**
1. Implement Priority 1 (diagnosis mapping redesign) first — measure improvement
2. If <62%, implement Priority 2 (adoption pattern)
3. If still <70%, review Priority 3 and re-evaluate architectural options

**Do NOT recommend the simple 5-line pattern strength formula change alone.** It will have minimal impact and may mask the real root cause that needs fixing (pattern mapping).

---

**Status:** AWAITING DECISION ON NEXT IMPLEMENTATION APPROACH

**Next approval required before implementing:** Which of the 3 priority fixes to proceed with?

