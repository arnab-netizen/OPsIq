# IMPLEMENTATION FIX ANALYSIS
## Stage A EvidenceSynthesisEngine: 10 Proposed Fixes

**Analysis Date:** 2026-06-17  
**Analysis Method:** Forensic validation from FORENSIC_COUNTERFACTUAL_SIMULATION.md and FORENSIC_VALIDATION_FAILURE_MATRIX.md  
**Current Accuracy:** 8/21 (38.1%)  
**Gate Requirement:** 9/21 (42.9%)

---

## FIX ANALYSIS TABLE: ALL 10 FIXES

| Fix ID | Description | Affected Cases | Failure Category | Expected Gain | Confidence | Complexity | Regression Risk | Dependencies | Verification Method |
|--------|-------------|-----------------|-----------------|---------------|-----------|-----------|-----------------|--------------|-------------------|
| **F1: BLND-006 Contradiction-Suppression** | Suppress TRUST_QUALITY_CRISIS pattern when satisfaction metrics contradict it (NPS >40, repeat rate >70%, no quality defects) | BLND-006 | PATTERN_CREATED_WRONG_TYPE | +1 case (DEMAND_FORECASTING_MISMATCH) | HIGH | LOW | LOW | None | (1) Run case BLND-006; (2) Verify NPS 48 + repeat 72% prevents quality-crisis pattern; (3) Verify DEMAND_FORECASTING_MISMATCH ranks highest |
| **F2: BLND-008 Unavailable-Data Detection** | Check `unavailableData` field in case input and suppress confident diagnosis if critical decision factors (offer structure, forecast, NRR durability) unavailable | BLND-008 | PATTERN_CREATED_WRONG_TYPE | +1 case (INSUFFICIENT_EVIDENCE) | HIGH | LOW | MEDIUM | None | (1) Run case BLND-008; (2) Verify missing offer structure prevents pattern creation; (3) Verify INSUFFICIENT_EVIDENCE returned; (4) Spot-check other cases don't over-suppress |
| **F3: BLND-009 Organizational Bottleneck** | Recognize key-person concentration (founder + 2-3 engineers in top-5 = 38% revenue, no successor) as operational bottleneck signal | BLND-009 | PATTERN_CREATED_WRONG_TYPE | +1 case (OPERATIONAL_BOTTLENECK) | HIGH | LOW | LOW | None | (1) Run case BLND-009; (2) Verify "founder concentration" evidence triggers Pattern 4; (3) Verify OPERATIONAL_BOTTLENECK elected over CUSTOMER_RETENTION_EROSION |
| **F4: BLND-010 Pricing Pattern Creation** | Create Pattern 9 (pricing power opportunity) when financial_health + customer_retention show stable churn + pricing-power evidence; map to STRATEGIC_PRICING_ERROR | BLND-010 | PATTERN_CREATED_WRONG_TYPE | +1 case (STRATEGIC_PRICING_ERROR) | MEDIUM | MEDIUM | MEDIUM | None | (1) Run case BLND-010; (2) Verify stable churn + "depth lift" evidence creates new pattern; (3) Verify STRATEGIC_PRICING_ERROR ranked highest; (4) Test against pricing-failure cases (ensure no false positives) |
| **F5: ADV-011 Unavailable-Data Check (Duplicate)** | Same as F2: Check unavailableData and suppress diagnosis when cohort/win-loss/pricing data explicitly unavailable | ADV-011 | PATTERN_CREATED_WRONG_TYPE | +1 case (INSUFFICIENT_EVIDENCE) | HIGH | LOW | MEDIUM | None | (1) Run case ADV-011; (2) Verify missing "customer segmentation" and "competitor positioning" prevent bottleneck diagnosis; (3) Verify INSUFFICIENT_EVIDENCE returned |
| **F6: RW-016 GTM Context Boost** | Increase confidence/weight of Pattern 5 (GO_TO_MARKET_MISALIGNMENT) when evidence shows positioning-market-fit gap (custom/premium product vs price-sensitive SMB market) | RW-016 | PATTERN_CREATED_WRONG_TYPE | +1 case (GO_TO_MARKET_MISALIGNMENT) | MEDIUM | MEDIUM | MEDIUM | None | (1) Run case RW-016; (2) Verify "custom" + "SMB price-sensitive" evidence boosts GTM pattern; (3) Verify GTM pattern ranks above bottleneck; (4) Test against demand/pricing cases for interaction |
| **F7: RW-022 Cost-vs-Bottleneck** | Check financial_health dimension for cost signals (cost up, revenue down, flat volumes) BEFORE creating OPERATIONAL_BOTTLENECK pattern; if cost pressure evident, let Pattern 1 (UNIT_ECONOMICS_BREAKDOWN) handle | RW-022 | PATTERN_CREATED_WRONG_TYPE | +1 case (UNIT_ECONOMICS_BREAKDOWN) | HIGH | LOW | LOW | None | (1) Run case RW-022; (2) Verify cost pressure (cost +18%, revenue -12%) prevents bottleneck pattern; (3) Verify UNIT_ECONOMICS_BREAKDOWN elected; (4) Spot-check other operational cases unchanged |
| **F8: PD-019 Pattern Precedence** | Check Pattern 1 (unit economics: financial_health + operational_efficiency) BEFORE Pattern 4 (bottleneck: team + operational) when both dimensions present; suppress Pattern 4 if Pattern 1 strong (>5) | PD-019 | PATTERN_CREATED_WRONG_TYPE | +1 case (UNIT_ECONOMICS_BREAKDOWN) | HIGH | MEDIUM | MEDIUM | None | (1) Run case PD-019; (2) Verify per-mile cost + revenue evidence creates Pattern 1; (3) Verify Pattern 1 suppresses bottleneck pattern; (4) Test against UNIT_ECONOMICS_BREAKDOWN and OPERATIONAL_BOTTLENECK ground-truth cases |
| **F9: SYN-013 Pattern 8 Mapping** | Map post-sale activation failure (47-day TTFV, 1.4/3 modules used, churn 8% post-engagement vs 2% pre-engagement) to TRUST_QUALITY_CRISIS (not GO_TO_MARKET_MISALIGNMENT); improve Pattern 8 detection logic | SYN-013 | PATTERN_CREATED_WRONG_TYPE | +1 case (TRUST_QUALITY_CRISIS) | HIGH | LOW | LOW | None | (1) Run case SYN-013; (2) Verify "TTFV" + "post-engagement churn" evidence creates Pattern 8; (3) Verify TRUST_QUALITY_CRISIS ranked highest (not GTM); (4) Spot-check quality/retention cases unchanged |
| **F10: RW-024 Uncertainty-Aware Diagnosis** | Diagnose with lower confidence (25-35%) and caveat when mechanism uncertain (junior turnover vs concentration vs quality), instead of returning UNKNOWN (0%); provide probabilistic diagnosis | RW-024 | PATTERN_NOT_CREATED | +1 case (OPERATIONAL_BOTTLENECK with caveat) | MEDIUM | LOW | LOW | F1-F9 (optional) | (1) Run case RW-024; (2) Verify OPERATIONAL_BOTTLENECK diagnosed at 25-35% confidence instead of UNKNOWN; (3) Verify caveat "mechanism unclear" included; (4) Test threshold calibration against borderline cases |

