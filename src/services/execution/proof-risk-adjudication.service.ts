/**
 * Owner proof-risk adjudication service — the governed flow that records the owner's/reviewer's fair,
 * audited decision about a flagged reused/fake/suspicious proof finding.
 *
 * Server-authoritative and fail-closed:
 *   - the outcome + a reason are required (validated in the pure domain layer);
 *   - the reason may not assert fraud/theft; no hidden score is stored;
 *   - any referenced proof IDs are verified to belong to the workspace (never a client claim);
 *   - the adjudication record + an atomic audit (AUDIT-01) are written in ONE transaction;
 *   - it is idempotent on (workspaceId, idempotencyKey): an identical resubmit is a no-op, a changed
 *     outcome/reason is a governed update with a fresh audit;
 *   - REQUIRE_FRESH_PROOF / CONFIRM_SUSPICIOUS_PATTERN maintain a governed reassessment (idempotent,
 *     keyed to the source proof) — the proof status itself is never rewritten here.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  planAdjudication,
} from "@/domain/execution/proof-risk-adjudication";
import type { ReassessmentTrigger } from "@/services/owner-mode/reassessment-event.service";

interface AdjudicationRow {
  id: string; workspaceId: string; idempotencyKey: string; sourceType: string; sourceRef: string;
  proofIds: string[]; actorIds: string[]; adjudicatedByUserId: string | null; adjudicatedByRole: string | null;
  outcome: string; reason: string; ownerActionRequired: boolean; recommendedNextAction: string; status: string;
  createdAt: Date; updatedAt: Date;
}
interface ProofRow { id: string; businessId: string | null }
interface AdjTx {
  proofRiskAdjudication: {
    create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  auditEvent: { create(a: { data: Record<string, unknown> }): Promise<unknown> };
}
export interface AdjudicationDb {
  proofRiskAdjudication: {
    findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<AdjudicationRow | null>;
    findMany(a: { where: Record<string, unknown>; select?: Record<string, boolean>; orderBy?: Record<string, unknown>; take?: number }): Promise<AdjudicationRow[]>;
  };
  proof: { findMany(a: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<ProofRow[]> };
  $transaction<T>(fn: (tx: AdjTx) => Promise<T>): Promise<T>;
}
export interface AdjudicationDeps {
  db: AdjudicationDb;
  uuid: () => string;
  now: () => Date;
  createReassessment?: (input: {
    workspaceId: string; businessId: string; trigger: ReassessmentTrigger; triggerDescription: string;
    sourceProofId: string; actorId: string | null;
  }) => Promise<{ id: string; deduped: boolean }>;
}

async function resolveDefaultDeps(): Promise<AdjudicationDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  const { createReassessmentEvent } = await import("@/services/owner-mode/reassessment-event.service");
  return {
    db: db as unknown as AdjudicationDb, uuid: () => randomUUID(), now: () => new Date(),
    createReassessment: (input) => createReassessmentEvent(input),
  };
}

export interface AdjudicateInput {
  workspaceId: string;
  actorId: string | null;
  actorRole?: string | null;
  sourceType: unknown;
  sourceRef: unknown;
  outcome: unknown;
  reason: unknown;
  proofIds?: unknown;
  actorIds?: unknown;
  idempotencyKey?: unknown;
}
export type AdjudicateResult =
  | { ok: true; adjudicationId: string; deduped: boolean; updated: boolean; status: string; reassessmentEventId: string | null }
  | { ok: false; reason: string };

/** Record (or idempotently update) a governed adjudication of a flagged proof-risk finding. */
export async function adjudicateProofRiskFinding(input: AdjudicateInput, injected?: AdjudicationDeps): Promise<AdjudicateResult> {
  const deps = injected ?? (await resolveDefaultDeps());

  const validation = planAdjudication({
    workspaceId: input.workspaceId, sourceType: input.sourceType, sourceRef: input.sourceRef,
    outcome: input.outcome, reason: input.reason, proofIds: input.proofIds, actorIds: input.actorIds,
    adjudicatedByUserId: input.actorId, adjudicatedByRole: input.actorRole, idempotencyKey: input.idempotencyKey,
  });
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const plan = validation.plan;

  // Verify referenced proof IDs belong to the workspace (never trust a client-claimed proof).
  let businessId: string | null = null;
  if (plan.proofIds.length > 0) {
    const proofs = await deps.db.proof.findMany({ where: { workspaceId: plan.workspaceId, id: { in: plan.proofIds } }, select: { id: true, businessId: true } });
    if (proofs.length !== plan.proofIds.length) return { ok: false, reason: "One or more proofIds are not in this workspace." };
    businessId = proofs.find((p) => p.businessId)?.businessId ?? null;
  }

  const now = deps.now();
  const existing = await deps.db.proofRiskAdjudication.findFirst({ where: { workspaceId: plan.workspaceId, idempotencyKey: plan.idempotencyKey } });
  // Idempotent: identical resubmit (same outcome + reason) → no-op.
  if (existing && existing.outcome === plan.outcome && existing.reason === plan.reason) {
    return { ok: true, adjudicationId: existing.id, deduped: true, updated: false, status: existing.status, reassessmentEventId: null };
  }

  const id = existing?.id ?? deps.uuid();
  const updated = !!existing;
  await deps.db.$transaction(async (tx) => {
    if (existing) {
      await tx.proofRiskAdjudication.updateMany({
        where: { workspaceId: plan.workspaceId, idempotencyKey: plan.idempotencyKey },
        data: {
          sourceType: plan.sourceType, sourceRef: plan.sourceRef, outcome: plan.outcome, reason: plan.reason,
          proofIds: plan.proofIds, actorIds: plan.actorIds, adjudicatedByUserId: input.actorId ?? null,
          adjudicatedByRole: input.actorRole ?? null, ownerActionRequired: plan.ownerActionRequired,
          recommendedNextAction: plan.recommendedNextAction, status: plan.status, updatedAt: now,
        },
      });
    } else {
      await tx.proofRiskAdjudication.create({
        data: {
          id, workspaceId: plan.workspaceId, idempotencyKey: plan.idempotencyKey, sourceType: plan.sourceType,
          sourceRef: plan.sourceRef, proofIds: plan.proofIds, actorIds: plan.actorIds, adjudicatedByUserId: input.actorId ?? null,
          adjudicatedByRole: input.actorRole ?? null, outcome: plan.outcome, reason: plan.reason,
          ownerActionRequired: plan.ownerActionRequired, recommendedNextAction: plan.recommendedNextAction,
          status: plan.status, createdAt: now, updatedAt: now,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: plan.workspaceId, eventName: AUDIT_EVENTS.PROOF_RISK_ADJUDICATED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system", entityType: "proof_risk_adjudication", entityId: id,
        payload: {
          sourceType: plan.sourceType, sourceRef: plan.sourceRef, idempotencyKey: plan.idempotencyKey,
          outcome: plan.outcome, status: plan.status, proofIds: plan.proofIds, actorIds: plan.actorIds,
          adjudicatedByRole: input.actorRole ?? null, ownerActionRequired: plan.ownerActionRequired, updated,
        },
        visibility: "internal", occurredAt: now,
      },
    });
  });

  // Maintain a governed reassessment for outcomes that keep/raise risk (idempotent, keyed to the proof).
  let reassessmentEventId: string | null = null;
  if (plan.triggersReassessment && businessId && plan.proofIds[0] && typeof deps.createReassessment === "function") {
    try {
      // A confirmed/require-fresh adjudication of reused/suspect proof is an evidence-integrity signal.
      const trigger: ReassessmentTrigger = "evidence_retraction";
      const r = await deps.createReassessment({
        workspaceId: plan.workspaceId, businessId, trigger,
        triggerDescription: `Proof-risk adjudication (${plan.outcome}) on ${plan.sourceType} ${plan.sourceRef}`,
        sourceProofId: plan.proofIds[0], actorId: input.actorId ?? null,
      });
      reassessmentEventId = r.id;
    } catch {
      reassessmentEventId = null;
    }
  }

  return { ok: true, adjudicationId: id, deduped: false, updated, status: plan.status, reassessmentEventId };
}

export interface ProofRiskAdjudicationView {
  id: string; sourceType: string; sourceRef: string; idempotencyKey: string; outcome: string; status: string;
  reason: string; proofIds: string[]; actorIds: string[]; adjudicatedByUserId: string | null; adjudicatedByRole: string | null;
  ownerActionRequired: boolean; recommendedNextAction: string; createdAt: string; updatedAt: string;
}

/** Read the workspace's proof-risk adjudications (owner-visible; workspace-scoped). */
export async function getProofRiskAdjudications(workspaceId: string, injected?: AdjudicationDeps): Promise<ProofRiskAdjudicationView[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  let rows: AdjudicationRow[] = [];
  try {
    rows = await deps.db.proofRiskAdjudication.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 2000 });
  } catch (e) {
    if (!(e && typeof e === "object" && (e as { code?: string }).code === "P2021")) throw e;
  }
  return rows.map((r) => ({
    id: r.id, sourceType: r.sourceType, sourceRef: r.sourceRef, idempotencyKey: r.idempotencyKey, outcome: r.outcome,
    status: r.status, reason: r.reason, proofIds: r.proofIds, actorIds: r.actorIds, adjudicatedByUserId: r.adjudicatedByUserId,
    adjudicatedByRole: r.adjudicatedByRole, ownerActionRequired: r.ownerActionRequired, recommendedNextAction: r.recommendedNextAction,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));
}
