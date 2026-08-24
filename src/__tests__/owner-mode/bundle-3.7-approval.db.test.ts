/**
 * Bundle 3.7 — ApprovalResolution service lifecycle (PostgreSQL-backed).
 *
 * Proves:
 *  - createApproval: idempotent create, PENDING state, evidences empty
 *  - submitEvidence: evidence appended to approval, credibilityScore excluded from DTO
 *  - makeDecision APPROVED: status immutable after APPROVED
 *  - makeDecision REJECTED: rescopeTriggered=true, rescope signal fire-and-forget
 *  - makeDecision DEFERRED: DEFERRED still accepts new evidence
 *  - Re-decide on terminal (APPROVED/REJECTED) throws ValidationError
 *  - initiateAppeal: linked via appealOfId to prior REJECTED approval
 *  - Appeal on non-REJECTED status rejected with ValidationError
 *  - workspace isolation: cross-workspace approval not accessible
 *  - createApproval: rejects a businessId belonging to a different
 *    workspace (workspace-boundary hardening -- the UI's business
 *    selector is not authorization)
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/bundle-3.7-approval.db.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createApproval,
  submitEvidence,
  makeDecision,
  initiateAppeal,
  getApproval,
} from "@/services/owner-mode/approval-resolution.service";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { teardownOwnerBusiness } from "@/__tests__/test-helpers/owner-business-teardown";
import { ValidationError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const workspaceId = randomUUID();
const otherWorkspace = randomUUID();
let businessId: string;
let otherWorkspaceBusinessId: string;

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Bundle 3.7 — ApprovalResolution lifecycle (ephemeral PostgreSQL)",
  () => {
    beforeAll(async () => {
      await db.user.upsert({
        where: { id: actor },
        update: {},
        create: {
          id: actor,
          email: `approval-test-${actor}@test.local`,
          name: "ApprovalTestActor",
          isActive: true,
          updatedAt: new Date(),
        },
      });
      // createApproval() now enforces that businessId belongs to the
      // caller's own workspace -- every test below needs a REAL
      // OwnerBusiness row, not a bare randomUUID() standing in for one.
      const business = await createBusiness(
        { name: "Approval Test Business", businessType: "generic_local_service", currency: "INR" },
        actor,
        workspaceId
      );
      businessId = business.id;
      const otherBusiness = await createBusiness(
        { name: "Other Workspace Business", businessType: "generic_local_service", currency: "INR" },
        actor,
        otherWorkspace
      );
      otherWorkspaceBusinessId = otherBusiness.id;
    });

    afterAll(async () => {
      await db.ownerApprovalEvidence.deleteMany({ where: { workspaceId } });
      await db.ownerApprovalRequest.deleteMany({ where: { workspaceId } });
      await db.auditEvent.deleteMany({ where: { actorId: actor } });
      await teardownOwnerBusiness(businessId);
      await teardownOwnerBusiness(otherWorkspaceBusinessId);
      await db.user.delete({ where: { id: actor } });
    });

    it("createApproval: persists approval in PENDING state, empty evidence", async () => {
      const result = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-test-001",
        businessId,
        actionId: "action-budget-increase",
        actionDomain: "finance",
      });

      expect(result.id).toBeTruthy();
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.status).toBe("PENDING");
      expect(result.businessId).toBe(businessId);
      expect(result.evidences).toHaveLength(0);
      expect(result.rescopeTriggered).toBe(false);
      expect(result.decidedAt).toBeNull();
    });

    it("createApproval: idempotent — same key returns same record", async () => {
      const first = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-idempotency-001",
        businessId,
      });
      const second = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-idempotency-001",
        businessId: randomUUID(),
      });
      expect(second.id).toBe(first.id);
      expect(second.businessId).toBe(businessId);
    });

    it("createApproval: rejects a businessId belonging to a different workspace", async () => {
      await expect(
        createApproval({
          workspaceId,
          actorId: actor,
          idempotencyKey: "approval-cross-workspace-business-001",
          businessId: otherWorkspaceBusinessId,
        })
      ).rejects.toThrow(NotFoundError);

      // Confirm nothing was persisted -- the ownership check must block
      // the write, not merely reject a later read of it.
      const leaked = await db.ownerApprovalRequest.findFirst({
        where: { workspaceId, idempotencyKey: "approval-cross-workspace-business-001" },
      });
      expect(leaked).toBeNull();
    });

    it("createApproval: rejects a wholly nonexistent businessId", async () => {
      await expect(
        createApproval({
          workspaceId,
          actorId: actor,
          idempotencyKey: "approval-nonexistent-business-001",
          businessId: randomUUID(),
        })
      ).rejects.toThrow(NotFoundError);
    });

    it("submitEvidence: evidence appended (append-only), credibilityScore excluded from DTO", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-evidence-001",
        businessId,
        actionId: "action-supplier-change",
        actionDomain: "procurement",
      });

      const withEvidence = await submitEvidence({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        evidenceType: "document",
        description: "Supplier quote document showing 15% cost reduction",
        sourceUrl: "https://internal.opsiq/docs/quote-001",
        credibilityScore: 0.92,
      });

      expect(withEvidence.evidences).toHaveLength(1);
      expect(withEvidence.evidences[0].description).toBe(
        "Supplier quote document showing 15% cost reduction"
      );
      expect(withEvidence.evidences[0].evidenceType).toBe("document");
      // credibilityScore is internal — must not appear in the public DTO
      expect(
        (withEvidence.evidences[0] as Record<string, unknown>).credibilityScore
      ).toBeUndefined();
    });

    it("submitEvidence: multiple evidence items append without overwriting prior", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-multi-evidence-001",
        businessId,
      });

      await submitEvidence({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        evidenceType: "photo",
        description: "Before photo",
      });
      const withTwo = await submitEvidence({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        evidenceType: "data",
        description: "Numeric analysis spreadsheet",
      });

      expect(withTwo.evidences.length).toBeGreaterThanOrEqual(2);
    });

    it("submitEvidence: rejects invalid evidenceType with ValidationError", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-bad-evidence-type-001",
        businessId,
      });

      await expect(
        submitEvidence({
          workspaceId,
          actorId: actor,
          approvalId: approval.id,
          evidenceType: "video",
          description: "Video evidence",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("makeDecision APPROVED: status set, decidedAt persisted, terminal", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-approve-001",
        businessId,
        actionId: "action-hire-temp-staff",
        actionDomain: "hr",
      });

      const approved = await makeDecision({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        decision: "APPROVED",
        rationale: "Justified by seasonal demand increase",
      });

      expect(approved.status).toBe("APPROVED");
      expect(approved.rationale).toBe("Justified by seasonal demand increase");
      expect(approved.decidedAt).toBeTruthy();
      expect(approved.rescopeTriggered).toBe(false);
    });

    it("makeDecision: APPROVED status is terminal — re-decide throws ValidationError", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-immutable-001",
        businessId,
      });
      await makeDecision({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        decision: "APPROVED",
      });

      // Re-decide must fail
      await expect(
        makeDecision({
          workspaceId,
          actorId: actor,
          approvalId: approval.id,
          decision: "REJECTED",
          rationale: "Changed mind",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("makeDecision REJECTED: rescopeTriggered=true, rescope signal does not throw", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-reject-001",
        businessId,
        actionId: "action-expand-location",
        actionDomain: "strategy",
      });

      const rejected = await makeDecision({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        decision: "REJECTED",
        rationale: "Insufficient cash runway for expansion",
      });

      expect(rejected.status).toBe("REJECTED");
      expect(rejected.rescopeTriggered).toBe(true);
      expect(rejected.rationale).toBe("Insufficient cash runway for expansion");
    });

    it("makeDecision REJECTED: terminal — evidence submission blocked", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-reject-evidence-block-001",
        businessId,
      });
      await makeDecision({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        decision: "REJECTED",
      });

      await expect(
        submitEvidence({
          workspaceId,
          actorId: actor,
          approvalId: approval.id,
          evidenceType: "document",
          description: "Late evidence",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("makeDecision DEFERRED: DEFERRED still accepts new evidence", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-deferred-001",
        businessId,
      });
      await makeDecision({
        workspaceId,
        actorId: actor,
        approvalId: approval.id,
        decision: "DEFERRED",
        rationale: "Needs board review next quarter",
      });

      // Evidence on DEFERRED approval must be accepted
      await expect(
        submitEvidence({
          workspaceId,
          actorId: actor,
          approvalId: approval.id,
          evidenceType: "testimony",
          description: "CFO note supporting deferral",
        })
      ).resolves.toBeTruthy();
    });

    it("initiateAppeal: creates new PENDING approval linked via appealOfId to REJECTED", async () => {
      const original = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-pre-appeal-001",
        businessId,
        actionId: "action-capex-approval",
        actionDomain: "finance",
      });
      await makeDecision({
        workspaceId,
        actorId: actor,
        approvalId: original.id,
        decision: "REJECTED",
        rationale: "Too expensive at this stage",
      });

      const appeal = await initiateAppeal({
        workspaceId,
        actorId: actor,
        idempotencyKey: "appeal-001",
        priorApprovalId: original.id,
      });

      expect(appeal.status).toBe("PENDING");
      expect(appeal.appealOfId).toBe(original.id);
      expect(appeal.businessId).toBe(businessId);
    });

    it("initiateAppeal: blocked on non-REJECTED prior approval", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-pending-appeal-block-001",
        businessId,
      });

      await expect(
        initiateAppeal({
          workspaceId,
          actorId: actor,
          idempotencyKey: "appeal-blocked-001",
          priorApprovalId: approval.id,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("getApproval: cross-workspace access throws NotFoundError", async () => {
      const approval = await createApproval({
        workspaceId,
        actorId: actor,
        idempotencyKey: "approval-ws-guard-001",
        businessId,
      });

      await expect(
        getApproval({ workspaceId: otherWorkspace, approvalId: approval.id })
      ).rejects.toThrow(NotFoundError);
    });

    it("audit events emitted: create, evidence, decide, rescope, appeal", async () => {
      const auditEvents = await db.auditEvent.findMany({
        where: {
          actorId: actor,
          workspaceId,
          eventName: {
            in: [
              "approval.created",
              "approval.evidence_submitted",
              "approval.decided",
              "approval.action_rescoped",
              "approval.appeal_initiated",
            ],
          },
        },
      });
      const names = auditEvents.map((e) => e.eventName);
      expect(names).toContain("approval.created");
      expect(names).toContain("approval.evidence_submitted");
      expect(names).toContain("approval.decided");
      expect(names).toContain("approval.action_rescoped");
      expect(names).toContain("approval.appeal_initiated");
    });
  }
);
