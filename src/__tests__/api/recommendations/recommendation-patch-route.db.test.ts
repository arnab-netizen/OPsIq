/* eslint-disable @typescript-eslint/no-explicit-any -- route handler contexts are untyped */
/**
 * PATCH /api/recommendations/[recommendationId] — real handler, real Postgres.
 *
 * Root cause under test: the route called updateRecommendation and then discarded its exact result,
 * re-reading the row with getRecommendation; a writer committing in between made the response
 * report that writer's status/version. The response must be the service's committed write in the
 * exact shape GET returns (the recommendations manager reads status/priority/version from it).
 * Only the canonical auth wrapper is a pass-through.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/recommendations/recommendation-patch-route.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params?: unknown) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params?: unknown) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { db } from "@/lib/db";
import { PATCH } from "@/app/api/recommendations/[recommendationId]/route";
import { getRecommendation } from "@/services/recommendation";
import { NotFoundError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] PATCH /api/recommendations/[recommendationId]", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const ws = randomUUID();
  const otherWs = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const evidenceId = randomUUID();
  const findingId = randomUUID();
  const recIds: string[] = [];

  const ctx = (workspaceId: string, body: unknown) => ({
    verifiedActorId: actor,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ["RECOMMENDATION_APPROVE"],
    verifiedSessionSnapshot: { actorId: actor, sessionId: randomUUID(), createdAt: new Date() },
    policy: null,
    request: new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) }),
  });
  const patch = (workspaceId: string, recommendationId: string, body: unknown) =>
    (PATCH as any)(ctx(workspaceId, body), { recommendationId });

  async function makeRec(status: string): Promise<string> {
    const id = randomUUID();
    recIds.push(id);
    await db.recommendation.create({ data: { id, engagementId, workspaceId: ws, findingId, title: `Route rec ${id}`, priority: "medium", status, createdBy: actor } });
    return id;
  }

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `rec-route-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Rec route WS", slug: `rec-route-${stamp}` } });
    await db.workspace.create({ data: { id: otherWs, name: "Rec route other WS", slug: `rec-route-o-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Rec route client", createdBy: actor, updatedAt: new Date() } });
    await db.engagement.create({
      data: { id: engagementId, code: `REC-ROUTE-${stamp}`, title: "Rec route engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date() },
    });
    await db.evidence.create({ data: { id: evidenceId, engagementId, title: "ev", description: "ev", source: "test", status: "validated", updatedAt: new Date() } });
    await db.finding.create({ data: { id: findingId, engagementId, primaryEvidenceId: evidenceId, title: "Route finding", summary: "s", severity: "high", impactArea: "operational", updatedAt: new Date() } });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    try {
      await db.recommendation.deleteMany({ where: { id: { in: recIds } } });
      await db.finding.deleteMany({ where: { id: findingId } });
      await db.evidence.deleteMany({ where: { id: evidenceId } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [ws, otherWs] } } });
      await db.workspace.deleteMany({ where: { id: { in: [ws, otherWs] } } });
      await db.user.deleteMany({ where: { id: actor } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] the response is the service's committed write in GET's exact shape, not a later re-read", async () => {
    const id = await makeRec("proposed");
    const getShape = await getRecommendation(id, ws);
    const realUpdateMany = db.recommendation.updateMany.bind(db.recommendation);
    vi.spyOn(db.recommendation, "updateMany").mockImplementationOnce(async (args: Parameters<typeof realUpdateMany>[0]) => {
      const result = await realUpdateMany(args);
      await realUpdateMany({ where: { id }, data: { priority: "low", version: { increment: 1 } } });
      return result;
    });
    const res = await patch(ws, id, { version: 1, status: "endorsed", priority: "high" });
    const body = res.body;
    expect(res.status).toBe(200);
    expect(body.status).toBe("endorsed");
    expect(body.priority).toBe("high");
    expect(body.version).toBe(2);
    expect(Object.keys(body).sort()).toEqual(Object.keys(getShape).sort());
    expect(body.engagement).toEqual(getShape.engagement);
    expect(body.finding).toEqual(getShape.finding);
  });

  it("[db] uncontended: response equals a fresh GET", async () => {
    const id = await makeRec("proposed");
    const res = await patch(ws, id, { version: 1, priority: "urgent" });
    expect(JSON.parse(JSON.stringify(res.body))).toEqual(JSON.parse(JSON.stringify(await getRecommendation(id, ws))));
  });

  it("[db] foreign workspace: 404", async () => {
    const id = await makeRec("proposed");
    await expect(patch(otherWs, id, { version: 1, status: "endorsed" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
