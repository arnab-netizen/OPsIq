/**
 * SHOCK-01 regression [db]: shock events must persist, be workspace-scoped, and trigger
 * re-evaluation. Before: createShockEvent claimed "ShockEvent model does not exist" and never
 * persisted, so created shocks never appeared in listShockEventsForEngagement. Now the record +
 * audit are written atomically and the row is listable; a re-evaluation is triggered.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const { triggerReEvaluation, detectShockFromCurrentState } = vi.hoisted(() => ({
  triggerReEvaluation: vi.fn().mockResolvedValue({ auditEventId: "ae" }),
  detectShockFromCurrentState: vi.fn().mockResolvedValue({ shockDetected: true, severity: "high", indicators: [] }),
}));
vi.mock("@/services/re-evaluation", () => ({ triggerReEvaluation }));
vi.mock("@/services/shock-detection", () => ({ detectShockFromCurrentState }));

import { createShockEvent, listShockEventsForEngagement } from "@/services/shock-event";

const userId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");
const authCtx = { verifiedActorId: userId } as any;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SHOCK-01 shock event persistence + isolation", () => {
  const shockIds: string[] = [];
  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `sh-${userId}@e.com`, name: "s", isActive: true, updatedAt: NOW } });
    for (const id of [wsA, wsB]) await db.workspace.upsert({ where: { id }, update: {}, create: { id, name: `WS ${id}`, slug: `ws-${id}`, createdBy: userId } });
    await db.clientAccount.create({ data: { id: clientId, workspaceId: wsA, name: "c", updatedAt: NOW } });
    await db.engagement.create({ data: { id: engagementId, workspaceId: wsA, code: `E-${engagementId.slice(0, 8)}`, title: "e", clientId, serviceTier: "standard", engagementMode: "advisory", updatedAt: NOW } });
  });
  beforeEach(() => triggerReEvaluation.mockClear());
  afterAll(async () => {
    if (shockIds.length) await db.shockEvent.deleteMany({ where: { id: { in: shockIds } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: userId } });
    vi.restoreAllMocks();
  });

  it("persists a shock event, lists it in-workspace, blocks cross-workspace, and triggers re-eval", async () => {
    const res = await createShockEvent(
      { engagementId, type: "service_breakdown", severity: "high", happenedAt: NOW.toISOString() } as any,
      authCtx,
      wsA
    );
    shockIds.push(res.id);

    // persisted
    const row = await db.shockEvent.findUnique({ where: { id: res.id } });
    expect(row).not.toBeNull();
    expect(row?.engagementId).toBe(engagementId);

    // listable in its workspace
    const inA = await listShockEventsForEngagement(engagementId, undefined, wsA);
    expect(inA.map((e) => e.id)).toContain(res.id);

    // NOT listable from another workspace (scoped via engagement.workspaceId)
    const inB = await listShockEventsForEngagement(engagementId, undefined, wsB);
    expect(inB.map((e) => e.id)).not.toContain(res.id);

    // re-evaluation triggered
    expect(triggerReEvaluation).toHaveBeenCalledTimes(1);
    expect(triggerReEvaluation.mock.calls[0][0]).toMatchObject({ changeType: "shock_event", engagementId, workspaceId: wsA });
  });
});
