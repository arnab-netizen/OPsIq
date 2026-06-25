/**
 * Outcome assessment (Slice 12) — task completion is SEPARATE from outcome.
 *
 * Produces an `OutcomeStatus` (consumed by the Slice 15 learning gate) from
 * measured evidence. The hard rule: task completion alone NEVER verifies an
 * outcome — only a completed measurement window with actual data AND an
 * owner/system-authorized verification yields a VERIFIED_* status.
 */

import { OutcomeStatus } from "@/domain/execution/learning-gate";

export interface OutcomeAssessmentInput {
  /** Whether the task was approved complete — deliberately NOT used to verify. */
  taskApprovedComplete: boolean;
  measurementWindowComplete: boolean;
  /** An actual metric value was observed. */
  hasActualMetric: boolean;
  /** A trustworthy data source backs the actual metric. */
  dataSourcePresent: boolean;
  /** Owner/system-authorized verification occurred. */
  ownerVerified: boolean;
  /** actual vs expected: true=met, false=not met, null=unknown. */
  expectedMet?: boolean | null;
  partial?: boolean;
  disputed?: boolean;
}

export function assessOutcome(input: OutcomeAssessmentInput): OutcomeStatus {
  if (input.disputed) return OutcomeStatus.DISPUTED;
  if (!input.measurementWindowComplete) return OutcomeStatus.MEASUREMENT_WINDOW_OPEN;
  if (!input.hasActualMetric || !input.dataSourcePresent) {
    return OutcomeStatus.INSUFFICIENT_DATA;
  }
  // Task completion alone never verifies: without owner/system verification the
  // outcome stays UNVERIFIED no matter the task status.
  if (!input.ownerVerified) return OutcomeStatus.UNVERIFIED;
  if (input.partial) return OutcomeStatus.PARTIAL_SUCCESS;
  if (input.expectedMet === true) return OutcomeStatus.VERIFIED_SUCCESS;
  if (input.expectedMet === false) return OutcomeStatus.VERIFIED_FAILURE;
  return OutcomeStatus.INSUFFICIENT_DATA;
}
