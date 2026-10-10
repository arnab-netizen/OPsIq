/**
 * First-run actions that mutate governed records. Every mutation goes through the canonical service for that
 * record (decision recording, snapshot amendment, finance diagnosis) — this file only sequences them and
 * emits the funnel events.
 */
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { emitAuditEvent } from "@/infra/audit";
import { ConflictError, ValidationError } from "@/infra/errors";
import type { FinancialSnapshotAmendInput } from "@/domain/owner-finance/validation";
import { amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { reconcileDataGapTasksAfterDiagnosis } from "@/services/owner-mode/process-execution-bridge.service";
import { recordOwnerDecision } from "@/services/owner-outcome/owner-decision.service";
import { checkPgRateLimit } from "@/infra/rate-limiter-pg";
import {
  getFirstMoneyRead,
  getFirstRunContext,
  recordActivationIfFirst,
  recordProductEventOnce,
  type FirstMoneyReadView,
} from "@/services/owner-first-run/first-run.service";
import { recordProductEvent } from "@/services/analytics/product-events.service";

export async function acceptFirstResultAction(
  workspaceId: string, actorId: string, businessId: string, idempotencyKey: string,
) {
  const view = await getFirstMoneyRead(workspaceId, businessId);
  if (view.stale) {
    throw new ConflictError("Your numbers changed after this read. Refresh your read before using it.");
  }
  if (!view.candidateId || !view.presentedAction || !view.read.canAccept) {
    throw new ValidationError(
      view.read.acceptNote ?? "There is no recommended action to accept yet.",
      { fieldErrors: [] },
    );
  }
  const action = view.presentedAction;
  const result = await recordOwnerDecision(workspaceId, actorId, businessId, {
    candidateId: view.candidateId,
    state: "ACCEPTED",
    idempotencyKey: `first-run-accept:${idempotencyKey}`,
    contract: {
      commitmentDescription: action.title,
      verificationMetric: action.verificationMetric,
      observationWindowDays: Math.max(1, action.expectedTimeframeDays),
      // A read built on estimates is not authoritative evidence: later verification must not treat it as measured truth.
      expectedMeasurementSource: view.read.isEstimated ? "OWNER_ENTERED" : "AUTHORITATIVE_SNAPSHOT",
    },
  });
  if (!result.replayed) {
    await recordProductEvent({
      name: "first_result_action_accepted", workspaceId, actorId, businessId,
      props: { evidenceQuality: view.read.evidenceQuality ?? undefined, confidenceTier: view.read.confidenceTier },
    });
    await recordActivationIfFirst(workspaceId, actorId, businessId);
  }
  return { decision: result.decision, replayed: result.replayed, candidateId: view.candidateId };
}

export interface CorrectionResult {
  before: Pick<FirstMoneyReadView["read"], "noticed" | "actualValue" | "confidenceTier" | "recommendedAction" | "evidenceQuality">;
  after: FirstMoneyReadView;
  changedFields: string[];
  newSnapshotId: string;
  previousSnapshotId: string;
}

/**
 * Correct the evidence behind the first read. The canonical amendment appends a new snapshot version (the
 * superseded one is retained), then the canonical diagnosis is re-run on it and the changed read is returned.
 * If the re-run fails the amendment stands and the read is reported stale, never silently kept as current.
 */
export async function correctFirstResultEvidence(
  workspaceId: string, actorId: string, businessId: string, snapshotId: string, amend: FinancialSnapshotAmendInput,
): Promise<CorrectionResult> {
  const beforeView = await getFirstMoneyRead(workspaceId, businessId);
  if (beforeView.snapshotId !== snapshotId) {
    throw new ConflictError("This read has already been corrected. Reload to see the latest.");
  }
  const rate = await checkPgRateLimit(`diag:${businessId}`, { capacity: 10, refillPerSecond: 10 / 3600 });
  if (!rate.allowed) {
    throw new ConflictError("Too many corrections in a short time. Please try again in a few minutes.");
  }

  const { snapshot, previousSnapshotId } = await amendFinancialSnapshot(snapshotId, amend, actorId, workspaceId);
  const newSnapshotId = (snapshot as { id: string } | null)?.id;
  if (!newSnapshotId) throw new ConflictError("The correction could not be saved. Please try again.");
  const changedFields = Object.keys(amend).filter((k) => k !== "amendmentReason" && (amend as Record<string, unknown>)[k] !== undefined);

  await runFinanceDiagnosis(businessId, newSnapshotId, actorId, workspaceId);
  await reconcileDataGapTasksAfterDiagnosis(workspaceId, businessId, actorId);

  const after = await getFirstMoneyRead(workspaceId, businessId);
  await recordProductEvent({
    name: "first_result_corrected", workspaceId, actorId, businessId,
    props: { evidenceQuality: after.read.evidenceQuality ?? undefined, confidenceTier: after.read.confidenceTier },
  });
  await recordActivationIfFirst(workspaceId, actorId, businessId);

  return {
    before: {
      noticed: beforeView.read.noticed,
      actualValue: beforeView.read.actualValue,
      confidenceTier: beforeView.read.confidenceTier,
      recommendedAction: beforeView.read.recommendedAction,
      evidenceQuality: beforeView.read.evidenceQuality,
    },
    after,
    changedFields,
    newSnapshotId,
    previousSnapshotId,
  };
}

/** cockpit_reached once per workspace; returning_owner once per UTC day when the owner is established and it is not the same day. */
export async function recordCockpitVisit(workspaceId: string, actorId: string): Promise<void> {
  await recordProductEventOnce({
    name: "cockpit_reached", eventName: AUDIT_EVENTS.PRODUCT_COCKPIT_REACHED, workspaceId, actorId,
  });
  const ctx = await getFirstRunContext(workspaceId);
  if (ctx.state !== "ESTABLISHED" || !ctx.firstTrustedInteractionAt) return;
  const since = new Date(ctx.firstTrustedInteractionAt).getTime();
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  if (since >= dayStart.getTime()) return; // same day as activation: not a return
  const { getAuditEventReadOnlyClient } = await import("@/infra/audit");
  const already = await getAuditEventReadOnlyClient().findFirst({
    where: { workspaceId, eventName: AUDIT_EVENTS.PRODUCT_RETURNING_OWNER, occurredAt: { gte: dayStart } },
    select: { id: true },
  });
  if (already) return;
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.PRODUCT_RETURNING_OWNER, workspaceId, actorId, payload: {}, visibility: "internal",
  });
}
