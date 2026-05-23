/**
 * PHASE RP10: SERIALIZATION PERFORMANCE AUDIT
 *
 * Measure and verify serialization performance under real concurrency.
 * Ensures atomicity doesn't introduce unacceptable latency.
 *
 * Metrics:
 * A. APPEND LATENCY - Single event append p50/p95/p99
 * B. LOCK CONTENTION - Measure wait time for per-aggregate lock
 * C. REPLAY LATENCY - Single replay p50/p95/p99
 * D. CONCURRENT THROUGHPUT - Events/sec under concurrent load
 * E. MONOTONIC ORDERING OVERHEAD - Cost of uniqueness constraint
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { ensureStartupStatusReady } from "../test-helpers/startup-helper";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";

describe("Phase RP10: Serialization Performance Audit", () => {
  let workspaceId: string;
  let userId: string;
  let clientId: string;
  let engagementId: string;

  beforeAll(async () => {
    await ensureStartupStatusReady();
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
    try {
      await db.canonicalEvent.deleteMany({ where: { workspaceId } });
      await db.engagement.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch (error) {
      // Ignore cleanup errors
    }
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

      console.log(
        `✅ RP10A: Append Latency - p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms, avg: ${avg.toFixed(2)}ms`
      );

      // Latency should be reasonable (< 500ms even at p99)
      expect(p99).toBeLessThan(500);
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

      console.log(
        `✅ RP10B: Lock Contention - 50 concurrent writes completed in ${totalTime.toFixed(2)}ms (${throughput} events/sec)`
      );

      // Verify all succeeded
      expect(successes).toBe(50);

      // Total time should be reasonable (< 5 seconds for 50 events)
      expect(totalTime).toBeLessThan(5000);
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
      await EventReplayEngine.replayAggregate(aggSmall, "recommendation", workspaceId);
      smallReplayTime = performance.now() - smallStart;

      const mediumStart = performance.now();
      await EventReplayEngine.replayAggregate(aggMedium, "recommendation", workspaceId);
      mediumReplayTime = performance.now() - mediumStart;

      const largeStart = performance.now();
      await EventReplayEngine.replayAggregate(aggLarge, "recommendation", workspaceId);
      largeReplayTime = performance.now() - largeStart;

      console.log(
        `✅ RP10C: Replay Latency - 5 events: ${smallReplayTime.toFixed(2)}ms, 20 events: ${mediumReplayTime.toFixed(2)}ms, 50 events: ${largeReplayTime.toFixed(2)}ms`
      );

      // Latency should scale reasonably with event count
      expect(smallReplayTime).toBeLessThan(500);
      expect(mediumReplayTime).toBeLessThan(500);
      expect(largeReplayTime).toBeLessThan(500);
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

      console.log(
        `✅ RP10D: Concurrent Throughput - 200 events across 10 aggregates in ${totalTime.toFixed(2)}ms (${throughput} events/sec)`
      );

      expect(results.length).toBe(200);
      expect(totalTime).toBeLessThan(10000);
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

      console.log(
        `✅ RP10E: Monotonic Ordering - 100 sequential writes with verified monotonicity (p50: ${p50.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms, avg: ${avg.toFixed(2)}ms)`
      );

      expect(eventNumbers.length).toBe(101);
      expect(p99).toBeLessThan(500);
    });
  });
});
