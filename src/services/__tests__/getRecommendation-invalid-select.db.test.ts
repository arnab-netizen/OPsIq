import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getRecommendation } from "@/services/recommendation";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { NotFoundError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 3 Item 1 — getRecommendation invalid-select fail-closed regression proof.
 *
 * Documented follow-up after Phase 2 G2: `getRecommendation` carried the IDENTICAL invalid
 * `select` defect that G2 fixed on the listing path. Its select requested four columns that do
 * NOT exist on the `Recommendation` Prisma model:
 *   - `expectedImpact`            (real column is `estimatedImpact`)
 *   - `implementationPhase`       (no such column)
 *   - `executionCertaintyScore`   (no such column)
 *   - `scoreBreakdown`            (no such column)
 * As a result `prisma.recommendation.findUnique` threw PrismaClientValidationError on EVERY call,
 * i.e. the owner-facing single-recommendation API route
 * (GET  /api/recommendations/[recommendationId]  and the PATCH re-read at its tail) returned a 500
 * on every request for a recommendation the owner can legitimately view.
 *
 * This test drives the real `getRecommendation` service — the exact call behind that route — against
 * the real database. It FAILS against the pre-fix invalid select (the call throws
 * PrismaClientValidationError) and PASSES against the corrected select. It also asserts
 * workspace isolation: a recommendation is invisible to a foreign workspace (NotFoundError, not a
 * 500 and not a cross-tenant read).
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true (the maintained CI build-and-test lane
 * sets it). Setup mirrors the proven Wave-3 / G2 recommendation DB tests.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "Phase 3 Item 1 — getRecommendation does not 500 on a valid recommendation (invalid-select regression)",
  () => {
    const workspaceId = uuidv4();
    const otherWorkspaceId = uuidv4();
    const clientId = uuidv4();
    const engagementId = uuidv4();
    const userId = uuidv4();
    const recommendationId = uuidv4();
    const stamp = `${uuidv4()}`;

    beforeAll(async () => {
      await db.user.create({
        data: { id: userId, email: `p3-getrec-${stamp}@test.local`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: "P3 getRec WS", slug: `p3-getrec-${stamp}` },
      });
      await db.workspace.create({
        data: {
          id: otherWorkspaceId,
          name: "P3 getRec WS (other)",
          slug: `p3-getrec-other-${stamp}`,
        },
      });
      await db.clientAccount.create({
        data: { id: clientId, name: "P3 getRec Client", createdBy: userId, updatedAt: new Date() },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `P3-GETREC-${stamp}`,
          title: "P3 getRec Engagement",
          clientId,
          serviceTier: "tier_1",
          engagementMode: "strategic_planning",
          workspaceId,
          updatedAt: new Date(),
        },
      });
      await db.recommendation.create({
        data: {
          id: recommendationId,
          engagementId,
          workspaceId,
          title: `P3 getRec Recommendation ${stamp}`,
          description: "Owner-viewable recommendation body",
          priority: "high",
          status: "pending",
          estimatedImpact: "Material revenue protection",
          createdBy: userId,
        },
      });
    });

    afterAll(async () => {
      try {
        await db.recommendation.deleteMany({ where: { id: recommendationId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.workspace.deleteMany({
          where: { id: { in: [workspaceId, otherWorkspaceId] } },
        });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup
      }
    });

    it("returns the recommendation without throwing (pre-fix invalid select would 500)", async () => {
      const rec = await getRecommendation(recommendationId, workspaceId);

      expect(rec).not.toBeNull();
      expect(rec.id).toBe(recommendationId);
      expect(rec.engagementId).toBe(engagementId);
      expect(rec.title).toContain("P3 getRec Recommendation");
      expect(rec.priority).toBe("high");
      // The corrected select surfaces the REAL impact column (estimatedImpact), not the
      // non-existent `expectedImpact` the pre-fix select requested.
      expect(rec.estimatedImpact).toBe("Material revenue protection");
      // The engagement relation select must resolve.
      expect(rec.engagement?.id).toBe(engagementId);
      // The finding relation select must resolve (null here — no finding attached — which still
      // exercises the relation-select branch without throwing).
      expect(rec.finding).toBeNull();
    });

    it("isolates by workspace: a foreign workspace cannot read the recommendation (NotFound, not 500)", async () => {
      await expect(
        getRecommendation(recommendationId, otherWorkspaceId)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  }
);
