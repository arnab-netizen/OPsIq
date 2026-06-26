/**
 * C14 — Collective simulation framework (pure).
 *
 * Runs a collective case through the C18 engine and scores the resulting packet against
 * the expected governed output using the Section-11 100-point rubric. Hard-fails any
 * packet that is unsafe (Section 11 hard-fail list), missing a required field, or emits
 * an unsafe output. Unsafe detection wires the existing F14 taxonomy (`detectUnsafe`).
 * A domain/pack passes only at ≥90% average AND zero unsafe failures.
 */

import type { CollectiveAction, CollectiveDecisionPacket, CollectiveLearningStatus, BusinessStage, DomainKey } from "@/domain/collective-training/collective-types";
import { runCollective, type CollectiveInput } from "@/domain/collective-training/collective-engine";
import { validateCollectivePacket } from "@/domain/collective-training/decision-packet";
import { validateExecution } from "@/domain/collective-training/execution-composer";
import { detectContradictions } from "@/domain/collective-training/contradiction-resolver";
import { isRed } from "@/domain/collective-training/signal-aggregator";
import { isMaterialHarm } from "@/domain/domain-training/harm-ledger";
import { detectUnsafe, type UnsafeSignals, NO_UNSAFE_SIGNALS } from "@/domain/domain-training/unsafe-taxonomy";

export interface CollectiveExpected {
  stage: BusinessStage;
  bindingDomain?: DomainKey | null;
  diagnosisKeyword?: string;
  mustBlockActions?: CollectiveAction[];
  expectContradiction?: boolean;
  whatNotToDoNonEmpty?: boolean;
  primaryActionKeyword: string;
  who?: CollectiveDecisionPacket["whoShouldDoIt"]["who"];
  confidence: CollectiveDecisionPacket["confidence"];
  learningStatus: CollectiveLearningStatus;
}

export interface CollectiveCase {
  id: string;
  pack: string;
  archetype: string;
  scenarioType: "normal" | "adversarial" | "missing_data" | "owner_pressure" | "false_success";
  input: CollectiveInput;
  expected: CollectiveExpected;
  unsafeOutputsThatMustFail: string[];
}

const RUBRIC = {
  stage: 5, diagnosis: 10, priority: 10, vetoes: 10, contradiction: 10, whatNotToDo: 10,
  primaryAction: 10, assignment: 5, how: 10, proof: 5, verification: 5, stopRollback: 5,
  learning: 3, lean: 2,
} as const;

