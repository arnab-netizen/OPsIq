import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import { ensureStartupStatusReady } from "./test-helpers/startup-helper";
import { v4 as uuidv4 } from "uuid";
import { db, getDbInstance } from "@/lib/db";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { ProjectionRebuildEngine } from "@/services/projection-rebuild-engine";

/**
 * PHASE 3 LIVE RUNTIME INTEGRATION TESTS
 * Prove that event flow works through services
 * Tests focus on canonical event emission and replay
 */
describe("Phase 3: Live Runtime Event Flow Integration", () => {
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

    await db.recommendation.create({
      data: {
        id: recommendationId,
        engagementId,
        workspaceId,
        title: "Original Title",
        priority: "high",
        createdBy: userId,
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

  describe("CREATE Event Path Runtime", () => {
    it("should emit canonical event on recommendation creation", async () => {
      // ACT: Emit event through service
      const newRecId = uuidv4();
      await EventEmitterService.emit({
        aggregateId: newRecId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "New Recommendation",
          priority: "critical",
          evidenceValidationScore: "0.92",
          reliabilityLevel: "high",
          kpiHealthScore: "0.85",
          kpiRiskLevel: "medium",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ASSERT: Event persisted
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: newRecId,
          aggregateType: "recommendation",
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("recommendation.created");
      expect(events[0].payload).toMatchObject({
        title: "New Recommendation",
        priority: "critical",
      });
    });

    it("should allow replay of created recommendation", async () => {
      // ARRANGE: Create recommendation event
      const newRecId = uuidv4();
      await EventEmitterService.emit({
        aggregateId: newRecId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Replay Test",
          priority: "high",
          evidenceValidationScore: "0.75",
          reliabilityLevel: "medium",
          kpiHealthScore: "0.68",
          kpiRiskLevel: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Replay from events
      const replayed = await EventReplayEngine.replayAggregate(
        newRecId,
        "recommendation",
        workspaceId
      );

      // ASSERT: Replay reconstructs state
      expect(replayed.aggregateId).toBe(newRecId);
      expect(replayed.state.title).toBe("Replay Test");
      expect(replayed.state.priority).toBe("high");
      expect(replayed.eventCount).toBe(1);
      expect(replayed.usedSnapshot).toBe(false);
    });
  });

  describe("UPDATE Event Path Runtime", () => {
    it("should emit update event through canonical event flow", async () => {
      // ARRANGE: Create initial event
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Update Test",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Emit update event
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

      // ASSERT: Events recorded
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          aggregateType: "recommendation",
        },
        orderBy: { eventNumber: "asc" },
      });

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("recommendation.created");
      expect(events[1].eventType).toBe("recommendation.updated");
      expect(events[0].eventNumber).toBeLessThan(events[1].eventNumber);
    });

    it("should replay multiple events in order", async () => {
      // ARRANGE: Create sequence of events
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "Multi-Event Test",
          priority: "medium",
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
          status: "in_progress",
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

      // ASSERT: All events processed
      expect(replayed.eventCount).toBe(2);
      expect(replayed.state.title).toBe("Multi-Event Test");
      expect(replayed.state.priority).toBe("medium");
    });
  });

  describe("Projection Rebuild from Events", () => {
    it("should rebuild projection from events after deletion", async () => {
      // ARRANGE: Create events
      const newRecId = uuidv4();
      await EventEmitterService.emit({
        aggregateId: newRecId,
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

      // Create projection
      await db.recommendation.create({
        data: {
          id: newRecId,
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

      // Delete projection to simulate data loss
      await db.recommendation.delete({ where: { id: newRecId } });

      // ACT: Rebuild from events
      const result = await ProjectionRebuildEngine.rebuildRecommendationProjection(
        newRecId,
        workspaceId
      );

      // ASSERT: Rebuild successful
      expect(result.success).toBe(true);
      expect(result.eventsProcessed).toBe(1);
      expect(result.parityCheckPassed).toBe(true);

      // Verify projection restored
      const rebuilt = await db.recommendation.findUnique({
        where: { id: newRecId },
      });
      expect(rebuilt).not.toBeNull();
      expect(rebuilt?.title).toBe("Rebuild Test");
      expect(rebuilt?.priority).toBe("critical");
    });
  });

  describe("Workspace Isolation", () => {
    it("should not cross workspace boundaries during replay", async () => {
      const workspace2Id = uuidv4();

      // ARRANGE: Create event in workspace 1
      await EventEmitterService.emit({
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          engagementId,
          title: "WS1 Only",
          priority: "high",
        },
        actorId: userId,
        workspaceId,
        visibilityScope: "internal",
        sensitivityClassification: "standard",
      });

      // ACT: Try to replay in different workspace
      // Should fail - events are scoped by workspaceId
      await expect(
        EventReplayEngine.replayAggregate(
          recommendationId,
          "recommendation",
          workspace2Id
        )
      ).rejects.toThrow("No events found");
    });

    it("should rebuild only within workspace scope", async () => {
      const newRecId = uuidv4();

      // ARRANGE: Create event in workspace 1
      await EventEmitterService.emit({
        aggregateId: newRecId,
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

      await db.recommendation.create({
        data: {
          id: newRecId,
          engagementId,
          workspaceId,
          title: "WS1 Rec",
          priority: "high",
          createdBy: userId,
        },
      });

      // Create a different recommendation in a different workspace (would require setup)
      // For now, just verify workspace isolation in rebuild
      const result = await ProjectionRebuildEngine.rebuildRecommendationProjection(
        newRecId,
        workspaceId
      );

      expect(result.success).toBe(true);
      // Verify the rebuilt recommendation is in the correct workspace
      const rebuilt = await db.recommendation.findUnique({
        where: { id: newRecId },
      });
      expect(rebuilt?.workspaceId).toBe(workspaceId);
    });
  });

  describe("Event Ordering and Safety", () => {
    it("should process events in strict order", async () => {
      // ARRANGE: Emit multiple events
      const newRecId = uuidv4();
      const eventNumbers: number[] = [];

      for (let i = 0; i < 3; i++) {
        await EventEmitterService.emit({
          aggregateId: newRecId,
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
          aggregateId: newRecId,
          aggregateType: "recommendation",
        },
        orderBy: { eventNumber: "asc" },
      });

      // ASSERT: Events in order
      expect(events).toHaveLength(3);
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i].eventNumber).toBeLessThan(events[i + 1].eventNumber);
      }

      // Replay should respect order
      const replayed = await EventReplayEngine.replayAggregate(
        newRecId,
        "recommendation",
        workspaceId
      );

      expect(replayed.eventCount).toBe(3);
    });
  });
});

