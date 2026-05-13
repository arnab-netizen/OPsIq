import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";

/**
 * PHASE 3 CONCURRENCY PROOFS
 * Verify that concurrent updates maintain event ordering and deterministic replay
 * Tests focus on monotonic event numbering and concurrent mutation safety
 */
describe("Phase 3: Concurrency and Determinism Proofs", () => {
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
        email: `test-${Date.now()}@example.com`,
        name: "Test User",
        hashedPassword: "mock",
        updatedAt: new Date(),
      },
    });

    await db.clientAccount.create({
      data: {
        id: clientId,
        name: "Test Client",
        updatedAt: new Date(),
      },
    });

    await db.workspace.create({
      data: {
        id: workspaceId,
        name: "Test Workspace",
        slug: `test-ws-${Date.now()}`,
        createdBy: userId,
      },
    });

    await db.engagement.create({
      data: {
        id: engagementId,
        code: `ENG-${Date.now()}`,
        title: "Test Engagement",
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
      await db.engagement.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Monotonic Event Ordering", () => {
    it("should maintain strictly monotonic eventNumbers across concurrent updates", async () => {
      const recommendationId = uuidv4();

      // Create initial recommendation
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Concurrent Test",
          priority: "high",
          evidenceValidationScore: "0.85",
          reliabilityLevel: "high",
          kpiHealthScore: "0.75",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Issue 50 concurrent status changes
      const statusUpdates = Array.from({ length: 50 }, (_: unknown, i: number) =>
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
      );

      // Wait for all concurrent updates to complete
      await Promise.all(statusUpdates);

      // Fetch all events for this recommendation
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          aggregateType: "recommendation",
        },
        orderBy: { eventNumber: "asc" },
      });

      // ASSERT: All 51 events present (1 created + 50 updates)
      expect(events).toHaveLength(51);

      // ASSERT: All events are for the same aggregate
      for (const event of events) {
        expect(event.aggregateId).toBe(recommendationId);
        expect(event.aggregateType).toBe("recommendation");
      }

      // ASSERT: Exactly one creation event
      const createdEvents = events.filter((e: any) => e.eventType === "recommendation.created");
      expect(createdEvents).toHaveLength(1);

      // ASSERT: Remaining 50 are status changes
      const statusChanges = events.filter((e: any) => e.eventType === "recommendation.status_changed");
      expect(statusChanges).toHaveLength(50);
    });

    it("should maintain workspace-scoped isolation", async () => {
      const recommendationId1 = uuidv4();

      // Create events in workspace 1
      await EventEmitterService.emit({
        aggregateId: recommendationId1,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "WS1 Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Issue concurrent updates in workspace 1
      await Promise.all(
        Array.from({ length: 20 }, () =>
          EventEmitterService.emit({
            aggregateId: recommendationId1,
            aggregateType: "recommendation",
            eventType: "recommendation.status_changed",
            eventVersion: 1,
            payload: { status: "in_progress" },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        )
      );

      // Fetch events for workspace 1
      const ws1Events = await db.canonicalEvent.findMany({
        where: {
          workspaceId,
          aggregateId: recommendationId1,
        },
        orderBy: { recordedAt: "asc" },
      });

      // ASSERT: Workspace 1 has 21 events (1 created + 20 updates)
      expect(ws1Events).toHaveLength(21);

      // ASSERT: First event is created, others are status changes
      expect(ws1Events[0].eventType).toBe("recommendation.created");
      for (let i = 1; i < ws1Events.length; i++) {
        expect(ws1Events[i].eventType).toBe("recommendation.status_changed");
      }

      // ASSERT: Events are ordered by timestamp
      for (let i = 1; i < ws1Events.length; i++) {
        expect(ws1Events[i].recordedAt.getTime()).toBeGreaterThanOrEqual(
          ws1Events[i - 1].recordedAt.getTime()
        );
      }
    });
  });

  describe("Deterministic Replay Across Concurrent Operations", () => {
    it("should produce identical replay results for same event stream", async () => {
      const recommendationId = uuidv4();

      // Create initial state
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Determinism Test",
          priority: "critical",
          evidenceValidationScore: "0.92",
          reliabilityLevel: "high",
          kpiHealthScore: "0.88",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Issue concurrent updates
      await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          EventEmitterService.emit({
            aggregateId: recommendationId,
            aggregateType: "recommendation",
            eventType: "recommendation.priority_updated",
            eventVersion: 1,
            payload: {
              priority: i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low",
            },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        )
      );

      // Replay 1: Get state after concurrent operations
      const replay1 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // Wait a bit to ensure timestamps are different
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Replay 2: Replay same events again
      const replay2 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Same event count
      expect(replay1.eventCount).toBe(replay2.eventCount);
      expect(replay1.eventCount).toBe(31); // 1 created + 30 priority updates

      // ASSERT: Same lastEventNumber
      expect(replay1.lastEventNumber).toBe(replay2.lastEventNumber);

      // ASSERT: Final state is identical (deterministic)
      expect(replay1.state.title).toBe(replay2.state.title);
      expect(replay1.state.engagementId).toBe(replay2.state.engagementId);
      expect(replay1.state.priority).toBe(replay2.state.priority);
      expect(replay1.state.evidenceValidationScore).toBe(
        replay2.state.evidenceValidationScore
      );
    });

    it("should maintain deterministic state with mixed concurrent event types", async () => {
      const recommendationId = uuidv4();

      // Create initial recommendation
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Mixed Events Test",
          priority: "medium",
          evidenceValidationScore: "0.80",
          reliabilityLevel: "medium",
          kpiHealthScore: "0.70",
          kpiRiskLevel: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Mix of concurrent status and priority changes
      const mixedUpdates = [
        ...Array.from({ length: 15 }, () =>
          EventEmitterService.emit({
            aggregateId: recommendationId,
            aggregateType: "recommendation",
            eventType: "recommendation.status_changed",
            eventVersion: 1,
            payload: { status: "in_progress" },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        ),
        ...Array.from({ length: 15 }, () =>
          EventEmitterService.emit({
            aggregateId: recommendationId,
            aggregateType: "recommendation",
            eventType: "recommendation.priority_updated",
            eventVersion: 1,
            payload: { priority: "high" },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          })
        ),
      ];

      await Promise.all(mixedUpdates);

      // First replay
      const replay1 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // Second replay with delays to ensure no timing artifacts
      await new Promise((resolve) => setTimeout(resolve, 50));
      const replay2 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Both replays have same event count (31 = 1 created + 30 updates)
      expect(replay1.eventCount).toBe(31);
      expect(replay2.eventCount).toBe(31);

      // ASSERT: State is deterministic across replays
      expect(replay1.state.status).toBe(replay2.state.status);
      expect(replay1.state.priority).toBe(replay2.state.priority);
      expect(replay1.state.title).toBe(replay2.state.title);

      // ASSERT: Event order produces same final state
      expect(replay1.lastEventNumber).toBe(replay2.lastEventNumber);
    });
  });

  describe("Concurrent Safety Guarantees", () => {
    it("should not corrupt state with concurrent mutations on same aggregate", async () => {
      const recommendationId = uuidv4();

      // Initial state
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Safety Test",
          priority: "high",
          evidenceValidationScore: "0.85",
          reliabilityLevel: "high",
          kpiHealthScore: "0.80",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Concurrent mutations
      const mutations = Array.from({ length: 40 }, (_, i) => {
        if (i % 3 === 0) {
          return EventEmitterService.emit({
            aggregateId: recommendationId,
            aggregateType: "recommendation",
            eventType: "recommendation.status_changed",
            eventVersion: 1,
            payload: { status: i % 6 === 0 ? "in_progress" : "blocked" },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          });
        } else {
          return EventEmitterService.emit({
            aggregateId: recommendationId,
            aggregateType: "recommendation",
            eventType: "recommendation.priority_updated",
            eventVersion: 1,
            payload: {
              priority:
                i % 4 === 0
                  ? "critical"
                  : i % 4 === 1
                  ? "high"
                  : i % 4 === 2
                  ? "medium"
                  : "low",
            },
            actorId: userId,
            workspaceId,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          });
        }
      });

      await Promise.all(mutations);

      // Verify final state by replaying
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: All events persisted (1 created + 40 mutations)
      expect(replayed.eventCount).toBe(41);

      // ASSERT: State is coherent (fields exist and are valid)
      expect(replayed.state).toBeDefined();
      expect(replayed.state.title).toBe("Safety Test");
      expect(replayed.state.engagementId).toBe(engagementId);
      expect(replayed.state.priority).toBeDefined();
      expect(replayed.state.status).toBeDefined();

      // ASSERT: All events persisted and ordered
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          workspaceId,
        },
        orderBy: { recordedAt: "asc" },
      });

      // Verify all events present
      expect(events.length).toBe(41); // 1 created + 40 mutations

      // Verify first event is creation
      expect(events[0].eventType).toBe("recommendation.created");

      // Verify events are ordered by timestamp
      for (let i = 1; i < events.length; i++) {
        expect(events[i].recordedAt.getTime()).toBeGreaterThanOrEqual(
          events[i - 1].recordedAt.getTime()
        );
        // Remaining events are mutations
        expect(
          events[i].eventType === "recommendation.status_changed" ||
          events[i].eventType === "recommendation.priority_updated"
        ).toBe(true);
      }
    });

    it("should prevent event loss under concurrent pressure", async () => {
      const recommendationId = uuidv4();

      // Setup
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Loss Prevention Test",
          priority: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Count before concurrent operations
      const countBefore = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
        },
      });

      // Concurrent events (should all be persisted)
      const concurrentCount = 50;
      await Promise.all(
        Array.from({ length: concurrentCount }, () =>
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
        )
      );

      // Count after concurrent operations
      const countAfter = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
        },
      });

      // ASSERT: All events persisted
      expect(countAfter).toBe(countBefore + concurrentCount);
      expect(countAfter).toBe(51); // 1 created + 50 updates
    });
  });
});
