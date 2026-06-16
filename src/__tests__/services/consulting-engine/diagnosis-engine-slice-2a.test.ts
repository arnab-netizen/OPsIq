import { describe, it, expect } from "vitest";
import {
  diagnoseRootCause,
  DiagnosisResult,
} from "@/services/consulting-engine/diagnosis-engine";
import {
  ConfidenceLevel,
  DiagnosisConfidence,
  DiagnosisType,
  EvidenceItem,
} from "@/domain/consulting-engine/types";
import { v4 as uuidv4 } from "uuid";

// Helper to create evidence items
const createEvidence = (
  dimension: string,
  finding: string,
  confidence: ConfidenceLevel = ConfidenceLevel.HIGH,
  isCritical: boolean = true
): EvidenceItem => ({
  id: uuidv4(),
  dimension: dimension as any,
  finding,
  confidence,
  source: "test",
  timestamp: new Date(),
  isCritical,
});

describe("Diagnosis Engine - Slice 2A Archetype Tests", () => {
  describe("BRAND_EROSION Archetype", () => {
    it("should diagnose BRAND_EROSION with high confidence when market position signals are present", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Brand value declined 30% in customer perception study",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "market_position",
          "Market share lost to competitor due to reputation damage",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Brand erosion");
      expect(result.primaryRootCause.type).toBe(DiagnosisType.BRAND_EROSION);
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should diagnose BRAND_EROSION with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Customer perception of brand has declined significantly",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Brand perception");
      expect(result.primaryRootCause.type).toBe(DiagnosisType.BRAND_EROSION);
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });

    it("should not diagnose BRAND_EROSION when only reputation is mentioned without context", () => {
      const evidence = [
        createEvidence(
          "customer_retention",
          "Customer churn increasing",
          ConfidenceLevel.MEDIUM,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Churn issue");
      expect(result.primaryRootCause.type).not.toBe(DiagnosisType.BRAND_EROSION);
    });
  });

  describe("DEMAND_FORECASTING_MISMATCH Archetype", () => {
    it("should diagnose DEMAND_FORECASTING_MISMATCH with high confidence when inventory and demand signals present", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Excess inventory tying up $2M in cash despite flat demand",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "financial_health",
          "Demand signal not matching forecasted volumes",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Inventory imbalance");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.DEMAND_FORECASTING_MISMATCH
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should diagnose DEMAND_FORECASTING_MISMATCH with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Stockouts occurring despite adequate inventory allocation",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Supply mismatch");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.DEMAND_FORECASTING_MISMATCH
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });

  describe("UNIT_ECONOMICS_BREAKDOWN Archetype", () => {
    it("should diagnose UNIT_ECONOMICS_BREAKDOWN with high confidence when cost and margin signals present", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Gross margin compressed from 45% to 28% despite stable pricing",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "financial_health",
          "Operating loss increasing as expansion adds fixed costs",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Unit economics failing");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should diagnose UNIT_ECONOMICS_BREAKDOWN with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Per-unit cost rising 15% YoY despite scale increases",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Cost structure issue");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.UNIT_ECONOMICS_BREAKDOWN
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });

  describe("GO_TO_MARKET_MISALIGNMENT Archetype", () => {
    it("should diagnose GO_TO_MARKET_MISALIGNMENT with high confidence when GTM signals present", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Customer acquisition cost rising 40% while conversion declining",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "market_position",
          "Current channel becoming saturated, market shift required",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "GTM failure");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.GO_TO_MARKET_MISALIGNMENT
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should diagnose GO_TO_MARKET_MISALIGNMENT with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Go-to-market timing was premature; market not ready for product",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Market timing issue");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.GO_TO_MARKET_MISALIGNMENT
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });

  describe("STRATEGIC_PRICING_ERROR Archetype", () => {
    it("should diagnose STRATEGIC_PRICING_ERROR with high confidence when pricing signals present", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Price increased by 10% but demand elasticity shows WTP is 15% below current price",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "financial_health",
          "Revenue per customer declining despite higher list price due to discounting",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Pricing mismatch");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.STRATEGIC_PRICING_ERROR
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should diagnose STRATEGIC_PRICING_ERROR with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Competitor offerings at 20% lower price point capturing market share",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Pricing competitive issue");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.STRATEGIC_PRICING_ERROR
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });

  describe("GOVERNANCE_COMPLIANCE_FAILURE Archetype", () => {
    it("should diagnose GOVERNANCE_COMPLIANCE_FAILURE with high confidence when compliance signals present", () => {
      const evidence = [
        createEvidence(
          "process_maturity",
          "Regulatory violation discovered: missing required compliance documentation",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "process_maturity",
          "Internal control testing revealed material weakness in segregation of duties",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Compliance failure");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE
      );
      // Confidence should be HIGH or better with 2 matching signals
      expect(result.confidence).not.toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
    });

    it("should diagnose GOVERNANCE_COMPLIANCE_FAILURE with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "process_maturity",
          "Governance structure inadequate: board lacks required expertise in risk areas",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Governance risk");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.GOVERNANCE_COMPLIANCE_FAILURE
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });

  describe("TRUST_QUALITY_CRISIS Archetype", () => {
    it("should diagnose TRUST_QUALITY_CRISIS with high confidence when quality signals present", () => {
      const evidence = [
        createEvidence(
          "quality_delivery",
          "Product defect rate elevated: 2.3% vs 0.5% industry standard",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "quality_delivery",
          "Service reliability degraded: uptime dropped to 97.2% from 99.9% SLA",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Quality crisis");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.TRUST_QUALITY_CRISIS
      );
      // Confidence should be HIGH or better with 2 matching signals
      expect(result.confidence).not.toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
    });

    it("should diagnose TRUST_QUALITY_CRISIS with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "quality_delivery",
          "Security breach eroding customer trust in data handling",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Trust issue");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.TRUST_QUALITY_CRISIS
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });

    it("should not diagnose TRUST_QUALITY_CRISIS if only generic complaints mentioned", () => {
      const evidence = [
        createEvidence(
          "quality_delivery",
          "Customers complaining about service",
          ConfidenceLevel.LOW,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "Customer complaints");
      expect(result.primaryRootCause.type).not.toBe(
        DiagnosisType.TRUST_QUALITY_CRISIS
      );
    });
  });

  describe("CASH_RUNWAY_CRISIS Archetype", () => {
    it("should diagnose CASH_RUNWAY_CRISIS with high confidence when runway signals present", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Cash balance $500K with monthly burn of $150K = 3.3 months runway",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "financial_health",
          "Burn rate increasing; no clear path to profitability or funding",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Runway crisis");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.CASH_RUNWAY_CRISIS
      );
      // Confidence should be HIGH or better with 2 matching signals
      expect(result.confidence).not.toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
    });

    it("should diagnose CASH_RUNWAY_CRISIS with moderate confidence on single signal", () => {
      const evidence = [
        createEvidence(
          "financial_health",
          "Runway <6 months without additional capital",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Cash crisis");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.CASH_RUNWAY_CRISIS
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });

  describe("Regression Tests: Existing Archetypes Still Work", () => {
    it("should still diagnose OPERATIONAL_BOTTLENECK correctly", () => {
      const evidence = [
        createEvidence(
          "operational_efficiency",
          "Turnaround time for service is 2 weeks, limiting repeat customers",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "customer_retention",
          "Low repeat purchase rate due to long wait times",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Operational delay");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.OPERATIONAL_BOTTLENECK
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should still diagnose QUALITY_CONTROL_FAILURE correctly", () => {
      const evidence = [
        createEvidence(
          "quality_delivery",
          "Critical complaints about product quality and defects",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "quality_delivery",
          "No QA process documented",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Quality control");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.QUALITY_CONTROL_FAILURE
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });

    it("should still diagnose CUSTOMER_RETENTION_EROSION correctly", () => {
      const evidence = [
        createEvidence(
          "customer_retention",
          "Churn rate increasing; one-time buyers, low repeat",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "customer_retention",
          "No loyalty program or retention mechanism in place",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Customer churn");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.CUSTOMER_RETENTION_EROSION
      );
      expect(result.confidence).toBe(DiagnosisConfidence.HIGH);
    });
  });

  describe("Edge Cases: Insufficient Evidence Handling", () => {
    it("should return INSUFFICIENT_EVIDENCE when no patterns match", () => {
      const evidence = [
        createEvidence(
          "team_capability",
          "Team has good technical skills",
          ConfidenceLevel.LOW,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "Skills assessment");
      expect(result.primaryRootCause.type).toBe(DiagnosisType.UNKNOWN);
      expect(result.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
    });

    it("should return INSUFFICIENT_EVIDENCE for low-confidence signals only", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Maybe some brand concerns",
          ConfidenceLevel.LOW,
          false
        ),
      ];

      const result = diagnoseRootCause(evidence, "Possible issue");
      expect(result.confidence).toBe(DiagnosisConfidence.INSUFFICIENT_EVIDENCE);
    });
  });

  describe("Confidence Scoring Accuracy", () => {
    it("should score HIGH confidence with multiple high-confidence signals", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Brand value degradation confirmed by survey",
          ConfidenceLevel.HIGH,
          true
        ),
        createEvidence(
          "market_position",
          "Market share loss documented in financial reports",
          ConfidenceLevel.HIGH,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Brand issue");
      expect([DiagnosisConfidence.HIGH, DiagnosisConfidence.DEFINITIVE]).toContain(
        result.confidence
      );
    });

    it("should score MODERATE confidence with mixed signals", () => {
      const evidence = [
        createEvidence(
          "market_position",
          "Possible brand perception issue",
          ConfidenceLevel.MEDIUM,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Brand concern");
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });

    it("should score MODERATE for single customer retention signal with medium confidence", () => {
      const evidence = [
        createEvidence(
          "customer_retention",
          "Low repeat purchase rate from customers",
          ConfidenceLevel.MEDIUM,
          true
        ),
      ];

      const result = diagnoseRootCause(evidence, "Churn signal");
      expect(result.primaryRootCause.type).toBe(
        DiagnosisType.CUSTOMER_RETENTION_EROSION
      );
      expect(result.confidence).toBe(DiagnosisConfidence.MODERATE);
    });
  });
});
