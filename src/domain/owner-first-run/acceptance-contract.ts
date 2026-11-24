/**
 * Measurement contract for the ordinary first-run acceptance ("Use this as my next move") — pure, no I/O.
 *
 * Only STRUCTURED, PERSISTED facts are used. Recommendation prose (the "from 35 to 45" estimate in the action's
 * description) is never parsed: it is a forecast, not a measurement and not a commitment the owner made.
 *   - verification metric / window: the action row's own columns;
 *   - baseline: the persisted value of that exact metric on the diagnosis cycle the action belongs to, and only for a
 *     metric with a registered cycle-level source (today: dataConfidenceScore, a system-computed completeness measure,
 *     so its provenance is MEASURED; it says nothing about how reliable the owner's money figures are);
 *   - direction: the code-defined metric direction registry (never inferred from a name or from prose);
 *   - target: never set here. A target is the owner's commitment; OpsIQ's estimate stays an estimate.
 * Anything that cannot be established stays unknown (null / "unknown"), and `missing` says what the owner can supply.
 */
import { getVerificationDirection } from "@/domain/owner-mode/verification-direction";
import type { OutcomeContractInput } from "@/domain/owner-spine/owner-decision-record";

type CycleMetricReader = (cycle: { dataConfidenceScore: number | null }) => number | null;

/** Metrics whose current value is a persisted, system-computed column of the Finance cycle. Extend only with real columns. */
const CYCLE_METRIC_SOURCES: Readonly<Record<string, CycleMetricReader>> = {
  dataConfidenceScore: (c) => c.dataConfidenceScore,
};

export interface AcceptanceContractFacts {
  action: { id: string; cycleId: string; title: string; verificationMetric: string; expectedTimeframeDays: number; findingCode: string | null };
  /** The cycle the owner's read was made from (already scoped to the workspace + business by the caller). */
  readCycle: { id: string; dataConfidenceScore: number | null };
  authoritativeEvidence: boolean;
}

export interface AcceptanceContract {
  contract: OutcomeContractInput;
  /** What stays unknown, in owner terms. Empty when baseline and direction were both established. */
  missing: Array<"baseline" | "direction" | "target">;
}

export function buildFinanceAcceptanceContract(f: AcceptanceContractFacts): AcceptanceContract {
  const { action, readCycle } = f;
  const metric = action.verificationMetric;
  const contract: OutcomeContractInput = {
    commitmentDescription: action.title,
    verificationMetric: metric,
    observationWindowDays: Math.max(1, action.expectedTimeframeDays),
    // Only evidence the owner stated is from their records is authoritative; estimates and unspecified provenance are owner-entered.
    expectedMeasurementSource: f.authoritativeEvidence ? "AUTHORITATIVE_SNAPSHOT" : "OWNER_ENTERED",
  };
  // Baseline: the exact metric, read from the exact cycle the action was generated on (action and read must agree).
  const reader = Object.prototype.hasOwnProperty.call(CYCLE_METRIC_SOURCES, metric) ? CYCLE_METRIC_SOURCES[metric] : null;
  const value = reader && action.cycleId === readCycle.id ? reader(readCycle) : null;
  const hasBaseline = value !== null && Number.isFinite(value);
  if (hasBaseline) {
    contract.baselineValue = value;
    contract.baselineProvenance = "MEASURED";
  }

  const direction = getVerificationDirection(metric, action.findingCode);
  if (direction === "up" || direction === "down") contract.targetDirection = direction;

  // A target is never established at acceptance.
  const missing: AcceptanceContract["missing"] = [];
  if (!hasBaseline) missing.push("baseline");
  if (direction === null) missing.push("direction");
  missing.push("target");
  return { contract, missing };
}