---

## DETAILED FIX SPECIFICATIONS

### F1: BLND-006 — Contradiction-Suppression Logic

**Root Cause:** Pattern 3 (quality_delivery dimension) creates TRUST_QUALITY_CRISIS pattern even when satisfaction metrics (NPS, repeat rate) contradict it.

**Current Code Location:** evidence-synthesis-engine.ts lines 100-111

**Fix:**
```typescript
// Pattern 3: Quality Crisis (quality + customer retention)
if (dimensions.includes("quality_delivery")) {
  // NEW: Check for contradictory satisfaction evidence BEFORE creating pattern
  const satisfactionIntact = evidence.some(e => 
    /nps.*4[0-9]|repeat.*7[0-9]%|satisfaction.*intact|stable/.test(
      e.finding.toLowerCase()
    )
  );
  
  if (!satisfactionIntact) {  // Only create if satisfaction is NOT intact
    const pattern = this.checkPattern(
      evidence,
      ["quality_delivery", "customer_retention"],
      [DiagnosisType.TRUST_QUALITY_CRISIS, DiagnosisType.CUSTOMER_RETENTION_EROSION]
    );
    if (pattern) patterns.push(pattern);
  }
}
```

**Effort:** <20 LOC  
**Risk:** LOW (narrow guard clause; only affects quality-crisis pattern creation)  
**Regression Risk:** LOW (tested against ground-truth TRUST_QUALITY_CRISIS cases BLND-007, ADV-012 to ensure valid patterns still created when satisfaction IS actually damaged)

---

### F2: BLND-008 — Unavailable-Data Detection

