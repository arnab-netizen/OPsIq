/**
 * B03 — Data Quality Scoring.
 *
 * Pure, deterministic scoring over a B01 business-facts contract. No DB, no I/O,
 * no LLM. Produces seven 0..100 dimension subscores, a combined
 * DATA_QUALITY_SCORE (0..100), and the recommendation-confidence cap that
 * downstream diagnosis/strategy modules must honour.
 *
 * Hard rule (execution_post_owner_mode.md §12): if DATA_QUALITY_SCORE < 50,
 * high-confidence strategic recommendations are BLOCKED. This module is the
 * single source of that decision; it never mutates the contract — callers fold
 * `data_quality_score` into `confidence` via `withDataQualityScore`.
 */
import { z } from "zod";
import {
  FACT_CATEGORIES,
  type BusinessFact,
  type BusinessFactsContract,
  type ExtractionMethod,
  type FactValidationStatus,
  type SourceDocumentKind,
} from "./contract";

// --- Deterministic weight tables (no guessing; explicit) ---------------------

/** Source-document kind → reliability weight 0..1 (evidence ranking refined in B04). */
const SOURCE_KIND_RELIABILITY: Record<SourceDocumentKind, number> = {
  bank_api: 1.0,
  accounting_system_export: 0.95,
  pos_export: 0.9,
  crm_export: 0.8,
  pdf_statement: 0.7,
  xlsx: 0.7,
  csv: 0.65,
  google_sheet: 0.6,
  other: 0.5,
  screenshot_ocr: 0.4,
  manual_owner_entry: 0.4,
};

/** Extraction method → base trust weight 0..1. */
const METHOD_TRUST: Record<ExtractionMethod, number> = {
  bank_statement: 0.95,
  api_sync: 0.9,
  accounting_export: 0.85,
  pos_export: 0.8,
  csv_import: 0.7,
  xlsx_import: 0.7,
  google_sheets_import: 0.7,
  calculation: 0.7,
  manual_entry: 0.5,
  ocr: 0.45,
  owner_estimate: 0.4,
};

/** Validation status → confidence multiplier 0..1. */
const STATUS_MULTIPLIER: Record<FactValidationStatus, number> = {
  owner_confirmed: 1.0,
  system_validated: 1.0,
  draft: 0.7,
  unknown: 0.5,
  rejected: 0.2,
};

/** Contradiction status → consistency penalty (points off 100). */
const CONTRADICTION_PENALTY: Record<string, number> = {
  critical_conflict: 40,
  unresolved: 40,
  material_conflict: 25,
  minor_conflict: 10,
  no_conflict: 0,
  resolved_by_owner: 0,
  resolved_by_source_priority: 0,
};

/** Dimension weights for the combined score (sum = 1). */
const DIMENSION_WEIGHTS = {
  completeness: 0.2,
  consistency: 0.2,
  recency: 0.1,
  granularity: 0.1,
  source_reliability: 0.15,
  extraction_confidence: 0.15,
  auditability: 0.1,
} as const;

// --- Output shape ------------------------------------------------------------

export const dataQualityDimensionsSchema = z.object({
  completeness: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  recency: z.number().min(0).max(100),
  granularity: z.number().min(0).max(100),
  source_reliability: z.number().min(0).max(100),
  extraction_confidence: z.number().min(0).max(100),
  auditability: z.number().min(0).max(100),
});
export type DataQualityDimensions = z.infer<typeof dataQualityDimensionsSchema>;

export const RECOMMENDATION_CONFIDENCE_TIERS = ["high", "moderate", "low"] as const;
export type RecommendationConfidenceTier = (typeof RECOMMENDATION_CONFIDENCE_TIERS)[number];

