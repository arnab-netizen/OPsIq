import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { getEvidenceItemDetail, listEvidenceForEngagement } from "./evidence";
import { getFindingDetail, listFindingsForEngagement } from "./findings";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { createEvidenceItem } from "./evidence";
import { createFinding } from "./findings";

describe("Visibility Enforcement", () => {
  let clientId: string;
  let engagementId: string;
  let internalEvidenceId: string;
  let clientVisibleEvidenceId: string;
  let internalFindingId: string;
  let clientVisibleFindingId: string;
  let actorId = "test-actor-id";

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client - Visibility",
        industry: "Technology",
        size: "large",
      },
      actorId
    );
    clientId = client.id;

    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      actorId
    );
    engagementId = engagement.id;

    // Create internal-only evidence
    const internalEvidence = await createEvidenceItem(
      {
        engagementId,
        category: "operational",
        type: "internal_process",
        sourceType: "observation",
        sourceLabel: "Internal audit",
        captureMethod: "manual",
        capturedAt: "2026-04-22T10:00:00Z",
        visibilityClassification: "internal",
        statement: "Internal process issue",
      },
      actorId
    );
    internalEvidenceId = internalEvidence.id;

    // Create client-visible evidence
    const clientEvidence = await createEvidenceItem(
      {
        engagementId,
        category: "financial",
        type: "revenue_analysis",
        sourceType: "document",
        sourceLabel: "Financial reports",
        captureMethod: "uploaded",
        capturedAt: "2026-04-22T10:00:00Z",
        visibilityClassification: "client_visible",
        statement: "Revenue trend analysis",
      },
      actorId
    );
    clientVisibleEvidenceId = clientEvidence.id;

    // Create internal-only finding
    const internalFinding = await createFinding(
      {
        engagementId,
        title: "Internal Management Issue",
        statement: "Internal management concern not to be shared",
        severity: "medium",
        confidenceLabel: "high",
        clientVisibilityStatus: "internal",
      },
      actorId
    );
    internalFindingId = internalFinding.id;

    // Create client-visible finding
    const clientFinding = await createFinding(
      {
        engagementId,
        title: "Financial Performance Finding",
        statement: "Financial analysis finding that can be shared",
        severity: "high",
        confidenceLabel: "high",
        clientVisibilityStatus: "client_visible",
      },
      actorId
    );
    clientVisibleFindingId = clientFinding.id;
  });

  afterAll(async () => {
    try {
      await (db.finding.deleteMany as any)({ where: { engagementId } });
      await (db.evidenceItem.deleteMany as any)({ where: { engagementId } });
      await (db.engagement.deleteMany as any)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as any)({ where: { id: clientId } });
    } catch {
      // Cleanup best-effort
    }
  });

  describe("evidence visibility enforcement", () => {
    it("should filter internal-only evidence from client view", async () => {
      const internalOnly = await listEvidenceForEngagement(
        engagementId,
        undefined,
        "internal"
      );
      expect(internalOnly.some((e) => e.id === internalEvidenceId)).toBe(true);

      const clientVisible = await listEvidenceForEngagement(
        engagementId,
        undefined,
        "client_visible"
      );
      expect(clientVisible.some((e) => e.id === internalEvidenceId)).toBe(false);
      expect(clientVisible.some((e) => e.id === clientVisibleEvidenceId)).toBe(
        true
      );
    });

    it("should throw when accessing internal-only evidence with client visibility", async () => {
      expect(async () => {
        await getEvidenceItemDetail(internalEvidenceId, "client_visible");
      }).rejects.toThrow("not found");
    });

    it("should allow accessing client-visible evidence", async () => {
      const evidence = await getEvidenceItemDetail(
        clientVisibleEvidenceId,
        "client_visible"
      );
      expect(evidence.id).toBe(clientVisibleEvidenceId);
    });

    it("should not expose visibility classification in response", async () => {
      const evidence = await getEvidenceItemDetail(internalEvidenceId, "all");
      expect((evidence as any).visibilityClassification).toBeUndefined();
    });

    it("should allow accessing all evidence with 'all' visibility", async () => {
      const all = await listEvidenceForEngagement(
        engagementId,
        undefined,
        "all"
      );
      expect(all.some((e) => e.id === internalEvidenceId)).toBe(true);
      expect(all.some((e) => e.id === clientVisibleEvidenceId)).toBe(true);
    });
  });

  describe("finding visibility enforcement", () => {
    it("should filter internal-only findings from client view", async () => {
      const internalOnly = await listFindingsForEngagement(
        engagementId,
        undefined,
        "internal"
      );
      expect(internalOnly.some((f) => f.id === internalFindingId)).toBe(true);

      const clientVisible = await listFindingsForEngagement(
        engagementId,
        undefined,
        "client_visible"
      );
      expect(clientVisible.some((f) => f.id === internalFindingId)).toBe(false);
      expect(clientVisible.some((f) => f.id === clientVisibleFindingId)).toBe(
        true
      );
    });

    it("should throw when accessing internal-only finding with client visibility", async () => {
      expect(async () => {
        await getFindingDetail(internalFindingId, "client_visible");
      }).rejects.toThrow("not found");
    });

    it("should allow accessing client-visible findings", async () => {
      const finding = await getFindingDetail(
        clientVisibleFindingId,
        "client_visible"
      );
      expect(finding.id).toBe(clientVisibleFindingId);
    });

    it("should not expose clientVisibilityStatus in response", async () => {
      const finding = await getFindingDetail(internalFindingId, "all");
      expect((finding as any).clientVisibilityStatus).toBeUndefined();
    });

    it("should allow accessing all findings with 'all' visibility", async () => {
      const all = await listFindingsForEngagement(
        engagementId,
        undefined,
        "all"
      );
      expect(all.some((f) => f.id === internalFindingId)).toBe(true);
      expect(all.some((f) => f.id === clientVisibleFindingId)).toBe(true);
    });
  });

  describe("security boundaries", () => {
    it("should prevent client from accessing internal evidence", async () => {
      // Simulate client request with client_visible filter
      const clientEvidence = await listEvidenceForEngagement(
        engagementId,
        undefined,
        "client_visible"
      );

      const internalData = clientEvidence.find((e) => e.id === internalEvidenceId);
      expect(internalData).toBeUndefined();
    });

    it("should prevent client from accessing internal findings", async () => {
      // Simulate client request with client_visible filter
      const clientFindings = await listFindingsForEngagement(
        engagementId,
        undefined,
        "client_visible"
      );

      const internalData = clientFindings.find(
        (f) => f.id === internalFindingId
      );
      expect(internalData).toBeUndefined();
    });
  });
});
