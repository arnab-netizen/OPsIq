/**
 * Phase 1 — Private mode enforcement: DB-backed invariant tests.
 *
 * Verifies `resolvePrivateModeRole` against a real PostgreSQL instance:
 * 1. Approved OWNER access → "OWNER"
 * 2. Pending access (not yet approved) → null
 * 3. Revoked access → null
 * 4. No access record → null
 * 5. Cross-workspace isolation: approval in WS_A does NOT bleed to WS_B
 *
 * Requires TEST_WITH_DB=true and a running PostgreSQL service.
 * Self-skips when TEST_WITH_DB != 'true'.
 *
 * PrivateModeAccess.workspaceId is a FK to ClientAccount.id.
 * In the private deployment, OPSIQ_PRIVATE_WORKSPACE_ID = both Workspace.id
 * AND ClientAccount.id. Tests follow the same pattern: create a ClientAccount
 * and use its id as the workspaceId for resolvePrivateModeRole.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { db } from "@/lib/db";
import { resolvePrivateModeRole } from "@/lib/private-mode-enforcement";

const SKIP = !SHOULD_RUN_DB_TESTS;

describe.skipIf(SKIP)("[db] Phase 1 — resolvePrivateModeRole invariants", () => {
  let workspaceId: string;
  let userId: string;
  let userId2: string;

  beforeEach(async () => {
    workspaceId = uuid();
    userId = uuid();
    userId2 = uuid();

    // ClientAccount.id = workspaceId (private deployment convention).
    // status/visibility default in schema; we mirror the existing DB test pattern.
    await db.clientAccount.create({
      data: {
        id: workspaceId,
        name: `Test PM Workspace ${workspaceId.slice(0, 8)}`,
        updatedAt: new Date(),
      },
    });

    await db.user.create({
      data: {
        id: userId,
        email: `pm-db-test-${workspaceId}-u1@test.local`,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    await db.user.create({
      data: {
        id: userId2,
        email: `pm-db-test-${workspaceId}-u2@test.local`,
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    await db.auditEvent.deleteMany({ where: { workspaceId } });
    await db.privateModeAccess.deleteMany({ where: { workspaceId } });
    await db.clientAccount.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [userId, userId2] } } });
  });

  it("returns 'OWNER' for a user with an approved PrivateModeAccess record", async () => {
    await db.privateModeAccess.create({
      data: {
        id: uuid(),
        workspaceId,
        userId,
        role: "OWNER",
        grantedAt: new Date(),
        grantedBy: userId,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      },
    });

    const role = await resolvePrivateModeRole({ workspaceId, userId });
    expect(role).toBe("OWNER");
  });

  it("returns null for a user with a pending (not yet approved) PrivateModeAccess record", async () => {
    await db.privateModeAccess.create({
      data: {
        id: uuid(),
        workspaceId,
        userId,
        role: "CONSULTANT",
        grantedAt: new Date(),
        grantedBy: userId,
        approvalStatus: "pending",
        updatedAt: new Date(),
      },
    });

    const role = await resolvePrivateModeRole({ workspaceId, userId });
    expect(role).toBeNull();
  });

  it("returns null for a user whose PrivateModeAccess was revoked", async () => {
    const record = await db.privateModeAccess.create({
      data: {
        id: uuid(),
        workspaceId,
        userId,
        role: "ANALYST",
        grantedAt: new Date(),
        grantedBy: userId,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      },
    });

    // Revoke it
    await db.privateModeAccess.update({
      where: { id: record.id },
      data: {
        revokedAt: new Date(),
        revokedBy: userId,
        revokeReason: "DB test revocation",
        updatedAt: new Date(),
      },
    });

    const role = await resolvePrivateModeRole({ workspaceId, userId });
    expect(role).toBeNull();
  });

  it("returns null for a user with no PrivateModeAccess record at all", async () => {
    // No record created — userId has no access
    const role = await resolvePrivateModeRole({ workspaceId, userId });
    expect(role).toBeNull();
  });

  it("cross-workspace isolation: approval in WS_A does not bleed to WS_B", async () => {
    const workspaceB = uuid();

    // Create WS_B client account
    await db.clientAccount.create({
      data: {
        id: workspaceB,
        name: `Test PM Workspace B ${workspaceB.slice(0, 8)}`,
        updatedAt: new Date(),
      },
    });

    // Approve userId in WS_A
    await db.privateModeAccess.create({
      data: {
        id: uuid(),
        workspaceId,
        userId,
        role: "OWNER",
        grantedAt: new Date(),
        grantedBy: userId,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      },
    });

    const roleInA = await resolvePrivateModeRole({ workspaceId, userId });
    const roleInB = await resolvePrivateModeRole({ workspaceId: workspaceB, userId });

    expect(roleInA).toBe("OWNER");
    expect(roleInB).toBeNull();

    // Cleanup WS_B
    await db.clientAccount.deleteMany({ where: { id: workspaceB } });
  });

  it("two users in same workspace: only the approved one returns a role", async () => {
    // userId gets approved access
    await db.privateModeAccess.create({
      data: {
        id: uuid(),
        workspaceId,
        userId,
        role: "OWNER",
        grantedAt: new Date(),
        grantedBy: userId,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: userId,
        updatedAt: new Date(),
      },
    });
    // userId2 has no record

    const role1 = await resolvePrivateModeRole({ workspaceId, userId });
    const role2 = await resolvePrivateModeRole({ workspaceId, userId: userId2 });

    expect(role1).toBe("OWNER");
    expect(role2).toBeNull();
  });
});
