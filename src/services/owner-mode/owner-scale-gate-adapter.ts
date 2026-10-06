/**
 * Adapts the canonical scale gate (domain/owner-mode/canonical-scale-gate.ts) onto the legacy
 * whole-business plan (`WholeBusinessPlan`), so `growth.scaleAllowed`, the next best action, the 7/90-day
 * text and the do-not-do list never contradict the canonical owner safety state.
 *
 * Pure and one-directional: the plan can only be TIGHTENED. A legacy block is never lifted, and nothing is
 * recalculated here — the verdict is the canonical gate's. Only growth DEPLOYMENT (marketing / expansion /
 * hiring-for-growth / equipment / contracts that add volume) is held; "Proceed with the plan" style ordinary
 * operating candidates are kept.
 */
import type { ActionType, Constraint, DomainCandidate } from "@/behavioral-validation/whole-business/arbitration";
import type { WholeBusinessPlan } from "@/behavioral-validation/whole-business/whole-plan";
import type { CanonicalScaleBlockCode, CanonicalScaleGate } from "@/domain/owner-mode/canonical-scale-gate";

/** Candidate types that deploy growth / scaling capital (everything else is ordinary or protective). */
const GROWTH_DEPLOYMENT: ReadonlySet<ActionType> = new Set<ActionType>(["spend_marketing", "expand", "hire", "buy_equipment", "accept_contract"]);

const CONSTRAINT_OF: Readonly<Record<CanonicalScaleBlockCode, Constraint>> = Object.freeze({
  cash_safety_gate: "cash_survival",
  capacity_safety_gate: "capacity_feasibility",
  margin_safety_gate: "below_margin",
  compliance_gate: "compliance_block",
  cash_finance_reading_missing: "cash_survival",
  safety_state_unavailable: "cash_survival",
});

/** A legacy dominant constraint that is not itself a block: the planner saw nothing wrong. */
const NON_BLOCKING: ReadonlySet<Constraint> = new Set<Constraint>(["profitable_growth", "efficiency_scaling", "optimization"]);

export function applyCanonicalScaleGate(plan: WholeBusinessPlan, gate: CanonicalScaleGate): WholeBusinessPlan {
  if (gate.allowed) return plan;
  const codes = gate.blocks.map((b) => b.code);
  const why = gate.blocks.map((b) => b.reason).join(" ");
  const protectiveHold = codes.some((c) => c === "cash_safety_gate" || c === "capacity_safety_gate");

  const blockedBy = Array.from(new Set([...plan.growth.blockedBy, ...codes]));
  const growth: WholeBusinessPlan["growth"] = {
    ...plan.growth,
    scaleAllowed: false,
    blockedBy,
    decision: plan.growth.decision === "pause_stabilize" || protectiveHold ? "pause_stabilize" : "defer",
  };
  const plan90Day = `Do not scale yet — gates failing: ${blockedBy.join(", ")}. Stabilise first, then re-test the growth gates.`;
  const ignoreDeferList = ["Defer growth/marketing spend and expansion until the dominant constraint clears."];

  // The legacy planner already found a real constraint: its own recommendation stands (only tightened above).
  if (!NON_BLOCKING.has(plan.arbitration.dominantConstraint)) {
    return { ...plan, growth, plan90Day, ignoreDeferList };
  }

  const held = plan.arbitration.acceptedAlternatives.filter((c) => GROWTH_DEPLOYMENT.has(c.type));
  const kept = plan.arbitration.acceptedAlternatives.filter((c) => !GROWTH_DEPLOYMENT.has(c.type));
  const blockedConstraint = CONSTRAINT_OF[codes[0]];
  const winningRecommendation =
    `Hold growth and scaling spend: ${why} ` +
    "Keep ordinary operating actions running and stabilise first; a capped, proof-gated growth pilot is reconsidered once the scale gate clears.";
  const rejectedAlternatives = [
    ...plan.arbitration.rejectedAlternatives,
    ...held.map((candidate: DomainCandidate) => ({ candidate, reason: `${candidate.action} is held by the owner scale gate: ${why}`, blockedBy: blockedConstraint })),
  ];
  const arbitration: WholeBusinessPlan["arbitration"] = {
    ...plan.arbitration,
    winningRecommendation,
    acceptedAlternatives: kept,
    rejectedAlternatives,
    whatNotToDo: [...plan.arbitration.whatNotToDo, ...held.map((c) => `Do not: ${c.action} (held by the owner scale gate: ${codes.join(", ")})`)],
    requiredProofToReconsider: `The owner scale gate clears: ${why}`,
    ownerApprovalNeeded: true,
  };
  const stopDoNotDoList = Array.from(new Set([...plan.stopDoNotDoList, ...arbitration.whatNotToDo]));
  const plan7Day = plan.plan7Day.includes(plan.arbitration.winningRecommendation)
    ? plan.plan7Day.replace(plan.arbitration.winningRecommendation, winningRecommendation)
    : `Hold growth spend: ${winningRecommendation}`;
  return {
    ...plan,
    growth,
    arbitration,
    nextBestAction: winningRecommendation,
    plan7Day,
    plan90Day,
    ignoreDeferList,
    stopDoNotDoList,
    ownerApprovalRequired: true,
  };
}
