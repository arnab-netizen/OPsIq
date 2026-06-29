/**
 * Slice 12 — benchmark ratchet.
 *
 * Once a validation level is achieved, future changes must not silently reduce it. computeBenchmark
 * measures the live system (overall + per-domain scores, unsafe outputs, holdout + adversarial
 * scores, regression failures, generic-fails / business-math green flags, weakest groups).
 * checkRatchet compares a candidate benchmark against the accepted one and fails on any regression:
 * unsafe must never increase, critical domains must hold their floor, holdout must stay within
 * tolerance, regression failures must be zero, and the two green-guard tests must stay green.
 */
import { advise, baseAdvise, genericAdvise } from "../advisor";
import { EXPANDED_CASES } from "../expansion";
import { InMemoryLearningStore } from "../learning-store";
import { learnFromFailure } from "../learning-engine";
import { runValidation } from "../runner";
import { scoreAdvice } from "../scorer";
import { SEED_CASES } from "../seed-cases";
import { validateBusinessMath } from "./business-math";
import type { RubricDimension } from "../schema";

export const CRITICAL_DOMAINS: RubricDimension[] = ["diagnosis", "finance_cash_margin", "decision_quality", "execution_guidance"];

/** Absolute per-domain floors (fraction of max) that critical domains must never fall below. */
export const CRITICAL_FLOORS: Partial<Record<RubricDimension, number>> = {
  diagnosis: 9,
  finance_cash_margin: 9,
  decision_quality: 5,
  execution_guidance: 5,
};

export interface Benchmark {
  overallScore: number;
  domainScores: Record<RubricDimension, number>;
  unsafeOutputs: number;
  holdoutScore: number;
  adversarialScore: number;
  regressionFailures: number;
  genericAnswerFailsGreen: boolean;
  businessMathGreen: boolean;
  weakestDomain: string;
  weakestLocation: string;
  weakestBusinessType: string;
}

const AT = "2026-06-29T00:00:00Z";
const WS = "ratchet-ws";

function avg(xs: number[]): number {
  return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : 0;
}

async function holdoutScore(): Promise<{ holdout: number; regressionFailures: number }> {
  const train = EXPANDED_CASES.filter((_, i) => i % 2 === 0);
  const holdout = EXPANDED_CASES.filter((_, i) => i % 2 === 1);
  const store = new InMemoryLearningStore();
  for (const c of train) {
    const base = scoreAdvice(c, baseAdvise(c));
    if (!base.passed) await learnFromFailure(c, base, store, { workspaceId: WS, actor: "ratchet", at: AT });
  }
  const totals: number[] = [];
  let regressions = 0;
  for (const c of holdout) {
    const base = scoreAdvice(c, baseAdvise(c)).total;
    const learned = scoreAdvice(c, await advise(c, { store, workspaceId: WS })).total;
    totals.push(learned);
    if (learned < base - 0.01) regressions++;
  }
  return { holdout: avg(totals), regressionFailures: regressions };
}

export async function computeBenchmark(): Promise<Benchmark> {
  const core = await runValidation("core");
  const hostile = await runValidation("hostile");
  const { holdout, regressionFailures } = await holdoutScore();

  const genericAnswerFailsGreen = SEED_CASES.every((c) => !scoreAdvice(c, genericAdvise()).passed);
  const businessMathGreen = SEED_CASES.every((c) => validateBusinessMath(c, baseAdvise(c)).passed);

  const weakestDomain = (Object.entries(core.learned.dimAvg) as [RubricDimension, number][])
    .map(([d, v]) => ({ d, pct: v / maxOf(d) }))
    .sort((a, b) => a.pct - b.pct)[0].d;
  const weakestLocation = core.byLocation.slice().sort((a, b) => a.learnedAvg - b.learnedAvg)[0]?.key ?? "n/a";
  const weakestBusinessType = core.byArchetype.slice().sort((a, b) => a.learnedAvg - b.learnedAvg)[0]?.key ?? "n/a";

  return {
    overallScore: core.learned.avg,
    domainScores: core.learned.dimAvg,
    unsafeOutputs: core.learned.unsafe,
    holdoutScore: holdout,
    adversarialScore: hostile.learned.avg,
    regressionFailures,
    genericAnswerFailsGreen,
    businessMathGreen,
    weakestDomain,
    weakestLocation,
    weakestBusinessType,
  };
}