**Root Cause:** synthesizeEvidence() creates patterns without checking if critical decision factors are explicitly marked unavailable.

**Current Code Location:** evidence-synthesis-engine.ts line 34

**Fix:**
```typescript
synthesizeEvidence(evidence: EvidenceItem[], caseInput?: any): SynthesizedEvidence {
  // NEW: Check if unavailableData includes critical decision factors
  const criticalGaps = this.checkCriticalDataGaps(caseInput?.unavailableData);
  if (criticalGaps.length > 0) {
    return {
      dimensionsExamined: [],
      dimensionsMissing: this.allDimensions,
      evidenceTraceRate: 0,
      criticalEvidencePresent: false,
      patterns: [],  // No confident patterns
      synthesisConfidence: 0.2,  // Low synthesis confidence
    };
  }

  const dimensionsExamined = this.findExaminedDimensions(evidence);
  // ... rest of function
}

// NEW helper method
private checkCriticalDataGaps(unavailableData?: string[]): string[] {
  if (!unavailableData || unavailableData.length === 0) return [];
  
  const criticalFactors = [
    "offer.*structure",
    "standalone.*forecast",
    "nrr.*durability",
    "investor.*value",
    "cohort.*analysis",
    "win.*loss"
  ];
  
  return unavailableData.filter(item => 
    criticalFactors.some(factor => new RegExp(factor, 'i').test(item))
  );
}
```

**Effort:** <30 LOC  
**Risk:** MEDIUM (must define "critical gaps" conservatively to avoid over-suppression)  
**Regression Risk:** MEDIUM (could suppress too aggressively if critical-factors list is too broad; requires focused testing on cases with partial data)

---

### F3: BLND-009 — Organizational Bottleneck Recognition

**Root Cause:** Pattern 4 (team_capability + operational_efficiency) doesn't specifically detect organizational concentration/key-person dependency as bottleneck signal.

**Current Code Location:** evidence-synthesis-engine.ts lines 114-121

**Fix:**
```typescript
// Pattern 4: Team/Execution Issues (team + operational)
if (dimensions.includes("team_capability")) {
  // NEW: Check for key-person/organizational concentration signals
  const hasKeyPersonConcentration = evidence.some(e =>
    /founder.*concentration|top-.*%.*revenue|key.*person.*depend|no.*successor|successor.*unknown/i.test(
      e.finding.toLowerCase()
    )
  );
  
  const pattern = this.checkPattern(
    evidence,
    ["team_capability", "operational_efficiency"],
    [DiagnosisType.OPERATIONAL_BOTTLENECK]
  );
  
  if (pattern) {
    // NEW: Boost pattern strength if key-person concentration detected
    if (hasKeyPersonConcentration) {
      pattern.patternStrength += 3;  // Weight higher: organizational risk
    }
    patterns.push(pattern);
  }
}
```

