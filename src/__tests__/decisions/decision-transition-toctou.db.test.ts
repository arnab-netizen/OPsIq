/**
 * M2 — governed decision transition TOCTOU race. DB proof.
 *
 * `transitionDecisionState` read the decision's status, validated the transition against that READ, then
 * `update({ where: { id } })` with no status guard — so two concurrent transitions both validate against
 * the same fromState and the second silently clobbers the first (e.g. an approval overwritten by a reject).
 * The write is now a concurrency-safe `updateMany({ where: { id, workspaceId, status: <read status> } })`
 * with a `count === 1` assertion: a racing transition that already moved the row is rejected, not applied.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/decisions/decision-transition-toctou.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { transitionDecisionState } from "@/services/decisions/decision-lifecycle.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let actorId: string;
let workspaceId: string;
const seededDecisionIds: string[] = [];

async function seedDecision(status = "submitted"): Promise<string> {
  const id = randomUUID();
  await db.operatorItem.create({
    data: {
      id,
      workspaceId,
      problem: "P",
      action: "A",
      impactExpected: 100,
      impactLow: 50,
      impactHigh: 150,
      confidence: 0.8,
      priorityScore: 0.7,
      status,
      updatedAt: new Date(),
    },
  });
  seededDecisionIds.push(id);
  return id;
}

async function statusOf(id: string): Promise<string | undefined> {
  const d = await db.operatorItem.findUnique({ where: { id }, select: { status: true } });
  return d?.status;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] M2 decision transition TOCTOU guard", () => {
  beforeEach(async () => {
    actorId = randomUUID();
    workspaceId = randomUUID();
    await db.user.create({ data: { id: actorId, email: `m2-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  });

  afterEach(async () => {
    for (const id of seededDecisionIds.splice(0)) {
      await db.auditEvent.deleteMany({ where: { entityId: id } }).catch(() => undefined);
      await db.operatorItem.delete({ where: { id } }).catch(() => undefined);
    }
    await db.auditEvent.deleteMany({ where: { workspaceId } }).catch(() => undefined);
    await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
  });

  it("[db] concurrent identical transitions: exactly one succeeds, the rest are rejected", async () => {
    const id = await seedDecision("submitted");
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => transitionDecisionState(id, workspaceId, "APPROVED", null, actorId))
    );
    const fulfilled = attempts.filter((a) => a.status === "fulfilled");
    const rejected = attempts.filter((a) => a.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(5);
    expect((fulfilled[0] as PromiseFulfilledResult<{ status: string }>).value.status).toBe("approved");
    expect(await statusOf(id)).toBe("approved");
  });

  it("[db] concurrent divergent transitions (approve vs reject): no clobber, one winner", async () => {
    const id = await seedDecision("submitted");
    const attempts = await Promise.allSettled([
      transitionDecisionState(id, workspaceId, "APPROVED", null, actorId),
      transitionDecisionState(id, workspaceId, "REJECTED", "conflicting reject", actorId),
    ]);
    const fulfilled = attempts.filter((a) => a.status === "fulfilled") as PromiseFulfilledResult<{ status: string }>[];

    // Exactly one transition may win; the loser is rejected rather than overwriting the winner.
    expect(fulfilled).toHaveLength(1);
    const winnerStatus = fulfilled[0].value.status; // "approved" or "rejected"
    expect(["approved", "rejected"]).toContain(winnerStatus);
    expect(await statusOf(id)).toBe(winnerStatus);
  });

  it("[db] a stale transition from a status that no longer matches is rejected (sequential)", async () => {
    const id = await seedDecision("submitted");
    // First transition wins.
    await transitionDecisionState(id, workspaceId, "APPROVED", null, actorId);
    expect(await statusOf(id)).toBe("approved");
    // A transition that would have been valid from "submitted" (submitted→rejected) is no longer valid
    // now that the row is "approved" — it must be rejected, not applied.
    await expect(
      transitionDecisionState(id, workspaceId, "REJECTED", "late reject", actorId)
    ).rejects.toThrow();
    expect(await statusOf(id)).toBe("approved");
  });
});
