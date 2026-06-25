/**
 * AI proof precheck service (Slice 11, IO).
 *
 * Runs the deterministic precheck and advances a SUBMITTED proof to an
 * AI_PRECHECK_* / NEEDS_HUMAN_REVIEW status via a SYSTEM-role transition (which
 * the proof FSM forbids from ever reaching ACCEPTED), writing a durable AI-ledger
 * record. The Prisma Proof table exists (migration lane); this service is also
 * DI-proven. Final acceptance always requires a human reviewer (Slice 8).
 */

import { v4 as uuid } from "uuid";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  ProofActor,
  ProofRequirement,
  ProofStatus,
  ProofSubmission,
  planProofTransition,
} from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import {
  AiProofPrecheckOutcome,
  PrecheckSignals,
  computeProofPrecheck,
  mapPrecheckToProofStatus,
} from "@/domain/execution/proof-precheck";

const SYSTEM_ACTOR: ProofActor = {
  role: TaskActorRole.SYSTEM,
  isAssignee: false,
  canReviewProof: false,
};

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
export interface PrecheckTx {
  proof: ProofDelegate;
  auditEvent: AuditCreateDelegate;
}
export interface PrecheckDb extends PrecheckTx {
  $transaction<T>(fn: (tx: PrecheckTx) => Promise<T>): Promise<T>;
}
export interface PrecheckDeps {
  db: PrecheckDb;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<PrecheckDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as PrecheckDb, now: () => new Date() };
}

export class PrecheckConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrecheckConflictError";
  }
}

export interface RunPrecheckCommand {
  proofId: string;
  workspaceId: string;
  taskId?: string | null;
  requirement: ProofRequirement;
  submission: ProofSubmission;
  signals?: PrecheckSignals;
}

export interface PrecheckResult {
  outcome: AiProofPrecheckOutcome;
  status: ProofStatus;
  ledgerId: string;
}

/**
 * Run the AI precheck on a SUBMITTED proof, advance its status (never to
 * ACCEPTED), and write a durable AI-ledger record. Concurrency/workspace guarded.
 */
export async function runProofPrecheck(
  command: RunPrecheckCommand,
  injected?: PrecheckDeps
): Promise<PrecheckResult> {
  const deps = injected ?? (await resolveDefaultDeps());

  const outcome = computeProofPrecheck(
    command.requirement,
    command.submission,
    command.signals ?? {}
  );
  const target = mapPrecheckToProofStatus(outcome);

  // SYSTEM may only reach AI_PRECHECK_*/NEEDS_HUMAN_REVIEW — never ACCEPTED.
  const decision = planProofTransition(ProofStatus.SUBMITTED, target, SYSTEM_ACTOR);
  if (!decision.allowed) {
    // Defensive: should never happen for the precheck codomain.
    throw new PrecheckConflictError(
      `AI precheck cannot move proof to ${target}: ${decision.reason}`
    );
  }

  const now = deps.now();
  const ledgerId = uuid();
  await deps.db.$transaction(async (tx) => {
    const updated = await tx.proof.updateMany({
      where: {
        id: command.proofId,
        workspaceId: command.workspaceId,
        status: ProofStatus.SUBMITTED,
      },
      data: { status: target, updatedAt: now },
    });
    if (updated.count !== 1) {
      throw new PrecheckConflictError(
        `Proof ${command.proofId} not in SUBMITTED state; precheck not applied.`
      );
    }
    await tx.auditEvent.create({
      data: {
        id: ledgerId,
        workspaceId: command.workspaceId,
        eventName: AUDIT_EVENTS.AI_PROOF_PRECHECK_RECORDED,
        actorId: null,
        actorType: "system",
        entityType: "proof",
        entityId: command.proofId,
        payload: {
          taskId: command.taskId ?? null,
          proofType: command.requirement.proofType,
          riskLevel: command.requirement.riskLevel,
          outcome,
          status: target,
          finalAccept: false,
        },
        visibility: "internal",
        occurredAt: now,
      },
    });
  });

  return { outcome, status: target, ledgerId };
}
