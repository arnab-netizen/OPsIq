/**
 * Process-Execution Bridge Expansion (PASS 23) — pure domain.
 *
 * PASS 20 bridged only two families (process corrections + cash/profit) into governed ProcessExecutionTask
 * routes. The remaining advisory/monitoring-heavy engines could influence execution ONLY indirectly, through
 * the process-correction router (restriction R2). This module bridges them DIRECTLY into the SAME governed
 * substrate, so the owner acts on them from the cockpit with the full loop (route → owner → approval →
 * evidence → completion → reassessment) instead of reading an advisory paragraph:
 *
 *   1. Owner workload reduction   → a delegation / policy / checklist / data task (high-risk stays owner-gated).
 *   2. Capability gap detector    → a data / prep / owner-build task (low-value gaps stay MONITOR_ONLY — no flood).
 *   3. Standalone SOP/checklist   → an SOP draft task that requires adoption evidence before completion.
 *   4. Standalone training        → a coaching assignment with a named owner and completion evidence.
 *   5. SOP/training effectiveness → the SOP-ADHERENCE RE-CHECK (R3): a verified improvement is MONITOR_ONLY
 *                                   (no false "it worked" claim); a worsened/unchanged result becomes an
 *                                   actionable, evidence-gated re-check (retrain / modify / escalate).
 *   6. Complaint / rework         → already flows through the correction router (QUALITY_FAILURE_LOOP →
 *                                   ESCALATE_TO_OWNER, REWORK_LOOP → REVIEW_PROCESS_STEP); this module keeps
 *                                   that path and never adds a second, unsafe complaint route.
 *
 * Pure + deterministic. It never executes anything, never fabricates a figure or a time-saving, never implies
 * staff discipline, and keeps every material/owner decision owner-gated. Missing data routes to a data task,
 * never a guess. It reuses the existing BridgedExecutionRoute shape so the persist/apply service and the
 * cockpit panel handle the new families with zero new plumbing.
 */

import type {
  BridgedExecutionRoute, ExecutionRoute, BridgeActionOwner, BridgeApprovalLevel, BridgeSourceFamily,
} from "./process-execution-bridge";
import { approvalFor, COMPLETION_BY_ROUTE } from "./process-execution-bridge";
import type { OwnerWorkloadReductionAnalysis, OwnerWorkloadFinding, ReductionAction } from "./owner-workload-reduction";
import type { CapabilityGapAnalysis, SystemCapabilityRecommendation } from "./system-capability-gap-detector";
import type { SopChecklistCorrectionAnalysis, SopChecklistCorrection } from "./sop-checklist-correction-engine";
import type { TrainingAssignmentAnalysis, TrainingAssignment } from "./staff-training-assignment-engine";
import type { EffectivenessAnalysis, EffectivenessEvaluation } from "./sop-training-effectiveness-loop";

type Severity = BridgedExecutionRoute["severity"];

/** The extra analyses PASS 23 bridges. All optional/nullable — the bridge degrades to PASS 20 behaviour. */
export interface BridgeExpansionInputs {
  workload?: OwnerWorkloadReductionAnalysis | null;
  capability?: CapabilityGapAnalysis | null;
  sop?: SopChecklistCorrectionAnalysis | null;
  training?: TrainingAssignmentAnalysis | null;
  effectiveness?: EffectivenessAnalysis | null;
}

/** Correction keys a specific SOP / training route supersedes, so the generic correction route collapses (no dup). */
export interface BridgeCollapse {
  sopCorrectionKeys: Set<string>;
  trainingCorrectionKeys: Set<string>;
}

const REASSESS = (what: string) => `Re-evaluate ${what} at the next owner review; reopen if the pattern persists or the metric worsens.`;

