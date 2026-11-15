/**
 * Before/after line for a recorded owner-domain outcome verification, with baseline
 * provenance (see src/domain/founder-recovery/verification-evidence.ts).
 */
export interface VerificationEvidence {
  beforeValue: number | null;
  afterValue: number | null;
  targetDirection: string;
  baselineSource?: string | null;
  measuredBeforeValue?: number | null;
}

function evidenceNumber(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "not recorded";
}

/** Plain-language goal for the stored target direction; never a raw "up"/"down" that reads as movement. */
export function verificationGoalText(targetDirection: string): string {
  if (targetDirection === "up") return "Goal: higher is better";
  if (targetDirection === "down") return "Goal: lower is better";
  return "Goal: not recorded";
}

/**
 * Before/after line for a recorded verification. States where the baseline came from
 * (measured vs owner-reported, with the measured value when they differ) so owner-typed
 * values are never presented as observed facts, and never prints "null"/"NaN".
 */
export function VerificationEvidenceText({ verification }: { verification: VerificationEvidence }) {
  const { beforeValue, afterValue, targetDirection, baselineSource, measuredBeforeValue } = verification;
  let provenance: string;
  if (baselineSource === "MEASURED") provenance = "baseline measured by diagnosis";
  else if (baselineSource === "OWNER_REPORTED")
    provenance =
      typeof measuredBeforeValue === "number"
        ? `baseline owner-reported (diagnosis measured ${measuredBeforeValue})`
        : "baseline owner-reported";
  else provenance = "baseline source not recorded";
  return (
    <span className="text-muted-foreground">
      before {evidenceNumber(beforeValue)} → after {evidenceNumber(afterValue)} · {verificationGoalText(targetDirection)} · {provenance} · after
      value owner-reported
    </span>
  );
}

