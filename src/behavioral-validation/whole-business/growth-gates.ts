/**
 * Slice C (2/3) — profitable growth and scale gates.
 *
 * OpsIQ must know when to grow, pause, stabilise, scale or stop. A scale/growth recommendation is
 * allowed only when all ten gates pass; otherwise it is blocked/deferred with the failing gate(s).
 * A stop-loss threshold is always required for a growth decision.
 */
import { deriveCalcs } from "../expert/business-math";
import type { AdviceOutput, BehavioralCase } from "../schema";

export const GROWTH_GATES = [
  "unit_economics_known", "cash_runway_adequate", "capacity_available", "quality_stable",
  "staff_sustainable", "sop_repeatable", "proof_system_active", "owner_workload_manageable",
  "compliance_clear", "stop_loss_defined",
] as const;
export type GrowthGate = (typeof GROWTH_GATES)[number];

function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 6;
}
function hasList(xs?: string[]): boolean {
  return Array.isArray(xs) && xs.length > 0;
}

export interface GrowthGateResult {
  gates: Record<GrowthGate, boolean>;
  scaleAllowed: boolean;
  blockedBy: GrowthGate[];
  stopLossDefined: boolean;
  decision: "grow" | "pause_stabilize" | "defer";
}

export function evaluateGrowthGates(c: BehavioralCase, a: AdviceOutput): GrowthGateResult {
  const calc = deriveCalcs(c);
  const num = c.numbers;
  const unitEconKnown = typeof num.fullyLoadedCost === "number" || /unit econ|contribution|cost per|per unit/i.test(JSON.stringify(a));
  const gates: Record<GrowthGate, boolean> = {
    unit_economics_known: unitEconKnown,
    cash_runway_adequate: !c.flags.cashRisk,
    capacity_available: !c.flags.capacityRisk && !(calc.capacityUtilization !== null && calc.capacityUtilization >= 1),
    quality_stable: !c.flags.capacityRisk && !/complaint|rework|quality/i.test(c.hiddenRootCause),
    staff_sustainable: !c.flags.capacityRisk,
    sop_repeatable: has(a.processSopUpdate),
    proof_system_active: hasList(a.proofRequired),
    owner_workload_manageable: !c.flags.remoteOwner || has(a.ownerWorkloadReduction),
    compliance_clear: !c.flags.complianceRisk || has(a.professionalReview),
    stop_loss_defined: has(a.reassessmentTrigger) || has(a.saferAlternative),
  };
  const blockedBy = GROWTH_GATES.filter((g) => !gates[g]);
  const scaleAllowed = blockedBy.length === 0;
  const decision: GrowthGateResult["decision"] = scaleAllowed ? "grow" : blockedBy.includes("cash_runway_adequate") || blockedBy.includes("capacity_available") || blockedBy.includes("quality_stable") ? "pause_stabilize" : "defer";
  return { gates, scaleAllowed, blockedBy, stopLossDefined: gates.stop_loss_defined, decision };
}
