import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { calculateExecutionCertainty } from "@/services/execution-certainty";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { v4 as uuidv4 } from "uuid";

describe("Database Persistence Validation", () => {
  let engagementId: string;
  let actionIdCritical: string;
  let actionIdNormal: string;
  let userId: string;

  beforeAll(async () => {
    // Skip if DATABASE_URL not set
    if (!process.env.DATABASE_URL) {
      console.log("DATABASE_URL not set - skipping real DB validation");
      return;
    }

    console.log("Starting DB persistence validation...");

    // Create test user
    const user = await db.user.create({
      data: {
        email: `test-${uuidv4()}@test.local`,
        name: "Test User",
        hashedPassword: "$2a$10$test", // dummy bcrypt hash
      },
    });
    userId = user.id;

    // Create test client
    const client = await db.clientAccount.create({
      data: {
        name: `Test Corp ${uuidv4()}`,
        legalName: `Test Corporation ${uuidv4()}`,
        industry: "Technology",
        size: "small",
        status: "active",
      },
    });

    // Create test engagement
    const engagement = await db.engagement.create({
      data: {
        code: `ENG-TEST-${Date.now()}`,
        title: "DB Validation Test Engagement",
        clientId: client.id,
        serviceTier: "premium",
        engagementMode: "expert",
        status: "active",
        healthStatus: "stable",
        interventionMode: "tactical",
      },
    });
    engagementId = engagement.id;

    // Create business condition
    await db.businessConditionProfile.create({
      data: {
        engagementId,
        businessStatus: "stable",
        severityScore: 3,
        urgencyLevel: "low",
      },
    });

    // Create critical overdue action
    const criticalAction = await db.action.create({
      data: {
        engagementId,
        recommendationId: uuidv4(),
        title: "Critical Overdue Action",
        priority: "critical",
        status: "pending",
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days overdue
      },
    });
    actionIdCritical = criticalAction.id;

    // Create normal action
    const normalAction = await db.action.create({
      data: {
        engagementId,
        recommendationId: uuidv4(),
        title: "Normal Action",
        priority: "medium",
        status: "pending",
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days in future
      },
    });
    actionIdNormal = normalAction.id;

    console.log(`✓ Created test engagement: ${engagementId}`);
    console.log(`✓ Created critical overdue action: ${actionIdCritical}`);
    console.log(`✓ Created normal action: ${actionIdNormal}`);
  });

  afterAll(async () => {
    // Cleanup
    if (!process.env.DATABASE_URL || !engagementId) return;

    try {
      await db.action.deleteMany({ where: { engagementId } });
      await db.businessConditionProfile.deleteMany({ where: { engagementId } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.user.delete({ where: { id: userId } });
      console.log("✓ Cleaned up test data");
    } catch (error) {
      console.error("Cleanup error (non-blocking):", error);
    }
  });

  it("detects overdue critical actions in drift detection", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const drift = await detectExecutionDrift(engagementId);

    expect(drift.driftDetected).toBe(true);
    expect(drift.reasons).toContain("1 critical action(s) are overdue");
    expect(drift.affectedActions).toContain(actionIdCritical);
    console.log("✓ Drift detection identified overdue action");
  });

  it("calculates execution certainty correctly", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const findings = await db.finding.findMany({ where: { engagementId } });
    const recommendations = await db.recommendation.findMany({ where: { engagementId } });
    const actions = await db.action.findMany({ where: { engagementId } });

    const certainty = calculateExecutionCertainty(
      engagementId,
      findings.map((f) => ({
        id: f.id,
        severity: (f.severity as any) || "low",
        resolved: f.status === "resolved",
        verified: f.verified ?? false,
      })),
      recommendations.map((r) => ({
        id: r.id,
        priority: (r.priority as any) || "medium",
        status: (r.status as any) || "in_progress",
      })),
      actions.map((a) => ({
        id: a.id,
        priority: (a.priority as any) || "medium",
        status: (a.status as any) || "pending",
      })),
      []
    );

    expect(certainty).toBeDefined();
    expect(certainty.score).toBeGreaterThan(0);
    expect(certainty.score).toBeLessThanOrEqual(100);
    console.log(`✓ Execution certainty calculated: ${certainty.score}/100`);
  });

  it("persists and retrieves action state changes", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const action = await db.action.findUnique({ where: { id: actionIdNormal } });
    expect(action?.status).toBe("pending");

    // Update to in_progress
    await db.action.update({
      where: { id: actionIdNormal },
      data: { status: "in_progress", startedAt: new Date() },
    });

    const updated = await db.action.findUnique({ where: { id: actionIdNormal } });
    expect(updated?.status).toBe("in_progress");
    expect(updated?.startedAt).toBeDefined();
    console.log("✓ Action state persisted to DB");

    // Update to completed
    await db.action.update({
      where: { id: actionIdNormal },
      data: { status: "completed", completedAt: new Date() },
    });

    const completed = await db.action.findUnique({ where: { id: actionIdNormal } });
    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).toBeDefined();
    console.log("✓ Action completion persisted to DB");
  });

  it("emits and persists audit events", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const eventId = await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_STARTED,
      actorId: userId,
      entityType: "action",
      entityId: actionIdCritical,
      payload: { test: true },
      visibility: "internal",
    });

    expect(eventId).toBeDefined();

    const event = await db.auditEvent.findUnique({ where: { id: eventId } });
    expect(event?.eventName).toBe(AUDIT_EVENTS.ACTION_STARTED);
    expect(event?.entityId).toBe(actionIdCritical);
    console.log("✓ Audit event persisted to DB");
  });

  it("recalculates drift after action state changes", async () => {
    if (!process.env.DATABASE_URL) {
      console.log("Skipping - no DATABASE_URL");
      return;
    }

    const driftBefore = await detectExecutionDrift(engagementId);
    expect(driftBefore.driftDetected).toBe(true);

    // Complete the critical action
    await db.action.update({
      where: { id: actionIdCritical },
      data: { status: "completed", completedAt: new Date() },
    });

    const driftAfter = await detectExecutionDrift(engagementId);
    // After completing the only overdue action, drift should be false
    expect(driftAfter.driftDetected).toBe(false);
    console.log("✓ Drift detection recalculated correctly after action completion");
  });
});
