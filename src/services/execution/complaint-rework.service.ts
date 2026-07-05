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

export const COMPLAINT_REWORK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface EventRow { id: string; eventType: string; relatedProofId: string | null; relatedActionId: string | null; category: string; severity: string; status: string; source: string; description: string; occurredAt: Date | null; createdAt: Date; estimatedImpactAmount: number | null; impactConfidence: string }
interface ProofRow { id: string; status: string; submittedByUserId: string | null }

interface EventDelegate {
  findFirst(a: { where: Record<string, unknown>; select?: Record<string, boolean> }): Promise<{ id: string; workspaceId: string; relatedProofId: string | null } | null>;
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
      select: { id: true, eventType: true, relatedProofId: true, relatedActionId: true, category: true, severity: true, status: true, source: true, description: true, occurredAt: true, createdAt: true, estimatedImpactAmount: true, impactConfidence: true },
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
