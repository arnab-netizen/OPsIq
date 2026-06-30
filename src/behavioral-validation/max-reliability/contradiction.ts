/**
 * Maximum-reliability — contradiction + owner-burden control.
 *
 * Outputs must be internally consistent and owner-realistic. `detectContradictions` catches advice that
 * says one thing and recommends its opposite (don't-spend-then-spend, capacity-red-then-grow, owner-
 * overloaded-then-pile-on-owner, compliance-uncertain-then-definitive, proof-required-then-skip-proof,
 * margin-negative-then-accept, staff-overloaded-then-cut, data-missing-then-high-confidence).
 * `assessOwnerBurden` enforces that a plan removes more owner work than it adds: a single scoped owner
 * decision, routine work delegated/prepared, an ignore/defer list, an escalation-only rule, and proof
 * assigned to staff/system. Pure functions over the production AdviceOutput.
 */
import type { AdviceOutput } from "../schema";

type OwnerWorkloadPlan = NonNullable<AdviceOutput["ownerWorkloadPlan"]>;

const lc = (s?: string) => (s ?? "").toLowerCase();
const any = (s: string, ...w: string[]) => w.some((x) => s.includes(x));

export function detectContradictions(a: AdviceOutput): string[] {
  const out: string[] = [];
  const rec = `${lc(a.recommendedNextAction)} ${lc(a.whyThisAction)}`;
  const stop = `${(a.whatNotToDo ?? []).join(" ")} ${(a.blockedActions ?? []).join(" ")}`.toLowerCase();
  const all = JSON.stringify(a).toLowerCase();

  // Fire only when the advice ACTIVELY recommends spending now (no deferral/guard), while also blocking it —
  // "stop spend now, consider it only after cash is stable" is consistent, not contradictory.
  const recommendsSpendNow = any(rec, "spend", "marketing", "advertis") &&
    !any(rec, "only then", "later", "after cash", "once cash", "before ", "do not", "don't", "stop", "instead of", "avoid");
  if (any(stop, "spend", "marketing") && recommendsSpendNow)
    out.push("says do not spend but recommends spend");
  if (any(all, "capacity is red", "capacity red", "bottleneck", "over capacity", "overloaded capacity") && any(rec, "expand", "scale", "grow", "take on more"))
    out.push("says capacity red but recommends growth");
  if (any(all, "owner overloaded", "owner is overloaded", "owner workload high", "reduce owner load") && any(rec, "owner must", "owner personally", "owner handles everything", "owner does"))
    out.push("says owner overloaded but piles work on owner");
  if (any(all, "uncertain", "needs professional review", "consult a professional", "get a written review") && any(all, "it is legal", "you are compliant", "no tax", "definitely allowed"))
    out.push("says compliance uncertain but gives definitive legal/tax advice");
  if ((a.proofRequired ?? []).length > 0 && any(rec, "without proof", "mark it done", "complete without", "approve without verif", "skip the proof"))
    out.push("says proof required but allows completion without proof");
  if (any(all, "margin is negative", "below cost", "below margin", "negative margin") && any(rec, "accept the contract", "sign", "take the contract", "go ahead"))
    out.push("says margin negative but accepts contract");
  if (any(all, "staff overloaded", "staff is overloaded", "team is stretched") && any(rec, "cut staff", "reduce headcount", "lay off", "fire staff"))
    out.push("says staff overloaded but cuts staff");
  if (a.dataConfidence === "high" && any(all, "data is missing", "missing data", "insufficient data", "stale data", "no reliable data"))
    out.push("says data missing but gives high confidence");

  return out;
}

export interface OwnerBurdenResult { ok: boolean; failures: string[]; ownerTouchpoints: number }

/** Count distinct owner touchpoints in a single owner decision string (split on connectors). */
function touchpoints(ownerDecides: string): number {
  const parts = ownerDecides.split(/[;,]|\band\b|\bthen\b/i).map((s) => s.trim()).filter((s) => s.length > 3);
  return Math.max(parts.length, ownerDecides.trim() ? 1 : 0);
}

export function assessOwnerBurden(plan: OwnerWorkloadPlan | undefined, opts: { maxOwnerTouchpoints?: number } = {}): OwnerBurdenResult {
  const failures: string[] = [];
  if (!plan) return { ok: false, failures: ["no owner workload plan"], ownerTouchpoints: 0 };
  const tp = touchpoints(plan.ownerDecides);
  const max = opts.maxOwnerTouchpoints ?? 3;

  if (plan.defer.length + plan.ignoreForNow.length === 0) failures.push("missing ignore/defer list");
  if (!plan.escalationThreshold || plan.escalationThreshold.trim().length < 4) failures.push("missing escalation-only rule");
  if (plan.estimatedOwnerReductionPct <= 0) failures.push("plan creates more owner workload than it removes");
  if (tp > max) failures.push(`too many owner touchpoints (${tp} > ${max})`);
  if (plan.staffExecutes.length === 0 && plan.opsiqPrepares.length === 0) failures.push("routine work not delegated/prepared (all on the owner)");
  if (plan.staffProof.length === 0) failures.push("proof not assigned to staff/system");

  return { ok: failures.length === 0, failures, ownerTouchpoints: tp };
}
