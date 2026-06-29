/**
 * Slice B — cross-domain arbitration engine.
 *
 * Real decisions create conflicts (marketing says spend, cash says no). Arbitration resolves them by
 * a fixed priority order: compliance/safety → proof/fraud → cash survival → below-margin → capacity/
 * staff feasibility → customer quality → owner workload → profitable growth → efficiency/scaling →
 * optimisation. The dominant active constraint determines the winning recommendation; every conflicting
 * candidate is rejected with a reason, and a reconsideration (proof) condition is defined.
 */
import { deriveCalcs } from "../expert/business-math";
import type { BehavioralCase } from "../schema";

export const CONSTRAINTS = [
  "compliance_block", "proof_fraud_block", "cash_survival", "below_margin", "capacity_feasibility",
  "customer_quality", "owner_workload", "profitable_growth", "efficiency_scaling", "optimization",
] as const;
export type Constraint = (typeof CONSTRAINTS)[number];
const RANK: Record<Constraint, number> = Object.fromEntries(CONSTRAINTS.map((c, i) => [c, i])) as Record<Constraint, number>;
const BLOCKING: Constraint[] = ["compliance_block", "proof_fraud_block", "cash_survival", "below_margin", "capacity_feasibility", "customer_quality", "owner_workload"];

export type ActionType =
  | "spend_marketing" | "accept_contract" | "expand" | "hire" | "cut_staff" | "discount"
  | "buy_equipment" | "proceed_compliance" | "act_on_report" | "proceed";

const BLOCK_MAP: Record<ActionType, Constraint[]> = {
  spend_marketing: ["cash_survival", "customer_quality", "below_margin"],
  accept_contract: ["compliance_block", "proof_fraud_block", "below_margin", "cash_survival", "capacity_feasibility"],
  expand: ["compliance_block", "cash_survival", "below_margin", "capacity_feasibility", "owner_workload"],
  hire: ["cash_survival", "capacity_feasibility"],
  cut_staff: ["customer_quality", "capacity_feasibility"],
  discount: ["below_margin", "cash_survival"],
  buy_equipment: ["cash_survival"],
  proceed_compliance: ["compliance_block"],
  act_on_report: ["proof_fraud_block"],
  proceed: ["compliance_block", "proof_fraud_block", "cash_survival"],
};

export interface DomainCandidate {
  domain: string;
  action: string;
  type: ActionType;
}

function caseText(c: BehavioralCase): string {
  return `${c.hiddenRootCause} ${c.messyFacts.join(" ")}`.toLowerCase();
}

/** Active blocking constraints derived from the case state, in priority order. */
export function activeConstraints(c: BehavioralCase): Constraint[] {
  const calc = deriveCalcs(c);
  const active = new Set<Constraint>();
  if (c.flags.complianceRisk) active.add("compliance_block");
  if (c.flags.hostile) active.add("proof_fraud_block");
  if (c.flags.cashRisk) active.add("cash_survival");
  if (c.decisionCategory === "marketing_opportunity_contract" && calc.contractMarginAfterTerms !== null && calc.contractMarginAfterTerms <= 0) active.add("below_margin");
  if (c.flags.capacityRisk || (calc.capacityUtilization !== null && calc.capacityUtilization >= 1)) active.add("capacity_feasibility");
  if (c.flags.capacityRisk || /complaint|rework|quality|missing|late delivery|defect/.test(caseText(c))) active.add("customer_quality");
  if (c.flags.remoteOwner || c.flags.ownerEmotional) active.add("owner_workload");
  return BLOCKING.filter((b) => active.has(b));
}

const REMEDY: Record<Constraint, string> = {
  compliance_block: "Pause and obtain written professional compliance/tax review before any action.",
  proof_fraud_block: "Require independent verification of the numbers before acting; treat unverifiable proof as no proof.",
  cash_survival: "Protect cash first: stop discretionary spend, recover receivables/refunds, and compute contribution margin before any commitment.",
  below_margin: "Do not take work below fully-loaded cost; re-quote to a viable margin or decline.",
  capacity_feasibility: "Relieve the capacity/quality bottleneck and cap load to reliable throughput before adding volume.",
  customer_quality: "Fix quality/complaints before spending on acquisition or cutting service capacity.",
  owner_workload: "Delegate with proof-based controls so the plan does not depend on the owner being everywhere.",
  profitable_growth: "Proceed with profitable growth via a capped, proof-gated pilot.",
  efficiency_scaling: "Improve efficiency/unit economics before scaling.",
  optimization: "Apply the optimisation with measured proof.",
};

