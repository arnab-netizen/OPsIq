/**
 * Governed Proof Dispute service — the live flow that reverses a previously-ACCEPTED proof when
 * later business reality contradicts it (customer complaint, rework, bad outcome, quality failure,
 * suspected fake proof, …).
 *
 * Server-authoritative and fail-closed:
 *   - loads the proof from the DB (never trusts a client-supplied status/workspace),
 *   - requires a reason + a valid category (validated in the pure domain layer),
 *   - enforces separation of duty (an actor may never dispute their own proof),
 *   - only an ACCEPTED proof can be disputed; a repeated dispute is an idempotent no-op,
 *   - the proof transition and BOTH audit events (proof.reviewed + proof.disputed) are written in
 *     ONE transaction (AUDIT-01) — a failed audit rolls the reversal back,
 *   - then a governed OwnerReassessmentEvent is created (idempotent, keyed to the proof).
 *
 * The proof.reviewed(ACCEPTED→DISPUTED) audit it writes is exactly what the Proof↔Outcome Linkage
 * reader consumes, so credibility, the PROOF_OUTCOME_INTEGRITY SLO, and the Owner Now View update
 * automatically on the next read — no orphan path.
 *
 * It invents no complaint/rework rows: the dispute category is governed metadata on the dispute
 * event; relatedComplaintId/relatedReworkId are recorded as missing-source, never faked.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ProofStatus, planProofTransition } from "@/domain/execution/proof";
import { TaskActorRole } from "@/domain/execution/delegated-task";
import {
  planProofDispute,
  type DisputeRecord,
} from "@/domain/execution/proof-dispute";
import type { ReassessmentTrigger } from "@/services/owner-mode/reassessment-event.service";

export interface DisputeAcceptedProofInput {
  workspaceId: string;
  proofId: string;
  actorId: string;
  /** Server-resolved role (never client-supplied). */
  actorRole: TaskActorRole;
  category: unknown;
  reason: unknown;
  override?: boolean;
  /** Business scope for the reassessment; falls back to the proof's businessId. */
  businessId?: string | null;
}

export type DisputeAcceptedProofResult =
  | {
      ok: true;
      status: ProofStatus;
      /** True when the proof was already at the target contradiction state (idempotent no-op). */
      deduped: boolean;
      disputeRecord: DisputeRecord | null;
      reassessmentEventId: string | null;
    }
  | { ok: false; reason: string };

interface ProofRow { id: string; status: string; submittedByUserId: string | null; businessId: string | null; taskId: string | null }
interface DisputeTx {
  proof: { updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> };
  auditEvent: { create(a: { data: Record<string, unknown> }): Promise<unknown> };
}
export interface DisputeDb {
  proof: { findFirst(a: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<ProofRow | null> };
  $transaction<T>(fn: (tx: DisputeTx) => Promise<T>): Promise<T>;
}
export interface DisputeDeps {
  db: DisputeDb;
  uuid: () => string;
  now: () => Date;
  /** Reassessment creation (idempotent). Defaults to the live createReassessmentEvent. */
  createReassessment?: (input: {
    workspaceId: string; businessId: string; trigger: ReassessmentTrigger; triggerDescription: string;
    sourceProofId: string; actorId: string | null;
  }) => Promise<{ id: string; deduped: boolean }>;
}

const CONTRADICTION_STATES = new Set<string>([ProofStatus.DISPUTED, ProofStatus.OVERRIDDEN_NOT_VERIFIED]);

async function resolveDefaultDeps(): Promise<DisputeDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  const { createReassessmentEvent } = await import("@/services/owner-mode/reassessment-event.service");
  return {
    db: db as unknown as DisputeDb,
    uuid: () => randomUUID(),
    now: () => new Date(),
    createReassessment: (input) => createReassessmentEvent(input),
  };
}

