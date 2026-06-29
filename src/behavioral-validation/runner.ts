/**
 * Validation runner — three modes (smoke 25 / core ≥200 / hostile 60).
 *
 * Pipeline per run (batch controlled learning, no peeking at the answer key):
 *   A. Evaluate the BASE advisor (empty learning store) over the mode's cases.
 *   B. Learn: persist a correction artifact for every BASE failure.
 *   C. Re-evaluate with the advisor READING the now-populated store.
 *   D. Privacy probe: confirm a second workspace's advice is unchanged by workspace-1's private
 *      artifacts (no cross-business leakage).
 *
 * All timestamps are caller-supplied (deterministic). Returns a fully-broken-down RunResult for the
 * report — nothing is hidden or averaged away.
 */
import { advise, baseAdvise } from "./advisor";
import { distributionOf, casesForMode, type Distribution } from "./expansion";
import { classifyFailure } from "./failure-classifier";
import { learnFromFailure } from "./learning-engine";
import { InMemoryLearningStore, type LearningStore } from "./learning-store";
import { PASS_THRESHOLD, EXPERT_THRESHOLD, scoreAdvice } from "./scorer";
import {
  RUBRIC_DIMENSIONS,
  type BehavioralCase,
  type FailureLabel,
  type RubricDimension,
  type ScoreResult,
} from "./schema";

export type ValidationMode = "smoke" | "core" | "hostile";

export interface GroupStat {
  key: string;
  count: number;
  baseAvg: number;
  learnedAvg: number;
  learnedPassRate: number;
}

export interface RunResult {
  mode: ValidationMode;
  at: string;
  totalCases: number;
  distribution: Distribution;
  passThreshold: number;
  expertThreshold: number;
  base: { avg: number; passRate: number; unsafe: number; dimAvg: Record<RubricDimension, number> };
  learned: { avg: number; passRate: number; unsafe: number; dimAvg: Record<RubricDimension, number> };
  improvement: { avgDelta: number; passRateDelta: number };
  artifactsCreated: number;
  casesUsingLearning: number;
  failureLabelCounts: Partial<Record<FailureLabel, number>>;
  byArchetype: GroupStat[];
  byDecisionCategory: GroupStat[];
  byLocation: GroupStat[];
  leakageProbe: { otherWorkspaceUsedForeignArtifacts: boolean; checkedCases: number };
  worstLearnedCases: Array<{ id: string; sourceSeedCaseId: string; total: number; unsafe: number; labels: FailureLabel[] }>;
}

const ZERO_DIMS = (): Record<RubricDimension, number> =>
  Object.fromEntries(Object.keys(RUBRIC_DIMENSIONS).map((k) => [k, 0])) as Record<RubricDimension, number>;

function avg(xs: number[]): number {
  return xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 10) / 10 : 0;
}

interface Scored {
  c: BehavioralCase;
  base: ScoreResult;
  learned: ScoreResult;
  usedLearning: boolean;
}

function groupBy(scored: Scored[], keyFn: (c: BehavioralCase) => string): GroupStat[] {
  const m = new Map<string, Scored[]>();
  for (const s of scored) {
    const k = keyFn(s.c);
    (m.get(k) ?? m.set(k, []).get(k)!).push(s);
  }
  return Array.from(m.entries())
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      baseAvg: avg(rows.map((r) => r.base.total)),
      learnedAvg: avg(rows.map((r) => r.learned.total)),
      learnedPassRate: Math.round((100 * rows.filter((r) => r.learned.passed).length) / rows.length),
    }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

export interface RunOptions {
  at?: string;
  workspaceId?: string;
  store?: LearningStore; // inject a persistent store ([db] runs); defaults to in-memory
  cases?: BehavioralCase[];
}

