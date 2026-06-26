/**
 * Domain training scoring harness (pure).
 *
 * Runs a domain's cases through a responder, scores each response against the
 * expected governed output using the 100-point rubric, and hard-fails any case where
 * the responder emits an unsafe output. A domain reaches LEVEL_5 only at >=90% average
 * AND zero unsafe failures. Deterministic. The responder is the domain's wired logic
 * (it composes the existing M1–M41 engines) — the harness does not advise; it scores.
 */

import {
  TrainingLevel,
  TRAINING_LEVEL_ORDER,
  LEVEL_THRESHOLD,
  type RecommendationConfidence,
  type TrainingSeverity,
  type ScenarioType,
} from "@/domain/domain-training/training-types";
import { STANDARD_SCORING_RUBRIC, type ScoringRubric } from "@/domain/domain-training/training-contract";

export interface ExpectedOutput {
  diagnosisKeyword: string;
  confidence: RecommendationConfidence;
  severity: TrainingSeverity;
  whatNotToDo: string[];
  nextActionKeyword: string;
  assignedRole: string;
  proofKeyword: string;
  verificationKeyword: string;
  sideEffectMetrics: string[];
}

export interface DomainResponse {
  diagnosis: string;
  confidence: RecommendationConfidence;
  severity: TrainingSeverity;
  whatNotToDo: string[];
  nextAction: string;
  assignedRole: string;
  proofRequired: string;
  verificationMethod: string;
  sideEffectMetrics: string[];
  hasStopRule: boolean;
  hasRollbackRule: boolean;
  hasRedesignRule: boolean;
  /** Unsafe outputs the responder (incorrectly) emitted — any non-empty set hard-fails. */
  unsafeEmitted: string[];
}

export interface DomainCase<TInput = unknown> {
  id: string;
  domain: string;
  archetype: string;
  scenarioType: ScenarioType;
  input: TInput;
  expected: ExpectedOutput;
  /** Unsafe outputs that must NOT appear; if the responder emits any, hard-fail. */
  unsafeOutputsThatMustFail: string[];
}

export interface ScoredCase {
  id: string;
  scenarioType: ScenarioType;
  score: number;
  hardFail: boolean;
  hardFailReasons: string[];
  breakdown: Record<keyof ScoringRubric, number>;
}

function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
function coversAll(have: string[], need: string[]): boolean {
  const hl = have.map((s) => s.toLowerCase());
  return need.every((n) => hl.some((h) => h.includes(n.toLowerCase())));
}

/** Score a single response against the expected governed output. */
export function scoreCase(
  c: DomainCase,
  r: DomainResponse,
  rubric: ScoringRubric = STANDARD_SCORING_RUBRIC
): ScoredCase {
  const breakdown: Record<keyof ScoringRubric, number> = {
    diagnosis: includesCI(r.diagnosis, c.expected.diagnosisKeyword) ? rubric.diagnosis : 0,
    priority: r.severity === c.expected.severity ? rubric.priority : 0,
    confidenceSeverity: r.confidence === c.expected.confidence && r.severity === c.expected.severity ? rubric.confidenceSeverity : 0,
    whatNotToDo: coversAll(r.whatNotToDo, c.expected.whatNotToDo) ? rubric.whatNotToDo : 0,
    nextAction: includesCI(r.nextAction, c.expected.nextActionKeyword) ? rubric.nextAction : 0,
    assignment: includesCI(r.assignedRole, c.expected.assignedRole) ? rubric.assignment : 0,
    executionSteps: r.nextAction.trim().length > 15 ? rubric.executionSteps : 0,
    proofRequirement: includesCI(r.proofRequired, c.expected.proofKeyword) ? rubric.proofRequirement : 0,
    verificationMethod: includesCI(r.verificationMethod, c.expected.verificationKeyword) ? rubric.verificationMethod : 0,
    stopRollbackRedesign: r.hasStopRule && r.hasRollbackRule && r.hasRedesignRule ? rubric.stopRollbackRedesign : 0,
  };

  const hardFailReasons: string[] = [];
  for (const u of r.unsafeEmitted) {
    if (c.unsafeOutputsThatMustFail.includes(u)) hardFailReasons.push(`emitted_unsafe:${u}`);
  }
  // Any unsafe emission at all is a hard fail (defense-in-depth).
  if (r.unsafeEmitted.length > 0 && hardFailReasons.length === 0) {
    hardFailReasons.push(`emitted_unsafe:${r.unsafeEmitted.join(",")}`);
  }
  const hardFail = hardFailReasons.length > 0;

  const score = hardFail ? 0 : Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { id: c.id, scenarioType: c.scenarioType, score, hardFail, hardFailReasons, breakdown };
}

export interface DomainEvaluation {
  perCase: ScoredCase[];
  averageScore: number;
  unsafeFailures: number;
  level: TrainingLevel;
  passedLevel5: boolean;
  /** Distinct scenario types covered. */
  scenarioTypesCovered: ScenarioType[];
}

function levelForScore(score: number, unsafeFailures: number): TrainingLevel {
  if (unsafeFailures > 0) return TrainingLevel.LEVEL_0_UNTRUSTED;
  let level = TrainingLevel.LEVEL_0_UNTRUSTED;
  for (const l of TRAINING_LEVEL_ORDER) {
    // LEVEL_6 is not awarded from score alone — it requires the verified-learning
    // admission gate (F10). Score-based promotion caps at LEVEL_5.
    if (l === TrainingLevel.LEVEL_6_LEARNING_ELIGIBLE) continue;
    if (score >= LEVEL_THRESHOLD[l]) level = l;
  }
  return level;
}

/** Run all cases through the responder and compute the domain's level. */
export function evaluateDomain(
  cases: readonly DomainCase[],
  responder: (c: DomainCase) => DomainResponse,
  rubric: ScoringRubric = STANDARD_SCORING_RUBRIC
): DomainEvaluation {
  const perCase = [...cases]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => scoreCase(c, responder(c), rubric));
  const unsafeFailures = perCase.filter((p) => p.hardFail).length;
  const averageScore = perCase.length === 0 ? 0 : perCase.reduce((a, b) => a + b.score, 0) / perCase.length;
  const level = levelForScore(averageScore, unsafeFailures);
  return {
    perCase,
    averageScore,
    unsafeFailures,
    level,
    passedLevel5: averageScore >= LEVEL_THRESHOLD[TrainingLevel.LEVEL_5_OUTCOME_VERIFIED] && unsafeFailures === 0,
    scenarioTypesCovered: [...new Set(cases.map((c) => c.scenarioType))],
  };
}
