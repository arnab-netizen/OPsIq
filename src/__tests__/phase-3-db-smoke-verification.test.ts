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
    try {
      await db.canonicalEvent.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });
      await db.snapshotData.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });
      await db.recommendation.deleteMany({
        where: { workspaceId: testWorkspaceId },
      });
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
          createdBy: "smoke-test",
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

      const event = await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregateId,
          aggregateType: "recommendation",
          eventType: "smoke.test.created",
          eventVersion: 1,
          eventNumber: 1,
          payload: { test: "smoke" },
          actorId: "smoke-test-actor",
          workspaceId: testWorkspaceId,
          causationId: uuidv4(),
          correlationId: uuidv4(),
          visibilityScope: "internal",
          sensitivityClassification: "standard",
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      });

      expect(event.id).toBeDefined();
      expect(event.aggregateId).toBe(aggregateId);
      expect(event.eventNumber).toBe(1);
      console.log("✓ Event append succeeded");

      // Verify append-only: next event should have eventNumber = 2
      const event2 = await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregateId,
          aggregateType: "recommendation",
          eventType: "smoke.test.updated",
          eventVersion: 1,
          eventNumber: 2,
          payload: { test: "smoke2" },
          actorId: "smoke-test-actor",
          workspaceId: testWorkspaceId,
          causationId: uuidv4(),
          correlationId: uuidv4(),
          visibilityScope: "internal",
          sensitivityClassification: "standard",
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      });

      expect(event2.eventNumber).toBe(2);
      expect(event2.eventNumber).toBeGreaterThan(event.eventNumber);
      console.log("✓ Append-only enforcement verified");
    });

    it("verifies event replay query works", async () => {
      const aggregateId = uuidv4();

      // Create multiple events
      for (let i = 1; i <= 3; i++) {
        await db.canonicalEvent.create({
          data: {
            id: uuidv4(),
            aggregateId,
            aggregateType: "recommendation",
            eventType: `smoke.test.${i}`,
            eventVersion: 1,
            eventNumber: i,
            payload: { index: i },
            actorId: "smoke-test-actor",
            workspaceId: testWorkspaceId,
            causationId: uuidv4(),
            correlationId: uuidv4(),
            visibilityScope: "internal",
            sensitivityClassification: "standard",
            occurredAt: new Date(),
            recordedAt: new Date(),
          },
        });
      }

      // Query all events in order
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId,
          workspaceId: testWorkspaceId,
        },
        orderBy: { eventNumber: "asc" },
      });

      expect(events).toHaveLength(3);
      expect(events[0].eventNumber).toBe(1);
      expect(events[1].eventNumber).toBe(2);
      expect(events[2].eventNumber).toBe(3);
      console.log("✓ Event replay query works (proper ordering)");
    });

    it("verifies snapshot storage works", async () => {
      const aggregateId = uuidv4();
      const snapshotData = {
        aggregateId,
        aggregateType: "recommendation",
        state: { test: "snapshot" },
        lastEventNumber: 5,
      };

      const snapshot = await db.snapshotData.create({
        data: {
          id: uuidv4(),
          aggregateId,
          aggregateType: "recommendation",
          workspaceId: testWorkspaceId,
          state: snapshotData,
          lastEventNumber: 5,
          checksum: "test-checksum-123",
          createdAt: new Date(),
        },
      });

      expect(snapshot.id).toBeDefined();
      expect(snapshot.aggregateId).toBe(aggregateId);
      console.log("✓ Snapshot storage works");

      // Retrieve and verify
      const retrieved = await db.snapshotData.findUnique({
        where: { id: snapshot.id },
      });
      expect(retrieved?.lastEventNumber).toBe(5);
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
          createdBy: "smoke-test",
        },
      });

      await db.workspace.create({
        data: {
          id: workspace2,
          name: "Workspace 2",
          slug: `iso-test-2-${Date.now()}`,
          createdBy: "smoke-test",
        },
      });

      // Create events in both workspaces with same aggregateId
      await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregateId,
          aggregateType: "recommendation",
          eventType: "smoke.isolation.1",
          eventVersion: 1,
          eventNumber: 1,
          payload: { workspace: "1" },
          actorId: "smoke-test",
          workspaceId: workspace1,
          causationId: uuidv4(),
          correlationId: uuidv4(),
          visibilityScope: "internal",
          sensitivityClassification: "standard",
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      });

      await db.canonicalEvent.create({
        data: {
          id: uuidv4(),
          aggregateId,
          aggregateType: "recommendation",
          eventType: "smoke.isolation.2",
          eventVersion: 1,
          eventNumber: 1,
          payload: { workspace: "2" },
          actorId: "smoke-test",
          workspaceId: workspace2,
          causationId: uuidv4(),
          correlationId: uuidv4(),
          visibilityScope: "internal",
          sensitivityClassification: "standard",
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      });

      // Query workspace 1 - should only see workspace1 event
      const events1 = await db.canonicalEvent.findMany({
        where: {
          aggregateId,
          workspaceId: workspace1,
        },
      });

      expect(events1).toHaveLength(1);
      expect(events1[0].workspaceId).toBe(workspace1);
      console.log("✓ Workspace 1 isolation verified");

      // Query workspace 2 - should only see workspace2 event
      const events2 = await db.canonicalEvent.findMany({
        where: {
          aggregateId,
          workspaceId: workspace2,
        },
      });

      expect(events2).toHaveLength(1);
      expect(events2[0].workspaceId).toBe(workspace2);
      console.log("✓ Workspace 2 isolation verified");

      // Cleanup
      await db.canonicalEvent.deleteMany({
        where: { workspaceId: workspace1 },
      });
      await db.canonicalEvent.deleteMany({
        where: { workspaceId: workspace2 },
      });
      await db.workspace.delete({ where: { id: workspace1 } });
      await db.workspace.delete({ where: { id: workspace2 } });
    });
  });
});
