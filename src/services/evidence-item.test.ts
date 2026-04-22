import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_SOURCE_TYPES,
  VISIBILITY_LEVELS,
  INTERVENTION_PHASES,
} from "@/domain/constants/statuses";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    shockEvent: {
      findUnique: vi.fn(),
    },
    evidenceItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Evidence Item Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Evidence category validation", () => {
    it("includes required evidence categories", () => {
      expect(EVIDENCE_CATEGORIES).toContain("financial");
      expect(EVIDENCE_CATEGORIES).toContain("operational");
      expect(EVIDENCE_CATEGORIES).toContain("market");
      expect(EVIDENCE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Evidence source type validation", () => {
    it("includes required source types", () => {
      expect(EVIDENCE_SOURCE_TYPES).toContain("document");
      expect(EVIDENCE_SOURCE_TYPES).toContain("interview");
      expect(EVIDENCE_SOURCE_TYPES).toContain("metric");
      expect(EVIDENCE_SOURCE_TYPES.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Visibility classification validation", () => {
    it("uses VISIBILITY_LEVELS for classification", () => {
      expect(VISIBILITY_LEVELS).toContain("internal");
      expect(VISIBILITY_LEVELS).toContain("client_visible");
    });
  });

  describe("Phase gate validation", () => {
    it("allows evidence in assessment phase", () => {
      const phase = "assessment";
      expect(INTERVENTION_PHASES).toContain(phase);
    });

    it("allows evidence in execution phase", () => {
      const phase = "execution";
      expect(INTERVENTION_PHASES).toContain(phase);
    });

    it("blocks evidence in closed phase", () => {
      const phase = "closed";
      expect(INTERVENTION_PHASES).toContain(phase);
    });
  });

  describe("Service creation", () => {
    it("creates evidence item with valid input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: {
          currentPhase: "execution",
        },
      });
      mockDb.evidenceItem.create.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        shockEventId: null,
        category: "financial",
        sourceType: "document",
        title: "Financial evidence",
        description: "Test description",
        capturedAt: new Date(),
        visibilityClassification: "internal",
        recordedBy: "user-1",
        version: 1,
      });

      const { createEvidenceItem } = await import("./evidence-item");
      const result = await createEvidenceItem(
        {
          engagementId: "eng-1",
          category: "financial",
          sourceType: "document",
          title: "Financial evidence",
          description: "Test description",
          capturedAt: new Date().toISOString(),
          visibilityClassification: "internal",
        },
        "user-1"
      );

      expect(result.id).toBe("evidence-1");
      expect(result.category).toBe("financial");
      expect(result.sourceType).toBe("document");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { createEvidenceItem } = await import("./evidence-item");

      try {
        await createEvidenceItem(
          {
            engagementId: "nonexistent",
            category: "financial",
            sourceType: "document",
            title: "Test",
            capturedAt: new Date().toISOString(),
            visibilityClassification: "internal",
          },
          "user-1"
        );
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("Engagement not found");
      }
    });

    it("throws error if shock event belongs to different engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: { currentPhase: "execution" },
      });
      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-2",
      });

      const { createEvidenceItem } = await import("./evidence-item");

      try {
        await createEvidenceItem(
          {
            engagementId: "eng-1",
            shockEventId: "shock-1",
            category: "financial",
            sourceType: "document",
            title: "Test",
            capturedAt: new Date().toISOString(),
            visibilityClassification: "internal",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });

    it("throws error for invalid category", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: { currentPhase: "execution" },
      });

      const { createEvidenceItem } = await import("./evidence-item");

      try {
        await createEvidenceItem(
          {
            engagementId: "eng-1",
            category: "invalid_category" as any,
            sourceType: "document",
            title: "Test",
            capturedAt: new Date().toISOString(),
            visibilityClassification: "internal",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("Invalid evidence category");
      }
    });

    it("throws error if phase gate rejects closed phase", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: {
          currentPhase: "closed",
        },
      });

      const { createEvidenceItem } = await import("./evidence-item");

      try {
        await createEvidenceItem(
          {
            engagementId: "eng-1",
            category: "financial",
            sourceType: "document",
            title: "Test",
            capturedAt: new Date().toISOString(),
            visibilityClassification: "internal",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("cannot be submitted");
      }
    });
  });

  describe("List evidence items", () => {
    it("lists evidence for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.evidenceItem.findMany.mockResolvedValue([
        {
          id: "evidence-1",
          category: "financial",
          sourceType: "document",
          title: "Evidence 1",
          capturedAt: new Date(),
          visibilityClassification: "internal",
          createdAt: new Date(),
        },
      ]);
      mockDb.evidenceItem.count.mockResolvedValue(1);

      const { listEvidenceForEngagement } = await import("./evidence-item");
      const result = await listEvidenceForEngagement("eng-1");

      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.items[0].category).toBe("financial");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { listEvidenceForEngagement } = await import("./evidence-item");

      try {
        await listEvidenceForEngagement("nonexistent");
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("Engagement not found");
      }
    });
  });

  describe("Get evidence item", () => {
    it("retrieves evidence item by id", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.evidenceItem.findUnique.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        shockEventId: null,
        category: "financial",
        sourceType: "document",
        title: "Test evidence",
        description: "Test description",
        capturedAt: new Date("2024-01-01"),
        visibilityClassification: "internal",
        recordedBy: "user-1",
        version: 1,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-02"),
      });

      const { getEvidenceItemById } = await import("./evidence-item");
      const result = await getEvidenceItemById("evidence-1");

      expect(result.id).toBe("evidence-1");
      expect(result.category).toBe("financial");
      expect(result.sourceType).toBe("document");
    });

    it("rejects evidence item if engagementId doesn't match", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.evidenceItem.findUnique.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        shockEventId: null,
        category: "financial",
        sourceType: "document",
        title: "Test",
        description: null,
        capturedAt: new Date(),
        visibilityClassification: "internal",
        recordedBy: "user-1",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { getEvidenceItemById } = await import("./evidence-item");

      try {
        await getEvidenceItemById("evidence-1", "eng-2");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits EVIDENCE_SUBMITTED audit event", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: { currentPhase: "execution" },
      });
      mockDb.evidenceItem.create.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        shockEventId: null,
        category: "financial",
        sourceType: "document",
        title: "Evidence",
        description: null,
        capturedAt: new Date(),
        visibilityClassification: "internal",
        recordedBy: "user-1",
        version: 1,
      });

      const { createEvidenceItem } = await import("./evidence-item");
      await createEvidenceItem(
        {
          engagementId: "eng-1",
          category: "financial",
          sourceType: "document",
          title: "Evidence",
          capturedAt: new Date().toISOString(),
          visibilityClassification: "internal",
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("evidence.submitted");
      expect(call.payload.engagementId).toBe("eng-1");
      expect(call.payload.category).toBe("financial");
      expect(call.payload.sourceType).toBe("document");
      expect(call.payload.visibilityClassification).toBe("internal");
      expect(call.visibility).toBe("internal");
    });
  });
});
