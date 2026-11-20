import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";

/**
 * PHASE 3 SERVICE-LAYER EVENT FLOW PROOFS
 *
 * Despite the historical file name, NOTHING here goes through HTTP: no route
 * handler is invoked and no request is parsed. These tests drive the service
 * layer the routes delegate to (EventEmitterService -> canonical_events ->
 * EventReplayEngine) against the real database. HTTP-level proofs live in
 * src/__tests__/runtime-proof/rp2-hostile-http-runtime-proofs.test.ts and the
 * per-route tests under src/__tests__/api/.
 */
describe("Phase 3: service-layer canonical event flow (no HTTP)", () => {
  let workspaceId: string;
  let userId: string;
  let clientId: string;
  let engagementId: string;
  let extraWorkspaceIds: string[] = [];

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
    // canonical_events is append-only (DB trigger blocks DELETE) and has no FK to
    // these tables, so it is left in place. A cleanup failure fails the test.
    const workspaceIds = [workspaceId, ...extraWorkspaceIds];
    await db.recommendation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.snapshotData.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.engagement.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: userId } });
    extraWorkspaceIds = [];
  });

  describe("Event emission through EventEmitterService", () => {
    it("persists a recommendation.created canonical event with its payload", async () => {
      const recommendationId = uuidv4();
      const { EventEmitterService } = await import("@/services/event-emitter");

      const emittedEvent = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "API Created Recommendation",
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

      // ASSERT: Event persisted in canonical store
      const persistedEvent = await db.canonicalEvent.findUnique({
        where: { id: emittedEvent.id },
      });

      expect(persistedEvent).not.toBeNull();
      expect(persistedEvent?.id).toBe(emittedEvent.id);
      expect(persistedEvent?.aggregateId).toBe(recommendationId);
      expect(persistedEvent?.aggregateType).toBe("recommendation");
      expect(persistedEvent?.eventType).toBe("recommendation.created");
      expect(persistedEvent?.workspaceId).toBe(workspaceId);
      expect(persistedEvent?.actorId).toBe(userId);
      expect(persistedEvent?.eventNumber).toBe(1);

      // ASSERT: Event contains expected payload
      expect(persistedEvent?.payload).toMatchObject({
        title: "API Created Recommendation",
        priority: "high",
        engagementId,
      });
    });

    it("appends a status_changed event after the created event for the same aggregate", async () => {
      const recommendationId = uuidv4();
      const { EventEmitterService } = await import("@/services/event-emitter");

      // Create initial recommendation
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Test Rec",
          priority: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      const updateEvent = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: { status: "in_progress" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ASSERT: Update event persisted
      const persistedUpdate = await db.canonicalEvent.findUnique({
        where: { id: updateEvent.id },
      });

      expect(persistedUpdate).not.toBeNull();
      expect(persistedUpdate?.eventType).toBe("recommendation.status_changed");
      expect(persistedUpdate?.eventNumber).toBe(2);
      expect(persistedUpdate?.payload).toMatchObject({ status: "in_progress" });

      // ASSERT: Both events in canonical store
      const allEvents = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          workspaceId,
        },
        orderBy: { recordedAt: "asc" },
      });

      expect(allEvents).toHaveLength(2);
      expect(allEvents[0].eventType).toBe("recommendation.created");
      expect(allEvents[1].eventType).toBe("recommendation.status_changed");
    });
  });

  describe("Full event flow: emission through replay", () => {
    it("replays created + status + priority events into the expected aggregate state", async () => {
      const recommendationId = uuidv4();
      const { EventEmitterService } = await import("@/services/event-emitter");
      const { EventReplayEngine } = await import("@/services/event-replay-engine");

      // Step 1: created
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Full Flow Test",
          priority: "critical",
          evidenceValidationScore: "0.90",
          reliabilityLevel: "high",
          kpiHealthScore: "0.85",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Step 2: status change
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: { status: "in_progress" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Step 3: priority change
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.priority_updated",
        eventVersion: 1,
        payload: { priority: "high" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Step 4: Replay from events (simulating projection rebuild)
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: All events persisted
      expect(replayed.eventCount).toBe(3);

      // ASSERT: State reconstructed correctly
      expect(replayed.state.title).toBe("Full Flow Test");
      expect(replayed.state.priority).toBe("high"); // Last priority update wins
      expect(replayed.state.status).toBe("in_progress");
      expect(replayed.state.evidenceValidationScore).toBe(90); // 0.90 * 100

      // ASSERT: Aggregate version is the last applied event number
      expect(replayed.version).toBe(3);
    });

    it("replays a four-event mutation sequence to the final status and priority", async () => {
      const recommendationId = uuidv4();
      const { EventEmitterService } = await import("@/services/event-emitter");
      const { EventReplayEngine } = await import("@/services/event-replay-engine");

      const mutations = [
        // Create
        {
          eventType: "recommendation.created",
          payload: {
            engagementId,
            title: "Complex Test",
            priority: "low",
          },
        },
        // Update 1
        {
          eventType: "recommendation.updated",
          payload: { status: "needs_clarification" },
        },
        // Update 2
        {
          eventType: "recommendation.status_changed",
          payload: { status: "in_progress" },
        },
        // Update 3
        {
          eventType: "recommendation.priority_updated",
          payload: { priority: "critical" },
        },
      ];

      for (const mutation of mutations) {
        await EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: mutation.eventType,
          eventVersion: 1,
          payload: mutation.payload,
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      // Verify events persisted
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          workspaceId,
        },
        orderBy: { recordedAt: "asc" },
      });

      expect(events).toHaveLength(4);

      // Verify replay reconstructs correct state
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      expect(replayed.eventCount).toBe(4);
      expect(replayed.state.title).toBe("Complex Test");
      expect(replayed.state.priority).toBe("critical"); // Final priority
      expect(replayed.state.status).toBe("in_progress"); // Final status
    });
  });

  describe("Workspace isolation in the event flow", () => {
    it("persists each event under its own workspace and refuses a cross-workspace replay", async () => {
      const workspace2Id = uuidv4();
      const recommendationId1 = uuidv4();
      const recommendationId2 = uuidv4();
      const { EventEmitterService } = await import("@/services/event-emitter");
      const { EventReplayEngine } = await import("@/services/event-replay-engine");

      // Setup workspace 2 (cleaned up in afterEach)
      extraWorkspaceIds.push(workspace2Id);
      await db.workspace.create({
        data: {
          id: workspace2Id,
          name: "Workspace 2",
          slug: `ws2-${Date.now()}`,
          createdBy: userId,
        },
      });

      const engagement2Id = uuidv4();
      await db.engagement.create({
        data: {
          id: engagement2Id,
          code: `ENG2-${Date.now()}`,
          title: "Engagement 2",
          clientId,
          workspaceId: workspace2Id,
          serviceTier: "standard",
          engagementMode: "advisory",
          createdBy: userId,
          updatedAt: new Date(),
        },
      });

      // Create event in workspace 1
      await EventEmitterService.emit({
        aggregateId: recommendationId1,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "WS1 Rec",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Create event in workspace 2
      await EventEmitterService.emit({
        aggregateId: recommendationId2,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId: engagement2Id,
          title: "WS2 Rec",
          priority: "medium",
        },
        actorId: userId,
        workspaceId: workspace2Id,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Verify workspace isolation
      const ws1Events = await db.canonicalEvent.count({
        where: {
          workspaceId,
          aggregateId: recommendationId1,
        },
      });

      const ws2Events = await db.canonicalEvent.count({
        where: {
          workspaceId: workspace2Id,
          aggregateId: recommendationId2,
        },
      });

      // ASSERT: Events isolated by workspace
      expect(ws1Events).toBe(1);
      expect(ws2Events).toBe(1);

      // ASSERT: the replay engine (not a test-authored WHERE) refuses to rebuild
      // workspace 2's aggregate from workspace 1.
      await expect(
        EventReplayEngine.replayAggregate(recommendationId2, "recommendation", workspaceId)
      ).rejects.toThrow(`No events found for aggregate ${recommendationId2}/recommendation`);
      const ownReplay = await EventReplayEngine.replayAggregate(recommendationId2, "recommendation", workspace2Id);
      expect(ownReplay.state.title).toBe("WS2 Rec");
    });
  });

  describe("Persistence and idempotency", () => {
    it("returns the persisted event and stores its payload", async () => {
      const recommendationId = uuidv4();
      const { EventEmitterService } = await import("@/services/event-emitter");

      // Valid event should succeed
      const validEvent = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Valid Event",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      expect(typeof validEvent.id).toBe("string");
      expect(validEvent.id.length).toBeGreaterThan(0);

      // Verify it was persisted
      const persisted = await db.canonicalEvent.findUnique({
        where: { id: validEvent.id },
      });

      expect(persisted).not.toBeNull();
      expect(persisted?.id).toBe(validEvent.id);
      expect(persisted?.workspaceId).toBe(workspaceId);
      expect(persisted?.aggregateId).toBe(recommendationId);
      expect(persisted?.payload).toMatchObject({ engagementId, title: "Valid Event", priority: "high" });
    });

    it("a repeated emit with the same idempotency key returns the original event and persists once", async () => {
      const recommendationId = uuidv4();
      const idempotencyKey = `api-create-${recommendationId}`;
      const { EventEmitterService } = await import("@/services/event-emitter");

      // First request
      const request1 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Idempotent API Request",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey,
      });

      // Retry same request
      const request2 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Idempotent API Request",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey,
      });

      // ASSERT: Same event returned
      expect(request1.id).toBe(request2.id);

      // ASSERT: Only one event persisted
      const count = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
        },
      });

      expect(count).toBe(1);
    });
  });
});
