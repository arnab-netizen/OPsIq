/**
 * RC-7 Option C — recommendation-to-owner-constraint alignment verifier.
 *
 * A confident, causally-plausible diagnosis can still yield a recommendation
 * that is INFEASIBLE for the owner: it takes longer than the owner's time
 * horizon, costs more than the owner's budget band, ignores a legal/compliance-
 * sensitive context, exceeds available implementation capacity, or pushes risk
 * beyond stated tolerance. The abstention gate had no feasibility check.
 *
 * This verifier compares the recommended intervention against the owner
 * constraint profile using runtime-available signals only — no answer keys,
 * probe keys, monitor labels, case IDs, or benchmark labels. It only ever pushes
 * toward ABSTAIN.
 */

const COST_RANK: Record<string, number> = { MINIMAL: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
const BUDGET_RANK: Record<string, number> = { MINIMAL: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

export interface RecommendationProfile {
  costBand?: string; // MINIMAL | LOW | MEDIUM | HIGH
  estimatedTotalDays?: number;
  interventionClass?: string;
  /** Free text (title/objective/rationale/steps) used to detect compliance handling. */
  text?: string;
}

export interface OwnerConstraintProfileLike {
  budgetBand?: string;
  timeHorizonDays?: number;
  legalComplianceSensitive?: boolean;
  staffCapacity?: string; // LOW | MEDIUM | HIGH
  cashRunwayMonths?: number | null;
  riskAppetite?: string; // low | medium | high (optional)
}

export interface ConstraintAlignmentSignal {
  committed: boolean;
  conflict: boolean;
  reasons: string[];
}

const COMPLIANCE_STEMS = ["complian", "legal", "regulat", "review", "approval", "consent", "audit"];
const HIGHER_RISK_CLASSES = new Set(["GROWTH_ENABLEMENT", "STRUCTURAL_REPAIR"]);

function mentionsCompliance(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return COMPLIANCE_STEMS.some((s) => t.includes(s));
}

/**
 * Assess whether the recommendation is feasible under the owner constraints.
 * Pure and deterministic. `committed=false` ⇒ inert.
 */
export function assessConstraintAlignment(
  committed: boolean,
  rec: RecommendationProfile,
  ocp: OwnerConstraintProfileLike | undefined
): ConstraintAlignmentSignal {
  const reasons: string[] = [];
  if (!committed || !ocp) {
    return { committed, conflict: false, reasons: [] };
  }

  // 1. Action duration exceeds owner time horizon.
  if (
    typeof rec.estimatedTotalDays === "number" &&
    typeof ocp.timeHorizonDays === "number" &&
    rec.estimatedTotalDays > ocp.timeHorizonDays
  ) {
    reasons.push(
      `action duration (${rec.estimatedTotalDays}d) exceeds owner time horizon (${ocp.timeHorizonDays}d)`
    );
  }

  // 2. Cost band likely exceeds available budget band.
  if (rec.costBand && ocp.budgetBand) {
    const cost = COST_RANK[rec.costBand];
    const budget = BUDGET_RANK[ocp.budgetBand];
    if (cost !== undefined && budget !== undefined && cost > budget) {
      reasons.push(
        `recommendation cost band (${rec.costBand}) exceeds owner budget band (${ocp.budgetBand})`
      );
    }
  }

  // 3. Legal/compliance-sensitive context but recommendation lacks compliance review.
  if (ocp.legalComplianceSensitive && !mentionsCompliance(rec.text)) {
    reasons.push(
      "legal/compliance-sensitive context but recommendation does not address compliance review"
    );
  }

  // 4. Implementation requires capacity the owner lacks.
  if (
    ocp.staffCapacity === "LOW" &&
    ((rec.costBand && COST_RANK[rec.costBand] >= 2) ||
      (typeof rec.estimatedTotalDays === "number" && rec.estimatedTotalDays > 30))
  ) {
    reasons.push(
      "implementation capacity is LOW but the recommendation is cost/time-intensive"
    );
  }

  // 5. Recommendation increases risk beyond stated tolerance (only if provided).
  if (
    ocp.riskAppetite &&
    ocp.riskAppetite.toLowerCase() === "low" &&
    rec.interventionClass &&
    HIGHER_RISK_CLASSES.has(rec.interventionClass)
  ) {
    reasons.push(
      `recommendation class (${rec.interventionClass}) exceeds the owner's low risk tolerance`
    );
  }

  return { committed: true, conflict: reasons.length > 0, reasons };
}
