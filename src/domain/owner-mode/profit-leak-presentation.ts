/**
 * Owner Mode — how the Home "profit leak" card is worded against the rest of Home (pure).
 *
 * TWO different readings share the word "leak":
 *   - the PROFIT-LEAK RADAR (profit-leak-radar.ts): operational signals (discounts, complaints, rework, capacity...) read from
 *     activity records. With none of them present it returns a `DATA_INSUFFICIENT` placeholder — which means "this radar cannot
 *     rate any leak", NOT "there is no leak";
 *   - the FINANCE cost-leakage finding (owner-finance): discounts, refunds, redone work and complaint costs measured from the
 *     money figures the owner saved for a period.
 * They read different evidence and can legitimately differ. What must not happen is Home telling the owner "no profit leak
 * detected" while its own main target says a cost leak was found. This module words the radar card so that the two statements
 * cannot contradict: the placeholder never claims absence, and when the current decision rests on a Finance cost-leakage
 * finding, the card says where that leak is.
 */
import type { ProfitLeakFinding } from "./profit-leak-radar";
import type { CurrentOwnerDecision, OwnerDecisionTarget } from "@/domain/owner-spine/owner-decision";

/** Finance finding / recommendation codes that assert a cost leak was found in the saved money figures. */
export const FINANCE_COST_LEAK_CODES: ReadonlySet<string> = new Set([
  "FIN_OPP_LEAKAGE_REDUCTION",
  "FIN_DISCOUNT_LEAKAGE",
  "FIN_REFUND_REWORK_LEAKAGE",
  "FINREC_REDUCE_LEAKAGE",
]);

function decisionTargets(decision: CurrentOwnerDecision | null | undefined): OwnerDecisionTarget[] {
  if (!decision) return [];
  return [decision.primaryTarget, ...(decision.supportingSteps ?? []), ...(decision.whatCanWait ?? [])].filter((t): t is OwnerDecisionTarget => Boolean(t));
}

/** The Finance cost-leakage target the current decision rests on (main target first), or null. */
export function financeCostLeakTarget(decision: CurrentOwnerDecision | null | undefined): OwnerDecisionTarget | null {
  return decisionTargets(decision).find((t) => t.domain === "finance" && FINANCE_COST_LEAK_CODES.has(t.findingCode)) ?? null;
}

export interface ProfitLeakCardView {
  headline: string;
  /** True for a real radar finding: the area / impact lines apply. */
  radarFinding: boolean;
  /** One line that says which reading the card is and, where it matters, points at the other. */
  scopeNote: string | null;
  /** The radar's own explanation is shown except where it would restate "no clear leak signal" next to a Finance leak. */
  showRadarExplanation: boolean;
}

export function presentProfitLeakCard(leak: ProfitLeakFinding, decision: CurrentOwnerDecision | null | undefined): ProfitLeakCardView {
  if (leak.leakType !== "DATA_INSUFFICIENT") {
    return { headline: "Profit leak detected", radarFinding: true, scopeNote: null, showRadarExplanation: true };
  }
  const financeLeak = financeCostLeakTarget(decision);
  if (financeLeak) {
    // "above" is only true when the leak IS the main target; otherwise point at Finance without claiming a position on the page.
    const isMain = decision?.primaryTarget?.candidateId === financeLeak.candidateId;
    return {
      headline: "Cost leakage found in your Money figures",
      radarFinding: false,
      showRadarExplanation: false,
      scopeNote:
        "Your saved money figures show discounts, refunds, redone work or complaint costs taking margin — see “" + financeLeak.title + "”" + (isMain ? " above. " : " on the Money page. ") +
        "The activity check on this card has no extra leak to add yet.",
    };
  }
  return {
    headline: "Not enough activity data to rate profit leaks yet",
    radarFinding: false,
    showRadarExplanation: true,
    scopeNote: "This is not a finding that nothing is leaking — it means the activity records this check reads are too thin to rate a leak.",
  };
}