function mk(p: {
  workspaceId: string; taskKey: string; sourceFamily: BridgeSourceFamily; sourceFindingKey: string;
  executionRoute: ExecutionRoute; actionOwner: BridgeActionOwner; approvalLevel: BridgeApprovalLevel;
  requiredEvidence: string[]; riskIfIgnored: string; ownerVisibleSummary: string; evidenceRefs: string[];
  severity: Severity; priorityRank: number; reassess: string; notActionableReason?: string | null;
}): BridgedExecutionRoute {
  return {
    workspaceId: p.workspaceId, taskKey: p.taskKey, sourceFamily: p.sourceFamily, sourceFindingKey: p.sourceFindingKey,
    executionRoute: p.executionRoute, actionOwner: p.actionOwner, approvalLevel: p.approvalLevel,
    requiredEvidence: p.executionRoute === "MONITOR_ONLY" ? [] : p.requiredEvidence,
    completionCriteria: COMPLETION_BY_ROUTE[p.executionRoute],
    reassessmentTrigger: p.reassess, riskIfIgnored: p.riskIfIgnored, ownerVisibleSummary: p.ownerVisibleSummary,
    notActionableReason: p.notActionableReason ?? null, evidenceRefs: p.evidenceRefs,
    severity: p.severity, priorityRank: p.priorityRank, status: "PROPOSED",
  };
}

// ── 1. Owner workload reduction ──────────────────────────────────────────────────────────────────────────

/** reductionAction → executionRoute + default owner. Material/owner-gated reductions stay OWNER-approval. */
const WORKLOAD_ROUTE: Record<ReductionAction, { route: ExecutionRoute; owner: BridgeActionOwner }> = {
  DELEGATE_TO_MANAGER: { route: "CREATE_MANAGER_TASK", owner: "MANAGER" },
  CONVERT_TO_POLICY: { route: "CREATE_OWNER_APPROVAL_TASK", owner: "OWNER" },
  AUTO_COLLAPSE_DUPLICATES: { route: "CREATE_CORRECTION_TASK", owner: "MANAGER" },
  REQUIRE_BETTER_PROOF_UPFRONT: { route: "CREATE_EVIDENCE_REQUEST", owner: "OPSIQ_DRAFT" },
  ASSIGN_TRAINING: { route: "CREATE_TRAINING_TASK", owner: "MANAGER" },
  UPDATE_CHECKLIST: { route: "CREATE_SOP_CHECKLIST_TASK", owner: "OPSIQ_DRAFT" },
  COLLECT_MISSING_DATA: { route: "CREATE_MISSING_DATA_TASK", owner: "STAFF" },
  KEEP_OWNER_APPROVAL: { route: "CREATE_OWNER_APPROVAL_TASK", owner: "OWNER" },
};
const SEVERITY_INDEX: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function evidenceForRoute(route: ExecutionRoute, missingData: string[]): string[] {
  switch (route) {
    case "CREATE_MISSING_DATA_TASK": return missingData.length ? missingData : ["the missing operational data"];
    case "CREATE_EVIDENCE_REQUEST": return ["fresh checked proof for the affected work"];
    case "CREATE_SOP_CHECKLIST_TASK": return ["the drafted SOP/checklist change", "evidence of adoption before it is marked done"];
    case "CREATE_TRAINING_TASK": return ["proof the training/coaching was completed"];
    case "CREATE_OWNER_APPROVAL_TASK": return ["the supporting evidence for the owner decision"];
    case "CREATE_REASSESSMENT_TASK": return ["the re-check result and its supporting before/after evidence"];
    default: return ["evidence the action was carried out"];
  }
}

