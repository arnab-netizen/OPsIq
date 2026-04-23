import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { generateRecommendations, listRecommendationsForEngagement } from "./recommendation";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { createFinding } from "./findings";
import { createEvidence } from "./evidence";

describe("Recommendation Service", () => {
  let clientId: string;
  let engagementId: string;
  let findingId: string;
  let actorId = "test-actor-id";

  beforeAll(async () => {
    const client = await createClient(
      {
        name: "Test Client - Recommendation",
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

    const finding = await createFinding(
      {
        engagementId,
        title: "Critical Finding",
        statement: "This is a critical finding",
        severity: "critical",
        confidenceLabel: "high",
      },
      actorId
    );
    findingId = finding.id;
  });

  afterAll(async () => {
    try {
      await (db.recommendation.deleteMany as any)({ where: { engagementId } });
      await (db.finding.deleteMany as any)({ where: { engagementId } });
      await (db.evidenceItem.deleteMany as any)({ where: { engagementId } });
      await (db.engagement.deleteMany as any)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as any)({ where: { id: clientId } });
    } catch {
      // Cleanup best-effort
    }
  });

  describe("generateRecommendations", () => {
    it("should generate recommendations deterministically from findings", async () => {
      const result1 = await generateRecommendations(
        {
          engagementId,
          findingIds: [findingId],
          considerShockState: false,
        },
        actorId
      );

      const result2 = await generateRecommendations(
        {
          engagementId,
          findingIds: [findingId],
          considerShockState: false,
        },
        actorId
      );

      expect(result1.length).toBe(result2.length);
      if (result1.length > 0) {
        expect(result1[0].title).toBe(result2[0].title);
        expect(result1[0].severity).toBe(result2[0].severity);
      }
    });

    it("should generate structured recommendations", async () => {
      const result = await generateRecommendations(
        {
          engagementId,
          findingIds: [findingId],
        },
        actorId
      );

      expect(result.length).toBeGreaterThan(0);
      const rec = result[0];
      expect(rec.id).toBeDefined();
      expect(rec.title).toBeDefined();
      expect(rec.statement).toBeDefined();
      expect(rec.severity).toBeDefined();
      expect(rec.rationale).toBeDefined();
      expect(rec.priority).toBeDefined();
      expect(rec.status).toBe("draft");
    });

    it("should trace recommendations to source findings", async () => {
      const result = await generateRecommendations(
        {
          engagementId,
          findingIds: [findingId],
        },
        actorId
      );

      expect(result.length).toBeGreaterThan(0);
      const rec = result[0];
      expect(rec.sourceFindingIds).toBeDefined();
      expect(rec.sourceFindingIds.length).toBeGreaterThan(0);
      expect(rec.sourceFindingIds).toContain(findingId);
    });

    it("should generate critical recommendations for critical findings", async () => {
      const result = await generateRecommendations(
        {
          engagementId,
          findingIds: [findingId],
        },
        actorId
      );

      expect(result.length).toBeGreaterThan(0);
      const rec = result[0];
      expect(rec.severity).toBe("critical");
      expect(rec.priority).toBe(1);
    });

    it("should return empty for engagement with no recommendations", async () => {
      // Create new engagement with no findings
      const client2 = await createClient({ name: "Client 2" }, actorId);
      const eng2 = await createEngagement(
        {
          title: "Clean Engagement",
          clientId: client2.id,
          serviceTier: "standard",
          engagementMode: "beginner",
          interventionMode: "growth",
        },
        actorId
      );

      const result = await generateRecommendations(
        {
          engagementId: eng2.id,
          findingIds: [],
          considerShockState: false,
        },
        actorId
      );

      expect(result).toEqual([]);

      // Cleanup
      await (db.engagement.deleteMany as any)({ where: { id: eng2.id } });
      await (db.clientAccount.deleteMany as any)({ where: { id: client2.id } });
    });
  });

  describe("listRecommendationsForEngagement", () => {
    beforeAll(async () => {
      await generateRecommendations(
        {
          engagementId,
          findingIds: [findingId],
        },
        actorId
      );
    });

    it("should list recommendations for engagement", async () => {
      const result = await listRecommendationsForEngagement(engagementId);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should enforce visibility filtering", async () => {
      const allRecs = await listRecommendationsForEngagement(engagementId, "all");
      const internalRecs = await listRecommendationsForEngagement(
        engagementId,
        "internal"
      );

      // Internal-only should be subset of all
      expect(internalRecs.length).toBeLessThanOrEqual(allRecs.length);
    });
  });

  describe("visibility enforcement", () => {
    it("should not leak internal visibility status in responses", async () => {
      const recs = await listRecommendationsForEngagement(engagementId, "all");
      expect(recs.length).toBeGreaterThan(0);

      // Ensure visibilityStatus is not in response
      const rec = recs[0] as any;
      expect(rec.visibilityStatus).toBeUndefined();
    });
  });
});
