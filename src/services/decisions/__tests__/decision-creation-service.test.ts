import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  createDecision,
  createDecisionsBulk,
  parseCSV,
} from "../decision-creation-service";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

describe("Decision Creation Service", () => {
  const mockDecision = {
    id: "d-001",
    workspaceId: "550e8400-e29b-41d4-a716-446655440000",
    problem: "Test Decision",
    action: "strategic",
    decisionType: "strategic",
    impactExpected: 100000,
    impactLow: 80000,
    impactHigh: 120000,
    confidence: 0.85,
    status: "pending",
    ownerUserId: "user-001",
    createdBy: "user-001",
    lastUpdatedBy: "user-001",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createDecision", () => {
    it("should create a single decision", async () => {
      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      const result = await createDecision({
        title: "Test Decision",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });

      expect(result.id).toBe("d-001");
      expect(result.title).toBe("Test Decision");
      expect(result.decisionType).toBe("strategic");
      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          problem: "Test Decision",
          action: "strategic",
          impactExpected: 100000,
          confidence: 0.85,
        }),
      });
    });

    it("should validate required title", async () => {
      await expect(
        createDecision({
          title: "",
          type: "strategic",
          impact: 100000,
          confidence: 0.85,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Decision title is required");
    });

    it("should validate required type", async () => {
      await expect(
        createDecision({
          title: "Test",
          type: "",
          impact: 100000,
          confidence: 0.85,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Decision type is required");
    });

    it("should validate impact is positive", async () => {
      await expect(
        createDecision({
          title: "Test",
          type: "strategic",
          impact: -1000,
          confidence: 0.85,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Impact must be a positive number");

      await expect(
        createDecision({
          title: "Test",
          type: "strategic",
          impact: 0,
          confidence: 0.85,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Impact must be a positive number");
    });

    it("should validate confidence is between 0 and 1", async () => {
      await expect(
        createDecision({
          title: "Test",
          type: "strategic",
          impact: 100000,
          confidence: -0.1,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Confidence must be between 0 and 1");

      await expect(
        createDecision({
          title: "Test",
          type: "strategic",
          impact: 100000,
          confidence: 1.5,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Confidence must be between 0 and 1");
    });

    it("should include optional fields", async () => {
      vi.mocked(db.operatorItem.create).mockResolvedValueOnce({
        ...mockDecision,
        problemType: "revenue_leak",
        expectedOutcome: "Increase revenue by 20%",
      } as any);

      await createDecision({
        title: "Test Decision",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        problemType: "revenue_leak",
        expectedOutcome: "Increase revenue by 20%",
      });

      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          problemType: "revenue_leak",
          expectedOutcome: "Increase revenue by 20%",
        }),
      });
    });

    it("should calculate impact bounds (80-120%)", async () => {
      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      await createDecision({
        title: "Test",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });

      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          impactLow: 80000,
          impactHigh: 120000,
        }),
      });
    });

    it("should log decision creation", async () => {
      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      await createDecision({
        title: "Test Decision",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Decision created",
        expect.objectContaining({
          title: "Test Decision",
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        })
      );
    });
  });

  describe("createDecisionsBulk", () => {
    it("should create multiple decisions", async () => {
      vi.mocked(db.operatorItem.create)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          id: "d-002",
          problem: "Second Decision",
        } as any);

      const result = await createDecisionsBulk({
        decisions: [
          {
            title: "Test Decision 1",
            type: "strategic",
            impact: 100000,
            confidence: 0.85,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
          {
            title: "Test Decision 2",
            type: "operational",
            impact: 50000,
            confidence: 0.75,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
        ],
      });

      expect(result.summary.total).toBe(2);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(0);
      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it("should handle partial failures in bulk creation", async () => {
      vi.mocked(db.operatorItem.create)
        .mockResolvedValueOnce(mockDecision as any)
        .mockRejectedValueOnce(new Error("Validation failed"))
        .mockResolvedValueOnce({
          ...mockDecision,
          id: "d-003",
        } as any);

      const result = await createDecisionsBulk({
        decisions: [
          {
            title: "Valid Decision 1",
            type: "strategic",
            impact: 100000,
            confidence: 0.85,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
          {
            title: "Invalid Decision",
            type: "strategic",
            impact: 100000,
            confidence: 0.85,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
          {
            title: "Valid Decision 2",
            type: "operational",
            impact: 50000,
            confidence: 0.75,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
        ],
      });

      expect(result.summary.total).toBe(3);
      expect(result.summary.succeeded).toBe(2);
      expect(result.summary.failed).toBe(1);
      expect(result.failed[0].title).toBe("Invalid Decision");
    });

    it("should enforce maximum of 1000 decisions", async () => {
      const decisions = Array(1001).fill({
        title: "Test",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });

      await expect(createDecisionsBulk({ decisions })).rejects.toThrow(
        "Cannot create more than 1000 decisions at once"
      );
    });

    it("should require at least one decision", async () => {
      await expect(createDecisionsBulk({ decisions: [] })).rejects.toThrow(
        "At least one decision is required"
      );
    });

    it("should log bulk creation completion", async () => {
      vi.mocked(db.operatorItem.create)
        .mockResolvedValueOnce(mockDecision as any)
        .mockResolvedValueOnce({
          ...mockDecision,
          id: "d-002",
        } as any);

      await createDecisionsBulk({
        decisions: [
          {
            title: "Test 1",
            type: "strategic",
            impact: 100000,
            confidence: 0.85,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
          {
            title: "Test 2",
            type: "operational",
            impact: 50000,
            confidence: 0.75,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
        ],
      });

      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        "Bulk decision creation completed",
        expect.objectContaining({
          total: 2,
          succeeded: 2,
          failed: 0,
        })
      );
    });
  });

  describe("parseCSV", () => {
    it("should parse valid CSV content", () => {
      const csv = `title,type,impact,confidence
Test Decision 1,strategic,100000,0.85
Test Decision 2,operational,50000,0.75`;

      const result = parseCSV(csv, "550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        title: "Test Decision 1",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });
    });

    it("should handle optional columns", () => {
      const csv = `title,type,impact,confidence,problemType,expectedOutcome
Test Decision,strategic,100000,0.85,revenue_leak,Increase revenue`;

      const result = parseCSV(csv, "550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(result[0]).toMatchObject({
        problemType: "revenue_leak",
        expectedOutcome: "Increase revenue",
      });
    });

    it("should skip empty rows", () => {
      const csv = `title,type,impact,confidence
Test Decision 1,strategic,100000,0.85

Test Decision 2,operational,50000,0.75`;

      const result = parseCSV(csv, "550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(result).toHaveLength(2);
    });

    it("should require header row", () => {
      const csv = `Test Decision,strategic,100000,0.85`;

      expect(() => parseCSV(csv, "550e8400-e29b-41d4-a716-446655440000", "user-001")).toThrow(
        "CSV must have header and at least one data row"
      );
    });

    it("should validate required columns", () => {
      const csv = `title,type
Test Decision,strategic`;

      expect(() => parseCSV(csv, "550e8400-e29b-41d4-a716-446655440000", "user-001")).toThrow(
        "Missing required columns: impact, confidence"
      );
    });

    it("should reject empty CSV", () => {
      expect(() => parseCSV("", "550e8400-e29b-41d4-a716-446655440000", "user-001")).toThrow(
        "CSV must have header and at least one data row"
      );
    });

    it("should handle whitespace in CSV", () => {
      const csv = `title , type , impact , confidence
 Test Decision , strategic , 100000 , 0.85 `;

      const result = parseCSV(csv, "550e8400-e29b-41d4-a716-446655440000", "user-001");

      expect(result[0]).toMatchObject({
        title: "Test Decision",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
      });
    });
  });

  describe("Workspace Isolation", () => {
    it("should create decisions with correct workspace isolation", async () => {
      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      await createDecision({
        title: "Test",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440001",
        userId: "user-001",
      });

      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: "550e8400-e29b-41d4-a716-446655440001",
        }),
      });
    });

    it("should assign correct user in bulk creation", async () => {
      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      await createDecisionsBulk({
        decisions: [
          {
            title: "Test",
            type: "strategic",
            impact: 100000,
            confidence: 0.85,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-different",
          },
        ],
      });

      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerUserId: "user-different",
          createdBy: "user-different",
        }),
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      const dbError = new Error("Database connection failed");
      vi.mocked(db.operatorItem.create).mockRejectedValueOnce(dbError);

      await expect(
        createDecision({
          title: "Test",
          type: "strategic",
          impact: 100000,
          confidence: 0.85,
          workspaceId: "550e8400-e29b-41d4-a716-446655440000",
          userId: "user-001",
        })
      ).rejects.toThrow("Database connection failed");

      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        "Failed to create decision",
        expect.any(Object)
      );
    });

    it("should log failures in bulk creation", async () => {
      vi.mocked(db.operatorItem.create).mockRejectedValueOnce(
        new Error("Validation error")
      );

      await createDecisionsBulk({
        decisions: [
          {
            title: "Failing Decision",
            type: "strategic",
            impact: 100000,
            confidence: 0.85,
            workspaceId: "550e8400-e29b-41d4-a716-446655440000",
            userId: "user-001",
          },
        ],
      });

      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        "Failed to create decision in bulk",
        expect.any(Object)
      );
    });
  });
});
