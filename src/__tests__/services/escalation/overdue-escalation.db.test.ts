/**
 * [db]-gated Wave 6 runtime-readiness proof — overdue-action escalation no longer queries/writes the phantom
 * `Action.priority` / `Action.dueDate` / `Action.workspaceId` fields (the Action model has none of them). It proves,
 * against a REAL DB via the un-mocked services:
 *  - `detectHighPriorityOverdueActions` (wired into the Phase-7 re-eval loop + escalation-checks route) no longer
 *    throws PrismaClientValidationError and correctly derives "critical overdue" from the linked
 *    Recommendation.priority (not a phantom Action column);
 *  - an overdue action whose recommendation is NOT critical, a critical recommendation whose action is NOT overdue,
 *    and an overdue action with NO recommendation each produce NO alert (real derivation, no fabricated priority);
 *  - cross-workspace isolation (a foreign workspace's overdue critical action does not surface);
 *  - `detectOverdueActions` no longer throws on the phantom-column write and records an ACTION_OVERDUE audit event.
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { detectHighPriorityOverdueActions } from "@/services/escalation";
import { detectOverdueActions } from "@/services/action";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

interface WS { actorId: string; workspaceId: string; clientId: string; engagementId: string; }

const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

async function seedWorkspace(tag: string): Promise<WS> {
  const actorId = randomUUID(), workspaceId = randomUUID(), clientId = randomUUID(), engagementId = randomUUID();
  await db.user.create({ data: { id: actorId, email: `esc-${tag}-${actorId}@example.com`, isActive: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: `WS ${tag}`, slug: `esc-${workspaceId.substring(0, 8)}` } });
  await db.clientAccount.create({ data: { id: clientId, name: `Client ${tag}`, createdBy: actorId, updatedAt: new Date() } });
  await db.engagement.create({ data: { id: engagementId, code: `ENG-${engagementId.substring(0, 8)}`, title: `Eng ${tag}`, clientId, serviceTier: "diagnostic", engagementMode: "advisory", workspaceId, updatedAt: new Date() } });
  return { actorId, workspaceId, clientId, engagementId };
}

async function cleanup(ws: WS) {
  await db.action.deleteMany({ where: { engagementId: ws.engagementId } }).catch(() => undefined);
  await db.recommendation.deleteMany({ where: { engagementId: ws.engagementId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.engagement.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.clientAccount.delete({ where: { id: ws.clientId } }).catch(() => undefined);
  await db.user.delete({ where: { id: ws.actorId } }).catch(() => undefined);
}

function ctxFor(ws: WS): CanonicalAuthContext {
  // detectHighPriorityOverdueActions reads authContext.session?.user?.id for the audit actorId.
  return { session: { user: { id: ws.actorId } } } as unknown as CanonicalAuthContext;
}

async function seedRecommendation(ws: WS, priority: string): Promise<string> {
  const id = randomUUID();
  await db.recommendation.create({ data: { id, engagementId: ws.engagementId, workspaceId: ws.workspaceId, title: `Rec ${priority}`, priority } });
  return id;
}

async function seedAction(ws: WS, opts: { dueAt: Date | null; status?: string; recommendationId?: string | null }): Promise<string> {
  const id = randomUUID();
  await db.action.create({
    data: {
      id, engagementId: ws.engagementId, title: "Act", status: opts.status ?? "assigned",
      dueAt: opts.dueAt, recommendationId: opts.recommendationId ?? null, updatedAt: new Date(),
    },
  });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 6 — overdue-action escalation (Recommendation-derived priority, no phantom columns)", () => {
  let A: WS, B: WS;
  beforeEach(async () => { A = await seedWorkspace("A"); B = await seedWorkspace("B"); });
  afterEach(async () => { await cleanup(A); await cleanup(B); });

  it("[db] overdue action with a CRITICAL recommendation → high_priority_overdue alert (no throw)", async () => {
    const recId = await seedRecommendation(A, "critical");
    const actionId = await seedAction(A, { dueAt: PAST, recommendationId: recId });
    const alert = await detectHighPriorityOverdueActions(A.engagementId, ctxFor(A), A.workspaceId);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("high_priority_overdue");
    expect(alert?.severity).toBe("critical");
    expect(alert?.relatedEntityIds).toContain(actionId);
  });

  it("[db] M4 honesty: the alert and its audit event carry delivery:'log_only' (not implied delivery)", async () => {
    const recId = await seedRecommendation(A, "critical");
    await seedAction(A, { dueAt: PAST, recommendationId: recId });
    const alert = await detectHighPriorityOverdueActions(A.engagementId, ctxFor(A), A.workspaceId);
    expect(alert?.delivery).toBe("log_only");
    const auditEvent = await db.auditEvent.findFirst({
      where: { workspaceId: A.workspaceId, eventName: "escalation.high_priority_overdue", entityId: A.engagementId },
    });
    expect(auditEvent).not.toBeNull();
    expect((auditEvent?.payload as { delivery?: string } | null)?.delivery).toBe("log_only");
  });

  it("[db] overdue action whose recommendation is NOT critical → no alert (real derivation)", async () => {
    const recId = await seedRecommendation(A, "high");
    await seedAction(A, { dueAt: PAST, recommendationId: recId });
    const alert = await detectHighPriorityOverdueActions(A.engagementId, ctxFor(A), A.workspaceId);
    expect(alert).toBeNull();
  });

  it("[db] critical recommendation but action NOT overdue → no alert", async () => {
    const recId = await seedRecommendation(A, "critical");
    await seedAction(A, { dueAt: FUTURE, recommendationId: recId });
    const alert = await detectHighPriorityOverdueActions(A.engagementId, ctxFor(A), A.workspaceId);
    expect(alert).toBeNull();
  });

  it("[db] overdue action with NO recommendation → no alert (no fabricated priority)", async () => {
    await seedAction(A, { dueAt: PAST, recommendationId: null });
    const alert = await detectHighPriorityOverdueActions(A.engagementId, ctxFor(A), A.workspaceId);
    expect(alert).toBeNull();
  });

  it("[db] isolation — a foreign workspace's overdue critical action does not surface", async () => {
    const recId = await seedRecommendation(A, "critical");
    await seedAction(A, { dueAt: PAST, recommendationId: recId });
    // Query B's engagement/workspace: A's overdue critical action must not appear.
    const alert = await detectHighPriorityOverdueActions(B.engagementId, ctxFor(B), B.workspaceId);
    expect(alert).toBeNull();
  });

  it("[db] detectOverdueActions no longer throws and records an ACTION_OVERDUE audit event", async () => {
    const actionId = await seedAction(A, { dueAt: PAST, recommendationId: null });
    const results = await detectOverdueActions(A.engagementId, ctxFor(A), A.workspaceId);
    expect(results.some((r) => r.actionId === actionId && r.overdue)).toBe(true);
    const overdueEvents = await db.auditEvent.findMany({ where: { workspaceId: A.workspaceId, eventName: "action.overdue", entityId: actionId } });
    expect(overdueEvents.length).toBeGreaterThanOrEqual(1);
    // The action was NOT mutated with a phantom priority column and its version is unchanged.
    const action = await db.action.findUnique({ where: { id: actionId }, select: { version: true } });
    expect(action?.version).toBe(1);
  });
});