export const dataQualityScoreSchema = z.object({
  /** Combined 0..100 score (the §12 DATA_QUALITY_SCORE). */
  data_quality_score: z.number().min(0).max(100),
  dimensions: dataQualityDimensionsSchema,
  /** True when score < 50 → high-confidence strategic recommendations blocked. */
  high_confidence_blocked: z.boolean(),
  /** Tier downstream modules must not exceed. */
  recommendation_confidence_tier: z.enum(RECOMMENDATION_CONFIDENCE_TIERS),
  /** Numeric cap (0..1) downstream confidence must be clamped to. */
  recommendation_confidence_cap: z.number().min(0).max(1),
  /** Owner-readable reasons explaining the largest deductions. */
  notes: z.array(z.string()),
});
export type DataQualityScore = z.infer<typeof dataQualityScoreSchema>;

export interface ScoreDataQualityOptions {
  /** Reference "now" for recency; injected for determinism in tests. */
  now?: Date;
}

// --- Helpers -----------------------------------------------------------------

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

function allFacts(contract: BusinessFactsContract): BusinessFact[] {
  const out: BusinessFact[] = [];
  for (const category of FACT_CATEGORIES) {
    for (const fact of contract[category]) out.push(fact);
  }
  return out;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

// --- Dimension scorers -------------------------------------------------------

function scoreCompleteness(contract: BusinessFactsContract, facts: BusinessFact[]): number {
  const nonNull = facts.filter((f) => f.value !== null).length;
  const blocking = contract.missing_data.filter((m) => m.blocking).length;
  const nonBlocking = contract.missing_data.length - blocking;
  const denom = nonNull + blocking * 2 + nonBlocking;
  if (denom === 0) return 0;
  return clamp(100 * (nonNull / denom));
}

function scoreConsistency(contract: BusinessFactsContract, facts: BusinessFact[]): number {
  let score = 100;
  for (const c of contract.contradictions) {
    score -= CONTRADICTION_PENALTY[c.status] ?? 25;
  }
  // Rejected facts indicate known-bad data still in the envelope.
  const rejected = facts.filter((f) => f.validation_status === "rejected").length;
  score -= Math.min(20, rejected * 5);
  return clamp(score);
}

function scoreRecency(contract: BusinessFactsContract, now: Date): number {
  const end = new Date(contract.reporting_period.period_end + "T00:00:00.000Z");
  if (Number.isNaN(end.getTime())) return 0;
  const age = daysBetween(now, end);
  if (age < 0) return 100; // future-dated period treated as current
  if (age <= 31) return 100;
  if (age <= 92) return 85;
  if (age <= 183) return 70;
  if (age <= 366) return 50;
  if (age <= 730) return 30;
  return 15;
}

function scoreGranularity(facts: BusinessFact[], categoriesCovered: number): number {
  const distinctMetrics = new Set(facts.map((f) => f.metric)).size;
  return clamp(distinctMetrics * 8 + categoriesCovered * 6);
}

function scoreSourceReliability(contract: BusinessFactsContract): number {
  if (contract.source_documents.length === 0) return 0;
  const weights = contract.source_documents.map((d) => SOURCE_KIND_RELIABILITY[d.kind] ?? 0.5);
  return clamp(100 * avg(weights));
}

function scoreExtractionConfidence(facts: BusinessFact[]): number {
  const usable = facts.filter((f) => f.value !== null);
  if (usable.length === 0) return 0;
  const per = usable.map((f) => {
    const method = METHOD_TRUST[f.extraction_method] ?? 0.5;
    const blended = (f.confidence_score + method) / 2;
    return blended * (STATUS_MULTIPLIER[f.validation_status] ?? 0.5);
  });
  return clamp(100 * avg(per));
}

function scoreAuditability(contract: BusinessFactsContract, facts: BusinessFact[]): number {
  if (facts.length === 0) return 0;
  const docIds = new Set(contract.source_documents.map((d) => d.source_document_id));
  const lineageFrac =
    facts.filter((f) => docIds.has(f.source_document_id) && f.source_location.trim() !== "").length /
    facts.length;
  const confirmedFrac =
    facts.filter(
      (f) => f.validation_status === "owner_confirmed" || f.validation_status === "system_validated",
    ).length / facts.length;
  return clamp(100 * (0.4 * lineageFrac + 0.6 * confirmedFrac));
}

// --- Public API --------------------------------------------------------------

/**
 * Compute the seven data-quality dimensions, the combined DATA_QUALITY_SCORE,
 * and the recommendation-confidence cap for a business-facts contract.
 */
export function scoreDataQuality(
  contract: BusinessFactsContract,
  options: ScoreDataQualityOptions = {},
): DataQualityScore {
  const now = options.now ?? new Date();
  const facts = allFacts(contract);
  const categoriesCovered = FACT_CATEGORIES.filter((c) => contract[c].length > 0).length;

  const dimensions: DataQualityDimensions = {
    completeness: round(scoreCompleteness(contract, facts)),
    consistency: round(scoreConsistency(contract, facts)),
    recency: round(scoreRecency(contract, now)),
    granularity: round(scoreGranularity(facts, categoriesCovered)),
    source_reliability: round(scoreSourceReliability(contract)),
    extraction_confidence: round(scoreExtractionConfidence(facts)),
    auditability: round(scoreAuditability(contract, facts)),
  };

  const combined =
    dimensions.completeness * DIMENSION_WEIGHTS.completeness +
    dimensions.consistency * DIMENSION_WEIGHTS.consistency +
    dimensions.recency * DIMENSION_WEIGHTS.recency +
    dimensions.granularity * DIMENSION_WEIGHTS.granularity +
    dimensions.source_reliability * DIMENSION_WEIGHTS.source_reliability +
    dimensions.extraction_confidence * DIMENSION_WEIGHTS.extraction_confidence +
    dimensions.auditability * DIMENSION_WEIGHTS.auditability;

  const data_quality_score = clamp(round(combined));

  // §12 hard rule + downstream confidence cap.
  const high_confidence_blocked = data_quality_score < 50;
  let recommendation_confidence_tier: RecommendationConfidenceTier;
  let recommendation_confidence_cap: number;
  if (data_quality_score >= 75) {
    recommendation_confidence_tier = "high";
    recommendation_confidence_cap = 1.0;
  } else if (data_quality_score >= 50) {
    recommendation_confidence_tier = "moderate";
    recommendation_confidence_cap = 0.75;
  } else {
    recommendation_confidence_tier = "low";
    recommendation_confidence_cap = 0.5;
  }

  const notes = buildNotes(contract, dimensions, high_confidence_blocked);

  return {
    data_quality_score,
    dimensions,
    high_confidence_blocked,
    recommendation_confidence_tier,
    recommendation_confidence_cap,
    notes,
  };
}

function buildNotes(
  contract: BusinessFactsContract,
  dims: DataQualityDimensions,
  blocked: boolean,
): string[] {
  const notes: string[] = [];
  if (blocked) {
    notes.push("Data quality below 50 — high-confidence strategic recommendations are blocked.");
  }
  const blockingMissing = contract.missing_data.filter((m) => m.blocking).length;
  if (blockingMissing > 0) {
    notes.push(`${blockingMissing} blocking gap(s) in required data reduce completeness.`);
  }
  const liveContradictions = contract.contradictions.filter((c) =>
    ["critical_conflict", "material_conflict", "minor_conflict", "unresolved"].includes(c.status),
  ).length;
  if (liveContradictions > 0) {
    notes.push(`${liveContradictions} unresolved contradiction(s) downgrade consistency.`);
  }
  if (dims.source_reliability < 50) {
    notes.push("Sources are mostly low-reliability (manual/OCR); prefer system/bank exports.");
  }
  if (dims.recency < 50) {
    notes.push("Reporting period is stale; refresh with more recent data.");
  }
  return notes;
}

/**
 * Return a NEW contract with `confidence.data_quality_score` folded in. Does not
 * mutate the input (no silent mutation of governed records).
 */
export function withDataQualityScore(
  contract: BusinessFactsContract,
  score: DataQualityScore,
): BusinessFactsContract {
  return {
    ...contract,
    confidence: {
      ...contract.confidence,
      data_quality_score: score.data_quality_score,
    },
  };
}
