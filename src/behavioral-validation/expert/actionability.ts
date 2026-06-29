/**
 * Slice 9 — actionability score.
 *
 * Expert advice must produce executable action, not strategy prose. An output loses points for each
 * missing executable element (owner action, staff action, deadline, proof, metric, stop condition,
 * reassessment date, fallback, blocked action, responsibility assignment). A high score answers:
 * what happens today, who does it, what proof, how the owner verifies, when it is reassessed, what
 * is stopped now, and what OpsIQ prepares to reduce owner workload.
 */
import type { AdviceOutput } from "../schema";

export const ACTIONABILITY_COMPONENTS = [
  "ownerAction",
  "staffAction",
  "deadline",
  "proof",
  "metric",
  "stopCondition",
  "reassessmentDate",
  "fallbackAction",
  "blockedAction",
  "responsibilityAssignment",
] as const;
export type ActionabilityComponent = (typeof ACTIONABILITY_COMPONENTS)[number];

export const ACTIONABILITY_THRESHOLD = 70;

function allText(a: AdviceOutput): string {
  const parts: string[] = [];
  for (const v of Object.values(a)) {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") parts.push(x);
  }
  return parts.join(" \n ").toLowerCase();
}
function has(s?: string): boolean {
  return typeof s === "string" && s.trim().length > 6;
}

export interface ActionabilityResult {
  score: number; // 0..100
  components: Record<ActionabilityComponent, boolean>;
  missing: ActionabilityComponent[];
  passed: boolean;
}

export function scoreActionability(a: AdviceOutput): ActionabilityResult {
  const t = allText(a);
  const components: Record<ActionabilityComponent, boolean> = {
    ownerAction: has(a.recommendedNextAction) || a.ownerApprovalNeeded === true || has(a.ownerWorkloadReduction),
    staffAction: /\b(staff|supervisor|manager|team|delegate|assign|rider|cashier|operator)\b/.test(t),
    deadline: /\b(today|tomorrow|this week|\d+\s?(day|days|week|weeks|hour|hours)|by [a-z]+day|within)\b/.test(t),
    proof: (a.proofRequired ?? []).length > 0,
    metric: /\b(margin|rate|balance|utilization|utilisation|%|ratio|runway|complaint|rework|conversion|throughput)\b/.test(t),
    stopCondition: (a.whatNotToDo ?? []).length > 0 || (a.blockedActions ?? []).length > 0 || /\bstop\b/.test(t),
    reassessmentDate: has(a.reassessmentTrigger) && /\d+\s?(day|days|week|weeks)/.test((a.reassessmentTrigger ?? "").toLowerCase()),
    fallbackAction: has(a.saferAlternative),
    blockedAction: (a.blockedActions ?? []).length > 0,
    responsibilityAssignment: /\b(assign|named|owner|supervisor|manager|responsible|accountab)\b/.test(t),
  };
  const hits = ACTIONABILITY_COMPONENTS.filter((k) => components[k]);
  const score = Math.round((hits.length / ACTIONABILITY_COMPONENTS.length) * 100);
  const missing = ACTIONABILITY_COMPONENTS.filter((k) => !components[k]);
  return { score, components, missing, passed: score >= ACTIONABILITY_THRESHOLD };
}

export interface ActionabilityReport {
  count: number;
  avgScore: number;
  passRate: number;
  weakestComponents: Array<{ component: ActionabilityComponent; missingRate: number }>;
}

export function buildActionabilityReport(results: ActionabilityResult[]): ActionabilityReport {
  const count = results.length || 1;
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / count);
  const passRate = Math.round((100 * results.filter((r) => r.passed).length) / count);
  const weakest = ACTIONABILITY_COMPONENTS.map((c) => ({
    component: c,
    missingRate: Math.round((100 * results.filter((r) => !r.components[c]).length) / count),
  }))
    .sort((a, b) => b.missingRate - a.missingRate)
    .slice(0, 5);
  return { count, avgScore, passRate, weakestComponents: weakest };
}
