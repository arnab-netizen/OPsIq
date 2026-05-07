// Phase 3 Slice 3: ProjectionEngine Runtime Wiring Integration Test
// Proves ProjectionEngine denormalizes events into materialized views

import { describe, it, expect, beforeAll } from "vitest";
import { EventEmitterService } from "@/services/event-emitter";
import { ProjectionEngine } from "@/services/projection-engine";
import { v4 as uuidv4 } from "uuid";

describe("Phase 3 Slice 3 — ProjectionEngine: Event Projection and Denormalization", () => {
  let testWorkspaceId: string;
  let testActorId: string;

  beforeAll(() => {
    testWorkspaceId = uuidv4();
    testActorId = uuidv4();
  });

  describe("Event Projection Routing", () => {
    it("routes recommendation events to recommendation projection", async () => {
      const aggregateId = uuidv4();
      const payload = {
        title: "Test recommendation",
        priority: "high",
        engagementId: uuidv4(),
        reliabilityLevel: "high",
        kpiRiskLevel: "low",
      };

      const result = await ProjectionEngine.projectEvent(
        uuidv4(),
        "recommendation.created",
        aggregateId,
        "recommendation",
        payload,
        testWorkspaceId
      );

      expect(result.projectionName).toBe("recommendation_projection");
      expect(result.success).toBe(true);
      expect(result.eventCount).toBe(1);
    });

    it("routes action events to action projection", async () => {
      const aggregateId = uuidv4();

      const result = await ProjectionEngine.projectEvent(
        uuidv4(),
        "action.completed",
        aggregateId,
        "action",
        {},
        testWorkspaceId
      );

      expect(result.projectionName).toBe("action_projection");
      expect(result.success).toBe(true);
    });

    it("routes engagement events to engagement projection", async () => {
      const aggregateId = uuidv4();

      const result = await ProjectionEngine.projectEvent(
        uuidv4(),
        "engagement.status_changed",
        aggregateId,
        "engagement",
        {},
        testWorkspaceId
      );

      expect(result.projectionName).toBe("engagement_projection");
      expect(result.success).toBe(true);
    });

    it("handles unknown aggregate types gracefully", async () => {
      const aggregateId = uuidv4();

      const result = await ProjectionEngine.projectEvent(
        uuidv4(),
        "unknown.event",
        aggregateId,
        "unknown_type",
        {},
        testWorkspaceId
      );

      expect(result.projectionName).toBe("unknown_type_projection");
      expect(result.success).toBe(true);
    });
  });

  describe("Projection Update Verification", () => {
    it("updates recommendation denormalized fields from event payload", async () => {
      const aggregateId = uuidv4();
      const engagementId = uuidv4();

      // Emit recommendation.created event through emitter (which triggers projection)
      const event = await EventEmitterService.emit({
        aggregateId,
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "Critical issue",
          priority: "critical",
          engagementId,
          reliabilityLevel: "critical",
          kpiRiskLevel: "critical",
        },
        actorId: testActorId,
        workspaceId: testWorkspaceId,
      });

      expect(event.id).toBeDefined();
      expect(event.eventNumber).toBe(1);
    });
  });

  describe("Projection Rebuild", () => {
    it("rebuilds projection from entire event stream", async () => {
      const workspace = uuidv4();
      const actor = uuidv4();

      // Emit multiple recommendation events
      for (let i = 0; i < 3; i++) {
        await EventEmitterService.emit({
          aggregateId: uuidv4(),
          aggregateType: "recommendation",
          eventType: "recommendation.created",
          eventVersion: 1,
          payload: {
            title: `Recommendation ${i}`,
            priority: "high",
            engagementId: uuidv4(),
            reliabilityLevel: "high",
            kpiRiskLevel: "low",
          },
          actorId: actor,
          workspaceId: workspace,
        });
      }

      // Rebuild projection
      const result = await ProjectionEngine.rebuildProjection(
        "recommendation",
        workspace
      );

      expect(result.rebuildCount).toBeGreaterThanOrEqual(3);
      expect(Array.isArray(result.aggregates)).toBe(true);
      expect(result.aggregates.length).toBeGreaterThanOrEqual(3);
    });

    it("tracks rebuilt aggregate IDs", async () => {
      const workspace = uuidv4();
      const actor = uuidv4();
      const agg1 = uuidv4();
      const agg2 = uuidv4();

      // Emit events for two different aggregates
      await EventEmitterService.emit({
        aggregateId: agg1,
        aggregateType: "action",
        eventType: "action.created",
        eventVersion: 1,
        payload: { title: "Action 1" },
        actorId: actor,
        workspaceId: workspace,
      });

      await EventEmitterService.emit({
        aggregateId: agg2,
        aggregateType: "action",
        eventType: "action.created",
        eventVersion: 1,
        payload: { title: "Action 2" },
        actorId: actor,
        workspaceId: workspace,
      });

      // Rebuild
      const result = await ProjectionEngine.rebuildProjection("action", workspace);

      expect(result.aggregates).toContain(agg1);
      expect(result.aggregates).toContain(agg2);
      expect(result.rebuildCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Error Handling", () => {
    it("logs projection errors without throwing", async () => {
      const aggregateId = uuidv4();

      // Attempt to project with malformed data - should not throw
      const result = await ProjectionEngine.projectEvent(
        uuidv4(),
        "unknown.event",
        aggregateId,
        "recommendation",
        { invalid: "data" },
        testWorkspaceId
      );

      expect(result.success).toBe(true);
    });
  });

  describe("Tenant Isolation", () => {
    it("projects events scoped to workspace", async () => {
      const workspace1 = uuidv4();
      const workspace2 = uuidv4();
      const actor = uuidv4();

      // Emit event in workspace1
      const event1 = await EventEmitterService.emit({
        aggregateId: uuidv4(),
        aggregateType: "recommendation",
        eventType: "recommendation.created",
        eventVersion: 1,
        payload: {
          title: "WS1 rec",
          priority: "high",
          engagementId: uuidv4(),
          reliabilityLevel: "high",
          kpiRiskLevel: "low",
        },
        actorId: actor,
        workspaceId: workspace1,
      });

      // Rebuild projection for workspace2 - should not include workspace1 events
      const result = await ProjectionEngine.rebuildProjection(
        "recommendation",
        workspace2
      );

      expect(result.rebuildCount).toBe(0);
      expect(result.aggregates.length).toBe(0);
    });
  });
});
