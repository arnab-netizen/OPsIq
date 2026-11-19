/**
 * PHASE RP10: SERIALIZATION PERFORMANCE AUDIT
 *
 * Measure serialization performance and verify the correctness invariants that must hold while measuring.
 *
 * Timing policy: wall-clock percentiles on shared CI runners are not product invariants, so the old tight
 * thresholds (p99 < 500ms, 50 contended appends < 5s, 200 appends < 10s) were replaced by generous SANITY
 * BOUNDS that cannot flake on a slow runner yet still catch an order-of-magnitude regression (e.g. a lost
 * index turning the per-aggregate max(eventNumber) read into a scan, or lock waits approaching emit()'s own
 * 10s interactive-transaction timeout). Each bound is derived from that product limit:
 *   single append / replay:        p50 < 1s, p99 (and each replay) < 5s   (half of emit()'s 10s tx timeout)
 *   50 contended appends (total):  < 60s   (~1.2s per serialized append)
 *   200 appends over 10 aggs:      < 120s  (~0.6s per append)
 * Measured values are written to stderr on every run so regressions stay visible below the bounds.
 *
 * Metrics:
 * A. APPEND LATENCY - Single event append p50/p95/p99
 * B. LOCK CONTENTION - Measure wait time for per-aggregate lock
 * C. REPLAY LATENCY - Single replay p50/p95/p99
 * D. CONCURRENT THROUGHPUT - Events/sec under concurrent load
 * E. MONOTONIC ORDERING OVERHEAD - Cost of uniqueness constraint
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";

const SINGLE_OP_P50_BOUND_MS = 1_000;
const SINGLE_OP_P99_BOUND_MS = 5_000;
const CONTENDED_50_TOTAL_BOUND_MS = 60_000;
const THROUGHPUT_200_TOTAL_BOUND_MS = 120_000;

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function report(line: string): void {
  process.stderr.write(`[RP10 measured] ${line}\n`);
}

describe("Phase RP10: Serialization Performance Audit", () => {
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
        name: "Performance Test Workspace",
        slug: `perf-${Date.now()}`,
        createdBy: userId,
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Performance Test Client",
        updatedAt: new Date(),
      },
    });

    await db.engagement.create({
      data: {
        id: engagementId,
        code: `PERF-${Date.now()}`,
        title: "Performance Test",
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
        email: `perf-${Date.now()}@example.com`,
        name: "Performance Test User",
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

  describe("A. APPEND LATENCY - Single Event Append Performance", () => {
    it("should measure append latency p50/p95/p99", async () => {
      const aggId = uuidv4();
      const latencies: number[] = [];

      // Create initial event
      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Latency Test", status: "draft", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Measure append latency for 50 sequential appends
      for (let i = 0; i < 50; i++) {
        const start = performance.now();

        await EventEmitterService.emit({
          aggregateId: aggId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: `status_${i}`, priority: "high" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });

        const latency = performance.now() - start;
        latencies.push(latency);
      }

      // Sort for percentile calculation
      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      report(
        `A append latency p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms p99=${p99.toFixed(2)}ms avg=${avg.toFixed(2)}ms`
      );

      // Correctness while measuring: 1 created + 50 sequential appends, exactly 1..51.
      const rows = (await db.canonicalEvent.findMany({
        where: { aggregateId: aggId, workspaceId },
        orderBy: { eventNumber: "asc" },
        select: { eventNumber: true },
      })) as Array<{ eventNumber: number }>;
      expect(rows.map((r) => r.eventNumber)).toEqual(range(1, 51));

      expect(latencies).toHaveLength(50);
      expect(p50).toBeLessThan(SINGLE_OP_P50_BOUND_MS);
      expect(p99).toBeLessThan(SINGLE_OP_P99_BOUND_MS);
    });
  });

  describe("B. LOCK CONTENTION - Per-Aggregate Lock Wait Time", () => {
    it("should measure lock wait time under high contention", async () => {
      const aggId = uuidv4();

      // Create initial event
      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Lock Test", status: "draft", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Fire 50 concurrent writes - all will contend for same aggregate lock
      const start = performance.now();

      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          EventEmitterService.emit({
            aggregateId: aggId,
            aggregateType: "recommendation",
            eventType: "recommendation.updated",
            eventVersion: 1,
            payload: { status: `contend_${i}`, priority: "high" },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        )
      );

      const totalTime = performance.now() - start;
      const successes = results.length;
      const throughput = (successes / (totalTime / 1000)).toFixed(2); // events/sec

      report(`B 50 contended appends total=${totalTime.toFixed(2)}ms (${throughput} events/sec)`);

      // Verify all succeeded, each with a distinct number 2..51
      expect(successes).toBe(50);
      expect(results.map((r) => r.eventNumber).sort((a, b) => a - b)).toEqual(range(2, 51));

      expect(totalTime).toBeLessThan(CONTENDED_50_TOTAL_BOUND_MS);
    });
  });

  describe("C. REPLAY LATENCY - Event Replay Performance", () => {
    it("should measure replay latency for aggregates with varying event counts", async () => {
      const aggSmall = uuidv4();
      const aggMedium = uuidv4();
      const aggLarge = uuidv4();

      // Create small aggregate (5 events)
      await EventEmitterService.emit({
        aggregateId: aggSmall,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Small", status: "draft", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      for (let i = 1; i < 5; i++) {
        await EventEmitterService.emit({
          aggregateId: aggSmall,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: `small_${i}`, priority: "high" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      // Create medium aggregate (20 events)
      await EventEmitterService.emit({
        aggregateId: aggMedium,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Medium", status: "draft", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      for (let i = 1; i < 20; i++) {
        await EventEmitterService.emit({
          aggregateId: aggMedium,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: `medium_${i}`, priority: "high" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      // Create large aggregate (50 events)
      await EventEmitterService.emit({
        aggregateId: aggLarge,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Large", status: "draft", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      for (let i = 1; i < 50; i++) {
        await EventEmitterService.emit({
          aggregateId: aggLarge,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: `large_${i}`, priority: "high" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      // Measure replay latency
      let smallReplayTime = 0;
      let mediumReplayTime = 0;
      let largeReplayTime = 0;

      const smallStart = performance.now();
      const small = await EventReplayEngine.replayAggregate(aggSmall, "recommendation", workspaceId);
      smallReplayTime = performance.now() - smallStart;

      const mediumStart = performance.now();
      const medium = await EventReplayEngine.replayAggregate(aggMedium, "recommendation", workspaceId);
      mediumReplayTime = performance.now() - mediumStart;

      const largeStart = performance.now();
      const large = await EventReplayEngine.replayAggregate(aggLarge, "recommendation", workspaceId);
      largeReplayTime = performance.now() - largeStart;

      report(
        `C replay latency 5ev=${smallReplayTime.toFixed(2)}ms 20ev=${mediumReplayTime.toFixed(2)}ms 50ev=${largeReplayTime.toFixed(2)}ms`
      );

      // Correctness of what was timed: each replay folded its whole history to the last status.
      expect([small.eventCount, medium.eventCount, large.eventCount]).toEqual([5, 20, 50]);
      expect([small.lastEventNumber, medium.lastEventNumber, large.lastEventNumber]).toEqual([5, 20, 50]);
      expect([small.state.status, medium.state.status, large.state.status]).toEqual(["small_4", "medium_19", "large_49"]);
      expect([small.state.title, medium.state.title, large.state.title]).toEqual(["Small", "Medium", "Large"]);

      expect(smallReplayTime).toBeLessThan(SINGLE_OP_P99_BOUND_MS);
      expect(mediumReplayTime).toBeLessThan(SINGLE_OP_P99_BOUND_MS);
      expect(largeReplayTime).toBeLessThan(SINGLE_OP_P99_BOUND_MS);
    });
  });

  describe("D. CONCURRENT THROUGHPUT - Events/Sec Under Load", () => {
    it("should measure concurrent throughput with multiple aggregates", async () => {
      const aggregateIds = Array.from({ length: 10 }, () => uuidv4());

      // Initialize all aggregates
      await Promise.all(
        aggregateIds.map((aggId) =>
          EventEmitterService.emit({
            aggregateId: aggId,
            aggregateType: "recommendation",
            eventType: "recommendation.created",
            eventVersion: 1,
            payload: { title: `Agg`, status: "draft", priority: "high", engagementId },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        )
      );

      // Fire 200 concurrent writes across 10 aggregates
      const start = performance.now();

      const promises = [];
      for (let i = 0; i < 200; i++) {
        const aggId = aggregateIds[i % aggregateIds.length];
        promises.push(
          EventEmitterService.emit({
            aggregateId: aggId,
            aggregateType: "recommendation",
            eventType: "recommendation.updated",
            eventVersion: 1,
            payload: { status: `throughput_${i}`, priority: "high" },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        );
      }

      const results = await Promise.all(promises);
      const totalTime = performance.now() - start;
      const throughput = (results.length / (totalTime / 1000)).toFixed(2); // events/sec

      report(`D 200 appends over 10 aggregates total=${totalTime.toFixed(2)}ms (${throughput} events/sec)`);

      expect(results.length).toBe(200);
      for (const aggId of aggregateIds) {
        const rows = (await db.canonicalEvent.findMany({
          where: { aggregateId: aggId, workspaceId },
          orderBy: { eventNumber: "asc" },
          select: { eventNumber: true },
        })) as Array<{ eventNumber: number }>;
        expect(rows.map((r) => r.eventNumber)).toEqual(range(1, 21));
      }
      expect(totalTime).toBeLessThan(THROUGHPUT_200_TOTAL_BOUND_MS);
    });
  });

  describe("E. MONOTONIC ORDERING OVERHEAD - Unique Constraint Cost", () => {
    it("should verify uniqueness constraint doesn't introduce severe overhead", async () => {
      const aggId = uuidv4();

      // Create initial event
      await EventEmitterService.emit({
        aggregateId: aggId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Ordering Test", status: "draft", priority: "high", engagementId },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Measure: 100 sequential writes without contention
      const latencies: number[] = [];

      for (let i = 0; i < 100; i++) {
        const start = performance.now();

        const result = await EventEmitterService.emit({
          aggregateId: aggId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: `ordered_${i}`, priority: "high" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });

        const latency = performance.now() - start;
        latencies.push(latency);

        // Verify monotonicity
        expect(result.eventNumber).toBe(i + 2);
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

      // Verify all event numbers are monotonic
      const allEvents = await db.canonicalEvent.findMany({
        where: { aggregateId: aggId },
        orderBy: { eventNumber: "asc" },
      });

      const eventNumbers = allEvents.map((e) => e.eventNumber);
      for (let i = 0; i < eventNumbers.length; i++) {
        expect(eventNumbers[i]).toBe(i + 1);
      }

      report(
        `E 100 sequential appends p50=${p50.toFixed(2)}ms p99=${p99.toFixed(2)}ms avg=${avg.toFixed(2)}ms`
      );

      expect(eventNumbers.length).toBe(101);
      expect(p50).toBeLessThan(SINGLE_OP_P50_BOUND_MS);
      expect(p99).toBeLessThan(SINGLE_OP_P99_BOUND_MS);
    });
  });
});