const DIM_MAX: Record<RubricDimension, number> = {
  diagnosis: 15, finance_cash_margin: 15, operational_realism: 10, decision_quality: 10,
  execution_guidance: 10, marketing_opportunity: 10, risk_compliance_location: 8, data_sufficiency: 8,
  owner_workload: 6, learning_reassessment: 8,
};
function maxOf(d: RubricDimension): number {
  return DIM_MAX[d];
}

export interface RatchetCheck {
  passed: boolean;
  violations: string[];
}

export interface RatchetOptions {
  overallTolerance?: number; // allowed overall/holdout drop
  acknowledgedExplanation?: string; // required to accept a within-tolerance non-critical dip
}

/** Compare a candidate benchmark against the accepted one; fail on any regression. */
export function checkRatchet(accepted: Benchmark, candidate: Benchmark, opts: RatchetOptions = {}): RatchetCheck {
  const tol = opts.overallTolerance ?? 1.5;
  const violations: string[] = [];

  if (candidate.unsafeOutputs > accepted.unsafeOutputs)
    violations.push(`unsafe outputs increased ${accepted.unsafeOutputs} → ${candidate.unsafeOutputs}`);

  for (const d of CRITICAL_DOMAINS) {
    const floor = CRITICAL_FLOORS[d] ?? 0;
    if (candidate.domainScores[d] < floor)
      violations.push(`critical domain ${d} below floor (${candidate.domainScores[d]} < ${floor})`);
    if (candidate.domainScores[d] < accepted.domainScores[d] - tol)
      violations.push(`critical domain ${d} dropped beyond tolerance (${accepted.domainScores[d]} → ${candidate.domainScores[d]})`);
  }

  if (candidate.holdoutScore < accepted.holdoutScore - tol)
    violations.push(`holdout dropped beyond tolerance (${accepted.holdoutScore} → ${candidate.holdoutScore})`);

  if (candidate.regressionFailures > 0) violations.push(`regression failures present (${candidate.regressionFailures})`);
  if (!candidate.genericAnswerFailsGreen) violations.push("generic-answer-fails guard is red");
  if (!candidate.businessMathGreen) violations.push("business-math validator guard is red");

  // A minor overall dip within tolerance is allowed ONLY with a written explanation.
  if (candidate.overallScore < accepted.overallScore && candidate.overallScore >= accepted.overallScore - tol && !opts.acknowledgedExplanation)
    violations.push(`overall dipped ${accepted.overallScore} → ${candidate.overallScore} without an explanation`);
  if (candidate.overallScore < accepted.overallScore - tol)
    violations.push(`overall dropped beyond tolerance (${accepted.overallScore} → ${candidate.overallScore})`);

  return { passed: violations.length === 0, violations };
}

export function ratchetReport(accepted: Benchmark, candidate: Benchmark, check: RatchetCheck): string {
  return [
    `Benchmark ratchet — ${check.passed ? "PASS" : "FAIL"}`,
    `  overall:     ${accepted.overallScore} → ${candidate.overallScore}`,
    `  holdout:     ${accepted.holdoutScore} → ${candidate.holdoutScore}`,
    `  adversarial: ${accepted.adversarialScore} → ${candidate.adversarialScore}`,
    `  unsafe:      ${accepted.unsafeOutputs} → ${candidate.unsafeOutputs}`,
    `  regressions: ${candidate.regressionFailures}`,
    `  weakest:     domain=${candidate.weakestDomain} location=${candidate.weakestLocation} type=${candidate.weakestBusinessType}`,
    ...check.violations.map((v) => `  ✗ ${v}`),
  ].join("\n");
}
