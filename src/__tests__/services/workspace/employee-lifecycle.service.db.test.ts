import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  suspendEmployee,
  offboardEmployee,
  reactivateEmployee,
  requireActiveMembership,
} from "@/services/workspace/employee-lifecycle.service";
import { UnauthorizedError } from "@/infra/errors";

/**
 * [db] End-to-end proof that SUSPEND/OFFBOARD denies an EXISTING session.
 * Mirrors the runtime auth gate: `getSession` rejects a session whose
 * `revokedAt` is set, and `requireActiveMembership` re-reads status per request.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] employee lifecycle — existing-session revocation",
  () => {
    let workspaceId: string;
    let ownerId: string;
    let employeeId: string;
    let sessionToken: string;

    beforeEach(async () => {
      workspaceId = uuid();
      ownerId = uuid();
      employeeId = uuid();
      sessionToken = uuid();

      await db.workspace.create({
        data: { id: workspaceId, name: "WS", slug: `ws-${workspaceId}`, updatedAt: new Date() },
      });
      await db.user.create({
        data: { id: ownerId, email: `owner-${ownerId}@t.test`, updatedAt: new Date() },
      });
      await db.user.create({
        data: { id: employeeId, email: `emp-${employeeId}@t.test`, updatedAt: new Date() },
      });
      await db.workspaceMembership.create({
        data: {
          workspaceId,
          userId: employeeId,
          role: "OPERATOR",
          isActive: true,
        },
      });
      // an existing, valid (un-revoked, unexpired) session for the employee
      await db.session.create({
        data: {
          id: uuid(),
          userId: employeeId,
          token: sessionToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    });

    afterEach(async () => {
      // FK-safe order: audit_events reference actor users, so remove them first.
      await db.auditEvent.deleteMany({ where: { workspaceId } });
      await db.session.deleteMany({ where: { userId: { in: [employeeId, ownerId] } } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId } });
      await db.user.deleteMany({ where: { id: { in: [employeeId, ownerId] } } });
      await db.workspace.deleteMany({ where: { id: workspaceId } });
    });

    it("ACTIVE employee passes the runtime guard before suspension", async () => {
      await expect(
        requireActiveMembership(workspaceId, employeeId)
      ).resolves.toBeUndefined();
      const s = await db.session.findUnique({ where: { token: sessionToken } });
      expect(s?.revokedAt).toBeNull();
    });

    it("SUSPEND revokes the existing session and denies the runtime guard", async () => {
      await suspendEmployee({ workspaceId, userId: employeeId, actorId: ownerId });

      const s = await db.session.findUnique({ where: { token: sessionToken } });
      expect(s?.revokedAt).not.toBeNull(); // existing token can no longer authenticate

      const m = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: employeeId } },
      });
      expect(m?.isActive).toBe(false);

      await expect(
        requireActiveMembership(workspaceId, employeeId)
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("OFFBOARD revokes sessions, is terminal, and cannot be reactivated", async () => {
      await offboardEmployee({ workspaceId, userId: employeeId, actorId: ownerId });

      const s = await db.session.findUnique({ where: { token: sessionToken } });
      expect(s?.revokedAt).not.toBeNull();

      const m = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: employeeId } },
      });
      expect(m?.removedAt).not.toBeNull();

      await expect(
        reactivateEmployee({ workspaceId, userId: employeeId, actorId: ownerId })
      ).rejects.toBeTruthy();
    });

    it("an audit event is written for the suspension", async () => {
      await suspendEmployee({ workspaceId, userId: employeeId, actorId: ownerId });
      const events = await db.auditEvent.findMany({
        where: { workspaceId, eventName: "employee.suspended" },
      });
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  }
);
