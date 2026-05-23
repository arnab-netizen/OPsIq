import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { ensureStartupStatusReady } from "./test-helpers/startup-helper";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { ProjectionRebuildEngine } from "@/services/projection-rebuild-engine";

/**
 * PHASE 3 AUTHORITATIVE REPLAY TESTS
 * Prove that canonical event stream is the complete source of truth
 * Projection can be deleted and rebuilt from events alone
 */
describe("Phase 3: Authoritative Replay from Canonical Events", () => {
  let workspaceId: string;
  let userId: string;
  let clientId: string;
  let recommendationId: string;
  let engagementId: string;

  beforeAll(async () => {
    await getDbInstance();
  });

  beforeEach(async () => {
    workspaceId = uuidv4();
    userId = uuidv4();
    clientId = uuidv4();
    recommendationId = uuidv4();
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
      await db.recommendation.deleteMany({ where: { workspaceId } });
      await db.engagement.deleteMany({ where: { workspaceId } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("CREATE → REPLAY authoritative proof", () => {
    it("should reconstruct created state from events only", async () => {
      // ARRANGE: Emit creation event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Created Recommendation",
          priority: "high",
          description: "Test Description",
          evidenceValidationScore: "0.85",
          reliabilityLevel: "high",
          kpiHealthScore: "0.72",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay from events (no projection)
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Reconstructed state matches original
      expect(replayed.state.title).toBe("Created Recommendation");
      expect(replayed.state.priority).toBe("high");
      expect(replayed.state.description).toBe("Test Description");
      expect(replayed.state.reliabilityLevel).toBe("high");
      expect(replayed.state.kpiRiskLevel).toBe("medium");
      expect(replayed.eventCount).toBe(1);
    });
  });

  describe("CREATE → UPDATE → REPLAY authoritative proof", () => {
    it("should reconstruct state after update from events only", async () => {
      // ARRANGE: Create
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Original Title",
          priority: "high",
          description: "Original Description",
          evidenceValidationScore: "0.85",
          reliabilityLevel: "high",
          kpiHealthScore: "0.72",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Update via canonical event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: {
          title: "Updated Title",
          priority: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay from events (no projection)
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Updated state reconstructed
      expect(replayed.state.title).toBe("Updated Title");
      expect(replayed.state.priority).toBe("medium");
      // Original values should remain if not explicitly updated
      expect(replayed.state.description).toBe("Original Description");
      expect(replayed.state.reliabilityLevel).toBe("high");
      expect(replayed.eventCount).toBe(2);
    });
  });

  describe("CREATE → STATUS_CHANGE → REPLAY authoritative proof", () => {
    it("should reconstruct status changes from events only", async () => {
      // ARRANGE: Create
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Status Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Change status via canonical event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: {
          status: "approved",
          previousStatus: "active",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay from events
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Status reconstructed
      expect(replayed.state.status).toBe("approved");
      expect(replayed.state.title).toBe("Status Test");
      expect(replayed.eventCount).toBe(2);
    });
  });

  describe("CREATE → PRIORITY_UPDATE → REPLAY authoritative proof", () => {
    it("should reconstruct priority updates from events only", async () => {
      // ARRANGE: Create
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Priority Test",
          priority: "low",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Update priority via canonical event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.priority_updated",
        eventVersion: 1,
        payload: {
          priority: "critical",
          previousPriority: "low",
          score: "0.95",
          source: "re-evaluation",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay from events
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Priority reconstructed
      expect(replayed.state.priority).toBe("critical");
      expect(replayed.state.title).toBe("Priority Test");
      expect(replayed.eventCount).toBe(2);
    });
  });

  describe("Multiple updates → REPLAY authoritative proof", () => {
    it("should reconstruct state after multiple updates deterministically", async () => {
      // ARRANGE: Create
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Multi-Update Test",
          priority: "high",
          description: "Initial description",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Update 1
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: {
          title: "Updated Title",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Update 2
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.status_changed",
        eventVersion: 1,
        payload: {
          status: "in_progress",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Update 3
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.priority_updated",
        eventVersion: 1,
        payload: {
          priority: "low",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay from events
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: All updates applied in order
      expect(replayed.state.title).toBe("Updated Title");
      expect(replayed.state.status).toBe("in_progress");
      expect(replayed.state.priority).toBe("low");
      expect(replayed.state.description).toBe("Initial description");
      expect(replayed.eventCount).toBe(4);
    });

    it("should replay deterministically across multiple runs", async () => {
      // ARRANGE: Create and update
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Deterministic Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: {
          priority: "low",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay twice
      const replay1 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      const replay2 = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Identical results
      expect(replay1.state.title).toBe(replay2.state.title);
      expect(replay1.state.priority).toBe(replay2.state.priority);
      expect(replay1.eventCount).toBe(replay2.eventCount);
      expect(replay1.version).toBe(replay2.version);
    });
  });

  describe("Projection deletion + rebuild authoritative proof", () => {
    it("should rebuild projection from events alone after complete deletion", async () => {
      // ARRANGE: Create events
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Rebuild Test",
          priority: "critical",
          evidenceValidationScore: "0.90",
          reliabilityLevel: "high",
          kpiHealthScore: "0.82",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Update
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: {
          status: "in_progress",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // Create projection
      await db.recommendation.create({
        data: {
          id: recommendationId,
          engagementId,
          workspaceId,
          title: "Rebuild Test",
          priority: "critical",
          createdBy: userId,
          evidenceValidationScore: 90,
          reliabilityLevel: "high",
          kpiHealthScore: 82,
          kpiRiskLevel: "medium",
        },
      });

      // Delete projection (total data loss)
      await db.recommendation.delete({
        where: { id: recommendationId },
      });

      // ACT: Rebuild from events only
      const result = await ProjectionRebuildEngine.rebuildRecommendationProjection(
        recommendationId,
        workspaceId
      );

      // ASSERT: Rebuild successful
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(2);

      // Verify all fields restored
      const rebuilt = await db.recommendation.findUnique({
        where: { id: recommendationId },
      });

      expect(rebuilt).not.toBeNull();
      expect(rebuilt?.title).toBe("Rebuild Test");
      expect(rebuilt?.priority).toBe("critical");
      expect(rebuilt?.evidenceValidationScore).toBe(90);
      expect(rebuilt?.reliabilityLevel).toBe("high");
    });
  });

  describe("Canonical event ordering proof", () => {
    it("should maintain strict event ordering", async () => {
      // ARRANGE: Emit multiple events rapidly
      const eventNumbers: number[] = [];

      for (let i = 0; i < 5; i++) {
        await EventEmitterService.emit({
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          eventType: i === 0 ? "recommendation.created" : "recommendation.updated",
          eventVersion: 1,
          payload: {
            engagementId: i === 0 ? engagementId : undefined,
            title: i === 0 ? "Order Test" : undefined,
            priority: i === 0 ? "high" : undefined,
            sequenceNumber: String(i),
          },
          actorId: userId,
          workspaceId,
          visibilityScope: "internal",
          sensitivityClassification: "standard",
        });
      }

      // ACT: Fetch events
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          aggregateType: "recommendation",
        },
        orderBy: { eventNumber: "asc" },
      });

      // ASSERT: Monotonic ordering
      expect(events.length).toBe(5);
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i].eventNumber).toBeLessThan(events[i + 1].eventNumber);
        expect(events[i + 1].eventNumber - events[i].eventNumber).toBe(1);
      }

      // Replay should reflect ordering
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      expect(replayed.eventCount).toBe(5);
    });
  });

  describe("Snapshot does not alter replay truth", () => {
    it("should produce identical state whether using snapshot or full replay", async () => {
      // ARRANGE: Create and update
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Snapshot Truth Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.updated",
        eventVersion: 1,
        payload: {
          priority: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: First replay (will create snapshot)
      const replayWithSnapshot = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // Second replay (will use snapshot if available)
      const replayFromSnapshot = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Identical results whether snapshot used or not
      expect(replayWithSnapshot.state.title).toBe(replayFromSnapshot.state.title);
      expect(replayWithSnapshot.state.priority).toBe(replayFromSnapshot.state.priority);
      expect(replayWithSnapshot.eventCount).toBe(replayFromSnapshot.eventCount);
    });
  });
});
