import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  createEvidenceItem,
  updateEvidenceItem,
  listEvidenceForEngagement,
  getEvidenceItemDetail,
  createFileBlob,
  linkFileToEvidenceItem,
  createEvidenceBundle,
  listEvidenceBundlesForEngagement,
} from "./evidence";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import type { CreateEvidenceItemInput, CreateFileBlobInput } from "./evidence";

describe("Evidence Service", () => {
  let clientId: string;
  let engagementId: string;
  let actorId = "test-actor-id";

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client - Evidence",
        industry: "Finance",
        size: "medium",
      },
      actorId
    );
    clientId = client.id;

    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "standard",
        engagementMode: "beginner",
        interventionMode: "stabilization",
      },
      actorId
    );
    engagementId = engagement.id;
  });

  afterAll(async () => {
    await db.evidence.deleteMany({ where: { engagementId } });
    await db.evidenceBundle.deleteMany({ where: { engagementId } });
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
  });

  describe("createEvidenceItem", () => {
    it("should create evidence item with valid input", async () => {
      const input: CreateEvidenceItemInput = {
        engagementId,
        category: "financial",
        type: "cash_flow_analysis",
        sourceType: "document",
        sourceLabel: "Q1 2026 Bank Statements",
        sourceOwner: "CFO",
        captureMethod: "uploaded",
        capturedAt: "2026-04-22T10:00:00Z",
        statement: "Bank balance declining 15% month-over-month",
      };

      const result = await createEvidenceItem(input, actorId);
      expect(result.id).toBeDefined();
      expect(result.engagementId).toBe(engagementId);

      const item = await getEvidenceItemDetail(result.id);
      expect(item.category).toBe("financial");
      expect(item.sourceType).toBe("document");
    });

    it("should reject invalid category", async () => {
      const input = {
        engagementId,
        category: "invalid_category",
        type: "test",
        sourceType: "interview",
        sourceLabel: "Test",
        captureMethod: "manual",
        capturedAt: "2026-04-22T10:00:00Z",
      } as any;

      expect(async () => {
        await createEvidenceItem(input, actorId);
      }).rejects.toThrow("Invalid evidence category");
    });

    it("should reject invalid source type", async () => {
      const input = {
        engagementId,
        category: "operational",
        type: "test",
        sourceType: "invalid_source",
        sourceLabel: "Test",
        captureMethod: "manual",
        capturedAt: "2026-04-22T10:00:00Z",
      } as any;

      expect(async () => {
        await createEvidenceItem(input, actorId);
      }).rejects.toThrow("Invalid source type");
    });

    it("should reject invalid capture method", async () => {
      const input = {
        engagementId,
        category: "human",
        type: "test",
        sourceType: "interview",
        sourceLabel: "Test",
        captureMethod: "invalid_method",
        capturedAt: "2026-04-22T10:00:00Z",
      } as any;

      expect(async () => {
        await createEvidenceItem(input, actorId);
      }).rejects.toThrow("Invalid capture method");
    });

    it("should support all valid categories", async () => {
      const categories = [
        "financial",
        "operational",
        "human",
        "resilience",
        "client",
        "commercial",
        "leadership",
        "execution",
      ];

      for (const category of categories) {
        const result = await createEvidenceItem(
          {
            engagementId,
            category: category as any,
            type: "test",
            sourceType: "metric",
            sourceLabel: "Test Metric",
            captureMethod: "extracted",
            capturedAt: "2026-04-22T10:00:00Z",
          },
          actorId
        );
        expect(result.id).toBeDefined();
      }
    });
  });

  describe("updateEvidenceItem", () => {
    let evidenceId: string;

    beforeAll(async () => {
      const result = await createEvidenceItem(
        {
          engagementId,
          category: "client",
          type: "client_feedback",
          sourceType: "client_feedback",
          sourceLabel: "Monthly Touchbase",
          captureMethod: "manual",
          capturedAt: "2026-04-20T10:00:00Z",
        },
        actorId
      );
      evidenceId = result.id;
    });

    it("should update evidence item", async () => {
      const existing = await getEvidenceItemDetail(evidenceId);
      const result = await updateEvidenceItem(
        evidenceId,
        {
          statement: "Client expressed concern about timeline",
          validationStatus: "validated",
          version: existing.version,
        },
        actorId
      );

      expect(result.id).toBe(evidenceId);

      const updated = await getEvidenceItemDetail(evidenceId);
      expect(updated.statement).toBe("Client expressed concern about timeline");
      expect(updated.validationStatus).toBe("validated");
      expect(updated.version).toBe(existing.version + 1);
    });

    it("should reject version conflict", async () => {
      expect(async () => {
        await updateEvidenceItem(
          evidenceId,
          {
            validationStatus: "validated",
            version: 999,
          },
          actorId
        );
      }).rejects.toThrow("Version conflict");
    });
  });

  describe("listEvidenceForEngagement", () => {
    beforeAll(async () => {
      await createEvidenceItem(
        {
          engagementId,
          category: "leadership",
          type: "team_assessment",
          sourceType: "interview",
          sourceLabel: "Leadership interviews",
          captureMethod: "manual",
          capturedAt: "2026-04-15T10:00:00Z",
        },
        actorId
      );

      await createEvidenceItem(
        {
          engagementId,
          category: "resilience",
          type: "stress_test",
          sourceType: "document",
          sourceLabel: "Business continuity plan",
          captureMethod: "uploaded",
          capturedAt: "2026-04-18T10:00:00Z",
        },
        actorId
      );
    });

    it("should list all evidence for engagement", async () => {
      const evidence = await listEvidenceForEngagement(engagementId);
      expect(evidence.length).toBeGreaterThanOrEqual(2);
    });

    it("should throw for non-existent engagement", async () => {
      expect(async () => {
        await listEvidenceForEngagement("non-existent-id");
      }).rejects.toThrow("not found");
    });
  });

  describe("createFileBlob", () => {
    it("should create file blob", async () => {
      const input: CreateFileBlobInput = {
        storageKey: "s3://bucket/files/evidence-2026-04-22.pdf",
        fileName: "evidence.pdf",
        mimeType: "application/pdf",
        size: 2048000,
      };

      const result = await createFileBlob(input, actorId);
      expect(result.id).toBeDefined();

      const blob = await db.fileBlob.findUnique({
        where: { id: result.id },
      });
      expect(blob?.fileName).toBe("evidence.pdf");
      expect(blob?.size).toBe(2048000);
    });

    it("should reject invalid file blob input", async () => {
      const input = {
        storageKey: "",
        fileName: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
      };

      expect(async () => {
        await createFileBlob(input, actorId);
      }).rejects.toThrow("Invalid file blob input");
    });
  });

  describe("linkFileToEvidenceItem", () => {
    let evidenceId: string;
    let fileBlobId: string;

    beforeAll(async () => {
      const evidenceResult = await createEvidenceItem(
        {
          engagementId,
          category: "commercial",
          type: "contract",
          sourceType: "document",
          sourceLabel: "Client contract",
          captureMethod: "uploaded",
          capturedAt: "2026-04-22T10:00:00Z",
        },
        actorId
      );
      evidenceId = evidenceResult.id;

      const fileResult = await createFileBlob(
        {
          storageKey: "s3://bucket/files/contract-2026.pdf",
          fileName: "contract.pdf",
          mimeType: "application/pdf",
          size: 512000,
        },
        actorId
      );
      fileBlobId = fileResult.id;
    });

    it("should link file to evidence item", async () => {
      const result = await linkFileToEvidenceItem(
        evidenceId,
        fileBlobId,
        actorId
      );
      expect(result.id).toBeDefined();

      const link = await db.evidenceItemFileLink.findUnique({
        where: { id: result.id },
      });
      expect(link?.evidenceItemId).toBe(evidenceId);
      expect(link?.fileBlobId).toBe(fileBlobId);
    });

    it("should reject linking to non-existent evidence", async () => {
      expect(async () => {
        await linkFileToEvidenceItem(
          "non-existent-id",
          fileBlobId,
          actorId
        );
      }).rejects.toThrow("not found");
    });
  });

  describe("createEvidenceBundle", () => {
    it("should create evidence bundle", async () => {
      const result = await createEvidenceBundle(
        {
          engagementId,
          title: "Phase 1 Discovery",
          description: "All evidence collected during discovery phase",
        },
        actorId
      );

      expect(result.id).toBeDefined();
      expect(result.engagementId).toBe(engagementId);

      const bundle = await db.evidenceBundle.findUnique({
        where: { id: result.id },
      });
      expect(bundle?.title).toBe("Phase 1 Discovery");
    });
  });

  describe("listEvidenceBundlesForEngagement", () => {
    beforeAll(async () => {
      await createEvidenceBundle(
        {
          engagementId,
          title: "Phase 2 Analysis",
          description: "Evidence from analysis phase",
        },
        actorId
      );
    });

    it("should list all bundles for engagement", async () => {
      const bundles = await listEvidenceBundlesForEngagement(engagementId);
      expect(bundles.length).toBeGreaterThanOrEqual(1);
    });

    it("should throw for non-existent engagement", async () => {
      expect(async () => {
        await listEvidenceBundlesForEngagement("non-existent-id");
      }).rejects.toThrow("not found");
    });
  });
});
