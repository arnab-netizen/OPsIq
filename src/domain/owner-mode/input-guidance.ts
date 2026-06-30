/**
 * Dynamic owner-facing INPUT GUIDANCE layer.
 *
 * Given the business profile + the data the owner has actually supplied (in owner category-space), this
 * tells the owner, for every data category: what it is, why it is needed, which decision it affects,
 * which confidence domain it affects, the expected confidence improvement, the recommendation that may
 * be wrong without it, whether action can proceed now or must wait, the minimum data for a first
 * diagnosis, the single next best input, the owner effort, and a privacy note.
 *
 * It is DYNAMIC, not a static checklist: the ranking and the next-best-input change with the business
 * type and with what is currently missing.
 *
 * Confidence is PROFILE-RELATIVE and mirrors the real `ingestBusinessState` rule (a missing relevant
 * critical domain forces low). It is therefore HONEST: supplying data that is irrelevant to THIS
 * business (outside its required set) never flips a still-missing relevant critical domain, so it never
 * inflates confidence. Supplying a relevant, currently-missing critical domain is the only thing that
 * raises it. No confidence number is invented — this preview obeys the same gate as the live engine.
 *
 * Pure module. No DB, no Date.now, no AI.
 */
import {
  type OwnerInputCategory,
  type EffortLevel,
  type GainLevel,
  INPUT_CATALOG,
  OWNER_INPUT_CATEGORIES,
  categoryConfidenceDomain,
  isCriticalCategory,
} from "@/domain/owner-mode/input-catalog";
import {
  requiredInputsForProfile,
  type BusinessProfileType,
  type OwnerRole,
} from "@/domain/owner-mode/owner-onboarding";
import type { Confidence, IngestionDomain } from "@/services/owner-mode/owner-domain-ingestion";

export type Tier = "minimum" | "recommended" | "optional";
export type Severity = "critical" | "high" | "medium" | "low";

export interface CategoryGuidance {
  category: OwnerInputCategory;
  label: string;
  why: string;
  decisionAffected: string;
  confidenceDomain: IngestionDomain;
  expectedConfidenceGain: GainLevel;
  recommendationAtRiskIfMissing: string;
  ownerEffort: EffortLevel;
  privacyNote: string;
  status: "supplied" | "missing";
  tier: Tier;
  severity: Severity;
  /** Can OpsIQ proceed with advice while this is missing? (false ⇒ a relevant critical is missing.) */
  canProceedNow: boolean;
  /** Must OpsIQ wait for this before any strong/high-risk action? */
  mustWait: boolean;
  confidenceNow: Confidence;
  confidenceIfSupplied: Confidence;
  confidenceWouldImprove: boolean;
}

export interface InputGuidance {
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  overallConfidence: Confidence;
  canRunFirstDiagnosis: boolean;
  canProceedWithStrongRecommendation: boolean;
  minimumRequired: OwnerInputCategory[];
  recommended: OwnerInputCategory[];
  optional: OwnerInputCategory[];
  minimumForFirstDiagnosis: OwnerInputCategory[];
  guidance: CategoryGuidance[];
  missingBySeverity: CategoryGuidance[];
  missingByConfidenceImpact: CategoryGuidance[];
  missingByOwnerEffort: CategoryGuidance[];
  nextBestInput: OwnerInputCategory | null;
}

/** Categories that unlock a limited first diagnosis (survival-grade financial read). */
export const FIRST_DIAGNOSIS_CATEGORIES: OwnerInputCategory[] = ["revenue_sales", "expenses", "cash_debt"];

const GAIN_RANK: Record<GainLevel, number> = { high: 0, medium: 1, low: 2 };
const EFFORT_RANK: Record<EffortLevel, number> = { low: 0, medium: 1, high: 2 };
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function severityOf(category: OwnerInputCategory, tier: Tier): Severity {
  if (isCriticalCategory(category)) return "critical";
  if (tier === "minimum") return "high";
  const gain = INPUT_CATALOG[category].expectedConfidenceGain;
  if (gain === "high") return "high";
  if (gain === "medium") return "medium";
  return "low";
}

/** Map a set of supplied categories to the set of filled confidence domains. */
export function filledDomainsFromCategories(categories: Iterable<OwnerInputCategory>): Set<IngestionDomain> {
  const out = new Set<IngestionDomain>();
  for (const c of categories) out.add(categoryConfidenceDomain(c));
  return out;
}

/**
 * Profile-relative confidence projection, CATEGORY-granular and profile-relative. It is stricter than
 * the domain-level live gate (it will not treat one critical category as covering another that shares a
 * domain), so the preview never OVER-states confidence — it only ever asks for the specific data the
 * owner is missing. A relevant critical category that is not supplied forces "low".
 */
