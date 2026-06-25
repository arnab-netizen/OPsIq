/**
 * Proof submission + review service (Slice 8, IO).
 *
 * Submission is validated (type + required fields) and duplicate-hash-flagged
 * before the proof moves to SUBMITTED; an employee may only submit for their own
 * task. Review (accept/reject/dispute/resubmit) requires a human reviewer; the
 * status change + audit are written in ONE transaction, so a failed audit write
 * prevents the final proof status update (Slice 8 rule). The Prisma Proof table is
 * MIGRATION_LANE_PENDING; this service uses an injected store and is DI-proven.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { v4 as uuid } from "uuid";
import {
  ProofActor,
  ProofRequirement,
  ProofStatus,
  ProofSubmission,
  isDuplicateFileHash,
  planProofTransition,
  validateProofSubmission,
} from "@/domain/execution/proof";

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
}
interface ProofDelegate {
  updateMany(args: QueryArgs): Promise<{ count: number }>;
}
interface AuditCreateDelegate {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
}
export interface ProofTx {
  proof: ProofDelegate;
  auditEvent: AuditCreateDelegate;
}
export interface ProofDb extends ProofTx {
  $transaction<T>(fn: (tx: ProofTx) => Promise<T>): Promise<T>;
}
export interface ProofDeps {
  db: ProofDb;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<ProofDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ProofDb, now: () => new Date() };
}

export class ProofValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Proof submission invalid: ${issues.join("; ")}`);
    this.name = "ProofValidationError";
    this.issues = issues;
  }
}
export class ProofTransitionNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofTransitionNotAllowedError";
  }
}
export class ProofConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofConflictError";
  }
}

export interface SubmitProofCommand {
  proofId: string;
  taskId: string;
  workspaceId: string;
  fromStatus: ProofStatus;
  requirement: ProofRequirement;
  submission: ProofSubmission;
  actor: ProofActor;
  /** Existing file hashes in the workspace for duplicate detection. */
  existingHashes?: ReadonlySet<string>;
}

export interface SubmitProofResult {
  status: ProofStatus;
  duplicateFlagged: boolean;
}

/** Validate + authorize + record a proof submission. */
export async function submitProof(
  command: SubmitProofCommand,
  injected?: ProofDeps
): Promise<SubmitProofResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const { requirement, submission, actor } = command;

  const validation = validateProofSubmission(requirement, submission);
  if (!validation.ok) {
    throw new ProofValidationError(validation.issues);
  }

  const decision = planProofTransition(command.fromStatus, ProofStatus.SUBMITTED, actor);
  if (!decision.allowed) {
    throw new ProofTransitionNotAllowedError(decision.reason);
  }

  const duplicateFlagged = isDuplicateFileHash(
    submission.fileHash,
    command.existingHashes ?? new Set()
  );

  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    const updated = await tx.proof.updateMany({
      where: {
        id: command.proofId,
        workspaceId: command.workspaceId,
        status: command.fromStatus,
      },
      data: {
        status: ProofStatus.SUBMITTED,
        submittedByUserId: submission.submittedByUserId,
        fileHash: submission.fileHash ?? null,
        duplicateFlagged,
        submittedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new ProofConflictError(
        `Proof ${command.proofId} not in expected state ${command.fromStatus}; submission rejected.`
      );
    }
    await tx.auditEvent.create({
      data: {
        id: uuid(),
        workspaceId: command.workspaceId,
        eventName: AUDIT_EVENTS.PROOF_SUBMITTED,
        actorId: submission.submittedByUserId,
        actorType: "user",
        entityType: "proof",
        entityId: command.proofId,
        payload: {
          taskId: command.taskId,
          proofType: submission.proofType,
          duplicateFlagged,
        },
        visibility: "internal",
        occurredAt: now,
      },
    });
  });

  return { status: ProofStatus.SUBMITTED, duplicateFlagged };
}

export interface ReviewProofCommand {
  proofId: string;
  workspaceId: string;
  fromStatus: ProofStatus;
  to: ProofStatus;
  actor: ProofActor;
  actorId: string;
  /** Required when `to` is REJECTED. */
  reason?: string;
}

/** Authorize + apply a proof review outcome atomically (audit failure rolls back). */
export async function reviewProof(
  command: ReviewProofCommand,
  injected?: ProofDeps
): Promise<ProofStatus> {
  const deps = injected ?? (await resolveDefaultDeps());
  const decision = planProofTransition(command.fromStatus, command.to, command.actor, {
    reason: command.reason,
  });
  if (!decision.allowed) {
    throw new ProofTransitionNotAllowedError(decision.reason);
  }

  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    const updated = await tx.proof.updateMany({
      where: {
        id: command.proofId,
        workspaceId: command.workspaceId,
        status: command.fromStatus,
      },
      data: {
        status: command.to,
        reviewReason: command.reason ?? null,
        reviewedByUserId: command.actorId,
        reviewedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new ProofConflictError(
        `Proof ${command.proofId} not in expected state ${command.fromStatus}; review not applied.`
      );
    }
    // Audit INSIDE the tx: a failed proof-review audit write prevents the final
    // proof status update (Slice 8 rule).
    await tx.auditEvent.create({
      data: {
        id: uuid(),
        workspaceId: command.workspaceId,
        eventName: AUDIT_EVENTS.PROOF_REVIEWED,
        actorId: command.actorId,
        actorType: "user",
        entityType: "proof",
        entityId: command.proofId,
        payload: {
          fromStatus: command.fromStatus,
          toStatus: command.to,
          reason: command.reason ?? null,
        },
        visibility: "internal",
        occurredAt: now,
      },
    });
  });

  return command.to;
}
