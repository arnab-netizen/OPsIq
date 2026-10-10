/**
 * First-run actions that mutate governed records. Every mutation goes through the canonical service for that
 * record (decision recording, snapshot amendment, finance diagnosis) — this file only sequences them and
 * emits the funnel events.
 */
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { emitAuditEvent } from "@/infra/audit";
import { ConflictError, ValidationError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";
import { READ_STALE_CODE, READ_STALE_MESSAGE as STALE_READ_COPY } from "@/domain/owner-first-run/read-staleness";
import { isReadCurrentForWrite } from "@/services/owner-first-run/first-run-evidence.reader";
import { isAuthoritativeEvidence } from "@/domain/owner-finance/evidence-quality";
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
import { logger } from "@/infra/logger";
import { db } from "@/lib/db";
import { describeFailure } from "@/services/owner-first-run/first-run.service";

/**
 * Accept the recommendation the owner is LOOKING AT. `readCycleId` names that read; the server never trusts the
 * client's idea of freshness. Staleness is decided twice: up front (cheap, gives a clear message), and again inside
 * the decision transaction under a share lock on the snapshot (compare-at-write), so a concurrent amendment cannot
 * slip between the check and the commit. Amendment takes the same row FOR UPDATE, so exactly one of them wins.
 */
export async function acceptFirstResultAction(
  workspaceId: string, actorId: string, businessId: string, idempotencyKey: string, readCycleId: string,
) {
  // A retry of a request that already committed (lost response, double tap) is a replay of THAT decision even if the
  // figures changed afterwards: answering "your numbers changed" would contradict a decision that is on record.
  const prior = await db.ownerDecisionRecord.findFirst({ where: { workspaceId, idempotencyKey: `first-run-accept:${idempotencyKey}` } });
  if (prior && prior.businessId === businessId) {
    return { decision: prior, replayed: true, candidateId: prior.candidateId };
  }
  const view = await readForAcceptance(workspaceId, businessId, readCycleId);
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
      // Only evidence the owner stated is from their records is authoritative. Estimates AND legacy/unspecified (NULL)
      // provenance are owner-entered: later verification must not treat them as measured truth.
      expectedMeasurementSource: isAuthoritativeEvidence(view.read.evidenceQuality) ? "AUTHORITATIVE_SNAPSHOT" : "OWNER_ENTERED",
    },
  }, {
    guard: (tx) => assertReadStillCurrent(tx, workspaceId, businessId, view.snapshotId, view.cycleId),
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

function readStale(): ConflictError {
  return new ConflictError(STALE_READ_COPY, { code: READ_STALE_CODE });
}

/** The read as it is NOW, refused unless it is the very read the owner saw. */
async function readForAcceptance(workspaceId: string, businessId: string, readCycleId: string): Promise<FirstMoneyReadView> {
  let view: FirstMoneyReadView;
  try {
    view = await getFirstMoneyRead(workspaceId, businessId);
  } catch (error) {
    // Amended and not yet re-diagnosed: there is no current read, so the one on screen is stale by definition.
    if (error instanceof ConflictError) throw readStale();
    throw error;
  }
  if (view.cycleId !== readCycleId) throw readStale();
  return view;
}

/** Compare-at-write, inside the decision transaction (see isReadCurrentForWrite for what is checked and locked). */
async function assertReadStillCurrent(
  tx: Prisma.TransactionClient, workspaceId: string, businessId: string, snapshotId: string, cycleId: string,
): Promise<void> {
  if (!(await isReadCurrentForWrite(tx, workspaceId, businessId, snapshotId, cycleId))) throw readStale();
}

export interface CorrectionResult {
  before: Pick<FirstMoneyReadView["read"], "noticed" | "actualValue" | "confidenceTier" | "recommendedAction" | "evidenceQuality">;
  /** The re-run read, or null when the corrected numbers were saved but the diagnosis could not be re-run. */
  after: FirstMoneyReadView | null;
  /** True when the amendment committed but the read could not be re-run: the previous read no longer applies. */
  diagnosisFailed: boolean;
  changedFields: string[];
  newSnapshotId: string;
  previousSnapshotId: string;
}

/**
 * Correct the evidence behind the first read. The canonical amendment appends a new snapshot version (the
 * superseded one is retained), then the canonical diagnosis is re-run on it and the changed read is returned.
 * Amendment and diagnosis are separate committed steps in the canonical architecture, so they are not rolled back
 * together: once the amendment commits, a failed re-run is reported as `diagnosisFailed` (the corrected numbers ARE
 * saved; the previous read is stale and cannot be shown or accepted), never as a failed correction.
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
  const amended = snapshot as { id: string; changedFields?: unknown } | null;
  const newSnapshotId = amended?.id;
  if (!newSnapshotId) throw new ConflictError("The correction could not be saved. Please try again.");
  // What the governed amendment actually recorded (includes an implicit evidence-quality step-down), not what was asked.
  const changedFields = Array.isArray(amended?.changedFields)
    ? (amended.changedFields as unknown[]).filter((k): k is string => typeof k === "string")
    : Object.keys(amend).filter((k) => k !== "amendmentReason" && (amend as Record<string, unknown>)[k] !== undefined);
  const before = {
    noticed: beforeView.read.noticed,
    actualValue: beforeView.read.actualValue,
    confidenceTier: beforeView.read.confidenceTier,
    recommendedAction: beforeView.read.recommendedAction,
    evidenceQuality: beforeView.read.evidenceQuality,
  };

  let after: FirstMoneyReadView;
  try {
    await runFinanceDiagnosis(businessId, newSnapshotId, actorId, workspaceId);
    // Best-effort bookkeeping: a failure here must not turn a diagnosis that DID run into "the read could not be updated".
    await reconcileDataGapTasksAfterDiagnosis(workspaceId, businessId, actorId).catch((error) =>
      logger.warn("data-gap reconcile after correction failed", undefined, { businessId, error: describeFailure(error) }),
    );
    after = await getFirstMoneyRead(workspaceId, businessId);
  } catch (error) {
    logger.warn("first-result correction saved; diagnosis re-run failed", undefined, { businessId, error: describeFailure(error) });
    await recordActivationIfFirst(workspaceId, actorId, businessId);
    return { before, after: null, diagnosisFailed: true, changedFields, newSnapshotId, previousSnapshotId };
  }
  await recordProductEvent({
    name: "first_result_corrected", workspaceId, actorId, businessId,
    props: { evidenceQuality: after.read.evidenceQuality ?? undefined, confidenceTier: after.read.confidenceTier },
  });
  await recordActivationIfFirst(workspaceId, actorId, businessId);

  return { before, after, diagnosisFailed: false, changedFields, newSnapshotId, previousSnapshotId };
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