function projectConfidence(
  supplied: Set<OwnerInputCategory>,
  criticalMinCategories: Set<OwnerInputCategory>,
  recommendedCategories: Set<OwnerInputCategory>,
): Confidence {
  if (supplied.size === 0) return "low";
  const criticalAllReal = [...criticalMinCategories].every((c) => supplied.has(c));
  if (!criticalAllReal) return "low";
  const missingRecommended = [...recommendedCategories].filter((c) => !supplied.has(c)).length;
  return missingRecommended > 2 ? "medium" : "high";
}

export interface BuildInputGuidanceArgs {
  profileType: BusinessProfileType;
  ownerRole: OwnerRole;
  /** Categories the owner has supplied (real records). */
  suppliedCategories: OwnerInputCategory[];
}

export function buildInputGuidance(args: BuildInputGuidanceArgs): InputGuidance {
  const { profileType, ownerRole } = args;
  const supplied = new Set(args.suppliedCategories);
  const req = requiredInputsForProfile(profileType, ownerRole);

  const tierOf = (c: OwnerInputCategory): Tier =>
    req.minimumRequired.includes(c) ? "minimum" : req.recommended.includes(c) ? "recommended" : "optional";

  // Relevant categories for the profile-relative, category-granular confidence projection.
  const criticalMinCategories = new Set(req.minimumRequired.filter(isCriticalCategory));
  const recommendedCategories = new Set([...req.minimumRequired, ...req.recommended]);
  const relevantCriticalDomains = new Set([...criticalMinCategories].map(categoryConfidenceDomain));

  const overallConfidence = projectConfidence(supplied, criticalMinCategories, recommendedCategories);
  const criticalAllReal = [...criticalMinCategories].every((c) => supplied.has(c));
  const canRunFirstDiagnosis = FIRST_DIAGNOSIS_CATEGORIES.every((c) => supplied.has(c));

  const guidance: CategoryGuidance[] = OWNER_INPUT_CATEGORIES.map((category) => {
    const meta = INPUT_CATALOG[category];
    const tier = tierOf(category);
    const status: "supplied" | "missing" = supplied.has(category) ? "supplied" : "missing";
    const severity = severityOf(category, tier);

    // Confidence if THIS category were additionally supplied.
    const after = new Set(supplied);
    after.add(category);
    const confidenceIfSupplied = projectConfidence(after, criticalMinCategories, recommendedCategories);

    const relevantCritical = criticalMinCategories.has(category) && relevantCriticalDomains.has(meta.confidenceDomain);
    return {
      category,
      label: meta.label,
      why: meta.why,
      decisionAffected: meta.decisionAffected,
      confidenceDomain: meta.confidenceDomain,
      expectedConfidenceGain: meta.expectedConfidenceGain,
      recommendationAtRiskIfMissing: meta.recommendationAtRiskIfMissing,
      ownerEffort: meta.ownerEffort,
      privacyNote: meta.privacyNote,
      status,
      tier,
      severity,
      canProceedNow: criticalAllReal,
      mustWait: status === "missing" && relevantCritical,
      confidenceNow: overallConfidence,
      confidenceIfSupplied,
      confidenceWouldImprove: CONFIDENCE_ORDER[confidenceIfSupplied] > CONFIDENCE_ORDER[overallConfidence],
    };
  });

  const missing = guidance.filter((g) => g.status === "missing");

  const missingBySeverity = [...missing].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const missingByConfidenceImpact = [...missing].sort(
    (a, b) =>
      (b.confidenceWouldImprove ? 1 : 0) - (a.confidenceWouldImprove ? 1 : 0) ||
      GAIN_RANK[a.expectedConfidenceGain] - GAIN_RANK[b.expectedConfidenceGain],
  );
  const missingByOwnerEffort = [...missing].sort((a, b) => EFFORT_RANK[a.ownerEffort] - EFFORT_RANK[b.ownerEffort]);

  // Next best input: prefer a missing MINIMUM category that would improve confidence; rank by severity,
  // then by whether it improves confidence, then by lowest effort. Falls back to recommended.
  const candidatePool = missing.filter((g) => g.tier === "minimum");
  const pool = candidatePool.length > 0 ? candidatePool : missing.filter((g) => g.tier === "recommended");
  const nextBestInput =
    pool.length === 0
      ? null
      : [...pool].sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            GAIN_RANK[a.expectedConfidenceGain] - GAIN_RANK[b.expectedConfidenceGain] ||
            (b.confidenceWouldImprove ? 1 : 0) - (a.confidenceWouldImprove ? 1 : 0) ||
            EFFORT_RANK[a.ownerEffort] - EFFORT_RANK[b.ownerEffort],
        )[0].category;

  return {
    profileType,
    ownerRole,
    overallConfidence,
    canRunFirstDiagnosis,
    canProceedWithStrongRecommendation: criticalAllReal,
    minimumRequired: req.minimumRequired,
    recommended: req.recommended,
    optional: req.optional,
    minimumForFirstDiagnosis: FIRST_DIAGNOSIS_CATEGORIES,
    guidance,
    missingBySeverity,
    missingByConfidenceImpact,
    missingByOwnerEffort,
    nextBestInput,
  };
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
