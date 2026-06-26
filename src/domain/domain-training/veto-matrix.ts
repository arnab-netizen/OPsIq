/**
 * F6 — Domain veto matrix (pure).
 *
 * Aggregates the already-computed verdicts of the existing safety gates (M4/M5 cash
 * safety, M21 growth readiness, operational-safety, quality, capacity, workload) into
 * a single set of vetoed actions. It does NOT re-derive those verdicts — it consumes
 * them (same pattern as the guidance orchestrator). Owner preference cannot bypass a
 * veto. Pure + deterministic.
 */

export type VetoedAction =
  | "growth" | "paid_marketing" | "expansion" | "non_essential_hiring" | "bulk_buying"
  | "discounting_below_margin" | "low_price_b2b" | "revenue_chasing" | "demand_generation"
  | "new_non_critical_task" | "owner_heavy_action" | "scale"
  | "closure" | "learning_admission" | "high_confidence_recommendation" | "confident_diagnosis";

/** Pre-computed gate verdicts (populated from the live gates by the wiring layer). */
export interface VetoContext {
  criticalCashSurvivalRisk: boolean;
  complianceOrSafetyUncertain: boolean;
  severeQualityFailure: boolean;
  capacityOverload: boolean;
  staffOverload: boolean;
  ownerOverload: boolean;
  negativeMargin: boolean;
  missingProof: boolean;
  contradictoryData: boolean;
  unverifiedOutcome: boolean;
  /** Only this can relax an owner-overload veto — never owner preference. */
  survivalCritical: boolean;
}

interface VetoRule {
  trigger: (c: VetoContext) => boolean;
  reason: string;
  blocks: VetoedAction[];
}

const VETO_RULES: readonly VetoRule[] = [
  { trigger: (c) => c.criticalCashSurvivalRisk, reason: "critical cash survival risk",
    blocks: ["growth", "paid_marketing", "expansion", "non_essential_hiring", "bulk_buying"] },
  { trigger: (c) => c.complianceOrSafetyUncertain, reason: "compliance/safety uncertainty (verify/expert first)",
    blocks: ["growth", "scale", "demand_generation"] },
  { trigger: (c) => c.severeQualityFailure, reason: "severe quality failure",
    blocks: ["paid_marketing", "growth", "scale"] },
  { trigger: (c) => c.capacityOverload, reason: "capacity overload",
    blocks: ["demand_generation", "paid_marketing", "growth"] },
  { trigger: (c) => c.staffOverload, reason: "staff overload",
    blocks: ["demand_generation", "new_non_critical_task"] },
  { trigger: (c) => c.ownerOverload && !c.survivalCritical, reason: "owner overload (non-survival)",
    blocks: ["owner_heavy_action"] },
  { trigger: (c) => c.negativeMargin, reason: "negative contribution margin",
    blocks: ["discounting_below_margin", "low_price_b2b", "revenue_chasing"] },
  { trigger: (c) => c.missingProof, reason: "missing proof",
    blocks: ["closure", "learning_admission", "high_confidence_recommendation"] },
  { trigger: (c) => c.contradictoryData, reason: "contradictory data",
    blocks: ["confident_diagnosis", "high_confidence_recommendation"] },
  { trigger: (c) => c.unverifiedOutcome, reason: "unverified outcome",
    blocks: ["learning_admission"] },
];

export interface VetoResult {
  blocked: VetoedAction[];
  reasons: { action: VetoedAction; reason: string }[];
}

/** Evaluate all vetoes. Deterministic; owner preference is not an input and cannot bypass. */
export function evaluateVetoes(ctx: VetoContext): VetoResult {
  const blocked = new Set<VetoedAction>();
  const reasons: { action: VetoedAction; reason: string }[] = [];
  for (const rule of VETO_RULES) {
    if (rule.trigger(ctx)) {
      for (const a of rule.blocks) {
        if (!blocked.has(a)) reasons.push({ action: a, reason: rule.reason });
        blocked.add(a);
      }
    }
  }
  return { blocked: [...blocked], reasons };
}

export function isVetoed(action: VetoedAction, ctx: VetoContext): boolean {
  return evaluateVetoes(ctx).blocked.includes(action);
}

export const NO_VETOES: VetoContext = {
  criticalCashSurvivalRisk: false, complianceOrSafetyUncertain: false, severeQualityFailure: false,
  capacityOverload: false, staffOverload: false, ownerOverload: false, negativeMargin: false,
  missingProof: false, contradictoryData: false, unverifiedOutcome: false, survivalCritical: false,
};
