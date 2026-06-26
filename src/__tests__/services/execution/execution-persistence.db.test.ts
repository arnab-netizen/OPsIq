import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  suspendEmployee,
  offboardEmployee,
  assertEmployeeAssignable,
  getEmployeeAccessStatus,
} from "@/services/workspace/employee-lifecycle.service";
import { requireTaskAccess } from "@/services/workspace/dashboard-access.service";
import {
  submitProof,
  reviewProof,
  ProofTransitionNotAllowedError,
} from "@/services/execution/proof.service";
import { raiseBlocker } from "@/services/execution/escalation.service";
import { EmployeeAccessStatus } from "@/domain/workspace/employee-lifecycle";
import { ProofStatus, ProofType, ProofRiskLevel, ProofActor } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { BlockerType, EscalationTarget } from "@/domain/execution/escalation";
import { UnauthorizedError } from "@/infra/errors";

const assignee = (a: boolean): ProofActor => ({
  role: TaskActorRole.EMPLOYEE,
  isAssignee: a,
  canReviewProof: false,
});
const reviewer: ProofActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canReviewProof: true,
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Owner Mode execution persistence (Slices 3B/7/8/9)",
  () => {
    let ws: string;
    let wsOther: string;
    let owner: string;
    let emp1: string;
    let emp2: string;

    beforeEach(async () => {
      ws = uuid();
      wsOther = uuid();
      owner = uuid();
      emp1 = uuid();
      emp2 = uuid();
      for (const [id, slug] of [[ws, `ws-${ws}`], [wsOther, `ws-${wsOther}`]] as const) {
        await db.workspace.create({ data: { id, name: "WS", slug, updatedAt: new Date() } });
      }
      for (const id of [owner, emp1, emp2]) {
        await db.user.create({ data: { id, email: `${id}@t.test`, updatedAt: new Date() } });
      }
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: owner, role: "OWNER", isActive: true },
      });
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp2, role: "OPERATOR", isActive: true },
      });
    });

    afterEach(async () => {
      for (const wsId of [ws, wsOther]) {
        await db.auditEvent.deleteMany({ where: { workspaceId: wsId } });
        await db.escalation.deleteMany({ where: { workspaceId: wsId } });
        await db.proof.deleteMany({ where: { workspaceId: wsId } });
        await db.proofRequirement.deleteMany({ where: { workspaceId: wsId } });
        await db.taskStatusHistory.deleteMany({ where: { workspaceId: wsId } });
        await db.delegatedTask.deleteMany({ where: { workspaceId: wsId } });
        await db.workOrder.deleteMany({ where: { workspaceId: wsId } });
        await db.workspaceMembership.deleteMany({ where: { workspaceId: wsId } });
      }
      await db.session.deleteMany({ where: { userId: { in: [owner, emp1, emp2] } } });
      await db.user.deleteMany({ where: { id: { in: [owner, emp1, emp2] } } });
      await db.workspace.deleteMany({ where: { id: { in: [ws, wsOther] } } });
    });

    it("1. employee profile fields persist and are workspace-scoped", async () => {
      await db.workspaceMembership.create({
        data: {
          workspaceId: ws,
          userId: emp1,
          role: "OPERATOR",
          isActive: true,
          designation: "Senior Counter Staff",
          managerId: owner,
          allowedTaskTypes: ["call_customer", "send_reminder"],
          authorityLimits: { maxDiscount: 10 },
          invitationStatus: "ACCEPTED",
          primaryAuthMethod: "EMAIL",
          createdByOwnerId: owner,
        },
      });
      const m = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: ws, userId: emp1 } },
      });
      expect(m?.designation).toBe("Senior Counter Staff");
      expect(m?.managerId).toBe(owner);
      expect(m?.allowedTaskTypes).toEqual(["call_customer", "send_reminder"]);
      expect((m?.authorityLimits as { maxDiscount: number }).maxDiscount).toBe(10);
      // workspace-scoped: not visible from another workspace
      const cross = await db.workspaceMembership.findFirst({
        where: { workspaceId: wsOther, userId: emp1 },
      });
      expect(cross).toBeNull();
    });

    it("2/3. suspend/offboard stamp timestamps; offboarded cannot be assigned", async () => {
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp1, role: "OPERATOR", isActive: true },
      });
      await suspendEmployee({ workspaceId: ws, userId: emp1, actorId: owner });
      let m = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: ws, userId: emp1 } },
      });
      expect(m?.isActive).toBe(false);
      expect(m?.suspendedAt).not.toBeNull();
      expect(await getEmployeeAccessStatus(ws, emp1)).toBe(EmployeeAccessStatus.SUSPENDED);

      await offboardEmployee({ workspaceId: ws, userId: emp1, actorId: owner });
      m = await db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId: ws, userId: emp1 } },
      });
      expect(m?.offboardedAt).not.toBeNull();
      await expect(assertEmployeeAssignable(ws, emp1)).rejects.toBeTruthy();
    });

    it("4/5/11. delegated task persists with exact boundary binding; access + isolation", async () => {
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp1, role: "OPERATOR", isActive: true },
      });
      const taskId = uuid();
      await db.delegatedTask.create({
        data: {
          id: taskId,
          workspaceId: ws,
          assignedUserId: emp2,
          assignedRole: "counter_staff",
          title: "Call customer",
          status: "ASSIGNED",
          approvedBoundaryId: uuid(),
          approvedBoundaryVersion: 3,
          boundaryContentHash: "abc123hash",
          updatedAt: new Date(),
        },
      });
      const t = await db.delegatedTask.findUnique({ where: { id: taskId } });
      expect(t?.approvedBoundaryVersion).toBe(3);
      expect(t?.boundaryContentHash).toBe("abc123hash");

      const subject = { workspaceId: t!.workspaceId, assignedUserId: t!.assignedUserId };
      // emp2 (assignee) can access; emp1 cannot
      await expect(requireTaskAccess(ws, emp2, subject)).resolves.toBeUndefined();
      await expect(requireTaskAccess(ws, emp1, subject)).rejects.toBeInstanceOf(UnauthorizedError);

      // workspace isolation: the task is not returned when scoping to the other workspace
      const isolated = await db.delegatedTask.findMany({ where: { workspaceId: wsOther } });
      expect(isolated.find((x) => x.id === taskId)).toBeUndefined();
    });

    it("6/7/8. proof submission/review persists; duplicate flagged; reject needs reason + resubmit", async () => {
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp1, role: "OPERATOR", isActive: true },
      });
      const reqId = uuid();
      await db.proofRequirement.create({
        data: {
          id: reqId,
          workspaceId: ws,
          proofType: ProofType.PAYMENT_CONFIRMATION,
          requiredFields: ["amount"],
          riskLevel: ProofRiskLevel.HIGH,
        },
      });
      const proofId = uuid();
      await db.proof.create({
        data: {
          id: proofId,
          workspaceId: ws,
          taskId: null,
          proofRequirementId: reqId,
          proofType: ProofType.PAYMENT_CONFIRMATION,
          status: ProofStatus.PENDING_SUBMISSION,
          updatedAt: new Date(),
        },
      });

      // 7. duplicate hash flagged + 6. submission persists
      const sub = await submitProof({
        proofId,
        taskId: "t",
        workspaceId: ws,
        fromStatus: ProofStatus.PENDING_SUBMISSION,
        requirement: { proofType: ProofType.PAYMENT_CONFIRMATION, requiredFields: ["amount"], riskLevel: ProofRiskLevel.HIGH },
        submission: { proofType: ProofType.PAYMENT_CONFIRMATION, fields: { amount: 500 }, fileHash: "dup", submittedByUserId: emp1 },
        actor: assignee(true),
        existingHashes: new Set(["dup"]),
      });
      expect(sub.duplicateFlagged).toBe(true);
      let p = await db.proof.findUnique({ where: { id: proofId } });
      expect(p?.status).toBe(ProofStatus.SUBMITTED);
      expect(p?.duplicateFlagged).toBe(true);

      // route to human review (system) then 8. reject requires reason
      await db.proof.update({ where: { id: proofId }, data: { status: ProofStatus.NEEDS_HUMAN_REVIEW } });
      await expect(
        reviewProof({ proofId, workspaceId: ws, fromStatus: ProofStatus.NEEDS_HUMAN_REVIEW, to: ProofStatus.REJECTED, actor: reviewer, actorId: owner })
      ).rejects.toBeInstanceOf(ProofTransitionNotAllowedError);
      await reviewProof({ proofId, workspaceId: ws, fromStatus: ProofStatus.NEEDS_HUMAN_REVIEW, to: ProofStatus.REJECTED, actor: reviewer, actorId: owner, reason: "amount unreadable" });
      p = await db.proof.findUnique({ where: { id: proofId } });
      expect(p?.status).toBe(ProofStatus.REJECTED);
      expect(p?.reviewReason).toBe("amount unreadable");

      // resubmission path: REJECTED → RESUBMISSION_REQUIRED → SUBMITTED
      await reviewProof({ proofId, workspaceId: ws, fromStatus: ProofStatus.REJECTED, to: ProofStatus.RESUBMISSION_REQUIRED, actor: reviewer, actorId: owner });
      const sub2 = await submitProof({
        proofId,
        taskId: "t",
        workspaceId: ws,
        fromStatus: ProofStatus.RESUBMISSION_REQUIRED,
        requirement: { proofType: ProofType.PAYMENT_CONFIRMATION, requiredFields: ["amount"], riskLevel: ProofRiskLevel.HIGH },
        submission: { proofType: ProofType.PAYMENT_CONFIRMATION, fields: { amount: 500 }, fileHash: "fresh", submittedByUserId: emp1 },
        actor: assignee(true),
      });
      expect(sub2.status).toBe(ProofStatus.SUBMITTED);
    });

    it("9/10/11. escalation persists with routing/severity/SLA; critical surfaces to owner; isolated", async () => {
      await db.workspaceMembership.create({
        data: { workspaceId: ws, userId: emp1, role: "OPERATOR", isActive: true },
      });
      const escId = uuid();
      const r = await raiseBlocker({
        escalationId: escId,
        workspaceId: ws,
        taskId: null,
        blocker: BlockerType.REFUND_REQUEST,
        createdByUserId: emp1,
      });
      expect(r.route.target).toBe(EscalationTarget.OWNER);

      const e = await db.escalation.findUnique({ where: { id: escId } });
      expect(e?.category).toBe(BlockerType.REFUND_REQUEST);
      expect(e?.assignedTarget).toBe(EscalationTarget.OWNER);
      expect(e?.status).toBe("OPEN");
      expect(e?.dueAt).not.toBeNull();

      // 10. owner query path surfaces owner-targeted escalations
      const ownerQueue = await db.escalation.findMany({
        where: { workspaceId: ws, assignedTarget: EscalationTarget.OWNER, status: "OPEN" },
      });
      expect(ownerQueue.find((x) => x.id === escId)).toBeDefined();

      // 11. isolation
      const isolated = await db.escalation.findMany({ where: { workspaceId: wsOther } });
      expect(isolated.find((x) => x.id === escId)).toBeUndefined();
    });
  }
);
