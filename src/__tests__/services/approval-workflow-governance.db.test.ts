/**
 * Phase 6D — approval workflow governance hardening (real-DB proof).
 *
 * `src/services/approval/workflow.ts` governs high-value (> $100k) approval records. Before this phase
 * its mutations had:
 *   - NO audit trail (requestApproval/approveOutcome/rejectOutcome emitted nothing) — a governed
 *     >$100k surface with zero audit history;
 *   - NO status guard — approveOutcome/rejectOutcome overwrote approvalStatus unconditionally, so an
 *     already-approved request could be silently flipped to rejected (and vice-versa);
 *   - NO idempotency/concurrency guard — read-then-write (findUnique → update) with no atomic
 *     compare-and-set, so concurrent approve/reject could double-apply.
 *
 * The fix routes approve/reject through a status-guarded updateMany (compare-and-set on
 * approvalStatus="pending") inside a transaction that emits the audit event on the same tx (fail
 * closed — a failed audit rolls the transition back), and adds a creation audit to requestApproval.
 *
 * Each test runs the real service against a REAL Postgres database (no Prisma mocks) and asserts the
 * persisted rows + emitted audit events. The status-guard and concurrency tests fail against the old
 * unconditional `update` implementation. DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  requestApproval,
  approveOutcome,
  rejectOutcome,
} from "@/services/approval/workflow";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6D — approval workflow governance (audit + status guard + idempotency/concurrency)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const requesterId = randomUUID();
    const approverId = randomUUID();
    const otherUserId = randomUUID();
    const operatorItemIds: string[] = [];

    async function seedOperatorItem(): Promise<string> {
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
          createdByUserId: requesterId,
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
      await db.workspace.create({ data: { id: workspaceId, name: "6D WS", slug: `p6d-${stamp}` } });
      await db.user.create({ data: { id: requesterId, email: `p6d-req-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      await db.user.create({ data: { id: approverId, email: `p6d-apr-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      await db.user.create({ data: { id: otherUserId, email: `p6d-oth-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
    });

    afterAll(async () => {
      try {
        await db.approvalRequest.deleteMany({ where: { operatorItemId: { in: operatorItemIds } } });
        await db.auditEvent.deleteMany({ where: { workspaceId } });
        await db.operatorItem.deleteMany({ where: { id: { in: operatorItemIds } } });
        await db.user.deleteMany({ where: { id: { in: [requesterId, approverId, otherUserId] } } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] requestApproval persists a pending record AND emits an APPROVAL_REQUESTED audit event", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      expect(req.id).toBeTruthy();
      expect(req.approvalStatus).toBe("pending");

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("pending");
      // Before the fix this was 0 — a governed record created with no audit trail.
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_REQUESTED)).toBe(1);
    });

    it("[db] requestApproval is idempotent — a duplicate call returns the same record and emits no second audit", async () => {
      const operatorItemId = await seedOperatorItem();
      const first = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);
      const second = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      expect(second.id).toBe(first.id);
      const count = await db.approvalRequest.count({ where: { operatorItemId } });
      expect(count).toBe(1); // no duplicate row
      expect(await auditCount(first.id, AUDIT_EVENTS.APPROVAL_REQUESTED)).toBe(1); // no second creation audit
    });

    it("[db] approveOutcome moves pending → approved and emits an APPROVAL_GRANTED audit event", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      const result = await approveOutcome(workspaceId, req.id, approverId, "Looks good");
      expect(result.approved).toBe(true);

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("approved");
      expect(row?.approvalDecision).toBe("Looks good");
      expect(row?.approvedAt).toBeInstanceOf(Date);
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED)).toBe(1);
    });

    it("[db] rejectOutcome moves pending → rejected and emits an APPROVAL_DENIED audit event", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      const result = await rejectOutcome(workspaceId, req.id, approverId, "Too risky");
      expect(result.approved).toBe(false);
      expect(result.reason).toBe("Too risky");

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("rejected");
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_DENIED)).toBe(1);
    });

    it("[db] an approved request cannot be silently flipped to rejected (status guard)", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);
      await approveOutcome(workspaceId, req.id, approverId, "Approved");

      const flip = await rejectOutcome(workspaceId, req.id, approverId, "Trying to reverse");
      expect(flip.approved).toBe(false);
      expect(flip.reason).toMatch(/already approved/i);

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("approved"); // NOT flipped
      // No spurious denial audit for the blocked flip.
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_DENIED)).toBe(0);
    });

    it("[db] a rejected request cannot be silently flipped to approved (status guard)", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);
      await rejectOutcome(workspaceId, req.id, approverId, "Rejected");

      const flip = await approveOutcome(workspaceId, req.id, approverId, "Trying to approve after reject");
      expect(flip.approved).toBe(false);
      expect(flip.reason).toMatch(/cannot approve/i);

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("rejected"); // NOT flipped
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED)).toBe(0);
    });

    it("[db] repeated approve is idempotent — second approve does not re-stamp or emit a second audit", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      const first = await approveOutcome(workspaceId, req.id, approverId, "Approved");
      expect(first.approved).toBe(true);
      const afterFirst = await db.approvalRequest.findUnique({ where: { id: req.id } });
      const firstApprovedAt = afterFirst?.approvedAt?.getTime();

      const second = await approveOutcome(workspaceId, req.id, approverId, "Approved again");
      expect(second.approved).toBe(true);
      expect(second.reason).toMatch(/already recorded/i);

      const afterSecond = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(afterSecond?.approvedAt?.getTime()).toBe(firstApprovedAt); // not re-stamped
      expect(afterSecond?.approvalDecision).toBe("Approved"); // original decision preserved
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED)).toBe(1); // only one grant audit
    });

    it("[db] an unauthorized actor cannot approve or reject, mutates nothing, and emits no audit", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      const badApprove = await approveOutcome(workspaceId, req.id, otherUserId, "sneaky approve");
      expect(badApprove.approved).toBe(false);
      expect(badApprove.reason).toMatch(/not authorized/i);

      const badReject = await rejectOutcome(workspaceId, req.id, otherUserId, "sneaky reject");
      expect(badReject.approved).toBe(false);
      expect(badReject.reason).toMatch(/not authorized/i);

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(row?.approvalStatus).toBe("pending"); // untouched
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED)).toBe(0);
      expect(await auditCount(req.id, AUDIT_EVENTS.APPROVAL_DENIED)).toBe(0);
    });

    it("[db] invalid transition returns a controlled result, never a raw 500", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);
      await approveOutcome(workspaceId, req.id, approverId, "Approved");

      // Approving an already-approved (idempotent) and rejecting it (blocked) both resolve to
      // controlled results — no thrown PrismaClientValidationError / raw 500.
      await expect(approveOutcome(workspaceId, req.id, approverId, "again")).resolves.toMatchObject({ approved: true });
      await expect(rejectOutcome(workspaceId, req.id, approverId, "reverse")).resolves.toMatchObject({ approved: false });
      // A non-existent request id also resolves controlled (not-found), not a throw.
      await expect(approveOutcome(workspaceId, randomUUID(), approverId, "x")).resolves.toMatchObject({ approved: false });
    });

    it("[db] concurrent approve + reject on the same pending request: exactly one wins (compare-and-set)", async () => {
      const operatorItemId = await seedOperatorItem();
      const req = await requestApproval(workspaceId, operatorItemId, requesterId, approverId);

      // Fire both transitions concurrently. The status-guarded updateMany makes exactly one match the
      // still-pending row; the loser matches zero rows and returns a controlled non-transition result.
      const [approveRes, rejectRes] = await Promise.all([
        approveOutcome(workspaceId, req.id, approverId, "concurrent approve"),
        rejectOutcome(workspaceId, req.id, approverId, "concurrent reject"),
      ]);

      const row = await db.approvalRequest.findUnique({ where: { id: req.id } });
      expect(["approved", "rejected"]).toContain(row?.approvalStatus);

      const grants = await auditCount(req.id, AUDIT_EVENTS.APPROVAL_GRANTED);
      const denials = await auditCount(req.id, AUDIT_EVENTS.APPROVAL_DENIED);
      // Exactly one transition committed → exactly one transition audit total. Never both.
      expect(grants + denials).toBe(1);
      if (row?.approvalStatus === "approved") {
        expect(grants).toBe(1);
        expect(approveRes.approved).toBe(true);
      } else {
        expect(denials).toBe(1);
        expect(rejectRes.approved).toBe(false);
      }
    });
  }
);