**Effort:** <15 LOC  
**Risk:** LOW (narrow pattern extension within existing Pattern 4 logic)  
**Regression Risk:** LOW (only boosts existing pattern; doesn't create new patterns)

---

### F4: BLND-010 — Pricing Pattern Creation

**Root Cause:** No pattern maps to STRATEGIC_PRICING_ERROR for under-monetization opportunities (flat-rate structure with pricing-power evidence).

**Current Code Location:** evidence-synthesis-engine.ts lines 65-201 (new pattern between Pattern 5 and Pattern 6)

**Fix:**
```typescript
// NEW Pattern 9: Pricing Power Opportunity (financial + retention)
if (
  dimensions.includes("financial_health") &&
  dimensions.includes("customer_retention")
) {
  const hasPricingPower = evidence.some(e =>
    /pricing.*power|depth.*lift|monetization.*gap|flat.*rate.*under|margin.*uplift|under.*monetized/i.test(
      e.finding.toLowerCase()
    )
  );
  const hasHealthyRetention = evidence.some(e =>
    /churn.*stable|nps.*high|repeat.*high|satisfaction.*intact/i.test(
      e.finding.toLowerCase()
    )
  );
  
  if (hasPricingPower && hasHealthyRetention) {
    // Pricing opportunity with healthy base = STRATEGIC_PRICING_ERROR (opportunity, not crisis)
    const pattern = this.checkPattern(
      evidence,
      ["financial_health", "customer_retention"],
      [DiagnosisType.STRATEGIC_PRICING_ERROR]
    );
    if (pattern) patterns.push(pattern);
  }
}
```

**Effort:** <30 LOC  
**Risk:** MEDIUM (new pattern creation; requires testing against pricing-failure cases to ensure no false positives)  
**Regression Risk:** MEDIUM (could incorrectly flag pricing issues in other contexts; needs focused testing on retention and financial cases)

---

### F5: ADV-011 — Unavailable-Data Check (Duplicate)

**Root Cause:** Same as F2; engine creates OPERATIONAL_BOTTLENECK despite missing cohort, win-loss, and pricing validation data.

**Implementation:** Identical to F2 (checkCriticalDataGaps helper already added in F2)

**Effort:** <5 LOC (reuses F2 logic)  
**Risk:** MEDIUM (same as F2; validates "must have seen cohort/win-loss before diagnosing bottleneck")  
**Regression Risk:** MEDIUM (see F2)

---

### F6: RW-016 — GTM Context Boost

**Root Cause:** Pattern 5 (GO_TO_MARKET_MISALIGNMENT) created but ranked below Pattern 4 (OPERATIONAL_BOTTLENECK) due to utilization metrics masking positioning-market-fit gap.

**Current Code Location:** evidence-synthesis-engine.ts lines 65-201 (enhance existing Pattern 5 logic)

**Fix:**
```typescript
// Pattern 5: GTM Issues (market + customer)
if (
  dimensions.includes("market_position") &&
  dimensions.includes("customer_retention")
) {
  const pattern = this.checkPattern(
    evidence,
    ["market_position", "customer_retention"],
    [DiagnosisType.GO_TO_MARKET_MISALIGNMENT]
  );
  
  if (pattern) {
    // NEW: Context boost for positioning-market-fit gap
    const hasPositioningMismatch = evidence.some(e =>
      /custom|premium|white.*glove|enterprise|differentiat/i.test(
        e.finding.toLowerCase()
      )
    );
    const hasWrongSegment = evidence.some(e =>
      /sme|smb|price.*sensit|simpler|low.*cost|mass.*market/i.test(
        e.finding.toLowerCase()
      )
    );
    
    if (hasPositioningMismatch && hasWrongSegment) {
      pattern.patternStrength += 2;  // Clear positioning-market fit gap
    }
    patterns.push(pattern);
  }
}
```

**Effort:** <25 LOC  
**Risk:** MEDIUM (context boost can interact with other diagnoses)  
**Regression Risk:** MEDIUM (could over-boost GTM patterns in demand/pricing cases; requires cross-case testing)

---

### F7: RW-022 — Cost-vs-Bottleneck

**Root Cause:** Pattern 4 creates OPERATIONAL_BOTTLENECK without checking if financial_health dimension shows cost pressure (which points to UNIT_ECONOMICS_BREAKDOWN instead).

**Current Code Location:** evidence-synthesis-engine.ts lines 114-121

**Fix:**
```typescript
// Pattern 4: Team/Execution Issues (team + operational)
if (dimensions.includes("team_capability")) {
  // NEW: Check FIRST: does financial_health show cost deterioration vs capacity constraint?
  const hasCostPressure = evidence.some(e =>
    e.dimension === "financial_health" && /cost.*up|expense.*up|margin.*down|labor.*cost.*increas/i.test(
      e.finding.toLowerCase()
    )
  );
  
  if (hasCostPressure) {
    // This is cost issue (UNIT_ECONOMICS_BREAKDOWN), not capacity issue
    // Let Pattern 1 handle it; suppress Pattern 4
    // (do not create pattern)
  } else {
    const pattern = this.checkPattern(
      evidence,
      ["team_capability", "operational_efficiency"],
      [DiagnosisType.OPERATIONAL_BOTTLENECK]
    );
    if (pattern) patterns.push(pattern);
  }
}
```

**Effort:** <20 LOC  
**Risk:** LOW (narrow guard clause; only affects Pattern 4 when financial_health shows cost pressure)  
**Regression Risk:** LOW (suppresses Pattern 4 only when cost pressure detected; spot-check OPERATIONAL_BOTTLENECK ground-truth cases unchanged)

---

### F8: PD-019 — Pattern Precedence

**Root Cause:** Pattern 4 (team + operational) checked without prerequisite check for Pattern 1 (financial + operational); when both dimensions present, cost structure issues should be detected first.

**Current Code Location:** evidence-synthesis-engine.ts lines 65-201

**Fix:**
```typescript
// Pattern 1: Unit Economics (financial + operational) — CHECK FIRST
if (
  dimensions.includes("financial_health") &&
  dimensions.includes("operational_efficiency")
) {
  const pattern1 = this.checkPattern(
    evidence,
    ["financial_health", "operational_efficiency"],
    [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN, DiagnosisType.OPERATIONAL_BOTTLENECK]
  );
  
  // NEW: Only add Pattern 1; suppress Pattern 4 if Pattern 1 strong
  if (pattern1 && pattern1.patternStrength > 5) {
    patterns.push(pattern1);
    skipPattern4 = true;  // Signal to suppress Pattern 4 below
  } else if (pattern1) {
    patterns.push(pattern1);
  }
}

// ... later, in Pattern 4 logic ...

// Pattern 4: Team/Execution Issues (team + operational)
if (dimensions.includes("team_capability") && !skipPattern4) {  // NEW: Check skipPattern4
  const pattern = this.checkPattern(
    evidence,
    ["team_capability", "operational_efficiency"],
    [DiagnosisType.OPERATIONAL_BOTTLENECK]
  );
  if (pattern) patterns.push(pattern);
}
```

**Effort:** <30 LOC  
**Risk:** MEDIUM (changes pattern precedence; requires testing to ensure reordering works correctly)  
**Regression Risk:** MEDIUM (reordering could affect other cases with both dimensions; test against UNIT_ECONOMICS_BREAKDOWN ground-truth cases RW-018, RW-020 and OPERATIONAL_BOTTLENECK cases)

---

### F9: SYN-013 — Pattern 8 Mapping

**Root Cause:** Pattern 5 (GTM) created from customer_retention dimension; Pattern 8 logic (quality + activation failure) doesn't trigger because matching logic is too strict.

**Current Code Location:** evidence-synthesis-engine.ts lines 179-199

**Fix:**
```typescript
// Pattern 8: Quality/reliability crisis signals
if (dimensions.includes("quality_delivery")) {
  const qualityEvidence = evidence.filter((e) => e.dimension === "quality_delivery");
  const retentionEvidence = evidence.filter((e) => e.dimension === "customer_retention");
  const operationalEvidence = evidence.filter((e) => e.dimension === "operational_efficiency");

  // NEW: Also detect post-sale activation failure
  const hasActivationFailure = qualityEvidence.some(e =>
    /ttfv|time.*first.*value|module.*adoption|feature.*adoption|post.*sale.*velocity/i.test(
      e.finding.toLowerCase()
    )
  );
  const hasChurnPostEngagement = retentionEvidence.some(e =>
    /churn.*post|post.*engagement|lifecycle.*cohort.*churn|churn.*differential/i.test(
      e.finding.toLowerCase()
    )
  );
  
  const hasReliabilityIssues = qualityEvidence.some((e) =>
    /uptime.*99\.2%|incident.*2-3|outage.*4.*hour|reliability|stability|support.*40%|support.*rising/.test(e.finding.toLowerCase())
  );
  const hasChurnWithQuality = retentionEvidence.some((e) =>
    /churn.*2%.*3%|churn.*rising|churn.*increasing/.test(e.finding.toLowerCase())
  );

  // Pattern 8 triggers on reliability OR activation failure
  if ((hasReliabilityIssues && hasChurnWithQuality) || (hasActivationFailure && hasChurnPostEngagement)) {
    const pattern = this.checkPattern(
      evidence,
      ["quality_delivery", "customer_retention"],
      [DiagnosisType.TRUST_QUALITY_CRISIS]
    );
    if (pattern) patterns.push(pattern);
  }
}
```

**Effort:** <20 LOC  
**Risk:** LOW (extends existing Pattern 8 logic; doesn't create new patterns)  
**Regression Risk:** LOW (only expands existing pattern conditions; spot-check quality/retention cases unchanged)

---

### F10: RW-024 — Uncertainty-Aware Diagnosis

**Root Cause:** Engine returns UNKNOWN (0% confidence) when mechanism is ambiguous (junior turnover vs concentration vs quality-mix), instead of providing probabilistic diagnosis with caveat.

**Current Code Location:** hypothesis-generator.ts (confidence calibration logic; spans lines 297-492)

**Fix:**
```typescript
// In HypothesisGenerator.generateHypotheses() method
if (topHypothesis && topHypothesis.confidence > 0) {
  // NEW: Check for mechanism uncertainty
  const hasUnknownMechanism = this.detectMechanismUncertainty(patterns, topHypothesis);
  
  if (hasUnknownMechanism && topHypothesis.confidence < MEDIUM_THRESHOLD) {
    // Instead of suppressing diagnosis entirely, reduce confidence to reflect uncertainty
    const minimumConfidence = 0.25;  // 25% minimum for probabilistic diagnosis
    topHypothesis.confidence = Math.max(minimumConfidence, topHypothesis.confidence * 0.7);
    topHypothesis.caveat = `Likely ${topHypothesis.diagnosisType} but mechanism (${this.getMechanismOptions(patterns)}) requires further analysis`;
  }
} else {
  // Return UNKNOWN as before
  return { diagnosisType: DiagnosisType.UNKNOWN, confidence: 0 };
}

// NEW helper method
private detectMechanismUncertainty(patterns: EvidencePattern[], hypothesis: Hypothesis): boolean {
  // Returns true if multiple competing mechanisms could explain the same pattern
  const competingCauses = patterns.filter(p =>
    p.potentialRootCauses.some(rc => rc === hypothesis.diagnosisType)
  ).length;
  
  return competingCauses > 1;
}

private getMechanismOptions(patterns: EvidencePattern[]): string {
  const causes = new Set<string>();
  patterns.forEach(p => {
    p.potentialRootCauses.forEach(rc => causes.add(rc));
  });
  return Array.from(causes).join(" or ");
}
```

**Effort:** <25 LOC  
**Risk:** LOW (lower confidence, not suppression; threshold calibration straightforward)  
**Regression Risk:** LOW (only affects cases where mechanism unclear; spot-check borderline cases to ensure minimum-confidence threshold appropriate)

---

## SUMMARY BY COMPLEXITY AND RISK

### LOW Complexity, LOW Regression Risk (Quick Wins)
- **F1: BLND-006** — Contradiction-suppression (20 LOC)
- **F3: BLND-009** — Organizational bottleneck (15 LOC)
- **F7: RW-022** — Cost-vs-bottleneck (20 LOC)
- **F9: SYN-013** — Pattern 8 mapping (20 LOC)
- **F10: RW-024** — Uncertainty-aware diagnosis (25 LOC)

**Total: 100 LOC, ~3-4 days**

### LOW Complexity, MEDIUM Regression Risk (Validation Needed)
- **F2: BLND-008** — Unavailable-data detection (30 LOC)
- **F5: ADV-011** — Unavailable-data check (5 LOC, reuses F2)

**Total: 35 LOC, ~2-3 days (depends on F2 testing)**

### MEDIUM Complexity, MEDIUM Regression Risk (Testing Intensive)
- **F4: BLND-010** — Pricing pattern creation (30 LOC)
- **F6: RW-016** — GTM context boost (25 LOC)
- **F8: PD-019** — Pattern precedence (30 LOC)

**Total: 85 LOC, ~4-5 days (includes regression testing)**

---

## IMPLEMENTATION ROADMAP

**Phase 1: Quick Wins (3-4 days)**
1. F1 (BLND-006): Implement + test vs BLND-007, ADV-012 (quality cases)
2. F3 (BLND-009): Implement + test vs bottleneck cases
3. F7 (RW-022): Implement + test vs other operational cases
4. F9 (SYN-013): Implement + test vs quality/retention cases
5. F10 (RW-024): Implement + threshold calibration

**Phase 2: Data Validation (2-3 days)**
6. F2 (BLND-008): Implement + define critical-gaps list
7. F5 (ADV-011): Reuse F2 logic + test

**Phase 3: Pattern Enhancements (4-5 days)**
8. F4 (BLND-010): Implement + test vs pricing cases
9. F6 (RW-016): Implement + test vs GTM/demand cases
10. F8 (PD-019): Implement + test vs unit-economics/bottleneck cases

**Full Implementation: ~2-3 weeks total**

---

## EXPECTED OUTCOMES

| Bundle | Fixes | Expected Accuracy | Effort | Risk |
|--------|-------|-------------------|--------|------|
| **Phase 1 Quick Wins** | F1, F3, F7, F9, F10 | 13/21 (61.9%) | 100 LOC, 3-4 days | LOW |
| **+ Phase 2 Data Validation** | +F2, F5 | 14/21 (66.7%) | +35 LOC, 2-3 days | MEDIUM |
| **+ Phase 3 Pattern Enhancements** | +F4, F6, F8 | 17/21 (81.0%) | +85 LOC, 4-5 days | MEDIUM |

**Minimum to Gate:** Phase 1 (13/21, +4 above requirement)  
**Recommended Target:** All 10 fixes (17/21, strong margin above gate)

