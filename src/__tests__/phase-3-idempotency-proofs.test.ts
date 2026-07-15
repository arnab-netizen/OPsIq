import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";

/**
 * PHASE 3 IDEMPOTENCY PROOFS
 * Verify that duplicate requests don't create duplicate events
 * Tests focus on idempotency key validation and workspace-scoped replay
 */
describe("Phase 3: Idempotency Proofs", () => {
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
    await db.snapshotData.deleteMany({ where: { workspaceId } }).catch(() => {});
    await db.engagement.deleteMany({ where: { workspaceId } }).catch(() => {});
    await db.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
    await db.clientAccount.deleteMany({ where: { id: clientId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
  });

  describe("Idempotency Key Enforcement", () => {
    it("should return same event for duplicate creation requests with same idempotency key", async () => {
      const recommendationId = uuidv4();
      const idempotencyKey = `create-${recommendationId}-${Date.now()}`;

      // First request
      const result1 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Idempotency Test",
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
        idempotencyKey,
      });

      // Duplicate request with same idempotency key
      const result2 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Idempotency Test",
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
        idempotencyKey,
      });

      // ASSERT: Same event returned (by id)
      expect(result1.id).toBe(result2.id);

      // ASSERT: Same event number
      expect(result1.eventNumber).toBe(result2.eventNumber);

      // ASSERT: Only one event persisted
      const events = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
        },
      });
      expect(events).toBe(1);
    });

    it("should create different events for different idempotency keys", async () => {
      const recommendationId = uuidv4();
      const idempotencyKey1 = `update-1-${Date.now()}`;
      const idempotencyKey2 = `update-2-${Date.now()}`;

      // Create initial event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // First update with key1
      const update1 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: { status: "in_progress" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: idempotencyKey1,
      });

      // Different update with key2
      const update2 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: { status: "blocked" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: idempotencyKey2,
      });

      // ASSERT: Different event ids
      expect(update1.id).not.toBe(update2.id);

      // ASSERT: Different event numbers
      expect(update1.eventNumber).not.toBe(update2.eventNumber);

      // ASSERT: Both events persisted
      const events = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
        },
      });
      expect(events).toBe(3); // 1 created + 2 updates
    });

    it("should prevent duplicate mutations with same idempotency key", async () => {
      const recommendationId = uuidv4();
      const statusChangeKey = `status-change-${Date.now()}`;

      // Create initial
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Duplicate Prevention Test",
          priority: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // First status change
      const change1 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: { status: "in_progress" },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: statusChangeKey,
      });

      // Attempt duplicate (same idempotency key)
      const change2 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: { status: "blocked" }, // Different payload
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: statusChangeKey,
      });

      // ASSERT: Same event returned (idempotency preserved)
      expect(change1.id).toBe(change2.id);
      expect(change1.eventNumber).toBe(change2.eventNumber);

      // ASSERT: Original payload preserved (not updated)
      expect(change2.payload.status).toBe("in_progress");

      // ASSERT: Only one status change event
      const statusEvents = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
          eventType: "recommendation.status_changed",
        },
      });
      expect(statusEvents).toBe(1);
    });
  });

  describe("Workspace-Scoped Idempotency", () => {
    it("should enforce idempotency within workspace boundaries", async () => {
      const recommendationId = uuidv4();
      const idempotencyKey = `test-key-${Date.now()}`;

      // Create event in workspace 1
      const event1 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "WS1 Event",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey,
      });

      // Attempt same idempotency key in same workspace
      const event2 = await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "WS1 Event",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey,
      });

      // ASSERT: Same event returned within workspace
      expect(event1.id).toBe(event2.id);

      // ASSERT: Only one event in database
      const totalEvents = await db.canonicalEvent.count({
        where: {
          aggregateId: recommendationId,
          workspaceId,
        },
      });
      expect(totalEvents).toBe(1);
    });

    it("should allow same idempotency key in different workspaces", async () => {
      const workspace2Id = uuidv4();
      const recommendationId1 = uuidv4();
      const recommendationId2 = uuidv4();
      const idempotencyKey = "shared-key-123";

      // Setup workspace 2
      await db.workspace.create({
        data: {
          id: workspace2Id,
          name: "Workspace 2",
          slug: `ws2-${Date.now()}`,
          createdBy: userId,
        },
      });

      // Create engagement in workspace 2
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

      // Create event in workspace 1 with idempotency key
      const event1 = await EventEmitterService.emit({
        aggregateId: recommendationId1,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "WS1 Event",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey,
      });

      // Create event in workspace 2 with SAME idempotency key
      const event2 = await EventEmitterService.emit({
        aggregateId: recommendationId2,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId: engagement2Id,
          title: "WS2 Event",
          priority: "medium",
        },
        actorId: userId,
        workspaceId: workspace2Id,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey,
      });

      // ASSERT: Different events created (different workspaces)
      expect(event1.id).not.toBe(event2.id);
      expect(event1.workspaceId).toBe(workspaceId);
      expect(event2.workspaceId).toBe(workspace2Id);

      // ASSERT: Each workspace has one event
      const ws1Count = await db.canonicalEvent.count({
        where: { workspaceId },
      });
      const ws2Count = await db.canonicalEvent.count({
        where: { workspaceId: workspace2Id },
      });
      expect(ws1Count).toBe(1);
      expect(ws2Count).toBe(1);

      // Cleanup workspace 2
      await db.engagement.deleteMany({ where: { workspaceId: workspace2Id } });
      await db.workspace.delete({ where: { id: workspace2Id } });
    });
  });

  describe("Idempotent Replay", () => {
    it("should replay same events deterministically regardless of idempotency keys", async () => {
      const recommendationId = uuidv4();

      // Emit events with various idempotency patterns
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Replay Test",
          priority: "high",
          evidenceValidationScore: "0.80",
          reliabilityLevel: "high",
          kpiHealthScore: "0.75",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: `create-${recommendationId}`,
      });

      // Emit multiple updates with idempotency keys
      const updateKey1 = `update-${recommendationId}-1`;
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
        idempotencyKey: updateKey1,
      });

      // Attempt duplicate (should not create new event)
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
        idempotencyKey: updateKey1,
      });

      // Replay events
      const replayed1 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Replay again
      const replayed2 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Both replays have same event count (no duplicates)
      expect(replayed1.eventCount).toBe(2); // 1 created + 1 status change
      expect(replayed2.eventCount).toBe(2);

      // ASSERT: Same final state
      expect(replayed1.state.title).toBe(replayed2.state.title);
      expect(replayed1.state.status).toBe(replayed2.state.status);
      expect(replayed1.state.status).toBe("in_progress");
    });

    it("should preserve state correctness with idempotent duplicate submission", async () => {
      const recommendationId = uuidv4();
      const priorityChangeKey = `priority-${Date.now()}`;

      // Create
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Idempotent State Test",
          priority: "low",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // First priority change
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
        idempotencyKey: priorityChangeKey,
      });

      // Duplicate priority change (should return same event)
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.priority_updated",
        eventVersion: 1,
        payload: { priority: "critical" }, // Different priority in duplicate
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
        idempotencyKey: priorityChangeKey,
      });

      // Replay
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Only 2 events (no duplicate created)
      expect(replayed.eventCount).toBe(2);

      // ASSERT: State reflects first (idempotent) change
      expect(replayed.state.priority).toBe("high");

      // Verify events count in database
      const events = await db.canonicalEvent.count({
        where: { aggregateId: recommendationId },
      });
      expect(events).toBe(2);
    });
  });
});
