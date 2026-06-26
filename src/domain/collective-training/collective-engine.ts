/**
 * C18 — End-to-end collective owner decision flow (pure).
 *
 * Orchestrates C2–C13 into one governed CollectiveDecisionPacket:
 * ingest → aggregate → classify stage → rank priorities → resolve vetoes → detect
 * contradictions → what-not-to-do → select primary action → assign → compose steps →
 * proof/verification → stop/rollback/redesign → learning admission → confidence + lean.
 * Deterministic. The engine never emits an unsafe output; it fails closed.
 */

import type {
  CollectiveDecisionPacket, DomainKey, DomainSignalInput, RecommendationConfidence,
} from "@/domain/collective-training/collective-types";
import { aggregateSignals, isRed } from "@/domain/collective-training/signal-aggregator";
import { classifyBusinessStage } from "@/domain/collective-training/stage-classifier";
import { rankSignals } from "@/domain/collective-training/priority-engine";
import { resolveVetoes } from "@/domain/collective-training/veto-resolver";
import { detectContradictions, type ContradictionInput } from "@/domain/collective-training/contradiction-resolver";
import { generateWhatNotToDo } from "@/domain/collective-training/what-not-to-do-generator";
import { selectPrimaryAction } from "@/domain/collective-training/next-action-selector";
import { resolveAssignment, type TaskKind } from "@/domain/collective-training/assignment-resolver";
import { composeExecution, type ExecutionLever } from "@/domain/collective-training/execution-composer";
import { composeVerification } from "@/domain/collective-training/verification-composer";
import { composeStopRollbackRedesign, type RollbackLever } from "@/domain/collective-training/stop-rollback-composer";
import { decideLearning, type LearningAdmissionInput } from "@/domain/collective-training/learning-admission";
import type { HarmEntry } from "@/domain/domain-training/harm-ledger";

export interface CollectiveInput {
  archetype: string;
  ownerGoal: string;
  ownerClaim?: string;
  signals: DomainSignalInput[];
  contradiction?: ContradictionInput;
  missingCriticalProof?: boolean;
  lowDataConfidence?: boolean;
  emergencyContainment?: boolean;
  taskKind?: TaskKind;
  ownerOnlyDecision?: boolean;
  verification?: {
    primaryImproved?: boolean; baselinePresent?: boolean; outcomeVerifiable?: boolean;
    harms?: HarmEntry[]; sideEffectMetrics?: string[]; reviewWindow?: string; proofOwner?: string;
  };
  learning?: LearningAdmissionInput;
}

const EXEC_LEVER: Partial<Record<DomainKey, ExecutionLever>> = {
  "cash-survival": "cash", "risk-compliance": "compliance", quality: "quality", capacity: "capacity",
  "supplier-inventory": "supplier", "staff-workload": "workload", "owner-workload": "workload",
  "sop-process": "sop", "customer-complaints": "complaints", "profit-improvement": "profit",
  "pricing-decisions": "pricing", retention: "retention", marketing: "marketing",
  "growth-readiness": "growth", "scale-readiness": "scale",
};
const ROLLBACK_LEVER: Partial<Record<DomainKey, RollbackLever>> = {
  "cash-survival": "cash", quality: "quality", capacity: "capacity", "supplier-inventory": "supplier",
  "sop-process": "sop", "customer-complaints": "quality", "profit-improvement": "pricing",
  "pricing-decisions": "pricing", retention: "retention", marketing: "marketing",
  "growth-readiness": "growth", "scale-readiness": "scale",
};
const TASK_KIND: Partial<Record<DomainKey, TaskKind>> = {
  "cash-survival": "financial", "risk-compliance": "compliance", "profit-improvement": "financial",
  "pricing-decisions": "strategic", "growth-readiness": "strategic", "scale-readiness": "strategic",
  quality: "operational", capacity: "operational", "supplier-inventory": "operational",
  "sop-process": "operational", "customer-complaints": "operational", retention: "operational",
  marketing: "operational", "staff-workload": "operational", "owner-workload": "strategic",
};

