/**
 * Phase 2 G5 — required-lane owner-journey smoke (owner-journey stage 12, steady-state governance).
 *
 * Wave-8 owner-journey coverage matrix, gap G5:
 *   "Owner-journey proof currently lives ONLY in the non-required browser lane (also the next-build
 *    heap-OOM-prone lane). The future full-Playwright wave should ... promote a minimal, memory-stable
 *    owner-journey smoke into a required, memory-stable lane so owner-journey regressions block merges."
 *
 * This is that promotion: one consolidated, memory-stable owner-journey smoke that walks the core
 * journey end-to-end through the REAL services against the real database, in the REQUIRED maintained
 * vitest lane (`TEST_WITH_DB=true`, no browser, no `next build`) — so a regression anywhere in the
 * intake → diagnosis → recommendation-surfacing → adaptive-re-evaluation chain blocks merges.
 *
 * It also consumes the Wave-8 seam `OWNER_JOURNEY_STAGES` (previously inert) to assert the journey
 * manifest covers the stages this smoke exercises and all four mandated dimensions — giving the seam
 * its first consumer, exactly as Wave-8 intended.
 *
 * Journey walked (real services, no mocks):
 *   1. Onboarding / intake + diagnosis (stages 2-3): `diagnoseBusiness` persists an engagement, a
 *      current BusinessConditionProfile, findings and recommendations.
 *   2. Recommendation surfacing + ordering (stage 4): `getRecommendationsForEngagement` returns the
 *      owner's recommendations highest-priority-first.
 *   3. Shock → governed adaptive re-evaluation (stage 11): `triggerReEvaluation` re-evaluates the
 *      condition / mode / priority / cadence / health dimensions for the diagnosed engagement.
 *
 * Dimensions exercised (per CLAUDE.md): all four — consulting lifecycle stage, business condition,
 * intervention mode + phase, human execution reality.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { diagnoseBusiness } from "@/services/diagnosis";
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
    for (const stage of ["onboarding-intake", "diagnosis-confidence", "recommendation-priority", "shock-adaptive-reeval"]) {
      expect(ids.has(stage)).toBe(true);
    }
    // The journey is ordered from entry (1) to steady-state governance.
    const orders = OWNER_JOURNEY_STAGES.map((st) => st.order);
    expect(Math.min(...orders)).toBe(1);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] G5 — owner-journey smoke: intake → diagnosis → recommendations → adaptive re-eval (required lane)", () => {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const stamp = randomUUID();
  let engagementId = "";

  const authContext = {
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ["DIAGNOSIS_CREATE"],
    verifiedSessionSnapshot: { actorId: userId, sessionId: randomUUID(), createdAt: new Date() },
    policy: null,
  } as unknown as CanonicalAuthContext;

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `g5-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "G5 Owner Journey WS", slug: `g5-${stamp}` } });
  });

  afterAll(async () => {
    try {
      if (engagementId) {
        await db.recommendation.deleteMany({ where: { engagementId } });
        await db.action.deleteMany({ where: { engagementId } });
        await db.finding.deleteMany({ where: { engagementId } });
        await db.evidence.deleteMany({ where: { engagementId } });
        await db.shockEvent.deleteMany({ where: { engagementId } });
        await db.businessConditionProfile.deleteMany({ where: { engagementId } });
        await db.engagementMembership.deleteMany({ where: { engagementId } });
      }
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.recommendation.deleteMany({ where: { workspaceId } });
      await db.engagement.deleteMany({ where: { workspaceId } });
      await db.clientAccount.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch {
      // best-effort cleanup (ephemeral CI database)
    }
  });

  it("[db] walks the owner journey end-to-end through the real services", async () => {
    // ── Stage 2-3: intake + diagnosis ───────────────────────────────────────
    const diagnosis = await diagnoseBusiness(
      {
        businessName: `G5 Retailer ${stamp}`,
        businessType: "retail",
        problemStatement: "Monthly sales have dropped and cash is getting tight",
        mainIssue: "low_sales",
        monthlyRevenue: 100000,
        monthlyCosts: 90000,
        customerCount: 40,
      },
      authContext,
      workspaceId
    );
    engagementId = diagnosis.engagementId;

    expect(engagementId).toBeTruthy();
    expect(diagnosis.recommendations.length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(diagnosis.confidence);

    // Diagnosis persisted a CURRENT business condition profile (the adaptive baseline).
    const profile = await db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true },
    });
    expect(profile).not.toBeNull();

    // Recommendations were persisted under the engagement.
    const persistedRecs = await db.recommendation.findMany({ where: { engagementId, workspaceId } });
    expect(persistedRecs.length).toBeGreaterThan(0);

    // ── Stage 4: recommendations surfaced to the owner, highest-priority-first ─
    // Grant the owner engagement access (membership) so the listing service authorizes the read.
    await db.engagementMembership.create({ data: { id: randomUUID(), userId, engagementId, role: "lead" } });

    const surfaced = await getRecommendationsForEngagement(engagementId, userId, workspaceId);
    expect(surfaced.length).toBe(persistedRecs.length);
    const ranks = surfaced.map((r) => RANK[r.priority] ?? 999);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]); // highest-priority-first (G2 contract)
    }

    // ── Stage 11: shock → governed adaptive re-evaluation of the diagnosed engagement ─
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
    expect(["critical", "distressed", "challenged", "stable", "improving"]).toContain(
      reeval.businessConditionImpact.recommendedRating
    );
    expect(typeof reeval.interventionModeImpact.recommendedMode).toBe("string");
    expect(["escalate", "maintain", "deescalate"]).toContain(reeval.priorityImpact.recommendationPriorityShift);
    expect(reeval.reviewCadenceImpact.recommendedDaysUntilReview).toBeGreaterThan(0);
    expect(reeval.auditEventId).toBeTruthy();
  });
});
