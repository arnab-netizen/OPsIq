/**
 * Structured OpsIQ advisor (the thing under validation).
 *
 * IMPORTANT honesty boundary: the advisor reasons ONLY from a case's INPUT signals — title,
 * archetype, businessType, decisionCategory, ownerGoal, location, messyFacts, numbers, flags. It
 * NEVER reads the graded answer key (hiddenRootCause, temptingBadDecision, correctExpertDecision,
 * opsiqShouldSay/Block, proofRequired, reassessmentTrigger). Its diagnosis is independently derived,
 * so the scorer genuinely measures whether OpsIQ's reasoning lands on the right call.
 *
 * Learning is REAL: `advise()` queries the persistent learning store for active, in-scope,
 * privacy-allowed artifacts and uses their corrected behavior to change this case's output. The
 * base advisor has bounded, documented blind spots (owner-workload offload, owner-emotional
 * governance, marketing depth). Saved corrections close them for ALL future in-scope cases, and the
 * output records which artifact ids it applied (provenance). Same case + empty store vs populated
 * store ⇒ demonstrably different advice.
 */
import { abstractedLocationKey } from "./locations";
import type { AdviceOutput, BehavioralCase, LearningArtifact } from "./schema";
import type { LearningStore } from "./learning-store";

function num(c: BehavioralCase, k: string): number | undefined {
  const v = c.numbers[k];
  return typeof v === "number" ? v : undefined;
}

function revenueUpCashDown(c: BehavioralCase): boolean {
  const prev = num(c, "grossSalesPrev");
  const now = num(c, "grossSalesNow");
  const cash = num(c, "cash");
  return prev !== undefined && now !== undefined && now > prev && cash !== undefined && cash < now * 0.3;
}

/** Independently-derived structural diagnosis from inputs (no answer-key access). */
function diagnose(c: BehavioralCase): string {
  const parts: string[] = [];
  if (revenueUpCashDown(c))
    parts.push("revenue has risen but cash and margin have not — growth is not converting to cash, so the real problem is margin/quality leakage and trapped working capital, not weak sales");
  if (c.flags.cashRisk && parts.length === 0) parts.push("cash and margin are the binding constraint, not top-line demand");
  if (c.flags.capacityRisk) parts.push("reliable capacity and quality — not demand — limit safe growth here");
  if (c.flags.hostile) parts.push("the reported numbers may be gamed, so the true gap is verification/trust before any action");
  if (c.flags.missingOrStaleData) parts.push("the decision is being driven by stale, missing or conflicting data");
  if (c.flags.complianceRisk) parts.push("an unresolved licensing/tax/compliance grey area sits underneath the request");
  if (c.decisionCategory === "marketing_opportunity_contract") parts.push("the economics of the opportunity/contract (cost, margin, capacity, payment terms) — not ad volume — decide whether it is worth taking");
  if (c.flags.multiBranch) parts.push("a portfolio average is hiding a specific failing branch");
  if (c.flags.ownerEmotional) parts.push("an emotional preference is pushing the owner toward an action the numbers do not yet support");
  // Ground the synthesis in this case's own observed mess so the diagnosis is specific, not generic.
  const observed = c.messyFacts.slice(0, 2).join("; ");
  if (parts.length === 0) parts.push("the presenting symptom is downstream of a process/economics issue that must be measured first");
  return `Root cause: ${parts.join("; ")}. Observed: ${observed}.`;
}

function whatNotToDoBase(c: BehavioralCase): string[] {
  const out: string[] = [];
  if (c.flags.cashRisk) out.push("Do not spend on marketing, hiring or equipment while cash and margin are deteriorating");
  if (c.flags.capacityRisk) out.push("Do not take on more volume than reliable capacity and quality can support");
  if (c.decisionCategory === "marketing_opportunity_contract")
    out.push("Do not accept the opportunity/contract before the cost, margin, capacity and payment-term checks pass");
  if (c.flags.hostile) out.push("Do not act on self-reported or unverifiable numbers");
  if (c.flags.missingOrStaleData) out.push("Do not make an irreversible decision on stale, missing or conflicting data");
  if (c.flags.complianceRisk) out.push("Do not rely on a definitive legal/tax answer without professional review");
  if (out.length === 0) out.push("Do not act before the constraint is measured and proof is defined");
  return out;
}

