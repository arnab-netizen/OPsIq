/**
 * PHASE RP7: FORCED DEADLOCK + RETRY RECOVERY TESTS
 *
 * Contract under test (src/services/event-emitter.ts): every EventEmitterService.emit() runs one
 * READ COMMITTED transaction that takes exactly ONE per-aggregate lock row (aggregate_locks, via
 * INSERT ... ON CONFLICT DO UPDATE), reads the last eventNumber and inserts lastEventNumber + 1. Because an
 * emit holds a single lock, emits can never form a lock-order cycle with each other (A). A genuine
 * opposite-order deadlock therefore needs a writer that holds TWO aggregate locks; A2 builds exactly that
 * on the product's own lock table with two independent PostgreSQL sessions, lets PostgreSQL's deadlock
 * detector abort one, and proves recovery: the victim's partial append is rolled back, the retried
 * transaction succeeds, numbering stays gap-free and emit() keeps working on both aggregates.
 * emit() itself performs no automatic retry: the retry in A2 is the caller's, as it must be for 40P01.
 *
 * Tests:
 * A. SINGLE-LOCK EMITS - concurrent cross-aggregate emits, exact counts and numbering
 * A2. OPPOSITE LOCK ORDER - agg1->agg2 vs agg2->agg1: one 40P01 victim, rollback, retry succeeds
 * B. IDEMPOTENCY KEY RECOVERY - duplicate keys resolve to one event per key
 * C. RETRY SUCCESS UNDER CONFLICT - two contending appends get 2 and 3
 * D. MANY-AGGREGATE WRITES - 50 writes over 10 aggregates, exactly 1..6 each
 * E. STRESS WITH INJECTED FAILURES - 10 of 100 requests fail inside the transaction after taking the lock;
 *    exactly those fail, and they consume neither an eventNumber nor a lock version
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import type pg from "pg";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { AGGREGATE_LOCK_SQL, openRawSession } from "./support/event-store-workers";

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

/** Take the product's per-aggregate lock in an open raw transaction. */
function takeLock(s: pg.Client, aggregateId: string, workspaceId: string): Promise<pg.QueryResult> {
  return s.query(AGGREGATE_LOCK_SQL, [aggregateId, "recommendation", workspaceId]);
}

/** Append the next event for an aggregate whose lock the raw transaction already holds (emit()'s steps 2-3). */
async function appendLocked(
  s: pg.Client,
  aggregateId: string,
  workspaceId: string,
  actorId: string
): Promise<{ id: string; eventNumber: number }> {
  const next = await s.query(
    `SELECT COALESCE(MAX(event_number), 0) + 1 AS n FROM canonical_events
     WHERE aggregate_id = $1 AND aggregate_type = 'recommendation' AND workspace_id = $2`,
    [aggregateId, workspaceId]
  );
  const ins = await s.query(
    `INSERT INTO canonical_events (aggregate_id, aggregate_type, event_type, event_version, event_number,
       payload, actor_id, workspace_id, causation_id, correlation_id, occurred_at)
     VALUES ($1, 'recommendation', 'recommendation.updated', 1, $2, $3::jsonb, $4, $5, $6, $6, now())
     RETURNING id, event_number`,
    [aggregateId, Number(next.rows[0].n), JSON.stringify({ status: "multi-aggregate" }), actorId, workspaceId, uuidv4()]
  );
  return { id: String(ins.rows[0].id), eventNumber: Number(ins.rows[0].event_number) };
}

async function waitUntilBlockedOnLock(backendPid: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const rows = (await db.$queryRaw`
      SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${backendPid}
    `) as Array<{ wait_event_type: string | null }>;
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`backend ${backendPid} never blocked on a lock`);
}

