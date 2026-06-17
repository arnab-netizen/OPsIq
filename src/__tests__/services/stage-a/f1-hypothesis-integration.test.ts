import { describe, it, expect } from "vitest";
import { HypothesisGenerator } from "@/services/stage-a/hypothesis-generator";
import {
  DiagnosisType,
  EvidenceItem,
} from "@/domain/consulting-engine/types";
import { SynthesizedEvidence } from "@/services/stage-a/evidence-synthesis-engine";

describe("F1 Hypothesis Integration - Pattern Strength Visibility", () => {
  const generator = new HypothesisGenerator();

  // Test Case 1: Pattern suppression (strength 1) produces reduced keyword boost
  it("should reduce keyword boost when pattern strength is suppressed to 1", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "1",
        dimension: "quality_delivery",
        finding:
          "Trust breakdown in customer communication. Quality defects reported.",
        source: "test",
      },
      {
        id: "2",
        dimension: "quality_delivery",
        finding:
          "Uptime degraded to 98.5%, incidents increasing. Reliability issues.",
        source: "test",
      },
      {
        id: "3",
        dimension: "market_position",
        finding:
          "Expected growth deceleration toward market rate. Adoption slowing.",
        source: "test",
      },
    ];

    // Suppressed pattern: strength 1 (F1 content validation failed)
    const suppressedSynthesis: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-3",
          name: "Pattern 3",
          patternStrength: 1, // SUPPRESSED by F1
          potentialRootCauses: [DiagnosisType.TRUST_QUALITY_CRISIS],
          supportingItems: ["1", "2"],
          diagnosticValue: 0.1,
        },
      ],
      dimensionsExamined: ["quality_delivery", "market_position"],
      overallConfidenceScore: 0,
    };

    const hypotheses = generator.generateHypotheses(
      suppressedSynthesis,
      evidence
    );
    const qualityCrisisHyp = hypotheses.find(
      (h) => h.rootCause === DiagnosisType.TRUST_QUALITY_CRISIS
    );

    expect(qualityCrisisHyp).toBeDefined();
    // With strength 1, keyword boost is 5 * 0.1 = 0.5 (heavily reduced)
    // Base confidence + 0.5 should be much lower than without the suppression
    expect(qualityCrisisHyp!.confidence).toBeLessThan(40);
  });

  // Test Case 2: Strong pattern (strength 8) preserves normal keyword boost
  it("should preserve near-normal keyword boost when pattern strength is strong", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "1",
        dimension: "quality_delivery",
        finding:
          "Trust breakdown confirmed. Quality defects increasing. Reputation damage.",
        source: "test",
      },
      {
        id: "2",
        dimension: "quality_delivery",
        finding:
          "Uptime degraded to 98.5%. Incidents doubled. Reliability issues severe.",
        source: "test",
      },
    ];

    // Strong pattern: strength 8 (all validators passed)
    const strongSynthesis: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-strong",
          name: "Quality Crisis Pattern",
          patternStrength: 8, // STRONG pattern
          potentialRootCauses: [DiagnosisType.TRUST_QUALITY_CRISIS],
          supportingItems: ["1", "2"],
          diagnosticValue: 0.9,
        },
      ],
      dimensionsExamined: ["quality_delivery"],
      overallConfidenceScore: 0,
    };

    const hypotheses = generator.generateHypotheses(strongSynthesis, evidence);
    const qualityCrisisHyp = hypotheses.find(
      (h) => h.rootCause === DiagnosisType.TRUST_QUALITY_CRISIS
    );

    expect(qualityCrisisHyp).toBeDefined();
    // With strength 8, keyword boost is 5 * 0.8 = 4 (nearly normal)
    // Should be reasonable confidence
    expect(qualityCrisisHyp!.confidence).toBeGreaterThan(35);
  });

  // Test Case 3: Pattern strength 1 vs strength 8 changes diagnosis ranking
  it("BLND-006 scenario: suppression affects diagnosis ranking", () => {
    // Simulate BLND-006 case with conflicting patterns
    const evidence: EvidenceItem[] = [
      {
        id: "1",
        dimension: "quality_delivery",
        finding:
          "Uptime degraded. Quality issues reported. Trust breakdown in customers.",
        source: "test",
      },
      {
        id: "2",
        dimension: "market_position",
        finding:
          "Expected growth deceleration toward market rate. Acquisition declining.",
        source: "test",
      },
      {
        id: "3",
        dimension: "customer_retention",
        finding: "NPS stable at 48. Repeat rate high. Satisfaction intact.",
        source: "test",
      },
    ];

    // With F1 suppression: Pattern 3 (Quality) at strength 1, Pattern 6 (Demand) at strength 8
    const synthesisWithSuppression: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-3",
          name: "Pattern 3 - Quality",
          patternStrength: 1, // SUPPRESSED
          potentialRootCauses: [DiagnosisType.TRUST_QUALITY_CRISIS],
          supportingItems: ["1"],
          diagnosticValue: 0.1,
        },
        {
          id: "pattern-6",
          name: "Pattern 6 - Demand",
          patternStrength: 8, // STRONG
          potentialRootCauses: [DiagnosisType.DEMAND_FORECASTING_MISMATCH],
          supportingItems: ["2"],
          diagnosticValue: 0.85,
        },
      ],
      dimensionsExamined: [
        "quality_delivery",
        "market_position",
        "customer_retention",
      ],
      overallConfidenceScore: 0,
    };

    const hypotheses = generator.generateHypotheses(
      synthesisWithSuppression,
      evidence
    );

    // With F1 fix, Demand should rank higher than Quality Crisis
    const topDiagnosis = hypotheses[0];
    expect(topDiagnosis.rootCause).toBe(
      DiagnosisType.DEMAND_FORECASTING_MISMATCH
    );

    // Quality Crisis should be lower due to suppression
    const qualityCrisisHyp = hypotheses.find(
      (h) => h.rootCause === DiagnosisType.TRUST_QUALITY_CRISIS
    );
    expect(qualityCrisisHyp).toBeDefined();
    expect(qualityCrisisHyp!.confidence).toBeLessThan(topDiagnosis.confidence);
  });

  // Test Case 4: Multiplier is bounded between 0.1 and 1.0
  it("should bound strength multiplier to 0.1-1.0 range", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "1",
        dimension: "financial_health",
        finding: "CAC rising. Unit economics breakdown.",
        source: "test",
      },
    ];

    // Test minimum strength (1)
    const minSynthesis: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-min",
          name: "Min Pattern",
          patternStrength: 1,
          potentialRootCauses: [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN],
          supportingItems: ["1"],
          diagnosticValue: 0.1,
        },
      ],
      dimensionsExamined: ["financial_health"],
      overallConfidenceScore: 0,
    };

    const minHypotheses = generator.generateHypotheses(minSynthesis, evidence);
    const minConfidence = minHypotheses.find(
      (h) => h.rootCause === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
    )?.confidence;

    // Test maximum strength (10)
    const maxSynthesis: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-max",
          name: "Max Pattern",
          patternStrength: 10,
          potentialRootCauses: [DiagnosisType.UNIT_ECONOMICS_BREAKDOWN],
          supportingItems: ["1"],
          diagnosticValue: 0.95,
        },
      ],
      dimensionsExamined: ["financial_health"],
      overallConfidenceScore: 0,
    };

    const maxHypotheses = generator.generateHypotheses(maxSynthesis, evidence);
    const maxConfidence = maxHypotheses.find(
      (h) => h.rootCause === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
    )?.confidence;

    // Max should be noticeably higher than min (10x boost difference)
    expect(maxConfidence!).toBeGreaterThan(minConfidence!);
    expect(maxConfidence! - minConfidence!).toBeGreaterThan(5);
  });

  // Test Case 5: Confidence cap is never exceeded (≤65%)
  it("should never exceed 65% confidence cap", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "1",
        dimension: "financial_health",
        finding:
          "Cash runway critical. Burn rate unsustainable. Fundraising needed.",
        source: "test",
      },
      {
        id: "2",
        dimension: "financial_health",
        finding:
          "Liquidity crisis. Solvency at risk. Cash position critical.",
        source: "test",
      },
    ];

    const synthesis: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-crisis",
          name: "Cash Crisis",
          patternStrength: 10,
          potentialRootCauses: [DiagnosisType.CASH_RUNWAY_CRISIS],
          supportingItems: ["1", "2"],
          diagnosticValue: 1.0,
        },
      ],
      dimensionsExamined: ["financial_health"],
      overallConfidenceScore: 0,
    };

    const hypotheses = generator.generateHypotheses(synthesis, evidence);
    const crisisHyp = hypotheses.find(
      (h) => h.rootCause === DiagnosisType.CASH_RUNWAY_CRISIS
    );

    expect(crisisHyp).toBeDefined();
    expect(crisisHyp!.confidence).toBeLessThanOrEqual(65);
  });

  // Test Case 6: Multiple patterns average their strength correctly
  it("should average strength across multiple patterns", () => {
    const evidence: EvidenceItem[] = [
      {
        id: "1",
        dimension: "quality_delivery",
        finding: "Uptime degraded. Quality defects.",
        source: "test",
      },
      {
        id: "2",
        dimension: "customer_retention",
        finding: "Churn rising. Cohort decay observed.",
        source: "test",
      },
    ];

    // Two patterns: one weak (2), one strong (8) → average 5
    const mixedSynthesis: SynthesizedEvidence = {
      patterns: [
        {
          id: "pattern-weak",
          name: "Weak Pattern",
          patternStrength: 2,
          potentialRootCauses: [
            DiagnosisType.TRUST_QUALITY_CRISIS,
            DiagnosisType.CUSTOMER_RETENTION_EROSION,
          ],
          supportingItems: ["1"],
          diagnosticValue: 0.2,
        },
        {
          id: "pattern-strong",
          name: "Strong Pattern",
          patternStrength: 8,
          potentialRootCauses: [
            DiagnosisType.TRUST_QUALITY_CRISIS,
            DiagnosisType.CUSTOMER_RETENTION_EROSION,
          ],
          supportingItems: ["2"],
          diagnosticValue: 0.8,
        },
      ],
      dimensionsExamined: ["quality_delivery", "customer_retention"],
      overallConfidenceScore: 0,
    };

    const hypotheses = generator.generateHypotheses(mixedSynthesis, evidence);
    const trustHyp = hypotheses.find(
      (h) => h.rootCause === DiagnosisType.TRUST_QUALITY_CRISIS
    );

    expect(trustHyp).toBeDefined();
    // With average strength 5, multiplier = 0.5
    // Boosts should be half of normal (e.g., 5 * 0.5 = 2.5)
    expect(trustHyp!.confidence).toBeGreaterThan(20);
    expect(trustHyp!.confidence).toBeLessThan(50);
  });
});