export function bridgeWorkloadFinding(f: OwnerWorkloadFinding): BridgedExecutionRoute {
  const mapped = WORKLOAD_ROUTE[f.recommendedReductionAction];
  const materialOwner = f.recommendedReductionAction === "KEEP_OWNER_APPROVAL" || f.recommendedReductionAction === "CONVERT_TO_POLICY";
  const approvalLevel: BridgeApprovalLevel = materialOwner
    ? "OWNER_APPROVAL_REQUIRED"
    : mapped.route === "CREATE_MISSING_DATA_TASK"
      ? "NEEDS_DATA"
      : approvalFor(f.approvalLevel, f.missingData.length > 0);
  const evidenceRefs = [...f.supportingProofIds, ...f.supportingAdjudicationIds, ...f.supportingOperationalEventIds, ...f.supportingEscalationIds];
  return mk({
    workspaceId: f.workspaceId, taskKey: `wl:${f.workloadType}`, sourceFamily: "WORKLOAD_REDUCTION",
    sourceFindingKey: f.workloadType, executionRoute: mapped.route, actionOwner: mapped.owner, approvalLevel,
    requiredEvidence: evidenceForRoute(mapped.route, f.missingData),
    // Honest owner-facing text only — never a fabricated "hours saved"; the engine's guardrail carries the risk.
    riskIfIgnored: f.riskGuardrail || f.ownerVisibleExplanation, ownerVisibleSummary: f.ownerVisibleExplanation,
    evidenceRefs, severity: f.severity, priorityRank: 200 + SEVERITY_INDEX[f.severity],
    reassess: REASSESS("this avoidable owner-workload pattern"),
  });
}

// ── 2. Capability gap detector (anti-flood: only material/blocking/data gaps become tasks) ──────────────────

export function bridgeCapabilityRecommendation(rec: SystemCapabilityRecommendation): BridgedExecutionRoute {
  const material = rec.severity === "CRITICAL" || rec.severity === "HIGH";
  const dataGap = rec.dependsOnData || rec.missingData.length > 0;
  let route: ExecutionRoute; let owner: BridgeActionOwner; let approvalLevel: BridgeApprovalLevel; let reason: string | null = null;
  if (dataGap) {
    route = "CREATE_MISSING_DATA_TASK"; owner = "STAFF"; approvalLevel = "NEEDS_DATA";
  } else if (material && rec.unlocksAutomation) {
    route = "CREATE_OWNER_APPROVAL_TASK"; owner = "OWNER"; approvalLevel = "OWNER_APPROVAL_REQUIRED";
  } else if (material || rec.blocksToday.length > 0) {
    route = "CREATE_CORRECTION_TASK"; owner = "OPSIQ_DRAFT"; approvalLevel = "MANAGER_APPROVAL_REQUIRED";
  } else {
    route = "MONITOR_ONLY"; owner = "NO_ACTION"; approvalLevel = "NEEDS_DATA";
    reason = "Capability recommendation — monitored until it blocks execution or the owner prioritises a build.";
  }
  const requiredEvidence = route === "CREATE_MISSING_DATA_TASK" ? (rec.missingData.length ? rec.missingData : ["the missing operational data"])
    : route === "CREATE_OWNER_APPROVAL_TASK" ? ["the capability/build decision and the actions it would unlock"]
    : route === "CREATE_CORRECTION_TASK" ? ["the drafted capability/prep note"] : [];
  return mk({
    workspaceId: rec.workspaceId, taskKey: `cap:${rec.capabilityType}`, sourceFamily: "CAPABILITY_GAP",
    sourceFindingKey: rec.capabilityType, executionRoute: route, actionOwner: owner, approvalLevel, requiredEvidence,
    riskIfIgnored: rec.problemStatement, ownerVisibleSummary: `${rec.title} — ${rec.recommendedCapability}`,
    evidenceRefs: rec.evidenceRefs, severity: rec.severity, priorityRank: 300 + rec.priorityRank,
    reassess: REASSESS("this capability gap"), notActionableReason: reason,
  });
}

// ── 3. Standalone SOP / checklist draft ──────────────────────────────────────────────────────────────────

