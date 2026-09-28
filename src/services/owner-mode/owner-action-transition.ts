/**
 * Concurrency-safe, atomic owner action updates (all nine owner action services).
 *
 * An action service validates a status transition against the row it READ (canTransition(from, to)). A plain
 * `update where { id }` would then apply that transition even if another request moved the action in
 * between. So every update:
 *   1. is classified against the row as read (classifyActionRequest), BEFORE the safety gate:
 *      - an exact replay of the action's current state (same status, same data) is an idempotent no-op — no
 *        gate, no write, no audit;
 *      - a completed or cancelled action is terminal: its record (notes, evidence, assignee) is never
 *        rewritten — any change is refused;
 *   2. is applied with a compare-and-set on the status (and, where the model has one, the version) it was
 *      validated against, INSIDE one transaction with its audit event(s), the accepted gate assessment and
 *      any dependent write — they commit together or not at all (an audit failure rolls the transition back,
 *      so a retry is not refused as an invalid "completed → completed");
 *   3. on a lost race:
 *      - the action is now exactly what this request asked for (same status AND the same data) → an identical
 *        concurrent request applied it: { transitioned: false }, nothing repeated;
 *      - anything else — another status, or the same status with DIFFERENT data (this request's data was not
 *        applied) → ConflictError (409): reload and retry. "Applied" is never reported for dropped data.
 */
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { emitAuditEvent, type AuditEventInput } from "@/infra/audit";
import { recordOwnerGateAssessment, type OwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import type { Prisma } from "@/generated/prisma/client";

/** Statuses whose record is final (the shared action status machine's terminal states). */
export const TERMINAL_ACTION_STATUSES: ReadonlySet<string> = new Set(["completed", "cancelled"]);

const STATUS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  proposed: "proposed", assigned: "assigned", in_progress: "in progress", blocked: "blocked", completed: "completed", cancelled: "cancelled",
});
function statusWords(s: string): string {
  return STATUS_WORDS[s] ?? "changed";
}

function normalize(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, normalize((v as Record<string, unknown>)[k])]));
  }
  return v === undefined ? null : v;
}

/** Whether every field the request sets already holds exactly that value on the row. */
export function requestMatchesRow(row: Record<string, unknown>, request: Record<string, unknown>): boolean {
  return Object.entries(request).every(([k, v]) => v === undefined || JSON.stringify(normalize(row[k])) === JSON.stringify(normalize(v)));
}

/**
 * Classify an update request against the action as read (step 1 above). `request` holds only the fields the
 * caller sent (status and the owner-supplied data fields). Returns "replay" for an exact no-op, "apply"
 * otherwise; throws ValidationError for any change to a terminal action.
 */
export function classifyActionRequest(action: { status: string } & Record<string, unknown>, request: Record<string, unknown>): "replay" | "apply" {
  const sent = Object.fromEntries(Object.entries(request).filter(([, v]) => v !== undefined));
  const sameStatus = sent.status === undefined || sent.status === action.status;
  if (sameStatus && requestMatchesRow(action, sent)) return "replay";
  if (TERMINAL_ACTION_STATUSES.has(action.status)) {
    if (sent.status !== undefined && sent.status !== action.status) return "apply"; // the status machine refuses it
    throw new ValidationError(`This action is ${statusWords(action.status)}; its record can no longer be changed.`);
  }
  return "apply";
}

type TxDelegate<T> = {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findFirst(args: { where: { id: string; workspaceId: string } }): Promise<T | null>;
};

export interface GuardedActionTransition<T> {
  /** The Prisma delegate name of the action model (e.g. "ownerFinanceAction"). */
  model: string;
  entity: string;
  actionId: string;
  workspaceId: string;
  /** The status the transition was validated against (the row as read). */
  expectedStatus: string;
  /** The version the update was validated against, for models that carry one. */
  expectedVersion?: number;
  /** The fields to write. */
  data: Record<string, unknown>;
  /** The fields the request itself set (status included when sent) — what a lost race is compared on. */
  request: Record<string, unknown>;
  /** The audit events of an applied update, written in the same transaction. */
  audits: (row: T) => AuditEventInput[];
  /** The gate's accepted assessment, recorded in the same transaction once the update is applied. */
  gateAssessment?: OwnerGateAssessment | null;
  /**
   * Dependent writes of an applied update (e.g. Budget's outcome record), in the same transaction; may return
   * the row as re-read after them.
   */
  inTransaction?: (tx: Prisma.TransactionClient, row: T) => Promise<T | void>;
  /**
   * The state a lost race is compared on, when the request carries data stored beside the action row (Budget's
   * outcome inputs); defaults to the row itself.
   */
  compareRow?: (tx: Prisma.TransactionClient, row: T) => Promise<Record<string, unknown>>;
}

/** Apply an owner action update atomically (steps 2–3 in the module doc). */
export async function applyGuardedActionTransition<T extends { status: string }>(
  u: GuardedActionTransition<T>
): Promise<{ row: T; transitioned: boolean }> {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const delegate = (tx as unknown as Record<string, TxDelegate<T>>)[u.model];
    const where: Record<string, unknown> = { id: u.actionId, workspaceId: u.workspaceId, status: u.expectedStatus };
    if (u.expectedVersion !== undefined) where.version = u.expectedVersion;
    const res = await delegate.updateMany({ where, data: u.data });
    const row = await delegate.findFirst({ where: { id: u.actionId, workspaceId: u.workspaceId } });
    if (!row) throw new NotFoundError(u.entity, u.actionId);
    if (res.count === 1) {
      for (const a of u.audits(row)) await emitAuditEvent(a, tx);
      if (u.gateAssessment) await recordOwnerGateAssessment(u.gateAssessment, tx);
      const after = u.inTransaction ? await u.inTransaction(tx, row) : undefined;
      return { row: after ?? row, transitioned: true };
    }
    const sent = Object.fromEntries(Object.entries(u.request).filter(([, v]) => v !== undefined));
    const compare = u.compareRow ? await u.compareRow(tx, row) : (row as unknown as Record<string, unknown>);
    if (sent.status !== undefined && requestMatchesRow(compare, sent)) return { row, transitioned: false };
    throw new ConflictError(`This action was changed by another request (it is now ${statusWords(row.status)}). Reload and retry.`, {
      expectedStatus: u.expectedStatus,
      currentStatus: row.status,
    });
  });
}
