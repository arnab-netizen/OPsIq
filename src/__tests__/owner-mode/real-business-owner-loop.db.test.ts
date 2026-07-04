/**
 * REAL BUSINESS SIMULATION [db] — owner runs a laundry/dry-cleaning business on OpsIQ.
 *
 * Exercises the governance spine end-to-end against the real DB and real services:
 *   1. Owner delegates a proof-required task to a staff member.
 *   2. Staff WITHOUT evidence: the task cannot be completed (proof gate blocks).
 *   3. Staff submits WEAK/forged proof: the AI precheck (EVID-01) routes it to
 *      NEEDS_HUMAN_REVIEW — it is never mistaken for verified, and completion stays blocked.
 *   4. Staff submits GENUINE proof; the owner (not the performer — separation of duty)
 *      reviews and ACCEPTS it; the proof then CLEARS the completion gate.
 *   5. MAJOR CLIENT LOSS: archiving the client routes the active engagement into real
 *      governed re-evaluation (REEVAL-01) and writes the re-eval audit event.
 *   6. OWNER NON-COMPLIANCE: a critical recommendation's action left overdue is detected
 *      and routed into governed re-evaluation.
 *
 * Nothing here is mocked — the assertions are read back from the database.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/real-business-owner-loop.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { intakeProofSubmission } from "@/services/execution/proof-intake.service";
import { reviewProof } from "@/services/execution/proof.service";
import { completeTask, TaskCompletionBlockedError } from "@/services/execution/task-completion.service";
import { archiveClient } from "@/services/client-account";
import { detectHighPriorityOverdueActions } from "@/services/escalation";
import {
  TaskActorRole,
  DelegatedTaskStatus,
  type TaskActor,
} from "@/domain/execution/delegated-task";
import {
  ProofType as PType,
  ProofRiskLevel as PRisk,
  ProofStatus as PStatus,
} from "@/domain/execution/proof";
import { AiProofPrecheckOutcome } from "@/domain/execution/proof-precheck";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const ownerId = randomUUID();
const staffId = randomUUID();
const ws = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");
const GOOD_HASH = "a".repeat(64);
const authCtx = { verifiedActorId: ownerId, session: { user: { id: ownerId } } } as any;

const ownerActor: TaskActor = {
  role: TaskActorRole.OWNER,
  isAssignee: false,
  canApproveCompletion: true,
  canReviewProof: true,
  canAssign: true,
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] REAL BUSINESS SIMULATION — owner-mode governance loop", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: ownerId, email: `owner-${ownerId}@laundry.test`, name: "Owner", isActive: true, updatedAt: NOW } });
    await db.user.create({ data: { id: staffId, email: `staff-${staffId}@laundry.test`, name: "Staff", isActive: true, updatedAt: NOW } });
    await db.workspace.create({ data: { id: ws, name: "Sparkle Laundry", slug: `sl-${ws.slice(0, 8)}`, createdBy: ownerId } });
    await db.workspaceMembership.create({ data: { userId: ownerId, workspaceId: ws, role: "owner", isActive: true } });
    await db.workspaceMembership.create({ data: { userId: staffId, workspaceId: ws, role: "member", isActive: true } });
    await db.clientAccount.create({ data: { id: clientId, workspaceId: ws, name: "Acme Hotels (contract)", updatedAt: NOW } });
    await db.engagement.create({ data: { id: engagementId, workspaceId: ws, code: `ENG-${engagementId.slice(0, 8)}`, title: "Reduce rewash rate", clientId, serviceTier: "standard", engagementMode: "advisory", status: "active", updatedAt: NOW } });
  });

  afterAll(async () => {
    await db.action.deleteMany({ where: { engagementId } });
    await db.recommendation.deleteMany({ where: { engagementId } });
    await db.proof.deleteMany({ where: { workspaceId: ws } });
    await db.proofRequirement.deleteMany({ where: { workspaceId: ws } });
    await db.delegatedTask.deleteMany({ where: { workspaceId: ws } });
    await db.idempotencyRecord.deleteMany({ where: { workspaceId: ws } }).catch(() => undefined);
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: ws } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
  });

  it("staff WITHOUT evidence cannot complete a proof-required task (proof gate holds)", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: ownerId, title: "Deep-clean machine 3", assignedUserId: staffId,
      requireProof: { proofType: PType.PHOTO, requiredFields: ["note"], riskLevel: PRisk.LOW },
    });
    // No proof accepted yet → completion is blocked with an explicit governed reason.
    await expect(
      completeTask({ taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: ownerId })
    ).rejects.toBeInstanceOf(TaskCompletionBlockedError);
    const blocked = await db.auditEvent.findFirst({ where: { workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_TASK_COMPLETION_BLOCKED } });
    expect(blocked).toBeTruthy();
  });

  it("WEAK/forged proof is screened to human review (never verified) and keeps completion blocked", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: ownerId, title: "Sort returns", assignedUserId: staffId,
      requireProof: { proofType: PType.PHOTO, requiredFields: ["note"], riskLevel: PRisk.LOW },
    });
    const res = await intakeProofSubmission({
      workspaceId: ws, actorId: staffId, taskId: t.taskId,
      submission: { proofType: PType.PHOTO, fields: { note: "did it" }, fileHash: "totally-forged" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.precheckOutcome).toBe(AiProofPrecheckOutcome.POSSIBLE_TAMPER_RISK);
      expect(res.status).toBe(PStatus.NEEDS_HUMAN_REVIEW);
      expect(res.status).not.toBe(PStatus.ACCEPTED);
    }
    // Still cannot complete — a screened-but-unaccepted proof does not clear the gate.
    await expect(
      completeTask({ taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: ownerId })
    ).rejects.toBeInstanceOf(TaskCompletionBlockedError);
  });

  it("GENUINE proof: owner (not the performer) accepts it and the completion gate clears", async () => {
    const t = await assignDelegatedTask({
      workspaceId: ws, actorId: ownerId, title: "Log detergent restock", assignedUserId: staffId,
      requireProof: { proofType: PType.PHOTO, requiredFields: ["note"], riskLevel: PRisk.LOW },
    });
    const res = await intakeProofSubmission({
      workspaceId: ws, actorId: staffId, taskId: t.taskId,
      submission: { proofType: PType.PHOTO, fields: { note: "restocked 4 units" }, fileHash: GOOD_HASH },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.status).toBe(PStatus.AI_PRECHECK_PASSED);

    // Separation of duty: the STAFF submitter may not accept their own proof.
    await expect(
      reviewProof({ proofId: t.proofId!, workspaceId: ws, fromStatus: PStatus.AI_PRECHECK_PASSED, to: PStatus.ACCEPTED, actor: { role: TaskActorRole.EMPLOYEE, isAssignee: true, canReviewProof: false } as any, actorId: staffId })
    ).rejects.toThrow();

    // The OWNER accepts it — a human, not the AI precheck, performs final acceptance.
    const accepted = await reviewProof({ proofId: t.proofId!, workspaceId: ws, fromStatus: PStatus.AI_PRECHECK_PASSED, to: PStatus.ACCEPTED, actor: { role: TaskActorRole.OWNER, isAssignee: false, canReviewProof: true } as any, actorId: ownerId });
    expect(accepted).toBe(PStatus.ACCEPTED);

    // Guided-execution would move the task to review; represent that pre-position (not under test).
    await db.delegatedTask.update({ where: { id: t.taskId }, data: { status: DelegatedTaskStatus.COMPLETED_PENDING_REVIEW } });

    // With an accepted, non-duplicate, fresh proof the owner can now approve completion.
    const status = await completeTask({ taskId: t.taskId, workspaceId: ws, actor: ownerActor, actorId: ownerId, now: () => NOW });
    expect(status).toBe(DelegatedTaskStatus.APPROVED_COMPLETE);
  });

  it("MAJOR CLIENT LOSS: archiving the client routes the active engagement into real re-evaluation", async () => {
    await archiveClient(clientId, authCtx, 1, ws);
    expect((await db.clientAccount.findUnique({ where: { id: clientId } }))?.status).toBe("archived");

    // The real re-evaluation engine ran and wrote its governed audit event (CONDITION_CHANGED)
    // for the archived client, correlation-tagged as a major client loss.
    const reeval = await db.auditEvent.findFirst({
      where: { workspaceId: ws, eventName: AUDIT_EVENTS.CONDITION_CHANGED, entityType: "client_account", entityId: clientId },
    });
    expect(reeval).toBeTruthy();
  });

  it("OWNER NON-COMPLIANCE: an overdue critical action is detected and re-evaluated", async () => {
    // A critical recommendation with an action the owner left overdue.
    const rec = await db.recommendation.create({
      data: { id: randomUUID(), engagementId, workspaceId: ws, title: "Fix boiler leak", priority: "critical", status: "approved", updatedAt: NOW },
    });
    await db.action.create({
      data: {
        id: randomUUID(), engagementId, recommendationId: rec.id, title: "Repair boiler", status: "in_progress",
        dueAt: new Date("2026-06-01T00:00:00Z"), updatedAt: NOW,
      },
    });

    const alert = await detectHighPriorityOverdueActions(engagementId, authCtx, ws);
    expect(alert).toBeTruthy();
    expect(alert!.severity).toBe("critical");

    // The escalation audit event is the durable proof the detection fired...
    const esc = await db.auditEvent.findFirst({
      where: { workspaceId: ws, eventName: AUDIT_EVENTS.ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE },
    });
    expect(esc).toBeTruthy();

    // ...and owner non-compliance was routed into governed re-evaluation (CONDITION_CHANGED
    // on the engagement, correlation-tagged owner-non-compliance).
    const reeval = await db.auditEvent.findFirst({
      where: { workspaceId: ws, eventName: AUDIT_EVENTS.CONDITION_CHANGED, entityType: "engagement", entityId: engagementId },
    });
    expect(reeval).toBeTruthy();
  });
});
