/**
 * Complaint / Rework event service — record a per-event complaint/rework, link it to accepted
 * proof, and read the proof↔event linkage. Server-authoritative and fail-closed:
 *   - category + description are required (validated in the pure domain layer);
 *   - a linked proof is verified to belong to the workspace (never a client claim);
 *   - creation + linkage are written with an atomic audit (AUDIT-01);
 *   - linkage is idempotent (re-linking the same proof is a no-op);
 *   - the server `createdAt` is the trusted time; a user-supplied `occurredAt` is stored but marked
 *     untrusted (never used for SLO timing).
 * No fabricated financial impact — an amount is stored only when supplied.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  planRecordEvent,
  buildComplaintReworkAnalysis,
  OperationalEventType,
  type ComplaintReworkAnalysis,
  type OperationalEventRow,
  type LinkedProofRow,
} from "@/domain/execution/complaint-rework";
import {
  planStatusChange,
  OperationalEventStatus,
  type AgedEvent,
  type OperationalEventAgingSummary,
} from "@/domain/execution/operational-event-aging";

export const COMPLAINT_REWORK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface EventRow { id: string; eventType: string; relatedProofId: string | null; relatedActionId: string | null; category: string; severity: string; status: string; source: string; description: string; occurredAt: Date | null; createdAt: Date; resolvedAt: Date | null; updatedAt: Date; estimatedImpactAmount: number | null; impactConfidence: string }
interface ProofRow { id: string; status: string; submittedByUserId: string | null }

interface EventDelegate {
  findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<{ id: string; workspaceId: string; relatedProofId: string | null; status?: string; severity?: string } | null>;
  findMany(a: { where: Record<string, unknown>; select?: Record<string, boolean>; orderBy?: Record<string, unknown>; take?: number }): Promise<EventRow[]>;
  create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
  updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}
interface ProofDelegate {
  findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<ProofRow | null>;
  findMany(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<ProofRow[]>;
}
interface AuditDelegate { create(a: { data: Record<string, unknown> }): Promise<unknown> }
interface CRTx { operationalEvent: Pick<EventDelegate, "create" | "updateMany">; auditEvent: AuditDelegate }
export interface ComplaintReworkDb {
  operationalEvent: EventDelegate;
  proof: ProofDelegate;
  auditEvent: AuditDelegate;
  $transaction<T>(fn: (tx: CRTx) => Promise<T>): Promise<T>;
}
export interface ComplaintReworkDeps {
  db: ComplaintReworkDb;
  uuid: () => string;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<ComplaintReworkDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as ComplaintReworkDb, uuid: () => randomUUID(), now: () => Date.now() };
}

export interface RecordEventInput {
  workspaceId: string;
  actorId: string | null;
  eventType: unknown;
  category: unknown;
  description: unknown;
  severity?: unknown;
  source?: unknown;
  businessId?: string | null;
  relatedProofId?: string | null;
  relatedActionId?: string | null;
  occurredAt?: string | null;
  estimatedImpactAmount?: unknown;
  impactCurrency?: unknown;
}
export type RecordEventResult = { ok: true; eventId: string } | { ok: false; reason: string };

/** Record a governed complaint/rework event (optionally linked to a workspace proof). */
export async function recordOperationalEvent(input: RecordEventInput, injected?: ComplaintReworkDeps): Promise<RecordEventResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  const validation = planRecordEvent(input);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const plan = validation.plan;

  // Verify a supplied proof belongs to the workspace (never trust a client-claimed proof).
  let relatedProofId: string | null = null;
  if (input.relatedProofId) {
    const proof = await deps.db.proof.findFirst({ where: { id: input.relatedProofId, workspaceId: input.workspaceId }, select: { id: true } });
    if (!proof) return { ok: false, reason: "relatedProofId not found in this workspace." };
    relatedProofId = proof.id;
  }

  const id = deps.uuid();
  const now = new Date(deps.now());
  const occurredAt = typeof input.occurredAt === "string" && input.occurredAt ? new Date(input.occurredAt) : null;
  await deps.db.$transaction(async (tx) => {
    await tx.operationalEvent.create({
      data: {
        id, workspaceId: input.workspaceId, eventType: plan.eventType, relatedProofId, relatedActionId: input.relatedActionId ?? null,
        businessId: input.businessId ?? null, category: plan.category, severity: plan.severity, status: "OPEN", source: plan.source,
        description: plan.description, reportedByUserId: input.actorId ?? null,
        occurredAt: occurredAt && !isNaN(occurredAt.getTime()) ? occurredAt : null, estimatedImpactAmount: plan.estimatedImpactAmount,
        impactCurrency: plan.impactCurrency, impactConfidence: plan.impactConfidence, createdAt: now, updatedAt: now,
      },
    });
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OPERATIONAL_EVENT_RECORDED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system", entityType: "operational_event", entityId: id,
        payload: { eventType: plan.eventType, category: plan.category, severity: plan.severity, relatedProofId, impactConfidence: plan.impactConfidence },
        visibility: "internal", occurredAt: now,
      },
    });
  });
  return { ok: true, eventId: id };
}

