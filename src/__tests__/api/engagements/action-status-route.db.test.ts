/* eslint-disable @typescript-eslint/no-explicit-any -- route handler contexts are untyped */
/**
 * PATCH /api/engagements/[engagementId]/actions/[actionId] — real route handler on real Postgres.
 *
 * Root cause under test: updateActionStatus (and action-lifecycle transitionActionState) wrote
 * `blockerReason` (and `verifiedBy`) onto Action, but the Action model has had no such columns
 * since the May 2026 schema restore (the `actions` table never had them in any migration). Prisma
 * rejected every call with PrismaClientValidationError, so every legitimate PATCH on this route
 * returned 500. The documented contract (action-lifecycle rule "action.blocker.required.blocked":
 * a blocked action must carry a reason; the Action Center UI reads `blockerReason` back) is kept by
 * storing the reason in the existing `metadata` JSON column (same pattern as
 * metadata.outcomeSnapshot in outcome.service), returning it as `blockerReason`, and auditing it.
 *
 * Only the canonical auth wrapper is replaced by a pass-through supplying the verified workspace and
 * actor; the route body, services and database are real.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/engagements/action-status-route.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement: (handler: (ctx: unknown, params?: unknown) => unknown, options?: Record<string, unknown>) => {
    const wrapped = (ctx: unknown, params?: unknown) => handler(ctx, params);
    (wrapped as { __options?: unknown }).__options = options;
    return wrapped;
  },
}));

import { db } from "@/lib/db";
import { PATCH } from "@/app/api/engagements/[engagementId]/actions/[actionId]/route";
import { transitionActionState } from "@/services/action-lifecycle";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] PATCH /api/engagements/[engagementId]/actions/[actionId]", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const wsA = randomUUID();
  const wsB = randomUUID();
  const clientId = randomUUID();
  const engagementA = randomUUID();
  const engagementB = randomUUID();
  const actionIds: string[] = [];

  const ctx = (workspaceId: string, body: unknown) => ({
    verifiedActorId: actor,
    verifiedActorType: "user",
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: ["ACTION_UPDATE"],
    verifiedSessionSnapshot: { actorId: actor, sessionId: randomUUID(), createdAt: new Date() },
    policy: null,
    request: new Request("http://x/api", { method: "PATCH", body: JSON.stringify(body) }),
  });
  const patch = (workspaceId: string, engagementId: string, actionId: string, body: unknown) =>
    (PATCH as any)(ctx(workspaceId, body), { engagementId, actionId });

  async function makeAction(status: string, engagementId = engagementA, metadata?: Record<string, unknown>): Promise<string> {
    const id = randomUUID();
    await db.action.create({ data: { id, engagementId, title: `Route action ${status}`, status, metadata: metadata as object | undefined, updatedAt: new Date() } });
    actionIds.push(id);
    return id;
  }
  const row = (id: string) => db.action.findUniqueOrThrow({ where: { id }, select: { status: true, version: true, metadata: true } });

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `action-route-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: wsA, name: "Action route A", slug: `action-route-a-${stamp}` } });
    await db.workspace.create({ data: { id: wsB, name: "Action route B", slug: `action-route-b-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Action route client", createdBy: actor, updatedAt: new Date() } });
    for (const [id, workspaceId] of [[engagementA, wsA], [engagementB, wsB]] as const) {
      await db.engagement.create({
        data: { id, code: `ACT-ROUTE-${id}`, title: "Action route engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId, updatedAt: new Date() },
      });
      await db.engagementMembership.create({ data: { id: randomUUID(), userId: actor, engagementId: id, role: "lead" } });
    }
  });

  afterAll(async () => {
    try {
      await db.action.deleteMany({ where: { id: { in: actionIds } } });
      await db.engagementMembership.deleteMany({ where: { userId: actor } });
      await db.engagement.deleteMany({ where: { id: { in: [engagementA, engagementB] } } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
      await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
      await db.user.deleteMany({ where: { id: actor } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] own workspace: assigned → in_progress succeeds (was a 500 PrismaClientValidationError)", async () => {
    const id = await makeAction("assigned");
    const updated = await patch(wsA, engagementA, id, { status: "in_progress", version: 1 });
    expect(updated.status).toBe("in_progress");
    expect(updated.version).toBe(2);
    expect(await row(id)).toMatchObject({ status: "in_progress", version: 2 });
    const audit = await db.auditEvent.findFirst({ where: { workspaceId: wsA, entityId: id, eventName: AUDIT_EVENTS.ACTION_UPDATED } });
    expect(audit).not.toBeNull();
  });

  it("[db] in_progress → blocked with a reason stores the reason in metadata, returns it and audits it", async () => {
    const id = await makeAction("in_progress", engagementA, { outcomeSnapshot: { kept: true } });
    const reason = "Supplier has not delivered the parts";
    const updated = await patch(wsA, engagementA, id, { status: "blocked", blockageReason: reason, version: 1 });
    expect(updated.status).toBe("blocked");
    expect(updated.blockerReason).toBe(reason);
    const stored = await row(id);
    expect(stored.status).toBe("blocked");
    expect(stored.metadata).toEqual({ outcomeSnapshot: { kept: true }, blockerReason: reason });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { workspaceId: wsA, entityId: id, eventName: AUDIT_EVENTS.ACTION_UPDATED } });
    const payload = (typeof audit.payload === "string" ? JSON.parse(audit.payload) : audit.payload) as Record<string, unknown>;
    expect(payload).toMatchObject({ previousStatus: "in_progress", newStatus: "blocked", blockerReason: reason });
  });

  it("[db] blocked without a reason is refused (400 ValidationError) and nothing changes", async () => {
    const id = await makeAction("in_progress");
    await expect(patch(wsA, engagementA, id, { status: "blocked", version: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(await row(id)).toMatchObject({ status: "in_progress", version: 1 });
  });

  it("[db] leaving blocked clears the stored reason", async () => {
    const id = await makeAction("blocked", engagementA, { blockerReason: "old reason" });
    const updated = await patch(wsA, engagementA, id, { status: "assigned", version: 1 });
    expect(updated.status).toBe("assigned");
    expect(updated.blockerReason).toBeNull();
    expect((await row(id)).metadata).toEqual({});
  });

  it("[db] foreign workspace: 404 and nothing changes", async () => {
    const id = await makeAction("assigned");
    const err = await patch(wsB, engagementB, id, { status: "in_progress", version: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).statusCode).toBe(404);
    expect(await row(id)).toMatchObject({ status: "assigned", version: 1 });
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] transitionActionState — no phantom Action columns", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const ws = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const ids: string[] = [];

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `action-lifecycle-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Action lifecycle", slug: `action-lifecycle-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Action lifecycle client", createdBy: actor, updatedAt: new Date() } });
    await db.engagement.create({
      data: { id: engagementId, code: `ACT-LIFE-${stamp}`, title: "Action lifecycle engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    try {
      await db.action.deleteMany({ where: { id: { in: ids } } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.workspace.deleteMany({ where: { id: ws } });
      await db.user.deleteMany({ where: { id: actor } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] in_progress → blocked with a reason persists the reason in metadata", async () => {
    const id = randomUUID();
    ids.push(id);
    await db.action.create({ data: { id, engagementId, title: "Lifecycle action", status: "in_progress", updatedAt: new Date() } });
    const updated = await transitionActionState(id, "blocked", { actorId: actor, reason: "Waiting on permit", workspaceId: ws });
    expect(updated.status).toBe("blocked");
    const stored = await db.action.findUniqueOrThrow({ where: { id }, select: { metadata: true, version: true } });
    expect(stored.metadata).toEqual({ blockerReason: "Waiting on permit" });
    expect(stored.version).toBe(2);
  });
});
