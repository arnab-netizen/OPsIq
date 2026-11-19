/**
 * PHASE RP8: FAILURE INJECTION TESTING
 *
 * Failures are really injected into the append path of EventEmitterService.emit() and the store is then
 * checked for the three recovery invariants: no partial row, no gap in eventNumbers, and a retry that
 * succeeds with the next number.
 *
 * Injected failures:
 * - SESSION KILL: a writer in another OS process is blocked inside its append transaction (an independent
 *   raw session holds the aggregate lock); its PostgreSQL backend is killed with pg_terminate_backend().
 * - ABORT AFTER LOCK: the append's INSERT violates the actor_id uuid column type after the per-aggregate
 *   lock row was already taken, so the whole transaction (lock bump included) must roll back.
 *
 * Tests:
 * A. CONCURRENT WRITE INTERFERENCE - 30 contending appends, exactly 1..31
 * B. DUPLICATE IDEMPOTENCY KEY - same key twice / 10x concurrently resolves to one event
 * C. REPLAY CONSISTENCY AFTER AN ABORTED APPEND - the failed append is invisible to replay
 * D. CONCURRENT WRITES AROUND INJECTED ABORTS - 20 writes + 5 aborts: exactly 20 succeed, 1..21
 * E. WORKSPACE ISOLATION UNDER CONCURRENT WRITES - same aggregateId in two workspaces, independent 1..11
 * F. HIGH-CONCURRENCY RESILIENCE - 100 writes over 2 aggregates, exactly 1..51 each
 * G. SESSION KILL MID-TRANSACTION - killed writer leaves no row and no lock bump; retry gets the next number
 * H. TRANSACTION ABORT AFTER LOCK - no row, lock version unchanged, retry gets the next number
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { AGGREGATE_LOCK_SQL, openRawSession, startEmitWorker } from "./support/event-store-workers";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function persistedNumbers(aggregateId: string, workspaceId: string): Promise<number[]> {
  const rows = (await db.canonicalEvent.findMany({
    where: { aggregateId, aggregateType: "recommendation", workspaceId },
    orderBy: { eventNumber: "asc" },
    select: { eventNumber: true },
  })) as Array<{ eventNumber: number }>;
  return rows.map((r) => r.eventNumber);
}

async function lockVersion(aggregateId: string, workspaceId: string): Promise<number> {
  const rows = (await db.$queryRaw`
    SELECT version FROM aggregate_locks
    WHERE aggregate_id = ${aggregateId} AND aggregate_type = 'recommendation' AND workspace_id = ${workspaceId}::uuid
  `) as Array<{ version: number }>;
  expect(rows).toHaveLength(1);
  return Number(rows[0].version);
}

async function waitUntilBlockedOnLock(backendPid: number): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const rows = (await db.$queryRaw`
      SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${backendPid}
    `) as Array<{ wait_event_type: string | null }>;
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`backend ${backendPid} never blocked on a lock`);
}

/** An actorId the canonical_events.actor_id uuid column rejects: fails the INSERT after the lock is taken. */
const INVALID_ACTOR = "not-a-uuid";

