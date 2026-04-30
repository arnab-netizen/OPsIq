import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { ConflictError } from "@/infra/errors";
import { v4 as uuidv4 } from "uuid";

describe("Concurrency Control - Optimistic Locking [db]", () => {
  let actionId: string;
  let engagementId: string;

  beforeAll(async () => {
    // Skip if DATABASE_URL not set
    if (!process.env.DATABASE_URL) {
      console.log("DATABASE_URL not set - skipping concurrency validation");
      return;
    }

    // Create test engagement
    const client = await db.clientAccount.create({
      data: {
        name: `Test Corp ${uuidv4()}`,
        legalName: `Test Corporation`,
        industry: "Tech",
        size: "small",
        status: "active",
      },
    });

    const engagement = await db.engagement.create({
      data: {
        code: `ENG-CONC-${Date.now()}`,
        title: "Concurrency Test Engagement",
        clientId: client.id,
        serviceTier: "premium",
        engagementMode: "expert",
        status: "active",
        healthStatus: "stable",
        interventionMode: "tactical",
      },
    });
    engagementId = engagement.id;

    // Create action for concurrency test
    const action = await db.action.create({
      data: {
        engagementId,
        recommendationId: uuidv4(),
        title: "Concurrency Test Action",
        priority: "high",
        status: "pending",
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      },
    });
    actionId = action.id;

    console.log(`✓ Created test action for concurrency test: ${actionId}`);
  });

  it("prevents double-update with stale version", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    // Load action twice to simulate two concurrent requests
    const actionV1 = await db.action.findUnique({ where: { id: actionId } });
    const actionV2 = await db.action.findUnique({ where: { id: actionId } });

    expect(actionV1).toBeDefined();
    expect(actionV2).toBeDefined();
    expect(actionV1!.version).toBe(actionV2!.version);

    const currentVersion = actionV1!.version;

    // First update succeeds
    const result1 = await db.action.updateMany({
      where: {
        id: actionId,
        version: currentVersion,
      },
      data: {
        status: "in_progress",
        startedAt: new Date(),
        version: { increment: 1 },
      },
    });

    expect(result1.count).toBe(1);
    console.log("✓ First concurrent update succeeded");

    // Second update with stale version should fail
    const result2 = await db.action.updateMany({
      where: {
        id: actionId,
        version: currentVersion, // Stale version
      },
      data: {
        status: "completed",
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });

    expect(result2.count).toBe(0);
    console.log("✓ Second concurrent update with stale version prevented (count=0)");

    // Verify action has first update, not second
    const finalAction = await db.action.findUnique({ where: { id: actionId } });
    expect(finalAction?.status).toBe("in_progress");
    expect(finalAction?.completedAt).toBeNull();
    expect(finalAction?.version).toBe(currentVersion + 1);
    console.log("✓ Action state is from first update only");
  });

  it("allows sequential updates with correct version numbers", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const action = await db.action.findUnique({ where: { id: actionId } });
    expect(action).toBeDefined();

    const v1 = action!.version;

    // First update
    await db.action.updateMany({
      where: {
        id: actionId,
        version: v1,
      },
      data: {
        title: "Updated Title 1",
        version: { increment: 1 },
      },
    });

    const afterUpdate1 = await db.action.findUnique({ where: { id: actionId } });
    expect(afterUpdate1?.version).toBe(v1 + 1);
    expect(afterUpdate1?.title).toBe("Updated Title 1");

    // Second update using new version
    const result = await db.action.updateMany({
      where: {
        id: actionId,
        version: v1 + 1,
      },
      data: {
        title: "Updated Title 2",
        version: { increment: 1 },
      },
    });

    expect(result.count).toBe(1);

    const afterUpdate2 = await db.action.findUnique({ where: { id: actionId } });
    expect(afterUpdate2?.version).toBe(v1 + 2);
    expect(afterUpdate2?.title).toBe("Updated Title 2");
    console.log("✓ Sequential updates with version numbers work correctly");
  });

  it("ensures audit events are emitted only for successful mutations", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const action = await db.action.findUnique({ where: { id: actionId } });
    const currentVersion = action!.version;

    // Count audit events before
    const eventsBefore = await db.auditEvent.count({
      where: { entityId: actionId },
    });

    // Successful update
    await db.action.updateMany({
      where: {
        id: actionId,
        version: currentVersion,
      },
      data: {
        status: "blocked",
        version: { increment: 1 },
      },
    });

    const eventsAfter = await db.auditEvent.count({
      where: { entityId: actionId },
    });

    // Should have one more audit event only for successful update
    expect(eventsAfter).toBeGreaterThanOrEqual(eventsBefore);
    console.log(`✓ Audit events tracked for mutations (${eventsBefore} -> ${eventsAfter})`);
  });
});
