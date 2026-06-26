/**
 * Module 41 — Owner Now View service (live wiring).
 *
 * Assembles a GuidanceContext from the LIVE command-and-control state (M4/M5 cash &
 * finance cycles, M8 employee workload, M9 owner workload, M10 capacity snapshots),
 * runs the pure guidance orchestrator, detects what changed versus the previous
 * persisted snapshot, builds a beginner explanation + concrete step-by-step guidance,
 * persists the new snapshot, and returns the owner-facing payload.
 *
 * Dependency-injected (DI) so it is unit-testable without a database; the route uses
 * the default Prisma-backed deps. All reads are workspace-scoped.
 */

import {
  buildOwnerNowView,
  type GuidanceContext,
  type OwnerNowView,
} from "@/domain/owner-guidance/guidance-orchestrator";
import {
  detectChanges,
  type BusinessStateSnapshot,
  type DetectedChange,
} from "@/domain/owner-guidance/change-detection";
import { IssueCategory, type BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import { buildBeginnerExplanation, type BeginnerExplanation } from "@/domain/owner-guidance/beginner-mode";

const SAFE_STATES = new Set(["SAFE", "WATCH"]);

// Deterministic proxies so change-detection has comparable numerics even when the
// underlying cycles expose only a categorical state. State transitions drive the deltas.
const RUNWAY_BY_STATE: Record<string, number> = { SAFE: 120, WATCH: 45, AT_RISK: 18, CRITICAL: 7, INSOLVENT_RISK: 2 };
const MARGIN_BY_STATE: Record<string, number> = { SAFE: 20, WATCH: 10, AT_RISK: 3, CRITICAL: -2, INSOLVENT_RISK: -10 };

interface CycleRow {
  cashflowState?: string;
  survivalState?: string;
  dataConfidenceScore: number;
}
interface EmployeeRow {
  overburdened: boolean;
  utilizationPct: number;
}
interface OwnerRow {
  overloaded: boolean;
  bottleneckRisk: boolean;
  dailyLoadPct: number;
}
interface CapacityRow {
  growthSafe: boolean;
  expansionTriggered: boolean;
  bottleneckUtilization: number;
}
interface GuidanceSnapshotRow {
  payload: unknown;
  cashRunwayDays: number;
  netMarginPct: number;
  complaintsCount: number;
  reworkCount: number;
  capacityUtilizationPct: number;
  staffOverloadPct: number;
  ownerLoadPct: number;
  churnRiskScore: number;
  supplierInventoryRiskScore: number;
  overdueProofCount: number;
  outcomeChecksDue: number;
  growthReadinessTier: string;
}

interface GuidanceDb {
  ownerCashflowCycle: { findFirst(args: unknown): Promise<CycleRow | null> };
  ownerFinanceCycle: { findFirst(args: unknown): Promise<CycleRow | null> };
  ownerEmployeeWorkloadSnapshot: { findFirst(args: unknown): Promise<EmployeeRow | null> };
  ownerWorkloadSnapshot: { findFirst(args: unknown): Promise<OwnerRow | null> };
  ownerCapacitySnapshot: { findFirst(args: unknown): Promise<CapacityRow | null> };
  ownerGuidanceSnapshot: {
    findFirst(args: unknown): Promise<GuidanceSnapshotRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface GuidanceDeps {
  db: GuidanceDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<GuidanceDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as GuidanceDb, uuid: () => randomUUID() };
}

function confidenceFromScore(score: number | null): EvidenceConfidenceLevel {
  if (score === null) return EvidenceConfidenceLevel.INSUFFICIENT;
  if (score >= 0.85) return EvidenceConfidenceLevel.VERIFIED;
  if (score >= 0.7) return EvidenceConfidenceLevel.STRONG;
  if (score >= 0.5) return EvidenceConfidenceLevel.MODERATE;
  if (score >= 0.3) return EvidenceConfidenceLevel.WEAK;
  return EvidenceConfidenceLevel.INSUFFICIENT;
}

function cashSeverity(state: string | undefined): BusinessIssue["severity"] {
  if (state === "INSOLVENT_RISK" || state === "CRITICAL") return "CRITICAL";
  if (state === "AT_RISK") return "HIGH";
  return "MEDIUM";
}

export interface OwnerNowViewPayload {
  view: OwnerNowView;
  whatChanged: DetectedChange[];
  beginnerExplanation: BeginnerExplanation;
  stepByStep: GuidanceStep[];
  generatedFromLiveData: boolean;
}

export interface GuidanceStep {
  issueId: string;
  businessFunction: BusinessFunction[];
  reasonNow: string;
  exactStep: string;
  assignedRole: string;
  proofRequired: boolean;
  proofType: string;
  deadline: string;
  expectedOutcome: string;
  rollbackTrigger: string;
  escalationRule: string;
}

// Concrete, non-generic step templates per issue category (pass the generic-output guard).
const STEP_TEMPLATES: Record<IssueCategory, Omit<GuidanceStep, "issueId" | "businessFunction">> = {
  [IssueCategory.CASH_DANGER]: {
    reasonNow: "cash cover is thin and overdue receivables are the fastest recoverable cash",
    exactStep: "Call each overdue customer today using the approved payment-follow-up script and log a promised payment date",
    assignedRole: "Billing Staff",
    proofRequired: true, proofType: "call_log",
    deadline: "today",
    expectedOutcome: "recover overdue cash or classify each account as a collection risk",
    rollbackTrigger: "if a customer disputes service quality, pause collection and route to owner review",
    escalationRule: "escalate to owner if payment slips beyond 48 hours or a dispute is raised",
  },
  [IssueCategory.CUSTOMER_SERVICE_FAILURE]: {
    reasonNow: "complaints/rework are rising and will compound if demand grows",
    exactStep: "Review the last 10 complaints, identify the top repeating failure, and fix that step in the delivery process",
    assignedRole: "Operations Lead",
    proofRequired: true, proofType: "checklist_completion",
    deadline: "within 3 days",
    expectedOutcome: "the top complaint cause is corrected and re-checked on the next 10 jobs",
    rollbackTrigger: "if complaints keep rising after the fix, escalate to a full process redesign",
    escalationRule: "escalate to owner if the same failure recurs after correction",
  },
  [IssueCategory.OVERLOAD]: {
    reasonNow: "staff/owner are already overloaded and new load raises failure risk",
    exactStep: "Move one non-critical recurring task off the overloaded person to a delegate or pause it this week",
    assignedRole: "Owner",
    proofRequired: true, proofType: "manager_confirmation",
    deadline: "this week",
    expectedOutcome: "the overloaded person's daily load returns below the sustainable threshold",
    rollbackTrigger: "if delegation fails quality checks, reassign and retrain before re-delegating",
    escalationRule: "escalate to owner if no task can be safely delegated",
  },
  [IssueCategory.PROFIT_LEAK]: {
    reasonNow: "margin is below the viable level on at least one service or segment",
    exactStep: "Identify the lowest-margin service line and either reprice it or stop discounting it this month",
    assignedRole: "Owner",
    proofRequired: true, proofType: "short_note",
    deadline: "this month",
    expectedOutcome: "the loss-making line is repriced or paused and margin recovers",
    rollbackTrigger: "if repricing loses key customers, revisit cost structure instead",
    escalationRule: "escalate to owner before changing prices for major accounts",
  },
  [IssueCategory.CAPACITY_BOTTLENECK]: {
    reasonNow: "a capacity bottleneck means overcommitting will break delivery",
    exactStep: "Cap intake at current safe capacity and schedule the bottleneck resource before accepting new work",
    assignedRole: "Operations Lead",
    proofRequired: true, proofType: "checklist_completion",
    deadline: "before next intake",
    expectedOutcome: "intake stays within the bottleneck's safe throughput",
    rollbackTrigger: "if backlog grows, pause intake and add capacity before resuming",
    escalationRule: "escalate to owner before committing to volume above safe capacity",
  },
  [IssueCategory.COMPLIANCE_SAFETY_RISK]: {
    reasonNow: "a compliance/tax/legal-sensitive issue is active and carries outside risk",
    exactStep: "Document the specific compliance concern and send it to your accountant/lawyer for review before acting",
    assignedRole: "Owner",
    proofRequired: true, proofType: "document",
    deadline: "before the regulatory deadline",
    expectedOutcome: "a qualified professional confirms the correct treatment",
    rollbackTrigger: "if the professional flags exposure, halt the related action immediately",
    escalationRule: "always route compliance/tax/legal decisions to a professional",
  },
  [IssueCategory.BLOCKED_EXECUTION]: {
    reasonNow: "an action is blocked and is holding up the result it was meant to deliver",
    exactStep: "Identify the specific blocker on the stalled action and assign the one person who can clear it today",
    assignedRole: "Owner",
    proofRequired: true, proofType: "manager_confirmation",
    deadline: "today",
    expectedOutcome: "the blocker is cleared and the action resumes",
    rollbackTrigger: "if the blocker cannot be cleared, re-scope or cancel the action",
    escalationRule: "escalate to owner if the blocker needs a decision or spend",
  },
  [IssueCategory.PENDING_PROOF_OUTCOME]: {
    reasonNow: "proof or an outcome check is due and learning is blocked until it is verified",
    exactStep: "Collect the outstanding proof for the completed action and record the verified outcome",
    assignedRole: "Assigned Staff",
    proofRequired: true, proofType: "before_after_image",
    deadline: "within 2 days",
    expectedOutcome: "the outcome is verified with proof and the loop can close",
    rollbackTrigger: "if proof shows the action failed, trigger redesign instead of closing",
    escalationRule: "escalate to owner if proof is missing past the due date",
  },
  [IssueCategory.GROWTH_OPPORTUNITY]: {
    reasonNow: "a growth opportunity exists but is only safe once stabilization gates pass",
    exactStep: "Confirm cash, margin, capacity, workload and quality gates all pass before committing any growth spend",
    assignedRole: "Owner",
    proofRequired: true, proofType: "short_note",
    deadline: "after gates pass",
    expectedOutcome: "growth proceeds only on a stable base",
    rollbackTrigger: "if any gate fails after launch, pause growth and re-stabilize",
    escalationRule: "growth always requires explicit owner approval",
  },
  [IssueCategory.PROCESS_IMPROVEMENT]: {
    reasonNow: "a process improvement would reduce recurring friction",
    exactStep: "Write the one missing SOP step for the most error-prone task and have staff follow it on the next job",
    assignedRole: "Operations Lead",
    proofRequired: true, proofType: "checklist_completion",
    deadline: "within 1 week",
    expectedOutcome: "the task is done to the documented standard and errors drop",
    rollbackTrigger: "if the SOP step is impractical, revise it with the staff who do the work",
    escalationRule: "escalate to owner only if the change affects customer commitments",
  },
};

/** Build the live GuidanceContext + comparable state snapshot from persisted module data. */
export async function assembleGuidanceContext(
  workspaceId: string,
  businessId: string | null,
  deps: GuidanceDeps
): Promise<{ ctx: GuidanceContext; state: BusinessStateSnapshot }> {
  const scope = businessId ? { workspaceId, businessId } : { workspaceId };
  const order = { createdAt: "desc" as const };
  const [cash, fin, emp, own, cap] = await Promise.all([
    deps.db.ownerCashflowCycle.findFirst({ where: scope, orderBy: order, select: { cashflowState: true, dataConfidenceScore: true } }),
    deps.db.ownerFinanceCycle.findFirst({ where: scope, orderBy: order, select: { survivalState: true, dataConfidenceScore: true } }),
    deps.db.ownerEmployeeWorkloadSnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { overburdened: true, utilizationPct: true } }),
    deps.db.ownerWorkloadSnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { overloaded: true, bottleneckRisk: true, dailyLoadPct: true } }),
    deps.db.ownerCapacitySnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { growthSafe: true, expansionTriggered: true, bottleneckUtilization: true } }),
  ]);

  const cashState = cash?.cashflowState;
  const finState = fin?.survivalState;
  const cashSafe = !!cashState && !!finState && SAFE_STATES.has(cashState) && SAFE_STATES.has(finState);
  const staffOverloaded = emp?.overburdened === true;
  const ownerOverloaded = own?.overloaded === true || own?.bottleneckRisk === true;
  const capacityGrowthSafe = cap?.growthSafe === true;
  const growthGatePassed = cashSafe && capacityGrowthSafe;

  const confScore =
    cash && fin ? Math.min(cash.dataConfidenceScore, fin.dataConfidenceScore)
      : cash ? cash.dataConfidenceScore
      : fin ? fin.dataConfidenceScore
      : null;
  const dataConfidence = confidenceFromScore(confScore);

  // Named, smallest-useful-first missing data — never a generic warning.
  const missingCriticalData: string[] = [];
  if (!cash) missingCriticalData.push("latest cash position (cash on hand + obligations)");
  if (!fin) missingCriticalData.push("latest profit/margin figures");

  const issues: BusinessIssue[] = [];
  if (!cashSafe && (cashState || finState)) {
    const sev = cashSeverity(cashState && !SAFE_STATES.has(cashState) ? cashState : finState);
    issues.push({
      id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
      severity: sev, headline: `Cash survival is ${cashState ?? "unknown"} / finance ${finState ?? "unknown"}`,
      requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH",
    });
  }
  if (finState && !SAFE_STATES.has(finState)) {
    issues.push({
      id: "margin", category: IssueCategory.PROFIT_LEAK, businessFunction: [BusinessFunction.PROFITABILITY],
      severity: finState === "CRITICAL" || finState === "INSOLVENT_RISK" ? "HIGH" : "MEDIUM",
      headline: "Profit/margin is below a safe level", requiresOwnerAction: false,
    });
  }
  if (staffOverloaded || ownerOverloaded) {
    issues.push({
      id: "overload", category: IssueCategory.OVERLOAD,
      businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD, BusinessFunction.OWNER_WORKLOAD],
      severity: "HIGH", headline: "Staff/owner workload is over the sustainable limit",
      requiresOwnerAction: ownerOverloaded,
    });
  }
  if (cap && (!cap.growthSafe || cap.expansionTriggered)) {
    const sev: BusinessIssue["severity"] = cap.bottleneckUtilization >= 0.95 ? "CRITICAL" : cap.bottleneckUtilization >= 0.85 ? "HIGH" : "MEDIUM";
    issues.push({
      id: "capacity", category: IssueCategory.CAPACITY_BOTTLENECK, businessFunction: [BusinessFunction.CAPACITY],
      severity: sev, headline: `Capacity bottleneck at ${Math.round(cap.bottleneckUtilization * 100)}% utilization`,
      requiresOwnerAction: sev === "CRITICAL",
    });
  }

  const ctx: GuidanceContext = {
    workspaceId, businessId: businessId ?? "", archetype: null,
    dataConfidence, missingCriticalData, issues,
    changes: [], // filled after diffing against the previous snapshot
    growthGatePassed, cashSafe, staffOverloaded, ownerOverloaded,
    unsafeToGuide: false,
  };

  const state: BusinessStateSnapshot = {
    cashRunwayDays: cashState ? RUNWAY_BY_STATE[cashState] ?? 0 : 0,
    netMarginPct: finState ? MARGIN_BY_STATE[finState] ?? 0 : 0,
    complaintsCount: 0,
    reworkCount: 0,
    capacityUtilizationPct: cap ? cap.bottleneckUtilization * 100 : 0,
    staffOverloadPct: emp?.utilizationPct ?? 0,
    ownerLoadPct: own?.dailyLoadPct ?? 0,
    churnRiskScore: 0,
    supplierInventoryRiskScore: 0,
    overdueProofCount: 0,
    outcomeChecksDue: 0,
    growthReadinessTier: growthGatePassed ? "GROWTH_READY" : "STABILIZE_FIRST",
  };

  return { ctx, state };
}

