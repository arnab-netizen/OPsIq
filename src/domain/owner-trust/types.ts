/**
 * Owner Trust, Audit & Explainability (Module 11) — shared types.
 *
 * Pure types only: no DB, no I/O, no LLM. The explainability layer turns a proven
 * `OwnerFinding` (+ its `OwnerAction`) into a credible, owner-readable explanation
 * carrying the eight §18-required fields: what was detected, why it matters, the
 * source data used, the calculation used, the confidence level, the risk if
 * ignored, the expected impact, and the verification method. It NEVER invents a
 * value (the anti-hallucination rule): a missing source value is labeled "missing"
 * and surfaced as a data gap, never fabricated.
 */
import type { OwnerDomain, OwnerSeverity, OwnerFinding } from "@/domain/owner-spine/contracts";

export type TrustLabel = "low" | "moderate" | "high";

/** Finding classification carried through to an explanation card. */
export type OwnerFindingType = OwnerFinding["findingType"];

/** The source data an explanation was built from (real values only, or "missing"). */
export interface ExplanationSource {
  metric: string;
  value: number | null; // the real source value, or null when missing (never invented)
  valueLabel: string; // human label, "missing" when value is null
  threshold: number | null;
  thresholdLabel: string;
  evidence: string[];
}

/** A deterministic, credible explanation of one finding/action (the §18 fields). */
export interface ExplanationCard {
  domain: OwnerDomain;
  findingCode: string;
  findingType: OwnerFindingType;
  severity: OwnerSeverity;

  whatWasDetected: string;
  whyItMatters: string;
  sourceDataUsed: ExplanationSource;
  calculationUsed: string;
  confidence: { score: number; label: TrustLabel }; // 0..1
  riskIfIgnored: string;
  expectedImpact: { score: number; label: TrustLabel }; // 0..100
  verification: { metric: string | null; method: string | null };

  dataGaps: string[]; // missing inputs surfaced honestly (never invented)
  hasInventedValues: false; // invariant: this engine never fabricates values
  generatedAt: Date;
}
