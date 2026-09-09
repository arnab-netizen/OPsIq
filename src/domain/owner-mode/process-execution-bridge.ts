/**
 * Process-Correction Execution Bridge (PASS 20) — pure domain.
 *
 * The missing leg of Level 3: it converts already-diagnosed cockpit findings into GOVERNED EXECUTION
 * ROUTES so the owner no longer has to manually re-key a diagnosis into a separate action form. It consumes
 * the existing analyses (process-correction routing + cash/profit protection) and, for each finding, emits a
 * single bridged route carrying the full governed loop: executionRoute → actionOwner → approvalLevel →
 * requiredEvidence → completionCriteria → reassessmentTrigger → riskIfIgnored → ownerVisibleSummary.
 *
 * Pure + deterministic. It never executes anything and never fabricates a figure — material/owner decisions
 * stay owner-gated, missing data routes to a data task (never a guess), and a data-insufficient finding
 * becomes an explicit MONITOR_ONLY with a stated reason (never silently dropped).
 */

import type { ApprovalLevel } from "./process-intelligence";
import type { ProcessCorrection, ProcessCorrectionRouting, CorrectionType } from "./bottleneck-correction-routing";
import type { CashProfitProtectionAnalysis, CashProfitSignal } from "./cash-profit-protection";

export type ExecutionRoute =
  | "CREATE_CORRECTION_TASK"
  | "CREATE_SOP_CHECKLIST_TASK"
  | "CREATE_TRAINING_TASK"
  | "CREATE_REASSESSMENT_TASK"
  | "CREATE_EVIDENCE_REQUEST"
  | "CREATE_OWNER_APPROVAL_TASK"
  | "CREATE_MANAGER_TASK"
  | "CREATE_STAFF_TASK"
  | "CREATE_MISSING_DATA_TASK"
  | "BLOCK_UNSAFE_ACTION"
  | "MONITOR_ONLY";

export type BridgeActionOwner = "OWNER" | "MANAGER" | "STAFF" | "OPSIQ_DRAFT" | "EXTERNAL_ADVISOR" | "NO_ACTION";

export type BridgeApprovalLevel =
  | "AUTO_ALLOWED"
  | "MANAGER_APPROVAL_REQUIRED"
  | "OWNER_APPROVAL_REQUIRED"
  | "NEVER_AUTO"
  | "NEEDS_DATA";

export type BridgeSourceFamily =
  | "PROCESS_CORRECTION"
  | "CASH_PROFIT"
  | "WORKLOAD_REDUCTION"
  | "CAPABILITY_GAP"
  | "SOP_CHECKLIST"
  | "TRAINING"
  | "EFFECTIVENESS_RECHECK";

/** The bridged execution route — one per bridged finding. Flat + serialisable for the UI, tests, and DB. */
export interface BridgedExecutionRoute {
  workspaceId: string;
  /**
   * Which business this route belongs to; null for a genuinely workspace-level route (no expansion
   * family currently produces one — see the callers in process-execution-bridge-expansion.ts). This
   * is NOT decorative: taskKey embeds it (see below) precisely so two businesses in the same
   * workspace can never collide on the same persisted ProcessExecutionTask row.
   */
  businessId: string | null;
  /**
   * Stable dedupe key: one route per source finding (never duplicated across re-evaluations).
   * Business-scoped routes (PROCESS_CORRECTION, CASH_PROFIT) embed businessId directly in the key
   * (e.g. "cp:<businessId>:MISSING_UNIT_ECONOMICS") so the SAME underlying signal type in two
   * different businesses in one workspace can never persist to or be started/completed via the
   * same ProcessExecutionTask row -- taskKey alone was not tenant-safe before this (see PASS 25's
   * businessInWorkspace(), which only guarded reassessment linkage, not task identity itself).
   */
  taskKey: string;
  sourceFamily: BridgeSourceFamily;
  sourceFindingKey: string;
  executionRoute: ExecutionRoute;
  actionOwner: BridgeActionOwner;
  approvalLevel: BridgeApprovalLevel;
  requiredEvidence: string[];
  completionCriteria: string;
  reassessmentTrigger: string;
  riskIfIgnored: string;
  ownerVisibleSummary: string;
  /** Why a MONITOR_ONLY / BLOCK route created no actionable task yet (empty for actionable routes). */
  notActionableReason: string | null;
  evidenceRefs: string[];
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priorityRank: number;
  /** Persisted lifecycle status; PROPOSED until the owner acts. The caller overrides this from the DB. */
  status: string;
  /** Whether the owner can start this task right now (actionable route + startable status). */
  canStart: boolean;
}