function buildSteps(topIssues: BusinessIssue[]): GuidanceStep[] {
  return topIssues.map((i) => {
    const t = STEP_TEMPLATES[i.category];
    return { issueId: i.id, businessFunction: i.businessFunction, ...t };
  });
}

function buildBeginner(view: OwnerNowView): BeginnerExplanation {
  const headline = view.topOwnerActions[0]?.headline ?? "Your business has no urgent issues right now";
  const whatToDoFirst = view.topOwnerActions.length > 0
    ? buildSteps(view.topOwnerActions).map((s) => s.exactStep)
    : ["Keep tracking cash and complaints"];
  const whatNotToDo = view.actionsToAvoid.length > 0
    ? view.actionsToAvoid.map((a) => a.avoid)
    : ["Do not take on risk you cannot measure yet"];
  return buildBeginnerExplanation({
    headline,
    businessFunction: view.topOwnerActions[0]?.businessFunction ?? [BusinessFunction.CASH_FLOW],
    whatToDoFirst,
    whatNotToDo,
    proofToCollect: buildSteps(view.topOwnerActions).map((s) => s.proofType),
    howToKnowItWorked: "the most urgent issue's status improves on the next check",
    ifIgnoredConsequence: view.cashDangerStatus === "CRITICAL"
      ? "you may run out of cash without warning"
      : "the most urgent problem will get worse and harder to fix",
    dataIsWeak: view.confidenceCapped,
  });
}

