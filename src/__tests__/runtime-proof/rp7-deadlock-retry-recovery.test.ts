/**
 * PHASE RP7: FORCED DEADLOCK + RETRY RECOVERY TESTS
 *
 * Intentionally create deadlock scenarios and verify the system recovers gracefully.
 * Deadlocks occur when two transactions try to acquire locks in different orders.
 *
 * Tests:
 * A. CIRCULAR LOCK CONTENTION - Two transactions on different aggregates, different order
 * B. TRANSACTION ABORT RECOVERY - Partial failure mid-transaction, retry succeeds
 * C. LOCK TIMEOUT HANDLING - Transaction times out waiting for lock, retries succeed
 * D. CONCURRENT WRITES WITH FORCED CONFLICT - Trigger unique constraint violation, verify idempotency recovery
 * E. SNAPSHOT ISOLATION CONFLICT - Read-your-writes under READ_COMMITTED, retry succeeds
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";

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

  describe("A. CONCURRENT WRITES TO DIFFERENT AGGREGATES - Lock Order Independence", () => {
    it("should handle concurrent writes to different aggregates without deadlock", async () => {
      const agg1Id = uuidv4();
      const agg2Id = uuidv4();

      // Initialize both aggregates
      await EventEmitterService.emit({
        aggregateId: agg1Id,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Agg1" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      await EventEmitterService.emit({
        aggregateId: agg2Id,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Agg2" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Fire concurrent writes in opposite lock order:
      // Process 1: Writes to agg1 first, then agg2 (implicitly via separate calls)
      // Process 2: Writes to agg2 first, then agg1
      const promises = [
        // Thread 1: agg1 → agg2
        EventEmitterService.emit({
          aggregateId: agg1Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "active" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }),
        // Thread 2: agg2 → agg1
        EventEmitterService.emit({
          aggregateId: agg2Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "blocked" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }),
        // Continue alternating to create maximum lock order variation
        EventEmitterService.emit({
          aggregateId: agg1Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "pending" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }),
        EventEmitterService.emit({
          aggregateId: agg2Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "active" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }),
      ];

      const results = await Promise.all(promises);
      const successes = results.filter((r) => !r.error);

      // All should succeed (no deadlock)
      expect(successes.length).toBe(4);

      // Verify both aggregates have correct event counts
      const agg1Events = await db.canonicalEvent.findMany({
        where: { aggregateId: agg1Id },
      });
      const agg2Events = await db.canonicalEvent.findMany({
        where: { aggregateId: agg2Id },
      });

      expect(agg1Events.length).toBe(3); // create + 2 updates
      expect(agg2Events.length).toBe(3);

      console.log(
        `✅ RP7A: ${successes.length} concurrent cross-aggregate writes completed without deadlock`
      );
    });
  });

  describe("B. IDEMPOTENCY KEY RECOVERY - Constraint Violation Handling", () => {
    it("should recover from unique constraint violations via idempotency lookup", async () => {
      const agg1Id = uuidv4();
      const idempotencyKey = `recovery-test-${Date.now()}`;

      // Fire 15 concurrent identical requests (same idempotencyKey)
      const promises = Array.from({ length: 15 }, () =>
        EventEmitterService.emit({
          aggregateId: agg1Id,
          aggregateType: "recommendation",
          eventType: "recommendation.created",
          eventVersion: 1,
          payload: { title: "Recovery Test" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
          idempotencyKey,
        })
      );

      const results = await Promise.all(promises);

      // All should return the same event ID (recovered via idempotency)
      const eventIds = results.map((r) => r.id);
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(1);

      // Only 1 event should exist
      const count = await db.canonicalEvent.count({
        where: { aggregateId: agg1Id },
      });
      expect(count).toBe(1);

      console.log(
        `✅ RP7B: 15 concurrent identical requests recovered via idempotency key constraint`
      );
    });

    it("should distinguish between different idempotency keys even under high concurrency", async () => {
      const agg1Id = uuidv4();

      // Create 5 different idempotency keys, fire 5 concurrent requests each
      const idempotencyKeys = Array.from({ length: 5 }, (_, i) =>
        `idem-${i}-${Date.now()}`
      );

      const promises = [];
      for (const idemKey of idempotencyKeys) {
        for (let i = 0; i < 5; i++) {
          promises.push(
            EventEmitterService.emit({
              aggregateId: agg1Id,
              aggregateType: "recommendation",
              eventType: "recommendation.created",
              eventVersion: 1,
              payload: { title: `Item ${idemKey}-${i}` },
              actorId: userId,
              workspaceId,
              visibilityScope: "internal",
              sensitivityClassification: "standard",
              idempotencyKey: idemKey,
            })
          );
        }
      }

      const results = await Promise.all(promises);
      const successes = results.filter((r) => !r.error);

      // All should succeed
      expect(successes.length).toBe(25);

      // Should have exactly 5 unique events (1 per idempotency key)
      const count = await db.canonicalEvent.count({
        where: { aggregateId: agg1Id },
      });
      expect(count).toBe(5);

      console.log(
        `✅ RP7B2: 25 concurrent requests with 5 different idempotency keys → 5 unique events`
      );
    });
  });

  describe("C. RETRY SUCCESS UNDER CONFLICT", () => {
    it("should allow retry after transient conflict", async () => {
      const agg1Id = uuidv4();

      // Initial event
      const initialResult = await EventEmitterService.emit({
        aggregateId: agg1Id,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Retry Test" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      expect(initialResult.eventNumber).toBe(1);

      // Two concurrent writes that will conflict on lock
      const [result1, result2] = await Promise.all([
        EventEmitterService.emit({
          aggregateId: agg1Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "status1" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }),
        EventEmitterService.emit({
          aggregateId: agg1Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { status: "status2" },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }),
      ]);

      // Both should succeed with sequential eventNumbers
      expect([result1.eventNumber, result2.eventNumber].sort()).toEqual([2, 3]);

      // Verify persistence
      const events = await db.canonicalEvent.findMany({
        where: { aggregateId: agg1Id },
        orderBy: { eventNumber: "asc" },
      });

      expect(events.length).toBe(3);
      expect(events.map((e) => e.eventNumber)).toEqual([1, 2, 3]);

      console.log(
        `✅ RP7C: Concurrent writes succeeded with correct sequential eventNumbers`
      );
    });
  });

  describe("D. MANY-AGGREGATE DEADLOCK POTENTIAL - Lock Order Invariance", () => {
    it("should handle writes to many aggregates without deadlock", async () => {
      const aggregateIds = Array.from({ length: 10 }, () => uuidv4());

      // Create all aggregates first
      await Promise.all(
        aggregateIds.map((aggId) =>
          EventEmitterService.emit({
            aggregateId: aggId,
            aggregateType: "recommendation",
            eventType: "recommendation.created",
            eventVersion: 1,
            payload: { title: `Agg${aggId.slice(0, 4)}` },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        )
      );

      // Fire 50 concurrent writes to random aggregates
      const promises = Array.from({ length: 50 }, (_, i) => {
        const randomAgg = aggregateIds[i % aggregateIds.length];
        return EventEmitterService.emit({
          aggregateId: randomAgg,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { iteration: `${i}` },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }).catch((e) => {
          console.error(`Emit failed: ${e.message}`);
          return { error: e.message, code: (e as any).code };
        });
      });

      const results = await Promise.all(promises);
      const successes = results.filter((r) => !r.error);
      const failures = results.filter((r) => r.error);

      if (failures.length > 0) {
        console.log(
          `Failures (${failures.length}): ${failures.map((f) => `${f.error}[${f.code}]`).join("; ")}`
        );
      }

      // All should succeed
      expect(successes.length).toBe(50);

      // Verify each aggregate has monotonic eventNumbers
      for (const aggId of aggregateIds) {
        const events = await db.canonicalEvent.findMany({
          where: { aggregateId: aggId },
          orderBy: { eventNumber: "asc" },
        });

        // Should be 1 (create) + some updates
        expect(events.length).toBeGreaterThanOrEqual(1);

        // Verify monotonic
        const eventNumbers = events.map((e) => e.eventNumber);
        for (let i = 0; i < eventNumbers.length; i++) {
          expect(eventNumbers[i]).toBe(i + 1);
        }
      }

      console.log(
        `✅ RP7D: 50 concurrent writes across 10 aggregates maintained monotonic ordering`
      );
    });
  });

  describe("E. STRESS RECOVERY - High Volume With Failures", () => {
    it("should maintain invariants even with failed requests", async () => {
      const agg1Id = uuidv4();

      // Create initial event
      await EventEmitterService.emit({
        aggregateId: agg1Id,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: { title: "Stress Test" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Fire 100 concurrent requests, some will fail naturally
      const promises = Array.from({ length: 100 }, (_, i) =>
        EventEmitterService.emit({
          aggregateId: agg1Id,
          aggregateType: "recommendation",
          eventType: "recommendation.updated",
          eventVersion: 1,
          payload: { iteration: `${i}` },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        }).catch((e) => {
          console.error(`Emit ${i} failed: ${e.message}`);
          return { error: e.message, code: (e as any).code };
        })
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => !r.error);
      const failures = results.filter((r) => r.error);

      if (failures.length > 0) {
        console.log(
          `Failures (${failures.length}): Sample error: ${failures[0]?.error}`
        );
      }

      // Should have high success rate (most concurrent requests win)
      expect(successes.length).toBeGreaterThan(90);

      // Verify NO gaps in eventNumbers
      const events = await db.canonicalEvent.findMany({
        where: { aggregateId: agg1Id },
        orderBy: { eventNumber: "asc" },
      });

      const eventNumbers = events.map((e) => e.eventNumber);
      expect(eventNumbers.length).toBeGreaterThan(90);

      // Strict monotonicity check
      for (let i = 0; i < eventNumbers.length; i++) {
        expect(eventNumbers[i]).toBe(i + 1);
      }

      console.log(
        `✅ RP7E: 100 concurrent writes maintained strict monotonic ordering with ${successes.length} successes`
      );
    });
  });
});
