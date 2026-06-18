import { DiagnosisType, type EvidenceItem } from "@/domain/consulting-engine/types";
import {
  sequenceFirstAction,
  overridesTemplate,
  hasLegalRisk,
  type FirstActionPlan,
} from "./action-sequencing";

/**
 * R3 — Survival prioritization (pure, deterministic).
 *
 * R4 chooses a verify-first FIRST action from the committed diagnosis. R3 sits
 * ABOVE it and applies a survival/safety priority ladder to the FIRST action so a
 * cash/legal/irreversible/safety situation overrides an optimization action — even
 * when the committed diagnosis is not cash. Priority order:
 *
 *   1. immediate survival (short runway / payroll / insolvency)
 *   2. legal / compliance / fraud / regulatory containment
 *   3. irreversible / high-capex / dangerous-action prevention (defer & verify)
 *   4. safety / customer-trust containment
 *   5. evidence-gathering / diagnosis verification  (R4 base)
 *   6. operational optimization                     (R4 base)
 *   7. growth / retention / marketing improvement    (R4 base)
 *
 * It operates ONLY on the FIRST-ACTION layer using runtime evidence (no case ids,
 * benchmark labels, hidden keys, or answer-key text). It NEVER changes the committed
 * diagnosis, NEVER touches the safety gate, and only ever produces a low-cost
 * stabilize / contain / defer / verify action — so it can never convert a safe
 * abstention into a proceed and never weakens abstention. When no higher-priority
 * tier fires it returns the R4 action unchanged (R4 improvements preserved).
 */

export type SurvivalTier =
  | "SURVIVAL_CASH"
  | "LEGAL_CONTAINMENT"
  | "DEFER_IRREVERSIBLE"
  | "SAFETY_CONTAINMENT"
  | "BASE_R4";

export interface PrioritizedFirstAction {
  tier: SurvivalTier;
  plan: FirstActionPlan;
}

/** Runway (months) at or below which survival becomes the gating first action. */
export const SURVIVAL_RUNWAY_MONTHS = 3;

type Ev = Pick<EvidenceItem, "dimension" | "finding" | "isCritical" | "supportingData">;

function text(e: Ev): string {
  return `${e.finding} ${JSON.stringify(e.supportingData ?? {})}`.toLowerCase();
}
function num(e: Ev, k: string): number | undefined {
  const v = (e.supportingData ?? {})[k];
  return typeof v === "number" ? v : undefined;
}

function hasSurvivalPressure(ev: Ev[]): boolean {
  return ev.some((e) => {
    const r = num(e, "cashRunwayMonths") ?? num(e, "runwayMonths");
    if (r !== undefined && r <= SURVIVAL_RUNWAY_MONTHS) return true;
    return /cannot make payroll|missed payroll|cannot meet payroll|insolven|out of cash/.test(text(e));
  });
}

/**
 * An irreversible/dangerous owner-proposed action whose durability/justification is
 * unproven: a contemplated irreversible capex, or a deep discount that would turn
 * contribution negative. Detected from evidence only.
 */
function hasIrreversibleDanger(ev: Ev[]): boolean {
  const critical = ev.filter((e) => e.isCritical);
  const irreversibleCapex =
    critical.some((e) => num(e, "capexAmount") !== undefined) &&
    critical.some((e) => num(e, "reversibility") === 0 || num(e, "demandDurabilityMonths") !== undefined);
  const negativeMarginDiscount =
    critical.some((e) => /deep .*discount|across-the-board discount|deep discount/.test(text(e))) &&
    critical.some((e) => {
      const c = num(e, "contribution");
      return (c !== undefined && c < 0) || /contribution .*negative|turn negative/.test(text(e));
    });
  return irreversibleCapex || negativeMarginDiscount;
}

function hasSafetyTrustRisk(ev: Ev[]): boolean {
  return ev.some(
    (e) =>
      e.isCritical &&
      e.dimension === "quality_delivery" &&
      /recall|contamination|safety|health-related|hazard/.test(text(e))
  );
}

