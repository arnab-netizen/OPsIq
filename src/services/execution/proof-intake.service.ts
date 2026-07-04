/**
 * Proof-submission intake (Wave 2 — REAL_OWNER_RUNTIME_LOOP, S2).
 *
 * `POST /api/proof/submit` previously forwarded the client-supplied proof *contract*
 * (proofId, fromStatus, requirement, existingHashes, actor) straight into `submitProof`, so a
 * caller could self-certify a permissive requirement (empty requiredFields) or claim an actor role,
 * and duplicate detection was inert (existingHashes never populated → duplicateFlagged always false).
 *
 * This service makes the contract server-authoritative: it loads the task, the latest submittable
 * Proof + its ProofRequirement, and the workspace's existing file hashes from the DB, and derives the
 * submitting actor from the verified session. Only the actual proof artifact (proofType, fields,
 * fileHash) comes from the client. No FSM/gate/domain change — `submitProof` and its pure validators
 * are untouched; this only stops the route from trusting client input. Expected domain rejections
 * (validation/transition/conflict) are surfaced as an explicit `{ ok: false }` with the reason — an
 * unexpected error is never swallowed (it re-throws), so nothing is masked.
 */
import { db as liveDb } from "@/lib/db";
import { requireActiveMembership, type LifecycleDeps } from "@/services/workspace/employee-lifecycle.service";
import { requireTaskAccess, type DashboardDeps } from "@/services/workspace/dashboard-access.service";
import {
  submitProof,
  ProofValidationError,
  ProofTransitionNotAllowedError,
  ProofConflictError,
  type ProofDeps,
} from "@/services/execution/proof.service";
import {
  ProofStatus,
  ProofRiskLevel,
  type ProofType,
  type ProofRequirement,
} from "@/domain/execution/proof";
import {
  detectProofArtifactSignals,
  type AiProofPrecheckOutcome,
} from "@/domain/execution/proof-precheck";
import {
  runProofPrecheck,
  PrecheckConflictError,
} from "@/services/execution/proof-precheck.service";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import { logger } from "@/infra/logger";

/** States from which a proof may still be submitted (initial + after a resubmission request). */
const SUBMITTABLE_STATUSES: ProofStatus[] = [ProofStatus.PENDING_SUBMISSION, ProofStatus.RESUBMISSION_REQUIRED];

/** The only part of a submission the client is authoritative for: the artifact itself. */
export interface ClientProofSubmission {
  proofType?: string;
  fields?: Record<string, unknown>;
  fileHash?: string | null;
}

