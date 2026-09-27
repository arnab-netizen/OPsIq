/**
 * Concurrency-safe owner action updates (all nine owner action services).
 *
 * An action service validates a status transition against the row it READ (canTransition(from, to)). A plain
 * `update where { id }` would then apply that transition even if another request moved the action in
 * between — a double-submitted "complete" would run twice (two completion audits, two re-diagnoses, two
 * outcome records) and a stale transition could overwrite a newer state. This applies the update with a
 * compare-and-set on the status (and, where the model has one, the version) the transition was validated
 * against, and requires exactly one affected row:
 *   - applied → { row, transitioned: true } — the caller emits its audit and side effects;
 *   - lost the race and the action is ALREADY in the requested status (an identical concurrent request did
 *     it) → { row, transitioned: false } — idempotent: the caller returns the row without repeating any
 *     audit or side effect;
 *   - lost the race to a different state → ConflictError (409): reload and retry.
 */
import { ConflictError, NotFoundError } from "@/infra/errors";

export interface GuardedActionDelegate<T> {
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  findFirst(args: { where: { id: string; workspaceId: string } }): Promise<T | null>;
}

export interface GuardedActionUpdate {
  entity: string;
  actionId: string;
  workspaceId: string;
  /** The status the transition was validated against (the row as read). */
  expectedStatus: string;
  /** The requested status, when the update changes it. */
  toStatus?: string;
  /** The version the update was validated against, for models that carry one. */
  expectedVersion?: number;
  data: Record<string, unknown>;
}

export async function applyGuardedActionUpdate<T extends { status: string }>(
  delegate: GuardedActionDelegate<T>,
  u: GuardedActionUpdate
): Promise<{ row: T; transitioned: boolean }> {
  const where: Record<string, unknown> = { id: u.actionId, workspaceId: u.workspaceId, status: u.expectedStatus };
  if (u.expectedVersion !== undefined) where.version = u.expectedVersion;
  const res = await delegate.updateMany({ where, data: u.data });
  const row = await delegate.findFirst({ where: { id: u.actionId, workspaceId: u.workspaceId } });
  if (!row) throw new NotFoundError(u.entity, u.actionId);
  if (res.count === 1) return { row, transitioned: true };
  if (u.toStatus !== undefined && row.status === u.toStatus) return { row, transitioned: false };
  throw new ConflictError(`This action was changed by another request (it is now ${row.status}). Reload and retry.`, {
    expectedStatus: u.expectedStatus,
    currentStatus: row.status,
  });
}
