/**
 * Proof ↔ Outcome Linkage service (owner-callable, DB-backed).
 *
 * Fetches the workspace-scoped `proof.reviewed` audit trail (the server-authoritative record of
 * every proof transition) and the Proof rows, then runs the pure linkage domain module to
 * measure accepted-proof → contradiction / rework links. Workspace-scoped and bounded to a
 * rolling 90-day window (same window as the control-correlation service). No timestamp is
 * fabricated — contradiction timestamps come from audit `occurredAt`.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  buildProofOutcomeLinkage,
  type ProofOutcomeLinkageReport,
  type ProofReviewAuditRow,
  type LinkageProofRow,
} from "@/domain/owner-mode/proof-outcome-linkage";

export const PROOF_OUTCOME_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface FindManyArgs {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
  orderBy?: Record<string, unknown>;
  take?: number;
}
interface AuditRow { id: string; entityId: string | null; occurredAt: Date; actorId: string | null; payload: unknown }
interface ProofRow { id: string; submittedByUserId: string | null; proofType: string; taskId: string | null; resubmissionOfId: string | null; status: string; createdAt: Date }
interface EventRow { eventType: string; relatedProofId: string | null }

export interface ProofOutcomeDb {
  auditEvent: { findMany(a: FindManyArgs): Promise<AuditRow[]> };
  proof: { findMany(a: FindManyArgs): Promise<ProofRow[]> };
  /** Optional — present on the live client; enables proof→complaint/rework measurability. */
  operationalEvent?: { findMany(a: FindManyArgs): Promise<EventRow[]> };
}

export interface ProofOutcomeDeps {
  db: ProofOutcomeDb;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<ProofOutcomeDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as ProofOutcomeDb, now: () => Date.now() };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return fallback;
    throw e;
  }
}

/** Read fromStatus/toStatus off a `proof.reviewed` audit payload (Json), defensively. */
function readTransition(payload: unknown): { fromStatus: string | null; toStatus: string | null } {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    return {
      fromStatus: typeof p.fromStatus === "string" ? p.fromStatus : null,
      toStatus: typeof p.toStatus === "string" ? p.toStatus : null,
    };
  }
  return { fromStatus: null, toStatus: null };
}

/** Build the live proof→outcome linkage report for a workspace. */
export async function getProofOutcomeLinkage(
  workspaceId: string,
  injected?: ProofOutcomeDeps
): Promise<ProofOutcomeLinkageReport> {
  const deps = injected ?? (await resolveDefaultDeps());
  const nowMs = deps.now();
  const since = new Date(nowMs - PROOF_OUTCOME_WINDOW_MS);
  const evaluatedAt = new Date(nowMs).toISOString();

  const [auditRows, proofRows] = await Promise.all([
    safe(deps.db.auditEvent.findMany({
      where: { workspaceId, entityType: "proof", eventName: AUDIT_EVENTS.PROOF_REVIEWED, occurredAt: { gte: since } },
      select: { id: true, entityId: true, occurredAt: true, actorId: true, payload: true },
      orderBy: { occurredAt: "asc" }, take: 5000,
    }), [] as AuditRow[]),
    safe(deps.db.proof.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { id: true, submittedByUserId: true, proofType: true, taskId: true, resubmissionOfId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 5000,
    }), [] as ProofRow[]),
  ]);

  const reviewAudits: ProofReviewAuditRow[] = auditRows
    .filter((a) => a.entityId != null)
    .map((a) => {
      const { fromStatus, toStatus } = readTransition(a.payload);
      return { id: a.id, proofId: a.entityId as string, occurredAt: a.occurredAt, actorId: a.actorId, fromStatus, toStatus };
    });
  const proofs: LinkageProofRow[] = proofRows.map((p) => ({
    id: p.id, submittedByUserId: p.submittedByUserId, proofType: p.proofType,
    taskId: p.taskId, resubmissionOfId: p.resubmissionOfId, status: p.status, createdAt: p.createdAt,
  }));

  // Complaint/rework events linked to an accepted-class proof → flip proof→complaint/rework
  // measurable + fold into the integrity measurement. Only on the live client (operationalEvent present).
  let linkedComplaintCount = 0;
  let linkedReworkCount = 0;
  if (typeof deps.db.operationalEvent?.findMany === "function") {
    const acceptedClass = new Set(proofRows.filter((p) => ["ACCEPTED", "DISPUTED", "OVERRIDDEN_NOT_VERIFIED"].includes(p.status)).map((p) => p.id));
    const events = await safe(deps.db.operationalEvent.findMany({
      where: { workspaceId, relatedProofId: { not: null }, createdAt: { gte: since } },
      select: { eventType: true, relatedProofId: true }, take: 5000,
    }), [] as EventRow[]);
    for (const e of events) {
      if (!e.relatedProofId || !acceptedClass.has(e.relatedProofId)) continue;
      if (e.eventType === "COMPLAINT") linkedComplaintCount++;
      else if (e.eventType === "REWORK") linkedReworkCount++;
    }
  }

  return buildProofOutcomeLinkage({ workspaceId, reviewAudits, proofs, linkedComplaintCount, linkedReworkCount, nowMs, evaluatedAt });
}
