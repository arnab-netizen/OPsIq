import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRecommendation,
  getRecommendationsForEngagement,
  calculateRecommendationScoreBreakdown,
  mapScoreToPriority,
} from "@/services/recommendation";
import type { RecommendationScoringInput } from "@/services/recommendation";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 1 Wave 3 — DB-backed recommendation proof (migrated integration test).
 *
 * Original intent (from the quarantined `recommendation.integration.test.ts`): prove the
 * recommendation service persists, lists, prioritises, and isolates recommendations against a
 * real database. That test targeted a since-removed API (`generateRecommendations`/
 * `listRecommendationsForEngagement`). This migration preserves the intent on the CURRENT service
 * API — `createRecommendation` (persist + priority-from-score) and `getRecommendationsForEngagement`
 * (persisted listing + ordering + engagement/workspace scoping) — and runs against the real test
 * database (gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true, the same gate the maintained CI suite
 * sets). Setup follows the proven pattern in `src/__tests__/p2a/p2a-production-path.test.ts`.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "Recommendation Service (DB-backed) — persistence, priority-from-score, listing, isolation",
  () => {
    const workspaceId = uuidv4();
    const otherWorkspaceId = uuidv4();
    const clientId = uuidv4();
    const otherClientId = uuidv4();
    const engagementId = uuidv4();
    const otherEngagementId = uuidv4();
    const userId = uuidv4();
    const stamp = `${uuidv4()}`;

    // Minimal service-layer auth context. requireServiceContext only reads verifiedActorId +
    // verifiedWorkspaceId at runtime; the object is cast to bypass the full route-shape typing
    // (mirrors the proven pattern in src/__tests__/p2a/p2a-production-path.test.ts).
    const authContext = {
      verifiedActorId: userId,
      verifiedActorType: "user",
      verifiedActor: null,
      verifiedWorkspaceId: workspaceId,
      verifiedCapabilities: ["RECOMMENDATION_CREATE"],
      verifiedSessionSnapshot: {
        actorId: userId,
        sessionId: uuidv4(),
        createdAt: new Date(),
      },
      policy: null,
    } as unknown as CanonicalAuthContext;

    // High-signal scoring input; the expected derived priority is computed with the SAME service
    // functions the create path uses, so the assertion mirrors production logic exactly.
    const scoringInput: RecommendationScoringInput = {
      impact: 5,
      urgency: 5,
      confidence: 100,
      effort: 1,
      riskReduction: 100,
      timeToImpact: 1,
      cost: 1,
      reversibility: 100,
      dependency: 0,
      strategicAlignment: 5,
    };

    beforeAll(async () => {
      await db.user.create({
        data: {
          id: userId,
          email: `wave3-rec-${stamp}@test.local`,
          updatedAt: new Date(),
        },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: "Wave3 Rec WS", slug: `wave3-rec-${stamp}` },
      });
      await db.workspace.create({
        data: {
          id: otherWorkspaceId,
          name: "Wave3 Rec WS (other)",
          slug: `wave3-rec-other-${stamp}`,
        },
      });
      await db.clientAccount.create({ data: { id: clientId, name: "Wave3 Rec Client" } });
      await db.clientAccount.create({
        data: { id: otherClientId, name: "Wave3 Rec Client (other)" },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `WAVE3-REC-${stamp}`,
          title: "Wave3 Rec Engagement",
          clientId,
          serviceTier: "tier_1",
          engagementMode: "strategic_planning",
          workspaceId,
        },
      });
      await db.engagement.create({
        data: {
          id: otherEngagementId,
          code: `WAVE3-REC-OTH-${stamp}`,
          title: "Wave3 Rec Engagement (other)",
          clientId: otherClientId,
          serviceTier: "tier_1",
          engagementMode: "strategic_planning",
          workspaceId: otherWorkspaceId,
        },
      });
      // getRecommendationsForEngagement enforces engagement access via an active membership.
      await db.engagementMembership.create({
        data: { id: uuidv4(), userId, engagementId, role: "lead" },
      });
    });

    afterAll(async () => {
      try {
        await db.recommendation.deleteMany({
          where: { engagementId: { in: [engagementId, otherEngagementId] } },
        });
        await db.engagementMembership.deleteMany({ where: { userId } });
        await db.engagement.deleteMany({
          where: { id: { in: [engagementId, otherEngagementId] } },
        });
        await db.clientAccount.deleteMany({
          where: { id: { in: [clientId, otherClientId] } },
        });
        await db.workspace.deleteMany({
          where: { id: { in: [workspaceId, otherWorkspaceId] } },
        });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup
      }
    });

    it("persists a recommendation with the caller-provided priority", async () => {
      const rec = await createRecommendation(
        {
          engagementId,
          title: `Persisted rec ${stamp}`,
          priority: "high",
        },
        authContext,
        workspaceId
      );

      expect(rec.id).toBeDefined();
      expect(rec.engagementId).toBe(engagementId);
      expect(rec.priority).toBe("high");

      // Actually persisted (row present, workspace-scoped).
      const row = await db.recommendation.findUnique({ where: { id: rec.id } });
      expect(row).not.toBeNull();
      expect(row?.workspaceId).toBe(workspaceId);
    });

    it("derives priority from scoringInput exactly as the scoring engine dictates", async () => {
      const expectedPriority = mapScoreToPriority(
        calculateRecommendationScoreBreakdown(scoringInput).finalScore
      );

      const rec = await createRecommendation(
        {
          engagementId,
          title: `Scored rec ${stamp}`,
          // Caller priority is intentionally different; scoringInput must win.
          priority: "low",
          scoringInput,
        },
        authContext,
        workspaceId
      );

      expect(rec.priority).toBe(expectedPriority);
      expect(["high", "medium", "low"]).toContain(rec.priority);
    });

    it("derives the same priority deterministically for identical scoringInput", async () => {
      const a = await createRecommendation(
        { engagementId, title: `Det A ${stamp}`, priority: "low", scoringInput },
        authContext,
        workspaceId
      );
      const b = await createRecommendation(
        { engagementId, title: `Det B ${stamp}`, priority: "low", scoringInput },
        authContext,
        workspaceId
      );
      expect(a.priority).toBe(b.priority);
    });

    it("lists persisted recommendations for the engagement, ordered by (priority desc, createdAt desc)", async () => {
      const list = await getRecommendationsForEngagement(engagementId, userId, workspaceId);

      expect(Array.isArray(list)).toBe(true);
      // The recommendations created above are persisted and returned.
      expect(list.length).toBeGreaterThanOrEqual(3);

      // Every returned row is scoped to this engagement.
      for (const rec of list) {
        expect(rec.engagementId).toBe(engagementId);
      }

      // Ordering is monotonic under the service's comparator: priority desc, then createdAt desc.
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const curr = list[i];
        expect(prev.priority >= curr.priority).toBe(true);
        if (prev.priority === curr.priority) {
          expect(prev.createdAt.getTime()).toBeGreaterThanOrEqual(curr.createdAt.getTime());
        }
      }
    });

    it("isolates recommendations by engagement/workspace (no cross-engagement leakage)", async () => {
      // A recommendation persisted under a different engagement + workspace...
      const foreignId = uuidv4();
      await db.recommendation.create({
        data: {
          id: foreignId,
          engagementId: otherEngagementId,
          workspaceId: otherWorkspaceId,
          title: `Foreign rec ${stamp}`,
          priority: "high",
          createdBy: userId,
        },
      });

      // ...must not appear in this engagement's listing.
      const list = await getRecommendationsForEngagement(engagementId, userId, workspaceId);
      const ids = list.map((r) => r.id);
      expect(ids).not.toContain(foreignId);
    });
  }
);