describe("Phase RP8: Failure Injection & Recovery", () => {
  let workspaceId: string;
  let userId: string;
  let clientId: string;
  let engagementId: string;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    workspaceId = uuidv4();
    userId = uuidv4();
    clientId = uuidv4();
    engagementId = uuidv4();

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: "Failure Injection Workspace",
        slug: `failure-${Date.now()}`,
        createdBy: userId,
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Failure Injection Client",
        updatedAt: new Date(),
      },
    });

    await db.engagement.create({
      data: {
        id: engagementId,
        code: `FAILURE-${Date.now()}`,
        title: "Failure Injection Test",
        clientId,
        workspaceId,
        serviceTier: "standard",
        engagementMode: "advisory",
        createdBy: userId,
        updatedAt: new Date(),
      },
    });

    await db.user.create({
      data: {
        id: userId,
        email: `failure-${Date.now()}@example.com`,
        name: "Failure Injection User",
        hashedPassword: "mock",
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // canonical_events is append-only (trigger prevents DELETE) — skip, workspace has no FK back to it
    try { await db.engagement.deleteMany({ where: { workspaceId } }); } catch { /* best-effort */ }
    // Replay upserts snapshot_data (FK to workspace); without this the workspace delete below always failed.
    try { await db.snapshotData.deleteMany({ where: { workspaceId } }); } catch { /* best-effort */ }
    try { await db.workspace.deleteMany({ where: { id: workspaceId } }); } catch { /* best-effort */ }
    try { await db.clientAccount.deleteMany({ where: { id: clientId } }); } catch { /* best-effort */ }
    try { await db.auditEvent.deleteMany({ where: { actorId: userId } }); } catch { /* best-effort */ }
    try { await db.user.deleteMany({ where: { id: userId } }); } catch { /* best-effort */ }
  });

  const emitUpdate = (
    aggregateId: string,
    payload: Record<string, string>,
    opts: { actorId?: string; workspace?: string } = {}
  ) =>
    EventEmitterService.emit({
      aggregateId,
      aggregateType: "recommendation",
      eventType: "recommendation.updated",
      eventVersion: 1,
      payload,
      actorId: opts.actorId ?? userId,
      workspaceId: opts.workspace ?? workspaceId,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });

  const emitCreated = (aggregateId: string, payload: Record<string, string>, workspace: string = workspaceId) =>
    EventEmitterService.emit({
      aggregateId,
      aggregateType: "recommendation",
      eventType: "recommendation.created",
      eventVersion: 1,
      payload: { priority: "high", engagementId, ...payload },
      actorId: userId,
      workspaceId: workspace,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });

  describe("A. CONCURRENT WRITE INTERFERENCE - Lock Serialization", () => {
    it("30 contending appends all succeed with exactly 2..31", async () => {
      const aggId = uuidv4();
      const initial = await emitCreated(aggId, { title: "Interference Test" });
      expect(initial.eventNumber).toBe(1);

      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) => emitUpdate(aggId, { index: `${i}` }))
      );

      expect(results.map((r) => r.eventNumber).sort((a, b) => a - b)).toEqual(range(2, 31));
      expect(await persistedNumbers(aggId, workspaceId)).toEqual(range(1, 31));
    });
  });

  describe("B. DUPLICATE IDEMPOTENCY KEY - Constraint Violation Recovery", () => {
    it("a resubmitted idempotency key returns the original event and persists nothing new", async () => {
      const aggId = uuidv4();
      const idemKey = `duplicate-idem-${uuidv4()}`;

      const first = await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "First", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: idemKey,
      });
      expect(first.eventNumber).toBe(1);

      const second = await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Retry", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: idemKey,
      });

      expect(second.id).toBe(first.id);
      expect(second.eventNumber).toBe(1);
      // The ORIGINAL payload is returned, not the resubmitted one.
      expect(second.payload.title).toBe("First");
      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1]);
    });

    it("10 concurrent identical requests resolve to one event", async () => {
      const aggId = uuidv4();
      const idemKey = `concurrent-idem-${uuidv4()}`;

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          EventEmitterService.emit({
            aggregateId: aggId,
            aggregateType: "recommendation",
            eventType: "recommendation.created",
            eventVersion: 1,
            payload: { title: "Concurrent Identical", priority: "high", engagementId },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
            idempotencyKey: idemKey,
          })
        )
      );

      expect(results).toHaveLength(10);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1]);
    });
  });

  describe("C. REPLAY CONSISTENCY AFTER AN ABORTED APPEND", () => {
    it("an append aborted after taking the lock is invisible to 5 replays, which are identical", async () => {
      const aggId = uuidv4();

      await emitCreated(aggId, { title: "Event 1", status: "draft" });
      await emitUpdate(aggId, { title: "Event 2", status: "in_review", priority: "high" });
      await expect(
        emitUpdate(aggId, { title: "ABORTED", status: "rejected", priority: "low" }, { actorId: INVALID_ACTOR })
      ).rejects.toMatchObject({ code: "P2007" });
      await emitUpdate(aggId, { title: "Event 3", status: "approved", priority: "high" });

      const replays = await Promise.all(
        Array.from({ length: 5 }, () => EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId))
      );

      const states = replays.map((r) => JSON.stringify(r.state));
      expect(new Set(states).size).toBe(1);
      for (const r of replays) {
        expect(r.eventCount).toBe(3);
        expect(r.lastEventNumber).toBe(3);
        expect(r.state.title).toBe("Event 3");
        expect(r.state.status).toBe("approved");
        expect(r.state.priority).toBe("high");
        expect(JSON.stringify(r.state)).not.toContain("ABORTED");
      }
      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1, 2, 3]);
    });
  });

  describe("D. CONCURRENT WRITES AROUND INJECTED ABORTS", () => {
    it("20 valid writes interleaved with 5 aborting writes: exactly the 5 fail, numbering exactly 1..21", async () => {
      const aggId = uuidv4();
      await emitCreated(aggId, { title: "Query Test" });

      const plan = range(0, 24).map((i) => ({ i, inject: i % 5 === 4 }));
      const settled = await Promise.allSettled(
        plan.map(({ i, inject }) =>
          emitUpdate(aggId, { index: `${i}` }, inject ? { actorId: INVALID_ACTOR } : {})
        )
      );

      const failed = settled.flatMap((r, idx) => (r.status === "rejected" ? [idx] : []));
      expect(failed).toEqual(plan.filter((p) => p.inject).map((p) => p.i));
      const succeeded = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value.eventNumber] : []));
      expect(succeeded.sort((a, b) => a - b)).toEqual(range(2, 21));

      expect(await persistedNumbers(aggId, workspaceId)).toEqual(range(1, 21));
      expect(await lockVersion(aggId, workspaceId)).toBe(20);
    });
  });

  describe("E. WORKSPACE ISOLATION UNDER CONCURRENT WRITES", () => {
    it("the same aggregateId in two workspaces keeps two independent sequences 1..11", async () => {
      const aggId = uuidv4();
      const otherWorkspaceId = uuidv4();

      await db.workspace.create({
        data: {
          id: otherWorkspaceId,
          name: "Other Workspace",
          slug: `other-${Date.now()}`,
          createdBy: userId,
        },
      });
      try {
        await emitCreated(aggId, { title: "WS1 Event" }, workspaceId);
        await emitCreated(aggId, { title: "WS2 Event" }, otherWorkspaceId);

        const results = await Promise.all(
          range(0, 19).map((i) =>
            emitUpdate(aggId, { title: `${i % 2 === 0 ? "WS1" : "WS2"} update ${i}` }, {
              workspace: i % 2 === 0 ? workspaceId : otherWorkspaceId,
            })
          )
        );
        expect(results).toHaveLength(20);

        expect(await persistedNumbers(aggId, workspaceId)).toEqual(range(1, 11));
        expect(await persistedNumbers(aggId, otherWorkspaceId)).toEqual(range(1, 11));

        const ws1 = (await db.canonicalEvent.findMany({
          where: { aggregateId: aggId, workspaceId },
          select: { payload: true },
        })) as Array<{ payload: Record<string, string> }>;
        expect(ws1.map((e) => e.payload.title).filter((t) => t.startsWith("WS2"))).toEqual([]);

        const replay1 = await EventReplayEngine.replayAggregate(aggId, "recommendation", workspaceId);
        const replay2 = await EventReplayEngine.replayAggregate(aggId, "recommendation", otherWorkspaceId);
        expect(replay1.eventCount).toBe(11);
        expect(replay2.eventCount).toBe(11);
        expect(replay1.state.title).toBe("WS1 update 18");
        expect(replay2.state.title).toBe("WS2 update 19");
      } finally {
        // Replay writes a snapshot_data row (FK to workspace); remove it before the workspace itself.
        await db.snapshotData.deleteMany({ where: { workspaceId: otherWorkspaceId } });
        await db.workspace.delete({ where: { id: otherWorkspaceId } });
      }
    });
  });

  describe("F. HIGH-CONCURRENCY RESILIENCE", () => {
    it("100 concurrent writes over 2 aggregates all succeed, each aggregate exactly 1..51", async () => {
      const agg1 = uuidv4();
      const agg2 = uuidv4();
      await Promise.all([emitCreated(agg1, { title: "Agg1" }), emitCreated(agg2, { title: "Agg2" })]);

      const results = await Promise.all(
        range(0, 99).map((i) => emitUpdate(i % 2 === 0 ? agg1 : agg2, { iter: `${i}` }))
      );
      expect(results).toHaveLength(100);

      expect(await persistedNumbers(agg1, workspaceId)).toEqual(range(1, 51));
      expect(await persistedNumbers(agg2, workspaceId)).toEqual(range(1, 51));
    });
  });

  describe("G. SESSION KILL MID-TRANSACTION", () => {
    it("a writer whose backend is terminated inside its append leaves no row and no lock bump; retry gets 2", async () => {
      const aggId = uuidv4();
      await emitCreated(aggId, { title: "Kill Test" });
      expect(await lockVersion(aggId, workspaceId)).toBe(0);

      const holder = await openRawSession();
      try {
        // An independent session holds the aggregate lock, so the writer blocks INSIDE its transaction.
        await holder.query("BEGIN");
        await holder.query(AGGREGATE_LOCK_SQL, [aggId, "recommendation", workspaceId]);

        const writer = await startEmitWorker({
          workspaceId,
          actorId: userId,
          emits: [
            {
              aggregateId: aggId,
              aggregateType: "recommendation",
              eventType: "recommendation.updated",
              payload: { status: "never-committed" },
            },
          ],
        });
        writer.go();
        await waitUntilBlockedOnLock(writer.backendPid);

        const killed = (await db.$queryRaw`
          SELECT pg_terminate_backend(${writer.backendPid}) AS killed
        `) as Array<{ killed: boolean }>;
        expect(killed[0].killed).toBe(true);

        const outcomes = await writer.outcomes;
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0].ok).toBe(false);

        await holder.query("ROLLBACK");
      } finally {
        await holder.end();
      }

      // No partial row, no gap, and the lock row is back at its pre-failure version.
      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1]);
      expect(await lockVersion(aggId, workspaceId)).toBe(0);
      const neverCommitted = (await db.canonicalEvent.findMany({
        where: { aggregateId: aggId, workspaceId },
        select: { payload: true },
      })) as Array<{ payload: Record<string, string> }>;
      expect(neverCommitted.map((e) => e.payload.status)).not.toContain("never-committed");

      const retry = await emitUpdate(aggId, { status: "retried" });
      expect(retry.eventNumber).toBe(2);
      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1, 2]);
      expect(await lockVersion(aggId, workspaceId)).toBe(1);
    });
  });

  describe("H. TRANSACTION ABORT AFTER LOCK", () => {
    it("an INSERT failing after the lock was taken rolls back the lock bump; retry gets the next number", async () => {
      const aggId = uuidv4();
      await emitCreated(aggId, { title: "Abort Test" });
      await emitUpdate(aggId, { status: "second" });
      expect(await lockVersion(aggId, workspaceId)).toBe(1);

      await expect(emitUpdate(aggId, { status: "aborted" }, { actorId: INVALID_ACTOR })).rejects.toMatchObject({
        code: "P2007",
      });

      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1, 2]);
      expect(await lockVersion(aggId, workspaceId)).toBe(1);

      const retry = await emitUpdate(aggId, { status: "retried" });
      expect(retry.eventNumber).toBe(3);
      expect(await persistedNumbers(aggId, workspaceId)).toEqual([1, 2, 3]);
      expect(await lockVersion(aggId, workspaceId)).toBe(2);
    });
  });
});
