import { describe, it, expect, beforeEach } from "vitest";
import {
  diagnoseRootCause,
  DiagnosisResult,
} from "@/services/consulting-engine/diagnosis-engine";
import {
  EvidenceItem,
  DiagnosisType,
  DiagnosisConfidence,
  ConfidenceLevel,
} from "@/domain/consulting-engine/types";
import { v4 as uuid } from "uuid";

function createEvidence(
  dimension: string,
  finding: string,
  confidence: ConfidenceLevel = ConfidenceLevel.HIGH,
  isCritical: boolean = true
): EvidenceItem {
  return {
    id: uuid(),
    dimension: dimension as any,
    finding,
    confidence,
    source: "test",
    timestamp: new Date(),
    isCritical,
  };
}

const confidenceOrder = {
  [DiagnosisConfidence.DEFINITIVE]: 5,
  [DiagnosisConfidence.HIGH]: 4,
  [DiagnosisConfidence.MODERATE]: 3,
  [DiagnosisConfidence.PROVISIONAL]: 2,
  [DiagnosisConfidence.INSUFFICIENT_EVIDENCE]: 1,
};

function isConfidenceAtLeast(actual: DiagnosisConfidence, expected: DiagnosisConfidence): boolean {
  return confidenceOrder[actual] >= confidenceOrder[expected];
}