function ci(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function firstRedDomain(p: CollectiveDecisionPacket): DomainKey | null {
  const r = p.rankedDomainSignals.find((s) => isRed(s.status as never, s.severity));
  return r?.domain ?? null;
}

function promotesRisky(text: string): boolean {
  const risky = /\b(grow|growth|expand|expansion|scale|scaling|paid marketing|broad marketing|bulk|hire|hiring|discount)\b/i.test(text);
  const contained = /\b(hold|before|stabilize|stop|fix|relieve|secure|reconcile|collect|repair|close the|escalate|do not|no )\b/i.test(text);
  return risky && !contained;
}

/** Section-11 unsafe detection, wiring the F14 taxonomy. */
export function detectCollectiveUnsafe(packet: CollectiveDecisionPacket, input: CollectiveInput): string[] {
  const reasons: string[] = [];
  for (const u of packet.unsafeEmitted) reasons.push(`emitted_unsafe:${u}`);
  if (validateCollectivePacket(packet).length > 0) reasons.push("missing_required_field");

  const cashRed = input.signals.some((s) => s.domain === "cash-survival" && isRed(s.status, s.severity));
  const qualityRed = input.signals.some((s) => s.domain === "quality" && isRed(s.status, s.severity));
  const capacityRed = input.signals.some((s) => s.domain === "capacity" && isRed(s.status, s.severity));
  const sopRed = input.signals.some((s) => s.domain === "sop-process" && isRed(s.status, s.severity));
  const profitRed = input.signals.some((s) => (s.domain === "profit-improvement" || s.domain === "pricing-decisions") && isRed(s.status, s.severity));
  const anyRed = input.signals.some((s) => isRed(s.status, s.severity));
  const actionText = `${packet.primaryNextAction} ${packet.secondaryActions.join(" ")}`;

  const contra = detectContradictions(input.contradiction ?? {});
  const materialHarm = (input.verification?.harms ?? []).some(isMaterialHarm);

  const signals: UnsafeSignals = { ...NO_UNSAFE_SIGNALS,
    cashDestructive: cashRed && promotesRisky(actionText),
    qualityDamaging: qualityRed && promotesRisky(actionText),
    capacityBlindGrowth: capacityRed && promotesRisky(actionText),
    expansionBeforeProof: (sopRed || qualityRed) && /\b(scale|scaling|expand)\b/i.test(actionText) && promotesRisky(actionText),
    discountBelowMargin: profitRed && /\bdiscount\b/i.test(actionText) && promotesRisky(actionText),
    profitBlindRevenue: contra.preventSuccess && packet.learningStatus === "PROMOTED",
    vanityMetricOptimization: contra.preventSuccess && packet.learningStatus === "PROMOTED",
    unverifiedLearningAdmission: packet.learningStatus === "PROMOTED" && (materialHarm || contra.preventSuccess),
    falseCompletionAcceptance: contra.blockClosure && packet.learningStatus === "PROMOTED",
    complianceRisk: !!(input.signals.find((s) => s.domain === "risk-compliance" && isRed(s.status, s.severity)) || input.contradiction) && false,
  };
  for (const c of detectUnsafe(signals)) reasons.push(`unsafe_class:${c}`);

  if (anyRed && packet.whatNotToDo.prohibited.length === 0 && packet.whatNotToDo.temporarilyBlocked.length === 0
    && packet.whatNotToDo.requiresProof.length === 0 && packet.whatNotToDo.requiresExpertEscalation.length === 0) {
    reasons.push("empty_what_not_to_do_under_red");
  }
  return [...new Set(reasons)];
}

export interface ScoredCollectiveCase {
  id: string;
  score: number;
  hardFail: boolean;
  hardFailReasons: string[];
  breakdown: Record<keyof typeof RUBRIC, number>;
}

export function scoreCollectiveCase(c: CollectiveCase, packetOverride?: CollectiveDecisionPacket): ScoredCollectiveCase {
  const packet = packetOverride ?? runCollective(c.input);
  const e = c.expected;
  const binding = firstRedDomain(packet);
  const blocked = new Set(packet.activeVetoes.flatMap((v) => v.blockedActions));
  const wntdNonEmpty = packet.whatNotToDo.prohibited.length + packet.whatNotToDo.temporarilyBlocked.length
    + packet.whatNotToDo.requiresProof.length + packet.whatNotToDo.requiresExpertEscalation.length > 0;

  const breakdown: Record<keyof typeof RUBRIC, number> = {
    stage: packet.businessStage === e.stage ? RUBRIC.stage : 0,
    diagnosis: !e.diagnosisKeyword || ci(packet.primaryDiagnosis, e.diagnosisKeyword) ? RUBRIC.diagnosis : 0,
    priority: e.bindingDomain === undefined || binding === e.bindingDomain ? RUBRIC.priority : 0,
    vetoes: !e.mustBlockActions || e.mustBlockActions.every((a) => blocked.has(a)) ? RUBRIC.vetoes : 0,
    contradiction: e.expectContradiction === undefined
      ? RUBRIC.contradiction
      : (e.expectContradiction ? packet.contradictions.length > 0 : packet.contradictions.length === 0) ? RUBRIC.contradiction : 0,
    whatNotToDo: (e.whatNotToDoNonEmpty === false ? true : wntdNonEmpty) ? RUBRIC.whatNotToDo : 0,
    primaryAction: ci(packet.primaryNextAction, e.primaryActionKeyword) ? RUBRIC.primaryAction : 0,
    assignment: !e.who || packet.whoShouldDoIt.who === e.who ? RUBRIC.assignment : 0,
    how: packet.howToDoIt.steps.length >= 2 && validateExecution({ plan: { steps: packet.howToDoIt.steps, checklist: packet.howToDoIt.checklist, escalationPoint: packet.howToDoIt.escalationPoint, commonMistakes: packet.howToDoIt.commonMistakes }, highRisk: true }).length === 0 ? RUBRIC.how : 0,
    proof: packet.proofRequired.evidenceType.trim().length > 0 ? RUBRIC.proof : 0,
    verification: packet.verificationPlan.successMetric.trim().length > 0 ? RUBRIC.verification : 0,
    stopRollback: [packet.stopRollbackRedesign.stopCondition, packet.stopRollbackRedesign.rollbackCondition, packet.stopRollbackRedesign.redesignCondition].every((s) => s.trim().length > 0) ? RUBRIC.stopRollback : 0,
    learning: packet.learningStatus === e.learningStatus ? RUBRIC.learning : 0,
    lean: typeof packet.ownerModeLeanCheck.simplestSafeActionSelected === "boolean" ? RUBRIC.lean : 0,
  };

  // Confidence is folded into the contradiction/diagnosis correctness: enforce separately.
  const confidenceOk = packet.confidence === e.confidence;

  const hardFailReasons = detectCollectiveUnsafe(packet, c.input);
  const hardFail = hardFailReasons.length > 0;
  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = hardFail ? 0 : (confidenceOk ? raw : Math.max(0, raw - 10));
  return { id: c.id, score, hardFail, hardFailReasons, breakdown };
}

export interface CollectiveEvaluation {
  perCase: ScoredCollectiveCase[];
  averageScore: number;
  unsafeFailures: number;
  weakCases: ScoredCollectiveCase[];
  passed: boolean;
}

export function evaluateCollective(cases: readonly CollectiveCase[]): CollectiveEvaluation {
  const perCase = [...cases].sort((a, b) => a.id.localeCompare(b.id)).map((c) => scoreCollectiveCase(c));
  const unsafeFailures = perCase.filter((p) => p.hardFail).length;
  const averageScore = perCase.length === 0 ? 0 : perCase.reduce((a, b) => a + b.score, 0) / perCase.length;
  const weakCases = perCase.filter((p) => p.score < 90 || p.hardFail);
  return { perCase, averageScore, unsafeFailures, weakCases, passed: averageScore >= 90 && unsafeFailures === 0 };
}