/** Dispute a previously-accepted proof through the governed, audited, reassessable flow. */
export async function disputeAcceptedProof(
  input: DisputeAcceptedProofInput,
  injected?: DisputeDeps
): Promise<DisputeAcceptedProofResult> {
  const deps = injected ?? (await resolveDefaultDeps());

  // Guard: a blank proofId must not become an unfiltered where.
  if (typeof input.proofId !== "string" || input.proofId.trim() === "") {
    return { ok: false, reason: "proofId is required." };
  }

  // 1. Validate the dispute (category + reason + owner-only override) — fail closed.
  const validation = planProofDispute({ category: input.category, reason: input.reason, override: input.override, actorRole: input.actorRole });
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const plan = validation.plan;

  // 2. Load the proof server-side (workspace-scoped) — never trust client status/workspace.
  const proof = await deps.db.proof.findFirst({
    where: { id: input.proofId, workspaceId: input.workspaceId },
    select: { id: true, status: true, submittedByUserId: true, businessId: true, taskId: true },
  });
  if (!proof) return { ok: false, reason: "Proof not found in this workspace." };

  // 3. Idempotency: already at the target contradiction state → safe no-op.
  if (proof.status === plan.targetStatus) {
    return { ok: true, status: plan.targetStatus as ProofStatus, deduped: true, disputeRecord: null, reassessmentEventId: null };
  }
  // Already in the OTHER contradiction state (e.g., disputed then override requested) is idempotent too.
  if (CONTRADICTION_STATES.has(proof.status)) {
    return { ok: true, status: proof.status as ProofStatus, deduped: true, disputeRecord: null, reassessmentEventId: null };
  }
  // 4. Only an ACCEPTED proof can be disputed (explicit policy; fail closed otherwise).
  if (proof.status !== ProofStatus.ACCEPTED) {
    return { ok: false, reason: `Only accepted proof can be disputed (current status: ${proof.status}).` };
  }

  // 5. Separation of duty — an actor may never dispute their own proof.
  if (proof.submittedByUserId && proof.submittedByUserId === input.actorId) {
    return { ok: false, reason: "Separation of duty: you cannot dispute your own proof." };
  }

  // 6. FSM authority — reuse the proof transition rules (OVERRIDDEN is owner-only, etc.).
  const decision = planProofTransition(ProofStatus.ACCEPTED, plan.targetStatus, { role: input.actorRole, isAssignee: false, canReviewProof: true }, { reason: plan.reason });
  if (!decision.allowed) return { ok: false, reason: decision.reason };

  const now = deps.now();
  const businessId = input.businessId ?? proof.businessId ?? null;

  // 7. Atomic: reverse the proof + write BOTH audits (proof.reviewed feeds the linkage reader;
  //    proof.disputed carries the full governed dispute record). A failed audit rolls it back.
  let applied = false;
  try {
    applied = await deps.db.$transaction(async (tx) => {
      const updated = await tx.proof.updateMany({
        where: { id: input.proofId, workspaceId: input.workspaceId, status: ProofStatus.ACCEPTED },
        data: { status: plan.targetStatus, reviewedByUserId: input.actorId, reviewedAt: now, reviewReason: plan.reason },
      });
      if (updated.count !== 1) return false; // lost a race — handled as idempotent below

      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.PROOF_REVIEWED,
          actorId: input.actorId, actorType: "user", entityType: "proof", entityId: input.proofId,
          payload: { fromStatus: ProofStatus.ACCEPTED, toStatus: plan.targetStatus, reason: plan.reason },
          visibility: "internal", occurredAt: now,
        },
      });
      await tx.auditEvent.create({
        data: {
          id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.PROOF_DISPUTED,
          actorId: input.actorId, actorType: "user", entityType: "proof", entityId: input.proofId,
          payload: {
            previousProofStatus: ProofStatus.ACCEPTED, nextProofStatus: plan.targetStatus,
            disputedByActorId: input.actorId, disputedByRole: input.actorRole,
            disputeCategory: plan.category, reason: plan.reason, source: plan.source,
            relatedComplaintId: null, relatedReworkId: null,
            missingSources: ["no per-event complaint/rework model (period-aggregate only)"],
          },
          visibility: "internal", occurredAt: now,
        },
      });
      return true;
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return { ok: false, reason: "Proof storage unavailable." };
    throw e;
  }

  if (!applied) {
    // A concurrent writer moved the proof; report the safe idempotent outcome.
    return { ok: true, status: plan.targetStatus as ProofStatus, deduped: true, disputeRecord: null, reassessmentEventId: null };
  }

  // 8. Governed reassessment (idempotent, keyed to the proof). Best-effort: the dispute itself is
  //    the committed governed mutation; if reassessment creation is unavailable (e.g. no owner-mode
  //    account for the workspace), the dispute + linkage still stand and this is reported honestly.
  let reassessmentEventId: string | null = null;
  if (businessId && typeof deps.createReassessment === "function") {
    try {
      const r = await deps.createReassessment({
        workspaceId: input.workspaceId, businessId, trigger: plan.trigger,
        triggerDescription: `Proof ${input.proofId} disputed (${plan.category}): ${plan.reason}`,
        sourceProofId: input.proofId, actorId: input.actorId,
      });
      reassessmentEventId = r.id;
    } catch {
      reassessmentEventId = null;
    }
  }

  const disputeRecord: DisputeRecord = {
    workspaceId: input.workspaceId, proofId: input.proofId,
    previousProofStatus: ProofStatus.ACCEPTED, nextProofStatus: plan.targetStatus,
    disputedByActorId: input.actorId, disputedByRole: input.actorRole,
    disputeCategory: plan.category, reason: plan.reason, source: plan.source,
    relatedActionId: null, relatedOutcomeId: null, relatedComplaintId: null, relatedReworkId: null,
    reassessmentEventId, createdAt: now.toISOString(),
  };

  return { ok: true, status: plan.targetStatus as ProofStatus, deduped: false, disputeRecord, reassessmentEventId };
}