describe("Phase RP7: Deadlock & Retry Recovery", () => {
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
        name: "Deadlock Test Workspace",
        slug: `deadlock-${Date.now()}`,
        createdBy: userId,
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Deadlock Test Client",
        updatedAt: new Date(),
      },
    });

    await db.engagement.create({
      data: {
        id: engagementId,
        code: `DEADLOCK-${Date.now()}`,
        title: "Deadlock Test Engagement",
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
        email: `deadlock-${Date.now()}@example.com`,
        name: "Deadlock Test User",
        hashedPassword: "mock",
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // canonical_events is append-only (trigger prevents DELETE) — skip, workspace has no FK back to it
    try { await db.engagement.deleteMany({ where: { workspaceId } }); } catch { /* best-effort */ }
    try { await db.workspace.deleteMany({ where: { id: workspaceId } }); } catch { /* best-effort */ }
    try { await db.clientAccount.deleteMany({ where: { id: clientId } }); } catch { /* best-effort */ }
    try { await db.auditEvent.deleteMany({ where: { actorId: userId } }); } catch { /* best-effort */ }
    try { await db.user.deleteMany({ where: { id: userId } }); } catch { /* best-effort */ }
  });

  const emitUpdate = (aggregateId: string, status: string, actorId: string = userId) =>
    EventEmitterService.emit({
      aggregateId,
      aggregateType: "recommendation",
      eventType: "recommendation.updated",
      eventVersion: 1,
      payload: { status },
      actorId,
      workspaceId,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });

  const emitCreated = (aggregateId: string, title: string) =>
    EventEmitterService.emit({
      aggregateId,
      aggregateType: "recommendation",
      eventType: "recommendation.created",
      eventVersion: 1,
      payload: { title, priority: "high", engagementId },
      actorId: userId,
      workspaceId,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });

  describe("A. SINGLE-LOCK EMITS - Lock Order Independence", () => {
    it("alternating concurrent emits to two aggregates all succeed with exact numbering", async () => {
      const agg1Id = uuidv4();
      const agg2Id = uuidv4();
      await emitCreated(agg1Id, "Agg1");
      await emitCreated(agg2Id, "Agg2");

      const results = await Promise.all([
        emitUpdate(agg1Id, "active"),
        emitUpdate(agg2Id, "blocked"),
        emitUpdate(agg1Id, "pending"),
        emitUpdate(agg2Id, "active"),
      ]);

      expect(results).toHaveLength(4);
      for (const aggId of [agg1Id, agg2Id]) {
        const numbers = results.filter((r) => r.aggregateId === aggId).map((r) => r.eventNumber);
        expect(numbers.sort((a, b) => a - b)).toEqual([2, 3]);
      }
      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual([1, 2, 3]);
      expect(await persistedNumbers(agg2Id, workspaceId)).toEqual([1, 2, 3]);
    });
  });

  describe("A2. OPPOSITE LOCK ORDER - Genuine Deadlock, Detection And Retry", () => {
    it("agg1->agg2 vs agg2->agg1: exactly one 40P01 victim, its partial append rolls back, retry succeeds gap-free", async () => {
      const agg1Id = uuidv4();
      const agg2Id = uuidv4();
      await emitCreated(agg1Id, "Agg1");
      await emitCreated(agg2Id, "Agg2");

      const sessions = [await openRawSession(), await openRawSession()];
      try {
        const pids = await Promise.all(
          sessions.map(async (s) => Number((await s.query("SELECT pg_backend_pid() AS pid")).rows[0].pid))
        );
        expect(pids[0]).not.toBe(pids[1]);
        const order: Array<[string, string]> = [
          [agg1Id, agg2Id], // session 0 locks agg1 then agg2
          [agg2Id, agg1Id], // session 1 locks agg2 then agg1
        ];

        // Both sessions take their FIRST lock and append to that aggregate (a partial multi-aggregate write).
        const firstAppends: Array<{ id: string; eventNumber: number }> = [];
        for (let i = 0; i < 2; i++) {
          await sessions[i].query("BEGIN");
          await takeLock(sessions[i], order[i][0], workspaceId);
          firstAppends.push(await appendLocked(sessions[i], order[i][0], workspaceId, userId));
        }
        expect(firstAppends.map((a) => a.eventNumber)).toEqual([2, 2]);

        // Session 0 now waits for agg2 (held by session 1); then session 1 asks for agg1 (held by session 0).
        const second0 = takeLock(sessions[0], order[0][1], workspaceId);
        await waitUntilBlockedOnLock(pids[0]);
        const second1 = takeLock(sessions[1], order[1][1], workspaceId);
        const settled = await Promise.allSettled([second0, second1]);

        const rejected = settled.flatMap((r, i) => (r.status === "rejected" ? [i] : []));
        expect(rejected).toHaveLength(1);
        const victim = rejected[0];
        const survivor = 1 - victim;
        const victimError = (settled[victim] as PromiseRejectedResult).reason as { code?: string };
        expect(victimError.code).toBe("40P01");

        // Survivor completes its two-aggregate write; the victim's transaction is aborted and rolled back.
        const survivorSecond = await appendLocked(sessions[survivor], order[survivor][1], workspaceId, userId);
        expect(survivorSecond.eventNumber).toBe(2);
        await sessions[survivor].query("COMMIT");
        await sessions[victim].query("ROLLBACK");

        const victimPartial = await db.canonicalEvent.count({ where: { id: firstAppends[victim].id } });
        expect(victimPartial).toBe(0);
        expect(await persistedNumbers(agg1Id, workspaceId)).toEqual([1, 2]);
        expect(await persistedNumbers(agg2Id, workspaceId)).toEqual([1, 2]);

        // Retry the victim's whole transaction in its original lock order: it now succeeds.
        const v = sessions[victim];
        await v.query("BEGIN");
        await takeLock(v, order[victim][0], workspaceId);
        const retryFirst = await appendLocked(v, order[victim][0], workspaceId, userId);
        await takeLock(v, order[victim][1], workspaceId);
        const retrySecond = await appendLocked(v, order[victim][1], workspaceId, userId);
        await v.query("COMMIT");
        expect([retryFirst.eventNumber, retrySecond.eventNumber]).toEqual([3, 3]);
      } finally {
        await Promise.all(sessions.map((s) => s.end()));
      }

      // The lock rows are not wedged: the product's emit appends the next number to both aggregates.
      expect((await emitUpdate(agg1Id, "after-deadlock")).eventNumber).toBe(4);
      expect((await emitUpdate(agg2Id, "after-deadlock")).eventNumber).toBe(4);
      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual([1, 2, 3, 4]);
      expect(await persistedNumbers(agg2Id, workspaceId)).toEqual([1, 2, 3, 4]);
      // created(0) + survivor-or-victim-retry first lock + the other's lock + emit; the aborted take left no trace.
      expect(await lockVersion(agg1Id, workspaceId)).toBe(3);
      expect(await lockVersion(agg2Id, workspaceId)).toBe(3);
    });
  });

  describe("B. IDEMPOTENCY KEY RECOVERY - Constraint Violation Handling", () => {
    it("15 concurrent identical requests resolve to one event", async () => {
      const agg1Id = uuidv4();
      const idempotencyKey = `recovery-test-${uuidv4()}`;

      const results = await Promise.all(
        Array.from({ length: 15 }, () =>
          EventEmitterService.emit({
            aggregateId: agg1Id,
            aggregateType: "recommendation",
            eventType: "recommendation.created",
            eventVersion: 1,
            payload: { title: "Recovery Test", priority: "high", engagementId },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
            idempotencyKey,
          })
        )
      );

      expect(results).toHaveLength(15);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(new Set(results.map((r) => r.eventNumber))).toEqual(new Set([1]));
      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual([1]);
    });

    it("5 keys x 5 concurrent requests each produce exactly 5 events numbered 1..5", async () => {
      const agg1Id = uuidv4();
      const idempotencyKeys = Array.from({ length: 5 }, (_, i) => `idem-${i}-${uuidv4()}`);

      const requests = idempotencyKeys.flatMap((idemKey) =>
        Array.from({ length: 5 }, (_, i) => ({ idemKey, i }))
      );
      const results = await Promise.all(
        requests.map(({ idemKey, i }) =>
          EventEmitterService.emit({
            aggregateId: agg1Id,
            aggregateType: "recommendation",
            eventType: "recommendation.created",
            eventVersion: 1,
            payload: { title: `Item ${idemKey}-${i}`, priority: "high", engagementId },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
            idempotencyKey: idemKey,
          })
        )
      );

      expect(results).toHaveLength(25);
      for (const idemKey of idempotencyKeys) {
        const forKey = results.filter((r) => r.idempotencyKey === idemKey);
        expect(forKey).toHaveLength(5);
        expect(new Set(forKey.map((r) => r.id)).size).toBe(1);
      }
      expect(new Set(results.map((r) => r.id)).size).toBe(5);
      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual(range(1, 5));
    });
  });

  describe("C. RETRY SUCCESS UNDER CONFLICT", () => {
    it("two contending appends get exactly 2 and 3", async () => {
      const agg1Id = uuidv4();
      const initialResult = await emitCreated(agg1Id, "Retry Test");
      expect(initialResult.eventNumber).toBe(1);

      const [result1, result2] = await Promise.all([
        emitUpdate(agg1Id, "status1"),
        emitUpdate(agg1Id, "status2"),
      ]);

      expect([result1.eventNumber, result2.eventNumber].sort((a, b) => a - b)).toEqual([2, 3]);
      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual([1, 2, 3]);
    });
  });

  describe("D. MANY-AGGREGATE WRITES - Lock Order Invariance", () => {
    it("50 concurrent writes over 10 aggregates: all succeed, each aggregate exactly 1..6", async () => {
      const aggregateIds = Array.from({ length: 10 }, () => uuidv4());
      await Promise.all(aggregateIds.map((aggId) => emitCreated(aggId, `Agg${aggId.slice(0, 4)}`)));

      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) => emitUpdate(aggregateIds[i % aggregateIds.length], `${i}`))
      );
      expect(results).toHaveLength(50);

      for (const aggId of aggregateIds) {
        expect(await persistedNumbers(aggId, workspaceId)).toEqual(range(1, 6));
        expect(await lockVersion(aggId, workspaceId)).toBe(5);
      }
    });
  });

  describe("E. STRESS RECOVERY - High Volume With Injected Failures", () => {
    it("exactly the 10 injected failures fail; they consume no eventNumber and no lock version", async () => {
      const agg1Id = uuidv4();
      await emitCreated(agg1Id, "Stress Test");

      // Every 10th request carries an actorId the canonical_events.actor_id uuid column rejects: the
      // transaction has already taken the aggregate lock when the INSERT fails, so it must roll back whole.
      const injected = new Set(range(0, 99).filter((i) => i % 10 === 9));
      const settled = await Promise.allSettled(
        range(0, 99).map((i) => emitUpdate(agg1Id, `${i}`, injected.has(i) ? "not-a-uuid" : userId))
      );

      const failedIdx = settled.flatMap((r, i) => (r.status === "rejected" ? [i] : []));
      expect(failedIdx).toEqual([...injected]);
      for (const i of failedIdx) {
        const reason = (settled[i] as PromiseRejectedResult).reason as { code?: string; message?: string };
        expect(reason.code).toBe("P2007");
        expect(String(reason.message)).toContain("not-a-uuid");
      }
      const appended = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value.eventNumber] : []));
      expect(appended.sort((a, b) => a - b)).toEqual(range(2, 91));

      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual(range(1, 91));
      expect(await lockVersion(agg1Id, workspaceId)).toBe(90);
    });
  });
});
