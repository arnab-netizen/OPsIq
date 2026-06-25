import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  requireDashboardAccess,
  requireTaskAccess,
  scopedResponse,
} from "@/services/workspace/dashboard-access.service";
import { suspendEmployee } from "@/services/workspace/employee-lifecycle.service";
import { DashboardScope } from "@/domain/workspace/dashboard-access";
import { UnauthorizedError } from "@/infra/errors";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] role-scoped dashboard + task access",
  () => {
    let ws: string;
    let owner: string;
    let emp1: string;
    let emp2: string;

    beforeEach(async () => {
      ws = uuid();
      owner = uuid();
      emp1 = uuid();
      emp2 = uuid();
      await db.workspace.create({
        data: { id: ws, name: "WS", slug: `ws-${ws}`, updatedAt: new Date() },
      });
      for (const id of [owner, emp1, emp2]) {
        await db.user.create({
          data: { id, email: `${id}@t.test`, updatedAt: new Date() },
        });
      }
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: owner, role: "OWNER", isActive: true },
      });
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp1, role: "OPERATOR", isActive: true },
      });
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp2, role: "OPERATOR", isActive: true },
      });
    });

    afterEach(async () => {
      await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
      await db.session.deleteMany({ where: { userId: { in: [owner, emp1, emp2] } } });
      await db.userRoleAssignment.deleteMany({
        where: { userId: { in: [owner, emp1, emp2] } },
      });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: ws } });
      await db.user.deleteMany({ where: { id: { in: [owner, emp1, emp2] } } });
      await db.workspace.deleteMany({ where: { id: ws } });
    });

    it("employee is denied the owner dashboard but allowed the employee dashboard", async () => {
      await expect(
        requireDashboardAccess(ws, emp1, DashboardScope.EMPLOYEE)
      ).resolves.toBeUndefined();
      await expect(
        requireDashboardAccess(ws, emp1, DashboardScope.OWNER)
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("employee cannot access another employee's task", async () => {
      await expect(
        requireTaskAccess(ws, emp1, { workspaceId: ws, assignedUserId: emp1 })
      ).resolves.toBeUndefined();
      await expect(
        requireTaskAccess(ws, emp1, { workspaceId: ws, assignedUserId: emp2 })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("employee API payload is stripped of owner-only fields", async () => {
      const r = (await scopedResponse(ws, emp1, {
        myTasks: [1],
        ownerDiagnosis: "secret",
        cashRunway: 7,
      })) as Record<string, unknown>;
      expect(r.myTasks).toBeDefined();
      expect(r.ownerDiagnosis).toBeUndefined();
      expect(r.cashRunway).toBeUndefined();
    });

    it("a suspended employee with an existing session is denied the employee dashboard", async () => {
      await suspendEmployee({ workspaceId: ws, userId: emp1, actorId: owner });
      await expect(
        requireDashboardAccess(ws, emp1, DashboardScope.EMPLOYEE)
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });
  }
);
