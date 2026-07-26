/**
 * Bundle 3.5 — CustomerComplaint service lifecycle (PostgreSQL-backed).
 *
 * Proves:
 *  - createComplaint: idempotent create via idempotencyKey
 *  - triageComplaint: severity assignment, SLA computation, workspace enforcement
 *  - addRecoveryAction: TRIAGED→RECOVERING transition, recovery row persisted
 *  - resolveComplaint: RECOVERING→RESOLVED, resolutionSummary persisted
 *  - closeComplaint: RESOLVED→CLOSED final state
 *  - evaluateOverdueComplaintSlas: marks slaBreached on overdue triaged complaints
 *  - invalid transitions rejected with ValidationError
 *  - workspace isolation: cross-workspace complaint not accessible
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/bundle-3.5-complaint.db.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createComplaint,
  triageComplaint,
  addRecoveryAction,
  resolveComplaint,
  closeComplaint,
  evaluateOverdueComplaintSlas,
  getComplaint,
  listComplaints,
} from "@/services/owner-mode/customer-complaint.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const workspaceId = randomUUID();
const otherWorkspace = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Bundle 3.5 — CustomerComplaint lifecycle (ephemeral PostgreSQL)",
  () => {
    beforeAll(async () => {
      await db.user.upsert({
        where: { id: actor },
        update: {},
        create: {
          id: actor,
          email: `complaint-test-${actor}@test.local`,
          name: "ComplaintTestActor",
          isActive: true,
          updatedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      await db.complaintRecoveryAction.deleteMany({ where: { workspaceId } });
      await db.customerComplaint.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { actorId: actor } });
      await db.user.delete({ where: { id: actor } });
    });

    it("createComplaint: persists new complaint in OPEN state", async () => {
      const result = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-test-001",
        title: "Late delivery on order #1234",
        description: "Customer reports order not arrived after 7 days",
        channel: "EMAIL",
        reportedBy: "customer@example.com",
      });

      expect(result.id).toBeTruthy();
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.status).toBe("OPEN");
      expect(result.title).toBe("Late delivery on order #1234");
      expect(result.channel).toBe("EMAIL");
      expect(result.severity).toBeNull();
      expect(result.slaBreached).toBe(false);
      expect(result.recoveryActions).toHaveLength(0);
    });

    it("createComplaint: idempotent — same key returns same record without duplicate", async () => {
      const first = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-idempotency-001",
        title: "Product defect reported",
        description: "Defect description",
      });
      const second = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-idempotency-001",
        title: "Different title should not overwrite",
        description: "Different description",
      });
      expect(second.id).toBe(first.id);
      expect(second.title).toBe("Product defect reported");
    });

    it("triageComplaint: OPEN→TRIAGED, sets severity and computes SLA", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-triage-001",
        title: "Critical billing error",
        description: "Customer double-charged",
      });

      const now = new Date();
      const triaged = await triageComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        severity: "CRITICAL",
        triageNotes: "Internal note: double-charge confirmed",
        now,
      });

      expect(triaged.status).toBe("TRIAGED");
      expect(triaged.severity).toBe("CRITICAL");
      expect(triaged.slaDueAt).toBeTruthy();
      // CRITICAL SLA = 4 hours
      const slaDue = new Date(triaged.slaDueAt!);
      const diffHours = (slaDue.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(4, 0);
      // triageNotes excluded from DTO
      expect((triaged as Record<string, unknown>).triageNotes).toBeUndefined();
    });

    it("triageComplaint: rejects invalid severity with ValidationError", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-bad-severity-001",
        title: "Test complaint",
        description: "For severity rejection test",
      });

      await expect(
        triageComplaint({
          workspaceId,
          actorId: actor,
          complaintId: complaint.id,
          severity: "EXTREME",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("addRecoveryAction: TRIAGED→RECOVERING, recovery action row persisted", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-recovery-001",
        title: "Slow response complaint",
        description: "Customer waited 3 days for a response",
      });
      await triageComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        severity: "MEDIUM",
      });

      const withAction = await addRecoveryAction({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        description: "Send apology email and offer 10% refund",
        assignedTo: "support-team",
      });

      expect(withAction.status).toBe("RECOVERING");
      expect(withAction.recoveryActions).toHaveLength(1);
      expect(withAction.recoveryActions[0].description).toBe(
        "Send apology email and offer 10% refund"
      );
    });

    it("resolveComplaint: RECOVERING→RESOLVED, resolutionSummary persisted", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-resolve-001",
        title: "Quality issue",
        description: "Product below standard",
      });
      await triageComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        severity: "HIGH",
      });
      await addRecoveryAction({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        description: "Replace product",
      });

      const resolved = await resolveComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        resolutionSummary: "Replacement shipped and confirmed received by customer",
      });

      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.resolutionSummary).toBe(
        "Replacement shipped and confirmed received by customer"
      );
    });

    it("closeComplaint: RESOLVED→CLOSED, final state persisted", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-close-001",
        title: "Minor service delay",
        description: "Delivery delayed by 1 day",
      });
      await triageComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        severity: "LOW",
      });
      await resolveComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        resolutionSummary: "Customer acknowledged delay",
      });

      const closed = await closeComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
      });

      expect(closed.status).toBe("CLOSED");
    });

    it("closeComplaint: invalid transition from OPEN rejects with ValidationError", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-bad-close-001",
        title: "Cannot close from OPEN",
        description: "Invalid transition test",
      });

      await expect(
        closeComplaint({ workspaceId, actorId: actor, complaintId: complaint.id })
      ).rejects.toThrow(ValidationError);
    });

    it("evaluateOverdueComplaintSlas: marks slaBreached on past-SLA TRIAGED complaints", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-sla-breach-001",
        title: "SLA breach test complaint",
        description: "Must be marked breached",
      });

      // Triage with SLA in the past
      const past = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5h ago
      await triageComplaint({
        workspaceId,
        actorId: actor,
        complaintId: complaint.id,
        severity: "CRITICAL", // 4h SLA → already overdue from 5h ago
        now: past,
      });

      // Evaluator runs now (after SLA expiry)
      const result = await evaluateOverdueComplaintSlas({ workspaceId, actorId: actor });

      expect(result.breached).toContain(complaint.id);

      const refreshed = await getComplaint({ workspaceId, complaintId: complaint.id });
      expect(refreshed.slaBreached).toBe(true);
    });

    it("evaluateOverdueComplaintSlas: idempotent — second run does not double-count", async () => {
      const result1 = await evaluateOverdueComplaintSlas({ workspaceId, actorId: actor });
      const result2 = await evaluateOverdueComplaintSlas({ workspaceId, actorId: actor });
      // Second run should find no new breached (already marked)
      // IDs from first run must not appear in second run's output
      for (const id of result1.breached) {
        expect(result2.breached).not.toContain(id);
      }
    });

    it("listComplaints: workspace-scoped — only returns complaints for this workspace", async () => {
      // Create a complaint in otherWorkspace (no actor seed needed since no User FK on complaint)
      await db.customerComplaint.create({
        data: {
          workspaceId: otherWorkspace,
          idempotencyKey: "complaint-isolation-001",
          title: "Cross-workspace complaint",
          description: "Should not appear in workspaceId list",
          status: "OPEN",
          createdBy: actor,
        },
      });

      const list = await listComplaints({ workspaceId });
      const ids = list.map((c) => c.id);
      const otherList = await listComplaints({ workspaceId: otherWorkspace });

      // All items in workspaceId list belong to workspaceId
      for (const c of list) expect(c.workspaceId).toBe(workspaceId);
      // Items in otherWorkspace are NOT visible in workspaceId list
      for (const c of otherList) expect(ids).not.toContain(c.id);
    });

    it("getComplaint: cross-workspace access returns NotFoundError", async () => {
      const complaint = await createComplaint({
        workspaceId,
        actorId: actor,
        idempotencyKey: "complaint-ws-guard-001",
        title: "Workspace guard test",
        description: "Cross-workspace access must fail",
      });

      await expect(
        getComplaint({ workspaceId: otherWorkspace, complaintId: complaint.id })
      ).rejects.toThrow(NotFoundError);
    });

    it("audit events emitted: createComplaint, triageComplaint, addRecoveryAction, resolveComplaint, closeComplaint", async () => {
      const auditEvents = await db.auditEvent.findMany({
        where: {
          actorId: actor,
          workspaceId,
          eventName: {
            in: [
              "complaint.created",
              "complaint.triaged",
              "complaint.recovery_action_added",
              "complaint.resolved",
              "complaint.closed",
            ],
          },
        },
      });
      // At least one of each event type from this suite
      const names = auditEvents.map((e) => e.eventName);
      expect(names).toContain("complaint.created");
      expect(names).toContain("complaint.triaged");
      expect(names).toContain("complaint.recovery_action_added");
      expect(names).toContain("complaint.resolved");
      expect(names).toContain("complaint.closed");
    });
  }
);
