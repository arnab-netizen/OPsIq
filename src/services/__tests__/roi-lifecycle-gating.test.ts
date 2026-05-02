import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies BEFORE importing
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/service-auth", () => ({
  requireServiceContext: vi.fn((authContext, workspaceId) => {
    if (!authContext || !authContext.session?.user?.id) {
      throw new Error("Auth context required");
    }
    return [authContext.session.user.id, workspaceId];
  }),
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// NOW import after mocks are set up
import { db } from "@/lib/db";
import {
  validateProjectedImpactRecording,
  validateRealizedImpactRecording,
  validateFinalROIMarking,
  recordImpactWithGating,
  recordROIWithGating,
  validateImpactModificationAllowed,
  canContributeToRealizedROI,
  getImpactRestrictionsForState,
} from "../roi-lifecycle-gating";
import { ValidationError, ConflictError } from "@/infra/errors";

describe("ROI Lifecycle Gating Service", () => {
  const mockAuthContext = {
    session: {
      user: { id: "user-123", email: "user@test.com", name: "Test", isActive: true },
      sessionId: "session-123",
      expiresAt: new Date(),
    },
    policy: { userId: "user-123", roles: [] },
    workspace: { id: "workspace-123" },
  };

  const createGoodDecision = (status: string) => ({
    id: "dec-123",
    workspaceId: "workspace-123",
    status,
    createdBy: "user-123",
    ownerUserId: "user-123",
    impactExpected: 10000,
    actualOutcomeValue: null,
    actualOutcome: null,
    impactActual: null,
    isROIFinal: false,
    updatedAt: new Date(),
    lastUpdatedBy: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Projected Impact Recording Validation", () => {
    it("should allow projected impact for DRAFT decisions", () => {
      const result = validateProjectedImpactRecording("DRAFT");

      expect(result.allowed).toBe(true);
    });

    it("should allow projected impact for SUBMITTED decisions", () => {
      const result = validateProjectedImpactRecording("SUBMITTED");

      expect(result.allowed).toBe(true);
    });

    it("should allow projected impact for APPROVED decisions", () => {
      const result = validateProjectedImpactRecording("APPROVED");

      expect(result.allowed).toBe(true);
    });

    it("should reject projected impact for EXECUTED decisions", () => {
      const result = validateProjectedImpactRecording("EXECUTED");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("before execution");
    });

    it("should reject projected impact for OUTCOME_RECORDED decisions", () => {
      const result = validateProjectedImpactRecording("OUTCOME_RECORDED");

      expect(result.allowed).toBe(false);
    });

    it("should reject projected impact for CLOSED decisions", () => {
      const result = validateProjectedImpactRecording("CLOSED");

      expect(result.allowed).toBe(false);
    });
  });

  describe("Realized Impact Recording Validation", () => {
    it("should reject realized impact for DRAFT decisions", () => {
      const result = validateRealizedImpactRecording("DRAFT");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("OUTCOME_RECORDED");
    });

    it("should reject realized impact for APPROVED decisions", () => {
      const result = validateRealizedImpactRecording("APPROVED");

      expect(result.allowed).toBe(false);
    });

    it("should reject realized impact for EXECUTED decisions", () => {
      const result = validateRealizedImpactRecording("EXECUTED");

      expect(result.allowed).toBe(false);
    });

    it("should allow realized impact for OUTCOME_RECORDED decisions", () => {
      const result = validateRealizedImpactRecording("OUTCOME_RECORDED");

      expect(result.allowed).toBe(true);
    });

    it("should allow realized impact for CLOSED decisions", () => {
      const result = validateRealizedImpactRecording("CLOSED");

      expect(result.allowed).toBe(true);
    });

    it("should reject realized impact for FAILED decisions", () => {
      const result = validateRealizedImpactRecording("FAILED");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Failed/cancelled/rejected");
    });

    it("should reject realized impact for CANCELLED decisions", () => {
      const result = validateRealizedImpactRecording("CANCELLED");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("excluded");
    });

    it("should reject realized impact for REJECTED decisions", () => {
      const result = validateRealizedImpactRecording("REJECTED");

      expect(result.allowed).toBe(false);
    });
  });

  describe("Final ROI Marking Validation", () => {
    it("should reject final ROI for DRAFT decisions", () => {
      const result = validateFinalROIMarking("DRAFT");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("CLOSED");
    });

    it("should reject final ROI for APPROVED decisions", () => {
      const result = validateFinalROIMarking("APPROVED");

      expect(result.allowed).toBe(false);
    });

    it("should reject final ROI for EXECUTED decisions", () => {
      const result = validateFinalROIMarking("EXECUTED");

      expect(result.allowed).toBe(false);
    });

    it("should reject final ROI for OUTCOME_RECORDED decisions", () => {
      const result = validateFinalROIMarking("OUTCOME_RECORDED");

      expect(result.allowed).toBe(false);
    });

    it("should allow final ROI for CLOSED decisions", () => {
      const result = validateFinalROIMarking("CLOSED");

      expect(result.allowed).toBe(true);
    });
  });

  describe("Record Impact With Gating", () => {
    it("should record projected impact for APPROVED decision", async () => {
      const decision = createGoodDecision("approved");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...decision,
        impactExpected: 15000,
      } as any);

      const result = await recordImpactWithGating(
        {
          decisionId: "dec-123",
          workspaceId: "workspace-123",
          impactType: "projected",
          expectedOutcomeValue: 15000,
        },
        mockAuthContext
      );

      expect(result.impactType).toBe("projected");
      expect(result.recorded).toBe(true);
      expect(vi.mocked(db.operatorItem.update)).toHaveBeenCalled();
    });

    it("should reject projected impact for EXECUTED decision", async () => {
      const decision = createGoodDecision("in_progress");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "projected",
            expectedOutcomeValue: 15000,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should record realized impact for OUTCOME_RECORDED decision", async () => {
      const decision = createGoodDecision("outcome_recorded");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...decision,
        actualOutcomeValue: 12000,
      } as any);

      const result = await recordImpactWithGating(
        {
          decisionId: "dec-123",
          workspaceId: "workspace-123",
          impactType: "realized",
          actualOutcomeValue: 12000,
          actualOutcome: "Success",
        },
        mockAuthContext
      );

      expect(result.impactType).toBe("realized");
      expect(result.recorded).toBe(true);
    });

    it("should reject realized impact for APPROVED decision", async () => {
      const decision = createGoodDecision("approved");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 12000,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject realized impact for FAILED decision", async () => {
      const decision = createGoodDecision("failed");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject realized impact for CANCELLED decision", async () => {
      const decision = createGoodDecision("cancelled");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject realized impact for REJECTED decision", async () => {
      const decision = createGoodDecision("blocked");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject duplicate outcome", async () => {
      const decision = {
        ...createGoodDecision("outcome_recorded"),
        actualOutcomeValue: 5000, // Already has outcome
      };
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 12000,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ConflictError);
    });

    it("should reject outcome change after CLOSED", async () => {
      const decision = {
        ...createGoodDecision("closed"),
        actualOutcomeValue: 5000, // Already closed with outcome
      };
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 12000,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("Record ROI With Gating", () => {
    it("should record ROI for OUTCOME_RECORDED decision", async () => {
      const decision = createGoodDecision("outcome_recorded");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...decision,
        impactActual: 2000,
        isROIFinal: false,
      } as any);

      const result = await recordROIWithGating(
        {
          decisionId: "dec-123",
          workspaceId: "workspace-123",
          roiValue: 2000,
          markFinal: false,
        },
        mockAuthContext
      );

      expect(result.roiValue).toBe(2000);
      expect(result.isFinal).toBe(false);
    });

    it("should mark ROI as final only when CLOSED", async () => {
      const decision = createGoodDecision("closed");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...decision,
        impactActual: 2000,
        isROIFinal: true,
      } as any);

      const result = await recordROIWithGating(
        {
          decisionId: "dec-123",
          workspaceId: "workspace-123",
          roiValue: 2000,
          markFinal: true,
        },
        mockAuthContext
      );

      expect(result.isFinal).toBe(true);
    });

    it("should reject final ROI marking for OUTCOME_RECORDED decision", async () => {
      const decision = createGoodDecision("outcome_recorded");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordROIWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            roiValue: 2000,
            markFinal: true,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject ROI for FAILED decision", async () => {
      const decision = createGoodDecision("failed");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordROIWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            roiValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject ROI for CANCELLED decision", async () => {
      const decision = createGoodDecision("cancelled");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordROIWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            roiValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });

    it("should reject ROI for REJECTED decision", async () => {
      const decision = createGoodDecision("blocked");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordROIWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            roiValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Impact Modification Allowed", () => {
    it("should allow modifications for DRAFT", () => {
      const result = validateImpactModificationAllowed("DRAFT");

      expect(result.allowed).toBe(true);
    });

    it("should allow modifications for APPROVED", () => {
      const result = validateImpactModificationAllowed("APPROVED");

      expect(result.allowed).toBe(true);
    });

    it("should reject modifications for CLOSED", () => {
      const result = validateImpactModificationAllowed("CLOSED");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("final");
    });

    it("should reject modifications for FAILED", () => {
      const result = validateImpactModificationAllowed("FAILED");

      expect(result.allowed).toBe(false);
    });

    it("should reject modifications for CANCELLED", () => {
      const result = validateImpactModificationAllowed("CANCELLED");

      expect(result.allowed).toBe(false);
    });

    it("should reject modifications for REJECTED", () => {
      const result = validateImpactModificationAllowed("REJECTED");

      expect(result.allowed).toBe(false);
    });
  });

  describe("Can Contribute to Realized ROI", () => {
    it("should exclude DRAFT from realized ROI", () => {
      expect(canContributeToRealizedROI("DRAFT")).toBe(false);
    });

    it("should exclude APPROVED from realized ROI", () => {
      expect(canContributeToRealizedROI("APPROVED")).toBe(false);
    });

    it("should exclude EXECUTED from realized ROI", () => {
      expect(canContributeToRealizedROI("EXECUTED")).toBe(false);
    });

    it("should include OUTCOME_RECORDED in realized ROI", () => {
      expect(canContributeToRealizedROI("OUTCOME_RECORDED")).toBe(true);
    });

    it("should include CLOSED in realized ROI", () => {
      expect(canContributeToRealizedROI("CLOSED")).toBe(true);
    });

    it("should exclude FAILED from realized ROI", () => {
      expect(canContributeToRealizedROI("FAILED")).toBe(false);
    });

    it("should exclude CANCELLED from realized ROI", () => {
      expect(canContributeToRealizedROI("CANCELLED")).toBe(false);
    });

    it("should exclude REJECTED from realized ROI", () => {
      expect(canContributeToRealizedROI("REJECTED")).toBe(false);
    });
  });

  describe("Get Impact Restrictions", () => {
    it("should report all restrictions for DRAFT", () => {
      const result = getImpactRestrictionsForState("DRAFT");

      expect(result.canRecordProjected).toBe(true);
      expect(result.canRecordRealized).toBe(false);
      expect(result.canMarkFinalROI).toBe(false);
    });

    it("should report all restrictions for APPROVED", () => {
      const result = getImpactRestrictionsForState("APPROVED");

      expect(result.canRecordProjected).toBe(true);
      expect(result.canRecordRealized).toBe(false);
      expect(result.canMarkFinalROI).toBe(false);
    });

    it("should report all restrictions for EXECUTED", () => {
      const result = getImpactRestrictionsForState("EXECUTED");

      expect(result.canRecordProjected).toBe(false);
      expect(result.canRecordRealized).toBe(false);
      expect(result.canMarkFinalROI).toBe(false);
    });

    it("should report all restrictions for OUTCOME_RECORDED", () => {
      const result = getImpactRestrictionsForState("OUTCOME_RECORDED");

      expect(result.canRecordProjected).toBe(false);
      expect(result.canRecordRealized).toBe(true);
      expect(result.canMarkFinalROI).toBe(false);
    });

    it("should report all restrictions for CLOSED", () => {
      const result = getImpactRestrictionsForState("CLOSED");

      expect(result.canRecordProjected).toBe(false);
      expect(result.canRecordRealized).toBe(true);
      expect(result.canMarkFinalROI).toBe(true);
    });

    it("should report all restrictions for FAILED", () => {
      const result = getImpactRestrictionsForState("FAILED");

      expect(result.canRecordProjected).toBe(false);
      expect(result.canRecordRealized).toBe(false);
      expect(result.canMarkFinalROI).toBe(false);
    });
  });

  describe("Acceptance Criteria Tests", () => {
    it("should prove DRAFT decision cannot produce realized ROI", async () => {
      const decision = createGoodDecision("draft");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      // Should fail to record realized impact
      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 5000,
          },
          mockAuthContext
        )
      ).rejects.toThrow();

      // Should not contribute to ROI
      expect(canContributeToRealizedROI("draft")).toBe(false);
    });

    it("should prove APPROVED decision cannot produce realized ROI", async () => {
      const decision = createGoodDecision("approved");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 5000,
          },
          mockAuthContext
        )
      ).rejects.toThrow();

      expect(canContributeToRealizedROI("approved")).toBe(false);
    });

    it("should prove EXECUTED without outcome cannot produce realized ROI", async () => {
      const decision = createGoodDecision("in_progress");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 5000,
          },
          mockAuthContext
        )
      ).rejects.toThrow();

      expect(canContributeToRealizedROI("in_progress")).toBe(false);
    });

    it("should prove FAILED decision excluded from realized ROI", async () => {
      const decision = createGoodDecision("failed");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordROIWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            roiValue: 0,
          },
          mockAuthContext
        )
      ).rejects.toThrow();

      expect(canContributeToRealizedROI("failed")).toBe(false);
    });

    it("should prove CLOSED decision produces final ROI", async () => {
      const decision = createGoodDecision("closed");
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);
      vi.mocked(db.operatorItem.update).mockResolvedValue({
        ...decision,
        impactActual: 2000,
        isROIFinal: true,
      } as any);

      const result = await recordROIWithGating(
        {
          decisionId: "dec-123",
          workspaceId: "workspace-123",
          roiValue: 2000,
          markFinal: true,
        },
        mockAuthContext
      );

      expect(result.isFinal).toBe(true);
      expect(canContributeToRealizedROI("CLOSED")).toBe(true);
    });

    it("should prove duplicate outcome rejected", async () => {
      const decision = {
        ...createGoodDecision("outcome_recorded"),
        actualOutcomeValue: 5000,
      };
      vi.mocked(db.operatorItem.findFirst).mockResolvedValue(decision as any);

      await expect(
        recordImpactWithGating(
          {
            decisionId: "dec-123",
            workspaceId: "workspace-123",
            impactType: "realized",
            actualOutcomeValue: 12000,
          },
          mockAuthContext
        )
      ).rejects.toThrow(ConflictError);
    });
  });
});
