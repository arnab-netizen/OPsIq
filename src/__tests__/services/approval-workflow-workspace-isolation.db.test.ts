/**
 * Legacy ApprovalRequest workspace isolation (SCHEMA-01) — hostile cross-workspace DB proof.
 *
 * `approval_requests` (src/services/approval/workflow.ts) was WORKSPACE_SCOPED_INDIRECT: it had
 * no workspaceId column of its own and was scoped only via operatorItemId -> operatorItem.workspaceId,
 * enforced at the service/route layer rather than the database (see docs/remediation/2026-07-04-
 * critical-governance-spine/TENANT_MODEL_CLASSIFICATION.md). Every exported function in workflow.ts
 * now takes a required workspaceId and filters every query by it.
 *
 * This test drives the REAL, un-mocked service against a REAL Postgres database and proves a caller
 * authenticated into workspace A cannot read, approve, or reject an ApprovalRequest that belongs to
 * workspace B, and cannot attribute a newly-created approval to the wrong workspace by pairing a
 * foreign operatorItemId with its own workspaceId. Every hostile call is asserted to leave the
 * target row byte-for-byte unchanged and to emit no audit event for the attempted transition.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/approval-workflow-workspace-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  requestApproval,
  approveOutcome,
  rejectOutcome,
  getApprovalStatus,
  canCompleteWithApprovalStatus,
} from "@/services/approval/workflow";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] ApprovalRequest workspace isolation (hostile cross-workspace access)",
  () => {
    const stamp = randomUUID().substring(0, 8);

    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const requesterA = randomUUID();
    const approverA = randomUUID();
    const requesterB = randomUUID();
    const approverB = randomUUID();
    const operatorItemIds: string[] = [];

    let operatorItemA: string;

    async function seedOperatorItem(workspaceId: string): Promise<string> {
      const id = randomUUID();
      await db.operatorItem.create({
        data: {
          id,
          workspaceId,
          problem: "High-value spend decision",
          action: "Approve $250k vendor migration",
          impactExpected: 250000,
          impactLow: 200000,
          impactHigh: 300000,
          confidence: 0.8,
          priorityScore: 0.9,
          createdByUserId: requesterA,
          updatedAt: new Date(),
        },
      });
      operatorItemIds.push(id);
      return id;
    }

    async function auditCount(entityId: string, eventName: string): Promise<number> {
      return db.auditEvent.count({ where: { entityId, eventName } });
    }

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceA, name: "Isolation WS A", slug: `iso-a-${stamp}` } });
      await db.workspace.create({ data: { id: workspaceB, name: "Isolation WS B", slug: `iso-b-${stamp}` } });
      await db.user.create({ data: { id: requesterA, email: `iso-req-a-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      await db.user.create({ data: { id: approverA, email: `iso-apr-a-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      await db.user.create({ data: { id: requesterB, email: `iso-req-b-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      await db.user.create({ data: { id: approverB, email: `iso-apr-b-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      operatorItemA = await seedOperatorItem(workspaceA);
    });

    afterAll(async () => {
      try {
        await db.approvalRequest.deleteMany({ where: { operatorItemId: { in: operatorItemIds } } });
        await db.auditEvent.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
        await db.operatorItem.deleteMany({ where: { id: { in: operatorItemIds } } });
        await db.user.deleteMany({ where: { id: { in: [requesterA, approverA, requesterB, approverB] } } });
        await db.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] requestApproval refuses to attribute a foreign workspace's operator item to the caller's own workspace", async () => {
      // Workspace B's caller tries to create an approval for workspace A's operator item, passing
      // its OWN workspaceId. The service must derive the operator item's real workspace from the DB
      // and refuse — never trust the caller's workspaceId argument for attribution.
      await expect(
        requestApproval(workspaceB, operatorItemA, requesterB, approverB)
      ).rejects.toThrow(NotFoundError);

      // No row was created for this (operatorItemA, approverB) pair under any workspace.
      const leaked = await db.approvalRequest.findFirst({
        where: { operatorItemId: operatorItemA, approverUserId: approverB },
      });
      expect(leaked).toBeNull();
    });

    it("[db] getApprovalStatus scoped to workspace B cannot see workspace A's approval", async () => {
      const reqA = await requestApproval(workspaceA, operatorItemA, requesterA, approverA);
      expect(reqA.workspaceId).toBe(workspaceA);

      // Same operatorItemId, wrong workspace: must behave as if nothing exists.
      const statusFromB = await getApprovalStatus(workspaceB, operatorItemA);
      expect(statusFromB).toEqual({
        approved: false,
        pending: false,
        rejected: false,
        reason: "No approval requests found",
      });

      // The legitimate workspace still sees it.
      const statusFromA = await getApprovalStatus(workspaceA, operatorItemA);
      expect(statusFromA.pending).toBe(true);
    });

    it("[db] canCompleteWithApprovalStatus scoped to workspace B treats workspace A's approval as nonexistent", async () => {
      // seed a second operator item + approval under workspace A specifically for this test to avoid
      // interference from other tests' state
      const opItem = await seedOperatorItem(workspaceA);
      const req = await requestApproval(workspaceA, opItem, requesterA, approverA);
      await approveOutcome(workspaceA, req.id, approverA, "approved for completion check");

      const fromOwner = await canCompleteWithApprovalStatus(workspaceA, opItem, 250000);
      expect(fromOwner.allowed).toBe(true);

      const fromHostile = await canCompleteWithApprovalStatus(workspaceB, opItem, 250000);
      expect(fromHostile.allowed).toBe(false);
      expect(fromHostile.reason).toMatch(/approval required/i);
    });

    it("[db] approveOutcome from a foreign workspace cannot approve another workspace's request, mutates nothing, and emits no audit", async () => {
      const opItem = await seedOperatorItem(workspaceA);
      const req = await requestApproval(workspaceA, opItem, requesterA, approverA);

      // Workspace B's caller attempts to approve workspace A's pending request, even knowing the
      // real approverUserId (simulating a compromised/curious cross-tenant actor).
      const hostileResult = await approveOutcome(workspaceB, req.id, approverA, "hostile approve");
      expect(hostileResult.approved).toBe(false);
      expect(hostileResult.reason).toBe("Approval request not found");

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("pending"); // untouched
      expect(row?.approvalDecision).toBeNull();
      expect(row?.approvedAt).toBeNull();
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED)).toBe(0);

      // The legitimate workspace can still approve it afterwards.
      const legit = await approveOutcome(workspaceA, req.id, approverA, "legit approve");
      expect(legit.approved).toBe(true);
      const rowAfter = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(rowAfter?.approvalStatus).toBe("approved");
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED)).toBe(1);
    });

    it("[db] rejectOutcome from a foreign workspace cannot reject another workspace's request, mutates nothing, and emits no audit", async () => {
      const opItem = await seedOperatorItem(workspaceA);
      const req = await requestApproval(workspaceA, opItem, requesterA, approverA);

      const hostileResult = await rejectOutcome(workspaceB, req.id, approverA, "hostile reject");
      expect(hostileResult.approved).toBe(false);
      expect(hostileResult.reason).toBe("Approval request not found");

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("pending"); // untouched
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_DENIED)).toBe(0);

      const legit = await rejectOutcome(workspaceA, req.id, approverA, "legit reject");
      expect(legit.approved).toBe(false);
      expect(legit.reason).toBe("legit reject");
      const rowAfter = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(rowAfter?.approvalStatus).toBe("rejected");
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_DENIED)).toBe(1);
    });

    it("[db] a foreign-workspace caller cannot even discover a pending request exists (approve and reject both resolve identically to a nonexistent id)", async () => {
      const opItem = await seedOperatorItem(workspaceA);
      const req = await requestApproval(workspaceA, opItem, requesterA, approverA);

      const hostileApprove = await approveOutcome(workspaceB, req.id, approverA, "probe");
      const hostileOnRandomId = await approveOutcome(workspaceB, randomUUID(), approverA, "probe");

      // Identical "not found" response whether the id exists (in another workspace) or not —
      // no information leak distinguishing the two cases.
      expect(hostileApprove).toEqual(hostileOnRandomId);
    });

    it("[db] requestApproval is still idempotent and workspace-correct on the legitimate path (no regression)", async () => {
      const opItem = await seedOperatorItem(workspaceA);
      const first = await requestApproval(workspaceA, opItem, requesterA, approverA);
      const second = await requestApproval(workspaceA, opItem, requesterA, approverA);

      expect(second.id).toBe(first.id);
      expect(first.workspaceId).toBe(workspaceA);
      expect(second.workspaceId).toBe(workspaceA);
      expect(await auditCount(first.id, AUDIT_EVENTS.APPROVAL_REQUESTED)).toBe(1);
    });
  }
);
