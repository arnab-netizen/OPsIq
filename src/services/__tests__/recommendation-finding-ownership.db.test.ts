import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { createRecommendation } from "@/services/recommendation";
import { NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";

/**
 * Recommendation parent-ownership (findingId) — DB proof.
 *
 * Root cause: createRecommendation verified that `engagementId` belongs to the caller's
 * workspace but wrote the caller-supplied `findingId` straight into the new row. There is
 * no composite FK (Recommendation.findingId → Finding.id only), so the database accepted a
 * recommendation in workspace B (engagement B) whose finding is workspace A's finding.
 * The child row's workspace/engagement then disagreed with its parent's, and A's finding
 * acquired a foreign recommendation (A's finding → recommendations relation now lists it).
 *
 * After the fix a findingId that does not belong to the supplied engagement (and therefore
 * to the verified workspace) is rejected with NotFoundError("Finding") — the same 404 style
 * already used for a foreign engagementId — and nothing is written.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("createRecommendation — findingId must belong to the engagement/workspace", () => {
  const stamp = uuidv4();
  const userId = uuidv4();
  const wsA = uuidv4();
  const wsB = uuidv4();
  const clientId = uuidv4();
  const engA = uuidv4();
  const engB = uuidv4();
  const engB2 = uuidv4();
  const evidenceA = uuidv4();
  const evidenceB2 = uuidv4();
  const findingA = uuidv4();
  const findingB2 = uuidv4();
  let plan: PlanEntitlementFixture | undefined;

  const ctxFor = (workspaceId: string): CanonicalAuthContext => ({
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ["RECOMMENDATION_CREATE"],
    verifiedSessionSnapshot: { actorId: userId, sessionId: uuidv4(), createdAt: new Date() },
    policy: null,
  } as unknown as CanonicalAuthContext);

  const baseInput = (engagementId: string, findingId: string) => ({
    engagementId,
    findingId,
    title: `XWS finding probe ${uuidv4()}`,
    priority: "high",
    description: "probe",
  });

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `rec-finding-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: wsA, name: "Rec finding WS A", slug: `rec-finding-a-${stamp}` } });
    await db.workspace.create({ data: { id: wsB, name: "Rec finding WS B", slug: `rec-finding-b-${stamp}` } });
    plan = await seedPlanEntitlement([wsA, wsB], ["generate_recommendation"]);
    await db.clientAccount.create({ data: { id: clientId, name: "Rec finding client", createdBy: userId, updatedAt: new Date() } });
    for (const [id, workspaceId] of [[engA, wsA], [engB, wsB], [engB2, wsB]] as const) {
      await db.engagement.create({
        data: {
          id, code: `REC-FIND-${id}`, title: "Rec finding engagement", clientId,
          serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId, updatedAt: new Date(),
        },
      });
    }
    for (const [evId, findId, engagementId] of [[evidenceA, findingA, engA], [evidenceB2, findingB2, engB2]] as const) {
      await db.evidence.create({
        data: { id: evId, engagementId, title: "ev", description: "ev", source: "test", status: "validated", updatedAt: new Date() },
      });
      await db.finding.create({
        data: { id: findId, engagementId, primaryEvidenceId: evId, title: "finding", summary: "finding", severity: "high", impactArea: "operational", updatedAt: new Date() },
      });
    }
  });

  afterAll(async () => {
    try {
      await db.recommendation.deleteMany({ where: { engagementId: { in: [engA, engB, engB2] } } });
      await db.finding.deleteMany({ where: { id: { in: [findingA, findingB2] } } });
      await db.evidence.deleteMany({ where: { id: { in: [evidenceA, evidenceB2] } } });
      await db.engagement.deleteMany({ where: { id: { in: [engA, engB, engB2] } } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
      await cleanupPlanEntitlement(plan);
      await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] rejects workspace A's finding on a workspace B engagement and writes nothing", async () => {
    await expect(createRecommendation(baseInput(engB, findingA), ctxFor(wsB), wsB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.recommendation.count({ where: { findingId: findingA } })).toBe(0);
    expect(await db.recommendation.count({ where: { workspaceId: wsB } })).toBe(0);
  });

  it("[db] rejects a same-workspace finding that belongs to a different engagement", async () => {
    await expect(createRecommendation(baseInput(engB, findingB2), ctxFor(wsB), wsB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.recommendation.count({ where: { findingId: findingB2 } })).toBe(0);
  });

  it("[db] rejects an unknown findingId", async () => {
    await expect(createRecommendation(baseInput(engB, uuidv4()), ctxFor(wsB), wsB)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] accepts the engagement's own finding (legitimate caller unchanged)", async () => {
    const rec = await createRecommendation(baseInput(engB2, findingB2), ctxFor(wsB), wsB);
    expect(rec.findingId).toBe(findingB2);
    expect(rec.workspaceId).toBe(wsB);
    expect(rec.engagementId).toBe(engB2);
  });
});
