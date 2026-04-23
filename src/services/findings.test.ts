import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  createFinding,
  updateFinding,
  listFindingsForEngagement,
  getFindingDetail,
  validateFinding,
  disputeFinding,
  supersedeFinding,
  linkEvidenceToFinding,
} from "./findings";
import { createEvidenceItem } from "./evidence";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import type { CreateFindingInput } from "./findings";

describe("Findings Service", () => {
  let clientId: string;
  let engagementId: string;
  let evidenceId: string;
  let actorId = "test-actor-id";

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client - Findings",
        industry: "Retail",
        size: "large",
      },
      actorId
    );
    clientId = client.id;

    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "enterprise",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      actorId
    );
    engagementId = engagement.id;

    // Create evidence item for linking
    const evidence = await createEvidenceItem(
      {
        engagementId,
        category: "financial",
        type: "revenue_decline",
        sourceType: "metric",
        sourceLabel: "Monthly revenue reports",
        captureMethod: "extracted",
        capturedAt: "2026-04-20T10:00:00Z",
        statement: "Revenue down 25% YoY",
      },
      actorId
    );
    evidenceId = evidence.id;
  });

  afterAll(async () => {
    await db.finding.deleteMany({ where: { engagementId } });
    await db.evidence.deleteMany({ where: { engagementId } });
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
  });

  describe("createFinding", () => {
    it("should create finding with valid input", async () => {
      const input: CreateFindingInput = {
        engagementId,
        title: "Declining Cash Position",
        statement: "The company is experiencing a significant cash decline due to operational losses",
        severity: "critical",
        confidenceLabel: "high",
        clientVisibilityStatus: "client_visible",
      };

      const result = await createFinding(input, actorId);
      expect(result.id).toBeDefined();
      expect(result.engagementId).toBe(engagementId);

      const finding = await getFindingDetail(result.id);
      expect(finding.title).toBe("Declining Cash Position");
      expect(finding.severity).toBe("critical");
      expect(finding.status).toBe("draft");
      expect(finding.provisionalFlag).toBe(false);
    });

    it("should reject invalid severity", async () => {
      const input = {
        engagementId,
        title: "Test",
        statement: "Test finding",
        severity: "extreme",
        confidenceLabel: "high",
      } as any;

      expect(async () => {
        await createFinding(input, actorId);
      }).rejects.toThrow("Invalid severity");
    });

    it("should reject invalid confidence label", async () => {
      const input = {
        engagementId,
        title: "Test",
        statement: "Test finding",
        severity: "high",
        confidenceLabel: "very_high",
      } as any;

      expect(async () => {
        await createFinding(input, actorId);
      }).rejects.toThrow("Invalid confidence label");
    });

    it("should reject empty title", async () => {
      const input: CreateFindingInput = {
        engagementId,
        title: "",
        statement: "Test finding",
        severity: "medium",
        confidenceLabel: "medium",
      };

      expect(async () => {
        await createFinding(input, actorId);
      }).rejects.toThrow("title is required");
    });

    it("should reject empty statement", async () => {
      const input: CreateFindingInput = {
        engagementId,
        title: "Test Finding",
        statement: "   ",
        severity: "medium",
        confidenceLabel: "low",
      };

      expect(async () => {
        await createFinding(input, actorId);
      }).rejects.toThrow("statement is required");
    });

    it("should support all severity levels", async () => {
      const severities = ["low", "medium", "high", "critical"];

      for (const severity of severities) {
        const result = await createFinding(
          {
            engagementId,
            title: `Finding - ${severity}`,
            statement: `This is a ${severity} severity finding`,
            severity: severity as any,
            confidenceLabel: "medium",
          },
          actorId
        );
        expect(result.id).toBeDefined();
      }
    });
  });

  describe("updateFinding", () => {
    let findingId: string;

    beforeAll(async () => {
      const result = await createFinding(
        {
          engagementId,
          title: "Operational Inefficiency",
          statement: "Current processes are inefficient",
          severity: "medium",
          confidenceLabel: "medium",
        },
        actorId
      );
      findingId = result.id;
    });

    it("should update finding", async () => {
      const existing = await getFindingDetail(findingId);
      const result = await updateFinding(
        findingId,
        {
          statement: "Processes need significant overhaul",
          severity: "high",
          version: existing.version,
        },
        actorId
      );

      expect(result.id).toBe(findingId);

      const updated = await getFindingDetail(findingId);
      expect(updated.statement).toBe("Processes need significant overhaul");
      expect(updated.severity).toBe("high");
      expect(updated.version).toBe(existing.version + 1);
    });

    it("should reject version conflict", async () => {
      expect(async () => {
        await updateFinding(
          findingId,
          {
            severity: "low",
            version: 999,
          },
          actorId
        );
      }).rejects.toThrow("Version conflict");
    });

    it("should reject invalid status", async () => {
      const existing = await getFindingDetail(findingId);
      expect(async () => {
        await updateFinding(
          findingId,
          {
            status: "invalid_status",
            version: existing.version,
          } as any,
          actorId
        );
      }).rejects.toThrow("Invalid finding status");
    });
  });

  describe("listFindingsForEngagement", () => {
    beforeAll(async () => {
      await createFinding(
        {
          engagementId,
          title: "Staffing Gap",
          statement: "Critical positions are unfilled",
          severity: "high",
          confidenceLabel: "high",
        },
        actorId
      );

      await createFinding(
        {
          engagementId,
          title: "Technology Debt",
          statement: "Legacy systems need modernization",
          severity: "medium",
          confidenceLabel: "medium",
        },
        actorId
      );
    });

    it("should list all findings for engagement", async () => {
      const findings = await listFindingsForEngagement(engagementId);
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });

    it("should throw for non-existent engagement", async () => {
      expect(async () => {
        await listFindingsForEngagement("non-existent-id");
      }).rejects.toThrow("not found");
    });
  });

  describe("validateFinding", () => {
    let findingId: string;

    beforeAll(async () => {
      const result = await createFinding(
        {
          engagementId,
          title: "Market Expansion Risk",
          statement: "Company lacks experience in target market",
          severity: "high",
          confidenceLabel: "high",
        },
        actorId
      );
      findingId = result.id;
    });

    it("should validate finding", async () => {
      const result = await validateFinding(findingId, actorId);
      expect(result.id).toBe(findingId);

      const updated = await getFindingDetail(findingId);
      expect(updated.status).toBe("validated");
    });
  });

  describe("disputeFinding", () => {
    let findingId: string;

    beforeAll(async () => {
      const result = await createFinding(
        {
          engagementId,
          title: "Disputed Finding",
          statement: "This finding might not be accurate",
          severity: "low",
          confidenceLabel: "low",
        },
        actorId
      );
      findingId = result.id;
    });

    it("should dispute finding", async () => {
      const result = await disputeFinding(findingId, actorId);
      expect(result.id).toBe(findingId);

      const updated = await getFindingDetail(findingId);
      expect(updated.status).toBe("disputed");
    });
  });

  describe("supersedeFinding", () => {
    let oldFindingId: string;

    beforeAll(async () => {
      const result = await createFinding(
        {
          engagementId,
          title: "Original Finding",
          statement: "This is the original finding",
          severity: "medium",
          confidenceLabel: "medium",
        },
        actorId
      );
      oldFindingId = result.id;
    });

    it("should supersede finding", async () => {
      const result = await supersedeFinding(
        oldFindingId,
        {
          engagementId,
          title: "Updated Finding",
          statement: "This supersedes the original finding",
          severity: "high",
          confidenceLabel: "high",
        },
        actorId
      );

      expect(result.id).toBeDefined();
      expect(result.supersededFindingId).toBe(oldFindingId);

      const oldFinding = await getFindingDetail(oldFindingId);
      expect(oldFinding.status).toBe("superseded");

      const newFinding = await getFindingDetail(result.id);
      expect(newFinding.supersedesFindingId).toBe(oldFindingId);
    });
  });

  describe("linkEvidenceToFinding", () => {
    let findingId: string;

    beforeAll(async () => {
      const result = await createFinding(
        {
          engagementId,
          title: "Evidence-backed Finding",
          statement: "This finding is supported by evidence",
          severity: "critical",
          confidenceLabel: "high",
        },
        actorId
      );
      findingId = result.id;
    });

    it("should link evidence to finding", async () => {
      const result = await linkEvidenceToFinding(
        findingId,
        evidenceId,
        "supports",
        actorId
      );

      expect(result.id).toBeDefined();

      const finding = await getFindingDetail(findingId);
      expect(finding.evidenceLinks).toBeDefined();
      expect(finding.evidenceLinks?.length).toBeGreaterThan(0);
    });

    it("should support different link types", async () => {
      // Create another finding for additional link tests
      const result = await createFinding(
        {
          engagementId,
          title: "Multi-link Finding",
          statement: "Finding with multiple evidence links",
          severity: "high",
          confidenceLabel: "medium",
        },
        actorId
      );
      const newFindingId = result.id;

      // Create more evidence
      const evidence2 = await createEvidenceItem(
        {
          engagementId,
          category: "operational",
          type: "efficiency",
          sourceType: "observation",
          sourceLabel: "Process observation",
          captureMethod: "manual",
          capturedAt: "2026-04-21T10:00:00Z",
        },
        actorId
      );

      // Test different link types
      const linkSupports = await linkEvidenceToFinding(
        newFindingId,
        evidenceId,
        "supports",
        actorId
      );
      expect(linkSupports.id).toBeDefined();

      const linkContext = await linkEvidenceToFinding(
        newFindingId,
        evidence2.id,
        "context",
        actorId
      );
      expect(linkContext.id).toBeDefined();
    });

    it("should reject invalid link type", async () => {
      expect(async () => {
        await linkEvidenceToFinding(
          findingId,
          evidenceId,
          "invalid_type" as any,
          actorId
        );
      }).rejects.toThrow("Invalid link type");
    });

    it("should reject linking finding and evidence from different engagements", async () => {
      // Create another engagement
      const client2 = await createClient(
        {
          name: "Other Client",
          industry: "Tech",
        },
        actorId
      );

      const engagement2 = await createEngagement(
        {
          title: "Other Engagement",
          clientId: client2.id,
          serviceTier: "standard",
          engagementMode: "beginner",
          interventionMode: "growth",
        },
        actorId
      );

      // Create evidence in different engagement
      const evidence3 = await createEvidenceItem(
        {
          engagementId: engagement2.id,
          category: "human",
          type: "assessment",
          sourceType: "interview",
          sourceLabel: "Team interview",
          captureMethod: "manual",
          capturedAt: "2026-04-22T10:00:00Z",
        },
        actorId
      );

      expect(async () => {
        await linkEvidenceToFinding(
          findingId,
          evidence3.id,
          "supports",
          actorId
        );
      }).rejects.toThrow("Finding and evidence must belong to the same engagement");

      // Cleanup
      await db.evidenceItem.delete({ where: { id: evidence3.id } });
      await db.engagement.delete({ where: { id: engagement2.id } });
      await db.clientAccount.delete({ where: { id: client2.id } });
    });
  });

  describe("finding status validation", () => {
    it("should have correct initial status for new findings", async () => {
      const result = await createFinding(
        {
          engagementId,
          title: "New Status Test",
          statement: "Test",
          severity: "medium",
          confidenceLabel: "medium",
        },
        actorId
      );

      const finding = await getFindingDetail(result.id);
      expect(finding.status).toBe("draft");
    });

    it("should support all valid statuses", async () => {
      const validStatuses = [
        "draft",
        "under_review",
        "validated",
        "disputed",
      ];

      for (const status of validStatuses) {
        const result = await createFinding(
          {
            engagementId,
            title: `Finding - ${status}`,
            statement: `Finding with ${status} status`,
            severity: "low",
            confidenceLabel: "low",
          },
          actorId
        );

        const existing = await getFindingDetail(result.id);
        if (status !== "draft") {
          await updateFinding(
            result.id,
            {
              status: status as any,
              version: existing.version,
            },
            actorId
          );

          const updated = await getFindingDetail(result.id);
          expect(updated.status).toBe(status);
        }
      }
    });
  });

  describe("createFinding transaction behavior", () => {
    it("should create finding atomically with audit event", async () => {
      const input: CreateFindingInput = {
        engagementId,
        title: "Transaction Test Finding",
        statement: "This finding was created within a transaction",
        severity: "critical",
        confidenceLabel: "high",
        clientVisibilityStatus: "client_visible",
      };

      const result = await createFinding(input, actorId);
      expect(result.id).toBeDefined();

      // Verify the finding was created
      const finding = await getFindingDetail(result.id);
      expect(finding.title).toBe("Transaction Test Finding");
      expect(finding.severity).toBe("critical");

      // Verify audit event was emitted
      const auditEvents = await db.auditEvent.findMany({
        where: {
          entityId: result.id,
          eventName: "finding.created",
        },
      });
      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0].payload).toBeDefined();
      expect(auditEvents[0].payload).toHaveProperty("severity");
      expect(auditEvents[0].payload).toHaveProperty("title");
    });
  });
});
