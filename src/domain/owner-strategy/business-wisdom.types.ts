/**
 * Owner Strategy — Business Wisdom / Playbook source-tier + anti-guru types
 * (execution.md Phase 5, Amendment Rule F). Pure type definitions.
 *
 * Distinct from `behavioral-validation/max-reliability/source-quality.ts` (which
 * governs the LEARNING pipeline's reliability): this governs whether a piece of
 * business advice is allowed to influence a high-risk owner decision.
 */

/** A=verified, B=reputable framework/benchmark, C=blog/anecdote, D=viral/guru/unverified. */
export const SOURCE_TIERS = ["A", "B", "C", "D"] as const;
export type SourceTier = (typeof SOURCE_TIERS)[number];

/** Classification when no source is recorded (Amendment Rule F). */
export const UNSOURCED = "UNSOURCED_HEURISTIC" as const;
export type WisdomTier = SourceTier | typeof UNSOURCED;

export const KNOWLEDGE_SOURCE_TYPES = [
  // Tier A — verified
  "verified_owner_data",
  "accounting_record",
  "legal_filing",
  "validated_case_evidence",
  // Tier B — reputable frameworks / benchmarks
  "reputable_book",
  "consulting_framework",
  "franchise_system",
  "benchmark_report",
  // Tier C — anecdotal
  "blog",
  "podcast",
  "founder_anecdote",
  "newsletter",
  "community_post",
  // Tier D — unverified / guru
  "viral_claim",
  "guru_claim",
  "unverified_tactic",
] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** Decision domains where unverified advice must never lead (Amendment Rule F). */
export const HIGH_RISK_DOMAINS = [
  "legal",
  "tax",
  "hiring_firing",
  "debt",
  "expansion",
  "compliance",
] as const;
export type HighRiskDomain = (typeof HIGH_RISK_DOMAINS)[number];

export interface KnowledgeItem {
  title: string;
  sourceType?: KnowledgeSourceType | null; // absent/unknown → UNSOURCED_HEURISTIC
  citation?: string | null;
  claim?: string | null; // advice text scanned for guru red flags
  jurisdiction?: string | null;
  retrievalDate?: string | null;
  knownLimitations?: string[] | null;
}

export interface WisdomClassification {
  title: string;
  tier: WisdomTier;
  sourceType: KnowledgeSourceType | null;
  isUnsourced: boolean;
  guruRedFlags: string[];
  /** May this item influence a high-risk decision at all? */
  canInfluenceHighRisk: boolean;
  reason: string;
  blockedForHighRiskDomains: HighRiskDomain[];
}

export interface AdviceAdmission {
  decision: "ADMIT" | "DOWNGRADE" | "BLOCK";
  tier: WisdomTier;
  reason: string;
  guruRedFlags: string[];
  requiresProfessionalReview: boolean;
}
