/**
 * Phase 2 G5 — required-lane owner-journey smoke (owner-journey stage 12, steady-state governance).
 *
 * Wave-8 owner-journey coverage matrix, gap G5:
 *   "Owner-journey proof currently lives ONLY in the non-required browser lane (also the next-build
 *    heap-OOM-prone lane). The future full-Playwright wave should ... promote a minimal, memory-stable
 *    owner-journey smoke into a required, memory-stable lane so owner-journey regressions block merges."
 *
 * This is that promotion: one consolidated, memory-stable owner-journey governance smoke that walks
 * the owner-visible chain end-to-end through the REAL services against the real database, in the
 * REQUIRED maintained vitest lane (`TEST_WITH_DB=true`, no browser, no `next build`) — so a regression
 * in the condition-assessment → recommendation-surfacing → adaptive-re-evaluation chain blocks merges.
 *
 * It also consumes the Wave-8 seam `OWNER_JOURNEY_STAGES` (previously inert) to assert the journey
 * manifest covers the exercised stages and all four mandated dimensions — the seam's first consumer.
 *
 * Chain walked (real services, no mocks):
 *   1. Condition assessment (stage 3) — `assessCondition` persists a current, workspace-scoped
 *      `BusinessConditionProfile` (the adaptive baseline).
 *   2. Recommendation surfacing + ordering (stage 4) — `getRecommendationsForEngagement` returns the
 *      owner's recommendations highest-priority-first (the G2 ordering contract).
 *   3. Shock → governed adaptive re-evaluation (stage 11) — `triggerReEvaluation` re-evaluates the
 *      condition / mode / phase / cadence dimensions for the engagement.
 *
 * Scope note: this smoke deliberately drives `assessCondition` (fixed here) and the proven surfacing
 * + adaptive services on directly-seeded, middleware-clean state, rather than the full
 * `diagnoseBusiness` transaction — which has never run in a required lane and carries further
 * workspace-isolation gaps (see the G5 FINAL_REPORT "product defect" section). The diagnosis
 * fail-closed gate itself is proven at the service level by G1.
 *
 * Dimensions exercised (per CLAUDE.md): all four — consulting lifecycle stage, business condition,
 * intervention mode + phase, human execution reality.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { assessCondition } from "@/services/business-condition";
import { getRecommendationsForEngagement } from "@/services/recommendation";
import { triggerReEvaluation } from "@/services/re-evaluation";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { OWNER_JOURNEY_STAGES, OWNER_JOURNEY_DIMENSIONS } from "../../../tests/browser/owner-journey-map";

const RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Structural consumption of the (previously inert) Wave-8 seam — no DB, always runs.
describe("G5 — owner-journey manifest (OWNER_JOURNEY_STAGES seam consumed)", () => {
  it("covers all four mandated dimensions across the journey and the stages this smoke exercises", () => {
    const dims = new Set(OWNER_JOURNEY_STAGES.flatMap((st) => st.dimensions));
    for (const d of OWNER_JOURNEY_DIMENSIONS) {
      expect(dims.has(d)).toBe(true);
    }
    const ids = new Set(OWNER_JOURNEY_STAGES.map((st) => st.id));
    for (const stage of ["diagnosis-confidence", "recommendation-priority", "shock-adaptive-reeval"]) {
      expect(ids.has(stage)).toBe(true);
    }
    // The journey is ordered from entry (1) to steady-state governance.
    const orders = OWNER_JOURNEY_STAGES.map((st) => st.order);
    expect(Math.min(...orders)).toBe(1);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] G5 — owner-journey smoke: condition → recommendations → adaptive re-eval (required lane)",
  () => {
    const workspaceId = randomUUID();
    const userId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const stamp = randomUUID();

    const authContext = {
      verifiedActorId: userId,
      verifiedActorType: "user",
      verifiedActor: { id: userId, email: "g5@test.local", name: "G5", isActive: true },
      verifiedWorkspaceId: workspaceId,
      verifiedCapabilities: new Set<string>(),
      // assessCondition reads authContext.session?.user?.id for its actor id.
      session: { user: { id: userId } },
      verifiedSessionSnapshot: {
        snapshotId: "snap", snapshotTimestamp: new Date(), snapshotHash: "", actorId: userId,
        workspaceId, capabilities: [],
      },
    } as unknown as CanonicalAuthContext;

    // Recommendations already surfaced to the owner for this engagement, in scrambled priority order.
    const recPriorities: Array<"low" | "high" | "medium"> = ["low", "high", "medium", "high"];

    beforeAll(async () => {
      await db.user.create({ data: { id: userId, email: `g5-${stamp}@test.local`, updatedAt: new Date() } });
      await db.workspace.create({ data: { id: workspaceId, name: "G5 Owner Journey WS", slug: `g5-${stamp}` } });
      await db.clientAccount.create({ data: { id: clientId, name: `G5 Client ${stamp}`, createdBy: userId, updatedAt: new Date() } });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `G5-${stamp.substring(0, 8)}`,
          title: "G5 Owner Journey Engagement",
          clientId,
          serviceTier: "diagnostic",
          engagementMode: "advisory",
          interventionMode: "stabilization",
          workspaceId,
          updatedAt: new Date(),
        },
      });
      await db.engagementMembership.create({ data: { id: randomUUID(), userId, engagementId, role: "lead" } });
      for (let i = 0; i < recPriorities.length; i++) {
        await db.recommendation.create({
          data: {
            id: randomUUID(),
            engagementId,
            workspaceId,
            title: `G5 rec ${i} (${recPriorities[i]})`,
            priority: recPriorities[i],
            createdBy: userId,
          },
        });
      }
    });

    afterAll(async () => {
      try {
        await db.auditEvent.deleteMany({ where: { workspaceId } });
        await db.recommendation.deleteMany({ where: { engagementId } });
        await db.businessConditionProfile.deleteMany({ where: { engagementId } });
        await db.engagementMembership.deleteMany({ where: { engagementId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] walks condition assessment → recommendation surfacing → adaptive re-evaluation", async () => {
      // ── Stage 3: real condition assessment persists a current, workspace-scoped profile ──
      // (Values match those diagnoseBusiness feeds assessCondition, i.e. valid per its validators.)
      const assessed = await assessCondition(
        {
          engagementId,
          workspaceId,
          businessStatus: "distressed",
          severityScore: 7,
          urgencyLevel: "critical",
          cashPressureLevel: "critical",
          marginPressureLevel: "low",
          clientConcentrationRisk: "medium",
          ownerDependencyRisk: "medium",
          keyPersonDependencyRisk: "medium",
          processMaturityLevel: "medium",
          managementMaturityLevel: "medium",
          executionCapacityLevel: "medium",
          moralFragilityLevel: "low",
          resilienceLevel: "low",
          growthReadinessLevel: "medium",
          notes: "G5 owner-journey smoke baseline",
        },
        authContext
      );
      expect(assessed.id).toBeTruthy();

      const profile = await db.businessConditionProfile.findFirst({
        where: { engagementId, isCurrent: true },
      });
      expect(profile).not.toBeNull();
      expect(profile?.workspaceId).toBe(workspaceId); // proves the workspaceId fix

      // ── Stage 4: recommendations surfaced to the owner, highest-priority-first ──
      const surfaced = await getRecommendationsForEngagement(engagementId, userId, workspaceId);
      expect(surfaced.length).toBe(recPriorities.length);
      const ranks = surfaced.map((r) => RANK[r.priority] ?? 999);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]); // G2 ordering contract
      }
      expect(surfaced[0].priority).toBe("high");

      // ── Stage 11: shock → governed adaptive re-evaluation of the engagement ──
      const reeval = await triggerReEvaluation({
        changeType: "shock_event",
        entityType: "engagement",
        entityId: engagementId,
        engagementId,
        workspaceId,
        severity: "critical",
        description: "Owner-journey smoke: shock re-evaluation",
        triggeredBy: userId,
      });

      // Every mandated dimension is re-evaluated (governed adaptive rule).
      expect(reeval.targets.businessConditionProfile).toBe(true);
      expect(reeval.targets.interventionMode).toBe(true);
      expect(reeval.targets.interventionPhase).toBe(true);
      expect(reeval.targets.reviewCadence).toBe(true);
      // The seeded distressed + critical-cash profile drives a critical rating and recovery mode.
      expect(reeval.businessConditionImpact.recommendedRating).toBe("critical");
      expect(reeval.interventionModeImpact.recommendedMode).toBe("recovery");
      expect(["escalate", "maintain", "deescalate"]).toContain(reeval.priorityImpact.recommendationPriorityShift);
      expect(reeval.reviewCadenceImpact.recommendedDaysUntilReview).toBeGreaterThan(0);
      expect(reeval.auditEventId).toBeTruthy();
    });
  }
);
