// Phase 3 Slice 3: EventReplayEngine Runtime Wiring Integration Test
// Proves EventReplayEngine reconstructs aggregate state from event stream

import { describe, it, expect, beforeAll } from "vitest";
import { EventEmitterService } from "@/services/event-emitter";
import { EventReplayEngine } from "@/services/event-replay-engine";
import { v4 as uuidv4 } from "uuid";

describe("Phase 3 Slice 3 — EventReplayEngine: Aggregate State Reconstruction", () => {
  let testWorkspaceId: string;
  let testActorId: string;

  beforeAll(() => {
    testWorkspaceId = uuidv4();
    testActorId = uuidv4();
  });

  describe("Event Folding and State Reconstruction", () => {
    it("reconstructs aggregate state from event stream", async () => {
      const aggregateId = uuidv4();

      // Emit first event: recommendation.created
      const event1 = await EventEmitterService.emit({
        aggregateId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Test recommendation",
          priority: "high",
          engagementId: uuidv4(),
          reliabilityLevel: "high",
          kpiRiskLevel: "low",
        },
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      });

      // Replay and verify state
      const replayed = await EventReplayEngine.replayAggregate(
        aggregateId,
        "recommendation",
        testWorkspaceId
      );

      expect(replayed.aggregateId).toBe(aggregateId);
      expect(replayed.aggregateType).toBe("recommendation");
      expect(replayed.eventCount).toBe(1);
      expect(replayed.lastEventNumber).toBe(1);
      expect(replayed.version).toBe(1);
      expect(replayed.state.title).toBe("Test recommendation");
      expect(replayed.state.priority).toBe("high");
      expect(replayed.state.status).toBe("active");
    });

    it("applies event-specific state transformations", async () => {
      const aggregateId = uuidv4();

      // Emit recommendation.created
      await EventEmitterService.emit({
        aggregateId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Test rec",
          priority: "high",
          engagementId: uuidv4(),
          reliabilityLevel: "medium",
          kpiRiskLevel: "high",
        },
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      });

      // Replay and verify state transformations
      const replayed = await EventReplayEngine.replayAggregate(
        aggregateId,
        "recommendation",
        testWorkspaceId
      );

      expect(replayed.state.status).toBe("active");
      expect(replayed.state.evidenceReliability).toBe("medium");
      expect(replayed.state.kpiHealth).toBe("high");
    });

    it("maintains event history in state", async () => {
      const aggregateId = uuidv4();

      await EventEmitterService.emit({
        aggregateId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Test",
          priority: "high",
          engagementId: uuidv4(),
          reliabilityLevel: "high",
          kpiRiskLevel: "low",
        },
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      });

      const replayed = await EventReplayEngine.replayAggregate(
        aggregateId,
        "recommendation",
        testWorkspaceId
      );

      expect(Array.isArray(replayed.state.events)).toBe(true);
      expect(replayed.state.events.length).toBe(1);
      expect(replayed.state.events[0].eventType).toBe("recommendation.created");
    });
  });

  describe("Point-in-Time Replay", () => {
    it("replays aggregate as of specific event number", async () => {
      const aggregateId = uuidv4();

      // Emit two events
      const event1 = await EventEmitterService.emit({
        aggregateId,
        aggregateType: "action",
        eventType: "action.created",
        eventVersion: 1,
        payload: { title: "Action 1" },
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      });

      const event2 = await EventEmitterService.emit({
        aggregateId,
        aggregateType: "action",
        eventType: "action.completed",
        eventVersion: 1,
        payload: {},
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      });

      // Replay as of event 1
      const replayedAtEvent1 = await EventReplayEngine.replayAggregate(
        aggregateId,
        "action",
        testWorkspaceId,
        event1.eventNumber
      );

      expect(replayedAtEvent1.eventCount).toBe(1);
      expect(replayedAtEvent1.state.actionStatus).toBeUndefined();

      // Replay all events
      const replayedAll = await EventReplayEngine.replayAggregate(
        aggregateId,
        "action",
        testWorkspaceId
      );

      expect(replayedAll.eventCount).toBe(2);
      expect(replayedAll.state.actionStatus).toBe("completed");
    });
  });

  describe("Error Handling", () => {
    it("throws when no events found", async () => {
      const aggregateId = uuidv4();

      await expect(
        EventReplayEngine.replayAggregate(
          aggregateId,
          "recommendation",
          testWorkspaceId
        )
      ).rejects.toThrow(/No events found/);
    });

    it("throws when replaying as of past timestamp with no events", async () => {
      const aggregateId = uuidv4();
      const pastDate = new Date(Date.now() - 1000000);

      await expect(
        EventReplayEngine.replayAggregateAsOf(
          aggregateId,
          "recommendation",
          testWorkspaceId,
          pastDate
        )
      ).rejects.toThrow(/No events found/);
    });
  });

  describe("Tenant Isolation", () => {
    it("does not replay events from different workspace", async () => {
      const aggregateId = uuidv4();
      const workspace1 = uuidv4();
      const workspace2 = uuidv4();

      // Emit event in workspace1
      await EventEmitterService.emit({
        aggregateId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "WS1 event",
          priority: "high",
          engagementId: uuidv4(),
          reliabilityLevel: "high",
          kpiRiskLevel: "low",
        },
        actorId: testActorId,
        workspaceId: workspace1,
      });

      // Try to replay from workspace2 - should fail
      await expect(
        EventReplayEngine.replayAggregate(
          aggregateId,
          "recommendation",
          workspace2
        )
      ).rejects.toThrow();
    });
  });
});
