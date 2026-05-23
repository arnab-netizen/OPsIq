import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { getEvidenceById, listEvidence } from "./evidence";
import { getFindingDetail, listFindingsForEngagement } from "./findings";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { createEvidence } from "./evidence";
import { createFinding } from "./findings";
import { TEST_IDS } from "@/domain/constants/test-ids";

describe("Visibility Enforcement", () => {
  let clientId: string;
  let engagementId: string;
  let internalEvidenceId: string;
  let clientVisibleEvidenceId: string;
  let internalFindingId: string;
  let clientVisibleFindingId: string;
  const actorId = TEST_IDS.TEST_ACTOR_ID;

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
    const internalEvidence = await createEvidence(
      {
        engagementId,
        title: "Internal audit observation",
        description: "Internal process issue",
        evidenceType: "observation",
        sourceReference: "Internal audit",
        severity: "medium",
      },
      actorId
    );
    internalEvidenceId = internalEvidence.id;

    // Create client-visible evidence
    const clientEvidence = await createEvidence(
      {
        engagementId,
        title: "Financial reports",
        description: "Revenue trend analysis",
        evidenceType: "document",
        sourceReference: "Q1 2026 Financial Analysis",
        severity: "high",
      },
      actorId
    );
    clientVisibleEvidenceId = clientEvidence.id;

    // Create internal-only finding
    const internalFinding = await createFinding(
      {
        engagementId,
        primaryEvidenceId: internalEvidenceId,
        title: "Internal Management Issue",
        summary: "Internal management concern requiring attention",
        severity: "medium",
        impactArea: "execution",
      },
      actorId
    );
    internalFindingId = internalFinding.id;

    // Create client-visible finding
    const clientFinding = await createFinding(
      {
        engagementId,
        primaryEvidenceId: clientVisibleEvidenceId,
        title: "Financial Performance Finding",
        summary: "Financial analysis finding that can be shared with client",
        severity: "high",
        impactArea: "revenue",
      },
      actorId
    );
    clientVisibleFindingId = clientFinding.id;
  });

  afterAll(async () => {
    try {
      await (db.finding.deleteMany as unknown)({ where: { engagementId } });
      await (db.evidence.deleteMany as unknown)({ where: { engagementId } });
      await (db.engagement.deleteMany as unknown)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as unknown)({ where: { id: clientId } });
    } catch {
      // Cleanup best-effort
    }
  });

  describe("evidence visibility enforcement", () => {
    it("should filter internal-only evidence from client view", async () => {
      const internalOnly = await listEvidence(
        engagementId,
        undefined,
        "internal"
      );
      await expect(internalOnly.some((e) => e.id === internalEvidenceId)).toBe(true);

      const clientVisible = await listEvidence(
        engagementId,
        undefined,
        "client_visible"
      );
      await expect(clientVisible.some((e) => e.id === internalEvidenceId)).toBe(false);
      expect(clientVisible.some((e) => e.id === clientVisibleEvidenceId)).toBe(
        true
      );
    });

    it("should throw when accessing internal-only evidence with client visibility", async () => {
      await expect(async () => {
        await getEvidenceById(internalEvidenceId, "client_visible");
      }).rejects.toThrow("not found");
    });

    it("should allow accessing client-visible evidence", async () => {
      const evidence = await getEvidenceById(
        clientVisibleEvidenceId,
        "client_visible"
      );
      expect(evidence.id).toBe(clientVisibleEvidenceId);
    });

    it("should not expose visibility classification in response", async () => {
      const evidence = await getEvidenceById(internalEvidenceId, "all");
      expect((evidence as unknown).visibilityClassification).toBeUndefined();
    });

    it("should allow accessing all evidence with 'all' visibility", async () => {
      const all = await listEvidence(
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
      await expect(async () => {
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
      expect((finding as unknown).clientVisibilityStatus).toBeUndefined();
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
      const clientEvidence = await listEvidence(
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
