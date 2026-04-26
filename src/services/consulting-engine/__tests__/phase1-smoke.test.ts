import { describe, it, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { runConsultingEngine } from "../orchestrator";
import type { ConsultingEngineInput } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";

describe("Consulting Engine Phase 1 Smoke Test", () => {
  it("should run orchestrator with synthetic input and produce decision memo", async () => {
    const engagementId = uuidv4();

    const input: ConsultingEngineInput = {
      engagementId,
      businessProblem: "Revenue declining due to operational delays",
      evidence: [
        {
          id: uuidv4(),
          dimension: "operational_efficiency",
          finding: "Turnaround time is 10 days vs competitor 3 days",
          confidence: ConfidenceLevel.HIGH,
          source: "Customer interviews",
          timestamp: new Date(),
          isCritical: true,
          supportingData: { avgTurnaroundDays: 10, competitorDays: 3 },
        },
        {
          id: uuidv4(),
          dimension: "customer_retention",
          finding: "Only 25% of customers return for repeat business",
          confidence: ConfidenceLevel.HIGH,
          source: "Transaction data",
          timestamp: new Date(),
          isCritical: true,
          supportingData: { repeatRate: 0.25, industryAverage: 0.6 },
        },
        {
          id: uuidv4(),
          dimension: "quality_delivery",
          finding: "12% complaint rate on service quality",
          confidence: ConfidenceLevel.MEDIUM,
          source: "Complaint log",
          timestamp: new Date(),
          isCritical: false,
        },
      ],
      clientContext: {
        industry: "retail",
        size: "small",
        revenueImpactUrgency: "HIGH",
      },
    };

    const output = await runConsultingEngine(input);

    // Verify structure
    expect(output).toHaveProperty("decisionMemo");
    expect(output).toHaveProperty("status");
    expect(output).toHaveProperty("warnings");

    // Verify decision memo structure
    expect(output.decisionMemo).toHaveProperty("id");
    expect(output.decisionMemo).toHaveProperty("engagementId", engagementId);
    expect(output.decisionMemo).toHaveProperty("businessProblem");
    expect(output.decisionMemo).toHaveProperty("rootCauseDiagnosis");
    expect(output.decisionMemo).toHaveProperty("diagnosisConfidence");
    expect(output.decisionMemo).toHaveProperty("criticalConstraints");
    expect(output.decisionMemo).toHaveProperty("recommendedInterventions");
    expect(output.decisionMemo).toHaveProperty("implementation");
    expect(output.decisionMemo).toHaveProperty("limitations");
    expect(output.decisionMemo).toHaveProperty("nextReviewTriggers");

    // Verify root cause diagnosis
    expect(output.decisionMemo.rootCauseDiagnosis).toHaveProperty("id");
    expect(output.decisionMemo.rootCauseDiagnosis).toHaveProperty("type");
    expect(output.decisionMemo.rootCauseDiagnosis).toHaveProperty("description");
    expect(output.decisionMemo.rootCauseDiagnosis).toHaveProperty("mechanismDescription");
    expect(output.decisionMemo.rootCauseDiagnosis).toHaveProperty("evidenceIds");
    expect(output.decisionMemo.rootCauseDiagnosis).toHaveProperty("confidence");

    // Verify interventions exist
    expect(output.decisionMemo.recommendedInterventions).toBeDefined();
    expect(Array.isArray(output.decisionMemo.recommendedInterventions)).toBe(true);
    expect(output.decisionMemo.recommendedInterventions.length).toBeGreaterThan(0);

    // Verify first intervention structure
    const firstIntervention = output.decisionMemo.recommendedInterventions[0];
    expect(firstIntervention).toHaveProperty("intervention");
    expect(firstIntervention).toHaveProperty("priorityScore");
    expect(firstIntervention).toHaveProperty("factors");
    expect(firstIntervention).toHaveProperty("sequencingReason");

    // Verify intervention structure
    expect(firstIntervention.intervention).toHaveProperty("id");
    expect(firstIntervention.intervention).toHaveProperty("title");
    expect(firstIntervention.intervention).toHaveProperty("class");
    expect(firstIntervention.intervention).toHaveProperty("objective");
    expect(firstIntervention.intervention).toHaveProperty("steps");
    expect(firstIntervention.intervention.steps.length).toBeGreaterThan(0);

    // Verify output status
    expect(["SUCCESS", "PROVISIONAL", "INSUFFICIENT_EVIDENCE"]).toContain(output.status);

    // Verify implementation plan
    expect(output.decisionMemo.implementation.totalEstimatedDays).toBeGreaterThan(0);
    expect(output.decisionMemo.implementation.criticalPathInterventions.length).toBeGreaterThan(0);

    console.log(`✓ Consulting engine produced valid decision memo`);
    console.log(`  Root cause: ${output.decisionMemo.rootCauseDiagnosis.type}`);
    console.log(`  Confidence: ${output.decisionMemo.diagnosisConfidence}`);
    console.log(`  Interventions: ${output.decisionMemo.recommendedInterventions.length}`);
    console.log(`  Status: ${output.status}`);
  });
});
