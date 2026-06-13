/**
 * Owner SOP & Execution Accountability (Module 7) — data confidence + currency
 * validation.
 *
 * Deterministic and honest: confidence drops as inputs go missing, and missing
 * critical inputs are listed explicitly. Nothing is invented. Pure (no I/O).
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import type { SopSnapshotInput } from "./types";

/** A finite, present number (missing/NaN/Infinity → not present). */
function present(x: number | undefined | null): boolean {
  return x !== undefined && x !== null && Number.isFinite(x);
}

/**
 * Currency is valid when it is a 3–8 character alphabetic code (e.g. "INR",
 * "USD"). Empty/numeric/over-long values are invalid (fail closed).
 */
export function isValidCurrency(currency: string | undefined | null): boolean {
  if (typeof currency !== "string") return false;
  return /^[A-Za-z]{3,8}$/.test(currency.trim());
}

/**
 * Critical inputs: without these, an execution diagnosis is largely guesswork.
 * Actions assigned + completed anchor follow-through; verified or overdue anchors
 * whether completion is real.
 */
export function missingCriticalSopInputs(input: SopSnapshotInput): string[] {
  const missing: string[] = [];
  if (!present(input.actionsAssigned)) missing.push("actionsAssigned");
  if (!present(input.actionsCompleted)) missing.push("actionsCompleted");
  if (!(present(input.actionsVerified) || present(input.actionsOverdue))) missing.push("verifiedOrOverdue");
  return missing;
}

const IMPORTANT_FIELDS: (keyof SopSnapshotInput)[] = [
  "actionsVerified",
  "actionsOverdue",
  "actionsDisputed",
  "actionsReassigned",
  "repeatedFailures",
  "proofRequired",
  "proofProvided",
  "recurringProcesses",
  "documentedSops",
];

export interface DataConfidenceResult {
  dataConfidenceScore: number; // 0..100
  missingCritical: string[];
  isStale: boolean;
}

/** Whether the reporting period ended more than `staleDays` before `now`. */
export function isStaleSnapshot(periodEnd: string, now: Date, staleDays: number): boolean {
  const end = new Date(periodEnd).getTime();
  if (Number.isNaN(end)) return false;
  const ageDays = (now.getTime() - end) / (1000 * 60 * 60 * 24);
  return ageDays > staleDays;
}

/**
 * Confidence starts at 100 and is reduced by: 30 per missing critical input,
 * 5 per missing important field, 10 if currency is invalid, and 15 if the
 * snapshot is stale. Clamped to [0, 100].
 */
export function calculateDataConfidence(
  input: SopSnapshotInput,
  opts: { now?: Date; staleDays?: number } = {}
): DataConfidenceResult {
  const missingCritical = missingCriticalSopInputs(input);
  let score = 100;
  score -= missingCritical.length * 30;

  for (const f of IMPORTANT_FIELDS) {
    if (!present(input[f] as number | undefined)) score -= 5;
  }

  if (!isValidCurrency(input.currency)) score -= 10;

  const staleDays = opts.staleDays ?? 45;
  const stale = opts.now ? isStaleSnapshot(input.periodEnd, opts.now, staleDays) : false;
  if (stale) score -= 15;

  return { dataConfidenceScore: clampScore(score), missingCritical, isStale: stale };
}