export function bridgeSopDraft(d: SopChecklistCorrection): BridgedExecutionRoute {
  const owner: BridgeActionOwner = d.ownerApprovalRequired ? "OWNER" : d.managerApprovalRequired ? "MANAGER" : "OPSIQ_DRAFT";
  const dataGap = d.missingData.length > 0 || d.status === "NEEDS_DATA";
  const approvalLevel: BridgeApprovalLevel = dataGap
    ? "NEEDS_DATA"
    : d.ownerApprovalRequired ? "OWNER_APPROVAL_REQUIRED" : approvalFor(d.approvalLevel, false);
  return mk({
    workspaceId: d.workspaceId, taskKey: `sop:${d.sourceCorrectionKey}`, sourceFamily: "SOP_CHECKLIST",
    sourceFindingKey: d.sourceCorrectionKey, executionRoute: "CREATE_SOP_CHECKLIST_TASK", actionOwner: owner, approvalLevel,
    requiredEvidence: ["the drafted SOP/checklist change", "evidence of adoption before it is marked done"],
    riskIfIgnored: d.reason, ownerVisibleSummary: d.proposedChangeTitle,
    evidenceRefs: [...d.supportingProofIds, ...d.supportingOperationalEventIds, ...d.supportingEscalationIds],
    severity: d.ownerApprovalRequired ? "HIGH" : "MEDIUM", priorityRank: 150 + (d.ownerApprovalRequired ? 0 : 1),
    reassess: `Re-check adherence to the ${d.proposedChangeTitle} change after ~${d.reviewAfterDays} days; reopen if the targeted failure recurs.`,
  });
}

// ── 4. Standalone training assignment (coaching — never discipline) ─────────────────────────────────────────

export function bridgeTrainingAssignment(t: TrainingAssignment): BridgedExecutionRoute {
  const dataGap = t.missingData.length > 0 || t.status === "NEEDS_DATA";
  const route: ExecutionRoute = dataGap ? "CREATE_MISSING_DATA_TASK" : "CREATE_TRAINING_TASK";
  const owner: BridgeActionOwner = dataGap ? "STAFF"
    : t.approvalLevel === "OWNER" ? "OWNER"
    : t.assignedRole === "staff" || t.assignedRole === "delivery" ? "STAFF" : "MANAGER";
  const approvalLevel: BridgeApprovalLevel = dataGap ? "NEEDS_DATA" : approvalFor(t.approvalLevel, false);
  const sourceKey = t.sourceCorrectionKey ?? t.sourceProcessFindingKey;
  return mk({
    workspaceId: t.workspaceId, taskKey: `tr:${sourceKey}:${t.trainingType}`, sourceFamily: "TRAINING",
    sourceFindingKey: sourceKey, executionRoute: route, actionOwner: owner, approvalLevel,
    requiredEvidence: dataGap ? (t.missingData.length ? t.missingData : ["the missing operational data"]) : ["proof the training/coaching was completed"],
    riskIfIgnored: t.reason, ownerVisibleSummary: t.ownerVisibleExplanation,
    evidenceRefs: [...t.supportingProofIds, ...t.supportingOperationalEventIds, ...t.supportingEscalationIds],
    severity: t.approvalLevel === "OWNER" ? "HIGH" : "MEDIUM", priorityRank: 250,
    reassess: `Verify the coaching landed after ~${t.reviewAfterDays} days: re-measure the targeted failure; reopen if it persists.`,
  });
}

// ── 5. SOP / training effectiveness — the ADHERENCE RE-CHECK (R3) ────────────────────────────────────────────