const RECONSIDER: Record<Constraint, string> = {
  compliance_block: "A written professional review confirms it is permitted.",
  proof_fraud_block: "Independent system/third-party verification confirms the numbers.",
  cash_survival: "Cash runway and contribution margin are proven adequate.",
  below_margin: "A fully-loaded cost computation shows a viable margin after terms.",
  capacity_feasibility: "Measured reliable capacity covers the new load.",
  customer_quality: "Complaint/rework metrics return to an acceptable band.",
  owner_workload: "A delegated, proof-based control is in place.",
  profitable_growth: "—",
  efficiency_scaling: "—",
  optimization: "—",
};

export interface ArbitrationResult {
  winningRecommendation: string;
  dominantConstraint: Constraint;
  rejectedAlternatives: Array<{ candidate: DomainCandidate; reason: string; blockedBy: Constraint }>;
  acceptedAlternatives: DomainCandidate[];
  whatNotToDo: string[];
  requiredProofToReconsider: string;
  ownerApprovalNeeded: boolean;
  stopCondition: string;
  reassessmentDate: string;
  expectedBusinessImpact: string;
  overridden?: boolean;
  overrideAudit?: { reason: string; actor: string; at: string };
}

/** Default tempting candidates implied by the case (used when the caller doesn't supply any). */
export function defaultCandidates(c: BehavioralCase): DomainCandidate[] {
  const out: DomainCandidate[] = [];
  if (c.flags.cashRisk || c.decisionCategory === "cash_margin_working_capital") out.push({ domain: "marketing", action: "Spend on marketing to grow", type: "spend_marketing" });
  if (c.decisionCategory === "marketing_opportunity_contract") out.push({ domain: "sales", action: "Accept the contract", type: "accept_contract" });
  if (c.decisionCategory === "multi_branch_portfolio" || c.flags.multiBranch) out.push({ domain: "strategy", action: "Open a new branch", type: "expand" });
  if (c.decisionCategory === "staff_process_equipment") out.push({ domain: "operations", action: "Hire more staff", type: "hire" });
  if (c.flags.complianceRisk) out.push({ domain: "compliance", action: "Proceed past the grey area", type: "proceed_compliance" });
  if (c.flags.hostile) out.push({ domain: "operations", action: "Act on the manager's report", type: "act_on_report" });
  if (out.length === 0) out.push({ domain: "operations", action: "Proceed with the plan", type: "proceed" });
  return out;
}

export function arbitrate(c: BehavioralCase, candidates: DomainCandidate[] = defaultCandidates(c)): ArbitrationResult {
  const active = activeConstraints(c);
  const activeSet = new Set(active);
  const rejected: ArbitrationResult["rejectedAlternatives"] = [];
  const accepted: DomainCandidate[] = [];

  for (const cand of candidates) {
    const blockers = BLOCK_MAP[cand.type].filter((b) => activeSet.has(b)).sort((a, b) => RANK[a] - RANK[b]);
    if (blockers.length > 0) rejected.push({ candidate: cand, reason: `${cand.action} is blocked by ${blockers[0]}: ${REMEDY[blockers[0]]}`, blockedBy: blockers[0] });
    else accepted.push(cand);
  }

  const dominant: Constraint = active[0] ?? "profitable_growth";
  const winningRecommendation =
    active.length > 0
      ? REMEDY[dominant]
      : accepted.length > 0
        ? `Proceed: ${accepted[0].action} — via a capped, proof-gated pilot.`
        : REMEDY.profitable_growth;

  const days = active.length > 0 ? 7 : 14;
  return {
    winningRecommendation,
    dominantConstraint: dominant,
    rejectedAlternatives: rejected,
    acceptedAlternatives: accepted,
    whatNotToDo: rejected.map((r) => `Do not: ${r.candidate.action} (blocked by ${r.blockedBy})`),
    requiredProofToReconsider: RECONSIDER[dominant],
    ownerApprovalNeeded: active.length > 0 || candidates.some((x) => x.type === "expand" || x.type === "accept_contract"),
    stopCondition: "Stop immediately if cash, margin, complaint/rework or capacity metrics worsen.",
    reassessmentDate: `Reassess in ${days} days against the dominant constraint (${dominant}).`,
    expectedBusinessImpact:
      active.length > 0
        ? `Resolving ${dominant} first protects the business from the rejected moves; growth resumes once the reconsideration condition is met.`
        : "Profitable, proof-gated progress without tripping a higher-priority constraint.",
  };
}

/** An owner may override arbitration only with a recorded reason (audited). */
export function applyOwnerOverride(result: ArbitrationResult, override: { reason: string; actor: string; at: string }): ArbitrationResult {
  if (!override.reason || override.reason.trim().length < 8) throw new Error("owner override requires a recorded reason");
  return { ...result, overridden: true, overrideAudit: { ...override } };
}
