import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  grantPermission,
  revokePermission,
  requirePermission,
  hasPermissionFor,
} from "@/services/workspace/guided-execution-permissions.service";
import { suspendEmployee } from "@/services/workspace/employee-lifecycle.service";
import { GuidedExecutionPermission as P } from "@/domain/workspace/guided-execution-permissions";
import { UnauthorizedError } from "@/infra/errors";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] guided-execution permission grants",
  () => {
    let workspaceId: string;
    let ownerId: string;
    let managerId: string;

    beforeEach(async () => {
      workspaceId = uuid();
      ownerId = uuid();
      managerId = uuid();
      await db.workspace.create({
        data: { id: workspaceId, name: "WS", slug: `ws-${workspaceId}`, updatedAt: new Date() },
      });
      await db.user.create({
        data: { id: ownerId, email: `o-${ownerId}@t.test`, updatedAt: new Date() },
      });
      await db.user.create({
        data: { id: managerId, email: `m-${managerId}@t.test`, updatedAt: new Date() },
      });
      await db.workspaceMembership.create({
        data: { workspaceId, userId: ownerId, role: "OWNER", isActive: true },
      });
      await db.workspaceMembership.create({
        data: { workspaceId, userId: managerId, role: "OPERATOR", isActive: true },
      });
    });

    afterEach(async () => {
      await db.userRoleAssignment.deleteMany({
        where: { userId: { in: [ownerId, managerId] } },
      });
      await db.workspaceMembership.deleteMany({ where: { workspaceId } });
      await db.user.deleteMany({ where: { id: { in: [ownerId, managerId] } } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    });

    it("owner grants → persists a row → manager passes the guard; revoke removes it", async () => {
      await grantPermission({
        workspaceId,
        userId: managerId,
        permission: P.PROOF_REVIEW_PAYMENT,
        actorId: ownerId,
      });

      const rows = await db.userRoleAssignment.findMany({
        where: {
          userId: managerId,
          role: P.PROOF_REVIEW_PAYMENT,
          scope: "workspace",
          scopeId: workspaceId,
          isActive: true,
        },
      });
      expect(rows.length).toBe(1);

      await expect(
        requirePermission(workspaceId, managerId, P.PROOF_REVIEW_PAYMENT)
      ).resolves.toBeUndefined();

      await revokePermission({
        workspaceId,
        userId: managerId,
        permission: P.PROOF_REVIEW_PAYMENT,
        actorId: ownerId,
      });
      await expect(
        hasPermissionFor(workspaceId, managerId, P.PROOF_REVIEW_PAYMENT)
      ).resolves.toBe(false);
    });

    it("a suspended manager cannot use a previously-granted permission", async () => {
      await grantPermission({
        workspaceId,
        userId: managerId,
        permission: P.VIEW_TEAM_TASKS,
        actorId: ownerId,
      });
      await suspendEmployee({ workspaceId, userId: managerId, actorId: ownerId });
      await expect(
        requirePermission(workspaceId, managerId, P.VIEW_TEAM_TASKS)
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("the grant emits a business audit event", async () => {
      await grantPermission({
        workspaceId,
        userId: managerId,
        permission: P.VIEW_TEAM_TASKS,
        actorId: ownerId,
      });
      const events = await db.auditEvent.findMany({
        where: { workspaceId, eventName: "permission.granted" },
      });
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  }
);
