import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 2 G2 — recommendation priority ordering end-to-end proof (owner-journey stage 4).
 *
 * Wave-8 owner-journey coverage matrix, gap G2:
 *   "Cockpit renders recommendations; an explicit ordering/priority assertion end-to-end
 *    (highest-priority first, deterministic) is owed (ties to Wave-3/4 recommendation proofs)."
 *
 * The Wave-3 DB test asserted ordering with a lexical string comparison of "high"/"medium"/"low",
 * which is NOT semantic highest-priority-first ("high" < "low" < "medium" lexically). This wave
 * proves the owner-facing listing service `getRecommendationsForEngagement` — the exact call behind
 * the recommendations API route the cockpit consumes — returns recommendations ordered
 * highest-priority-first (high before medium before low) DETERMINISTICALLY, against the real
 * database.
 *
 * Product defect this closes: `Recommendation.priority` is a plain String column, so the previous
 * DB-level `orderBy: { priority: "desc" }` sorted lexically and buried the owner's highest-priority
 * recommendations at the bottom of the list. The fix orders by a semantic priority rank; this test
 * fails against the old lexical ordering and passes against the fix.
 *
 * Dimensions exercised (per CLAUDE.md): 2 business condition, 3 intervention mode + phase
 * (priority reflects intervention urgency surfaced to the owner).
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true (the maintained CI suite sets it).
 * Setup mirrors the proven Wave-3 recommendation DB test.
 */

// Semantic rank: lower = higher priority. Mirrors the service's ordering contract.
const RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "G2 — getRecommendationsForEngagement returns highest-priority-first, deterministically",
  () => {
    const workspaceId = uuidv4();
    const clientId = uuidv4();
    const engagementId = uuidv4();
    const userId = uuidv4();
    const stamp = `${uuidv4()}`;

    // Insert priorities in a deliberately SCRAMBLED order so a correct result cannot come from
    // insertion order or lexical string order — only from semantic priority ranking.
    const insertionOrder: Array<"low" | "high" | "medium"> = [
      "low",
      "high",
      "medium",
      "high",
      "low",
      "medium",
    ];

    beforeAll(async () => {
      await db.user.create({
        data: { id: userId, email: `g2-order-${stamp}@test.local`, updatedAt: new Date() },
      });
      await db.workspace.create({
        data: { id: workspaceId, name: "G2 Ordering WS", slug: `g2-order-${stamp}` },
      });
      await db.clientAccount.create({
        data: { id: clientId, name: `G2 Ordering Client ${stamp}`, createdBy: userId, updatedAt: new Date() },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `G2-ORDER-${stamp}`,
          title: "G2 Ordering Engagement",
          clientId,
          serviceTier: "tier_1",
          engagementMode: "strategic_planning",
          workspaceId,
          updatedAt: new Date(),
        },
      });
      // getRecommendationsForEngagement enforces engagement access via an active membership.
      await db.engagementMembership.create({
        data: { id: uuidv4(), userId, engagementId, role: "lead" },
      });

      // Persist recommendations with the given priority in the scrambled order above. Direct
      // create (deterministic priority + createdAt) so the test isolates the READ-path ordering
      // contract of getRecommendationsForEngagement, independent of the create path.
      for (let i = 0; i < insertionOrder.length; i++) {
        await db.recommendation.create({
          data: {
            id: uuidv4(),
            engagementId,
            workspaceId,
            title: `G2 rec ${i} (${insertionOrder[i]}) ${stamp}`,
            priority: insertionOrder[i],
            createdBy: userId,
          },
        });
      }
    });

    afterAll(async () => {
      try {
        await db.recommendation.deleteMany({ where: { engagementId } });
        await db.engagementMembership.deleteMany({ where: { userId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("orders recommendations highest-priority-first (high → medium → low), not lexically", async () => {
      const list = await getRecommendationsForEngagement(engagementId, userId, workspaceId);

      // All six persisted recommendations are returned, engagement-scoped.
      expect(list.length).toBe(insertionOrder.length);
      for (const rec of list) {
        expect(rec.engagementId).toBe(engagementId);
      }

      // Priority rank is monotonically non-decreasing (highest priority first). This FAILS under the
      // old lexical DB ordering, where "medium"/"low" would sort ahead of "high".
      const ranks = list.map((r) => RANK[r.priority] ?? 999);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
      }

      // Concretely: the first returned recommendation is a "high", the last is a "low".
      expect(list[0].priority).toBe("high");
      expect(list[list.length - 1].priority).toBe("low");

      // The two "high"s come before any "medium", which come before any "low".
      const priorities = list.map((r) => r.priority);
      expect(priorities.filter((p) => p === "high")).toHaveLength(2);
      expect(priorities.indexOf("medium")).toBeGreaterThan(priorities.lastIndexOf("high"));
      expect(priorities.indexOf("low")).toBeGreaterThan(priorities.lastIndexOf("medium"));
    });

    it("produces the same order deterministically on repeated reads", async () => {
      const a = await getRecommendationsForEngagement(engagementId, userId, workspaceId);
      const b = await getRecommendationsForEngagement(engagementId, userId, workspaceId);
      expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
      expect(a.map((r) => r.priority)).toEqual(b.map((r) => r.priority));
    });
  }
);