export interface ProcessExecutionBridgeAnalysis {
  workspaceId: string;
  routes: BridgedExecutionRoute[];
  topRoute: BridgedExecutionRoute | null;
  summary: { total: number; ownerApproval: number; managerStaff: number; dataTasks: number; monitorOnly: number };
  evaluatedAt: string;
}

const SEVERITY_RANK: Record<BridgedExecutionRoute["severity"], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const NON_ACTIONABLE_ROUTES = new Set<ExecutionRoute>(["MONITOR_ONLY", "BLOCK_UNSAFE_ACTION"]);
const STARTABLE_STATUSES = new Set<string>(["PROPOSED", "NEEDS_DATA", "BLOCKED"]);

/** Whether the owner can start this route now — pure domain, no DB required. */
export function computeCanStart(executionRoute: ExecutionRoute, status: string): boolean {
  return !NON_ACTIONABLE_ROUTES.has(executionRoute) && STARTABLE_STATUSES.has(status);
}

/** Approval level → bridge approval, honestly. STAFF-floor operational work is safe/reversible (AUTO_ALLOWED).
 *  Exported so the PASS 23 expansion bridges (workload/capability/SOP/training/effectiveness) map approval the
 *  same way — one governed translation, never a second interpretation. */
export function approvalFor(level: ApprovalLevel, hasMissingData: boolean): BridgeApprovalLevel {
  if (hasMissingData) return "NEEDS_DATA";
  switch (level) {
    case "OWNER": return "OWNER_APPROVAL_REQUIRED";
    case "MANAGER": return "MANAGER_APPROVAL_REQUIRED";
    case "STAFF": return "AUTO_ALLOWED";
  }
}

/** correctionType → executionRoute + default action owner. The correction's governed approval floor still wins. */
const CORRECTION_ROUTE: Record<CorrectionType, { route: ExecutionRoute; owner: BridgeActionOwner }> = {
  REVIEW_PROCESS_STEP: { route: "CREATE_CORRECTION_TASK", owner: "MANAGER" },
  UPDATE_CHECKLIST: { route: "CREATE_SOP_CHECKLIST_TASK", owner: "OPSIQ_DRAFT" },
  ASSIGN_TRAINING_REVIEW: { route: "CREATE_TRAINING_TASK", owner: "MANAGER" },
  ESCALATE_TO_MANAGER: { route: "CREATE_MANAGER_TASK", owner: "MANAGER" },
  ESCALATE_TO_OWNER: { route: "CREATE_OWNER_APPROVAL_TASK", owner: "OWNER" },
  RESOLVE_OPERATIONAL_EVENT: { route: "CREATE_REASSESSMENT_TASK", owner: "MANAGER" },
  REQUIRE_FRESH_PROOF: { route: "CREATE_EVIDENCE_REQUEST", owner: "OPSIQ_DRAFT" },
  COLLECT_MISSING_DATA: { route: "CREATE_MISSING_DATA_TASK", owner: "STAFF" },
  NO_ACTION_DATA_INSUFFICIENT: { route: "MONITOR_ONLY", owner: "NO_ACTION" },
};

/** Completion criterion per route. Exported so the PASS 23 expansion bridges reuse the identical governed text. */
export const COMPLETION_BY_ROUTE: Record<ExecutionRoute, string> = {
  CREATE_CORRECTION_TASK: "The corrected process step is verified working and re-checked at the next review window.",
  CREATE_SOP_CHECKLIST_TASK: "The updated SOP/checklist is approved by the owner and adopted; adherence is re-checked.",
  CREATE_TRAINING_TASK: "The assigned training is completed with proof; the targeted failure is re-measured.",
  CREATE_REASSESSMENT_TASK: "The reassessment is worked through and the underlying operational event is resolved or dismissed with a reason.",
  CREATE_EVIDENCE_REQUEST: "Fresh, checked evidence is submitted and passes the proof gate before the work is re-accepted.",
  CREATE_OWNER_APPROVAL_TASK: "The owner reviews the evidence and records an approve/decline decision with a note.",
  CREATE_MANAGER_TASK: "The manager completes the operational correction and records the result.",
  CREATE_STAFF_TASK: "The staff member completes the task and submits the required proof.",
  CREATE_MISSING_DATA_TASK: "The missing data is captured and the finding is re-evaluated with real inputs.",
  BLOCK_UNSAFE_ACTION: "No completion — the unsafe action is blocked and stays owner-controlled.",
  MONITOR_ONLY: "No completion required yet — monitored until enough evidence exists to act.",
};

