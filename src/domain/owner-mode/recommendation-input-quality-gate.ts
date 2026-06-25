/**
 * Module 2 — Recommendation input-quality / evidence-confidence promotion gate.
 *
 * The existing `assessInputQuality` (input-quality.ts) computes a workspace's
 * InputQualityStatus and is wired into diagnosis. This adds the promotion-time
 * policy: which recommendation categories may be promoted at a given input-quality
 * status. It encodes the spec's hard-fail rules — finance/growth/pricing/hiring
 * recommendations are blocked on weak evidence, compliance-sensitive ones are
 * routed to professional review — reusing InputQualityStatus (no duplication).
 *
 * Pure: no DB, no I/O. Wiring (load the persisted assessment + enforce at the
 * approval path) is layered on top of this gate.
 */

import type { InputQualityStatus } from "@/domain/owner-mode/input-quality";

/** Why a recommendation is sensitive to input quality (drives the hard-fail rule). */
export enum RecommendationSensitivity {
  FINANCE_SENSITIVE = "FINANCE_SENSITIVE",
  GROWTH_SENSITIVE = "GROWTH_SENSITIVE",
  PRICING_SENSITIVE = "PRICING_SENSITIVE",
  HIRING_SENSITIVE = "HIRING_SENSITIVE",
  COMPLIANCE_SENSITIVE = "COMPLIANCE_SENSITIVE",
  GENERAL = "GENERAL",
}

/** Promotion confidence outcome for a recommendation given input quality. */
export enum InputQualityPromotionOutcome {
  ALLOWED = "ALLOWED",
  BLOCKED_INSUFFICIENT_DATA = "BLOCKED_INSUFFICIENT_DATA",
  REQUIRES_OWNER_REVIEW = "REQUIRES_OWNER_REVIEW",
  REQUIRES_PROFESSIONAL_REVIEW = "REQUIRES_PROFESSIONAL_REVIEW",
}

/** Statuses that block a STRONG/sensitive recommendation (mirror of assessInputQuality). */
export const STATUSES_BLOCKING_STRONG: ReadonlySet<InputQualityStatus> = new Set<InputQualityStatus>([
  "critical_missing",
  "conflicting",
  "unsafe_for_strong_recommendation",
]);

/** Statuses that are weak but not outright blocking — sensitive recs need owner review. */
const STATUSES_WEAK: ReadonlySet<InputQualityStatus> = new Set<InputQualityStatus>([
  "data_limited",
  "stale",
  "owner_estimate_only",
]);

export interface InputQualityGateResult {
  outcome: InputQualityPromotionOutcome;
  allowed: boolean;
  reason: string;
}

/**
 * Decide whether a recommendation of a given sensitivity may be promoted at the
 * supplied input-quality status. Fail-closed for sensitive categories on weak or
 * blocking evidence; compliance always routes to professional review.
 */
export function evaluateInputQualityGate(
  status: InputQualityStatus,
  sensitivity: RecommendationSensitivity
): InputQualityGateResult {
  // Compliance-sensitive recommendations always need a professional, regardless of data.
  if (sensitivity === RecommendationSensitivity.COMPLIANCE_SENSITIVE) {
    return {
      outcome: InputQualityPromotionOutcome.REQUIRES_PROFESSIONAL_REVIEW,
      allowed: false,
      reason: "Compliance-sensitive recommendation requires professional review.",
    };
  }

  const blocksStrong = STATUSES_BLOCKING_STRONG.has(status);

  if (sensitivity === RecommendationSensitivity.GENERAL) {
    // General recs are only blocked on outright critical/conflicting evidence.
    if (status === "critical_missing" || status === "conflicting") {
      return {
        outcome: InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA,
        allowed: false,
        reason: `Input quality '${status}' blocks promotion.`,
      };
    }
    return { outcome: InputQualityPromotionOutcome.ALLOWED, allowed: true, reason: "Input quality sufficient." };
  }

  // Sensitive category (finance/growth/pricing/hiring):
  if (blocksStrong) {
    return {
      outcome: InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA,
      allowed: false,
      reason: `${sensitivity} recommendation blocked: input quality '${status}' is too weak.`,
    };
  }
  if (STATUSES_WEAK.has(status)) {
    return {
      outcome: InputQualityPromotionOutcome.REQUIRES_OWNER_REVIEW,
      allowed: false,
      reason: `${sensitivity} recommendation needs owner review: input quality '${status}'.`,
    };
  }
  return { outcome: InputQualityPromotionOutcome.ALLOWED, allowed: true, reason: "Input quality sufficient for a sensitive recommendation." };
}

/**
 * Map a finding's impact area to a recommendation sensitivity (deterministic,
 * conservative). Unknown areas default to GENERAL (least restrictive); the gate
 * still blocks GENERAL on outright critical/conflicting evidence.
 */
export function mapImpactAreaToSensitivity(impactArea: string | null | undefined): RecommendationSensitivity {
  const a = (impactArea ?? "").toLowerCase();
  if (/(compliance|legal|tax|licen|regulat|insurance|labour|labor)/.test(a)) return RecommendationSensitivity.COMPLIANCE_SENSITIVE;
  if (/(pricing|price|discount)/.test(a)) return RecommendationSensitivity.PRICING_SENSITIVE;
  if (/(financ|cash|margin|profit|cost|debt|payroll|revenue)/.test(a)) return RecommendationSensitivity.FINANCE_SENSITIVE;
  if (/(hir|headcount|recruit|staffing)/.test(a)) return RecommendationSensitivity.HIRING_SENSITIVE;
  if (/(growth|expansion|scale|marketing|acquisition|sales|funnel)/.test(a)) return RecommendationSensitivity.GROWTH_SENSITIVE;
  return RecommendationSensitivity.GENERAL;
}

/** Thrown when input quality is too weak to promote a sensitive recommendation. */
export class InputQualityGateError extends Error {
  readonly code = "INPUT_QUALITY_GATE_BLOCKED";
  readonly outcome: InputQualityPromotionOutcome;
  constructor(recommendationId: string, result: InputQualityGateResult) {
    super(`Recommendation ${recommendationId} cannot be promoted: ${result.reason}`);
    this.name = "InputQualityGateError";
    this.outcome = result.outcome;
  }
}

/** Guard the recommendation service calls; throws InputQualityGateError when blocked. */
export function assertInputQualityForPromotion(
  status: InputQualityStatus,
  sensitivity: RecommendationSensitivity,
  recommendationId: string
): void {
  const result = evaluateInputQualityGate(status, sensitivity);
  if (!result.allowed) throw new InputQualityGateError(recommendationId, result);
}
