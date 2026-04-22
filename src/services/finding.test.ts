import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RISK_SEVERITIES,
  FINDING_STATUSES,
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
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
    },
    finding: {
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

describe("Finding Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Severity validation", () => {
    it("includes required severities", () => {
      expect(RISK_SEVERITIES).toContain("low");
      expect(RISK_SEVERITIES).toContain("medium");
      expect(RISK_SEVERITIES).toContain("high");
      expect(RISK_SEVERITIES).toContain("critical");
    });
  });

  describe("Status validation", () => {
    it("includes required statuses", () => {
      expect(FINDING_STATUSES).toContain("draft");
      expect(FINDING_STATUSES).toContain("under_review");
      expect(FINDING_STATUSES).toContain("validated");
    });
  });

  describe("Service creation", () => {
    it("creates finding with valid input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.create.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        shockEventId: null,
        title: "Critical issue",
        statement: "The system is failing",
        severity: "critical",
        status: "draft",
        rationale: null,
        createdBy: "user-1",
        version: 1,
      });

      const { createFinding } = await import("./finding");
      const result = await createFinding(
        {
          engagementId: "eng-1",
          title: "Critical issue",
          statement: "The system is failing",
          severity: "critical",
        },
        "user-1"
      );

      expect(result.id).toBe("finding-1");
      expect(result.severity).toBe("critical");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "nonexistent",
            title: "Test",
            statement: "Test",
            severity: "high",
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
      });
      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-2",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            shockEventId: "shock-1",
            title: "Test",
            statement: "Test",
            severity: "high",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });

    it("throws error for invalid severity", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            title: "Test",
            statement: "Test",
            severity: "invalid_severity" as any,
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("Invalid severity");
      }
    });

    it("throws error if evidence belongs to different engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.evidenceItem.findUnique.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-2",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            title: "Test",
            statement: "Test",
            severity: "high",
            linkedEvidenceIds: ["evidence-1"],
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });

    it("throws error if duplicate evidence in linkedEvidenceIds", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            title: "Test",
            statement: "Test",
            severity: "high",
            linkedEvidenceIds: ["evidence-1", "evidence-1"],
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("Duplicate");
      }
    });

    it("throws error if intervention phase is closed", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "closed",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            title: "Test",
            statement: "Test",
            severity: "high",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("closed phase");
      }
    });

    it("throws error if evidence has invalid status", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.evidenceItem.findUnique.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        status: "rejected",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            title: "Test",
            statement: "Test",
            severity: "high",
            linkedEvidenceIds: ["evidence-1"],
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("rejected");
      }
    });

    it("throws error if evidence is superseded", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.evidenceItem.findUnique.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        status: "superseded",
      });

      const { createFinding } = await import("./finding");

      try {
        await createFinding(
          {
            engagementId: "eng-1",
            title: "Test",
            statement: "Test",
            severity: "high",
            linkedEvidenceIds: ["evidence-1"],
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("superseded");
      }
    });
  });

  describe("List findings", () => {
    it("lists findings for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.finding.findMany.mockResolvedValue([
        {
          id: "finding-1",
          title: "Critical issue",
          statement: "System failure",
          severity: "critical",
          status: "draft",
          createdAt: new Date(),
        },
      ]);
      mockDb.finding.count.mockResolvedValue(1);

      const { listFindingsForEngagement } = await import("./finding");
      const result = await listFindingsForEngagement("eng-1");

      expect(result.findings.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.findings[0].severity).toBe("critical");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { listFindingsForEngagement } = await import("./finding");

      try {
        await listFindingsForEngagement("nonexistent");
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("Engagement not found");
      }
    });
  });

  describe("Get finding", () => {
    it("retrieves finding by id with evidence", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        shockEventId: null,
        title: "Critical issue",
        statement: "System failure",
        severity: "critical",
        status: "draft",
        rationale: "Root cause analysis",
        createdBy: "user-1",
        version: 1,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        evidenceLinks: [
          {
            evidenceItem: {
              id: "evidence-1",
              category: "technical",
              sourceType: "document",
              title: "Incident report",
              capturedAt: new Date("2024-01-01"),
            },
          },
        ],
      });

      const { getFindingById } = await import("./finding");
      const result = await getFindingById("finding-1");

      expect(result.id).toBe("finding-1");
      expect(result.severity).toBe("critical");
      expect(result.evidence.length).toBe(1);
      expect(result.evidence[0].category).toBe("technical");
    });

    it("rejects finding if engagementId doesn't match", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.finding.findUnique.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        shockEventId: null,
        title: "Test",
        statement: "Test",
        severity: "critical",
        status: "draft",
        rationale: null,
        createdBy: "user-1",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        evidenceLinks: [],
      });

      const { getFindingById } = await import("./finding");

      try {
        await getFindingById("finding-1", "eng-2");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits FINDING_CREATED audit event", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.finding.create.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        shockEventId: null,
        title: "Critical issue",
        statement: "System failure",
        severity: "critical",
        status: "draft",
        rationale: null,
        createdBy: "user-1",
        version: 1,
      });

      const { createFinding } = await import("./finding");
      await createFinding(
        {
          engagementId: "eng-1",
          title: "Critical issue",
          statement: "System failure",
          severity: "critical",
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("finding.created");
      expect(call.payload.engagementId).toBe("eng-1");
      expect(call.payload.severity).toBe("critical");
      expect(call.visibility).toBe("internal");
    });

    it("emits batch audit event with all linked evidence", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.evidenceItem.findUnique.mockResolvedValue({
        id: "evidence-1",
        engagementId: "eng-1",
        status: "validated",
      });
      mockDb.finding.create.mockResolvedValue({
        id: "finding-1",
        engagementId: "eng-1",
        shockEventId: null,
        title: "Critical issue",
        statement: "System failure",
        severity: "critical",
        status: "draft",
        rationale: null,
        createdBy: "user-1",
        version: 1,
      });

      const { createFinding } = await import("./finding");
      await createFinding(
        {
          engagementId: "eng-1",
          title: "Critical issue",
          statement: "System failure",
          severity: "critical",
          linkedEvidenceIds: ["evidence-1"],
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalledTimes(2);

      // First call should be FINDING_CREATED
      expect(mockEmit.mock.calls[0][0].eventName).toBe("finding.created");

      // Second call should be FINDING_EVIDENCE_LINK_BATCH
      expect(mockEmit.mock.calls[1][0].eventName).toBe("finding.evidence_link_batch");
      expect(mockEmit.mock.calls[1][0].payload.findingId).toBe("finding-1");
      expect(mockEmit.mock.calls[1][0].payload.evidenceItemIds).toEqual(["evidence-1"]);
      expect(mockEmit.mock.calls[1][0].payload.engagementId).toBe("eng-1");
      expect(mockEmit.mock.calls[1][0].payload.count).toBe(1);
    });
  });
});