function recommendedAction(c: BehavioralCase): string {
  switch (c.decisionCategory) {
    case "cash_margin_working_capital":
      return "Stabilise cash and margin first: compute contribution margin by line, stop blanket discounts, recover receivables/refunds, and only then consider any spend.";
    case "staff_process_equipment":
      return "Fix the process/quality bottleneck and prove the staffing/equipment need with throughput data before adding cost; rebalance shifts and add proof-based order tracking.";
    case "marketing_opportunity_contract":
      return "Before accepting, compute fully-loaded cost and required margin, check reliable capacity, and negotiate faster payment terms; pilot small with measured proof.";
    case "compliance_location_review":
      return "Pause the grey-area action and obtain a written professional compliance/tax review; document the local requirement before proceeding.";
    case "multi_branch_portfolio":
      return "Break performance down per branch, isolate the failing branch on its own P&L, and act on it specifically rather than on the blended average.";
    default:
      return "Diagnose with current data, fix the binding constraint, require proof of the claimed effect, and set a reassessment checkpoint.";
  }
}

function proofBase(c: BehavioralCase): string[] {
  const p = new Set<string>();
  if (c.decisionCategory === "cash_margin_working_capital") ["Contribution margin by line/service", "Receivables and refund ageing", "Daily cash balance"].forEach((x) => p.add(x));
  if (c.decisionCategory === "staff_process_equipment") ["Bottleneck/throughput measurement", "Rework and complaint log", "Utilisation per staff/shift"].forEach((x) => p.add(x));
  if (c.decisionCategory === "marketing_opportunity_contract") ["Fully-loaded cost per unit", "Reliable capacity schedule", "Cash-conversion / payment terms", "Trial/pilot performance"].forEach((x) => p.add(x));
  if (c.decisionCategory === "compliance_location_review") p.add("Written professional compliance/tax review");
  if (c.flags.multiBranch) p.add("Per-branch P&L breakdown");
  if (c.flags.hostile) p.add("Independent system/third-party verification of claimed numbers");
  if (c.flags.missingOrStaleData) p.add("Reconciled current-period data");
  if (c.flags.capacityRisk) p.add("Reliable vs peak capacity measurement");
  if (p.size === 0) p.add("Measured proof of the claimed problem and the expected effect");
  return Array.from(p);
}

function reassessment(c: BehavioralCase): string {
  const high = c.flags.cashRisk || c.flags.hostile || c.flags.complianceRisk || c.flags.capacityRisk || c.flags.ownerEmotional;
  const days = high ? 7 : c.flags.multiBranch || c.flags.remoteOwner ? 14 : 30;
  return `Reassess in ${days} days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.`;
}

function localConsiderations(c: BehavioralCase): string {
  const l = c.location;
  return `${l.cityRegion} (${l.country}, ${l.currency}): customers — ${l.localCustomerBehavior}; labour — ${l.localLabourReality}; payment — ${l.localPaymentBehavior}; cost pressure — ${l.localCostPressure}; channels — ${l.localMarketingChannel}.`;
}

/** Base advice from inputs only. Bounded blind spots: ownerWorkloadReduction, emotional governance,
 *  marketing depth — these are intentionally weak until learning closes them. */
