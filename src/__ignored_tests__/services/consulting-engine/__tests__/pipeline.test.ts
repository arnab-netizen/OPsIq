import { describe, it, expect, beforeEach, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";

// Mock the database and services BEFORE importing pipeline
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    finding: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/services/consulting-engine/orchestrator", () => ({
  runConsultingEngine: vi.fn(),
}));

vi.mock("@/services/recommendation", () => ({
  createRecommendationsFromInterventions: vi.fn(),
}));

vi.mock("@/services/action", () => ({
  createActionsFromInterventions: vi.fn(),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/services/entitlement.service", () => ({
  assertCapability: vi.fn().mockResolvedValue({ allowed: true }),
  trackUsage: vi.fn().mockResolvedValue(undefined),
}));

// Now import the pipeline
import { runConsultingPipeline } from "../pipeline";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { runConsultingEngine } from "@/services/consulting-engine/orchestrator";
import { createRecommendationsFromInterventions } from "@/services/recommendation";
import { createActionsFromInterventions } from "@/services/action";
import { emitAuditEvent } from "@/infra/audit";

describe("Consulting Engine Pipeline", () => {
  const engagementId = uuidv4();
  const clientId = uuidv4();
  const actorId = uuidv4();
  const workspaceId = "550e8400-e29b-41d4-a716-446655440000";

  const mockAuthContext = {
    session: {
      user: { id: actorId, email: "test@test.com", name: "Test", isActive: true },
      sessionId: "session-123",
      expiresAt: new Date(),
    },
    policy: { userId: actorId, roles: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runConsultingPipeline", () => {
    it("should return ERROR if engagement not found", async () => {
      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce(null);

      const result = await runConsultingPipeline(engagementId, mockAuthContext as any);

      expect(result.status).toBe("ERROR");
      expect(result.decisionMemo).toBeNull();
      expect(result.recommendations).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
      expect(result.warnings).toContain("Engagement not found");
    });

    it("should return INSUFFICIENT_DATA if no findings", async () => {
      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Test Engagement",
        description: "Test description",
        client: { industry: "retail", size: "small" },
        conditionProfiles: [],
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([]);

      const result = await runConsultingPipeline(engagementId, mockAuthContext as any);

      expect(result.status).toBe("INSUFFICIENT_DATA");
      expect(result.warnings[0]).toContain("No validated findings available");
    });

    it("should run consulting engine with mapped evidence", async () => {
      const findingId = uuidv4();

      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Recovery Engagement",
        description: "Business in trouble",
        client: { industry: "manufacturing", size: "medium" },
        conditionProfiles: [{ urgencyLevel: "high" }],
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([
        {
          id: findingId,
          engagementId,
          title: "High turnaround time",
          description: "Process is slow",
          severity: "critical",
          createdAt: new Date(),
        } as any,
      ]);

      vi.mocked(runConsultingEngine as any).mockResolvedValueOnce({
        status: "SUCCESS",
        decisionMemo: {
          id: uuidv4(),
          engagementId,
          timestamp: new Date(),
          businessProblem: "Business in trouble",
          rootCauseDiagnosis: {
            id: uuidv4(),
            type: "operational_bottleneck",
            description: "Turnaround time",
            mechanismDescription: "Process bottleneck",
            evidenceIds: [findingId],
            confidence: "HIGH",
          },
          diagnosisConfidence: "HIGH",
          criticalConstraints: [],
          recommendedInterventions: [],
          implementation: {
            firstInterventionId: uuidv4(),
            totalEstimatedDays: 14,
            criticalPathInterventions: [],
            contingencyRequired: false,
          },
          limitations: [],
          nextReviewTriggers: [],
        },
        warnings: [],
      });

      vi.mocked(createRecommendationsFromInterventions as any).mockResolvedValueOnce([]);
      vi.mocked(createActionsFromInterventions as any).mockResolvedValueOnce([]);

      const result = await runConsultingPipeline(engagementId, mockAuthContext as any);

      // Verify orchestrator was called with evidence mapped from findings
      expect(runConsultingEngine).toHaveBeenCalledWith(
        expect.objectContaining({
          engagementId,
          businessProblem: "Business in trouble",
          evidence: expect.arrayContaining([
            expect.objectContaining({
              id: findingId,
              finding: "Process is slow",
              confidence: "HIGH",
              isCritical: true,
            }),
          ]),
          clientContext: expect.objectContaining({
            industry: "manufacturing",
            size: "medium",
            revenueImpactUrgency: "HIGH",
          }),
        })
      );

      expect(result.status).toBe("SUCCESS");
      expect(result.decisionMemo).toBeDefined();
    });

    it("should create recommendations and actions from interventions", async () => {
      const interventionId = uuidv4();

      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Engagement",
        client: { industry: "retail", size: "small" },
        conditionProfiles: [],
        workspaceId,
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([
        {
          id: uuidv4(),
          severity: "high",
          title: "Finding",
          description: "Issue",
          createdAt: new Date(),
        } as any,
      ]);

      const mockIntervention = {
        intervention: {
          id: interventionId,
          title: "Fix issue",
          class: "STABILIZATION",
          objective: "Stabilize",
          rationale: "Needed",
          whyThisNow: "Critical",
          ownerRole: "consultant",
          steps: [],
          estimatedCostBand: "LOW",
          expectedImpactOnRevenue: "MINOR",
          successMetrics: [],
          failureRisks: [],
          fallbackPlan: "Backup plan",
          evidenceBasis: [],
          estimatedTotalDays: 7,
          priorityScore: 75,
        },
        priorityScore: 75,
        factors: [],
        sequencingReason: "First step",
      };

      vi.mocked(runConsultingEngine as any).mockResolvedValueOnce({
        status: "SUCCESS",
        decisionMemo: {
          id: uuidv4(),
          engagementId,
          timestamp: new Date(),
          businessProblem: "Issue",
          rootCauseDiagnosis: {
            id: uuidv4(),
            type: "operational_bottleneck",
            description: "Root cause",
            mechanismDescription: "Mechanism",
            evidenceIds: [],
            confidence: "HIGH",
          },
          diagnosisConfidence: "HIGH",
          criticalConstraints: [],
          recommendedInterventions: [mockIntervention],
          implementation: {
            firstInterventionId: interventionId,
            totalEstimatedDays: 7,
            criticalPathInterventions: [interventionId],
            contingencyRequired: false,
          },
          limitations: [],
          nextReviewTriggers: [],
        },
        warnings: [],
      });

      const mockRec = { id: uuidv4(), title: "Recommendation" };
      const mockAction = { id: uuidv4(), title: "Action" };

      vi.mocked(createRecommendationsFromInterventions as any).mockResolvedValueOnce([
        mockRec,
      ]);
      vi.mocked(createActionsFromInterventions as any).mockResolvedValueOnce([mockAction]);

      const result = await runConsultingPipeline(engagementId, mockAuthContext as any);

      // Verify adapters were called with interventions
      expect(createRecommendationsFromInterventions).toHaveBeenCalledWith(
        engagementId,
        [mockIntervention],
        mockAuthContext,
        workspaceId
      );
      expect(createActionsFromInterventions).toHaveBeenCalledWith(
        engagementId,
        [mockIntervention],
        mockAuthContext,
        workspaceId
      );

      expect(result.status).toBe("SUCCESS");
      expect(result.recommendations).toHaveLength(1);
      expect(result.actions).toHaveLength(1);
    });

    it("should emit audit event on success", async () => {
      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Engagement",
        client: { industry: "retail", size: "small" },
        conditionProfiles: [],
        workspaceId,
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([
        {
          id: uuidv4(),
          severity: "medium",
          title: "Finding",
          description: "Issue",
          createdAt: new Date(),
        } as any,
      ]);

      vi.mocked(runConsultingEngine as any).mockResolvedValueOnce({
        status: "SUCCESS",
        decisionMemo: {
          id: uuidv4(),
          engagementId,
          timestamp: new Date(),
          businessProblem: "Issue",
          rootCauseDiagnosis: {
            id: uuidv4(),
            type: "quality_control_failure",
            description: "Quality issue",
            mechanismDescription: "No QA",
            evidenceIds: [],
            confidence: "MODERATE",
          },
          diagnosisConfidence: "MODERATE",
          criticalConstraints: [],
          recommendedInterventions: [],
          implementation: {
            firstInterventionId: uuidv4(),
            totalEstimatedDays: 0,
            criticalPathInterventions: [],
            contingencyRequired: false,
          },
          limitations: [],
          nextReviewTriggers: [],
        },
        warnings: [],
      });

      vi.mocked(createRecommendationsFromInterventions as any).mockResolvedValueOnce([]);
      vi.mocked(createActionsFromInterventions as any).mockResolvedValueOnce([]);

      await runConsultingPipeline(engagementId, mockAuthContext as any);

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "diagnosis.completed",
          actorId,
          entityType: "Engagement",
          entityId: engagementId,
          payload: expect.objectContaining({
            status: "SUCCESS",
            rootCause: "quality_control_failure",
            diagnosisConfidence: "MODERATE",
          }),
        })
      );
    });

    it("should emit error event on adapter failure", async () => {
      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Engagement",
        client: { industry: "retail", size: "small" },
        conditionProfiles: [],
        workspaceId,
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([
        {
          id: uuidv4(),
          severity: "low",
          title: "Finding",
          description: "Minor issue",
          createdAt: new Date(),
        } as any,
      ]);

      vi.mocked(runConsultingEngine as any).mockResolvedValueOnce({
        status: "SUCCESS",
        decisionMemo: {
          id: uuidv4(),
          engagementId,
          timestamp: new Date(),
          businessProblem: "Issue",
          rootCauseDiagnosis: {
            id: uuidv4(),
            type: "customer_retention_erosion",
            description: "Low retention",
            mechanismDescription: "No loyalty",
            evidenceIds: [],
            confidence: "MODERATE",
          },
          diagnosisConfidence: "MODERATE",
          criticalConstraints: [],
          recommendedInterventions: [],
          implementation: {
            firstInterventionId: uuidv4(),
            totalEstimatedDays: 0,
            criticalPathInterventions: [],
            contingencyRequired: false,
          },
          limitations: [],
          nextReviewTriggers: [],
        },
        warnings: [],
      });

      const error = new Error("Adapter failure");
      vi.mocked(createRecommendationsFromInterventions as any).mockRejectedValueOnce(
        error
      );

      try {
        await runConsultingPipeline(engagementId, mockAuthContext as any);
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toBe("Adapter failure");
      }
    });

    it("should handle engine returning non-success status", async () => {
      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Engagement",
        client: { industry: "retail", size: "small" },
        conditionProfiles: [],
        workspaceId,
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([
        {
          id: uuidv4(),
          severity: "low",
          title: "Finding",
          description: "Weak evidence",
          createdAt: new Date(),
        } as any,
      ]);

      vi.mocked(runConsultingEngine as any).mockResolvedValueOnce({
        status: "INSUFFICIENT_EVIDENCE",
        decisionMemo: null,
        warnings: ["Not enough evidence for diagnosis"],
      });

      const result = await runConsultingPipeline(engagementId, mockAuthContext as any);

      expect(result.status).toBe("ERROR");
      expect(result.decisionMemo).toBeNull();
      expect(result.warnings).toContain("Not enough evidence for diagnosis");
      expect(createRecommendationsFromInterventions).not.toHaveBeenCalled();
      expect(createActionsFromInterventions).not.toHaveBeenCalled();
    });

    it("should use consulting-engine actor when provided as user", async () => {
      const engineAuthContext = {
        session: {
          user: { id: "consulting-engine", email: "system@opsiq.ai", name: "Consulting Engine", isActive: true },
          sessionId: "system-session",
          expiresAt: new Date(),
        },
        policy: { userId: "consulting-engine", roles: [] },
      };

      vi.mocked(db.engagement.findFirst).mockResolvedValueOnce({
        id: engagementId,
        clientId,
        title: "Engagement",
        client: { industry: "retail", size: "small" },
        conditionProfiles: [],
        workspaceId,
      } as any);

      vi.mocked(db.finding.findMany).mockResolvedValueOnce([
        {
          id: uuidv4(),
          severity: "medium",
          title: "Finding",
          description: "Issue",
          createdAt: new Date(),
        } as any,
      ]);

      vi.mocked(runConsultingEngine as any).mockResolvedValueOnce({
        status: "SUCCESS",
        decisionMemo: {
          id: uuidv4(),
          engagementId,
          timestamp: new Date(),
          businessProblem: "Issue",
          rootCauseDiagnosis: {
            id: uuidv4(),
            type: "operational_bottleneck",
            description: "Bottleneck",
            mechanismDescription: "Slow process",
            evidenceIds: [],
            confidence: "HIGH",
          },
          diagnosisConfidence: "HIGH",
          criticalConstraints: [],
          recommendedInterventions: [],
          implementation: {
            firstInterventionId: uuidv4(),
            totalEstimatedDays: 0,
            criticalPathInterventions: [],
            contingencyRequired: false,
          },
          limitations: [],
          nextReviewTriggers: [],
        },
        warnings: [],
      });

      vi.mocked(createRecommendationsFromInterventions as any).mockResolvedValueOnce([]);
      vi.mocked(createActionsFromInterventions as any).mockResolvedValueOnce([]);

      await runConsultingPipeline(engagementId, engineAuthContext as any);

      // Should use "consulting-engine" for audit event
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "consulting-engine",
        })
      );
      // Should pass authContext to services
      expect(createRecommendationsFromInterventions).toHaveBeenCalledWith(
        engagementId,
        [],
        engineAuthContext,
        workspaceId
      );
    });
  });
});
