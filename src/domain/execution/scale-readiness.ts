/**
 * Module 22 — Scale Readiness Gate (pure; builds on Module 21).
 *
 * Scaling (second location / multi-unit) is a higher bar than growth: it requires
 * the business to be growth-ready AND to have the management layer + repeatable
 * operations + low owner dependency that scaling needs. Delegates to the growth
 * readiness gate (no duplication) and adds the scale-specific prerequisites.
 */

import { assessGrowthReadiness } from "@/domain/execution/growth-readiness";
import { ProgressionMove, type GrowthSignals } from "@/domain/execution/progression-engine";

export enum ScaleReadiness {
  SCALE_READY = "SCALE_READY",
  NOT_SCALE_READY = "NOT_SCALE_READY",
}

export interface ScaleSignals extends GrowthSignals {
  /** A working manager/supervisor layer exists (not solely the owner). */
  managementLayerInPlace?: boolean;
  /** Core operations are documented + repeatable (SOPs proven). */
  operationsRepeatable?: boolean;
}

export interface ScaleReadinessResult {
  readiness: ScaleReadiness;
  allowed: boolean;
  blockedReasons: string[];
  growthReady: boolean;
  ownerApprovalRequired: true;
}

/**
 * Assess scale readiness. Requires growth readiness first (delegated), then the
 * scale prerequisites: management layer, repeatable ops, SOP/manager layer working,
 * and no daily owner firefighting.
 */
export function assessScaleReadiness(
  signals: ScaleSignals,
  move: ProgressionMove = ProgressionMove.SECOND_LOCATION
): ScaleReadinessResult {
  const growth = assessGrowthReadiness(signals, move);
  const blockedReasons = [...growth.blockedReasons];

  if (!signals.managementLayerInPlace) blockedReasons.push("no_management_layer");
  if (!signals.operationsRepeatable) blockedReasons.push("operations_not_repeatable");
  if (!signals.sopManagerLayerWorking) blockedReasons.push("sop_manager_layer_not_working");
  if (signals.ownerFirefightingDaily) blockedReasons.push("owner_firefighting_daily");

  const allowed = growth.allowed && blockedReasons.length === growth.blockedReasons.length;
  return {
    readiness: allowed ? ScaleReadiness.SCALE_READY : ScaleReadiness.NOT_SCALE_READY,
    allowed,
    blockedReasons,
    growthReady: growth.allowed,
    ownerApprovalRequired: true,
  };
}

/** Thrown when a scale/expansion action is promoted while not scale-ready. */
export class NotScaleReadyError extends Error {
  readonly code = "NOT_SCALE_READY";
  readonly blockedReasons: string[];
  constructor(ref: string, blockedReasons: string[]) {
    super(`Scale action ${ref} blocked: not scale-ready (${blockedReasons.join(", ")}).`);
    this.name = "NotScaleReadyError";
    this.blockedReasons = blockedReasons;
  }
}

/** Guard: throws NotScaleReadyError unless the business is scale-ready. */
export function assertScaleReady(signals: ScaleSignals, move: ProgressionMove, ref: string): void {
  const r = assessScaleReadiness(signals, move);
  if (!r.allowed) throw new NotScaleReadyError(ref, r.blockedReasons);
}
