import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ConflictError, NotFoundError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Action.metadata writers must not overwrite each other — DB proof with injected interleavings.
 *
 * Root cause: three writers did read → edit JSON in memory → write the whole object back:
 *  - updateActionStatus (metadata.blockerReason), guarded only by a version check — a metadata
 *    write that does not bump the version (outcome.service) slips straight through;
 *  - outcome.service recordOutcome (metadata.outcomeSnapshot), no version check at all;
 *  - action-lifecycle transitionActionState, update with no version predicate at all.
 * Any interleaved writer's key was silently lost. After the fix each writer merges/removes only
 * its own key in SQL (jsonb `||` / `-`) in the same statement as its status/version change, and
 * transitionActionState is compare-and-set on version.
 *
 * Only the outcome service's model inputs and the re-evaluation fan-out are stubbed; every write
 * is real.
 */
const { triggerReEvaluation, computeDecisionConfidence, generateBusinessImpact } = vi.hoisted(() => ({
  triggerReEvaluation: vi.fn().mockResolvedValue({ auditEventId: "ae" }),
  computeDecisionConfidence: vi.fn(),
  generateBusinessImpact: vi.fn(),
}));
vi.mock("@/services/re-evaluation", () => ({ triggerReEvaluation }));
vi.mock("@/services/decision-confidence/decision-confidence.service", () => ({ computeDecisionConfidence }));
vi.mock("@/services/business-impact/business-impact.service", () => ({ generateBusinessImpact }));

import { updateActionStatus } from "@/services/action";
import { transitionActionState } from "@/services/action-lifecycle";
import { recordOutcome } from "@/services/outcome/outcome.service";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Action.metadata — concurrent writers keep each other's keys", () => {
  const stamp = randomUUID();
  const actor = randomUUID();
  const ws = randomUUID();
  const clientId = randomUUID();
  const engagementId = randomUUID();
  const ids: string[] = [];

  const ctx = {
    verifiedActorId: actor,
    verifiedActorType: "user",
    verifiedActor: null,
    verifiedWorkspaceId: ws,
    verifiedCapabilities: ["ACTION_UPDATE"],
    verifiedSessionSnapshot: { actorId: actor, sessionId: randomUUID(), createdAt: new Date() },
    policy: null,
  } as unknown as CanonicalAuthContext;

  async function makeAction(data: { status: string; completedAt?: Date; metadata?: Record<string, unknown> }): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await db.action.create({ data: { id, engagementId, title: "Atomic metadata action", status: data.status, completedAt: data.completedAt, metadata: data.metadata as object | undefined, updatedAt: new Date() } });
    return id;
  }
  const metadataOf = async (id: string) => (await db.action.findUniqueOrThrow({ where: { id }, select: { metadata: true } })).metadata;

  /** After the target's own pre-read returns, an independent writer merges its key atomically. */
  function interleaveAfterFirstRead(method: "findFirst" | "findUnique", write: () => Promise<unknown>) {
    const delegate = db.action as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const real = delegate[method].bind(db.action);
    vi.spyOn(db.action as never, method as never).mockImplementationOnce((async (...args: unknown[]) => {
      const result = await real(...args);
      await write();
      return result;
    }) as never);
  }

  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `action-atomic-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Action atomic WS", slug: `action-atomic-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Action atomic client", createdBy: actor, updatedAt: new Date() } });
    await db.engagement.create({
      data: { id: engagementId, code: `ACT-ATOM-${stamp}`, title: "Action atomic engagement", clientId, serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date() },
    });
    computeDecisionConfidence.mockResolvedValue({ score: 50 });
    generateBusinessImpact.mockResolvedValue({ impactLevel: "low" });
  });

  afterEach(() => vi.restoreAllMocks());

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

  it("[db] an outcome snapshot written between updateActionStatus's read and write survives the blocker write", async () => {
    const id = await makeAction({ status: "in_progress" });
    interleaveAfterFirstRead("findFirst", () =>
      db.$executeRaw`UPDATE actions SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"outcomeSnapshot":{"from":"outcome"}}'::jsonb WHERE id = ${id}::uuid`
    );
    await updateActionStatus(id, { version: 1, status: "blocked", blockerReason: "vendor" }, ctx, ws);
    expect(await metadataOf(id)).toEqual({ outcomeSnapshot: { from: "outcome" }, blockerReason: "vendor" });
  });

  it("[db] a blocker reason written between recordOutcome's read and write survives the outcome write", async () => {
    const id = await makeAction({ status: "completed", completedAt: new Date(), metadata: { outcomeSnapshot: { predictedImpactLevel: "low", predictedConfidence: 50 } } });
    interleaveAfterFirstRead("findFirst", () =>
      db.$executeRaw`UPDATE actions SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"blockerReason":"concurrent"}'::jsonb WHERE id = ${id}::uuid`
    );
    await recordOutcome(id, actor, undefined, ws);
    const metadata = (await metadataOf(id)) as Record<string, unknown>;
    expect(metadata.blockerReason).toBe("concurrent");
    expect(metadata.outcomeSnapshot).toMatchObject({ actualImpactLevel: "low" });
  });

  it("[db] transitionActionState is compare-and-set on version: a concurrent writer is not overwritten", async () => {
    const id = await makeAction({ status: "in_progress" });
    interleaveAfterFirstRead("findUnique", () =>
      db.$executeRaw`UPDATE actions SET title = 'Concurrent edit', version = version + 1 WHERE id = ${id}::uuid`
    );
    await expect(transitionActionState(id, "blocked", { actorId: actor, reason: "permit", workspaceId: ws })).rejects.toBeInstanceOf(ConflictError);
    const stored = await db.action.findUniqueOrThrow({ where: { id }, select: { status: true, title: true, version: true, metadata: true } });
    expect(stored).toEqual({ status: "in_progress", title: "Concurrent edit", version: 2, metadata: null });
  });

  it("[db] transitionActionState still applies when uncontended (reason merged, other keys kept)", async () => {
    const id = await makeAction({ status: "in_progress", metadata: { outcomeSnapshot: { kept: true } } });
    const updated = await transitionActionState(id, "blocked", { actorId: actor, reason: "permit", workspaceId: ws });
    expect(updated.status).toBe("blocked");
    expect(updated.version).toBe(2);
    expect(await metadataOf(id)).toEqual({ outcomeSnapshot: { kept: true }, blockerReason: "permit" });
  });

  it("[db] recordOutcome: a row deleted after its pre-read is NotFound and emits no OUTCOME_RECORDED", async () => {
    const id = await makeAction({ status: "completed", completedAt: new Date(), metadata: { outcomeSnapshot: { predictedImpactLevel: "low", predictedConfidence: 50 } } });
    interleaveAfterFirstRead("findFirst", () => db.action.deleteMany({ where: { id } }));
    await expect(recordOutcome(id, actor, undefined, ws)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: id, eventName: AUDIT_EVENTS.OUTCOME_RECORDED } })).toBe(0);
    expect(triggerReEvaluation).not.toHaveBeenCalledWith(expect.objectContaining({ entityId: id }));
  });
});
