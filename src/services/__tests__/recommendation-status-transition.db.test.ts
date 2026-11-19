import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { updateRecommendation } from "@/services/recommendation";
import { InvalidStateTransitionError, ConflictError, NotFoundError } from "@/infra/errors";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Recommendation status lifecycle on the PATCH path — DB proof.
 *
 * Root cause: updateRecommendation (behind PATCH /api/recommendations/[recommendationId])
 * copied `input.status` into the update with no transition check, although the domain
 * lifecycle already exists in policies/state-transition.ts (RECOMMENDATION_TRANSITIONS:
 * proposed → endorsed|rejected|withdrawn; endorsed → converted|withdrawn; terminal:
 * rejected, converted, withdrawn). A holder of RECOMMENDATION_APPROVE could therefore
 * resurrect a rejected/converted recommendation or skip endorsement. The update was also
 * not conditional on the version it had checked, so the check could be raced.
 *
 * After the fix every status change is validated by validateRecommendationTransition and
 * written with compare-and-set on (version, previous status). The column default "pending"
 * (what createRecommendation writes) is the initial state and mirrors "proposed" exactly.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("updateRecommendation — status changes follow the governed lifecycle", () => {
  const stamp = uuidv4();
  const userId = uuidv4();
  const ws = uuidv4();
  const otherWs = uuidv4();
  const clientId = uuidv4();
  const engagementId = uuidv4();

  const ctx = (workspaceId: string): CanonicalAuthContext => ({
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ["RECOMMENDATION_APPROVE"],
    verifiedSessionSnapshot: { actorId: userId, sessionId: uuidv4(), createdAt: new Date() },
    policy: null,
  } as unknown as CanonicalAuthContext);

  async function makeRec(status: string): Promise<string> {
    const id = uuidv4();
    await db.recommendation.create({
      data: { id, engagementId, workspaceId: ws, title: `lifecycle ${status} ${id}`, priority: "medium", status, createdBy: userId },
    });
    return id;
  }

  async function row(id: string) {
    return db.recommendation.findUniqueOrThrow({ where: { id }, select: { status: true, version: true } });
  }

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `rec-lifecycle-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Rec lifecycle WS", slug: `rec-lifecycle-${stamp}` } });
    await db.workspace.create({ data: { id: otherWs, name: "Rec lifecycle other WS", slug: `rec-lifecycle-o-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Rec lifecycle client", createdBy: userId, updatedAt: new Date() } });
    await db.engagement.create({
      data: {
        id: engagementId, code: `REC-LIFE-${stamp}`, title: "Rec lifecycle engagement", clientId,
        serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    try {
      await db.recommendation.deleteMany({ where: { engagementId } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [ws, otherWs] } } });
      await db.workspace.deleteMany({ where: { id: { in: [ws, otherWs] } } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] rejects resurrecting a terminal (rejected) recommendation and leaves the row unchanged", async () => {
    const id = await makeRec("rejected");
    await expect(updateRecommendation(id, { version: 1, status: "endorsed" }, ctx(ws), ws)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(await row(id)).toEqual({ status: "rejected", version: 1 });
  });

  it("[db] rejects skipping endorsement (proposed → converted)", async () => {
    const id = await makeRec("proposed");
    await expect(updateRecommendation(id, { version: 1, status: "converted" }, ctx(ws), ws)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(await row(id)).toEqual({ status: "proposed", version: 1 });
  });

  // "pending" is the column default that createRecommendation writes: it is the real initial
  // state and must behave exactly like "proposed" (same outgoing transitions, nothing more).
  it("[db] pending → rejected succeeds (initial state, same as proposed)", async () => {
    const id = await makeRec("pending");
    const updated = await updateRecommendation(id, { version: 1, status: "rejected" }, ctx(ws), ws);
    expect(updated.status).toBe("rejected");
    expect(updated.version).toBe(2);
  });

  it("[db] pending → endorsed and pending → withdrawn succeed (mirror proposed)", async () => {
    const a = await makeRec("pending");
    expect((await updateRecommendation(a, { version: 1, status: "endorsed" }, ctx(ws), ws)).status).toBe("endorsed");
    const b = await makeRec("pending");
    expect((await updateRecommendation(b, { version: 1, status: "withdrawn" }, ctx(ws), ws)).status).toBe("withdrawn");
  });

  it("[db] pending → converted is refused exactly as proposed → converted is (skipped endorsement)", async () => {
    const proposed = await makeRec("proposed");
    const pending = await makeRec("pending");
    await expect(updateRecommendation(proposed, { version: 1, status: "converted" }, ctx(ws), ws)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(updateRecommendation(pending, { version: 1, status: "converted" }, ctx(ws), ws)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    expect(await row(pending)).toEqual({ status: "pending", version: 1 });
  });

  it("[db] terminal states stay terminal (withdrawn/converted → any refused)", async () => {
    for (const terminal of ["withdrawn", "converted"]) {
      const id = await makeRec(terminal);
      await expect(updateRecommendation(id, { version: 1, status: "endorsed" }, ctx(ws), ws)).rejects.toBeInstanceOf(InvalidStateTransitionError);
      expect(await row(id)).toEqual({ status: terminal, version: 1 });
    }
  });

  it("[db] allows the governed path proposed → endorsed → converted and bumps the version each time", async () => {
    const id = await makeRec("proposed");
    const endorsed = await updateRecommendation(id, { version: 1, status: "endorsed" }, ctx(ws), ws);
    expect(endorsed.status).toBe("endorsed");
    expect(endorsed.version).toBe(2);
    const converted = await updateRecommendation(id, { version: 2, status: "converted" }, ctx(ws), ws);
    expect(converted.status).toBe("converted");
    expect(converted.version).toBe(3);
  });

  it("[db] non-status edits (and an unchanged status) still succeed on any stored status", async () => {
    const id = await makeRec("pending");
    const updated = await updateRecommendation(id, { version: 1, status: "pending", priority: "high" }, ctx(ws), ws);
    expect(updated.priority).toBe("high");
    expect(updated.status).toBe("pending");
    expect(updated.version).toBe(2);
  });

  it("[db] a stale version is a 409 ConflictError (same as a lost race) and nothing changes", async () => {
    const id = await makeRec("proposed");
    await expect(updateRecommendation(id, { version: 7, status: "endorsed" }, ctx(ws), ws)).rejects.toBeInstanceOf(ConflictError);
    expect(await row(id)).toEqual({ status: "proposed", version: 1 });
  });

  it("[db] a foreign workspace cannot change the status (NotFound)", async () => {
    const id = await makeRec("proposed");
    await expect(updateRecommendation(id, { version: 1, status: "endorsed" }, ctx(otherWs), otherWs)).rejects.toBeInstanceOf(NotFoundError);
    expect(await row(id)).toEqual({ status: "proposed", version: 1 });
  });

  it("[db] concurrent conflicting transitions from the same version: exactly one wins", async () => {
    const id = await makeRec("proposed");
    const results = await Promise.allSettled([
      updateRecommendation(id, { version: 1, status: "endorsed" }, ctx(ws), ws),
      updateRecommendation(id, { version: 1, status: "rejected" }, ctx(ws), ws),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    const final = await row(id);
    expect(final.version).toBe(2);
    expect(["endorsed", "rejected"]).toContain(final.status);
  });

  it("[db] the recommendation.updated audit event states previousStatus and the new status explicitly", async () => {
    const id = await makeRec("proposed");
    await updateRecommendation(id, { version: 1, status: "endorsed", priority: "high" }, ctx(ws), ws);
    const event = await db.auditEvent.findFirstOrThrow({
      where: { workspaceId: ws, entityId: id, eventName: "recommendation.updated" },
      orderBy: { occurredAt: "desc" },
    });
    const payload = (typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload) as Record<string, unknown>;
    expect(payload.previousStatus).toBe("proposed");
    expect(payload.status).toBe("endorsed");
    expect(payload.priority).toBe("high");
  });

  it("[db] N3: result and audit describe this call's write even if another writer commits right after the CAS", async () => {
    const id = await makeRec("proposed");
    const realUpdateMany = db.recommendation.updateMany.bind(db.recommendation);
    const spy = vi.spyOn(db.recommendation, "updateMany").mockImplementationOnce(async (args: Parameters<typeof realUpdateMany>[0]) => {
      const result = await realUpdateMany(args);
      // A second writer lands between this call's compare-and-set and its next statement.
      await realUpdateMany({ where: { id }, data: { status: "withdrawn", version: { increment: 1 } } });
      return result;
    });
    try {
      const returned = await updateRecommendation(id, { version: 1, status: "endorsed" }, ctx(ws), ws);
      expect(returned.status).toBe("endorsed");
      expect(returned.version).toBe(2);
      const event = await db.auditEvent.findFirstOrThrow({ where: { workspaceId: ws, entityId: id, eventName: "recommendation.updated" } });
      const payload = (typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload) as Record<string, unknown>;
      expect(payload).toMatchObject({ previousStatus: "proposed", status: "endorsed", previousVersion: 1, version: 2 });
    } finally {
      spy.mockRestore();
    }
    // The interleaved writer really committed after this call's CAS (the row moved past v2);
    // its later content is owned by that writer and the event projection, not by this call.
    expect((await row(id)).version).toBeGreaterThanOrEqual(3);
  });
});
