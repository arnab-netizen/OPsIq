/**
 * PHASE RP6: TRUE CONCURRENCY STRESS TESTING
 *
 * Concurrency here is REAL: every storm is driven by several independent OS processes
 * (support/event-store-emit-worker.ts, spawned through tsx). Each process has its own Prisma client and its
 * own PostgreSQL connection (src/lib/db.ts gives every process a pool of exactly one connection, so an
 * in-process Promise.all() would merely queue on one connection). The workers are held at a shared start
 * barrier and released together, so their transactions genuinely contend for the same aggregate lock row.
 *
 * Every assertion is exact: every request must succeed, numbering must be exactly 1..N with no gap and no
 * duplicate, and the per-aggregate lock row must have been taken exactly once per append.
 *
 * Tests:
 * A. SAME AGGREGATE STORM - 100 appends from 5 processes to one aggregate
 * B. REPLAY UNDER CONTENTION - replays in this process while 3 other processes append
 * C. IDEMPOTENCY STORM - one idempotencyKey from 20 requests in 4 processes
 * D. MULTI-AGGREGATE STORM - two aggregates written from 2 processes keep independent sequences
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine, type ReplayedAggregate } from "@/services/event-replay-engine";
import {
  runEmitWorkersConcurrently,
  startEmitWorker,
  type EmitWorkerJob,
  type EmitWorkerOutcome,
  type WorkerEmit,
} from "./support/event-store-workers";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function okOutcomes(outcomes: EmitWorkerOutcome[]): Array<{ id: string; eventNumber: number }> {
  const failed = outcomes.filter((o) => !o.ok);
  expect(failed).toEqual([]);
  return outcomes.flatMap((o) => (o.ok ? [{ id: o.id, eventNumber: o.eventNumber }] : []));
}

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

describe("Phase RP6: TRUE Concurrency Stress Testing (Independent Processes)", () => {
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
        name: "Stress Test Workspace",
        slug: `stress-${Date.now()}`,
        createdBy: userId,
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Stress Test Client",
        updatedAt: new Date(),
      },
    });

    await db.engagement.create({
      data: {
        id: engagementId,
        code: `STRESS-${Date.now()}`,
        title: "Stress Test Engagement",
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
        email: `stress-${Date.now()}@example.com`,
        name: "Stress Test User",
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

  const job = (emits: WorkerEmit[]): EmitWorkerJob => ({ workspaceId, actorId: userId, emits });

  describe("A. SAME AGGREGATE STORM - 100 appends from 5 independent processes", () => {
    it("allocates exactly 2..101 after the initial event, gap-free and duplicate-free, one lock take per append", async () => {
      const recommendationId = uuidv4();
      const processes = 5;
      const perProcess = 20;

      const initial = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Storm Test", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });
      expect(initial.eventNumber).toBe(1);

      const { outcomes, osPids, backendPids } = await runEmitWorkersConcurrently(
        Array.from({ length: processes }, (_, p) =>
          job(
            Array.from({ length: perProcess }, (_, i) => ({
              aggregateId: recommendationId,
              aggregateType: "recommendation",
              eventType: "recommendation.status_changed",
              payload: { status: (p * perProcess + i) % 2 === 0 ? "active" : "blocked" },
            }))
          )
        )
      );

      // The writers really were separate processes on separate PostgreSQL sessions.
      expect(new Set(osPids).size).toBe(processes);
      expect(osPids).not.toContain(process.pid);
      expect(new Set(backendPids).size).toBe(processes);

      const appended = outcomes.flatMap(okOutcomes);
      expect(appended).toHaveLength(processes * perProcess);
      expect(new Set(appended.map((a) => a.id)).size).toBe(100);
      expect(appended.map((a) => a.eventNumber).sort((a, b) => a - b)).toEqual(range(2, 101));

      expect(await persistedNumbers(recommendationId, workspaceId)).toEqual(range(1, 101));
      // Lock row created (version 0) by the initial append, then bumped exactly once per contended append.
      expect(await lockVersion(recommendationId, workspaceId)).toBe(100);
    });
  });

  describe("B. DETERMINISTIC REPLAY UNDER CONTENTION", () => {
    it("every replay taken while other processes append is an exact, gap-free prefix of the final history", async () => {
      const recommendationId = uuidv4();

      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Replay Test", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      const writers = await Promise.all(
        Array.from({ length: 3 }, () =>
          startEmitWorker(
            job(
              Array.from({ length: 10 }, () => ({
                aggregateId: recommendationId,
                aggregateType: "recommendation",
                eventType: "recommendation.status_changed",
                payload: { status: "updated" },
              }))
            )
          )
        )
      );
      let writersFinished = false;
      const allWrites = Promise.all(writers.map((w) => w.outcomes)).finally(() => {
        writersFinished = true;
      });
      for (const w of writers) w.go();

      // Replays run in THIS process on its own connection, continuously, for the whole window in which the
      // 3 writer processes append (and at least 5 times).
      const replays: ReplayedAggregate[] = [];
      while (!writersFinished || replays.length < 5) {
        replays.push(await EventReplayEngine.replayAggregate(recommendationId, "recommendation", workspaceId));
      }
      const writeOutcomes = await allWrites;

      expect(writeOutcomes.flatMap(okOutcomes)).toHaveLength(30);
      expect(await persistedNumbers(recommendationId, workspaceId)).toEqual(range(1, 31));

      for (const r of replays) {
        const seen = r.lastEventNumber;
        expect(seen).toBeGreaterThanOrEqual(1);
        expect(seen).toBeLessThanOrEqual(31);
        expect(r.eventCount).toBe(seen);
        const folded = (r.state.events as Array<{ eventNumber: number }>).map((e) => e.eventNumber);
        expect(folded).toEqual(range(1, seen));
        expect(r.state.title).toBe("Replay Test");
        expect(r.state.status).toBe(seen === 1 ? "active" : "updated");
      }
      // Replays observed a monotonically non-decreasing history (no replay saw a later state, then an earlier one).
      const seenSeq = replays.map((r) => r.lastEventNumber);
      expect(seenSeq).toEqual([...seenSeq].sort((a, b) => a - b));

      const final = await EventReplayEngine.replayAggregate(recommendationId, "recommendation", workspaceId);
      expect(final.eventCount).toBe(31);
      expect(final.lastEventNumber).toBe(31);
      expect(final.state.status).toBe("updated");
    });
  });

  describe("C. IDEMPOTENCY UNDER EXTREME CONCURRENCY", () => {
    it("20 identical requests from 4 processes all succeed and resolve to ONE persisted event", async () => {
      const recommendationId = uuidv4();
      const idempotencyKey = `storm-idem-${uuidv4()}`;

      const { outcomes } = await runEmitWorkersConcurrently(
        Array.from({ length: 4 }, () =>
          job(
            Array.from({ length: 5 }, () => ({
              aggregateId: recommendationId,
              aggregateType: "recommendation",
              eventType: "recommendation.created",
              payload: { title: "Idempotency Test", priority: "high", engagementId },
              idempotencyKey,
            }))
          )
        )
      );

      const results = outcomes.flatMap(okOutcomes);
      expect(results).toHaveLength(20);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(new Set(results.map((r) => r.eventNumber))).toEqual(new Set([1]));

      const rows = (await db.canonicalEvent.findMany({
        where: { aggregateId: recommendationId, workspaceId },
        select: { id: true, eventNumber: true, idempotencyKey: true },
      })) as Array<{ id: string; eventNumber: number; idempotencyKey: string | null }>;
      expect(rows).toEqual([{ id: results[0].id, eventNumber: 1, idempotencyKey }]);
    });
  });

  describe("D. MULTI-AGGREGATE STORM - Independent Sequences", () => {
    it("two aggregates written concurrently from 2 processes each end with exactly 1..21", async () => {
      const agg1Id = uuidv4();
      const agg2Id = uuidv4();

      for (const [aggregateId, title] of [[agg1Id, "Agg1"], [agg2Id, "Agg2"]] as const) {
        await EventEmitterService.emit({
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
      }

      // Each process interleaves both aggregates, so both lock rows are contended across processes.
      const { outcomes } = await runEmitWorkersConcurrently(
        Array.from({ length: 2 }, () =>
          job(
            Array.from({ length: 20 }, (_, i) => ({
              aggregateId: i % 2 === 0 ? agg1Id : agg2Id,
              aggregateType: "recommendation",
              eventType: "recommendation.updated",
              payload: { status: "active" },
            }))
          )
        )
      );

      expect(outcomes.flatMap(okOutcomes)).toHaveLength(40);
      expect(await persistedNumbers(agg1Id, workspaceId)).toEqual(range(1, 21));
      expect(await persistedNumbers(agg2Id, workspaceId)).toEqual(range(1, 21));
      expect(await lockVersion(agg1Id, workspaceId)).toBe(20);
      expect(await lockVersion(agg2Id, workspaceId)).toBe(20);
    });
  });
});
