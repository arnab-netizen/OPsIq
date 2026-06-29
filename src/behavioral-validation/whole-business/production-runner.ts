/**
 * Slice F (2/2) — production validation modes.
 *
 * Drives validation THROUGH the production owner-advice runtime (not harness code). Readiness must
 * depend on these production scores. Modes: production-smoke / -core / -holdout / -adversarial /
 * -regression / -collective-management / -domain-competency.
 */
import { baseAdvise } from "../advisor";
import { EXPANDED_CASES, casesForMode } from "../expansion";
import { InMemoryLearningStore, type LearningStore } from "../learning-store";
import { learnFromFailure } from "../learning-engine";
import { scoreAdvice } from "../scorer";
import { abstractedLocationKey } from "../locations";
import { runOwnerAdvice, type OwnerBusinessContext, type OwnerAdviceResult } from "@/services/owner-mode/owner-advice-runtime.service";
import { arbitrate, type Constraint } from "./arbitration";
import { advisedCorpus, buildDomainMatrix, summariseMatrix, type DomainReport } from "./domains";
import { COLLECTIVE_CASES } from "./collective-cases";
import { inferBusinessStage } from "./stages";
import type { BehavioralCase } from "../schema";

export type ProductionMode =
  | "production-smoke" | "production-core" | "production-holdout" | "production-adversarial"
  | "production-regression" | "production-collective-management" | "production-domain-competency";

const AT = "2026-06-29T00:00:00Z";

export function caseToContext(c: BehavioralCase, expectedTopPriority?: Constraint): OwnerBusinessContext {
  return {
    businessType: c.businessType,
    archetype: c.archetype,
    decisionCategory: c.decisionCategory,
    location: c.location,
    ownerGoal: c.ownerGoal,
    numbers: c.numbers,
    riskFlags: c.flags,
    messyFacts: c.messyFacts,
    expectedTopPriority,
  };
}

/** Train a workspace-scoped learning store on base failures (what the runtime would have learned). */
async function trainedStore(cases: BehavioralCase[], workspaceId: string): Promise<LearningStore> {
  const store = new InMemoryLearningStore();
  for (const c of cases) {
    const base = scoreAdvice(c, baseAdvise(c));
    if (!base.passed || base.failureLabels.length > 0) await learnFromFailure(c, base, store, { workspaceId, actor: "production", at: AT });
  }
  return store;
}

async function runCasesThroughRuntime(
  cases: Array<{ c: BehavioralCase; expected?: Constraint }>,
  store: LearningStore,
  workspaceId: string,
): Promise<Array<{ c: BehavioralCase; result: OwnerAdviceResult }>> {
  const out: Array<{ c: BehavioralCase; result: OwnerAdviceResult }> = [];
  for (const { c, expected } of cases) {
    const result = await runOwnerAdvice({ workspaceId, context: caseToContext(c, expected) }, { store });
    out.push({ c, result });
  }
  return out;
}

function avg(xs: number[]): number {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
}

export interface ProductionRunResult {
  mode: ProductionMode;
  totalCases: number;
  productionRuntimeScore: number;
  collectiveWholeBusinessScore: number;
  holdoutScore: number;
  adversarialUnsafe: number;
  regressionFailures: number;
  passRate: number;
  learningAppliedRate: number;
  weakestConflict: string;
  weakestStage: string;
  weakestLocation: string;
  /** True only when EVERY case's critical domains were read from REAL providers (DB-backed). */
  criticalDomainsRealProviderBacked: boolean;
  domainReports?: DomainReport[];
}

const EMPTY: Omit<ProductionRunResult, "mode" | "totalCases"> = {
  productionRuntimeScore: 0, collectiveWholeBusinessScore: 0, holdoutScore: 0, adversarialUnsafe: 0,
  regressionFailures: 0, passRate: 0, learningAppliedRate: 0, weakestConflict: "n/a", weakestStage: "n/a", weakestLocation: "n/a",
  criticalDomainsRealProviderBacked: false,
};

function allRealProviderBacked(rows: Array<{ result: OwnerAdviceResult }>): boolean {
  return rows.length > 0 && rows.every((r) => r.result.ingestion.criticalDomainsRealProviderBacked);
}

function weakestBy<T>(rows: T[], keyFn: (t: T) => string, scoreFn: (t: T) => number): string {
  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const k = keyFn(r);
    const a = agg.get(k) ?? { sum: 0, n: 0 };
    a.sum += scoreFn(r);
    a.n++;
    agg.set(k, a);
  }
  return Array.from(agg.entries()).map(([k, v]) => ({ k, avg: v.sum / v.n })).sort((a, b) => a.avg - b.avg)[0]?.k ?? "n/a";
}

