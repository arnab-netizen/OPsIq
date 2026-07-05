/**
 * Dispute → Business Risk service (owner-callable, DB-backed).
 *
 * Reads the workspace-scoped `proof.disputed` audit trail (the governed dispute record written by
 * the dispute service) and runs the pure dispute-risk domain module to map dispute categories into
 * Profit-Leak + Constraint signals. Workspace-scoped, bounded to a rolling 90-day window. Invents
 * no complaint/rework rows — the category + reason come straight from the persisted dispute event.
 */

import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  buildDisputeRiskAnalysis,
  type DisputeRiskAnalysis,
  type DisputeRecordInput,
} from "@/domain/owner-mode/dispute-risk";

export const DISPUTE_RISK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

interface FindManyArgs { where: Record<string, unknown>; select?: Record<string, boolean>; orderBy?: Record<string, unknown>; take?: number }
interface AuditRow { id: string; entityId: string | null; occurredAt: Date; payload: unknown }

export interface DisputeRiskDb {
  auditEvent: { findMany(a: FindManyArgs): Promise<AuditRow[]> };
}
export interface DisputeRiskDeps {
  db: DisputeRiskDb;
  now: () => number;
}

async function resolveDefaultDeps(): Promise<DisputeRiskDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as DisputeRiskDb, now: () => Date.now() };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return fallback;
    throw e;
  }
}

function readDispute(payload: unknown): { category: string | null; reason: string } {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    return {
      category: typeof p.disputeCategory === "string" ? p.disputeCategory : null,
      reason: typeof p.reason === "string" ? p.reason : "",
    };
  }
  return { category: null, reason: "" };
}

/** Build the live dispute-risk analysis for a workspace. */
export async function getDisputeRiskAnalysis(
  workspaceId: string,
  injected?: DisputeRiskDeps
): Promise<DisputeRiskAnalysis> {
  const deps = injected ?? (await resolveDefaultDeps());
  const nowMs = deps.now();
  const since = new Date(nowMs - DISPUTE_RISK_WINDOW_MS);
  const evaluatedAt = new Date(nowMs).toISOString();

  const rows = await safe(deps.db.auditEvent.findMany({
    where: { workspaceId, entityType: "proof", eventName: AUDIT_EVENTS.PROOF_DISPUTED, occurredAt: { gte: since } },
    select: { id: true, entityId: true, occurredAt: true, payload: true },
    orderBy: { occurredAt: "desc" }, take: 5000,
  }), [] as AuditRow[]);

  const records: DisputeRecordInput[] = rows
    .filter((r) => r.entityId != null)
    .map((r) => {
      const { category, reason } = readDispute(r.payload);
      return { proofId: r.entityId as string, disputeCategory: category ?? "OTHER", reason, auditEventId: r.id, occurredAt: r.occurredAt };
    });

  return buildDisputeRiskAnalysis(workspaceId, records, evaluatedAt);
}
