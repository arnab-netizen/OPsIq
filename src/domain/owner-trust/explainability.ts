/**
 * Owner Trust, Audit & Explainability (Module 11) — deterministic explainability
 * engine.
 *
 * Pure functions only (no DB/I/O/LLM). Assembles the §18-required explanation for a
 * finding (+ optional action) STRICTLY from values already present on those records.
 * The anti-hallucination rule is enforced structurally: a missing source value is
 * rendered "missing" and added to `dataGaps`; it is never replaced with a guess, and
 * `hasInventedValues` is always false.
 */
import { clampConfidence, clampScore } from "@/domain/owner-spine/contracts";
import type { OwnerFinding, OwnerAction } from "@/domain/owner-spine/contracts";
import type { ExplanationCard, TrustLabel } from "./types";

function confidenceLabel(score: number): TrustLabel {
  if (score < 0.34) return "low";
  if (score < 0.67) return "moderate";
  return "high";
}

function scoreLabel(score: number): TrustLabel {
  if (score < 34) return "low";
  if (score < 67) return "moderate";
  return "high";
}

const RISK_IF_IGNORED_RISK: Record<string, string> = {
  critical: "Ignoring this risks severe, near-term harm to the business.",
  high: "Left unaddressed, this is likely to cause material harm.",
  medium: "If not addressed, expect gradual erosion over time.",
  low: "Minor for now — worth monitoring.",
};

/** Build the deterministic explanation for a finding (+ optional matching action). */
export function buildExplanation(
  finding: OwnerFinding,
  action?: OwnerAction | null,
  opts: { now?: Date; cycleMissingData?: readonly string[] } = {}
): ExplanationCard {
  const now = opts.now ?? new Date();

  const value = finding.sourceValue ?? null;
  const threshold = finding.threshold ?? null;
  const valueLabel = value === null ? "missing" : String(value);
  const thresholdLabel = threshold === null ? "no fixed threshold" : String(threshold);

  // Calculation: only describe a comparison from REAL values; never invent one.
  let calculationUsed: string;
  if (value === null) {
    calculationUsed = `Not computable — the source value for "${finding.sourceMetric}" is missing, so no value was inferred or invented.`;
  } else if (threshold === null) {
    calculationUsed = `${finding.sourceMetric} = ${value}, judged against the domain baseline (no single fixed threshold).`;
  } else {
    const relation = finding.findingType === "risk" ? "crossed the safe threshold" : "shows recoverable headroom vs the target";
    calculationUsed = `${finding.sourceMetric} = ${value} ${relation} of ${threshold}.`;
  }

  const riskIfIgnored =
    finding.findingType === "opportunity"
      ? "Not acting leaves this upside uncaptured (no downside risk created)."
      : RISK_IF_IGNORED_RISK[finding.severity] ?? RISK_IF_IGNORED_RISK.medium;

  const impactScore = clampScore(action ? action.expectedImpactScore : finding.impactScore);
  const confidence = clampConfidence(action ? action.confidence : finding.confidence);

  // Honest data gaps: anything the finding flagged missing, plus a null source value.
  // Also the cycle's own missing-critical-data list (snapshot.missingCriticalData) -- the same list
  // the domain page shows as "Missing critical data" -- so a card can never say "No data gaps"
  // while the cycle it was built from reports missing inputs.
  const dataGaps = [...(finding.missingData ?? [])];
  for (const m of opts.cycleMissingData ?? []) if (!dataGaps.includes(m)) dataGaps.push(m);
  if (value === null && !dataGaps.includes(finding.sourceMetric)) dataGaps.push(finding.sourceMetric);

  return {
    domain: finding.domain,
    findingCode: finding.code,
    findingType: finding.findingType,
    severity: finding.severity,

    whatWasDetected: finding.summary ? `${finding.title} — ${finding.summary}` : finding.title,
    whyItMatters:
      finding.findingType === "opportunity"
        ? "This is recoverable value the business is currently leaving on the table."
        : `This is a ${finding.severity} issue in ${finding.domain}; it directly affects the owner's outcomes.`,
    sourceDataUsed: {
      metric: finding.sourceMetric,
      value,
      valueLabel,
      threshold,
      thresholdLabel,
      evidence: finding.evidence ?? [],
    },
    calculationUsed,
    confidence: { score: confidence, label: confidenceLabel(confidence) },
    riskIfIgnored,
    expectedImpact: { score: impactScore, label: scoreLabel(impactScore) },
    verification: {
      metric: action?.verificationMetric ?? finding.verificationMetric ?? null,
      method: action?.verificationMethod ?? null,
    },

    dataGaps,
    hasInventedValues: false,
    generatedAt: now,
  };
}

/**
 * Build explanations for a set of findings, pairing each with its action by
 * findingCode when available. Deterministic; preserves finding order.
 */
export function buildExplanations(
  findings: OwnerFinding[],
  actions: OwnerAction[] = [],
  opts: { now?: Date; cycleMissingData?: readonly string[] } = {}
): ExplanationCard[] {
  const actionByCode = new Map<string, OwnerAction>();
  for (const a of actions) if (!actionByCode.has(a.findingCode)) actionByCode.set(a.findingCode, a);
  return findings.map((f) => buildExplanation(f, actionByCode.get(f.code) ?? null, opts));
}

/** Categories the system must never invent (anti-hallucination allowlist, §18). */
export const NEVER_INVENT = [
  "revenue",
  "costs",
  "customers",
  "staff count",
  "market facts",
  "competitor facts",
  "tax/legal claims",
  "guaranteed outcomes",
] as const;
