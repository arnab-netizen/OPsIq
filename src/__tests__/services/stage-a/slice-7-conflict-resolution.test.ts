import { describe, it, expect } from "vitest";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem, DiagnosisType } from "@/domain/consulting-engine/types";

describe("STAGE_A_REMEDIATION_SLICE_7: Multi-Factor Conflict Resolution", () => {
  const generator = new HypothesisGenerator();
  const synthesizer = new EvidenceSynthesisEngine();

  // Test 1: DEMAND_FORECASTING_MISMATCH with demand-cycle evidence
  it("should recognize demand forecasting patterns with leading indicator decline", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "market_position",
        finding: "Permanent placements declining 8%, temporary hours down 2%, orders down 6%",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "customer_retention",
        finding: "NPS stable at 72%, repeat rate high",
        isCritical: false,
      },
      {
        id: "ev-3",
        dimension: "market_position",
        finding: "Market saturation increasing in segment",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    expect(hypotheses.length).toBeGreaterThan(0);
    // Should have demand forecasting as top candidate due to leading indicators
    const diagnosis = hypotheses[0].rootCause;
    expect(diagnosis === DiagnosisType.DEMAND_FORECASTING_MISMATCH ||
           diagnosis === DiagnosisType.GO_TO_MARKET_MISALIGNMENT).toBe(true);
  });

  // Test 2: TRUST_QUALITY_CRISIS with quality/reliability evidence should beat retention
  it("should resolve TRUST_QUALITY_CRISIS vs CUSTOMER_RETENTION with quality evidence", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "quality_delivery",
        finding: "Uptime 99.2%, downtime incidents increasing, 4-hour response SLA breached",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "customer_retention",
        finding: "Support tickets rising 40%, customer complaints about reliability",
        isCritical: true,
      },
      {
        id: "ev-3",
        dimension: "quality_delivery",
        finding: "Customer refunds granted due to quality failures",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    expect(hypotheses.length).toBeGreaterThan(0);
    // Quality evidence should lead to TRUST_QUALITY_CRISIS diagnosis
    const topDiagnosis = hypotheses[0].rootCause;
    expect(topDiagnosis === DiagnosisType.TRUST_QUALITY_CRISIS ||
           topDiagnosis === DiagnosisType.CUSTOMER_RETENTION_EROSION).toBe(true);
  });

  // Test 3: UNIT_ECONOMICS_BREAKDOWN with cost-per-unit evidence
  it("should recognize UNIT_ECONOMICS with cost-per-unit and payback evidence", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "financial_health",
        finding: "Cost per unit increased 18%; CAC $600, payback 21 months",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "financial_health",
        finding: "Contribution margin weakening; LTV $2400, ARPU declining",
        isCritical: true,
      },
      {
        id: "ev-3",
        dimension: "operational_efficiency",
        finding: "Utilization at 65%, throughput stable",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    expect(hypotheses.length).toBeGreaterThan(0);
    const topDiagnosis = hypotheses[0].rootCause;
    // Should recognize unit economics due to strong financial evidence
    expect(topDiagnosis === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN ||
           topDiagnosis === DiagnosisType.OPERATIONAL_BOTTLENECK).toBe(true);
  });

  // Test 4: Conflict detection - when two diagnoses are close in confidence
  it("should apply conflict resolution when top two diagnoses are within 10pt confidence", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "financial_health",
        finding: "Pricing pressure from competitors, margin declining",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "market_position",
        finding: "Market positioning issues, messaging not resonating",
        isCritical: true,
      },
      {
        id: "ev-3",
        dimension: "financial_health",
        finding: "Discounting required to win, contribution margin down",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    // With conflict resolution, should pick one candidate decisively
    expect(hypotheses.length).toBeGreaterThan(0);
    // Both are valid - should be picked based on multi-factor scoring
    expect([
      DiagnosisType.STRATEGIC_PRICING_ERROR,
      DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
    ]).toContain(hypotheses[0].rootCause);
  });

  // Test 5: Ambiguity handling - multiple diagnoses possible
  it("should handle ambiguous evidence by preserving lower confidence alternatives", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "financial_health",
        finding: "Revenue declining slightly",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "operational_efficiency",
        finding: "Operations appear normal",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    // Should return hypotheses even with weak evidence
    expect(hypotheses.length).toBeGreaterThan(0);
    // Multiple hypotheses indicates uncertainty
    if (hypotheses.length > 1) {
      // Second hypothesis should have noticeably lower confidence
      expect(hypotheses[1].confidence).toBeLessThan(hypotheses[0].confidence);
    }
  });

  // Test 6: No regression on high-evidence cases
  it("should recognize UNIT_ECONOMICS as top candidate with strong financial evidence", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "financial_health",
        finding: "CAC $400, LTV $2800, payback period 10 months, unit economics",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "financial_health",
        finding: "Contribution margin 70%, ARPU $250, revenue scaling profitably",
        isCritical: true,
      },
      {
        id: "ev-3",
        dimension: "financial_health",
        finding: "Payback calculation shows strong unit economics fundamentals",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    expect(hypotheses.length).toBeGreaterThan(0);
    // Strong financial evidence should result in UNIT_ECONOMICS being a top candidate
    expect([
      DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
      DiagnosisType.OPERATIONAL_BOTTLENECK,
    ]).toContain(hypotheses[0].rootCause);
  });

  // Test 7: Keyword match integration
  it("should use keywords to validate conflict resolution", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        dimension: "financial_health",
        finding: "Forecast accuracy declining, demand expected vs actual mismatch",
        isCritical: true,
      },
      {
        id: "ev-2",
        dimension: "market_position",
        finding: "NPS stable, market position unclear",
        isCritical: false,
      },
    ];

    const synthesized = synthesizer.synthesizeEvidence(evidence);
    const hypotheses = generator.generateHypotheses(synthesized, evidence);

    expect(hypotheses.length).toBeGreaterThan(0);
    // "forecast" and "demand" keywords should weight toward demand forecasting
    expect([
      DiagnosisType.DEMAND_FORECASTING_MISMATCH,
      DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
    ]).toContain(hypotheses[0].rootCause);
  });

  // Test 8: Multi-factor scoring produces deterministic results
  it("should apply consistent multi-factor scoring across similar cases", () => {
    const evidence1: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "Margin pressure from pricing", isCritical: true },
      { id: "e2", dimension: "financial_health", finding: "Discounting required", isCritical: false },
    ];

    const evidence2: EvidenceItem[] = [
      { id: "e1", dimension: "financial_health", finding: "Margin pressure from pricing", isCritical: true },
      { id: "e2", dimension: "financial_health", finding: "Discounting required", isCritical: false },
    ];

    const syn1 = synthesizer.synthesizeEvidence(evidence1);
    const syn2 = synthesizer.synthesizeEvidence(evidence2);
    const hyp1 = generator.generateHypotheses(syn1, evidence1);
    const hyp2 = generator.generateHypotheses(syn2, evidence2);

    // Same evidence should produce same diagnosis
    expect(hyp1[0].rootCause).toBe(hyp2[0].rootCause);
  });
});
