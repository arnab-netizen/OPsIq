/**
 * Owner Strategy — Business Wisdom / Playbook source-tier + anti-guru gate
 * (execution.md Phase 5, Amendment Rule F). Pure, deterministic, no I/O.
 *
 * Rules enforced:
 *   - Every knowledge item is tiered A/B/C/D; missing source → UNSOURCED_HEURISTIC.
 *   - Only Tier A/B, guru-red-flag-free items may influence a high-risk decision
 *     (legal / tax / hiring-firing / debt / expansion / compliance).
 *   - Guru advice (guaranteed wealth, risk-free, one-tactic-fits-all, …) is
 *     downgraded and blocked from high-risk decisions even if otherwise sourced.
 */

import {
  UNSOURCED,
  type SourceTier,
  type WisdomTier,
  type KnowledgeSourceType,
  type KnowledgeItem,
  type WisdomClassification,
  type AdviceAdmission,
  type HighRiskDomain,
  HIGH_RISK_DOMAINS,
} from "./business-wisdom.types";

const TIER_A: ReadonlySet<KnowledgeSourceType> = new Set([
  "verified_owner_data",
  "accounting_record",
  "legal_filing",
  "validated_case_evidence",
]);
const TIER_B: ReadonlySet<KnowledgeSourceType> = new Set([
  "reputable_book",
  "consulting_framework",
  "franchise_system",
  "benchmark_report",
]);
const TIER_C: ReadonlySet<KnowledgeSourceType> = new Set([
  "blog",
  "podcast",
  "founder_anecdote",
  "newsletter",
  "community_post",
]);
const TIER_D: ReadonlySet<KnowledgeSourceType> = new Set([
  "viral_claim",
  "guru_claim",
  "unverified_tactic",
]);

export function tierForSourceType(t: KnowledgeSourceType): SourceTier {
  if (TIER_A.has(t)) return "A";
  if (TIER_B.has(t)) return "B";
  if (TIER_C.has(t)) return "C";
  return "D";
}

/** Guru / unverifiable-claim red flags. Deterministic regex scan of the claim text. */
const GURU_PATTERNS: { code: string; re: RegExp }[] = [
  { code: "GUARANTEED_WEALTH", re: /\b(guarantee(d|s)?|risk[-\s]?free|can'?t lose|sure[-\s]?shot)\b/i },
  { code: "OVERNIGHT_RICHES", re: /\b(overnight|get rich|double your (money|revenue|profit)|10x|quick money|passive income guaranteed)\b/i },
  { code: "ONE_TACTIC_FITS_ALL", re: /\b(works for (any|every|all)|every business should|always works|never fails)\b/i },
  { code: "SECRET_HACK", re: /\b(secret|hack|one weird trick|loophole|they don'?t want you to know)\b/i },
];

export function detectGuruRedFlags(claim: string | null | undefined): string[] {
  if (typeof claim !== "string" || claim.trim() === "") return [];
  const flags: string[] = [];
  for (const p of GURU_PATTERNS) if (p.re.test(claim)) flags.push(p.code);
  return flags;
}

/**
 * Classify a knowledge item's tier, guru red flags, and whether it may influence
 * a high-risk decision. Missing/unknown source → UNSOURCED_HEURISTIC (blocked).
 */
export function classifyWisdom(item: KnowledgeItem): WisdomClassification {
  const isUnsourced =
    !item.sourceType ||
    !(TIER_A.has(item.sourceType) || TIER_B.has(item.sourceType) || TIER_C.has(item.sourceType) || TIER_D.has(item.sourceType));
  const tier: WisdomTier = isUnsourced ? UNSOURCED : tierForSourceType(item.sourceType as KnowledgeSourceType);
  const guruRedFlags = detectGuruRedFlags(item.claim);

  // High-risk influence: only clean Tier A/B may lead a high-risk decision.
  const tierAllows = tier === "A" || tier === "B";
  const canInfluenceHighRisk = tierAllows && guruRedFlags.length === 0;

  let reason: string;
  if (isUnsourced) {
    reason = "No source recorded → UNSOURCED_HEURISTIC; blocked from all high-risk decisions.";
  } else if (guruRedFlags.length > 0) {
    reason = `Guru red flags (${guruRedFlags.join(", ")}) → cannot influence high-risk decisions regardless of tier.`;
  } else if (tier === "C" || tier === "D") {
    reason = `Tier ${tier} (anecdotal/unverified) → advisory only, blocked from high-risk decisions.`;
  } else {
    reason = `Tier ${tier} (verified/reputable) → may inform high-risk decisions (professional review still required for legal/tax/compliance).`;
  }

  return {
    title: item.title,
    tier,
    sourceType: item.sourceType ?? null,
    isUnsourced,
    guruRedFlags,
    canInfluenceHighRisk,
    reason,
    blockedForHighRiskDomains: canInfluenceHighRisk ? [] : [...HIGH_RISK_DOMAINS],
  };
}

const PROFESSIONAL_REVIEW_DOMAINS: ReadonlySet<HighRiskDomain> = new Set(["legal", "tax", "compliance"]);

/**
 * Admit / downgrade / block a piece of advice for a specific decision. High-risk
 * domains reject anything below Tier B or carrying guru red flags; non-high-risk
 * decisions accept lower tiers but downgrade them to advisory.
 */
export function admitAdvice(item: KnowledgeItem, decisionDomain?: HighRiskDomain | null): AdviceAdmission {
  const c = classifyWisdom(item);
  const isHighRisk = !!decisionDomain && (HIGH_RISK_DOMAINS as readonly string[]).includes(decisionDomain);
  const requiresProfessionalReview = !!decisionDomain && PROFESSIONAL_REVIEW_DOMAINS.has(decisionDomain);

  let decision: AdviceAdmission["decision"];
  let reason: string;

  if (isHighRisk) {
    if (c.canInfluenceHighRisk) {
      decision = "ADMIT";
      reason = `Tier ${c.tier} may inform the ${decisionDomain} decision${requiresProfessionalReview ? " (professional review required)" : ""}.`;
    } else {
      decision = "BLOCK";
      reason = `Blocked from the ${decisionDomain} decision: ${c.reason}`;
    }
  } else {
    // Non-high-risk: lower tiers and guru flags are downgraded to advisory, not blocked.
    if (c.tier === "A" || c.tier === "B") {
      decision = c.guruRedFlags.length > 0 ? "DOWNGRADE" : "ADMIT";
      reason = c.guruRedFlags.length > 0 ? `Downgraded to advisory due to guru red flags (${c.guruRedFlags.join(", ")}).` : `Tier ${c.tier} advice admitted.`;
    } else {
      decision = "DOWNGRADE";
      reason = c.isUnsourced
        ? "Unsourced heuristic → advisory only, flagged as unverified."
        : `Tier ${c.tier} → advisory only.`;
    }
  }

  return { decision, tier: c.tier, reason, guruRedFlags: c.guruRedFlags, requiresProfessionalReview };
}