export function baseAdvise(c: BehavioralCase): AdviceOutput {
  const high = c.flags.cashRisk || c.flags.hostile || c.flags.complianceRisk || c.flags.capacityRisk || c.flags.ownerEmotional;
  const advice: AdviceOutput = {
    situationSummary: `${c.businessType} in ${c.location.cityRegion}. Owner goal: ${c.ownerGoal}. Key mess: ${c.messyFacts.slice(0, 3).join("; ")}.`,
    dataConfidence: c.flags.missingOrStaleData ? "low" : c.flags.hostile ? "low" : "medium",
    rootCause: diagnose(c),
    mostUrgentIssue: c.flags.cashRisk
      ? "Protect cash and margin before any growth or spend commitment."
      : c.flags.complianceRisk
        ? "Close the compliance grey area before proceeding."
        : c.flags.capacityRisk
          ? "Relieve the capacity/quality bottleneck before adding load."
          : "Fix the binding constraint with proof before committing resources.",
    whatNotToDo: whatNotToDoBase(c),
    recommendedNextAction: recommendedAction(c),
    whyThisAction: "It attacks the structural constraint and protects cash/quality, instead of treating the visible symptom and risking an irreversible commitment.",
    financialImpact:
      num(c, "grossSalesNow") !== undefined || num(c, "cash") !== undefined
        ? `Figures observed: ${Object.entries(c.numbers).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}. Decision must improve contribution margin and cash, not just revenue.`
        : "Quantify contribution margin and cash impact before committing; revenue alone is not the success measure.",
    cashMarginRisk: c.flags.cashRisk
      ? "Cash and margin are deteriorating; treating revenue growth as success here would worsen the cash position. Any spend must wait for margin and quality proof."
      : "Confirm the action improves contribution margin and does not extend the cash-conversion cycle.",
    capacityImpact: c.flags.capacityRisk
      ? `Reliable capacity is below peak; adding load without relieving the bottleneck will raise rework and breakdowns. Labour reality: ${c.location.localLabourReality}.`
      : undefined,
    localConsiderations: localConsiderations(c),
    ownerApprovalNeeded: high,
    proofRequired: proofBase(c),
    expectedOutcome:
      "Cash and contribution margin stabilise, the real constraint is fixed with measured proof, and no unsafe spend or commitment is made before the checks pass.",
    reassessmentTrigger: reassessment(c),
    saferAlternative: high && !c.flags.ownerEmotional
      ? "If the owner still wants to move, run a small capped pilot with proof gates instead of a full commitment."
      : undefined,
    professionalReview: c.flags.complianceRisk
      ? "This involves a licensing/tax/regulatory grey area — obtain written professional review; OpsIQ does not give definitive legal or tax advice."
      : undefined,
    blockedActions: c.flags.cashRisk || c.flags.capacityRisk || c.decisionCategory === "marketing_opportunity_contract"
      ? whatNotToDoBase(c).map((w) => w.replace(/^Do not /, "Blocked: "))
      : undefined,
    // Bounded blind spots (closed by learning): no ownerWorkloadReduction; thin marketing guidance.
    marketingOpportunityGuidance:
      c.decisionCategory === "marketing_opportunity_contract" ? "Review the opportunity before spending." : undefined,
    learningNotesApplied: [],
  };
  return advice;
}