function cashStabilizePlan(): FirstActionPlan {
  return {
    kind: "STABILIZE_CASH",
    title: "Stabilize cash first: build a 13-week cash-flow forecast and secure committed liquidity before any optimization",
    objective: "Secure survival before any retention, growth, or optimization spend",
    rationale: "With a short runway, liquidity is the gating priority over optimization",
    whyThisNow: "Optimization spend before cash is secured risks insolvency",
    class: "STABILIZATION" as FirstActionPlan["class"],
    estimatedCostBand: "MINIMAL",
    estimatedDays: 7,
    successCriteria: "A 13-week forecast exists and committed liquidity is secured before optimization",
  };
}

function deferIrreversiblePlan(): FirstActionPlan {
  return {
    kind: "VERIFY_DIAGNOSIS",
    title: "Defer the proposed action; model its contribution and downside before any irreversible commitment",
    objective: "Prevent an irreversible value-destroying move until durability is proven",
    rationale: "The contemplated action is irreversible or value-destroying on current evidence",
    whyThisNow: "A reversible model must precede any irreversible commitment",
    class: "CONTAINMENT" as FirstActionPlan["class"],
    estimatedCostBand: "MINIMAL",
    estimatedDays: 7,
    successCriteria: "The downside and contribution are modelled before any irreversible commitment",
  };
}

function safetyContainmentPlan(): FirstActionPlan {
  return {
    kind: "CONTAIN_QUALITY",
    title: "Contain the safety/trust issue and run a root-cause review before any growth move",
    objective: "Protect customer trust by containing the safety issue first",
    rationale: "An unresolved safety/trust issue dominates over optimization",
    whyThisNow: "Operating before containment risks irreversible trust damage",
    class: "CONTAINMENT" as FirstActionPlan["class"],
    estimatedCostBand: "LOW",
    estimatedDays: 10,
    successCriteria: "The safety issue is contained and root-caused before any expansion",
  };
}

/**
 * Decide the FIRST action under the survival/safety priority ladder. Returns null
 * when there is no committed diagnosis (nothing to prepend; the gate decides
 * abstention). Otherwise returns the highest-priority action; when no survival/
 * legal/irreversible/safety tier fires it falls through to the R4 action (for the
 * families R4 overrides) or null (keep the diagnosis template).
 */
export function chooseFirstAction(input: {
  diagnosisType: DiagnosisType;
  committed: boolean;
  evidence: Ev[];
}): PrioritizedFirstAction | null {
  const { diagnosisType, committed, evidence } = input;
  if (!committed || diagnosisType === DiagnosisType.UNKNOWN) return null;

  // 1. Survival — overrides optimization even when the diagnosis is not cash.
  //    (When the diagnosis IS already cash, its template/R-actions handle it; we
  //    do not override to avoid regressing valid cash first actions.)
  if (hasSurvivalPressure(evidence) && diagnosisType !== DiagnosisType.CASH_LIQUIDITY_CRISIS) {
    return { tier: "SURVIVAL_CASH", plan: cashStabilizePlan() };
  }

  // 2. Legal / compliance containment.
  if (hasLegalRisk(evidence)) {
    return {
      tier: "LEGAL_CONTAINMENT",
      plan: sequenceFirstAction({ diagnosisType, committed: true, evidence }),
    };
  }

  // 3. Irreversible / dangerous-action prevention (defer & verify).
  if (hasIrreversibleDanger(evidence)) {
    return { tier: "DEFER_IRREVERSIBLE", plan: deferIrreversiblePlan() };
  }

  // 4. Safety / customer-trust containment (when not already a quality diagnosis).
  if (hasSafetyTrustRisk(evidence) && diagnosisType !== DiagnosisType.QUALITY_CONTROL_FAILURE) {
    return { tier: "SAFETY_CONTAINMENT", plan: safetyContainmentPlan() };
  }

  // 5–7. Fall through to the R4 action (verify/optimize/growth) for the families
  // R4 overrides; otherwise keep the diagnosis template (return null).
  if (overridesTemplate(diagnosisType, evidence)) {
    return {
      tier: "BASE_R4",
      plan: sequenceFirstAction({ diagnosisType, committed: true, evidence }),
    };
  }
  return null;
}
