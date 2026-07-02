/**
 * Delegated-task assignment (P1-A runtime-readiness: closes blocker B5's inert proof loop).
 *
 * Nothing in production previously CREATED a delegated task or a proof requirement, so `proofRequirementId` was never
 * set and the completion gate (`completeTask`) could never demand proof — staff could mark any task "done" with zero
 * evidence, and `POST /api/proof/submit` returned "Task not found" for every real user. This service is the missing
 * create path: an owner/manager assigns a task and, when proof is required, it creates the ProofRequirement + an
 * initial PENDING_SUBMISSION Proof row and wires `proofRequirementId` onto the task, so the EXISTING, proven FSM
 * (submitProof → reviewProof → completeTask) actually enforces proof. No FSM or gate change; workspace-scoped;
 * audited; the requirement+proof+task wiring is written in one transaction.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { DelegatedTaskStatus } from "@/domain/execution/delegated-task";
import { ProofStatus, ProofRiskLevel, type ProofType } from "@/domain/execution/proof";

export interface AssignTaskProofRequirement {
  proofType: ProofType;
  requiredFields?: string[];
  riskLevel?: ProofRiskLevel;
  reviewerRole?: string | null;
  ownerOverrideAllowed?: boolean;
}

export interface AssignTaskInput {
  workspaceId: string;
  actorId: string;
  title: string;
  description?: string | null;
  assignedUserId?: string | null;
  assignedRole?: string | null;
  dueAt?: Date | null;
  /** When present, the task is created PROOF_REQUIRED with a wired ProofRequirement + PENDING_SUBMISSION Proof. */
  requireProof?: AssignTaskProofRequirement | null;
}

export interface AssignedTask {
  taskId: string;
  workspaceId: string;
  status: DelegatedTaskStatus;
  proofRequirementId: string | null;
  proofId: string | null;
}

interface AssignTx {
  delegatedTask: { create(a: unknown): Promise<unknown>; update(a: unknown): Promise<unknown> };
  proofRequirement: { create(a: unknown): Promise<unknown> };
  proof: { create(a: unknown): Promise<unknown> };
}
export interface AssignTaskDeps {
  db: { $transaction<T>(fn: (tx: AssignTx) => Promise<T>): Promise<T> };
  uuid: () => string;
  now: () => Date;
}

async function resolveDeps(): Promise<AssignTaskDeps> {
  return { db: db as unknown as AssignTaskDeps["db"], uuid: () => randomUUID(), now: () => new Date() };
}

/** Create + assign a delegated task, wiring a proof requirement when proof is demanded. Workspace-scoped; audited. */
export async function assignDelegatedTask(input: AssignTaskInput, injected?: AssignTaskDeps): Promise<AssignedTask> {
  const deps = injected ?? (await resolveDeps());
  const now = deps.now();
  const taskId = deps.uuid();
  const rp = input.requireProof ?? null;

  const wired = await deps.db.$transaction(async (tx) => {
    await tx.delegatedTask.create({
      data: {
        id: taskId,
        workspaceId: input.workspaceId,
        title: input.title,
        description: input.description ?? null,
        status: rp ? DelegatedTaskStatus.PROOF_REQUIRED : DelegatedTaskStatus.ASSIGNED,
        assignedUserId: input.assignedUserId ?? null,
        assignedRole: input.assignedRole ?? null,
        dueAt: input.dueAt ?? null,
        createdByUserId: input.actorId,
        updatedAt: now,
      },
    });

    if (!rp) return { proofRequirementId: null as string | null, proofId: null as string | null };

    const proofRequirementId = deps.uuid();
    const proofId = deps.uuid();
    await tx.proofRequirement.create({
      data: {
        id: proofRequirementId,
        workspaceId: input.workspaceId,
        taskId,
        proofType: rp.proofType,
        requiredFields: rp.requiredFields ?? [],
        riskLevel: rp.riskLevel ?? ProofRiskLevel.LOW,
        reviewerRole: rp.reviewerRole ?? null,
        ownerOverrideAllowed: rp.ownerOverrideAllowed ?? false,
      },
    });
    await tx.proof.create({
      data: {
        id: proofId,
        workspaceId: input.workspaceId,
        taskId,
        proofRequirementId,
        proofType: rp.proofType,
        status: ProofStatus.PENDING_SUBMISSION,
        updatedAt: now,
      },
    });
    // Wire the requirement onto the task so completeTask's gate (proofRequirementId != null) fires.
    await tx.delegatedTask.update({ where: { id: taskId }, data: { proofRequirementId, updatedAt: now } });
    return { proofRequirementId, proofId };
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.TASK_ASSIGNED,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    entityType: "delegated_task",
    entityId: taskId,
    payload: {
      title: input.title,
      proofRequired: rp != null,
      assignedUserId: input.assignedUserId ?? null,
      proofRequirementId: wired.proofRequirementId,
    },
  });

  return {
    taskId,
    workspaceId: input.workspaceId,
    status: rp ? DelegatedTaskStatus.PROOF_REQUIRED : DelegatedTaskStatus.ASSIGNED,
    proofRequirementId: wired.proofRequirementId,
    proofId: wired.proofId,
  };
}