export async function runValidation(mode: ValidationMode, opts: RunOptions = {}): Promise<RunResult> {
  const at = opts.at ?? "2026-06-29T00:00:00Z";
  const workspaceId = opts.workspaceId ?? "validation-workspace";
  const store = opts.store ?? new InMemoryLearningStore();
  const cases = opts.cases ?? casesForMode(mode);

  // A. base evaluation
  const baseScores = cases.map((c) => scoreAdvice(c, baseAdvise(c)));

  // B. learn from every base failure
  let artifactsCreated = 0;
  const failureLabelCounts: Partial<Record<FailureLabel, number>> = {};
  for (let i = 0; i < cases.length; i++) {
    const s = baseScores[i];
    for (const l of classifyFailure(cases[i], s).labels) failureLabelCounts[l] = (failureLabelCounts[l] ?? 0) + 1;
    // Learn from outright failures AND identified sub-expert weaknesses (continuous improvement).
    if (!s.passed || s.failureLabels.length > 0) {
      const r = await learnFromFailure(cases[i], s, store, { workspaceId, actor: "validation-runner", at });
      if (r) artifactsCreated++;
    }
  }

  // C. re-evaluate reading the learning store
  const scored: Scored[] = [];
  for (let i = 0; i < cases.length; i++) {
    const adv = await advise(cases[i], { store, workspaceId });
    const learned = scoreAdvice(cases[i], adv);
    scored.push({ c: cases[i], base: baseScores[i], learned, usedLearning: (adv.learningNotesApplied ?? []).length > 0 });
  }

  // D. leakage probe — a different workspace must NOT see ws-1's private artifacts
  const otherWs = `${workspaceId}-other`;
  let leaked = false;
  for (const c of cases.slice(0, Math.min(40, cases.length))) {
    const adv = await advise(c, { store, workspaceId: otherWs });
    if ((adv.learningNotesApplied ?? []).length > 0) { leaked = true; break; }
  }

  const dimAvg = (pick: (s: Scored) => ScoreResult): Record<RubricDimension, number> => {
    const acc = ZERO_DIMS();
    for (const s of scored) for (const k of Object.keys(acc) as RubricDimension[]) acc[k] += pick(s).dimensions[k];
    for (const k of Object.keys(acc) as RubricDimension[]) acc[k] = Math.round((acc[k] / scored.length) * 100) / 100;
    return acc;
  };

  const baseAvgTotal = avg(baseScores.map((s) => s.total));
  const learnedAvgTotal = avg(scored.map((s) => s.learned.total));
  const basePass = Math.round((100 * baseScores.filter((s) => s.passed).length) / cases.length);
  const learnedPass = Math.round((100 * scored.filter((s) => s.learned.passed).length) / cases.length);

  return {
    mode,
    at,
    totalCases: cases.length,
    distribution: distributionOf(cases),
    passThreshold: PASS_THRESHOLD,
    expertThreshold: EXPERT_THRESHOLD,
    base: {
      avg: baseAvgTotal,
      passRate: basePass,
      unsafe: baseScores.reduce((s, r) => s + r.unsafe.length, 0),
      dimAvg: dimAvg((s) => s.base),
    },
    learned: {
      avg: learnedAvgTotal,
      passRate: learnedPass,
      unsafe: scored.reduce((s, r) => s + r.learned.unsafe.length, 0),
      dimAvg: dimAvg((s) => s.learned),
    },
    improvement: { avgDelta: Math.round((learnedAvgTotal - baseAvgTotal) * 10) / 10, passRateDelta: learnedPass - basePass },
    artifactsCreated,
    casesUsingLearning: scored.filter((s) => s.usedLearning).length,
    failureLabelCounts,
    byArchetype: groupBy(scored, (c) => c.archetype),
    byDecisionCategory: groupBy(scored, (c) => c.decisionCategory),
    byLocation: groupBy(scored, (c) => `${c.location.country}|${c.location.marketTier}`),
    leakageProbe: { otherWorkspaceUsedForeignArtifacts: leaked, checkedCases: Math.min(40, cases.length) },
    worstLearnedCases: scored
      .slice()
      .sort((a, b) => a.learned.total - b.learned.total)
      .slice(0, 8)
      .map((s) => ({ id: s.c.id, sourceSeedCaseId: s.c.sourceSeedCaseId, total: s.learned.total, unsafe: s.learned.unsafe.length, labels: s.learned.failureLabels })),
  };
}