/** Bridge one process correction into a governed execution route. */
function bridgeCorrection(c: ProcessCorrection, businessId: string | null): BridgedExecutionRoute {
  const hasMissingData = c.missingData.length > 0;
  const mapped = CORRECTION_ROUTE[c.correctionType];
  // A correction whose governed floor is OWNER is always an owner-approval task, whatever its type default.
  const route: ExecutionRoute =
    c.correctionType !== "NO_ACTION_DATA_INSUFFICIENT" && c.requiredApprovalLevel === "OWNER" && mapped.route !== "CREATE_OWNER_APPROVAL_TASK"
      ? "CREATE_OWNER_APPROVAL_TASK"
      : mapped.route;
  const owner: BridgeActionOwner =
    route === "CREATE_OWNER_APPROVAL_TASK" ? "OWNER"
      : c.correctionType === "COLLECT_MISSING_DATA" ? (c.targetActorId ? "STAFF" : "OPSIQ_DRAFT")
      : c.targetManagerId ? "MANAGER" : mapped.owner;
  const approvalLevel = route === "MONITOR_ONLY" ? "NEEDS_DATA" : approvalFor(c.requiredApprovalLevel, hasMissingData);
  const evidenceRefs = [...c.supportingProofIds, ...c.supportingOperationalEventIds, ...c.supportingEscalationIds, ...c.supportingAdjudicationIds];

  const requiredEvidence: string[] =
    route === "MONITOR_ONLY" ? []
      : route === "CREATE_MISSING_DATA_TASK" ? c.missingData
      : route === "CREATE_EVIDENCE_REQUEST" ? ["fresh checked proof for the affected job"]
      : route === "CREATE_SOP_CHECKLIST_TASK" ? ["the drafted SOP/checklist change", "owner approval before adoption"]
      : route === "CREATE_TRAINING_TASK" ? ["proof the training was completed"]
      : route === "CREATE_OWNER_APPROVAL_TASK" ? ["the supporting evidence for the owner decision"]
      : ["evidence the correction was carried out"];

  const notActionableReason = route === "MONITOR_ONLY"
    ? `Data-insufficient: ${c.missingData.join("; ") || "not enough linked evidence to route an action yet"}.`
    : null;

  return {
    workspaceId: c.workspaceId,
    businessId,
    taskKey: businessId ? `pc:${businessId}:${c.correctionId}` : `pc:${c.correctionId}`,
    sourceFamily: "PROCESS_CORRECTION",
    sourceFindingKey: c.correctionId,
    executionRoute: route,
    actionOwner: owner,
    approvalLevel,
    requiredEvidence,
    completionCriteria: COMPLETION_BY_ROUTE[route],
    reassessmentTrigger: `Re-evaluate the ${c.sourceFindingType.replace(/_/g, " ").toLowerCase()} finding at the next owner review; reopen if the breakdown persists or the metric worsens.`,
    riskIfIgnored: c.rationale,
    ownerVisibleSummary: `${c.title} — ${c.instruction}`,
    notActionableReason,
    evidenceRefs,
    severity: c.severity,
    priorityRank: c.priorityRank,
    status: "PROPOSED",
    canStart: computeCanStart(route, "PROPOSED"),
  };
}

/** Cash/profit signals that are pure data gaps route to a missing-data task; material ones to owner approval. */
const CASH_DATA_SIGNALS = new Set(["MISSING_UNIT_ECONOMICS", "PROFIT_DATA_INSUFFICIENT"]);

function bridgeCashSignal(s: CashProfitSignal, rank: number, businessId: string | null): BridgedExecutionRoute {
  const isDataGap = CASH_DATA_SIGNALS.has(s.signalType);
  const route: ExecutionRoute = isDataGap ? "CREATE_MISSING_DATA_TASK" : s.requiresOwnerReview ? "CREATE_OWNER_APPROVAL_TASK" : "CREATE_MANAGER_TASK";
  const owner: BridgeActionOwner = isDataGap ? "STAFF" : s.requiresOwnerReview ? "OWNER" : "MANAGER";
  const approvalLevel: BridgeApprovalLevel = isDataGap ? "NEEDS_DATA" : s.requiresOwnerReview ? "OWNER_APPROVAL_REQUIRED" : "MANAGER_APPROVAL_REQUIRED";
  return {
    workspaceId: s.workspaceId,
    businessId,
    taskKey: businessId ? `cp:${businessId}:${s.signalType}` : `cp:${s.signalType}`,
    sourceFamily: "CASH_PROFIT",
    sourceFindingKey: s.signalType,
    executionRoute: route,
    actionOwner: owner,
    approvalLevel,
    requiredEvidence: isDataGap ? s.missingData : ["the financial figures behind this protective action"],
    completionCriteria: COMPLETION_BY_ROUTE[route],
    reassessmentTrigger: "Re-check this cash/profit signal once the owner acts or the missing financial data is captured.",
    riskIfIgnored: s.ownerExplanation,
    ownerVisibleSummary: `${s.title} — protective action: ${s.protectiveAction.replace(/_/g, " ").toLowerCase()}`,
    notActionableReason: null,
    evidenceRefs: [...s.supportingProofIds, ...s.supportingOperationalEventIds, ...s.supportingFinancialSnapshotIds],
    severity: s.severity,
    priorityRank: 100 + rank, // cash signals rank after the top process corrections unless critical (see sort)
    status: "PROPOSED",
    canStart: computeCanStart(route, "PROPOSED"),
  };
}

