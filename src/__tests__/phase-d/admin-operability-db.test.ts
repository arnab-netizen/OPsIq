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
  listWorkspaceMembersForAdmin,
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

  // -------------------------------------------------------------------------
  // Phase D1-B: listWorkspaceMembersForAdmin
  // Seed recap: wsA has userA1 (admin, active), userA2 (member, active),
  // userB1 (member, INACTIVE in wsA). wsB has userB1 (admin, active).
  // -------------------------------------------------------------------------

  it("returns only active members for the requested workspace", async () => {
    const result = await listWorkspaceMembersForAdmin(wsA, { limit: 100 });

    const ids = result.members.map((m) => m.userId).sort();
    expect(ids).toEqual([userA1, userA2].sort());
    // Inactive membership (userB1 in wsA) is excluded.
    expect(result.members.some((m) => m.userId === userB1)).toBe(false);
    // All returned rows are active.
    expect(result.members.every((m) => m.isActive === true)).toBe(true);
  });

  it("exposes safe identity fields (userId, name, email, role, isActive, addedAt)", async () => {
    const result = await listWorkspaceMembersForAdmin(wsA, { limit: 100 });
    const admin = result.members.find((m) => m.userId === userA1);

    expect(admin).toBeDefined();
    expect(admin!.role).toBe("admin");
    expect(typeof admin!.addedAt).toBe("string");
    expect(admin!.email).toContain("@");
    const asRecord = admin as unknown as Record<string, unknown>;
    expect(asRecord).not.toHaveProperty("password");
    expect(asRecord).not.toHaveProperty("passwordHash");
    expect(asRecord).not.toHaveProperty("token");
  });

  it("does not leak members from another workspace", async () => {
    const resultA = await listWorkspaceMembersForAdmin(wsA, { limit: 100 });
    const resultB = await listWorkspaceMembersForAdmin(wsB, { limit: 100 });

    // wsB's only active member is userB1; it must not appear in wsA's list.
    expect(resultB.members.map((m) => m.userId)).toContain(userB1);
    expect(resultA.members.map((m) => m.userId)).not.toContain(userB1);
  });

  it("orders members deterministically by addedAt then id (ascending)", async () => {
    const result = await listWorkspaceMembersForAdmin(wsA, { limit: 100 });
    const addedAts = result.members.map((m) => new Date(m.addedAt).getTime());
    const sorted = [...addedAts].sort((a, b) => a - b);
    expect(addedAts).toEqual(sorted);
  });

  it("supports limit/cursor pagination over members", async () => {
    const firstPage = await listWorkspaceMembersForAdmin(wsA, { limit: 1 });
    expect(firstPage.members).toHaveLength(1);
    expect(firstPage.pagination.hasMore).toBe(true);
    expect(firstPage.pagination.nextCursor).toBeTruthy();

    const secondPage = await listWorkspaceMembersForAdmin(wsA, {
      limit: 1,
      cursor: firstPage.pagination.nextCursor,
    });
    expect(secondPage.members).toHaveLength(1);
    // The two pages return distinct members (no overlap, no skips beyond active set).
    expect(secondPage.members[0].userId).not.toBe(firstPage.members[0].userId);
  });

  it("performs no mutation on member read (membership row count unchanged)", async () => {
    const before = await db.workspaceMembership.count({ where: { workspaceId: wsA } });
    await listWorkspaceMembersForAdmin(wsA, { limit: 100 });
    const after = await db.workspaceMembership.count({ where: { workspaceId: wsA } });
    expect(after).toBe(before);
  });
});
