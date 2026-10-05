/**
 * Owner Portfolio — investment eligibility (A2). ONE pure, deterministic helper; it is NOT an advice policy.
 *
 * Ranking is not permission. `bestGrowthCandidateBusinessId` stays a pure ranking output (highest growth
 * signal among businesses with measured survival risk below the bar). Whether OpsIQ may RECOMMEND putting money
 * into a business is decided here, per business, from the SAME canonical facts every other owner surface uses:
 *   - the business's ONE canonical `CurrentOwnerDecision` and its `advicePolicy` (owner-advice-policy.ts), read
 *     through `ownerMaterialCommitmentGuard` — the mode switch is never copied here;
 *   - the canonical primary priority class (a present, higher-priority problem comes before growth spending);
 *   - the canonical `staleDomains` (owner-candidate-builder.ts), passed in as context — no freshness rule,
 *     constant or `generatedAt` inference lives in Portfolio.
 *
 * A numeric survival risk below the bar is a number, not proof: the survival reading must also be complete and current
 * (`input.survivalEvidence`, resolved once by Owner Home — survival-evidence.ts), and the elected target's canonical INTENT
 * (`ownerTargetIntent`) must be to grow or execute: PROCESS_OPTIMISATION also holds evidence requests, which come first.
 * Unknown is neither safe nor dangerous — it withholds the recommendation and says what to confirm; it never alters a score.
 *
 * Scope boundary: this does NOT make growth scores comparable across businesses or domains. growthOpportunityScore is
 * still a raw max over each domain's own opportunity scale (score-semantics.ts); that is a separate, known
 * limitation (P2) and no formula, weight, rescaling or threshold is introduced or changed here.
 *
 * Fail closed: a missing canonical decision, a decision for another business, or unknown freshness never qualifies.
 */
import { clampScore } from "@/domain/owner-spine/contracts";
import { OWNER_PRIORITY_CLASS_LABEL, ownerDomainLabel, type OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import { ownerTargetIntent, type OwnerTargetIntent } from "@/domain/owner-spine/owner-imperatives";
import { isSurvivalDomain } from "@/domain/owner-spine/survival-evidence";
import { ownerMaterialCommitmentGuard } from "@/domain/owner-spine/owner-advice-policy";
import type { PortfolioBusinessInput } from "./types";
import type { PortfolioThresholds } from "./thresholds";

/** Why a business is not eligible. The first four are quantitative (it never qualified); the rest HOLD a qualifying business. */
export type PortfolioInvestmentBlockReason =
  | "NO_PROFILE"
  | "SURVIVAL_NOT_MEASURED"
  | "SURVIVAL_ABOVE_BAR"
  | "GROWTH_BELOW_MINIMUM"
  | "NO_OWNER_DECISION"
  | "OWNER_DECISION_BUSINESS_MISMATCH"
  | "NO_EVIDENCE"
  | "ADVICE_POLICY_PROHIBITS_COMMITMENT"
  | "PRIMARY_CONCERN_COMES_FIRST"
  | "EVIDENCE_REQUEST_COMES_FIRST"
  | "SURVIVAL_LIQUIDITY_UNCONFIRMED"
  | "SURVIVAL_CASHFLOW_POSITION_INCOMPLETE"
  | "SURVIVAL_EVIDENCE_OUT_OF_DATE"
  | "SURVIVAL_EVIDENCE_UNVERIFIABLE"
  | "GROWTH_SIGNAL_OUT_OF_DATE"
  | "GROWTH_SIGNAL_UNVERIFIABLE";

/** The canonical classes that may host a growth/investment recommendation (everything else comes first, fail closed). */
const GROWTH_COMPATIBLE_CLASSES: ReadonlySet<OwnerPriorityClass> = new Set<OwnerPriorityClass>(["GROWTH_OPPORTUNITY", "PROCESS_OPTIMISATION"]);

/**
 * Of the growth-compatible classes, only a target whose canonical INTENT is to grow or to execute improvement work may host an
 * investment recommendation. PROCESS_OPTIMISATION also holds evidence requests (e.g. "add your bank balance"), whose
 * canonical intent is EVIDENCE; the intent comes from `ownerTargetIntent`, never from a code list kept here.
 */
const INVESTMENT_COMPATIBLE_INTENTS: ReadonlySet<OwnerTargetIntent> = new Set<OwnerTargetIntent>(["GROW", "EXECUTE"]);

export type PortfolioInvestmentEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: PortfolioInvestmentBlockReason;
      /** true = the business passed the quantitative criteria and is HELD by canonical policy (owner is told why). */
      held: boolean;
      /** Plain-language statement (no enum names, no confidence figures). */
      ownerStatement: string;
      reasons: string[];
      /** What must happen before OpsIQ will reassess. */
      nextStep: string;
    };

