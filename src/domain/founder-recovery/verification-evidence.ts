/**
 * Outcome-verification evidence policy shared by every owner-domain action
 * (finance, cashflow, operations, marketing, strategy, sop, sales).
 *
 * Module 1 (founder recovery) verifies against a server-owned, measured
 * baseline. The domain modules let the owner type the "before" value, so this
 * policy keeps provenance honest:
 *
 * - An outcome can only be recorded once work on the action has started.
 * - When the diagnosis measured the action's verification metric, that value is
 *   the baseline unless the owner explicitly reports a different one.
 * - An owner-reported baseline that differs from the measured value is kept
 *   (never overwritten) but recorded as OWNER_REPORTED together with the
 *   measured value, so the conflict is visible and never presented as observed.
 */
import type { RecoveryActionStatus } from "./action-status";

/** Statuses in which work has started, so an observed outcome can exist. */
export const OUTCOME_RECORDABLE_STATUSES: readonly RecoveryActionStatus[] = ["in_progress", "blocked", "completed"];

export function canRecordOutcome(status: string): boolean {
  return (OUTCOME_RECORDABLE_STATUSES as readonly string[]).includes(status);
}

export type BaselineSource = "MEASURED" | "OWNER_REPORTED";

export interface MeasuredBaselineSource {
  sourceMetric: string;
  sourceValue: number | null;
}

/** The value the diagnosis measured for the action's verification metric, or null. */
export function measuredBaselineFor(
  verificationMetric: string,
  finding: MeasuredBaselineSource | null | undefined
): number | null {
  if (!finding || finding.sourceMetric !== verificationMetric) return null;
  const v = finding.sourceValue;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type BaselineResolution =
  | {
      ok: true;
      beforeValue: number;
      baselineSource: BaselineSource;
      measuredBeforeValue: number | null;
      /** Evidence line describing where the baseline came from (always present). */
      provenanceNote: string;
    }
  | { ok: false; reason: string };

const EPSILON = 1e-9;

export function resolveVerificationBaseline(
  reported: number | null | undefined,
  measured: number | null
): BaselineResolution {
  const hasReported = typeof reported === "number" && Number.isFinite(reported);
  if (!hasReported) {
    if (measured === null) {
      return {
        ok: false,
        reason: "Enter the before (baseline) value — the diagnosis did not measure this metric.",
      };
    }
    return {
      ok: true,
      beforeValue: measured,
      baselineSource: "MEASURED",
      measuredBeforeValue: measured,
      provenanceNote: `Baseline ${measured} measured by the diagnosis.`,
    };
  }
  const value = reported as number;
  if (measured === null) {
    return {
      ok: true,
      beforeValue: value,
      baselineSource: "OWNER_REPORTED",
      measuredBeforeValue: null,
      provenanceNote: `Baseline ${value} reported by the owner (no measured value available).`,
    };
  }
  if (Math.abs(value - measured) <= EPSILON * Math.max(1, Math.abs(measured))) {
    return {
      ok: true,
      beforeValue: value,
      baselineSource: "MEASURED",
      measuredBeforeValue: measured,
      provenanceNote: `Baseline ${value} matches the value measured by the diagnosis.`,
    };
  }
  return {
    ok: true,
    beforeValue: value,
    baselineSource: "OWNER_REPORTED",
    measuredBeforeValue: measured,
    provenanceNote: `Owner-reported baseline ${value} differs from the measured baseline ${measured}.`,
  };
}

/** Attach `measuredBaseline` to an action read with its finding (server-side DTO shaping). */
export function withMeasuredBaseline<T extends { verificationMetric: string; finding?: MeasuredBaselineSource | null }>(
  action: T
): T & { measuredBaseline: number | null } {
  return { ...action, measuredBaseline: measuredBaselineFor(action.verificationMetric, action.finding) };
}
