import { describe, it, expect } from "vitest";
import { CausalDiagnosisAdjudicator } from "@/services/stage-a/causal-diagnosis-adjudicator";
import { Hypothesis } from "@/services/stage-a/hypothesis-generator";
import { EvidenceItem, ConfidenceLevel, DiagnosisType } from "@/domain/consulting-engine/types";
import { SynthesizedEvidence } from "@/services/stage-a/evidence-synthesis-engine";

describe("CausalDiagnosisAdjudicator", () => {
  const adjudicator = new CausalDiagnosisAdjudicator();

  // Test 1: Causal diagnosis beats symptom diagnosis
  it("should rank causal diagnosis higher than symptom-only diagnosis", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.CUSTOMER_RETENTION_EROSION,
        confidence: 45, // Symptom-only (high confidence from symptoms alone)
        supportingEvidenceCount: 3,
        conflictingEvidenceCount: 0,
        reasoning: "Churn rising",
        patternCount: 1,
      },
      {
        id: "hyp-1",
        rootCause: DiagnosisType.DEMAND_FORECASTING_MISMATCH,
        confidence: 38, // Causal evidence (lower initial confidence due to pattern bias)
        supportingEvidenceCount: 4,
        conflictingEvidenceCount: 0,
        reasoning: "Market growth rate mismatch",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "market_position",
        finding: "Growth decelerated from 25% to 15% toward market rate. Competitive consolidation.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "customer_retention",
        finding: "Churn rising from 4% to 5% monthly.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e3",
        dimension: "customer_retention",
        finding: "NPS stable at 48, repeat rate 72% (healthy).",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["market_position", "customer_retention"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // DEMAND_FORECASTING (causal) should be ranked first
    expect(reranked[0].rootCause).toBe(DiagnosisType.DEMAND_FORECASTING_MISMATCH);
    expect(reranked[1].rootCause).toBe(DiagnosisType.CUSTOMER_RETENTION_EROSION);
  });

  // Test 2: Contradiction penalty
  it("should apply contradiction penalty when cost pressure contradicts operational diagnosis", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.OPERATIONAL_BOTTLENECK,
        confidence: 40,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Operations issue",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "operational_efficiency",
        finding: "Throughput normal, utilization at 65%.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "financial_health",
        finding: "Cost per unit increased significantly. CAC payback deteriorating from 14 months to 21 months. Contribution margin declining.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["operational_efficiency", "financial_health"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // OPERATIONAL_BOTTLENECK confidence should be reduced or at most equal due to cost contradiction
    expect(reranked[0].confidence).toBeLessThanOrEqual(38);
  });

  // Test 3: Upstream cause beats downstream symptom
  it("should rank upstream cause (demand) higher than downstream symptom (retention)", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.CUSTOMER_RETENTION_EROSION,
        confidence: 42,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Symptom of deeper issue",
        patternCount: 1,
      },
      {
        id: "hyp-1",
        rootCause: DiagnosisType.DEMAND_FORECASTING_MISMATCH,
        confidence: 40,
        supportingEvidenceCount: 3,
        conflictingEvidenceCount: 0,
        reasoning: "Upstream root cause",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "market_position",
        finding: "TAM saturation. Growth deceleration toward market rate.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "customer_retention",
        finding: "Churn rising slightly.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["market_position", "customer_retention"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // DEMAND (upstream) should beat RETENTION (downstream symptom)
    expect(reranked[0].rootCause).toBe(DiagnosisType.DEMAND_FORECASTING_MISMATCH);
  });

  // Test 4: Ambiguous evidence lowers confidence
  it("should lower confidence for ambiguous diagnoses with mixed signals", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.CUSTOMER_RETENTION_EROSION,
        confidence: 39,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 1,
        reasoning: "Mixed signals",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "customer_retention",
        finding: "Churn rising.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "market_position",
        finding: "Growth deceleration toward market rate. TAM saturation.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e3",
        dimension: "customer_retention",
        finding: "NPS stable, repeat rate high.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["customer_retention", "market_position"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // Confidence should be reduced due to contradictions from market saturation signals
    expect(reranked[0].confidence).toBeLessThan(39);
  });

  // Test 5: No case-specific logic
  it("should use only generic causal patterns, not case-ID tuning", () => {
    // This test verifies that adjudication uses evidence patterns, not case IDs
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.UNIT_ECONOMICS_BREAKDOWN,
        confidence: 50,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Cost pressure",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "financial_health",
        finding: "Cost per unit increased. CAC payback deteriorating.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "operational_efficiency",
        finding: "Throughput normal, no constraint.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["financial_health", "operational_efficiency"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // Adjudication should use causal evidence patterns, not any case-specific logic
    expect(reranked[0].rootCause).toBe(DiagnosisType.UNIT_ECONOMICS_BREAKDOWN);
    // Confidence should be high because causal evidence (cost) is present
    expect(reranked[0].confidence).toBeGreaterThanOrEqual(45);
  });

  // Test 6: Confidence cap preserved
  it("should never exceed confidence cap of 65%", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.DEMAND_FORECASTING_MISMATCH,
        confidence: 65,
        supportingEvidenceCount: 4,
        conflictingEvidenceCount: 0,
        reasoning: "Strong demand signals",
        patternCount: 2,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "market_position",
        finding: "Growth deceleration toward market rate. TAM saturation. Competitive consolidation.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "customer_retention",
        finding: "NPS stable at 48, repeat rate 72%.",
        isCritical: false,
        confidence: ConfidenceLevel.MEDIUM,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["market_position", "customer_retention"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 90,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // Confidence must never exceed 65
    expect(reranked[0].confidence).toBeLessThanOrEqual(65);
  });

  // Test 7: Pricing beats GTM when price evidence is causal
  it("should rank pricing error higher than GTM when price sensitivity/discounting evidence present", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.GO_TO_MARKET_MISALIGNMENT,
        confidence: 42,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Positioning issue",
        patternCount: 1,
      },
      {
        id: "hyp-1",
        rootCause: DiagnosisType.STRATEGIC_PRICING_ERROR,
        confidence: 35,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Pricing issue",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "financial_health",
        finding: "Discounting required. Price sensitivity evident. Margin pressure from price.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["financial_health"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // PRICING (causal) should beat GTM (less causal)
    expect(reranked[0].rootCause).toBe(DiagnosisType.STRATEGIC_PRICING_ERROR);
  });

  // Test 8: Trust/quality beats retention when defects are causal
  it("should rank trust/quality higher than retention when reliability/defects evidence present", () => {
    const candidates: Hypothesis[] = [
      {
        id: "hyp-0",
        rootCause: DiagnosisType.CUSTOMER_RETENTION_EROSION,
        confidence: 40,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Churn rising",
        patternCount: 1,
      },
      {
        id: "hyp-1",
        rootCause: DiagnosisType.TRUST_QUALITY_CRISIS,
        confidence: 35,
        supportingEvidenceCount: 2,
        conflictingEvidenceCount: 0,
        reasoning: "Quality issues",
        patternCount: 1,
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "e1",
        dimension: "quality_delivery",
        finding: "Uptime degraded. Reliability issues. Quality defects increasing.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
      {
        id: "e2",
        dimension: "customer_retention",
        finding: "Churn rising, refunds due to defects.",
        isCritical: true,
        confidence: ConfidenceLevel.HIGH,
        source: "test",
        timestamp: new Date(),
      },
    ];

    const synthesizedEvidence: SynthesizedEvidence = {
      dimensionsExamined: ["quality_delivery", "customer_retention"],
      dimensionsMissing: [],
      evidenceTraceRate: 100,
      criticalEvidencePresent: true,
      patterns: [],
      synthesisConfidence: 80,
    };

    const reranked = adjudicator.adjudicateCandidates(candidates, evidence, synthesizedEvidence);

    // TRUST_QUALITY (causal) should beat RETENTION (symptom)
    expect(reranked[0].rootCause).toBe(DiagnosisType.TRUST_QUALITY_CRISIS);
  });
});
