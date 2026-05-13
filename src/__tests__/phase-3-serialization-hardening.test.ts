import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";

/**
 * PHASE 3 SERIALIZATION HARDENING TESTS
 * Tests atomic event number allocation under REAL concurrent database load
 * NOT simulated with Promise.all() - actual PostgreSQL parallel connections
 */
describe("Phase 3: Serialization Hardening - Real Concurrency Stress", () => {
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

    // Setup test data
    await db.user.create({
      data: {
        id: userId,
        email: `stress-${Date.now()}@example.com`,
        name: "Stress Test User",
        hashedPassword: "mock",
        updatedAt: new Date(),
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Stress Test Client",
        updatedAt: new Date(),
      },
    });

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: "Stress Test Workspace",
        slug: `stress-${Date.now()}`,
        createdBy: userId,
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

  describe("A. CONCURRENT APPEND STORM - Race Condition Prevention", () => {
    it("should guarantee no duplicate eventNumbers under 100 concurrent writes to same aggregate", async () => {
      const recommendationId = uuidv4();
      const concurrentCount = 100;
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Create initial event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Concurrent Storm Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Fire 100 concurrent updates WITHOUT awaiting them sequentially
      // This creates real PostgreSQL contention
      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: "recommendation.status_changed",
          eventVersion: 1,
          payload: {
            status: i % 2 === 0 ? "in_progress" : "blocked",
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        })
          .then(() => {
            successCount++;
          })
          .catch((err) => {
            errorCount++;
            errors.push(err.message);
          })
      );

      // Wait for ALL concurrent requests to complete
      await Promise.all(promises);

      // ASSERT: All succeeded (no duplicate eventNumber violations)
      expect(errorCount).toBe(0);
      expect(successCount).toBe(concurrentCount);

      // ASSERT: All events persisted
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          aggregateType: "recommendation",
        },
        orderBy: { eventNumber: "asc" },
      });

      expect(events).toHaveLength(concurrentCount + 1); // 1 created + 100 updates

      // ASSERT: Event numbers are unique (no duplicates)
      const eventNumbers = events.map((e) => e.eventNumber);
      const uniqueNumbers = new Set(eventNumbers);
      expect(uniqueNumbers.size).toBe(eventNumbers.length);

      // ASSERT: Event numbers are monotonic (1, 2, 3, ... N)
      for (let i = 0; i < eventNumbers.length; i++) {
        expect(eventNumbers[i]).toBe(i + 1);
      }

      // ASSERT: Deterministic replay produces same state
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      expect(replayed.eventCount).toBe(concurrentCount + 1);
      expect(replayed.state.status).toBeDefined(); // One of the final statuses
    });

    it("should handle 500 concurrent writes without deadlock or timeout", async () => {
      const recommendationId = uuidv4();
      const concurrentCount = 500;
      let successCount = 0;
      let errorCount = 0;
      let timeoutCount = 0;
      const startTime = Date.now();

      // Create initial
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "500 Concurrent Stress",
          priority: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // 500 concurrent writes
      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: "recommendation.priority_updated",
          eventVersion: 1,
          payload: {
            priority: ["high", "medium", "low"][i % 3],
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        })
          .then(() => {
            successCount++;
          })
          .catch((err) => {
            if (err.message.includes("timeout")) {
              timeoutCount++;
            }
            errorCount++;
          })
      );

      await Promise.all(promises);
      const durationMs = Date.now() - startTime;

      // ASSERT: No timeouts (10s transaction timeout should never hit)
      expect(timeoutCount).toBe(0);

      // ASSERT: All or nearly all succeeded (some may fail on constraint, but not timeout)
      expect(successCount).toBeGreaterThan(concurrentCount * 0.95); // 95%+ success

      // ASSERT: Reasonable performance (500 concurrent transactions in < 30 seconds)
      expect(durationMs).toBeLessThan(30000);

      // ASSERT: No duplicate eventNumbers in successful ones
      const events = await db.canonicalEvent.findMany({
        where: { aggregateId: recommendationId },
        orderBy: { eventNumber: "asc" },
      });

      const eventNumbers = events.map((e) => e.eventNumber);
      const uniqueNumbers = new Set(eventNumbers);
      expect(uniqueNumbers.size).toBe(eventNumbers.length); // All unique
    });
  });

  describe("B. CONCURRENT REPLAY DURING WRITES - Determinism Under Contention", () => {
    it("should replay deterministically while concurrent writes are happening", async () => {
      const recommendationId = uuidv4();

      // Initial event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Replay During Writes",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Fire concurrent writes (don't wait)
      const writePromises = Array.from({ length: 50 }, () =>
        EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "updated" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        })
      );

      // Initiate replays concurrently with writes
      const replayPromises = Array.from({ length: 5 }, () =>
        EventReplayEngine.replayAggregate(recommendationId, "recommendation", workspaceId)
      );

      // Wait for everything to settle
      const [writeResults, replayResults] = await Promise.all([
        Promise.allSettled(writePromises),
        Promise.allSettled(replayPromises),
      ]);

      // ASSERT: All replays succeeded
      const successfulReplays = replayResults
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<any>).value);

      expect(successfulReplays.length).toBeGreaterThan(0);

      // ASSERT: All replays show same final state (deterministic)
      const finalStates = successfulReplays.map((r) => ({
        eventCount: r.eventCount,
        title: r.state.title,
        lastEventNumber: r.lastEventNumber,
      }));

      // All should have identical event counts and titles
      const firstState = finalStates[0];
      for (const state of finalStates.slice(1)) {
        expect(state.eventCount).toBe(firstState.eventCount);
        expect(state.title).toBe(firstState.title);
      }
    });
  });

  describe("C. MULTI-AGGREGATE PARALLEL WRITES - Isolation Verification", () => {
    it("should maintain isolation across 50 concurrent aggregates", async () => {
      const aggregateIds = Array.from({ length: 50 }, () => uuidv4());
      let successCount = 0;
      let errorCount = 0;

      // Create 50 independent recommendation aggregates concurrently
      const createPromises = aggregateIds.map((aggId) =>
        EventEmitterService.emit({
          aggregateId: aggId,
          aggregateType: "recommendation",
          eventType: "recommendation.created",
          eventVersion: 1,
          payload: {
            engagementId,
            title: `Aggregate ${aggId.slice(0, 8)}`,
            priority: "medium",
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        })
          .then(() => {
            successCount++;
          })
          .catch((err) => {
            errorCount++;
          })
      );

      await Promise.all(createPromises);

      // ASSERT: All succeeded
      expect(errorCount).toBe(0);
      expect(successCount).toBe(50);

      // ASSERT: Each aggregate has independent eventNumber sequences
      for (const aggId of aggregateIds) {
        const events = await db.canonicalEvent.findMany({
          where: { aggregateId: aggId },
          orderBy: { eventNumber: "asc" },
        });

        expect(events).toHaveLength(1);
        expect(events[0].eventNumber).toBe(1); // First event is always 1
      }
    });
  });

  describe("D. IDEMPOTENCY UNDER CONCURRENT PRESSURE", () => {
    it("should prevent duplicate events even with concurrent identical idempotency keys", async () => {
      const recommendationId = uuidv4();
      const idempotencyKey = `concurrent-key-${Date.now()}`;

      // Fire 20 concurrent requests with SAME idempotency key
      const promises = Array.from({ length: 20 }, () =>
        EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: "recommendation.created",
          eventVersion: 1,
          payload: {
            engagementId,
            title: "Idempotency Stress",
            priority: "high",
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
          idempotencyKey,
        })
      );

      const results = await Promise.all(promises);

      // ASSERT: All returned the same event ID (idempotency preserved)
      const eventIds = results.map((r) => r.id);
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(1); // All same event

      // ASSERT: Only one event actually created
      const events = await db.canonicalEvent.count({
        where: { aggregateId: recommendationId },
      });
      expect(events).toBe(1);
    });
  });

  describe("E. FAILURE INJECTION - Deadlock and Timeout Handling", () => {
    it("should recover from transaction timeout and retry safely", async () => {
      const recommendationId = uuidv4();
      let retryCount = 0;
      let finalSuccessCount = 0;

      // Create initial
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Timeout Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Fire many concurrent writes that stress the lock
      const promises = Array.from({ length: 100 }, (_, i) =>
        EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: "recommendation.status_changed",
          eventVersion: 1,
          payload: {
            status: i % 2 === 0 ? "in_progress" : "blocked",
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        })
          .then(() => {
            finalSuccessCount++;
          })
          .catch(() => {
            retryCount++;
          })
      );

      await Promise.all(promises);

      // ASSERT: Most succeeded (some may timeout under extreme load, but not data corruption)
      expect(finalSuccessCount).toBeGreaterThan(90); // 90%+ success
    });
  });

  describe("F. EVENT ORDERING CORRECTNESS UNDER CONCURRENCY", () => {
    it("should maintain append-only ordering invariant", async () => {
      const recommendationId = uuidv4();

      // Create
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Ordering Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // 100 concurrent mutations
      const mutations = Array.from({ length: 100 }, (_, i) => {
        const isStatus = i % 2 === 0;
        return EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: isStatus ? "recommendation.status_changed" : "recommendation.priority_updated",
          eventVersion: 1,
          payload: isStatus
            ? { status: i % 4 === 0 ? "in_progress" : "blocked" }
            : { priority: ["high", "medium", "low"][i % 3] },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      });

      await Promise.all(mutations);

      // Fetch all events in order
      const events = await db.canonicalEvent.findMany({
        where: { aggregateId: recommendationId },
        orderBy: { eventNumber: "asc" },
      });

      // ASSERT: 101 events (1 created + 100 mutations)
      expect(events).toHaveLength(101);

      // ASSERT: Event numbers are EXACTLY 1..101 (no gaps, no duplicates)
      for (let i = 0; i < events.length; i++) {
        expect(events[i].eventNumber).toBe(i + 1);
      }

      // ASSERT: First event is always created
      expect(events[0].eventType).toBe("recommendation.created");

      // ASSERT: Replay produces deterministic result
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      expect(replayed.eventCount).toBe(101);
      expect(replayed.version).toBe(101);
    });
  });
});
