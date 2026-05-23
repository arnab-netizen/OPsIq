import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";

// Mock adapters for unit testing
async function createRecommendationsFromInterventions(
  engagementId: string,
  interventions: unknown[],
  actorId: string
) {
  if (!interventions || interventions.length === 0) {
    return [];
  }

  const recommendations = [];

  for (const priIntervention of interventions) {
    const intervention = priIntervention.intervention;

    const mapClassToRecommendationClass = (interventionClass: string) => {
      const mapping: Record<string, string> = {
        CONTAINMENT: "containment",
        STABILIZATION: "stabilization",
        STRUCTURAL_REPAIR: "growth",
        GROWTH_ENABLEMENT: "growth",
        RESILIENCE_PROTECTION: "stabilization",
      };
      return mapping[interventionClass] || "stabilization";
    };

    const mapScoreToPriority = (score: number): string => {
      if (score >= 80) return "critical";
      if (score >= 60) return "high";
      if (score >= 40) return "medium";
      return "low";
    };

    const rec = {
      id: uuidv4(),
      engagementId,
      title: intervention.title,
      description: `${intervention.objective}\n\nRationale: ${intervention.rationale}`,
      priority: mapScoreToPriority(priIntervention.priorityScore),
      class: mapClassToRecommendationClass(intervention.class),
      createdAt: new Date(),
    };

    recommendations.push(rec);
  }

  return recommendations;
}

async function createActionsFromInterventions(
  engagementId: string,
  interventions: unknown[],
  actorId: string
) {
  if (!interventions || interventions.length === 0) {
    return [];
  }

  const mapPriorityScore = (score: number): string => {
    if (score >= 80) return "critical";
    if (score >= 60) return "high";
    if (score >= 40) return "medium";
    return "low";
  };

  const actions = [];

  for (const priIntervention of interventions) {
    const intervention = priIntervention.intervention;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + intervention.estimatedTotalDays);

    const action = {
      id: uuidv4(),
      engagementId,
      recommendationId: uuidv4(), // Synthetic recommendation
      title: intervention.title,
      description: `Objective: ${intervention.objective}`,
      dueDate: dueDate.toISOString().split("T")[0],
      priority: mapPriorityScore(priIntervention.priorityScore),
      createdAt: new Date(),
    };

    actions.push(action);
  }

  return actions;
}

