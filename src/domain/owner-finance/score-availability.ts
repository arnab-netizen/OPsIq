/**
 * Owner Finance — which of a diagnosis' 0–100 scores may be presented as scores (pure). Composes the ONE spine rule
 * (owner-spine/score-availability.ts) with the finance evidence primitives, so the page never re-derives it.
 */
import { assessScoreAvailability, type ScoreAvailability } from "@/domain/owner-spine/score-availability";
import { missingCriticalFinanceInputs, type CriticalFinanceFields } from "./data-confidence";
import { unsupportedConclusions } from "./unsupported-conclusions";
import type { FinancialSnapshotInput } from "./types";

export function financeScoreAvailability(input: FinancialSnapshotInput, dataConfidenceScore: number): ScoreAvailability {
  return assessScoreAvailability({
    dataConfidenceScore,
    missingCritical: missingCriticalFinanceInputs(input as CriticalFinanceFields),
    withheldConclusions: unsupportedConclusions(input).length,
  });
}