export type LinkResult = { ok: true; deduped: boolean } | { ok: false; reason: string };

/** Link an existing complaint/rework event to a workspace proof (idempotent, audited). */
export async function linkOperationalEventToProof(
  input: { workspaceId: string; actorId: string | null; eventId: string; proofId: string },
  injected?: ComplaintReworkDeps
): Promise<LinkResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  if (!input.eventId?.trim() || !input.proofId?.trim()) return { ok: false, reason: "eventId and proofId are required." };

  const event = await deps.db.operationalEvent.findFirst({ where: { id: input.eventId, workspaceId: input.workspaceId }, select: { id: true, workspaceId: true, relatedProofId: true } });
  if (!event) return { ok: false, reason: "Event not found in this workspace." };
  const proof = await deps.db.proof.findFirst({ where: { id: input.proofId, workspaceId: input.workspaceId }, select: { id: true, status: true, submittedByUserId: true } });
  if (!proof) return { ok: false, reason: "Proof not found in this workspace." };
  if (event.relatedProofId === input.proofId) return { ok: true, deduped: true };

  const now = new Date(deps.now());
  await deps.db.$transaction(async (tx) => {
    await tx.operationalEvent.updateMany({ where: { id: input.eventId, workspaceId: input.workspaceId }, data: { relatedProofId: input.proofId, updatedAt: now } });
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OPERATIONAL_EVENT_LINKED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system", entityType: "operational_event", entityId: input.eventId,
        payload: { proofId: input.proofId }, visibility: "internal", occurredAt: now,
      },
    });
  });
  return { ok: true, deduped: false };
}

export type EventStatusChangeResult = { ok: true; deduped: boolean } | { ok: false; reason: string };

interface StatusChangeInput {
  workspaceId: string;
  actorId: string | null;
  eventId: string;
  targetStatus: OperationalEventStatus;
  note?: string | null;
  reason?: string | null;
}

/**
 * Governed status transition of an operational event. Fail-closed, workspace-scoped, idempotent, and
 * concurrency-safe:
 *   - the event is verified to belong to the workspace (never a client claim);
 *   - transition rules + required note/reason are enforced by the pure domain (planStatusChange);
 *   - a same-status request is an idempotent no-op (deduped);
 *   - the update is guarded on the read status (optimistic concurrency) — a racing change dedupes;
 *   - the status change + an atomic audit (AUDIT-01) are written in one transaction.
 * Terminal statuses stamp resolvedAt / resolvedByUserId / resolutionNote / outcome.
 */
async function changeOperationalEventStatus(input: StatusChangeInput, injected?: ComplaintReworkDeps): Promise<EventStatusChangeResult> {
  const deps = injected ?? (await resolveDefaultDeps());
  if (!input.eventId?.trim()) return { ok: false, reason: "eventId is required." };

  const event = await deps.db.operationalEvent.findFirst({
    where: { id: input.eventId, workspaceId: input.workspaceId },
    select: { id: true, workspaceId: true, status: true, severity: true },
  });
  if (!event) return { ok: false, reason: "Event not found in this workspace." };

  const currentStatus = event.status ?? OperationalEventStatus.OPEN;
  // Idempotent: already in the requested status → no-op.
  if (currentStatus === input.targetStatus) return { ok: true, deduped: true };

  const validation = planStatusChange({
    currentStatus, targetStatus: input.targetStatus, severity: event.severity ?? "MEDIUM",
    note: input.note ?? undefined, reason: input.reason ?? undefined,
  });
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const plan = validation.plan;

  const now = new Date(deps.now());
  let racedAway = false;
  await deps.db.$transaction(async (tx) => {
    // Optimistic-concurrency guard: only transition if still in the status we read.
    const res = await tx.operationalEvent.updateMany({
      where: { id: input.eventId, workspaceId: input.workspaceId, status: currentStatus },
      data: {
        status: plan.targetStatus,
        resolvedAt: plan.isTerminal ? now : null,
        resolvedByUserId: plan.isTerminal ? (input.actorId ?? null) : null,
        resolutionNote: plan.resolutionNote,
        outcome: plan.outcome,
        updatedAt: now,
      },
    });
    if (res.count === 0) { racedAway = true; return; }
    await tx.auditEvent.create({
      data: {
        id: deps.uuid(), workspaceId: input.workspaceId, eventName: AUDIT_EVENTS.OPERATIONAL_EVENT_STATUS_CHANGED,
        actorId: input.actorId ?? null, actorType: input.actorId ? "user" : "system", entityType: "operational_event", entityId: input.eventId,
        payload: { fromStatus: currentStatus, toStatus: plan.targetStatus, outcome: plan.outcome, reason: plan.reason },
        visibility: "internal", occurredAt: now,
      },
    });
  });
  // A racing transition already moved the event — treat as an idempotent no-op.
  if (racedAway) return { ok: true, deduped: true };
  return { ok: true, deduped: false };
}

