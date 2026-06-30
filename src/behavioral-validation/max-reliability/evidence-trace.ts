/**
 * Maximum-reliability — evidence-to-claim traceability.
 *
 * Every key recommendation must be traceable to the evidence behind it: which provider/case/source/artifact
 * supports it, which calculation backs a financial claim, which risk rule applied, which learning artifact
 * (with provenance) influenced it, the confidence, and the missing/stale/conflicting data that would change
 * it. The validator fails an untraceable claim, a financial claim without a calculation trace, a learning-
 * based claim without artifact provenance, and over-confidence on weak evidence; stale/conflicting data
 * lowers the effective confidence. `buildEvidenceTrace` derives the trace from a production AdviceOutput so
 * the runtime + browser card can surface it.
 */
import type { AdviceOutput } from "../schema";

export type Confidence = "low" | "medium" | "high";

export interface EvidenceTrace {
  claim: string;
  evidence: string[];
  references: string[];            // SRC-… / case / artifact ids
  calculation?: string[];
  riskRule?: string;
  learningArtifactId?: string;
  confidence: Confidence;
  missingData: string[];
  staleData: string[];
  conflictingData: string[];
  whatWouldChange: string;
  canProceedNow: boolean;
}

export interface TraceValidation { ok: boolean; failures: string[]; effectiveConfidence: Confidence }

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const ORDER: Confidence[] = ["low", "medium", "high"];

/** Confidence is downgraded one notch for each kind of evidence weakness present (missing/stale/conflict). */
export function effectiveConfidence(t: EvidenceTrace): Confidence {
  let lvl = RANK[t.confidence];
  if (t.missingData.length > 0) lvl -= 1;
  if (t.staleData.length > 0) lvl -= 1;
  if (t.conflictingData.length > 0) lvl -= 1;
  if (t.evidence.length === 0 && t.references.length === 0) lvl -= 1;
  return ORDER[Math.max(0, Math.min(2, lvl))];
}

export function validateEvidenceTrace(t: EvidenceTrace, opts: { financialClaim?: boolean; learningBased?: boolean } = {}): TraceValidation {
  const failures: string[] = [];
  const hasEvidence = t.evidence.length > 0 || t.references.length > 0;
  if (!hasEvidence) failures.push("recommendation without evidence trace");
  if (opts.financialClaim && (!t.calculation || t.calculation.length === 0)) failures.push("financial claim without calculation trace");
  if (opts.learningBased && !t.learningArtifactId) failures.push("learning-based claim without artifact provenance");

  const weakEvidence = !hasEvidence || t.missingData.length > 0 || t.staleData.length > 0 || t.conflictingData.length > 0;
  if (t.confidence === "high" && weakEvidence) failures.push("high confidence with weak/missing/stale/conflicting evidence");

  return { ok: failures.length === 0, failures, effectiveConfidence: effectiveConfidence(t) };
}

/** Derive an evidence trace from a production advice output (so the runtime surfaces it). */
export function buildEvidenceTrace(advice: AdviceOutput, ctx: { claim?: string; references?: string[]; missingData?: string[]; staleData?: string[]; conflictingData?: string[] } = {}): EvidenceTrace {
  const calc = advice.calculationTrace ?? [];
  const evidence: string[] = [];
  if (advice.cashMarginRisk) evidence.push(`cash/margin: ${advice.cashMarginRisk}`);
  if (advice.capacityImpact) evidence.push(`capacity: ${advice.capacityImpact}`);
  if (advice.riskAnalysis) evidence.push(`risk: ${advice.riskAnalysis}`);
  if (calc.length) evidence.push(`calculation (${calc.length} steps)`);
  const learningArtifactId = (advice.learningNotesApplied ?? [])[0];
  const confidence: Confidence = advice.dataConfidence === "high" ? "high" : advice.dataConfidence === "low" ? "low" : "medium";
  return {
    claim: ctx.claim ?? advice.recommendedNextAction ?? "recommendation",
    evidence,
    references: [...(ctx.references ?? []), ...(advice.learningNotesApplied ?? [])],
    calculation: calc.length ? calc : undefined,
    riskRule: advice.riskAnalysis,
    learningArtifactId,
    confidence,
    missingData: ctx.missingData ?? [],
    staleData: ctx.staleData ?? [],
    conflictingData: ctx.conflictingData ?? [],
    whatWouldChange: advice.reassessmentTrigger ?? "new evidence on the dominant constraint",
    canProceedNow: (advice.proofRequired ?? []).length > 0,
  };
}