/** A verified improvement is monitor-only (never a false "it worked" claim); a worse/flat result is actionable. */
export function bridgeEffectivenessEvaluation(e: EffectivenessEvaluation): BridgedExecutionRoute {
  const evidenceRefs = [...e.supportingBeforeEventIds, ...e.supportingAfterEventIds, ...e.supportingProofIds];
  let route: ExecutionRoute; let owner: BridgeActionOwner; let approvalLevel: BridgeApprovalLevel;
  let severity: Severity; let reason: string | null = null; let evidence: string[];
  if (e.direction === "IMPROVED") {
    route = "MONITOR_ONLY"; owner = "NO_ACTION"; approvalLevel = "NEEDS_DATA"; severity = "LOW"; evidence = [];
    reason = "Verified adherent — the targeted metric improved over the review window; monitored, no new action.";
  } else if (e.direction === "INSUFFICIENT_DATA") {
    route = "CREATE_MISSING_DATA_TASK"; owner = "STAFF"; approvalLevel = "NEEDS_DATA"; severity = "LOW";
    evidence = e.missingData.length ? e.missingData : ["before/after evidence for the review window"];
  } else {
    // WORSENED / UNCHANGED — the fix has not proven itself; route the recommended next action, evidence-gated.
    severity = e.direction === "WORSENED" ? "HIGH" : "MEDIUM";
    if (e.recommendedNextAction === "ESCALATE") { route = "CREATE_OWNER_APPROVAL_TASK"; owner = "OWNER"; approvalLevel = "OWNER_APPROVAL_REQUIRED"; }
    else if (e.recommendedNextAction === "RETRAIN") { route = "CREATE_TRAINING_TASK"; owner = "MANAGER"; approvalLevel = "MANAGER_APPROVAL_REQUIRED"; }
    else if (e.recommendedNextAction === "MODIFY") { route = "CREATE_SOP_CHECKLIST_TASK"; owner = "OPSIQ_DRAFT"; approvalLevel = "MANAGER_APPROVAL_REQUIRED"; }
    else { route = "CREATE_REASSESSMENT_TASK"; owner = "MANAGER"; approvalLevel = "MANAGER_APPROVAL_REQUIRED"; }
    evidence = ["evidence of adherence and the re-check result (before/after)"];
  }
  return mk({
    workspaceId: e.workspaceId, taskKey: `eff:${e.sourceCorrectionKey}`, sourceFamily: "EFFECTIVENESS_RECHECK",
    sourceFindingKey: e.sourceCorrectionKey, executionRoute: route, actionOwner: owner, approvalLevel,
    requiredEvidence: evidence, riskIfIgnored: e.ownerVisibleSummary, ownerVisibleSummary: e.ownerVisibleSummary,
    evidenceRefs, severity, priorityRank: 120, reassess: REASSESS("whether the correction actually held"), notActionableReason: reason,
  });
}

// ── Combiner ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build every expansion route from the extra analyses, plus the collapse sets telling the caller which generic
 * process-correction routes are now superseded by a specific SOP/training route (so the same fix is not shown
 * twice). Deterministic; workspace-isolating (drops any route from another workspace).
 */
export function buildBridgeExpansion(inputs: BridgeExpansionInputs, workspaceId: string): { routes: BridgedExecutionRoute[]; collapse: BridgeCollapse } {
  const byKey = new Map<string, BridgedExecutionRoute>();
  const collapse: BridgeCollapse = { sopCorrectionKeys: new Set(), trainingCorrectionKeys: new Set() };
  // Workspace-isolating + first-wins dedupe (duplicate findings collapse to one governed route).
  const keep = (r: BridgedExecutionRoute) => { if (r.workspaceId === workspaceId && !byKey.has(r.taskKey)) byKey.set(r.taskKey, r); };

  for (const f of inputs.workload?.findings ?? []) keep(bridgeWorkloadFinding(f));
  for (const rec of inputs.capability?.recommendations ?? []) keep(bridgeCapabilityRecommendation(rec));
  for (const d of inputs.sop?.drafts ?? []) {
    const r = bridgeSopDraft(d);
    keep(r);
    if (r.workspaceId === workspaceId) collapse.sopCorrectionKeys.add(d.sourceCorrectionKey);
  }
  for (const t of inputs.training?.assignments ?? []) {
    const r = bridgeTrainingAssignment(t);
    keep(r);
    if (r.workspaceId === workspaceId && t.sourceCorrectionKey) collapse.trainingCorrectionKeys.add(t.sourceCorrectionKey);
  }
  for (const e of inputs.effectiveness?.evaluations ?? []) keep(bridgeEffectivenessEvaluation(e));

  return { routes: [...byKey.values()], collapse };
}
