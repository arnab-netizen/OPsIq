/**
 * [db] Real-DB proof of the Administration V1 corrections to
 * employee-lifecycle.service.ts:
 *
 *  - AUDIT-01 atomicity: the membership transition, session revocation, and
 *    required audit event(s) commit or roll back together. A simulated audit
 *    failure must leave the membership row and sessions untouched; a
 *    subsequent retry must perform a fresh, real transition.
 *  - Sole-active-owner guard: suspending/offboarding the last active owner of
 *    a workspace is refused server-side, never merely hidden in the UI.
 *  - Workspace-scoped suspension: a user's membership in OTHER workspaces is
 *    untouched by suspending them in one workspace ("Suspend workspace
 *    access", not "Suspend user").
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/workspace/employee-lifecycle-suspend-atomicity.db.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

vi.mock("@/infra/audit", async () => {
  const actual = await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit");
  return { ...actual, emitAuditEvent: vi.fn(actual.emitAuditEvent) };
});

import { emitAuditEvent } from "@/infra/audit";
import {
  suspendEmployee,
  reactivateEmployee,
  offboardEmployee,
  SoleActiveOwnerError,
} from "@/services/workspace/employee-lifecycle.service";

const mockedEmitAuditEvent = vi.mocked(emitAuditEvent);

async function seedWorkspace(name: string) {
  const workspaceId = randomUUID();
  await db.workspace.create({
    data: { id: workspaceId, name, slug: `${name}-${workspaceId}`, updatedAt: new Date() },
  });
  return workspaceId;
}

async function seedUser(label: string) {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${label}-${userId}@t.test`, updatedAt: new Date() } });
  return userId;
}

async function seedMembership(workspaceId: string, userId: string, role: string) {
  await db.workspaceMembership.create({ data: { workspaceId, userId, role, isActive: true } });
}

async function seedSession(userId: string) {
  const id = randomUUID();
  await db.session.create({
    data: { id, userId, token: `tok-${id}`, expiresAt: new Date(Date.now() + 3600_000) },
  });
  return id;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] employee lifecycle — Administration V1 corrections", () => {
  const cleanupWorkspaceIds: string[] = [];
  const cleanupUserIds: string[] = [];

  afterEach(async () => {
    mockedEmitAuditEvent.mockClear();
    if (cleanupWorkspaceIds.length) {
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: cleanupWorkspaceIds } } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { workspaceId: { in: cleanupWorkspaceIds } } }).catch(() => undefined);
      await db.workspace.deleteMany({ where: { id: { in: cleanupWorkspaceIds } } }).catch(() => undefined);
      cleanupWorkspaceIds.length = 0;
    }
    if (cleanupUserIds.length) {
      await db.session.deleteMany({ where: { userId: { in: cleanupUserIds } } }).catch(() => undefined);
      await db.user.deleteMany({ where: { id: { in: cleanupUserIds } } }).catch(() => undefined);
      cleanupUserIds.length = 0;
    }
  });

  it("[db] AUDIT-01: a simulated audit failure rolls back the membership + session state; retry performs a fresh transition", async () => {
    const workspaceId = await seedWorkspace("atomic-ws");
    const ownerId = await seedUser("owner");
    const memberId = await seedUser("member");
    cleanupWorkspaceIds.push(workspaceId);
    cleanupUserIds.push(ownerId, memberId);
    await seedMembership(workspaceId, ownerId, "owner");
    await seedMembership(workspaceId, memberId, "member");
    const sessionId = await seedSession(memberId);

    // Step 1: simulated audit failure rolls the whole transaction back.
    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_SUSPEND");
    });
    await expect(
      suspendEmployee({ workspaceId, userId: memberId, actorId: ownerId })
    ).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_SUSPEND");

    const membershipAfterFailure = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    expect(membershipAfterFailure?.isActive).toBe(true); // unchanged — rolled back
    const sessionAfterFailure = await db.session.findUnique({ where: { id: sessionId } });
    expect(sessionAfterFailure?.revokedAt).toBeNull(); // unchanged — rolled back
    const eventsAfterFailure = await db.auditEvent.findMany({
      where: { workspaceId, entityId: memberId, eventName: "employee.suspended" },
    });
    expect(eventsAfterFailure).toHaveLength(0);

    // Step 2: retry performs a fresh, real transition.
    const result = await suspendEmployee({ workspaceId, userId: memberId, actorId: ownerId });
    expect(result).toBe("SUSPENDED");

    const membershipAfterRetry = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    expect(membershipAfterRetry?.isActive).toBe(false);
    const sessionAfterRetry = await db.session.findUnique({ where: { id: sessionId } });
    expect(sessionAfterRetry?.revokedAt).not.toBeNull();

    const eventsAfterRetry = await db.auditEvent.findMany({
      where: { workspaceId, entityId: memberId, eventName: "employee.suspended" },
    });
    expect(eventsAfterRetry).toHaveLength(1);
  });

  it("[db] sole-active-owner guard denies suspending the last active owner; a co-owner makes it allowed", async () => {
    const workspaceId = await seedWorkspace("owner-ws");
    const soleOwnerId = await seedUser("sole-owner");
    const actorId = await seedUser("actor");
    cleanupWorkspaceIds.push(workspaceId);
    cleanupUserIds.push(soleOwnerId, actorId);
    await seedMembership(workspaceId, soleOwnerId, "owner");

    await expect(
      suspendEmployee({ workspaceId, userId: soleOwnerId, actorId })
    ).rejects.toBeInstanceOf(SoleActiveOwnerError);
    const stillActive = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: soleOwnerId } },
    });
    expect(stillActive?.isActive).toBe(true);

    // Same guard applies to OFFBOARD.
    await expect(
      offboardEmployee({ workspaceId, userId: soleOwnerId, actorId })
    ).rejects.toBeInstanceOf(SoleActiveOwnerError);

    // Add a co-owner: now suspending the first owner is allowed.
    const coOwnerId = await seedUser("co-owner");
    cleanupUserIds.push(coOwnerId);
    await seedMembership(workspaceId, coOwnerId, "owner");

    const result = await suspendEmployee({ workspaceId, userId: soleOwnerId, actorId });
    expect(result).toBe("SUSPENDED");
  });

  it("[db] workspace-scoped suspension: a multi-workspace user only loses access in the selected workspace", async () => {
    const workspaceA = await seedWorkspace("ws-a");
    const workspaceB = await seedWorkspace("ws-b");
    const sharedUserId = await seedUser("shared-user");
    const ownerAId = await seedUser("owner-a");
    const ownerBId = await seedUser("owner-b");
    cleanupWorkspaceIds.push(workspaceA, workspaceB);
    cleanupUserIds.push(sharedUserId, ownerAId, ownerBId);
    await seedMembership(workspaceA, ownerAId, "owner");
    await seedMembership(workspaceB, ownerBId, "owner");
    await seedMembership(workspaceA, sharedUserId, "member");
    await seedMembership(workspaceB, sharedUserId, "member");

    await suspendEmployee({ workspaceId: workspaceA, userId: sharedUserId, actorId: ownerAId });

    const membershipA = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: workspaceA, userId: sharedUserId } },
    });
    const membershipB = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: workspaceB, userId: sharedUserId } },
    });
    expect(membershipA?.isActive).toBe(false); // suspended here
    expect(membershipB?.isActive).toBe(true); // untouched in the other workspace
  });

  it("[db] restore (reactivate) flips access back on in the same workspace", async () => {
    const workspaceId = await seedWorkspace("restore-ws");
    const ownerId = await seedUser("owner");
    const memberId = await seedUser("member");
    cleanupWorkspaceIds.push(workspaceId);
    cleanupUserIds.push(ownerId, memberId);
    await seedMembership(workspaceId, ownerId, "owner");
    await seedMembership(workspaceId, memberId, "member");

    await suspendEmployee({ workspaceId, userId: memberId, actorId: ownerId });
    const suspended = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    expect(suspended?.isActive).toBe(false);

    const result = await reactivateEmployee({ workspaceId, userId: memberId, actorId: ownerId });
    expect(result).toBe("ACTIVE");
    const restored = await db.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: memberId } },
    });
    expect(restored?.isActive).toBe(true);
  });
});
