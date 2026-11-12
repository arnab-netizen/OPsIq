/**
 * The unattended FIRST read, source-agnostic. Whatever produced the canonical evidence (QuickBooks sync, owner entry), "is this
 * business waiting for its first diagnosis, and on which figures?" is answered by the ONE first-run router from persisted facts,
 * and the read itself is the repository's own runFinanceDiagnosis. This module adds no engine and no rule: it composes the two.
 *
 * Safe to run any number of times, concurrently, after a crash, or after the owner has already seen the read:
 *   - not waiting (no sufficient evidence yet / a read already exists / not a real business) -> NOT_PENDING, nothing written;
 *   - waiting -> runFinanceDiagnosis({ firstDiagnosisOnly }), which replays the cycle already committed for the SAME figures and
 *     refuses (ConflictError -> EVIDENCE_MOVED) rather than answer for different evidence; allowance is spent at most once.
 */
import { ConflictError, NotFoundError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { reconcileDataGapTasksAfterDiagnosis } from "@/services/owner-mode/process-execution-bridge.service";
import { getFirstRunContext, recordProductEventOnce } from "@/services/owner-first-run/first-run.service";
import type { FirstRunState } from "@/domain/owner-first-run/first-run-router";

export type FirstDiagnosisOutcome =
  | { status: "DIAGNOSED"; cycleId: string }
  | { status: "NOT_PENDING"; state: FirstRunState | "NO_REAL_BUSINESS" }
  | { status: "EVIDENCE_MOVED" };

export async function runFirstDiagnosisIfPending(input: { workspaceId: string; businessId: string; actorId: string }): Promise<FirstDiagnosisOutcome> {
  const { workspaceId, businessId, actorId } = input;
  let ctx;
  try {
    ctx = await getFirstRunContext(workspaceId, businessId);
  } catch (e) {
    // A fixture / inactive / foreign business is not served by first-run: never diagnosed unattended.
    if (e instanceof NotFoundError) return { status: "NOT_PENDING", state: "NO_REAL_BUSINESS" };
    throw e;
  }
  if (ctx.state !== "NEEDS_DIAGNOSIS" || !ctx.currentSnapshotId) return { status: "NOT_PENDING", state: ctx.state };
  try {
    const cycle = await runFinanceDiagnosis(businessId, ctx.currentSnapshotId, actorId, workspaceId, { firstDiagnosisOnly: true });
    // Same follow-ups the interactive route performs (both idempotent / best-effort).
    await reconcileDataGapTasksAfterDiagnosis(workspaceId, businessId, actorId);
    await recordProductEventOnce({ name: "first_diagnosis_completed", eventName: AUDIT_EVENTS.PRODUCT_FIRST_DIAGNOSIS_COMPLETED, workspaceId, actorId, businessId });
    return { status: "DIAGNOSED", cycleId: (cycle as { id: string }).id };
  } catch (e) {
    if (e instanceof ConflictError) return { status: "EVIDENCE_MOVED" };
    throw e;
  }
}
