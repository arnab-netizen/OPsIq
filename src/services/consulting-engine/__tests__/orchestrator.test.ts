import { describe, it, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { runConsultingEngine } from "../orchestrator";
import type { ConsultingEngineInput } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";

const engagementId = uuidv4();

describe("Consulting Engine Orchestrator", () => {
  describe("Case 1: Laundry Store - Operational Bottleneck", () => {
    it("should diagnose operational bottleneck as primary root cause", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Low revenue - laundry store has declining repeat customers",
        evidence: [
          // Operational efficiency (critical evidence)
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "High turnaround time: 7-10 days vs competitor 2-3 days",
            confidence: ConfidenceLevel.HIGH,
            source: "Customer interviews",
            timestamp: new Date(),
            isCritical: true,
            supportingData: { avgTurnaroundDays: 8.5, competitorDays: 2.5 },
          },
          // Customer retention (critical evidence)
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "Low repeat customers: only 20% of customers use service twice",
            confidence: ConfidenceLevel.HIGH,
            source: "Transaction analysis",
            timestamp: new Date(),
            isCritical: true,
            supportingData: { repeatRate: 0.2, industryAverage: 0.45 },
          },
          // Quality delivery (complaints)
          {
            id: uuidv4(),
            dimension: "quality_delivery",
            finding: "High complaints: 15% of orders receive complaint",
            confidence: ConfidenceLevel.MEDIUM,
            source: "Complaint log review",
            timestamp: new Date(),
            isCritical: true,
            supportingData: { complaintRate: 0.15 },
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);

      expect(output.status).toBe("SUCCESS");
      expect(output.decisionMemo.rootCauseDiagnosis.type).toBe(
        "operational_bottleneck"
      );
      expect(output.decisionMemo.diagnosisConfidence).toBe("HIGH");

      // Should recommend containment, stabilization, and structural repair
      const classes = output.decisionMemo.recommendedInterventions.map(
        (i) => i.intervention.class
      );
      expect(classes).toContain("CONTAINMENT");
      expect(classes).toContain("STABILIZATION");
      expect(classes).toContain("STRUCTURAL_REPAIR");

      // First intervention should be containment (quick relief)
      expect(output.decisionMemo.recommendedInterventions[0].intervention.class).toBe(
        "CONTAINMENT"
      );
    });

    it("should include fallback plans for all interventions", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Low revenue from high turnaround time",
        evidence: [
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "High turnaround time limiting capacity",
            confidence: ConfidenceLevel.HIGH,
            source: "Process observation",
            timestamp: new Date(),
            isCritical: true,
          },
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "Customers defecting to faster competitors",
            confidence: ConfidenceLevel.HIGH,
            source: "Customer exit interviews",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "CRITICAL",
        },
      };

      const output = await runConsultingEngine(input);

      for (const item of output.decisionMemo.recommendedInterventions) {
        expect(item.intervention.fallbackPlan).toBeTruthy();
        expect(item.intervention.fallbackPlan.length).toBeGreaterThan(10);
      }
    });

    it("should rank interventions by priority score", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Low revenue",
        evidence: [
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "High turnaround time",
            confidence: ConfidenceLevel.HIGH,
            source: "Observation",
            timestamp: new Date(),
            isCritical: true,
          },
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "Low repeat rate",
            confidence: ConfidenceLevel.HIGH,
            source: "Data",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);
      const interventions = output.decisionMemo.recommendedInterventions;

      // Verify correct sequencing: CONTAINMENT → STABILIZATION → STRUCTURAL_REPAIR
      const classSequence = ["CONTAINMENT", "STABILIZATION", "STRUCTURAL_REPAIR"];
      const interventionClasses = interventions.map((i) => i.intervention.class);

      for (let i = 1; i < interventionClasses.length; i++) {
        const prevIndex = classSequence.indexOf(interventionClasses[i - 1]);
        const currIndex = classSequence.indexOf(interventionClasses[i]);
        expect(prevIndex).toBeLessThanOrEqual(currIndex);
      }
    });
  });

  describe("Case 2: Conflicting Evidence", () => {
    it("should handle quality issues alongside efficiency issues", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Revenue declining: customers leaving",
        evidence: [
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "Slow turnaround time",
            confidence: ConfidenceLevel.MEDIUM,
            source: "Process timing",
            timestamp: new Date(),
            isCritical: false,
          },
          {
            id: uuidv4(),
            dimension: "quality_delivery",
            finding: "High complaint rate from defects",
            confidence: ConfidenceLevel.HIGH,
            source: "Complaint analysis",
            timestamp: new Date(),
            isCritical: true,
          },
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "One-time customer ratio 80%",
            confidence: ConfidenceLevel.HIGH,
            source: "Customer database",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);

      // Should identify quality as potential root cause
      expect(
        output.decisionMemo.rootCauseDiagnosis.type.toLowerCase()
      ).toMatch(/quality|retention/);

      // Should still provide actionable interventions
      expect(output.decisionMemo.recommendedInterventions.length).toBeGreaterThan(0);
    });
  });

  describe("Case 3: Insufficient Evidence", () => {
    it("should mark diagnosis as INSUFFICIENT_EVIDENCE when coverage is weak", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Revenue declining",
        evidence: [
          {
            id: uuidv4(),
            dimension: "financial_health",
            finding: "Revenue down 20% YoY",
            confidence: ConfidenceLevel.HIGH,
            source: "Financials",
            timestamp: new Date(),
            isCritical: true,
          },
          // Only one dimension; others missing
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "CRITICAL",
        },
      };

      const output = await runConsultingEngine(input);

      expect(output.status).toMatch(/PROVISIONAL|INSUFFICIENT_EVIDENCE/);
      expect(output.warnings.length).toBeGreaterThan(0);
    });

    it("should provide provisional diagnosis with recommendations for further investigation", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Business struggling",
        evidence: [
          {
            id: uuidv4(),
            dimension: "financial_health",
            finding: "Cash burn increasing",
            confidence: ConfidenceLevel.MEDIUM,
            source: "CFO report",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "CRITICAL",
        },
      };

      const output = await runConsultingEngine(input);

      // Should still generate interventions
      expect(output.decisionMemo.recommendedInterventions.length).toBeGreaterThan(0);

      // But should include investigation recommendations
      const hasInvestigationIntervention = output.decisionMemo.recommendedInterventions.some(
        (i) => i.intervention.title.toLowerCase().includes("investigat")
      );
      expect(hasInvestigationIntervention).toBe(true);
    });
  });

  describe("Case 4: Low Execution Capacity", () => {
    it("should recommend shorter, simpler interventions for micro businesses", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Revenue declining",
        evidence: [
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "High turnaround time",
            confidence: ConfidenceLevel.HIGH,
            source: "Observation",
            timestamp: new Date(),
            isCritical: true,
          },
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "Low repeat rate",
            confidence: ConfidenceLevel.HIGH,
            source: "Data",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "micro", // <-- Low capacity
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);

      // First intervention should be short duration for micro business
      const firstIntervention = output.decisionMemo.recommendedInterventions[0];
      expect(firstIntervention.intervention.estimatedTotalDays).toBeLessThanOrEqual(10);

      // Priority factors should weight feasibility higher
      const feasibilityFactor = firstIntervention.factors.find(
        (f) => f.factor === "Feasibility"
      );
      expect(feasibilityFactor).toBeDefined();
    });

    it("should recommend contingency for low-capacity teams", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Revenue declining",
        evidence: [
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "Slow process",
            confidence: ConfidenceLevel.HIGH,
            source: "Observation",
            timestamp: new Date(),
            isCritical: true,
          },
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "Low repeat",
            confidence: ConfidenceLevel.HIGH,
            source: "Data",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "micro",
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);

      // Implementation should flag contingency required
      if (output.decisionMemo.implementation.totalEstimatedDays > 30) {
        expect(output.decisionMemo.implementation.contingencyRequired).toBe(true);
      }
    });
  });

  describe("Output Structure Validation", () => {
    it("should produce valid ConsultingEngineOutput", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Revenue declining",
        evidence: [
          {
            id: uuidv4(),
            dimension: "operational_efficiency",
            finding: "Slow turnaround",
            confidence: ConfidenceLevel.HIGH,
            source: "Observation",
            timestamp: new Date(),
            isCritical: true,
          },
          {
            id: uuidv4(),
            dimension: "customer_retention",
            finding: "Low repeat",
            confidence: ConfidenceLevel.HIGH,
            source: "Data",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);

      // Verify required fields
      expect(output.decisionMemo).toBeDefined();
      expect(output.decisionMemo.rootCauseDiagnosis).toBeDefined();
      expect(output.decisionMemo.recommendedInterventions.length).toBeGreaterThan(0);
      expect(output.status).toMatch(/SUCCESS|PROVISIONAL|INSUFFICIENT_EVIDENCE/);

      // Verify all interventions have required fields
      for (const item of output.decisionMemo.recommendedInterventions) {
        const intervention = item.intervention;
        expect(intervention.objective).toBeTruthy();
        expect(intervention.whyThisNow).toBeTruthy();
        expect(intervention.ownerRole).toBeTruthy();
        expect(intervention.steps.length).toBeGreaterThan(0);
        expect(intervention.estimatedCostBand).toMatch(/MINIMAL|LOW|MEDIUM|HIGH/);
        expect(intervention.expectedImpactOnRevenue).toMatch(
          /NONE|MINOR|SIGNIFICANT|TRANSFORMATIVE/
        );
        expect(intervention.successMetrics.length).toBeGreaterThan(0);
        expect(intervention.failureRisks.length).toBeGreaterThan(0);
        expect(intervention.fallbackPlan).toBeTruthy();
        expect(intervention.evidenceBasis.length).toBeGreaterThan(0);
      }
    });

    it("should never present inference as fact", async () => {
      const input: ConsultingEngineInput = {
        engagementId,
        businessProblem: "Revenue declining",
        evidence: [
          {
            id: uuidv4(),
            dimension: "financial_health",
            finding: "Revenue down",
            confidence: ConfidenceLevel.PROVISIONAL,
            source: "Estimate",
            timestamp: new Date(),
            isCritical: true,
          },
        ],
        clientContext: {
          industry: "retail",
          size: "small",
          revenueImpactUrgency: "HIGH",
        },
      };

      const output = await runConsultingEngine(input);

      // Check that confidence is explicitly stated
      expect(output.decisionMemo.diagnosisConfidence).toBeDefined();

      // Check that limitations flag weak evidence
      const hasLimitationFlag = output.decisionMemo.limitations.some(
        (l) => l.toLowerCase().includes("provisional") ||
          l.toLowerCase().includes("limited") ||
          l.toLowerCase().includes("gap")
      );
      expect(hasLimitationFlag).toBe(true);
    });
  });
});
