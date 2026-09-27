/**
 * Dynamic Budget — cross-module signal router (Slice 6, DB/service layer).
 *
 * Delivers the budget plan's emitted `signals` to real consumers after a
 * reassessment, reusing existing mechanisms only:
 *
 * 1. Every routed signal is recorded as an `OWNER_BUDGET_SIGNAL_ROUTED` audit
 *    event (correlationId = reassessmentId). The audit/owner-risk ledger is the
 *    universal consumer; governance/override/data-quality signals are consumed
 *    there directly.
 * 2. Financially-material signals additionally trigger a finance re-diagnosis via
 *    the proven finance precedent (best-effort, non-blocking, lazy import). The
 *    refreshed finance cycle feeds business-condition/health on next read.
 * 3. Pull-model domains (sales, operations, marketing, staffing, scale readiness,
 *    external procurement) have no push-consumption interface; their signals are
 *    emitted as safe budget-side audit signals only, with the gap recorded — no
 *    new module, no duplicated snapshot.
 *
 * Idempotent: routing for a given reassessment runs at most once (guarded by the
 * existing routed-audit events for that reassessmentId). The core reassessment is
 * never failed by a routing error — cross-module delivery is advisory.
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { toAuditActor } from "@/domain/owner-budget/system-actor";
import type { BudgetSignal } from "@/domain/owner-budget/types";
import {
  routeBudgetSignals,
  requiresFinanceReDiagnosis,
  type SignalRoute,
  type SignalTargetDomain,
} from "@/domain/owner-budget/signal-routing";
import { currentEffectiveFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";

export interface RouteSignalsParams {
  businessId: string;
  workspaceId: string;
  actorId: string;
  reassessmentId: string;
  signals: BudgetSignal[];
}

export interface SignalRoutingSummary {
  routed: number;
  reDiagnosisTriggered: boolean;
  /** Target domains with no push consumer (safe budget-side signal only). */
  gaps: SignalTargetDomain[];
  /** True when routing was skipped because this reassessment was already routed. */
  alreadyRouted: boolean;
}

/**
 * Route the signals produced by a single reassessment to their real consumers.
 * Best-effort: never throws (caller must not have reassessment failed by routing).
 */
export async function routeReassessmentSignals(params: RouteSignalsParams): Promise<SignalRoutingSummary> {
  const { businessId, workspaceId, actorId, reassessmentId, signals } = params;
  const empty: SignalRoutingSummary = { routed: 0, reDiagnosisTriggered: false, gaps: [], alreadyRouted: false };

  try {
    if (signals.length === 0) return empty;

    // Idempotency: if this reassessment's signals were already routed, do nothing
    // (prevents duplicate cross-module signals on re-invocation).
    const prior = await db.auditEvent.findFirst({
      where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_BUDGET_SIGNAL_ROUTED, correlationId: reassessmentId },
      select: { id: true },
    });
    if (prior) return { ...empty, alreadyRouted: true };

    const routes = routeBudgetSignals(signals.map((s) => s.type));
    const severityByType = new Map(signals.map((s) => [s.type, s.severity] as const));

    // 1. Record every routed signal on the audit/owner-risk ledger.
    for (const route of routes) {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.OWNER_BUDGET_SIGNAL_ROUTED,
        ...toAuditActor(actorId),
        workspaceId,
        entityType: "BudgetPlanSnapshot",
        entityId: businessId,
        correlationId: reassessmentId,
        payload: {
          businessId,
          reassessmentId,
          signalType: route.type,
          severity: severityByType.get(route.type) ?? "INFO",
          targetDomain: route.targetDomain,
          consumptionMode: route.consumptionMode,
          consumerExists: route.consumerExists,
          ...(route.gapReason ? { gapReason: route.gapReason } : {}),
        },
      });
    }

    // 2. Financially-material signals → finance re-diagnosis (the proven push
    //    precedent). Triggered at most once per reassessment.
    let reDiagnosisTriggered = false;
    if (requiresFinanceReDiagnosis(routes)) {
      reDiagnosisTriggered = await triggerFinanceReDiagnosis({
        businessId,
        workspaceId,
        actorId,
        reassessmentId,
        triggeringSignals: routes.filter((r) => r.consumptionMode === "RE_DIAGNOSE_FINANCE").map((r) => r.type),
      });
    }

    const gaps = dedupeDomains(routes.filter((r) => !r.consumerExists).map((r) => r.targetDomain));
    return { routed: routes.length, reDiagnosisTriggered, gaps, alreadyRouted: false };
  } catch {
    // Cross-module delivery is advisory — a routing failure must not fail the
    // reassessment that produced the signals.
    return empty;
  }
}

/**
 * Trigger a finance re-diagnosis from the latest finance snapshot, reusing the
 * finance domain's own diagnosis service (lazy import avoids an import cycle).
 * Returns true if a re-diagnosis was actually run.
 */
async function triggerFinanceReDiagnosis(params: {
  businessId: string;
  workspaceId: string;
  actorId: string;
  reassessmentId: string;
  triggeringSignals: string[];
}): Promise<boolean> {
  const { businessId, workspaceId, actorId, reassessmentId, triggeringSignals } = params;
  try {
    const latestSnapshot = await db.ownerFinancialSnapshot.findFirst(
      currentEffectiveFinancialSnapshotQuery({ workspaceId, businessId }, { id: true })
    );
    if (!latestSnapshot) return false; // no finance snapshot → gap-safe, signal already audited

    const { runFinanceDiagnosis } = await import("@/services/owner-finance/diagnosis.service");
    const newCycle = await runFinanceDiagnosis(businessId, latestSnapshot.id, actorId, workspaceId);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_BUDGET_CROSS_MODULE_REASSESSMENT_TRIGGERED,
      ...toAuditActor(actorId),
      workspaceId,
      entityType: "OwnerFinanceCycle",
      entityId: newCycle.id,
      correlationId: reassessmentId,
      payload: { businessId, reassessmentId, targetDomain: "finance", trigger: "budget_signal", triggeringSignals },
    });
    return true;
  } catch {
    // Re-diagnosis failure is advisory; the signals are already audited.
    return false;
  }
}

function dedupeDomains(domains: SignalTargetDomain[]): SignalTargetDomain[] {
  return Array.from(new Set(domains));
}

export type { SignalRoute };