/** Resolve an operational event (a resolution note is required). */
export function resolveOperationalEvent(input: { workspaceId: string; actorId: string | null; eventId: string; note: string }, injected?: ComplaintReworkDeps): Promise<EventStatusChangeResult> {
  return changeOperationalEventStatus({ ...input, targetStatus: OperationalEventStatus.RESOLVED }, injected);
}

/** Dismiss an operational event (a note AND a reason are required — never a silent drop). */
export function dismissOperationalEvent(input: { workspaceId: string; actorId: string | null; eventId: string; note: string; reason: string }, injected?: ComplaintReworkDeps): Promise<EventStatusChangeResult> {
  return changeOperationalEventStatus({ ...input, targetStatus: OperationalEventStatus.DISMISSED }, injected);
}

/** Mark an operational event as in review (no note required). */
export function markOperationalEventInReview(input: { workspaceId: string; actorId: string | null; eventId: string }, injected?: ComplaintReworkDeps): Promise<EventStatusChangeResult> {
  return changeOperationalEventStatus({ ...input, targetStatus: OperationalEventStatus.IN_REVIEW }, injected);
}

/** Mark an operational event as a duplicate (a note is required). */
export function markOperationalEventDuplicate(input: { workspaceId: string; actorId: string | null; eventId: string; note: string }, injected?: ComplaintReworkDeps): Promise<EventStatusChangeResult> {
  return changeOperationalEventStatus({ ...input, targetStatus: OperationalEventStatus.DUPLICATE }, injected);
}

/** Read the owner-facing resolution + aging summary for a workspace (90-day window). */
export async function getOperationalEventAgingSummary(workspaceId: string, injected?: ComplaintReworkDeps): Promise<OperationalEventAgingSummary> {
  return (await getComplaintReworkLinks(workspaceId, injected)).eventHealth;
}

/** Read the currently open/in-review operational events for a workspace (aged, most-urgent first). */
export async function getOpenOperationalEvents(workspaceId: string, injected?: ComplaintReworkDeps): Promise<AgedEvent[]> {
  const summary = await getOperationalEventAgingSummary(workspaceId, injected);
  return summary.events.filter((e) => e.active).sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || b.ageMs - a.ageMs);
}

/** Read the proof↔complaint/rework linkage analysis for a workspace (90-day window). */
export async function getComplaintReworkLinks(workspaceId: string, injected?: ComplaintReworkDeps): Promise<ComplaintReworkAnalysis> {
  const deps = injected ?? (await resolveDefaultDeps());
  const nowMs = deps.now();
  const since = new Date(nowMs - COMPLAINT_REWORK_WINDOW_MS);
  const evaluatedAt = new Date(nowMs).toISOString();

  let events: EventRow[] = [];
  try {
    events = await deps.db.operationalEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { id: true, eventType: true, relatedProofId: true, relatedActionId: true, category: true, severity: true, status: true, source: true, description: true, occurredAt: true, createdAt: true, resolvedAt: true, updatedAt: true, estimatedImpactAmount: true, impactConfidence: true },
      orderBy: { createdAt: "desc" }, take: 5000,
    });
  } catch (e) {
    if (!(e && typeof e === "object" && (e as { code?: string }).code === "P2021")) throw e;
  }

  const proofIds = [...new Set(events.map((e) => e.relatedProofId).filter((id): id is string => !!id))];
  const proofs: ProofRow[] = proofIds.length > 0
    ? await deps.db.proof.findMany({ where: { workspaceId, id: { in: proofIds } }, select: { id: true, status: true, submittedByUserId: true } })
    : [];

  const rows: OperationalEventRow[] = events.map((e) => ({ ...e }));
  const linkedProofs: LinkedProofRow[] = proofs.map((p) => ({ id: p.id, status: p.status, submittedByUserId: p.submittedByUserId }));
  return buildComplaintReworkAnalysis(workspaceId, rows, linkedProofs, evaluatedAt);
}