export async function runProductionValidation(mode: ProductionMode): Promise<ProductionRunResult> {
  const ws = "production-ws";

  if (mode === "production-domain-competency") {
    const reports = buildDomainMatrix(await advisedCorpus());
    const weakest = summariseMatrix(reports).reports.slice().sort((a, b) => a.score - b.score)[0];
    return { mode, totalCases: EXPANDED_CASES.length, ...EMPTY, productionRuntimeScore: avg(reports.map((r) => r.score)), weakestConflict: weakest?.domain ?? "n/a", domainReports: reports };
  }

  if (mode === "production-regression" || mode === "production-collective-management") {
    const store = await trainedStore(EXPANDED_CASES, ws);
    const rows = await runCasesThroughRuntime(COLLECTIVE_CASES.map((cc) => ({ c: cc.base, expected: cc.correctTopPriority })), store, ws);
    const withArch = rows.map((r, i) => ({ ...r, archetype: COLLECTIVE_CASES[i].conflictArchetype, expected: COLLECTIVE_CASES[i].correctTopPriority }));
    const regressionFailures = withArch.filter((r) => r.result.plan.highestPriorityConstraint !== r.expected).length;
    const scores = rows.map((r) => r.result.collective.total);
    return {
      mode, totalCases: rows.length, ...EMPTY,
      productionRuntimeScore: avg(scores),
      collectiveWholeBusinessScore: avg(scores),
      regressionFailures,
      passRate: Math.round((100 * rows.filter((r) => r.result.collective.passed).length) / rows.length),
      learningAppliedRate: Math.round((100 * rows.filter((r) => r.result.learningApplied).length) / rows.length),
      adversarialUnsafe: rows.reduce((s, r) => s + r.result.unsafeCount, 0),
      weakestConflict: weakestBy(withArch, (r) => r.archetype, (r) => r.result.collective.total),
      weakestStage: weakestBy(rows, (r) => inferBusinessStage(r.c), (r) => r.result.collective.total),
      weakestLocation: weakestBy(rows, (r) => abstractedLocationKey(r.c.location), (r) => r.result.collective.total),
    };
  }

  if (mode === "production-adversarial") {
    const cases = casesForMode("hostile");
    const store = await trainedStore(EXPANDED_CASES, ws);
    const rows = await runCasesThroughRuntime(cases.map((c) => ({ c, expected: arbitrate(c).dominantConstraint })), store, ws);
    return {
      mode, totalCases: rows.length, ...EMPTY,
      productionRuntimeScore: avg(rows.map((r) => r.result.collective.total)),
      adversarialUnsafe: rows.reduce((s, r) => s + r.result.unsafeCount, 0),
      weakestLocation: weakestBy(rows, (r) => abstractedLocationKey(r.c.location), (r) => r.result.collective.total),
    };
  }

  if (mode === "production-holdout") {
    const train = EXPANDED_CASES.filter((_, i) => i % 2 === 0);
    const holdout = EXPANDED_CASES.filter((_, i) => i % 2 === 1);
    const store = await trainedStore(train, ws);
    const rows = await runCasesThroughRuntime(holdout.map((c) => ({ c, expected: arbitrate(c).dominantConstraint })), store, ws);
    return {
      mode, totalCases: rows.length, ...EMPTY,
      productionRuntimeScore: avg(rows.map((r) => r.result.collective.total)),
      holdoutScore: avg(rows.map((r) => r.result.collective.total)),
      adversarialUnsafe: rows.reduce((s, r) => s + r.result.unsafeCount, 0),
      passRate: Math.round((100 * rows.filter((r) => r.result.collective.passed).length) / rows.length),
    };
  }

  // production-smoke / production-core
  const cases = mode === "production-smoke" ? casesForMode("smoke") : EXPANDED_CASES;
  const store = await trainedStore(EXPANDED_CASES, ws);
  const rows = await runCasesThroughRuntime(cases.map((c) => ({ c, expected: arbitrate(c).dominantConstraint })), store, ws);
  const scores = rows.map((r) => r.result.collective.total);
  return {
    mode, totalCases: rows.length, ...EMPTY,
    productionRuntimeScore: avg(scores),
    collectiveWholeBusinessScore: avg(scores),
    adversarialUnsafe: rows.reduce((s, r) => s + r.result.unsafeCount, 0),
    passRate: Math.round((100 * rows.filter((r) => r.result.collective.passed).length) / rows.length),
    learningAppliedRate: Math.round((100 * rows.filter((r) => r.result.learningApplied).length) / rows.length),
    weakestStage: weakestBy(rows, (r) => inferBusinessStage(r.c), (r) => r.result.collective.total),
    weakestLocation: weakestBy(rows, (r) => abstractedLocationKey(r.c.location), (r) => r.result.collective.total),
    // Without wired DB providers the harness corpus is context-only → not real-provider-backed.
    criticalDomainsRealProviderBacked: allRealProviderBacked(rows),
  };
}