interface FindFirstArgs {
  where: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  select?: Record<string, boolean>;
}
export interface ProofIntakeReadDb {
  delegatedTask: {
    findFirst(a: FindFirstArgs): Promise<{ workspaceId: string; assignedUserId: string | null } | null>;
  };
  proof: {
    findFirst(a: FindFirstArgs): Promise<{ id: string; status: string; proofRequirementId: string | null } | null>;
    findMany(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<{ fileHash: string | null }[]>;
  };
  proofRequirement: {
    findFirst(a: FindFirstArgs): Promise<{ proofType: string; requiredFields: unknown; riskLevel: string } | null>;
  };
}

export interface ProofIntakeDeps {
  db?: ProofIntakeReadDb;
  lifecycle?: LifecycleDeps;
  dashboard?: DashboardDeps;
  proof?: ProofDeps;
}

export type ProofIntakeResult =
  | {
      ok: true;
      /**
       * Status AFTER the AI precheck has advanced the submitted proof. This is the
       * screened status (AI_PRECHECK_PASSED / AI_PRECHECK_FAILED / NEEDS_HUMAN_REVIEW),
       * never ACCEPTED — final acceptance still requires a human reviewer.
       */
      status: ProofStatus;
      duplicateFlagged: boolean;
      /** The AI precheck outcome, or null if a concurrent transition pre-empted it. */
      precheckOutcome: AiProofPrecheckOutcome | null;
    }
  | { ok: false; reason: string; issues?: string[] };

export interface ProofIntakeInput {
  workspaceId: string;
  actorId: string;
  taskId: string;
  submission: ClientProofSubmission;
}

/** Validate + record a proof submission against the DB-authoritative proof contract. */
export async function intakeProofSubmission(
  input: ProofIntakeInput,
  deps: ProofIntakeDeps = {}
): Promise<ProofIntakeResult> {
  const db = deps.db ?? (liveDb as unknown as ProofIntakeReadDb);
  const { workspaceId, actorId, taskId } = input;

  // Guard: a missing/blank taskId must not become an unfiltered `where` (Prisma drops `id: undefined`,
  // which would otherwise match an arbitrary task in the workspace).
  if (typeof taskId !== "string" || taskId.trim() === "") return { ok: false, reason: "taskId is required." };

  // 1. Task must exist in this workspace (never trust a client-claimed task).
  const task = await db.delegatedTask.findFirst({
    where: { id: taskId, workspaceId },
    select: { workspaceId: true, assignedUserId: true },
  });
  if (!task) return { ok: false, reason: "Task not found." };

  // 2. Proven access guards (active membership + access to this task).
  await requireActiveMembership(workspaceId, actorId, deps.lifecycle);
  await requireTaskAccess(
    workspaceId,
    actorId,
    { workspaceId: task.workspaceId, assignedUserId: task.assignedUserId },
    deps.dashboard
  );

  // 3. Authoritative proof + fromStatus (latest submittable proof for the task).
  const proof = await db.proof.findFirst({
    where: { taskId, workspaceId, status: { in: SUBMITTABLE_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, proofRequirementId: true },
  });
  if (!proof) return { ok: false, reason: "No proof is awaiting submission for this task." };

  // 4. Authoritative requirement (loaded from DB — the client's requirement is ignored).
  const requirementRow = proof.proofRequirementId
    ? await db.proofRequirement.findFirst({
        where: { id: proof.proofRequirementId, workspaceId },
        select: { proofType: true, requiredFields: true, riskLevel: true },
      })
    : null;
  if (!requirementRow) return { ok: false, reason: "Proof requirement not found for this task." };

  const requirement: ProofRequirement = {
    proofType: requirementRow.proofType as ProofType,
    requiredFields: Array.isArray(requirementRow.requiredFields)
      ? (requirementRow.requiredFields as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    riskLevel: (requirementRow.riskLevel as ProofRiskLevel) ?? ProofRiskLevel.LOW,
  };

  // 5. Real workspace duplicate detection: hashes of every OTHER proof in the workspace.
  const others = await db.proof.findMany({
    where: { workspaceId, fileHash: { not: null }, NOT: { id: proof.id } },
    select: { fileHash: true },
  });
  const existingHashes = new Set(
    others.map((o) => o.fileHash).filter((h): h is string => typeof h === "string" && h.length > 0)
  );

  // 6. Actor derived from the verified session; this route is the assignee-submit surface.
  const isAssignee = task.assignedUserId != null && task.assignedUserId === actorId;

  const proofSubmission = {
    proofType: input.submission.proofType as ProofType,
    fields: input.submission.fields ?? {},
    fileHash: input.submission.fileHash ?? null,
    submittedByUserId: actorId,
  };

  try {
    const result = await submitProof(
      {
        proofId: proof.id,
        taskId,
        workspaceId,
        fromStatus: proof.status as ProofStatus,
        requirement,
        submission: proofSubmission,
        actor: { role: TaskActorRole.EMPLOYEE, isAssignee, canReviewProof: false },
        existingHashes,
      },
      deps.proof
    );

    // EVID-01: a SUBMITTED proof must be screened by the deterministic AI precheck
    // before it can be human-reviewed — tamper/format/reuse/high-risk are routed to
    // AI_PRECHECK_FAILED or NEEDS_HUMAN_REVIEW so weak evidence is never mistaken for
    // verified. The precheck is SYSTEM-only and can NEVER reach ACCEPTED (proof FSM),
    // and completion clears only on ACCEPTED, so this only screens — it cannot verify.
    // Signals are deterministic: real workspace duplicate hashes + artifact integrity.
    let precheckOutcome: AiProofPrecheckOutcome | null = null;
    let screenedStatus = result.status;
    try {
      const precheck = await runProofPrecheck({
        proofId: proof.id,
        workspaceId,
        taskId,
        requirement,
        submission: proofSubmission,
        signals: {
          existingHashes,
          ...detectProofArtifactSignals(requirement, proofSubmission),
        },
      });
      precheckOutcome = precheck.outcome;
      screenedStatus = precheck.status;
    } catch (pe) {
      // The precheck is a follow-on governed transition. A concurrency conflict (the
      // proof already left SUBMITTED — e.g. a parallel precheck) must NOT roll back the
      // valid submission; surface the submitted state with a null outcome. Any other
      // error is unexpected and re-thrown (never swallowed).
      if (pe instanceof PrecheckConflictError) {
        logger.warn("Proof precheck skipped (proof no longer SUBMITTED)", { proofId: proof.id, workspaceId });
      } else {
        throw pe;
      }
    }

    return { ok: true, status: screenedStatus, duplicateFlagged: result.duplicateFlagged, precheckOutcome };
  } catch (e) {
    // Expected, client-caused rejections are surfaced explicitly (not masked, not a 500).
    if (e instanceof ProofValidationError) return { ok: false, reason: e.message, issues: e.issues };
    if (e instanceof ProofTransitionNotAllowedError || e instanceof ProofConflictError) {
      return { ok: false, reason: e.message };
    }
    throw e; // never swallow an unexpected error
  }
}
