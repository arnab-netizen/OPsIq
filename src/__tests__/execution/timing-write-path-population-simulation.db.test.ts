/**
 * Timing write-path population → naturally-produced timing evidence — real-business DB simulation (laundry).
 *
 * Proves the timing fields are populated by REAL governed write paths (not only seeded test data):
 *   • applyTaskTransition(ACKNOWLEDGED → IN_PROGRESS) stamps delegated_tasks.work_started_at server-side.
 *   • acknowledgeEscalation sets escalations.acknowledged_at / acknowledged_by with an atomic audit,
 *     is idempotent, and fails closed on a wrong workspace.
 *   • naturally-shaped proof timing (work-start + submit) drives SUSPICIOUS_FAST_COMPLETION.
 *   • acknowledging one of two overdue escalations eases the MANAGER_IGNORES_ESCALATION pattern to a
 *     single ack-overdue; a NEW overdue escalation re-surfaces the pattern.
 *   • unauthorized acknowledgement is denied by requirePermission; cross-workspace data cannot
 *     contaminate signals; a clean workspace fabricates nothing; no fraud/negligence label; no hidden score.
 *
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { applyTaskTransition } from "@/services/execution/delegated-task.service";
import { acknowledgeEscalation } from "@/services/execution/escalation.service";
import { requirePermission } from "@/services/workspace/guided-execution-permissions.service";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";
import { DelegatedTaskStatus, TaskActorRole, type TaskActor } from "@/domain/execution/delegated-task";

const owner = randomUUID();
const mgr = randomUUID();
const staff = randomUUID();
const unauth = randomUUID();
const wsL = randomUUID();
const wsClean = randomUUID();
const bizL = randomUUID();
const taskId = randomUUID();
const esc1 = randomUUID();
const esc2 = randomUUID();
const esc3 = randomUUID();
const f1 = randomUUID();
const f2 = randomUUID();
const NOW = Date.now();
const H = 3_600_000;
const MIN = 60_000;
const NO_FRAUD = /\b(fraud|theft|thief|negligent|negligence|lazy)\b/i;

const assignee: TaskActor = { role: TaskActorRole.EMPLOYEE, isAssignee: true, canApproveCompletion: false, canReviewProof: false, canAssign: false };

async function baselineProof(submitter: string, ago: number) {
  await db.proof.create({ data: {
    id: randomUUID(), workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "ACCEPTED",
    submittedByUserId: submitter, reviewedByUserId: mgr, reviewedAt: new Date(NOW - ago * H),
    workStartedAt: new Date(NOW - ago * H - 60 * MIN), submittedAt: new Date(NOW - ago * H),
    createdAt: new Date(NOW - (ago + 2) * H), updatedAt: new Date(NOW - ago * H),
  } });
}
async function fastProof(id: string, durMin: number, ago: number) {
  await db.proof.create({ data: {
    id, workspaceId: wsL, businessId: bizL, taskId: randomUUID(), proofType: "wash", status: "NEEDS_HUMAN_REVIEW",
    submittedByUserId: staff, workStartedAt: new Date(NOW - ago * H - durMin * MIN), submittedAt: new Date(NOW - ago * H),
    createdAt: new Date(NOW - ago * H - durMin * MIN), updatedAt: new Date(NOW - ago * H),
  } });
}
async function openEscalation(id: string, ws = wsL) {
  await db.escalation.create({ data: {
    id, workspaceId: ws, category: "customer_complaint", severity: "HIGH", assignedTarget: mgr,
    status: "OPEN", dueAt: new Date(NOW - 4 * H), createdAt: new Date(NOW - 5 * H),
  } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Timing write-path population (laundry)", () => {
  beforeAll(async () => {
    for (const [id, nm] of [[owner, "Owner"], [mgr, "Mgr"], [staff, "Staff"], [unauth, "Unauth"]] as const) {
      await db.user.create({ data: { id, email: `tw-${id}@laundry.test`, name: nm, isActive: true, updatedAt: new Date(NOW) } });
    }
    for (const id of [wsL, wsClean]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `tw-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.clientAccount.create({ data: { id: wsL, workspaceId: wsL, name: "Sparkle Laundry Client", updatedAt: new Date(NOW) } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });

    // Membership: mgr granted the review permission; unauth is an active member WITHOUT the grant.
    for (const [uid, role] of [[owner, "owner"], [mgr, "manager"], [staff, "employee"], [unauth, "employee"]] as const) {
      await db.workspaceMembership.create({ data: { workspaceId: wsL, userId: uid, role, isActive: true, addedBy: owner } });
    }
    await db.userRoleAssignment.create({ data: { id: randomUUID(), userId: mgr, role: GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK, scope: "workspace", scopeId: wsL, isActive: true } });

    // A task the assignee has ACKNOWLEDGED, ready to start (drives the work-start write path).
    await db.delegatedTask.create({ data: { id: taskId, workspaceId: wsL, title: "Wash + press order #42", status: DelegatedTaskStatus.ACKNOWLEDGED, assignedUserId: staff, updatedAt: new Date(NOW) } });

    // Trusted baseline (5 accepted 60-min washes) + two implausibly fast washes by staff.
    for (let i = 0; i < 5; i++) await baselineProof(randomUUID(), 20 + i);
    await fastProof(f1, 4, 3);
    await fastProof(f2, 5, 2);

    // Two overdue, unacknowledged escalations assigned to the manager.
    await openEscalation(esc1);
    await openEscalation(esc2);
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.escalation.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.delegatedTask.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.userRoleAssignment.deleteMany({ where: { scopeId: wsL } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: wsL } });
    await db.auditEvent.deleteMany({ where: { workspaceId: wsL } });
    await db.proof.deleteMany({ where: { workspaceId: { in: [wsL, wsClean] } } });
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.clientAccount.deleteMany({ where: { id: wsL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsClean] } } });
    await db.user.deleteMany({ where: { id: { in: [owner, mgr, staff, unauth] } } });
  });

  it("applyTaskTransition(ACKNOWLEDGED → IN_PROGRESS) stamps a server-trusted work_started_at", async () => {
    const before = await db.delegatedTask.findUnique({ where: { id: taskId }, select: { workStartedAt: true, status: true } });
    expect(before?.workStartedAt).toBeNull();
    const to = await applyTaskTransition({
      task: { taskId, workspaceId: wsL, workOrderId: null, assignedUserId: staff, assignedRole: null, status: DelegatedTaskStatus.ACKNOWLEDGED, approvedBoundaryId: null, approvedBoundaryVersion: null, boundaryContentHash: null },
      to: DelegatedTaskStatus.IN_PROGRESS, actor: assignee, actorId: staff,
    });
    expect(to).toBe(DelegatedTaskStatus.IN_PROGRESS);
    const after = await db.delegatedTask.findUnique({ where: { id: taskId }, select: { workStartedAt: true, status: true } });
    expect(after?.status).toBe(DelegatedTaskStatus.IN_PROGRESS);
    expect(after?.workStartedAt).toBeInstanceOf(Date); // populated by the write path, not fabricated elsewhere
  });

  it("naturally-shaped proof timing drives SUSPICIOUS_FAST_COMPLETION (COMPLETE) with no fraud label", async () => {
    const out = await getOwnerNowView(wsL, bizL);
    const fast = out.timingEvidence?.fastCompletion;
    expect(fast?.status).toBe("SUSPICIOUS_FAST_COMPLETION_PATTERN");
    expect((fast?.supportingProofIds ?? []).sort()).toEqual([f1, f2].sort());
    expect(fast?.sourceCompleteness).toBe("COMPLETE");
    expect(JSON.stringify(out.timingEvidence)).not.toMatch(NO_FRAUD);
  });

  it("acknowledgeEscalation sets acknowledged_at + acknowledged_by + an audit; repeat is idempotent; wrong workspace fails closed", async () => {
    const r1 = await acknowledgeEscalation({ escalationId: esc1, workspaceId: wsL, acknowledgedBy: mgr });
    expect(r1).toEqual({ status: "ACKNOWLEDGED", alreadyAcknowledged: false });
    const row = await db.escalation.findUnique({ where: { id: esc1 }, select: { status: true, acknowledgedAt: true, acknowledgedBy: true } });
    expect(row?.status).toBe("ACKNOWLEDGED");
    expect(row?.acknowledgedAt).toBeInstanceOf(Date);
    expect(row?.acknowledgedBy).toBe(mgr);
    const audits = await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "escalation.acknowledged", entityId: esc1 } });
    expect(audits).toBe(1);

    const firstAt = row?.acknowledgedAt;
    const r2 = await acknowledgeEscalation({ escalationId: esc1, workspaceId: wsL, acknowledgedBy: mgr });
    expect(r2.alreadyAcknowledged).toBe(true); // idempotent no-op
    const row2 = await db.escalation.findUnique({ where: { id: esc1 }, select: { acknowledgedAt: true } });
    expect(row2?.acknowledgedAt?.getTime()).toBe(firstAt?.getTime()); // original ack time preserved
    const audits2 = await db.auditEvent.count({ where: { workspaceId: wsL, eventName: "escalation.acknowledged", entityId: esc1 } });
    expect(audits2).toBe(1); // no second audit on the no-op

    // Wrong workspace → no mutation.
    const rWrong = await acknowledgeEscalation({ escalationId: esc2, workspaceId: wsClean, acknowledgedBy: mgr });
    expect(rWrong.alreadyAcknowledged).toBe(true);
    const esc2row = await db.escalation.findUnique({ where: { id: esc2 }, select: { status: true } });
    expect(esc2row?.status).toBe("OPEN");
  });

  it("acknowledging one of two overdue escalations eases the pattern; a new overdue escalation re-surfaces it", async () => {
    // esc1 acknowledged (prev test), esc2 still OPEN+overdue → single ack-overdue, not a pattern.
    const eased = await getOwnerNowView(wsL, bizL);
    expect(eased.timingEvidence?.escalationTiming?.status).toBe("ESCALATION_ACK_OVERDUE");

    // A new overdue escalation → two unacknowledged for the manager → pattern re-surfaces.
    await openEscalation(esc3);
    const resurfaced = await getOwnerNowView(wsL, bizL);
    expect(resurfaced.timingEvidence?.escalationTiming?.status).toBe("MANAGER_IGNORES_ESCALATION_PATTERN");
    expect((resurfaced.timingEvidence?.escalationTiming?.supportingProofIds ?? []).sort()).toEqual([esc2, esc3].sort());
  });

  it("unauthorized acknowledgement is denied by requirePermission (fail-closed)", async () => {
    await expect(requirePermission(wsL, unauth, GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK)).rejects.toThrow();
    await expect(requirePermission(wsL, mgr, GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK)).resolves.toBeUndefined();
  });

  it("a clean workspace fabricates no timing signal and no cross-workspace bleed; no hidden score", async () => {
    const out = await getOwnerNowView(wsClean);
    expect(out.timingEvidence?.fastCompletion?.status).toBe("DATA_INSUFFICIENT");
    expect(out.timingEvidence?.escalationTiming?.status).toBe("DATA_INSUFFICIENT");
    expect(JSON.stringify(out.timingEvidence ?? {})).not.toMatch(/hiddenScore|staffScore/i);
  });
});