/**
 * Produce the live Owner Now View: assemble context, diff against the previous
 * snapshot, run the orchestrator, build beginner + step-by-step guidance, persist.
 */
export async function getOwnerNowView(
  workspaceId: string,
  businessId: string | null,
  injected?: GuidanceDeps
): Promise<OwnerNowViewPayload> {
  const deps = injected ?? (await resolveDefaultDeps());
  const { ctx, state } = await assembleGuidanceContext(workspaceId, businessId, deps);

  // Diff against the previous persisted snapshot to populate "what changed".
  const prev = await deps.db.ownerGuidanceSnapshot.findFirst({
    where: businessId ? { workspaceId, businessId } : { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  const changes: DetectedChange[] = prev ? detectChanges(prevState(prev), state) : [];

  const view = buildOwnerNowView({ ...ctx, changes });
  const stepByStep = buildSteps(view.topOwnerActions);
  const beginnerExplanation = buildBeginner(view);

  await deps.db.ownerGuidanceSnapshot.create({
    data: {
      id: deps.uuid(),
      workspaceId,
      businessId: businessId ?? null,
      classification: view.classification,
      cashSafe: ctx.cashSafe,
      growthGatePassed: ctx.growthGatePassed,
      staffOverloaded: ctx.staffOverloaded,
      ownerOverloaded: ctx.ownerOverloaded,
      dataConfidence: ctx.dataConfidence,
      topIssueCount: view.topOwnerActions.length,
      missingDataCount: view.missingDataRequests.length,
      cashRunwayDays: state.cashRunwayDays,
      netMarginPct: state.netMarginPct,
      complaintsCount: state.complaintsCount,
      reworkCount: state.reworkCount,
      capacityUtilizationPct: state.capacityUtilizationPct,
      staffOverloadPct: state.staffOverloadPct,
      ownerLoadPct: state.ownerLoadPct,
      churnRiskScore: state.churnRiskScore,
      supplierInventoryRiskScore: state.supplierInventoryRiskScore,
      overdueProofCount: state.overdueProofCount,
      outcomeChecksDue: state.outcomeChecksDue,
      growthReadinessTier: state.growthReadinessTier,
      payload: { view, whatChanged: changes, stepByStep, beginnerExplanation } as unknown as Record<string, unknown>,
    },
  });

  return { view, whatChanged: changes, beginnerExplanation, stepByStep, generatedFromLiveData: true };
}

function prevState(row: GuidanceSnapshotRow): BusinessStateSnapshot {
  return {
    cashRunwayDays: row.cashRunwayDays,
    netMarginPct: row.netMarginPct,
    complaintsCount: row.complaintsCount,
    reworkCount: row.reworkCount,
    capacityUtilizationPct: row.capacityUtilizationPct,
    staffOverloadPct: row.staffOverloadPct,
    ownerLoadPct: row.ownerLoadPct,
    churnRiskScore: row.churnRiskScore,
    supplierInventoryRiskScore: row.supplierInventoryRiskScore,
    overdueProofCount: row.overdueProofCount,
    outcomeChecksDue: row.outcomeChecksDue,
    growthReadinessTier: row.growthReadinessTier,
  };
}