export function runCollective(input: CollectiveInput): CollectiveDecisionPacket {
  const agg = aggregateSignals(input.signals);
  const stageRes = classifyBusinessStage(agg);
  const priority = rankSignals(agg);
  const binding = priority.bindingConstraint?.domain ?? null;

  const contra = detectContradictions(input.contradiction ?? {});
  const hasContradiction = contra.contradictions.length > 0;

  const veto = resolveVetoes(agg, {
    contradictoryData: hasContradiction && contra.downgradeConfidence,
    unverifiedOutcome: input.verification ? input.verification.outcomeVerifiable === false : false,
    missingCriticalProof: input.missingCriticalProof === true,
  });
  const complianceUncertain = veto.context.complianceOrSafetyUncertain;

  const redDomains = agg.presentDomains.filter((d) => { const s = agg.byDomain.get(d)!; return isRed(s.status, s.severity); });
  const whatNotToDo = generateWhatNotToDo({
    blockedActions: veto.blockedActions, context: veto.context,
    lowDataConfidence: input.lowDataConfidence === true, hasContradiction, redDomains,
  });

  const next = selectPrimaryAction({
    bindingConstraint: binding, stage: stageRes.stage, complianceUncertain,
    missingCriticalProof: input.missingCriticalProof === true, lowDataConfidence: input.lowDataConfidence === true,
    blockClosure: contra.blockClosure, hasContradiction, emergencyContainment: input.emergencyContainment,
  });

  const execLever: ExecutionLever = (binding && EXEC_LEVER[binding]) || (input.missingCriticalProof ? "proof" : "generic");
  const rollbackLever: RollbackLever = (binding && ROLLBACK_LEVER[binding]) || "generic";
  const taskKind: TaskKind = input.taskKind ?? (binding && TASK_KIND[binding]) ?? "operational";

  const assignment = resolveAssignment({
    taskKind, complianceUncertain, ownerOverloaded: isRedDomain(agg, "owner-workload"),
    staffOverloaded: isRedDomain(agg, "staff-workload"), ownerOnlyDecision: input.ownerOnlyDecision,
    critical: priority.bindingConstraint ? priority.bindingConstraint.priorityLevel <= 1 : false,
  });

  const execution = composeExecution(execLever);
  const v = input.verification ?? {};
  const verification = composeVerification({
    lever: execLever, sideEffectMetrics: v.sideEffectMetrics ?? [], harms: v.harms ?? [],
    primaryImproved: v.primaryImproved ?? false, baselinePresent: v.baselinePresent ?? false,
    outcomeVerifiable: v.outcomeVerifiable ?? false, proofOwner: v.proofOwner ?? assignment.proofResponsibility,
    reviewWindow: v.reviewWindow ?? "1–2 week review window",
  });
  const stopRollback = composeStopRollbackRedesign(rollbackLever);

  // Learning is forced inadmissible if the outcome cannot be classed as success.
  const learningInput: LearningAdmissionInput = input.learning ?? {
    learningRequested: false, outcomeVerified: false, harmChecked: false, harmful: false,
    crossDomainHarm: false, disputed: false, inconclusive: false, simulationTested: false,
  };
  const effectiveLearning: LearningAdmissionInput = {
    ...learningInput,
    outcomeVerified: learningInput.outcomeVerified && !contra.preventSuccess && verification.successAllowed,
    disputed: learningInput.disputed || contra.preventSuccess,
  };
  const learning = decideLearning(effectiveLearning);

  let confidence: RecommendationConfidence = priority.bindingConstraint?.confidence ?? "HIGH";
  if (complianceUncertain) confidence = "ESCALATE";
  else if (input.missingCriticalProof || contra.blockClosure) confidence = "BLOCKED";
  else if (contra.downgradeConfidence || input.lowDataConfidence) confidence = "LOW";

  const primaryDiagnosis = `${describeStage(stageRes.stage)}: ${binding ? `${binding} is the binding constraint` : "no binding constraint"}${hasContradiction ? "; contradictory evidence present" : ""}.`;

  return {
    businessStage: stageRes.stage,
    primaryDiagnosis,
    rankedDomainSignals: priority.ranked,
    activeVetoes: veto.activeVetoes,
    contradictions: contra.contradictions,
    whatNotToDo,
    primaryNextAction: next.primaryAction,
    secondaryActions: next.secondaryActions,
    whyThisNow: next.rationale,
    whoShouldDoIt: assignment,
    howToDoIt: { steps: execution.steps, checklist: execution.checklist, escalationPoint: execution.escalationPoint, commonMistakes: execution.commonMistakes },
    proofRequired: verification.proofRequired,
    verificationPlan: verification.verificationPlan,
    stopRollbackRedesign: stopRollback,
    learningStatus: learning.status,
    confidence,
    ownerModeLeanCheck: {
      avoidsUnnecessaryAdmin: !next.lean.failures.includes("adds_unnecessary_admin"),
      avoidsStaffOverload: !next.lean.failures.includes("overloads_staff_non_emergency"),
      avoidsOwnerOverload: !next.lean.failures.includes("overloads_owner_non_survival"),
      protectsProfit: !next.lean.failures.includes("damages_profit_unjustified"),
      protectsQuality: !next.lean.failures.includes("damages_service_quality"),
      protectsSustainableGrowth: !next.lean.failures.includes("not_sustainable"),
      simplestSafeActionSelected: next.lean.pass,
    },
    unsafeEmitted: [],
  };
}

function isRedDomain(agg: ReturnType<typeof aggregateSignals>, d: DomainKey): boolean {
  const s = agg.byDomain.get(d);
  return !!s && isRed(s.status, s.severity);
}

function describeStage(stage: string): string {
  return stage.replace(/_/g, " ");
}
