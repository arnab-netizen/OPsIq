/* eslint-disable @typescript-eslint/no-explicit-any -- route handler contexts are untyped */
/**
 * Blocking two actions of one engagement at the same time — real handlers, real Postgres.
 *
 * Root cause under test: after the status write had COMMITTED, updateAction / updateActionStatus
 * called triggerReEvaluation, whose recursion guard throws "Re-evaluation already in progress for
 * engagement …" while another re-evaluation of the same engagement runs. The second request then
 * answered 500 for a write that had already happened (the UI kept the old version → next click
 * 409) and that action's governed re-evaluation was lost.
 *
 * After the fix the "already in progress" outcome is deferred through the ONE existing scheduler
 * (idempotent task, bounded retry, dead-letter) and the request returns 200; processing the task
 * re-evaluates the engagement with the blocked action.
 *
 * The overlap is made deterministic: the first request's re-evaluation is held at its first DB
 * read until the second request has finished.
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
import { PATCH as patchAction } from "@/app/api/actions/[actionId]/route";
import { updateActionStatus } from "@/services/action";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] parallel blocks of two actions in one engagement", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const ws = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const ids: string[] = [];

  const ctx = (body: unknown) => ({
    verifiedActorId: actor,
    verifiedActorType: "user",
    verifiedWorkspaceId: ws,
    verifiedCapabilities: ["ACTION_UPDATE"],
    verifiedSessionSnapshot: { actorId: actor, sessionId: randomUUID(), createdAt: new Date() },
    policy: null,
    request: new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) }),
  });

  async function makeAction(): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await db.action.create({ data: { id, engagementId, title: `Parallel block ${id}`, status: "in_progress", updatedAt: new Date() } });
    return id;
  }

  /** Hold the NEXT re-evaluation of this engagement at its first DB read until released. */
  function holdNextReEvaluation() {
    let release!: () => void;
    let reached!: () => void;
    const released = new Promise<void>((r) => { release = r; });
    const isReached = new Promise<void>((r) => { reached = r; });
    const realFindFirst = db.engagement.findFirst.bind(db.engagement);
    let held = false;
    vi.spyOn(db.engagement, "findFirst").mockImplementation((async (args: any) => {
      if (!held && args?.where?.id === engagementId && args?.select?.id === true && Object.keys(args.select).length === 1) {
        held = true;
        reached();
        await released;
      }
      return realFindFirst(args);
    }) as never);
    return { release, isReached };
  }

  const reEvalEventFor = (actionId: string) =>
    db.auditEvent.findFirst({ where: { workspaceId: ws, entityId: actionId, eventName: AUDIT_EVENTS.CONDITION_CHANGED } });

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `parallel-block-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Parallel block WS", slug: `parallel-block-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Parallel block client", createdBy: actor, updatedAt: new Date() } });
    await db.engagement.create({
      data: { id: engagementId, code: `PAR-BLK-${stamp}`, title: "Parallel block engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date() },
    });
    await db.engagementMembership.create({ data: { id: randomUUID(), userId: actor, engagementId, role: "lead" } });
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    try {
      await db.scheduledTask.deleteMany({ where: { workspaceId: ws } });
      await db.action.deleteMany({ where: { id: { in: ids } } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId } });
      await db.engagementMembership.deleteMany({ where: { userId: actor } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.workspace.deleteMany({ where: { id: ws } });
      await db.user.deleteMany({ where: { id: actor } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] PATCH /api/actions: both requests return 200 and both actions are re-evaluated", async () => {
    const a = await makeAction();
    const b = await makeAction();
    const hold = holdNextReEvaluation();
    const first = (patchAction as any)(ctx({ status: "blocked", blockerReason: "vendor A", version: 1 }), { actionId: a });
    await Promise.race([hold.isReached, first.catch(() => undefined)]); // A has committed and its re-evaluation of the engagement is now running
    let second: any;
    try {
      second = await (patchAction as any)(ctx({ status: "blocked", blockerReason: "vendor B", version: 1 }), { actionId: b });
    } finally {
      hold.release(); // never leave A's re-evaluation (and the engagement's in-progress guard) hanging
      await first.catch(() => undefined);
    }
    expect(second.status).toBe("blocked");
    expect(second.version).toBe(2);
    const firstResult = await first;
    expect(firstResult.status).toBe("blocked");

    expect(await reEvalEventFor(a)).not.toBeNull();
    // B's re-evaluation was deferred, not lost: one scheduled task, which re-evaluates with B.
    const tasks = await db.scheduledTask.findMany({ where: { workspaceId: ws, idempotencyKey: { startsWith: `action-blocker-reevaluation:${b}:` } } });
    expect(tasks).toHaveLength(1);
    expect(await new DatabaseSchedulerProvider().processTaskById(tasks[0].id, getProductionTaskHandlers())).toBe(true);
    expect(await reEvalEventFor(b)).not.toBeNull();
    expect((await db.action.findUniqueOrThrow({ where: { id: b }, select: { status: true, version: true } }))).toEqual({ status: "blocked", version: 2 });
  });

  it("[db] updateActionStatus (engagement route service): the second block also succeeds and is deferred", async () => {
    const a = await makeAction();
    const b = await makeAction();
    const serviceCtx = ctx({}) as unknown as CanonicalAuthContext;
    const hold = holdNextReEvaluation();
    const first = updateActionStatus(a, { version: 1, status: "blocked", blockerReason: "permit A" }, serviceCtx, ws);
    await Promise.race([hold.isReached, first.catch(() => undefined)]);
    let second: Awaited<ReturnType<typeof updateActionStatus>>;
    try {
      second = await updateActionStatus(b, { version: 1, status: "blocked", blockerReason: "permit B" }, serviceCtx, ws);
    } finally {
      hold.release();
      await first.catch(() => undefined);
    }
    expect(second.status).toBe("blocked");
    expect((await first).status).toBe("blocked");
    const tasks = await db.scheduledTask.findMany({ where: { workspaceId: ws, idempotencyKey: { startsWith: `action-blocker-reevaluation:${b}:` } } });
    expect(tasks).toHaveLength(1);
    expect(await new DatabaseSchedulerProvider().processTaskById(tasks[0].id, getProductionTaskHandlers())).toBe(true);
    expect(await reEvalEventFor(b)).not.toBeNull();
  });
});
