/**
 * Phase D1-D: Workspace disable — Database-backed service tests
 *
 * Proves disableWorkspaceForAdmin performs a real, idempotent, audited soft
 * delete against the persisted schema:
 *   - Workspace.isActive flips true -> false (no hard delete).
 *   - A WORKSPACE_DISABLED audit event is emitted only on an actual state
 *     change (idempotent no-op for already-disabled).
 *   - Unknown workspace throws NotFound; cross-workspace isolation holds.
 *   - Real idempotency-record integration returns the cached response on replay
 *     while the write/audit occur exactly once.
 *
 * Requires PostgreSQL; self-skips when no DATABASE_URL/TEST_DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { disableWorkspaceForAdmin } from "@/services/admin/admin-operability.service";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
} from "@/services/idempotency";

const HAS_DB = Boolean(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL);

const admin = randomUUID();
const wsActive = randomUUID();
const wsB = randomUUID();
const wsAlready = randomUUID();
const wsIdem = randomUUID();
const allWs = [wsActive, wsB, wsAlready, wsIdem];
const unknownWs = randomUUID();
const idemKey = `disable-${randomUUID()}`;

describe.skipIf(!HAS_DB)("Phase D1-D: workspace disable (DB-backed)", () => {
  beforeAll(async () => {
    await db.user.create({
      data: { id: admin, email: `admin-${admin}@example.com`, updatedAt: new Date() },
    });
    await db.workspace.createMany({
      data: [
        { id: wsActive, name: "WS Active", slug: `ws-active-${wsActive.substring(0, 8)}`, isActive: true },
        { id: wsB, name: "WS B", slug: `ws-b-${wsB.substring(0, 8)}`, isActive: true },
        { id: wsAlready, name: "WS Already", slug: `ws-already-${wsAlready.substring(0, 8)}`, isActive: false },
        { id: wsIdem, name: "WS Idem", slug: `ws-idem-${wsIdem.substring(0, 8)}`, isActive: true },
      ],
    });
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: allWs } } });
    await db.idempotencyRecord.deleteMany({ where: { idempotencyKey: idemKey } });
    await db.workspace.deleteMany({ where: { id: { in: allWs } } });
    await db.user.deleteMany({ where: { id: admin } });
  });

  it("disables an active workspace (isActive true -> false, row still exists)", async () => {
    const result = await disableWorkspaceForAdmin({
      workspaceId: wsActive,
      actorId: admin,
      reason: "abuse",
      notifyMembers: true,
    });

    expect(result).toMatchObject({
      workspaceId: wsActive,
      status: "disabled",
      isActive: false,
      reason: "abuse",
    });

    const row = await db.workspace.findUnique({ where: { id: wsActive }, select: { isActive: true } });
    expect(row).not.toBeNull();
    expect(row!.isActive).toBe(false);
  });

  it("emits a WORKSPACE_DISABLED audit event on the state change", async () => {
    const events = await db.auditEvent.findMany({
      where: { workspaceId: wsActive, eventName: "WORKSPACE_DISABLED" },
    });
    expect(events.length).toBe(1);
    const e = events[0] as {
      entityType: string | null;
      entityId: string | null;
      actorId: string | null;
      payload: unknown;
    };
    expect(e.entityType).toBe("workspace");
    expect(e.entityId).toBe(wsActive);
    expect(e.actorId).toBe(admin);
    const payload = e.payload as {
      reason: string;
      notifyMembers: boolean;
      before: { isActive: boolean };
      after: { isActive: boolean };
    };
    expect(payload.reason).toBe("abuse");
    expect(payload.notifyMembers).toBe(true);
    expect(payload.before.isActive).toBe(true);
    expect(payload.after.isActive).toBe(false);
  });

  it("is an idempotent no-op for an already-disabled workspace (no duplicate audit)", async () => {
    const result = await disableWorkspaceForAdmin({
      workspaceId: wsAlready,
      actorId: admin,
      reason: "again",
    });
    expect(result.isActive).toBe(false);
    expect(result.status).toBe("disabled");

    const count = await db.auditEvent.count({
      where: { workspaceId: wsAlready, eventName: "WORKSPACE_DISABLED" },
    });
    expect(count).toBe(0);
  });

  it("throws NotFound for an unknown workspace", async () => {
    await expect(
      disableWorkspaceForAdmin({ workspaceId: unknownWs, actorId: admin })
    ).rejects.toThrow(/not found/i);
  });

  it("does not affect other workspaces (cross-workspace isolation)", async () => {
    const b = await db.workspace.findUnique({ where: { id: wsB }, select: { isActive: true } });
    expect(b!.isActive).toBe(true);
  });

  it("performs no hard delete (disabled workspace remains queryable)", async () => {
    const row = await db.workspace.findUnique({ where: { id: wsActive } });
    expect(row).not.toBeNull();
    expect(row!.id).toBe(wsActive);
  });

  it("integrates with idempotency: replay returns the cached response; write + audit occur once", async () => {
    const payload = { workspaceId: wsIdem, reason: null, notifyMembers: true };

    const first = await checkIdempotencyKey({
      idempotencyKey: idemKey,
      operationName: "disableWorkspace",
      actorId: admin,
      payload,
    });
    expect(first.isNew).toBe(true);

    const result = await disableWorkspaceForAdmin({
      workspaceId: wsIdem,
      actorId: admin,
      reason: null,
      notifyMembers: true,
    });
    await recordIdempotencyResponse(idemKey, 201, result as unknown as Record<string, unknown>);

    const replay = await checkIdempotencyKey({
      idempotencyKey: idemKey,
      operationName: "disableWorkspace",
      actorId: admin,
      payload,
    });
    expect(replay.isNew).toBe(false);
    expect(replay.cachedResponse?.status).toBe(201);
    expect((replay.cachedResponse?.body as { workspaceId: string }).workspaceId).toBe(wsIdem);

    // The disable executed exactly once → exactly one audit event.
    const count = await db.auditEvent.count({
      where: { workspaceId: wsIdem, eventName: "WORKSPACE_DISABLED" },
    });
    expect(count).toBe(1);
  });
});
