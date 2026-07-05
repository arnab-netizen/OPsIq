/**
 * Runtime Control Correlation service (owner-callable, DB-backed).
 *
 * Fetches the workspace-scoped source rows and the audit records they must produce, then runs
 * the pure correlation domain module to measure real runtime linkage + latency. All queries are
 * workspace-scoped (shocks via engagement.workspaceId) and bounded to a rolling 90-day window so
 * the measurement is a live SLO window, not an unbounded scan. No timestamp is fabricated — every
 * latency comes from two persisted timestamps.
 *
 * Feeds the Business-Control SLOs (AUDIT_DURABILITY, REASSESSMENT_LATENCY, SHOCK_HANDLING_LATENCY)
 * with measured values, converting them from NOT_MEASURABLE to PASS/WARN/FAIL.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  buildControlCorrelationReport,
  type ControlCorrelationReport,
  type ReassessmentRow,
  type ShockRow,
  type ShockAuditRow,
} from "@/domain/owner-mode/control-correlation";

/** Rolling measurement window — bounds every scan and defines the SLO window. */
export const CORRELATION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface FindManyArgs {
  where: Record<string, unknown>;
  select?: Record<string, boolean>;
  orderBy?: Record<string, unknown>;
  take?: number;
}
interface CountArgs {
  where: Record<string, unknown>;
}

interface ReassessmentDelegateRow { id: string; trigger: string; status: string; createdAt: Date; updatedAt: Date }
interface ShockDelegateRow { id: string; type: string; severity: string; createdAt: Date; happenedAt: Date; createdBy: string | null }
interface AuditDelegateRow { id: string; eventName: string; entityId: string | null; occurredAt: Date; actorId: string | null }

export interface CorrelationDb {
  ownerReassessmentEvent: { findMany(a: FindManyArgs): Promise<ReassessmentDelegateRow[]> };
  shockEvent: { findMany(a: FindManyArgs): Promise<ShockDelegateRow[]> };
  auditEvent: { findMany(a: FindManyArgs): Promise<AuditDelegateRow[]> };
  proof: { count(a: CountArgs): Promise<number> };
}

export interface CorrelationDeps {
  db: CorrelationDb;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<CorrelationDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as CorrelationDb, now: () => Date.now() };
}

/**
 * A missing optional table (Prisma P2021) means "signal unavailable" → empty; any other error
 * is a real fault and rethrows. Mirrors the now-view's safeCount contract.
 */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return fallback;
    throw e;
  }
}

/** Build the live control-correlation report for a workspace. */
export async function getControlCorrelations(
  workspaceId: string,
  injected?: CorrelationDeps
): Promise<ControlCorrelationReport> {
  const deps = injected ?? (await resolveDefaultDeps());
  const nowMs = deps.now();
  const since = new Date(nowMs - CORRELATION_WINDOW_MS);
  const evaluatedAt = new Date(nowMs).toISOString();

  const [reassessRows, shockRows, recordedAudits, handlingAudits, totalProof, tamperSuspectedCount] = await Promise.all([
    safe(deps.db.ownerReassessmentEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { id: true, trigger: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" }, take: 1000,
    }), [] as ReassessmentDelegateRow[]),
    safe(deps.db.shockEvent.findMany({
      where: { engagement: { workspaceId }, createdAt: { gte: since } },
      select: { id: true, type: true, severity: true, createdAt: true, happenedAt: true, createdBy: true },
      orderBy: { createdAt: "desc" }, take: 1000,
    }), [] as ShockDelegateRow[]),
    safe(deps.db.auditEvent.findMany({
      where: { workspaceId, entityType: "ShockEvent", eventName: AUDIT_EVENTS.SHOCK_EVENT_RECORDED, occurredAt: { gte: since } },
      select: { id: true, eventName: true, entityId: true, occurredAt: true, actorId: true },
      orderBy: { occurredAt: "asc" }, take: 2000,
    }), [] as AuditDelegateRow[]),
    safe(deps.db.auditEvent.findMany({
      where: { workspaceId, entityType: "ShockEvent", eventName: AUDIT_EVENTS.CONDITION_CHANGED, occurredAt: { gte: since } },
      select: { id: true, eventName: true, entityId: true, occurredAt: true, actorId: true },
      orderBy: { occurredAt: "asc" }, take: 2000,
    }), [] as AuditDelegateRow[]),
    safe(deps.db.proof.count({ where: { workspaceId } }), 0),
    safe(deps.db.proof.count({ where: { workspaceId, tamperSuspected: true } }), 0),
  ]);

  const reassessments: ReassessmentRow[] = reassessRows.map((r) => ({
    id: r.id, trigger: r.trigger, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, actorId: null,
  }));
  const shocks: ShockRow[] = shockRows.map((s) => ({
    id: s.id, type: s.type, severity: s.severity, createdAt: s.createdAt, happenedAt: s.happenedAt, actorId: s.createdBy,
  }));
  const toAudit = (a: AuditDelegateRow): ShockAuditRow => ({
    id: a.id, eventName: a.eventName, entityId: a.entityId, occurredAt: a.occurredAt, actorId: a.actorId,
  });

  return buildControlCorrelationReport({
    workspaceId,
    reassessments,
    shocks,
    shockRecordedAudits: recordedAudits.map(toAudit),
    shockHandlingAudits: handlingAudits.map(toAudit),
    totalProof,
    tamperSuspectedCount,
    nowMs,
    evaluatedAt,
  });
}
