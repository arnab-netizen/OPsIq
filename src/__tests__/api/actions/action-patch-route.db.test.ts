/* eslint-disable @typescript-eslint/no-explicit-any -- route handler contexts are untyped */
/**
 * PATCH /api/actions/[actionId] — the route the Action Center UI calls — real handler, real Postgres.
 *
 * Root cause under test: the route calls updateAction, which accepted `blockerReason` in its schema
 * but ignored it, never ran the action enforcement rules (a blocked action must carry a reason),
 * never cleared metadata.blockerReason when the action left blocked, and never routed a blocked
 * action into governed re-evaluation (CLAUDE.md adaptive rule: an unresolved critical blocker
 * must trigger re-evaluation). The route then discarded the service's exact result and re-read
 * the row. Only the canonical auth wrapper is a pass-through.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/actions/action-patch-route.db.test.ts
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
import { PATCH } from "@/app/api/actions/[actionId]/route";
import { POST as postAction } from "@/app/api/actions/route";
import { seedPlanEntitlement, cleanupPlanEntitlement, type PlanEntitlementFixture } from "@/__tests__/test-helpers/plan-entitlement";
import { getActionById } from "@/services/action";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] PATCH /api/actions/[actionId] (Action Center route)", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const wsA = randomUUID();
  const wsB = randomUUID();
  const clientId = randomUUID();
  const engagementA = randomUUID();
  const engagementB = randomUUID();
  const actionIds: string[] = [];
  let plan: PlanEntitlementFixture | undefined;

  const ctx = (workspaceId: string, body: unknown) => ({
    verifiedActorId: actor,
    verifiedActorType: "user",
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ["ACTION_UPDATE"],
    verifiedSessionSnapshot: { actorId: actor, sessionId: randomUUID(), createdAt: new Date() },
    policy: null,
    request: new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) }),
  });
  const patch = (workspaceId: string, actionId: string, body: unknown) => (PATCH as any)(ctx(workspaceId, body), { actionId });

  async function makeAction(status: string, engagementId = engagementA, metadata?: Record<string, unknown>): Promise<string> {
    const id = randomUUID();
    await db.action.create({ data: { id, engagementId, title: `Center action ${status}`, status, metadata: metadata as object | undefined, updatedAt: new Date() } });
    actionIds.push(id);
    return id;
  }
  const row = (id: string) => db.action.findUniqueOrThrow({ where: { id }, select: { status: true, version: true, metadata: true } });

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `action-center-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: wsA, name: "Action center A", slug: `action-center-a-${stamp}` } });
    await db.workspace.create({ data: { id: wsB, name: "Action center B", slug: `action-center-b-${stamp}` } });
    plan = await seedPlanEntitlement([wsA], ["action_create"]);
    await db.clientAccount.create({ data: { id: clientId, name: "Action center client", createdBy: actor, updatedAt: new Date() } });
    for (const [id, workspaceId] of [[engagementA, wsA], [engagementB, wsB]] as const) {
      await db.engagement.create({
        data: { id, code: `ACT-CENTER-${id}`, title: "Action center engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId, updatedAt: new Date() },
      });
    }
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    try {
      await db.action.deleteMany({ where: { id: { in: actionIds } } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId: { in: [engagementA, engagementB] } } });
      await db.engagement.deleteMany({ where: { id: { in: [engagementA, engagementB] } } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
      await cleanupPlanEntitlement(plan);
      await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
      await db.user.deleteMany({ where: { id: actor } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] blocked with a reason stores it in metadata (other keys kept) and routes into governed re-evaluation", async () => {
    const id = await makeAction("in_progress", engagementA, { outcomeSnapshot: { kept: true } });
    const res = await patch(wsA, id, { status: "blocked", blockerReason: "vendor", version: 1 });
    expect(res.status).toBe("blocked");
    expect(res.version).toBe(2);
    expect(await row(id)).toEqual({ status: "blocked", version: 2, metadata: { outcomeSnapshot: { kept: true }, blockerReason: "vendor" } });
    const reEval = await db.auditEvent.findFirst({ where: { workspaceId: wsA, entityId: id, eventName: AUDIT_EVENTS.CONDITION_CHANGED } });
    expect(reEval).not.toBeNull();
  });

  it("[db] blocked without a reason is refused (400 ValidationError) and nothing changes", async () => {
    const id = await makeAction("in_progress");
    await expect(patch(wsA, id, { status: "blocked", version: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(await row(id)).toEqual({ status: "in_progress", version: 1, metadata: null });
  });

  it("[db] leaving blocked clears the stored reason", async () => {
    const id = await makeAction("blocked", engagementA, { blockerReason: "old", outcomeSnapshot: { kept: true } });
    const res = await patch(wsA, id, { status: "assigned", version: 1 });
    expect(res.status).toBe("assigned");
    expect((await row(id)).metadata).toEqual({ outcomeSnapshot: { kept: true } });
  });

  it("[db] foreign workspace: 404 and nothing changes", async () => {
    const id = await makeAction("in_progress");
    const err = await patch(wsB, id, { status: "blocked", blockerReason: "x", version: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).statusCode).toBe(404);
    expect(await row(id)).toEqual({ status: "in_progress", version: 1, metadata: null });
  });

  it("[db] the response is the service's exact committed write (same shape as GET), not a later re-read", async () => {
    const id = await makeAction("assigned");
    const shape = Object.keys(await getActionById(id, wsA)).sort();
    const realFindFirst = db.action.findFirst.bind(db.action);
    let injected = false;
    vi.spyOn(db.action, "findFirst").mockImplementation(async (args: Parameters<typeof realFindFirst>[0]) => {
      const result = await realFindFirst(args);
      // Any read after this call's own pre-read (i.e. a route/service re-read) first sees an interleaved writer.
      if (!injected && result && (result as { version: number }).version === 2) {
        injected = true;
        await db.$executeRaw`UPDATE actions SET title = 'Interleaved writer', version = version + 1 WHERE id = ${id}::uuid`;
        return realFindFirst(args);
      }
      return result;
    });
    const res = await patch(wsA, id, { title: "Mine", version: 1 });
    expect(res.title).toBe("Mine");
    expect(res.version).toBe(2);
    expect(Object.keys(res).sort()).toEqual(shape);
  });

  it("[db] Complete via PATCH /api/actions/{id} still succeeds (200) — the broken evidence rule is not applied here", async () => {
    const id = await makeAction("in_progress");
    const res = await patch(wsA, id, { status: "completed", version: 1 });
    expect(res.status).toBe("completed");
    expect(await row(id)).toMatchObject({ status: "completed", version: 2 });
  });

  // Every status move the Action Center UI can send (src/ui/action-center.tsx STATE_MACHINE, for the
  // statuses an Action really has), with the outcome updateAction had before this PR.
  const UI_MOVES: Array<{ from: string; to: string; body?: Record<string, unknown>; expected: number }> = [
    { from: "in_progress", to: "blocked", body: { blockerReason: "vendor" }, expected: 200 },
    { from: "in_progress", to: "completed", expected: 200 },
    { from: "in_progress", to: "created", expected: 400 }, // "Reset": not an Action status (route schema)
    { from: "blocked", to: "in_progress", expected: 400 }, // "Start": not in the transition map (ValidationError)
    { from: "blocked", to: "created", expected: 400 }, // "Reset": not an Action status
    { from: "blocked", to: "cancelled", expected: 200 },
    { from: "completed", to: "verified", expected: 400 }, // "Verify": completed is terminal in the map (ValidationError)
  ];
  for (const move of UI_MOVES) {
    it(`[db] UI move ${move.from} → ${move.to} keeps its pre-PR outcome (${move.expected})`, async () => {
      const id = await makeAction(move.from, engagementA, move.from === "blocked" ? { blockerReason: "existing" } : undefined);
      const outcome = await patch(wsA, id, { status: move.to, version: 1, ...(move.body ?? {}) }).then(
        () => 200,
        (e: unknown) => (e as { statusCode?: number }).statusCode ?? 500
      );
      expect(outcome).toBe(move.expected);
    });
  }

  for (const field of ["dueDate", "completedAt", "verifiedAt"] as const) {
    it(`[db] an unparseable ${field} is a 400 ValidationError (was a 500 "Invalid time value") and nothing changes`, async () => {
      const id = await makeAction("assigned");
      const err = await patch(wsA, id, { [field]: "garbage", version: 1 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).statusCode).toBe(400);
      expect(await row(id)).toEqual({ status: "assigned", version: 1, metadata: null });
    });
  }

  it("[db] a date-only dueDate is still accepted", async () => {
    const id = await makeAction("assigned");
    const res = await patch(wsA, id, { dueDate: "2026-12-01", version: 1 });
    expect(new Date(res.dueAt).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("[db] POST /api/actions: an unparseable dueDate is a 400 ValidationError", async () => {
    const request = new Request("http://x/api", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ engagementId: engagementA, recommendationId: randomUUID(), title: "New", priority: "high", dueDate: "garbage" }),
    });
    const err = await (postAction as any)({ ...ctx(wsA, {}), request }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).statusCode).toBe(400);
  });
});