function notQualifying(reason: PortfolioInvestmentBlockReason, ownerStatement: string): PortfolioInvestmentEligibility {
  return { eligible: false, reason, held: false, ownerStatement, reasons: [], nextStep: "" };
}

function held(reason: PortfolioInvestmentBlockReason, ownerStatement: string, reasons: string[], nextStep: string): PortfolioInvestmentEligibility {
  return { eligible: false, reason, held: true, ownerStatement, reasons, nextStep };
}

/**
 * Domains whose own opportunity score IS the profile's growth signal (growth is a max over domains). Ties at the exact
 * maximum all support it: the signal is out of date only when EVERY supporting domain is out of date. A lower fresh
 * domain is never substituted for a stale maximum.
 */
function growthSupportingDomains(input: PortfolioBusinessInput): string[] {
  const p = input.profile;
  if (!p) return [];
  const growth = clampScore(p.growthOpportunityScore);
  return p.domainScores.filter((d) => clampScore(d.opportunityScore) === growth).map((d) => d.domain);
}

/** Assess whether OpsIQ may recommend investing in this business. Pure; one business's inputs only. */
export function assessPortfolioInvestmentEligibility(input: PortfolioBusinessInput, thresholds: PortfolioThresholds): PortfolioInvestmentEligibility {
  const p = input.profile;
  // (A) Existing quantitative criteria — values unchanged. null survival is NOT MEASURED, never safe; a measured 0 is measured.
  if (!p) return notQualifying("NO_PROFILE", "No diagnosis exists for this business yet.");
  if (p.survivalRiskScore === null) return notQualifying("SURVIVAL_NOT_MEASURED", "Survival risk has not been measured for this business.");
  if (clampScore(p.survivalRiskScore) >= thresholds.safeInvestmentSurvivalRiskBar) return notQualifying("SURVIVAL_ABOVE_BAR", "Survival risk is too high for an investment recommendation.");
  if (clampScore(p.growthOpportunityScore) < thresholds.minInvestmentOpportunityScore) return notQualifying("GROWTH_BELOW_MINIMUM", "The growth signal is below the level that would justify an investment recommendation.");

  // (B) The business's own canonical decision must exist.
  const d = input.ownerDecision;
  if (!d) return held("NO_OWNER_DECISION", "OpsIQ has not resolved this business's current decision, so it cannot recommend investing.", [], "Open the business's owner home so its current decision is resolved, then reassess.");
  if (d.businessId !== input.businessId) return held("OWNER_DECISION_BUSINESS_MISMATCH", "OpsIQ could not match this business to its own current decision, so it cannot recommend investing.", [], "Reload the portfolio; the decision must belong to this business.");

  // A decision without its advice policy cannot be read as permission (fail closed, never throw).
  if (!d.advicePolicy) return held("NO_OWNER_DECISION", "OpsIQ could not read the advice that applies to this business's current decision, so it cannot recommend investing.", [], "Reload the portfolio, then reassess.");

  // (C) The canonical material-decision guard decides whether a hold applies (the guard is the projection). Null means
  // "no hold applies"; it is deliberately NOT the same as the policy's commitment flag being true (a supported NO_OPEN_ACTIONS
  // policy has that flag false and no guard, and stays eligible).
  const guard = ownerMaterialCommitmentGuard(d.advicePolicy);
  if (guard) {
    return held("ADVICE_POLICY_PROHIBITS_COMMITMENT", d.advicePolicy.ownerStatement, [...d.advicePolicy.reasons], d.advicePolicy.nextEvidenceAction || guard.prohibition);
  }

  // (C2) A numeric survival risk below the bar is a number, not proof. The survival reading must be sufficiently evidenced
  // (complete and current) — resolved once by Owner Home (survival-evidence.ts). Unknown is neither safe nor dangerous: it withholds clearance.
  const se = input.survivalEvidence;
  if (!se || p.domainScores.some((dm) => isSurvivalDomain(dm.domain) && !se.coveredDomains.includes(dm.domain))) {
    return held("SURVIVAL_EVIDENCE_UNVERIFIABLE", "OpsIQ could not confirm that the figures behind this business's survival reading are complete and current, so it will not recommend committing more money yet.", [], "Reload the portfolio, then reassess.");
  }
  if (se.financeLiquidityUnconfirmed) {
    return held("SURVIVAL_LIQUIDITY_UNCONFIRMED", "Your bank balance is not confirmed, so OpsIQ cannot yet say how much cash this business has. It will not recommend committing more money until it is.", [], "Confirm the bank balance (enter 0 if there is none) in Guided setup or Cashflow and re-run the Finance diagnosis; OpsIQ will then reassess.");
  }
  if (se.cashflowPositionIncomplete) {
    return held("SURVIVAL_CASHFLOW_POSITION_INCOMPLETE", "Your latest cash-flow check does not include both cash in hand and the bank balance, so OpsIQ cannot confirm your total cash. It will not recommend committing more money until it can.", [], "Record a current cash-flow check that includes both cash in hand and the bank balance; OpsIQ will then reassess.");
  }
  if (se.staleSurvivalDomains.length > 0) {
    const labels = se.staleSurvivalDomains.map((dm) => ownerDomainLabel(dm)).join(", ");
    return held("SURVIVAL_EVIDENCE_OUT_OF_DATE", `The ${labels} figures behind this business's survival reading are out of date, so OpsIQ will not rely on them to recommend committing more money.`, [], `Update the ${labels} figures and re-run their diagnosis; OpsIQ will then reassess.`);
  }

  // (D) A present, higher-priority canonical concern is handled before growth spending.
  if (d.state === "NO_EVIDENCE") {
    return held("NO_EVIDENCE", "No evidence supports a recommendation for this business yet.", [], "Add the business's numbers and run a diagnosis, then reassess.");
  }
  const target = d.state === "TARGET" ? d.primaryTarget : null;
  if (d.state === "TARGET" && !target) {
    return held("NO_OWNER_DECISION", "OpsIQ has not resolved this business's current main target, so it cannot recommend investing.", [], "Reassess once the current decision is resolved.");
  }
  if (target && !GROWTH_COMPATIBLE_CLASSES.has(target.priorityClass)) {
    const concern = OWNER_PRIORITY_CLASS_LABEL[target.priorityClass];
    return held("PRIMARY_CONCERN_COMES_FIRST", `This business's main concern right now is ${concern}; handle that before investing more.`, [`Main target: ${target.title}`], "Resolve or complete the main target, then OpsIQ will reassess.");
  }

  if (target && !INVESTMENT_COMPATIBLE_INTENTS.has(ownerTargetIntent(target))) {
    return held("EVIDENCE_REQUEST_COMES_FIRST", `This business's main step right now is "${target.title}", which comes before committing more money.`, [], "Complete that step; OpsIQ will then reassess.");
  }

  // Freshness: the SAME canonical staleDomains the decision was resolved with. Unknown freshness fails closed.
  if (!input.staleDomains) {
    return held("GROWTH_SIGNAL_UNVERIFIABLE", "OpsIQ could not confirm how current the figures behind this growth signal are.", [], "Reload the portfolio, then reassess.");
  }
  const supporting = growthSupportingDomains(input);
  if (supporting.length === 0) {
    return held("GROWTH_SIGNAL_UNVERIFIABLE", "OpsIQ could not trace this growth signal to a diagnosed area.", [], "Re-run the diagnosis, then reassess.");
  }
  const stale = new Set(input.staleDomains);
  if (supporting.every((dom) => stale.has(dom))) {
    return held("GROWTH_SIGNAL_OUT_OF_DATE", "The figures behind this growth signal are out of date, so OpsIQ will not recommend investing on them.", [], "Update the out-of-date figures and re-run their diagnosis, then reassess.");
  }
  return { eligible: true };
}