/** PASS 23 expansion routes (workload/capability/SOP/training/effectiveness) already built by
 *  buildBridgeExpansion, plus the collapse sets telling the bridge which generic correction routes a specific
 *  SOP/training route now supersedes. Passed in (not imported) so this stays a pure, cycle-free data merge. */
export interface BridgeExpansion {
  routes: BridgedExecutionRoute[];
  collapse: { sopCorrectionKeys: Set<string>; trainingCorrectionKeys: Set<string> };
}

/**
 * Build the bridge. Deduplicates by taskKey (one route per finding), orders most-severe/highest-priority
 * first, and never emits an unsafe auto-execution: material/owner findings stay OWNER_APPROVAL_REQUIRED and
 * data gaps stay NEEDS_DATA. `topRoute` is the single action the owner should see first.
 *
 * PASS 23: an optional `expansion` merges the workload/capability/SOP/training/effectiveness routes into the
 * same governed list. A generic correction route (CREATE_SOP_CHECKLIST_TASK / CREATE_TRAINING_TASK) is COLLAPSED
 * when a specific SOP/training route already covers the same correction, so the same fix is never shown twice.
 */
export function buildProcessExecutionBridge(
  routing: ProcessCorrectionRouting | null,
  cashProfit: CashProfitProtectionAnalysis | null,
  workspaceId: string,
  evaluatedAt: string,
  expansion?: BridgeExpansion | null,
  /**
   * The active business this bridge is being computed for. Threaded into every
   * PROCESS_CORRECTION/CASH_PROFIT route's taskKey (see bridgeCorrection/bridgeCashSignal) so the
   * persisted ProcessExecutionTask row for a given finding can never be shared between two
   * businesses in the same workspace. null is valid (a zero-active-business or workspace-level
   * call) and produces the pre-existing, business-unscoped taskKey shape.
   */
  businessId: string | null = null,
): ProcessExecutionBridgeAnalysis {
  const collapseSop = expansion?.collapse.sopCorrectionKeys ?? new Set<string>();
  const collapseTraining = expansion?.collapse.trainingCorrectionKeys ?? new Set<string>();
  const byKey = new Map<string, BridgedExecutionRoute>();
  for (const c of routing?.corrections ?? []) {
    const r = bridgeCorrection(c, businessId);
    // Collapse: drop the generic correction route when a specific SOP/training route already covers this fix.
    if (r.executionRoute === "CREATE_SOP_CHECKLIST_TASK" && collapseSop.has(r.sourceFindingKey)) continue;
    if (r.executionRoute === "CREATE_TRAINING_TASK" && collapseTraining.has(r.sourceFindingKey)) continue;
    if (!byKey.has(r.taskKey)) byKey.set(r.taskKey, r);
  }
  (cashProfit?.signals ?? []).forEach((s, i) => {
    const r = bridgeCashSignal(s, i, businessId);
    if (!byKey.has(r.taskKey)) byKey.set(r.taskKey, r);
  });
  for (const r of expansion?.routes ?? []) {
    if (r.workspaceId === workspaceId && !byKey.has(r.taskKey)) byKey.set(r.taskKey, r);
  }

  const routes = [...byKey.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.priorityRank - b.priorityRank,
  );
  // Recompute canStart after sort so any caller-applied status overrides take effect correctly.
  for (const r of routes) {
    r.canStart = computeCanStart(r.executionRoute, r.status);
  }
  // The top action the owner acts on is the most severe ACTIONABLE route (monitor-only never leads).
  const topRoute = routes.find((r) => r.executionRoute !== "MONITOR_ONLY") ?? routes[0] ?? null;

  const summary = {
    total: routes.length,
    ownerApproval: routes.filter((r) => r.approvalLevel === "OWNER_APPROVAL_REQUIRED").length,
    managerStaff: routes.filter((r) => r.approvalLevel === "MANAGER_APPROVAL_REQUIRED" || r.approvalLevel === "AUTO_ALLOWED").length,
    dataTasks: routes.filter((r) => r.approvalLevel === "NEEDS_DATA").length,
    monitorOnly: routes.filter((r) => r.executionRoute === "MONITOR_ONLY").length,
  };

  return { workspaceId, routes, topRoute, summary, evaluatedAt };
}