describe("Consulting Engine Adapters (Unit Tests)", () => {
  describe("createRecommendationsFromInterventions", () => {
    it("should create recommendations from prioritized interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const interventions: PrioritizedIntervention[] = [
        {
          intervention: {
            id: uuidv4(),
            title: "Optimize Turnaround Process",
            class: "STRUCTURAL_REPAIR",
            objective: "Reduce turnaround time from 10 to 3 days",
            rationale: "Current bottleneck limits customer retention",
            whyThisNow: "Customer complaints at critical level",
            ownerRole: "operations_lead",
            steps: [
              {
                sequence: 1,
                title: "Process audit",
                description: "Review current process",
                ownerRole: "consultant",
                estimatedDays: 3,
                successCriteria: "Process map created",
              },
            ],
            estimatedCostBand: "MEDIUM",
            expectedImpactOnRevenue: "SIGNIFICANT",
            successMetrics: ["Turnaround time < 3 days"],
            failureRisks: ["Team resistance"],
            fallbackPlan: "Hire temporary staff to handle surge",
            evidenceBasis: [],
            estimatedTotalDays: 14,
            priorityScore: 85,
          },
          priorityScore: 85,
          factors: [],
          sequencingReason: "Critical path item",
        },
      ];

      const recommendations = await createRecommendationsFromInterventions(
        engagementId,
        interventions,
        actorId
      );

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].title).toBe("Optimize Turnaround Process");
      expect(recommendations[0].priority).toBe("critical");
      expect(recommendations[0].engagementId).toBe(engagementId);
    });

    it("should return empty array for empty interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const recommendations = await createRecommendationsFromInterventions(
        engagementId,
        [],
        actorId
      );

      expect(recommendations).toHaveLength(0);
    });

    it("should handle null/undefined interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const recommendations1 = await createRecommendationsFromInterventions(
        engagementId,
        null as unknown,
        actorId
      );
      const recommendations2 = await createRecommendationsFromInterventions(
        engagementId,
        undefined as unknown,
        actorId
      );

      expect(recommendations1).toHaveLength(0);
      expect(recommendations2).toHaveLength(0);
    });

    it("should map intervention class to recommendation priority", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const interventions: PrioritizedIntervention[] = [
        {
          intervention: {
            id: uuidv4(),
            title: "Quick Fix",
            class: "CONTAINMENT",
            objective: "Stop the bleeding",
            rationale: "Immediate relief needed",
            whyThisNow: "Crisis situation",
            ownerRole: "owner",
            steps: [],
            estimatedCostBand: "MINIMAL",
            expectedImpactOnRevenue: "MINOR",
            successMetrics: [],
            failureRisks: [],
            fallbackPlan: "Manual workaround",
            evidenceBasis: [],
            estimatedTotalDays: 1,
            priorityScore: 95,
          },
          priorityScore: 95,
          factors: [],
          sequencingReason: "Urgent",
        },
      ];

      const recommendations = await createRecommendationsFromInterventions(
        engagementId,
        interventions,
        actorId
      );

      expect(recommendations[0].priority).toBe("critical");
    });

    it("should map multiple interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const interventions: PrioritizedIntervention[] = [
        {
          intervention: {
            id: uuidv4(),
            title: "First Intervention",
            class: "CONTAINMENT",
            objective: "Obj 1",
            rationale: "Rationale 1",
            whyThisNow: "Now 1",
            ownerRole: "owner",
            steps: [],
            estimatedCostBand: "MINIMAL",
            expectedImpactOnRevenue: "MINOR",
            successMetrics: [],
            failureRisks: [],
            fallbackPlan: "Fallback 1",
            evidenceBasis: [],
            estimatedTotalDays: 1,
            priorityScore: 90,
          },
          priorityScore: 90,
          factors: [],
          sequencingReason: "First",
        },
        {
          intervention: {
            id: uuidv4(),
            title: "Second Intervention",
            class: "STABILIZATION",
            objective: "Obj 2",
            rationale: "Rationale 2",
            whyThisNow: "Now 2",
            ownerRole: "consultant",
            steps: [],
            estimatedCostBand: "LOW",
            expectedImpactOnRevenue: "MINOR",
            successMetrics: [],
            failureRisks: [],
            fallbackPlan: "Fallback 2",
            evidenceBasis: [],
            estimatedTotalDays: 5,
            priorityScore: 60,
          },
          priorityScore: 60,
          factors: [],
          sequencingReason: "Second",
        },
      ];

      const recommendations = await createRecommendationsFromInterventions(
        engagementId,
        interventions,
        actorId
      );

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0].title).toBe("First Intervention");
      expect(recommendations[1].title).toBe("Second Intervention");
      expect(recommendations[0].priority).toBe("critical");
      expect(recommendations[1].priority).toBe("high");
    });
  });

  describe("createActionsFromInterventions", () => {
    it("should create actions from prioritized interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const interventions: PrioritizedIntervention[] = [
        {
          intervention: {
            id: uuidv4(),
            title: "Implement New Process",
            class: "STABILIZATION",
            objective: "Stabilize operations",
            rationale: "Prevent recurrence",
            whyThisNow: "Root cause identified",
            ownerRole: "operations_lead",
            steps: [
              {
                sequence: 1,
                title: "Train team",
                description: "New process training",
                ownerRole: "consultant",
                estimatedDays: 2,
                successCriteria: "Team certified",
              },
            ],
            estimatedCostBand: "LOW",
            expectedImpactOnRevenue: "SIGNIFICANT",
            successMetrics: ["Zero incidents in 30 days"],
            failureRisks: ["Low adoption"],
            fallbackPlan: "External consultant support",
            evidenceBasis: [],
            estimatedTotalDays: 7,
            priorityScore: 75,
          },
          priorityScore: 75,
          factors: [],
          sequencingReason: "Second priority",
        },
      ];

      const actions = await createActionsFromInterventions(
        engagementId,
        interventions,
        actorId
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].title).toBe("Implement New Process");
      expect(actions[0].priority).toBe("high");
      expect(actions[0].engagementId).toBe(engagementId);
    });

    it("should return empty array for empty interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const actions = await createActionsFromInterventions(
        engagementId,
        [],
        actorId
      );

      expect(actions).toHaveLength(0);
    });

    it("should handle null/undefined interventions", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const actions1 = await createActionsFromInterventions(
        engagementId,
        null as unknown,
        actorId
      );
      const actions2 = await createActionsFromInterventions(
        engagementId,
        undefined as unknown,
        actorId
      );

      expect(actions1).toHaveLength(0);
      expect(actions2).toHaveLength(0);
    });

    it("should map priority score to action priority", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const interventions: PrioritizedIntervention[] = [
        {
          intervention: {
            id: uuidv4(),
            title: "Critical Fix",
            class: "CONTAINMENT",
            objective: "Stop service degradation",
            rationale: "Service is down",
            whyThisNow: "Customer impact critical",
            ownerRole: "owner",
            steps: [],
            estimatedCostBand: "HIGH",
            expectedImpactOnRevenue: "TRANSFORMATIVE",
            successMetrics: ["Service restored"],
            failureRisks: ["Further degradation"],
            fallbackPlan: "Rollback previous change",
            evidenceBasis: [],
            estimatedTotalDays: 1,
            priorityScore: 95,
          },
          priorityScore: 95,
          factors: [],
          sequencingReason: "Emergency",
        },
      ];

      const actions = await createActionsFromInterventions(
        engagementId,
        interventions,
        actorId
      );

      expect(actions[0].priority).toBe("critical");
    });

    it("should calculate due date based on estimated days", async () => {
      const engagementId = uuidv4();
      const actorId = uuidv4();

      const interventions: PrioritizedIntervention[] = [
        {
          intervention: {
            id: uuidv4(),
            title: "Multi-day Task",
            class: "STRUCTURAL_REPAIR",
            objective: "Major change",
            rationale: "Long-term fix",
            whyThisNow: "Strategic priority",
            ownerRole: "consultant",
            steps: [],
            estimatedCostBand: "MEDIUM",
            expectedImpactOnRevenue: "SIGNIFICANT",
            successMetrics: [],
            failureRisks: [],
            fallbackPlan: "Extended timeline",
            evidenceBasis: [],
            estimatedTotalDays: 30,
            priorityScore: 60,
          },
          priorityScore: 60,
          factors: [],
          sequencingReason: "Follow-up work",
        },
      ];

      const before = new Date();
      const actions = await createActionsFromInterventions(
        engagementId,
        interventions,
        actorId
      );
      const after = new Date();

      expect(actions).toHaveLength(1);
      const dueDate = new Date(actions[0].dueDate);
      const diffDays = Math.floor(
        (dueDate.getTime() - before.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });
  });
});
