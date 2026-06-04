/**
 * Phase D1-A: Admin Read Operability — Database-backed service tests
 *
 * Proves the admin read services run against the REAL persisted schema
 * (not an in-memory/stub store):
 *   - listWorkspacesForAdmin returns created workspaces with correct active
 *     member counts.
 *   - queryAuditLogForAdmin is strictly workspace-scoped (no cross-workspace
 *     leakage), exposes only safe fields, and is newest-first.
 *   - Reads perform no mutation (row counts unchanged).
 *
 * These tests require a real database (PostgreSQL). They self-skip when no
 * DATABASE_URL/TEST_DATABASE_URL is configured; CI (phase-d-verification.yml)
 * provides PostgreSQL and is the canonical verification environment.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  listWorkspacesForAdmin,
  queryAuditLogForAdmin,
} from "@/services/admin/admin-operability.service";

const HAS_DB = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);

// Isolated identifiers for this test run.
const wsA = randomUUID();
const wsB = randomUUID();
const userA1 = randomUUID();
const userA2 = randomUUID();
const userB1 = randomUUID();
const auditIds: string[] = [];

describe.skipIf(!HAS_DB)("Phase D1-A: admin operability service (DB-backed)", () => {
  beforeAll(async () => {
    await db.user.createMany({
      data: [
        { id: userA1, email: `a1-${userA1}@example.com`, updatedAt: new Date() },
        { id: userA2, email: `a2-${userA2}@example.com`, updatedAt: new Date() },
        { id: userB1, email: `b1-${userB1}@example.com`, updatedAt: new Date() },
      ],
    });

    await db.workspace.createMany({
      data: [
        { id: wsA, name: "Phase D WS A", slug: `phase-d-a-${wsA.substring(0, 8)}` },
        { id: wsB, name: "Phase D WS B", slug: `phase-d-b-${wsB.substring(0, 8)}` },
      ],
    });

    // Workspace A: two active members + one inactive (should not be counted).
    await db.workspaceMembership.createMany({
      data: [
        { userId: userA1, workspaceId: wsA, role: "admin", isActive: true },
        { userId: userA2, workspaceId: wsA, role: "member", isActive: true },
        { userId: userB1, workspaceId: wsA, role: "member", isActive: false },
      ],
    });
    // Workspace B: one active member.
    await db.workspaceMembership.create({
      data: { userId: userB1, workspaceId: wsB, role: "admin", isActive: true },
    });

    // Audit events: 2 in A, 1 in B.
    const a1 = randomUUID();
    const a2 = randomUUID();
    const b1 = randomUUID();
    auditIds.push(a1, a2, b1);
    await db.auditEvent.createMany({
      data: [
        {
          id: a1,
          eventName: "DECISION_CREATED",
          entityType: "decision",
          entityId: randomUUID(),
          workspaceId: wsA,
          occurredAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          id: a2,
          eventName: "DECISION_UPDATED",
          entityType: "decision",
          entityId: randomUUID(),
          workspaceId: wsA,
          occurredAt: new Date("2026-05-02T00:00:00.000Z"),
        },
        {
          id: b1,
          eventName: "SECRET_B_EVENT",
          entityType: "decision",
          entityId: randomUUID(),
          workspaceId: wsB,
          occurredAt: new Date("2026-05-03T00:00:00.000Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await db.auditEvent.deleteMany({ where: { id: { in: auditIds } } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA1, userA2, userB1] } } });
  });

  it("lists created workspaces with correct active member counts", async () => {
    const result = await listWorkspacesForAdmin({ limit: 200 });

    const a = result.workspaces.find((w) => w.id === wsA);
    const b = result.workspaces.find((w) => w.id === wsB);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.memberCount).toBe(2); // inactive membership excluded
    expect(b!.memberCount).toBe(1);
    expect(a!.isActive).toBe(true);
    expect(typeof a!.createdAt).toBe("string");
  });

  it("returns audit events only for the requested workspace (no cross-workspace leakage)", async () => {
    const result = await queryAuditLogForAdmin({ workspaceId: wsA, limit: 100 });

    expect(result.events.length).toBeGreaterThanOrEqual(2);
    // Every returned event belongs to workspace A.
    for (const e of result.events) {
      expect(e.workspaceId).toBe(wsA);
    }
    // The workspace B secret event is never present.
    expect(result.events.some((e) => e.eventName === "SECRET_B_EVENT")).toBe(false);
  });

  it("orders audit events newest-first and exposes only safe fields", async () => {
    const result = await queryAuditLogForAdmin({ workspaceId: wsA, limit: 100 });
    const mine = result.events.filter((e) => auditIds.includes(e.id));

    // Newest-first: DECISION_UPDATED (05-02) before DECISION_CREATED (05-01).
    const updatedIdx = mine.findIndex((e) => e.eventName === "DECISION_UPDATED");
    const createdIdx = mine.findIndex((e) => e.eventName === "DECISION_CREATED");
    expect(updatedIdx).toBeGreaterThanOrEqual(0);
    expect(createdIdx).toBeGreaterThanOrEqual(0);
    expect(updatedIdx).toBeLessThan(createdIdx);

    // Safe fields only — never raw payload.
    const event = mine[0] as Record<string, unknown>;
    expect(event).not.toHaveProperty("payload");
    expect(event).toHaveProperty("eventName");
    expect(event).toHaveProperty("occurredAt");
  });

  it("supports includeTotalCount with a real count for the workspace", async () => {
    const result = await queryAuditLogForAdmin({
      workspaceId: wsA,
      limit: 100,
      includeTotalCount: true,
    });
    expect(result.statistics?.totalEvents).toBeGreaterThanOrEqual(2);
  });

  it("performs no mutation on read (audit row count unchanged)", async () => {
    const before = await db.auditEvent.count({ where: { workspaceId: wsA } });
    await listWorkspacesForAdmin({ limit: 200 });
    await queryAuditLogForAdmin({ workspaceId: wsA, limit: 100 });
    const after = await db.auditEvent.count({ where: { workspaceId: wsA } });
    expect(after).toBe(before);
  });
});
