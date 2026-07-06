/**
 * Validation Outcome service — the governed write path that persists what actually happened when an
 * opportunity's validation experiment ran, so the live Opportunity Portfolio can make real kill / park /
 * scale-candidate decisions on evidence.
 *
 * Server-authoritative + fail-closed: validated in the pure domain layer (no-fake-win / stop-loss / scale
 * gates enforced there); workspace + actor from the verified session; row + atomic audit in one transaction;
 * idempotent on (workspaceId, idempotencyKey). It never scales anything — it records evidence the portfolio
 * gate then consumes.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  planValidationOutcome,
  resultToValidationStatus,
  type ValidationOutcomeSubmission,
} from "@/domain/owner-mode/validation-outcome";
import type { ValidationStatus } from "@/domain/owner-mode/opportunity-validation-experiment-engine";

interface OutcomeRow {
  id: string; workspaceId: string; idempotencyKey: string; experimentKey: string; opportunityKey: string;
  status: string; result: string; startedAt: Date | null; completedAt: Date | null; actualCost: number | null;
  actualOwnerTimeMinutes: number | null; leadsGenerated: number | null; responses: number | null; conversions: number | null;
  revenueEvidence: string | null; marginEvidence: string | null; customerFeedback: string | null; operationalIssues: string | null;
  cashImpactNotes: string | null; proofEvidenceRefs: string[]; successMetricResult: string | null; failureMetricResult: string | null;
  stopLossTriggered: boolean; ownerVisibleSummary: string; nextRecommendedDecision: string; approvalLevel: string;
  recordedByUserId: string | null; createdAt: Date; updatedAt: Date;
}
interface OutcomeTx {
  opportunityValidationOutcome: {
    create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  auditEvent: { create(a: { data: Record<string, unknown> }): Promise<unknown> };
}
export interface OutcomeDb {
  opportunityValidationOutcome: {
    findFirst(a: { where: Record<string, unknown> }): Promise<OutcomeRow | null>;
    findMany(a: { where: Record<string, unknown>; orderBy?: Record<string, unknown>; take?: number }): Promise<OutcomeRow[]>;
  };
  $transaction<T>(fn: (tx: OutcomeTx) => Promise<T>): Promise<T>;
}
export interface OutcomeDeps {
  db: OutcomeDb;
  uuid: () => string;
  now: () => Date;
}

async function resolveDefaultDeps(): Promise<OutcomeDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as OutcomeDb, uuid: () => randomUUID(), now: () => new Date() };
}

export interface RecordOutcomeInput {
  workspaceId: string;
  actorId: string | null;
  actorRole?: string | null;
  submission: ValidationOutcomeSubmission;
}
export type RecordOutcomeResult =
  | { ok: true; outcomeId: string; result: string; nextRecommendedDecision: string; deduped: boolean; updated: boolean }
  | { ok: false; reason: string };

/** Record (or idempotently update) a governed validation outcome. */
export async function recordValidationOutcome(input: RecordOutcomeInput, injected?: OutcomeDeps): Promise<RecordOutcomeResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const plan = planValidationOutcome(input.submission);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  const row = plan.row;
  const now = deps.now();

  const existing = await deps.db.opportunityValidationOutcome.findFirst({ where: { workspaceId: input.workspaceId, idempotencyKey: row.idempotencyKey } });
  if (existing && existing.result === row.result && existing.status === row.status && existing.nextRecommendedDecision === row.nextRecommendedDecision) {
    return { ok: true, outcomeId: existing.id, result: existing.result, nextRecommendedDecision: existing.nextRecommendedDecision, deduped: true, updated: false };
  }

  const id = existing?.id ?? deps.uuid();
  const updated = !!existing;
  await deps.db.$transaction(async (tx) => {
    const data = {
      workspaceId: input.workspaceId, idempotencyKey: row.idempotencyKey, experimentKey: row.experimentKey, opportunityKey: row.opportunityKey,
      status: row.status, result: row.result, startedAt: row.startedAt, completedAt: row.completedAt, actualCost: row.actualCost,
      actualOwnerTimeMinutes: row.actualOwnerTimeMinutes, leadsGenerated: row.leadsGenerated, responses: row.responses, conversions: row.conversions,
      revenueEvidence: row.revenueEvidence, marginEvidence: row.marginEvidence, customerFeedback: row.customerFeedback, operationalIssues: row.operationalIssues,
      cashImpactNotes: row.cashImpactNotes, proofEvidenceRefs: row.proofEvidenceRefs, successMetricResult: row.successMetricResult, failureMetricResult: row.failureMetricResult,
      stopLossTriggered: row.stopLossTriggered, ownerVisibleSummary: row.ownerVisibleSummary, nextRecommendedDecision: row.nextRecommendedDecision,
      approvalLevel: row.approvalLevel, recordedByUserId: input.actorId ?? null, updatedAt: now,
    };
    if (existing) {
      await tx.opportunityValidationOutcome.updateMany({ where: { workspaceId: input.workspaceId, idempotencyKey: row.idempotencyKey }, data });
    } else {
      await tx.opportunityValidationOutcome.create({ data: { id, createdAt: now, ...data } });
    }
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OWNER_OPPORTUNITY_VALIDATION_OUTCOME_RECORDED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system",
        entityType: "opportunity_validation_outcome", entityId: id,
        payload: { opportunityKey: row.opportunityKey, experimentKey: row.experimentKey, result: row.result, status: row.status, nextRecommendedDecision: row.nextRecommendedDecision, stopLossTriggered: row.stopLossTriggered, updated },
        visibility: "internal", occurredAt: now,
      },
    });
  });

  return { ok: true, outcomeId: id, result: row.result, nextRecommendedDecision: row.nextRecommendedDecision, deduped: false, updated };
}

export interface ValidationOutcomeView {
  opportunityKey: string;
  experimentKey: string;
  status: string;
  result: string;
  validationStatus: ValidationStatus; // mapped for the portfolio scale gate
  nextRecommendedDecision: string;
  approvalLevel: string;
  stopLossTriggered: boolean;
  ownerVisibleSummary: string;
  recordedAt: string;
}

/** The latest outcome per opportunityKey for the workspace (workspace-scoped; newest wins). */
export async function getActiveValidationOutcomes(workspaceId: string, injected?: OutcomeDeps): Promise<ValidationOutcomeView[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  let rows: OutcomeRow[] = [];
  try {
    rows = await deps.db.opportunityValidationOutcome.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 1000 });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return [];
    throw e;
  }
  const seen = new Set<string>();
  const out: ValidationOutcomeView[] = [];
  for (const r of rows) {
    if (seen.has(r.opportunityKey)) continue; // newest per opportunity (rows are updatedAt desc)
    seen.add(r.opportunityKey);
    out.push({
      opportunityKey: r.opportunityKey, experimentKey: r.experimentKey, status: r.status, result: r.result,
      validationStatus: resultToValidationStatus(r.status as Parameters<typeof resultToValidationStatus>[0], r.result as Parameters<typeof resultToValidationStatus>[1]),
      nextRecommendedDecision: r.nextRecommendedDecision, approvalLevel: r.approvalLevel, stopLossTriggered: r.stopLossTriggered,
      ownerVisibleSummary: r.ownerVisibleSummary, recordedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}
