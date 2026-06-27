/**
 * Manual / Import-Ready Budget Data — source confidence + staleness (pure).
 *
 * The Dynamic Budget module already ingests owner data through several manual /
 * import-ready surfaces (spend entries, working-capital items, archetype metrics), each
 * carrying a `sourceType` and a last-touch timestamp. This module is the SINGLE, shared,
 * honest classifier for those sources: it maps a source's provenance + freshness to a
 * budget confidence level, never overclaiming a live/verified feed where there is none.
 *
 * Honesty rules (no overclaim):
 *  - MANUAL / UPLOAD / IMPORT data is never better than PARTIAL.
 *  - SYSTEM-derived data is OPERATIONAL; only RECONCILED data reaches VERIFIED.
 *  - ESTIMATED data is UNVERIFIED.
 *  - Stale data is downgraded one level toward UNVERIFIED.
 *  - Missing/unknown source ⇒ data-insufficient (UNVERIFIED).
 */
import type { BudgetConfidenceLevel } from "@/domain/owner-budget/types";
import { CONFIDENCE_ORDER } from "@/domain/owner-budget/types";

/** Provenance of a budget data source (aligns with SpendSourceType). */
export type BudgetDataSourceType = "MANUAL" | "UPLOAD" | "IMPORT" | "SYSTEM" | "RECONCILED" | "ESTIMATED";

const BASE_CONFIDENCE: Record<BudgetDataSourceType, BudgetConfidenceLevel> = {
  RECONCILED: "VERIFIED",
  SYSTEM: "OPERATIONAL",
  IMPORT: "PARTIAL",
  UPLOAD: "PARTIAL",
  MANUAL: "PARTIAL",
  ESTIMATED: "UNVERIFIED",
};

const DAY_MS = 86_400_000;

function toTime(d: string | Date): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export interface SourceConfidenceInput {
  sourceType?: string | null;
  /** When the source was last entered / verified (drives staleness). */
  lastVerifiedAt?: string | Date | null;
  /** Data older than this many days is stale. Default 45. */
  staleAfterDays?: number;
  asOf: string | Date;
}

export interface SourceConfidenceResult {
  confidence: BudgetConfidenceLevel;
  stale: boolean;
  /** True when the source is missing/unknown — cannot be relied on. */
  dataInsufficient: boolean;
  reason: string;
}

function downgrade(level: BudgetConfidenceLevel): BudgetConfidenceLevel {
  const i = CONFIDENCE_ORDER.indexOf(level);
  return i > 0 ? CONFIDENCE_ORDER[i - 1] : level; // toward UNVERIFIED (index 0)
}

/** Is a source stale relative to `asOf`? (Missing timestamp counts as stale.) */
export function isStaleSource(lastVerifiedAt: string | Date | null | undefined, asOf: string | Date, staleAfterDays = 45): boolean {
  if (lastVerifiedAt === null || lastVerifiedAt === undefined || lastVerifiedAt === "") return true;
  const t = toTime(lastVerifiedAt);
  if (Number.isNaN(t)) return true;
  return toTime(asOf) - t > staleAfterDays * DAY_MS;
}

/**
 * Classify a single budget data source into a confidence level (pure, deterministic).
 * Manual/import data never exceeds PARTIAL; stale data is downgraded; missing/unknown
 * source ⇒ data-insufficient.
 */
export function classifySourceConfidence(input: SourceConfidenceInput): SourceConfidenceResult {
  const raw = (input.sourceType ?? "").toUpperCase();
  const known = (Object.keys(BASE_CONFIDENCE) as BudgetDataSourceType[]).includes(raw as BudgetDataSourceType);
  if (!raw || !known) {
    return { confidence: "UNVERIFIED", stale: true, dataInsufficient: true, reason: raw ? `Unknown source type '${raw}' — treated as data-insufficient.` : "No source type — data-insufficient." };
  }
  const base = BASE_CONFIDENCE[raw as BudgetDataSourceType];
  // SYSTEM/RECONCILED sources are not staleness-gated on a manual timestamp.
  const exemptFromStaleness = raw === "SYSTEM" || raw === "RECONCILED";
  const stale = exemptFromStaleness ? false : isStaleSource(input.lastVerifiedAt, input.asOf, input.staleAfterDays);
  const confidence = stale ? downgrade(base) : base;
  return {
    confidence,
    stale,
    dataInsufficient: false,
    reason: stale ? `${raw} source is stale — confidence downgraded to ${confidence}.` : `${raw} source — confidence ${confidence}.`,
  };
}

/** Aggregate confidence across many sources = the WEAKEST (plan must reflect its weakest input). */
export function aggregateSourceConfidence(results: SourceConfidenceResult[]): BudgetConfidenceLevel {
  if (results.length === 0) return "UNVERIFIED";
  let weakest: BudgetConfidenceLevel = "AUDITED";
  for (const r of results) {
    if (CONFIDENCE_ORDER.indexOf(r.confidence) < CONFIDENCE_ORDER.indexOf(weakest)) weakest = r.confidence;
  }
  return weakest;
}