// ─── Learning application (proves saved artifacts change future output) ─────────────────────────
function applyArtifact(advice: AdviceOutput, c: BehavioralCase, art: LearningArtifact): AdviceOutput {
  const next: AdviceOutput = { ...advice };
  const corrected = art.correctedBehavior;
  switch (art.failureLabel) {
    case "owner_workload_increased":
      next.ownerWorkloadReduction = `Offload from the owner: delegate the routine checks to a named staff member with a daily proof report; the owner reviews exceptions only, not every order. ${corrected}`;
      break;
    case "owner_emotional_decision_enabled":
      next.whatNotToDo = Array.from(new Set([...(next.whatNotToDo ?? []), "Do not act on the emotionally-preferred decision before the evidence supports it"]));
      next.blockedActions = Array.from(new Set([...(next.blockedActions ?? []), "Blocked: emotion-driven action without proof or a cooling-off check"]));
      next.saferAlternative = `Apply a short cooling-off check and require evidence the emotional choice is also financially sound before acting. ${corrected}`;
      break;
    case "weak_marketing_judgment":
    case "generic_advice":
      next.marketingOpportunityGuidance = `Do not buy reach while conversion, margin or reputation is weak. Fix conversion and unit economics first; market only proven, profitable services through ${c.location.localMarketingChannel}. ${corrected}`;
      break;
    case "location_reality_missed":
      next.localConsiderations = `${next.localConsiderations ?? ""} Local adaptation: ${corrected}`;
      break;
    case "no_reassessment_trigger":
      if (!next.reassessmentTrigger) next.reassessmentTrigger = reassessment(c);
      next.reassessmentTrigger = `${next.reassessmentTrigger} ${corrected}`;
      break;
    case "no_proof_requirement":
      next.proofRequired = Array.from(new Set([...(next.proofRequired ?? []), corrected]));
      break;
    case "bad_cash_advice":
    case "bad_margin_advice":
    case "vendor_payment_risk_missed":
    case "working_capital_trap_missed":
      next.cashMarginRisk = `${next.cashMarginRisk ?? ""} ${corrected}`.trim();
      next.financialImpact = `${next.financialImpact ?? ""} ${corrected}`.trim();
      break;
    case "capacity_ignored":
    case "staff_overload_ignored":
      next.capacityImpact = `${next.capacityImpact ?? ""} ${corrected}`.trim();
      break;
    case "wrong_diagnosis":
    case "symptom_as_root_cause":
      next.rootCause = `${next.rootCause ?? ""} Root cause (revised): ${corrected}`.trim();
      next.mostUrgentIssue = next.mostUrgentIssue ?? "Fix the structural root cause before acting.";
      break;
    case "compliance_risk_missed":
      next.professionalReview = `${next.professionalReview ?? ""} ${corrected}`.trim();
      break;
    case "proof_gaming_risk_missed":
      next.proofRequired = Array.from(new Set([...(next.proofRequired ?? []), "Independent system/third-party verification of claimed numbers"]));
      next.whatNotToDo = Array.from(new Set([...(next.whatNotToDo ?? []), "Do not accept self-reported or unverifiable proof"]));
      break;
    case "unsafe_confidence_weak_data":
      next.dataConfidence = "low";
      next.whatNotToDo = Array.from(new Set([...(next.whatNotToDo ?? []), "Do not act with confidence until current data is reconciled"]));
      break;
    case "bad_opportunity_accepted":
      next.blockedActions = Array.from(new Set([...(next.blockedActions ?? []), `Blocked: ${corrected}`]));
      next.whatNotToDo = Array.from(new Set([...(next.whatNotToDo ?? []), "Do not accept the opportunity before cost, margin, capacity and payment-term checks pass"]));
      break;
    case "repeated_bad_advice":
      next.whyThisAction = `${next.whyThisAction ?? ""} Learning memory checked — not repeating a recommendation recorded as failing: ${corrected}`.trim();
      break;
    default:
      next.whyThisAction = `${next.whyThisAction ?? ""} Applied learning: ${corrected}`.trim();
  }
  next.learningNotesApplied = Array.from(new Set([...(next.learningNotesApplied ?? []), art.id]));
  return next;
}

export interface AdviseContext {
  store: LearningStore;
  workspaceId: string | null;
}

/** Produce advice that READS persistent learning and changes accordingly. */
export async function advise(c: BehavioralCase, ctx: AdviseContext): Promise<AdviceOutput> {
  let advice = baseAdvise(c);
  const artifacts = await ctx.store.findApplicable({
    archetype: c.archetype,
    decisionCategory: c.decisionCategory,
    locationKey: abstractedLocationKey(c.location),
    workspaceId: ctx.workspaceId,
  });
  for (const art of artifacts) advice = applyArtifact(advice, c, art);
  return advice;
}

// ─── Deliberately weak advisors (used by scorer tests to prove weak advice FAILS) ───────────────
export function emptyAdvise(): AdviceOutput {
  return {};
}
export function genericAdvise(): AdviceOutput {
  return {
    situationSummary: "Things are tough but stay positive.",
    recommendedNextAction: "Focus on growth and improve operations.",
    whyThisAction: "It depends, but think big and leverage synergies.",
  };
}
