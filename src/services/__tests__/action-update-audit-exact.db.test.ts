import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";

// Pass-through wrapper around the real compare-and-set so one test can inject an interleaved
// writer right after the real statement commits.
const { realCas } = vi.hoisted(() => ({ realCas: { fn: null as null | ((...a: unknown[]) => Promise<unknown>) } }));
vi.mock("@/services/action-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/action-store")>();
  realCas.fn = original.compareAndSetAction as (...a: unknown[]) => Promise<unknown>;
  return { ...original, compareAndSetAction: vi.fn(original.compareAndSetAction) };
});

import { compareAndSetAction } from "@/services/action-store";
import { updateAction } from "@/services/action";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * updateAction — every meaningful edit is audited, and the result/audit describe exactly the
 * write this call committed (not a later re-read).
 *
 * Root causes:
 *  - updateAction emitted ACTION_UPDATED only when the status changed; title, description,
 *    assignee and date edits mutated a governed record with no audit event (CLAUDE.md: all
 *    meaningful mutations must emit audit events).
 *  - After the compare-and-set it re-read the row and returned that; a writer committing between
 *    the CAS and the re-read made the call return (and describe) someone else's state.
 *
 * The interleaving is injected deterministically: the real compare-and-set statement runs, then
 * a second real write lands before control returns to the service.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("updateAction — complete audit and exact results", () => {
  const stamp = uuidv4();
  const userId = uuidv4();
  const assignee = uuidv4();
  const ws = uuidv4();
  const clientId = uuidv4();
  const engagementId = uuidv4();
  const ids: string[] = [];

  const ctx = {
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: ws,
    verifiedCapabilities: ["ACTION_UPDATE"],
    verifiedSessionSnapshot: { actorId: userId, sessionId: uuidv4(), createdAt: new Date() },
    policy: null,
  } as unknown as CanonicalAuthContext;

  async function makeAction(): Promise<string> {
    const id = uuidv4();
    ids.push(id);
    await db.action.create({ data: { id, engagementId, title: "Original title", description: "Original description", status: "assigned", updatedAt: new Date() } });
    return id;
  }

  async function auditPayloads(id: string): Promise<Record<string, unknown>[]> {
    const events = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: id, eventName: AUDIT_EVENTS.ACTION_UPDATED }, orderBy: { occurredAt: "asc" } });
    return events.map((e) => (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>);
  }

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `action-audit-${stamp}@test.local`, updatedAt: new Date() } });
    await db.user.create({ data: { id: assignee, email: `action-audit-assignee-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Action audit WS", slug: `action-audit-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Action audit client", createdBy: userId, updatedAt: new Date() } });
    await db.engagement.create({
      data: { id: engagementId, code: `ACT-AUD-${stamp}`, title: "Action audit engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date() },
    });
  });

  afterEach(() => {
    vi.mocked(compareAndSetAction).mockClear();
  });

  afterAll(async () => {
    try {
      await db.action.deleteMany({ where: { id: { in: ids } } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.workspace.deleteMany({ where: { id: ws } });
      await db.user.deleteMany({ where: { id: { in: [userId, assignee] } } });
    } catch {
      // best-effort cleanup
    }
  });

  it("[db] a title edit emits ACTION_UPDATED with the field's previous and new value", async () => {
    const id = await makeAction();
    await updateAction(id, { version: 1, title: "New title" }, ctx, ws);
    const payloads = await auditPayloads(id);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ changes: { title: { from: "Original title", to: "New title" } }, previousVersion: 1, version: 2 });
  });

  it("[db] description and assignee edits are audited too", async () => {
    const id = await makeAction();
    await updateAction(id, { version: 1, description: "New description" }, ctx, ws);
    await updateAction(id, { version: 2, assignedTo: assignee }, ctx, ws);
    const payloads = await auditPayloads(id);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ changes: { description: { from: "Original description", to: "New description" } } });
    expect(payloads[1]).toMatchObject({ changes: { assignedTo: { from: null, to: assignee } }, version: 3 });
  });

  it("[db] a status change keeps fromStatus/toStatus in the payload", async () => {
    const id = await makeAction();
    await updateAction(id, { version: 1, status: "in_progress" }, ctx, ws);
    const payloads = await auditPayloads(id);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ fromStatus: "assigned", toStatus: "in_progress", changes: { status: { from: "assigned", to: "in_progress" } } });
  });

  it("[db] the result describes this call's write even if another writer commits right after the CAS", async () => {
    const id = await makeAction();
    // The CAS is a single UPDATE ... RETURNING statement; a second, legitimate writer lands right
    // after it commits and before the service does anything else.
    vi.mocked(compareAndSetAction).mockImplementationOnce(async (...args) => {
      const result = await realCas.fn!(...args);
      await db.action.updateMany({ where: { id }, data: { title: "Interleaved writer", version: { increment: 1 } } });
      return result as Awaited<ReturnType<typeof compareAndSetAction>>;
    });
    const returned = await updateAction(id, { version: 1, status: "in_progress", title: "Mine" }, ctx, ws);
    expect(returned.version).toBe(2);
    expect(returned.title).toBe("Mine");
    expect(returned.status).toBe("in_progress");
    const payloads = await auditPayloads(id);
    expect(payloads[0]).toMatchObject({ version: 2, toStatus: "in_progress", changes: { title: { to: "Mine" } } });
    expect((await db.action.findUniqueOrThrow({ where: { id }, select: { version: true } })).version).toBe(3);
  });
});
