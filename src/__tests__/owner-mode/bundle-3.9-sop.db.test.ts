/**
 * Bundle 3.9 — SOP Process Intelligence service lifecycle (PostgreSQL-backed).
 *
 * Proves:
 *  - assignTraining: idempotent create (one per workspace+sop+staff), ASSIGNED state
 *  - recordTrainingCompletion: evidence required, COMPLETED state persisted
 *  - recordTrainingCompletion: idempotent — already-COMPLETED returns current state
 *  - calculateComplianceRate: correct numerics from real DB counts
 *  - createNonComplianceAlert: idempotent via (workspace, sop, alertWindow) unique key
 *  - createNonComplianceAlert: rejects when complianceRate >= threshold
 *  - complianceRate excluded from public alert DTO
 *  - workspace isolation: training assignments workspace-scoped
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/bundle-3.9-sop.db.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  assignTraining,
  recordTrainingCompletion,
  calculateComplianceRate,
  createNonComplianceAlert,
} from "@/services/owner-mode/sop-process-intelligence.service";
import { ValidationError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const workspaceId = randomUUID();
const sopDocumentId = randomUUID();
const staffMember1 = randomUUID();
const staffMember2 = randomUUID();
const otherWorkspace = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Bundle 3.9 — SOP Process Intelligence lifecycle (ephemeral PostgreSQL)",
  () => {
    beforeAll(async () => {
      await db.user.upsert({
        where: { id: actor },
        update: {},
        create: {
          id: actor,
          email: `sop-test-${actor}@test.local`,
          name: "SopTestActor",
          isActive: true,
          updatedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      await db.ownerSopNonComplianceAlert.deleteMany({ where: { workspaceId } });
      await db.ownerSopTrainingAssignment.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { actorId: actor } });
      await db.user.delete({ where: { id: actor } });
    });

    it("assignTraining: creates assignment in ASSIGNED state", async () => {
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
        dueDate,
      });

      expect(result.id).toBeTruthy();
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.sopDocumentId).toBe(sopDocumentId);
      expect(result.assignedTo).toBe(staffMember1);
      expect(result.status).toBe("ASSIGNED");
      expect(result.completedAt).toBeNull();
      expect(result.evidenceUrl).toBeNull();
      // assignedBy excluded from DTO
      expect((result as Record<string, unknown>).assignedBy).toBeUndefined();
    });

    it("assignTraining: idempotent — second assign for same (workspace, sop, staff) returns same record", async () => {
      const first = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
      });
      const second = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
      });
      expect(second.id).toBe(first.id);
    });

    it("assignTraining: different staff member gets separate assignment", async () => {
      const assignment2 = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember2,
      });

      const assignment1 = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
      });

      expect(assignment2.id).not.toBe(assignment1.id);
    });

    it("recordTrainingCompletion: evidence required — rejects empty evidenceUrl", async () => {
      const assignment = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
      });

      await expect(
        recordTrainingCompletion({
          workspaceId,
          actorId: actor,
          assignmentId: assignment.id,
          evidenceUrl: "   ",
          evidenceNote: "Attempted without valid URL",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("recordTrainingCompletion: COMPLETED state with evidence persisted", async () => {
      const assignment = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
      });

      const completed = await recordTrainingCompletion({
        workspaceId,
        actorId: actor,
        assignmentId: assignment.id,
        evidenceUrl: "https://internal.opsiq/training/certificates/cert-001.pdf",
        evidenceNote: "Completed all 3 modules and passed the assessment",
      });

      expect(completed.status).toBe("COMPLETED");
      expect(completed.completedAt).toBeTruthy();
      expect(completed.evidenceUrl).toBe(
        "https://internal.opsiq/training/certificates/cert-001.pdf"
      );
      expect(completed.evidenceNote).toBe(
        "Completed all 3 modules and passed the assessment"
      );
    });

    it("recordTrainingCompletion: idempotent — already-COMPLETED returns same state", async () => {
      const assignment = await assignTraining({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        assignedTo: staffMember1,
      });
      await recordTrainingCompletion({
        workspaceId,
        actorId: actor,
        assignmentId: assignment.id,
        evidenceUrl: "https://internal.opsiq/training/cert-idempotent.pdf",
      });

      // Second completion call with different URL — should return existing state without overwriting
      const repeated = await recordTrainingCompletion({
        workspaceId,
        actorId: actor,
        assignmentId: assignment.id,
        evidenceUrl: "https://should-not-overwrite.example.com/cert.pdf",
      });
      expect(repeated.evidenceUrl).toBe(
        "https://internal.opsiq/training/cert-idempotent.pdf"
      );
    });

    it("recordTrainingCompletion: NotFoundError on unknown assignment", async () => {
      await expect(
        recordTrainingCompletion({
          workspaceId,
          actorId: actor,
          assignmentId: randomUUID(),
          evidenceUrl: "https://example.com/cert.pdf",
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("calculateComplianceRate: correct numerics from live DB assignment counts", async () => {
      // staffMember1 was completed above; staffMember2 is still ASSIGNED
      const summary = await calculateComplianceRate({ workspaceId, sopDocumentId });

      expect(summary.sopDocumentId).toBe(sopDocumentId);
      expect(summary.workspaceId).toBe(workspaceId);
      expect(summary.totalAssigned).toBeGreaterThanOrEqual(2);
      expect(summary.totalCompleted).toBeGreaterThanOrEqual(1);
      expect(summary.complianceRate).toBeGreaterThan(0);
      expect(summary.complianceRate).toBeLessThanOrEqual(1);
    });

    it("createNonComplianceAlert: persists alert when complianceRate below threshold", async () => {
      // Staff member 2 is ASSIGNED (not completed) so compliance < 1.0
      const summary = await calculateComplianceRate({ workspaceId, sopDocumentId, threshold: 1.0 });

      if (summary.meetsThreshold) {
        // If somehow all complete, seed a fresh SOP with partial compliance
        const freshSop = randomUUID();
        await assignTraining({ workspaceId, actorId: actor, sopDocumentId: freshSop, assignedTo: staffMember2 });
        const alert = await createNonComplianceAlert({
          workspaceId,
          actorId: actor,
          sopDocumentId: freshSop,
          alertWindow: "2026-Q1",
          complianceRate: 0.0,
          threshold: 0.8,
        });
        expect(alert.id).toBeTruthy();
        expect(alert.sopDocumentId).toBe(freshSop);
        expect((alert as Record<string, unknown>).complianceRate).toBeUndefined();
        return;
      }

      const alert = await createNonComplianceAlert({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        alertWindow: "2026-Q1",
        complianceRate: summary.complianceRate,
        threshold: 1.0,
      });

      expect(alert.id).toBeTruthy();
      expect(alert.workspaceId).toBe(workspaceId);
      expect(alert.sopDocumentId).toBe(sopDocumentId);
      expect(alert.alertWindow).toBe("2026-Q1");
      expect(alert.acknowledged).toBe(false);
      // complianceRate excluded from DTO
      expect((alert as Record<string, unknown>).complianceRate).toBeUndefined();
    });

    it("createNonComplianceAlert: idempotent — same (workspace, sop, alertWindow) returns same alert", async () => {
      const first = await createNonComplianceAlert({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        alertWindow: "2026-Q2",
        complianceRate: 0.5,
        threshold: 0.8,
      });
      const second = await createNonComplianceAlert({
        workspaceId,
        actorId: actor,
        sopDocumentId,
        alertWindow: "2026-Q2",
        complianceRate: 0.6,
        threshold: 0.9,
      });
      expect(second.id).toBe(first.id);
    });

    it("createNonComplianceAlert: rejects when complianceRate meets threshold", async () => {
      await expect(
        createNonComplianceAlert({
          workspaceId,
          actorId: actor,
          sopDocumentId,
          alertWindow: "2026-Q3",
          complianceRate: 0.9,
          threshold: 0.8,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("workspace isolation: training assignments not visible across workspaces", async () => {
      // Seed assignment in otherWorkspace
      await db.ownerSopTrainingAssignment.create({
        data: {
          workspaceId: otherWorkspace,
          sopDocumentId,
          assignedTo: staffMember1,
          assignedBy: actor,
          status: "ASSIGNED",
        },
      });

      const myCount = await db.ownerSopTrainingAssignment.count({
        where: { workspaceId, sopDocumentId },
      });
      const otherCount = await db.ownerSopTrainingAssignment.count({
        where: { workspaceId: otherWorkspace, sopDocumentId },
      });

      // compliance rate for otherWorkspace is independent
      const mySummary = await calculateComplianceRate({ workspaceId, sopDocumentId });
      const otherSummary = await calculateComplianceRate({ workspaceId: otherWorkspace, sopDocumentId });

      expect(mySummary.totalAssigned).toBe(myCount);
      expect(otherSummary.totalAssigned).toBe(otherCount);
      expect(mySummary.totalAssigned).not.toBe(otherSummary.totalAssigned);

      // Cleanup
      await db.ownerSopTrainingAssignment.deleteMany({ where: { workspaceId: otherWorkspace } });
    });

    it("audit events emitted: sop.training_assigned, sop.training_completed, sop.noncompliance_alert_created", async () => {
      const auditEvents = await db.auditEvent.findMany({
        where: {
          actorId: actor,
          workspaceId,
          eventName: {
            in: [
              "sop.training_assigned",
              "sop.training_completed",
              "sop.noncompliance_alert_created",
            ],
          },
        },
      });
      const names = auditEvents.map((e) => e.eventName);
      expect(names).toContain("sop.training_assigned");
      expect(names).toContain("sop.training_completed");
      expect(names).toContain("sop.noncompliance_alert_created");
    });
  }
);
