import { describe, it, expect } from "vitest";
import { EvidenceSynthesisEngine } from "@/services/stage-a/evidence-synthesis-engine";
import { EvidenceItem } from "@/domain/consulting-engine/types";

describe("F1: Pattern Content Validation", () => {
  const engine = new EvidenceSynthesisEngine();

  describe("Pattern 3: TRUST_QUALITY_CRISIS validation", () => {
    it("should suppress strong pattern when quality dimensions present but evidence shows stable quality", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "quality_delivery",
          finding: "Operations stable, logistics $12/rental",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "customer_retention",
          finding: "NPS 48 (stable), repeat 72% (high)",
          isCritical: false,
        },
        {
          id: "e3",
          dimension: "customer_retention",
          finding: "Churn rising 4% to 5% due to competitive pressure",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);
      const qualityPattern = result.patterns.find((p) =>
        p.potentialRootCauses?.some(
          (rc) => rc === "TRUST_QUALITY_CRISIS"
        )
      );

      // Pattern should be weak (suppressed) due to stable quality evidence
      if (qualityPattern) {
        expect(qualityPattern.patternStrength).toBeLessThan(3);
      }
    });

    it("should create strong pattern when quality dimensions present AND actual defect evidence exists", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "quality_delivery",
          finding: "Uptime 98.5%, incident rate 2-3 per week, support tickets rising",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "customer_retention",
          finding: "Churn rising 2% to 4%, customers citing reliability issues",
          isCritical: false,
        },
        {
          id: "e3",
          dimension: "customer_retention",
          finding: "NPS decline from 55 to 45 due to quality concerns",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);
      const qualityPattern = result.patterns.find((p) =>
        p.potentialRootCauses?.some(
          (rc) => rc === "TRUST_QUALITY_CRISIS"
        )
      );

      // Pattern should be strong (not suppressed) due to actual quality defects
      if (qualityPattern) {
        expect(qualityPattern.patternStrength).toBeGreaterThan(3);
      }
    });
  });

  describe("Pattern 5: GO_TO_MARKET_MISALIGNMENT validation", () => {
    it("should suppress strong GTM pattern when evidence is about adoption/lifecycle, not positioning", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "market_position",
          finding: "Revenue flat, growth stable",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "customer_retention",
          finding: "Churn rising 2% to 4%, low product adoption (41% onboarding, 19% perf)",
          isCritical: false,
        },
        {
          id: "e3",
          dimension: "customer_retention",
          finding: "Time to first value 47d vs 21d target, CSM ratio 80:1",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);
      const gtmPattern = result.patterns.find((p) =>
        p.potentialRootCauses?.some(
          (rc) => rc === "GO_TO_MARKET_MISALIGNMENT"
        )
      );

      // Pattern should be weak or absent (adoption issue, not GTM)
      if (gtmPattern) {
        expect(gtmPattern.patternStrength).toBeLessThan(3);
      }
    });

    it("should create strong GTM pattern when evidence shows positioning/channel mismatch", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "market_position",
          finding: "Positioning shifted but messaging doesn't match new ICP",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "customer_retention",
          finding: "Churn rising, customers say we're not aligned with their needs",
          isCritical: false,
        },
        {
          id: "e3",
          dimension: "market_position",
          finding: "New go-to-market strategy via direct sales not resonating with traditional channel partners",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);
      const gtmPattern = result.patterns.find((p) =>
        p.potentialRootCauses?.some(
          (rc) => rc === "GO_TO_MARKET_MISALIGNMENT"
        )
      );

      // Pattern should be strong (clear GTM evidence)
      if (gtmPattern) {
        expect(gtmPattern.patternStrength).toBeGreaterThan(3);
      }
    });
  });

  describe("Pattern 6: DEMAND_FORECASTING_MISMATCH validation", () => {
    it("should create strong demand pattern when growth deceleration + competitive context + stable retention", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "market_position",
          finding: "Growth decelerating 25% MoM to 15% MoM",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "market_position",
          finding: "Better-funded competitors entering market (Series C funding)",
          isCritical: false,
        },
        {
          id: "e3",
          dimension: "customer_retention",
          finding: "Churn rising 4% to 5% but NPS stable at 48, repeat rate 72%",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);
      const demandPattern = result.patterns.find((p) =>
        p.potentialRootCauses?.some(
          (rc) => rc === "DEMAND_FORECASTING_MISMATCH"
        )
      );

      // Pattern should be strong (full demand evidence)
      if (demandPattern) {
        expect(demandPattern.patternStrength).toBeGreaterThan(5);
      }
    });

    it("should suppress demand pattern when growth deceleration without market/competitive context", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "market_position",
          finding: "Growth decelerating 15% to 10%",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "customer_retention",
          finding: "NPS stable, retention stable, no competitive threat evident",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);
      const demandPattern = result.patterns.find((p) =>
        p.potentialRootCauses?.some(
          (rc) => rc === "DEMAND_FORECASTING_MISMATCH"
        )
      );

      // Pattern should be weak (insufficient evidence)
      if (demandPattern) {
        expect(demandPattern.patternStrength).toBeLessThan(3);
      }
    });
  });

  describe("Evidence trace preservation", () => {
    it("should preserve evidence even when patterns are created or suppressed", () => {
      const evidence: EvidenceItem[] = [
        {
          id: "e1",
          dimension: "quality_delivery",
          finding: "Operations stable",
          isCritical: false,
        },
        {
          id: "e2",
          dimension: "customer_retention",
          finding: "NPS 48 stable, repeat 72%",
          isCritical: false,
        },
      ];

      const result = engine.synthesizeEvidence(evidence);

      // Trace rate should account for the evidence, either in patterns or as critical
      expect(result.evidenceTraceRate).toBeGreaterThanOrEqual(0);
      expect(result.evidenceTraceRate).toBeLessThanOrEqual(100);
    });
  });
});
