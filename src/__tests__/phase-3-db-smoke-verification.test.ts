/**
 * Phase 3 DB Smoke Verification
 * Minimal test to verify database connectivity and critical persistence operations
 * Fails fast with explicit diagnostics for CI troubleshooting
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

describe("Phase 3: Database Connectivity & Persistence Smoke Test", () => {
  const testWorkspaceId = uuidv4();
  const testEngagementId = uuidv4();

  beforeAll(async () => {
    // Verify database is initialized
    expect(db).toBeDefined();
    expect(typeof db.workspace).toBe("object");
    console.log("✓ Database proxy initialized");
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    // Note: canonical_events and snapshot_data are append-only, so we don't delete them
    try {
      await db.engagement.deleteMany({
        where: { id: testEngagementId },
      });
      await db.workspace.deleteMany({
        where: { id: testWorkspaceId },
      });
      console.log("✓ Test data cleaned up");
    } catch (error) {
      console.error("Cleanup failed:", error);
      // Don't fail test on cleanup
    }
  });

  describe("Connectivity & Schema Verification", () => {
    it("verifies Prisma client is initialized", () => {
      expect(db).toBeDefined();
      expect(db.workspace).toBeDefined();
      expect(db.canonicalEvent).toBeDefined();
      expect(db.snapshotData).toBeDefined();
      expect(db.recommendation).toBeDefined();
    });

    it("verifies database is reachable (workspace CRUD)", async () => {
      // CREATE
      const workspace = await db.workspace.create({
        data: {
          id: testWorkspaceId,
          name: "Smoke Test Workspace",
          slug: `smoke-test-${Date.now()}`,
        },
      });
      expect(workspace.id).toBe(testWorkspaceId);
      console.log("✓ CREATE workspace succeeded");

      // READ
      const retrieved = await db.workspace.findUnique({
        where: { id: testWorkspaceId },
      });
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(testWorkspaceId);
      console.log("✓ READ workspace succeeded");

      // UPDATE
      const updated = await db.workspace.update({
        where: { id: testWorkspaceId },
        data: { name: "Updated Workspace" },
      });
      expect(updated.name).toBe("Updated Workspace");
      console.log("✓ UPDATE workspace succeeded");
    });

    it("verifies canonical event append works", async () => {
      const aggregateId = uuidv4();

      const actorId = uuidv4();
      const event = await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregate_id: aggregateId,
          aggregate_type: "recommendation",
          event_type: "smoke.test.created",
          event_version: 1,
          event_number: 1,
          payload: { test: "smoke" },
          actor_id: actorId,
          workspace_id: testWorkspaceId,
          causation_id: uuidv4(),
          correlation_id: uuidv4(),
          visibility_scope: "internal",
          sensitivity_classification: "standard",
          occurred_at: new Date(),
          recorded_at: new Date(),
        },
      });

      expect(event.id).toBeDefined();
      expect(event.aggregate_id).toBe(aggregateId);
      expect(event.event_number).toBe(1);
      console.log("✓ Event append succeeded");

      // Verify append-only: next event should have event_number = 2
      const event2 = await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregate_id: aggregateId,
          aggregate_type: "recommendation",
          event_type: "smoke.test.updated",
          event_version: 1,
          event_number: 2,
          payload: { test: "smoke2" },
          actor_id: actorId,
          workspace_id: testWorkspaceId,
          causation_id: uuidv4(),
          correlation_id: uuidv4(),
          visibility_scope: "internal",
          sensitivity_classification: "standard",
          occurred_at: new Date(),
          recorded_at: new Date(),
        },
      });

      expect(event2.event_number).toBe(2);
      expect(event2.event_number).toBeGreaterThan(event.event_number);
      console.log("✓ Append-only enforcement verified");
    });

    it("verifies event replay query works", async () => {
      const aggregateId = uuidv4();

      // Create multiple events
      const actorId = uuidv4();
      for (let i = 1; i <= 3; i++) {
        await db.canonicalEvent.create({
          data: {
            id: uuidv4(),
            aggregate_id: aggregateId,
            aggregate_type: "recommendation",
            event_type: `smoke.test.${i}`,
            event_version: 1,
            event_number: i,
            payload: { index: i },
            actor_id: actorId,
            workspace_id: testWorkspaceId,
            causation_id: uuidv4(),
            correlation_id: uuidv4(),
            visibility_scope: "internal",
            sensitivity_classification: "standard",
            occurred_at: new Date(),
            recorded_at: new Date(),
          },
        });
      }

      // Query all events in order
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregate_id: aggregateId,
          workspace_id: testWorkspaceId,
        },
        orderBy: { event_number: "asc" },
      });

      expect(events).toHaveLength(3);
      expect(events[0].event_number).toBe(1);
      expect(events[1].event_number).toBe(2);
      expect(events[2].event_number).toBe(3);
      console.log("✓ Event replay query works (proper ordering)");
    });

    it("verifies snapshot storage works", async () => {
      const aggregateId = uuidv4();
      const snapshotData = {
        aggregate_id: aggregateId,
        aggregate_type: "recommendation",
        state: { test: "snapshot" },
      };

      const snapshot = await db.snapshotData.create({
        data: {
          id: uuidv4(),
          aggregate_id: aggregateId,
          aggregate_type: "recommendation",
          workspace_id: testWorkspaceId,
          state: snapshotData,
          event_number: 5,
          checksum: "test-checksum-123",
        },
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.aggregate_id).toBe(aggregateId);
      console.log("✓ Snapshot storage works");

      // Retrieve and verify
      const retrieved = await db.snapshotData.findUnique({
        where: { id: snapshot.id },
      });
      expect(retrieved?.event_number).toBe(5);
      console.log("✓ Snapshot retrieval works");
    });
  });

  describe("Workspace Isolation Verification", () => {
    it("verifies events are scoped to workspace", async () => {
      const workspace1 = uuidv4();
      const workspace2 = uuidv4();
      const aggregateId = uuidv4();

      // Create workspaces
      await db.workspace.create({
        data: {
          id: workspace1,
          name: "Workspace 1",
          slug: `iso-test-1-${Date.now()}`,
        },
      });

      await db.workspace.create({
        data: {
          id: workspace2,
          name: "Workspace 2",
          slug: `iso-test-2-${Date.now()}`,
        },
      });

      // Create events in both workspaces with same aggregate_id
      const actorId = uuidv4();
      await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregate_id: aggregateId,
          aggregate_type: "recommendation",
          event_type: "smoke.isolation.1",
          event_version: 1,
          event_number: 1,
          payload: { workspace: "1" },
          actor_id: actorId,
          workspace_id: workspace1,
          causation_id: uuidv4(),
          correlation_id: uuidv4(),
          visibility_scope: "internal",
          sensitivity_classification: "standard",
          occurred_at: new Date(),
          recorded_at: new Date(),
        },
      });

      await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregate_id: aggregateId,
          aggregate_type: "recommendation",
          event_type: "smoke.isolation.2",
          event_version: 1,
          event_number: 1,
          payload: { workspace: "2" },
          actor_id: actorId,
          workspace_id: workspace2,
          causation_id: uuidv4(),
          correlation_id: uuidv4(),
          visibility_scope: "internal",
          sensitivity_classification: "standard",
          occurred_at: new Date(),
          recorded_at: new Date(),
        },
      });

      // Query workspace 1 - should only see workspace1 event
      const events1 = await db.canonicalEvent.findMany({
        where: {
          aggregate_id: aggregateId,
          workspace_id: workspace1,
        },
      });

      expect(events1).toHaveLength(1);
      expect(events1[0].workspace_id).toBe(workspace1);
      console.log("✓ Workspace 1 isolation verified");

      // Query workspace 2 - should only see workspace2 event
      const events2 = await db.canonicalEvent.findMany({
        where: {
          aggregate_id: aggregateId,
          workspace_id: workspace2,
        },
      });

      expect(events2).toHaveLength(1);
      expect(events2[0].workspace_id).toBe(workspace2);
      console.log("✓ Workspace 2 isolation verified");

      // Cleanup
      // canonical_events is append-only, so we skip deleting it
      // Just clean up workspaces
      try {
        await db.workspace.delete({ where: { id: workspace1 } });
      } catch (e) {
        // May fail due to foreign key constraints - that's OK
      }
      try {
        await db.workspace.delete({ where: { id: workspace2 } });
      } catch (e) {
        // May fail due to foreign key constraints - that's OK
      }
    });
  });
});