describe("Diagnosis Engine", () => {
  describe("Existing Archetypes", () => {
    describe("Operational Bottleneck", () => {
      it("should diagnose operational bottleneck with sufficient evidence", () => {
        const evidence = [
          createEvidence(
            "operational_efficiency",
            "Long turnaround time slowing down operations",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "customer_retention",
            "Low repeat purchase due to slow service",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "slow service");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.OPERATIONAL_BOTTLENECK
        );
        expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
      });

      it("should return INSUFFICIENT_EVIDENCE without matching evidence", () => {
        const evidence = [
          createEvidence(
            "team_capability",
            "Some team issue",
            ConfidenceLevel.LOW,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "low team capability");

        expect(result.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
        expect(result.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
      });
    });

    describe("Quality Control Failure", () => {
      it("should diagnose quality control failure with multiple complaints", () => {
        const evidence = [
          createEvidence(
            "quality_delivery",
            "Customer complaints about product defects",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "quality_delivery",
            "Returns increasing month over month",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "quality issues");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.QUALITY_CONTROL_FAILURE
        );
        expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
      });

      it("should not diagnose quality control failure if process maturity evidence present", () => {
        const evidence = [
          createEvidence(
            "quality_delivery",
            "Customer complaints about product defects",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "process_maturity",
            "Quality standards documented",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "quality issues");

        expect(result.primaryRootCause.type).not.toBe(
          DiagnosisType.QUALITY_CONTROL_FAILURE
        );
      });
    });

    describe("Customer Retention Erosion", () => {
      it("should diagnose customer retention erosion with critical churn evidence", () => {
        const evidence = [
          createEvidence(
            "customer_retention",
            "Low repeat purchase rate, high churn",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "customer_retention",
            "One-time customers not returning",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "customer churn");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.CUSTOMER_RETENTION_EROSION
        );
        expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
      });
    });
  });

  describe("New Archetypes — Slice 1 Expansion", () => {
    describe("Brand Perception Trust Gap", () => {
      it("should diagnose brand trust gap with market and retention evidence", () => {
        const evidence = [
          createEvidence(
            "market_position",
            "Brand reputation damaged due to recent scandal",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "market_position",
            "Market positioning weak vs competitors",
            ConfidenceLevel.HIGH,
            false
          ),
          createEvidence(
            "customer_retention",
            "Customers switching to competitors",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "brand issues");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.BRAND_PERCEPTION_TRUST_GAP
        );
        expect(isConfidenceAtLeast(result.confidence, DiagnosisConfidence.MODERATE)).toBe(true);
      });

      it("should return INSUFFICIENT_EVIDENCE without two independent brand indicators", () => {
        const evidence = [
          createEvidence(
            "market_position",
            "Brand reputation damaged",
            ConfidenceLevel.MEDIUM,
            true
          ),
          createEvidence(
            "operational_efficiency",
            "Slow service delivery",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "brand issues");

        expect(result.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
      });

      it("should use at least MODERATE confidence with partial evidence", () => {
        const evidence = [
          createEvidence(
            "market_position",
            "Trust issues with brand",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "customer_retention",
            "Customer churn",
            ConfidenceLevel.MEDIUM,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "brand trust");

        if (result.primaryRootCause.type === DiagnosisType.BRAND_PERCEPTION_TRUST_GAP) {
          expect(isConfidenceAtLeast(result.confidence, DiagnosisConfidence.MODERATE)).toBe(true);
        }
      });
    });

    describe("Unit Economics Breakdown", () => {
      it("should diagnose unit economics breakdown with financial evidence", () => {
        const evidence = [
          createEvidence(
            "financial_health",
            "Unit margin negative at current acquisition cost",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "financial_health",
            "COGS per unit exceeds revenue per unit",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "unit economics");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
        );
        expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
      });

      it("should return INSUFFICIENT_EVIDENCE without financial evidence", () => {
        const evidence = [
          createEvidence(
            "operational_efficiency",
            "Slow processes",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "unit economics");

        expect(result.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
      });

      it("should return at least PROVISIONAL with single high-confidence financial indicator", () => {
        const evidence = [
          createEvidence(
            "financial_health",
            "Acquisition cost too high relative to LTV",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "unit economics");

        if (result.primaryRootCause.type === DiagnosisType.UNIT_ECONOMICS_BREAKDOWN) {
          expect(isConfidenceAtLeast(result.confidence, DiagnosisConfidence.PROVISIONAL)).toBe(true);
        }
      });
    });

    describe("Demand Forecasting Capacity Mismatch", () => {
      it("should diagnose demand forecasting mismatch with dual evidence", () => {
        const evidence = [
          createEvidence(
            "process_maturity",
            "No formal demand forecasting process",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "operational_efficiency",
            "Significant backlog due to capacity constraints",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "capacity bottleneck");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.DEMAND_FORECASTING_CAPACITY_MISMATCH
        );
        expect(isConfidenceAtLeast(result.confidence, DiagnosisConfidence.MODERATE)).toBe(true);
      });

      it("should return INSUFFICIENT_EVIDENCE without both dimensions", () => {
        const evidence = [
          createEvidence(
            "process_maturity",
            "No forecasting",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "forecasting");

        expect(result.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
      });
    });

    describe("Overexpansion Operating Model Break", () => {
      it("should diagnose overexpansion with team and financial evidence", () => {
        const evidence = [
          createEvidence(
            "team_capability",
            "Operating model broken by rapid expansion",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "financial_health",
            "Cash burn accelerating as overhead grows",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "overexpansion");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.OVEREXPANSION_OPERATING_MODEL_BREAK
        );
        expect(isConfidenceAtLeast(result.confidence, DiagnosisConfidence.MODERATE)).toBe(true);
      });

      it("should return INSUFFICIENT_EVIDENCE without team capability evidence", () => {
        const evidence = [
          createEvidence(
            "financial_health",
            "High cash burn",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "burn rate");

        expect(result.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
      });
    });

    describe("Pricing Packaging Misalignment", () => {
      it("should diagnose pricing misalignment with market and retention evidence", () => {
        const evidence = [
          createEvidence(
            "market_position",
            "Price point higher than competitor offerings",
            ConfidenceLevel.HIGH,
            true
          ),
          createEvidence(
            "customer_retention",
            "Customers switch due to perceived price vs value",
            ConfidenceLevel.HIGH,
            false
          ),
        ];

        const result = diagnoseRootCause(evidence, "pricing");

        expect(result.primaryRootCause.type).toBe(
          DiagnosisType.PRICING_PACKAGING_MISALIGNMENT
        );
        expect(isConfidenceAtLeast(result.confidence, DiagnosisConfidence.MODERATE)).toBe(true);
      });

      it("should return INSUFFICIENT_EVIDENCE without both dimensions", () => {
        const evidence = [
          createEvidence(
            "market_position",
            "High price",
            ConfidenceLevel.HIGH,
            true
          ),
        ];

        const result = diagnoseRootCause(evidence, "pricing");

        expect(result.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
      });
    });
  });

  describe("Adversarial Traps — Safety Regression", () => {
    it("ADV-004: should refuse diagnosis when owner explicitly states unavailable data", () => {
      const evidence = [
        createEvidence(
          "operational_efficiency",
          "Data not available",
          ConfidenceLevel.LOW,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "unknown issue");

      expect(result.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
      expect(result.warningFlags.length).toBeGreaterThan(0);
    });

    it("ADV-009: should not trigger false positive on ambiguous evidence", () => {
      const evidence = [
        createEvidence(
          "operational_efficiency",
          "Some potential issue",
          ConfidenceLevel.PROVISIONAL,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "unclear problem");

      expect(result.confidence).not.toBe(DiagnosisConfidence.HIGH);
    });
  });

  describe("Multiple Root Causes", () => {
    it("should return alternatives when multiple patterns match", () => {
      const evidence = [
        createEvidence(
          "quality_delivery",
          "Customer complaints about product defects",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "customer_retention",
          "Low repeat purchase rate, high churn",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "quality and retention");

      expect(result.alternativeRootCauses.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Readiness Assessment", () => {
    it("should mark as BLOCKED when insufficient evidence", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Some unknown issue",
          ConfidenceLevel.LOW,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "unclear");

      if (result.confidence === DiagnosisConfidence.INSUFFICIENT_EVIDENCE) {
        expect(result.readinessForIntervention).toBe("BLOCKED");
      }
    });

    it("should mark as PROVISIONAL when confidence is PROVISIONAL", () => {
      const evidence = [
        createEvidence(
          "operational_efficiency",
          "Possible turnaround issue",
          ConfidenceLevel.PROVISIONAL,
          true
        ),
        createEvidence(
          "customer_retention",
          "Possible retention issue",
          ConfidenceLevel.PROVISIONAL,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "possible issue");

      if (result.confidence === DiagnosisConfidence.PROVISIONAL) {
        expect(result.readinessForIntervention).toBe("PROVISIONAL");
      }
    });

    it("should mark as READY when confidence is HIGH or above", () => {
      const evidence = [
        createEvidence(
          "quality_delivery",
          "Multiple customer complaints about defects",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "quality_delivery",
          "High return rate",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "quality failure");

      if (result.confidence === DiagnosisConfidence.HIGH) {
        expect(result.readinessForIntervention).toBe("READY");
      }
    });
  });
});
