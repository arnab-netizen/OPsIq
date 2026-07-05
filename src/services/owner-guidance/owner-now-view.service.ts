/**
 * Module 41 — Owner Now View service (live wiring).
 *
 * Assembles a GuidanceContext from the LIVE command-and-control state and runs the
 * pure guidance orchestrator. Live sources (all workspace-scoped):
 *   - M4/M5 cash & finance survival  → ownerCashflowCycle / ownerFinanceCycle
 *   - M8 employee + M9 owner workload → owner*WorkloadSnapshot
 *   - M10 capacity                    → ownerCapacitySnapshot
 *   - complaints / rework / churn     → ownerMetricSnapshot (M15 CoPQ, M17/M20 retention)
 *   - supplier / inventory risk       → ownerSupplierInventorySnapshot (M23)
 *   - proof overdue                   → proof (proof FSM)
 *   - outcome / reassessment due      → ownerActionOutcome / ownerReassessmentEvent
 *   - archetype                       → ownerBusiness.businessType (M29/30/31/32 packs)
 *
 * Detects what changed vs the previous persisted snapshot, builds a beginner
 * explanation + concrete archetype-aware step-by-step guidance, persists, and
 * returns the owner-facing payload. DI for unit-testability.
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
import { archetypeGuidance, type ArchetypeGuidance } from "@/domain/owner-guidance/archetype-guidance";
import { computeOwnerWorkloadBudget, type OwnerWorkloadBudget } from "@/domain/owner-guidance/owner-workload-budget";
import { identifyConstraints, type ConstraintFinding, type ConstraintSignals } from "@/domain/owner-mode/constraint-engine";
import { identifyProfitLeaks, type ProfitLeakFinding, type ProfitLeakSignals } from "@/domain/owner-mode/profit-leak-radar";
import { aggregateProofEvents, identifyGamingSignals, type GamingSignal, type ProofEventRow } from "@/domain/owner-mode/anti-gaming-analytics";
import { aggregateCredibility, buildEvidenceCredibility, type CredibilityFinding, type CredibilityProofRow } from "@/domain/owner-mode/evidence-credibility-graph";
import { evaluateBusinessControlSLOs, type BusinessControlHealth } from "@/domain/owner-mode/business-control-slo";
import type { ControlCorrelationReport } from "@/domain/owner-mode/control-correlation";
import type { ProofOutcomeLinkageReport } from "@/domain/owner-mode/proof-outcome-linkage";
import type { DisputeRiskAnalysis } from "@/domain/owner-mode/dispute-risk";
import type { ComplaintReworkAnalysis } from "@/domain/execution/complaint-rework";

const SAFE_STATES = new Set(["SAFE", "WATCH"]);
const OVERDUE_PROOF_STATUSES = ["REQUIRED", "PENDING_SUBMISSION", "RESUBMISSION_REQUIRED", "DISPUTED", "NEEDS_HUMAN_REVIEW"];
const OPEN_OUTCOME_STATUS = "too_early_to_judge";
const PROOF_OVERDUE_AGE_MS = 48 * 60 * 60 * 1000;

const RUNWAY_BY_STATE: Record<string, number> = { SAFE: 120, WATCH: 45, AT_RISK: 18, CRITICAL: 7, INSOLVENT_RISK: 2 };
const MARGIN_BY_STATE: Record<string, number> = { SAFE: 20, WATCH: 10, AT_RISK: 3, CRITICAL: -2, INSOLVENT_RISK: -10 };

interface CycleRow { cashflowState?: string; survivalState?: string; dataConfidenceScore: number }
interface EmployeeRow { overburdened: boolean; utilizationPct: number }
interface OwnerRow { overloaded: boolean; bottleneckRisk: boolean; dailyLoadPct: number }
interface CapacityRow { growthSafe: boolean; expansionTriggered: boolean; bottleneckUtilization: number }
interface MetricRow {
  complaintCount: number | null; rewashCount: number | null; refundAmount: number | null;
  newCustomers: number | null; repeatCustomers: number | null; revenue: number | null;
  discountAmount: number | null; b2bRevenue: number | null;
}
interface SupplierRow { worstStockoutRisk: string; riskScore: number; supplyCutoffRisk: boolean; belowReorderCount: number }
interface BusinessRow { businessType: string }
interface GuidanceSnapshotRow extends BusinessStateSnapshot { payload: unknown }

interface GuidanceDb {
  ownerCashflowCycle: { findFirst(args: unknown): Promise<CycleRow | null> };
  ownerFinanceCycle: { findFirst(args: unknown): Promise<CycleRow | null> };
  ownerEmployeeWorkloadSnapshot: { findFirst(args: unknown): Promise<EmployeeRow | null> };
  ownerWorkloadSnapshot: { findFirst(args: unknown): Promise<OwnerRow | null> };
  ownerCapacitySnapshot: { findFirst(args: unknown): Promise<CapacityRow | null> };
  ownerMetricSnapshot: { findFirst(args: unknown): Promise<MetricRow | null> };
  ownerSupplierInventorySnapshot: { findFirst(args: unknown): Promise<SupplierRow | null> };
  ownerBusiness: { findFirst(args: unknown): Promise<BusinessRow | null> };
  proof: {
    count(args: unknown): Promise<number>;
    /** Optional — present on the live client; enables anti-gaming + credibility analytics. */
    findMany?(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<CredibilityProofRow[]>;
  };
  ownerActionOutcome: { count(args: unknown): Promise<number> };
  ownerReassessmentEvent: { count(args: unknown): Promise<number> };
  ownerGuidanceSnapshot: {
    findFirst(args: unknown): Promise<GuidanceSnapshotRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface GuidanceDeps {
  db: GuidanceDb;
  uuid: () => string;
  now: () => number;
  /**
   * Optional — the live control-correlation report source. Present on the live path (wired to
   * getControlCorrelations); absent on a fake-DI unit test, in which case the correlation-backed
   * SLOs (AUDIT_DURABILITY / REASSESSMENT_LATENCY / SHOCK_HANDLING_LATENCY) stay NOT_MEASURABLE.
   */
  correlations?: (workspaceId: string) => Promise<ControlCorrelationReport>;
  /**
   * Optional — the live proof→outcome linkage source (accepted-proof contradiction/rework).
   * Present on the live path; absent on a fake-DI unit test, in which case the credibility
   * contradiction signal + PROOF_OUTCOME_INTEGRITY SLO stay honestly unlinked/NOT_MEASURABLE.
   */
  proofOutcome?: (workspaceId: string) => Promise<ProofOutcomeLinkageReport>;
  /**
   * Optional — the live dispute→risk source (maps governed proof-dispute categories into
   * Profit-Leak + Constraint signals). Present on the live path; absent on a fake-DI unit test,
   * in which case dispute-derived leaks/constraints simply do not fire (no fabrication).
   */
  disputeRisk?: (workspaceId: string) => Promise<DisputeRiskAnalysis>;
  /** Optional — the live complaint/rework → proof linkage source. Absent on a fake-DI unit test. */
  complaintRework?: (workspaceId: string) => Promise<ComplaintReworkAnalysis>;
}

async function resolveDefaultDeps(): Promise<GuidanceDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  const { getControlCorrelations } = await import("@/services/owner-mode/control-correlation.service");
  const { getProofOutcomeLinkage } = await import("@/services/owner-mode/proof-outcome-linkage.service");
  const { getDisputeRiskAnalysis } = await import("@/services/owner-mode/dispute-risk.service");
  const { getComplaintReworkLinks } = await import("@/services/execution/complaint-rework.service");
  return {
    db: db as unknown as GuidanceDb,
    uuid: () => randomUUID(),
    now: () => Date.now(),
    correlations: (workspaceId: string) => getControlCorrelations(workspaceId),
    proofOutcome: (workspaceId: string) => getProofOutcomeLinkage(workspaceId),
    disputeRisk: (workspaceId: string) => getDisputeRiskAnalysis(workspaceId),
    complaintRework: (workspaceId: string) => getComplaintReworkLinks(workspaceId),
  };
}

/**
 * Count an OPTIONAL live signal whose backing table may not exist in every
 * environment (e.g. schema-only models without a deploy migration). A missing
 * table (Prisma P2021) means "signal unavailable" → contribute 0; any other error
 * is a real fault and is rethrown.
 */
async function safeCount(p: Promise<number>): Promise<number> {
  try {
    return await p;
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2021") return 0;
    throw e;
  }
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

function countSeverity(n: number, hi: number, med: number): BusinessIssue["severity"] {
  return n >= hi ? "HIGH" : n >= med ? "MEDIUM" : "LOW";
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

export interface OwnerNowViewPayload {
  view: OwnerNowView;
  whatChanged: DetectedChange[];
  beginnerExplanation: BeginnerExplanation;
  stepByStep: GuidanceStep[];
  archetype: ArchetypeGuidance["archetype"];
  generatedFromLiveData: boolean;
  /** Owner Workload Budget — how much owner attention today, and how much was saved. */
  workloadBudget: OwnerWorkloadBudget;
  /** The single binding constraint limiting the business right now (or null). */
  topConstraint: ConstraintFinding | null;
  /** The single highest-value profit leak right now (or null). */
  topProfitLeak: ProfitLeakFinding | null;
  /** The single highest-risk staff/manager/operator gaming pattern (or null). */
  topGamingSignal: GamingSignal | null;
  /** The single highest evidence-credibility concern (or null). */
  topCredibilityConcern: CredibilityFinding | null;
  /** Whether OpsIQ's own business-control loop is operating reliably (SLOs). */
  businessControlHealth: BusinessControlHealth;
  /** Measured runtime control correlations (reassessment/shock/audit linkage), or null if unavailable. */
  controlCorrelations: ControlCorrelationReport | null;
  /** Measured proof→outcome linkage (accepted-proof contradiction/rework), or null if unavailable. */
  proofOutcomeLinkage: ProofOutcomeLinkageReport | null;
  /** Dispute-derived business-risk signals (category → profit/constraint), or null if unavailable. */
  disputeRisk: DisputeRiskAnalysis | null;
  /** Proof↔complaint/rework linkage (per-event model), or null if unavailable. */
  complaintReworkLinks: ComplaintReworkAnalysis | null;
}

/** Topic-specific, archetype-aware step builder (keyed by issue id, falls back by category). */
function stepFor(issue: BusinessIssue, ag: ArchetypeGuidance): GuidanceStep {
  const base = { issueId: issue.id, businessFunction: issue.businessFunction };
  switch (issue.id) {
    case "cash":
      return { ...base,
        reasonNow: "cash cover is thin and overdue receivables are the fastest recoverable cash",
        exactStep: `Call each overdue ${ag.customerNoun} today using the approved payment-follow-up script and log a promised payment date`,
        assignedRole: "Billing Staff", proofRequired: true, proofType: "call_log", deadline: "today",
        expectedOutcome: "recover overdue cash or classify each account as a collection risk",
        rollbackTrigger: "if a customer disputes service quality, pause collection and route to owner review",
        escalationRule: "escalate to owner if payment slips beyond 48 hours or a dispute is raised" };
    case "complaints":
      return { ...base,
        reasonNow: `complaints from ${ag.customerNoun} are rising and will compound if demand grows`,
        exactStep: `Review the latest complaints, find the top repeating failure, and fix that step in the ${ag.workerNoun} delivery process`,
        assignedRole: "Operations Lead", proofRequired: true, proofType: "checklist_completion", deadline: "within 3 days",
        expectedOutcome: "the top complaint cause is corrected and re-checked on the next 10 jobs",
        rollbackTrigger: "if complaints keep rising after the fix, escalate to a full process redesign",
        escalationRule: "escalate to owner if the same failure recurs after correction" };
    case "rework":
      return { ...base,
        reasonNow: "rework/redo is rising — this is cost of poor quality (CoPQ) and an SOP gap",
        exactStep: `Identify the task causing the most rework and add/fix the SOP step so ${ag.workerNoun} get it right first time`,
        assignedRole: "Operations Lead", proofRequired: true, proofType: "checklist_completion", deadline: "within 3 days",
        expectedOutcome: "first-time-right improves and rework count falls on the next jobs",
        rollbackTrigger: "if rework persists after the SOP fix, escalate to a process redesign",
        escalationRule: "escalate to owner if rework cost stays above target" };
    case "churn":
      return { ...base,
        reasonNow: `repeat business from ${ag.customerNoun} is weak — churn risk is rising`,
        exactStep: `Send the approved win-back message to lapsed ${ag.customerNoun} with a specific reason to return`,
        assignedRole: "Front Desk", proofRequired: true, proofType: "message_screenshot", deadline: "within 1 week",
        expectedOutcome: "a measurable share of lapsed customers rebook within 14 days",
        rollbackTrigger: "if win-back response is below 5%, switch message/offer before scaling",
        escalationRule: "escalate to owner before discounting below the viable price" };
    case "supplier":
      return { ...base,
        reasonNow: "supplier/inventory risk is high — a stockout would break delivery",
        exactStep: "Reorder the at-risk items to the order-up-to level and confirm lead times with suppliers before taking new volume",
        assignedRole: "Operations Lead", proofRequired: true, proofType: "document", deadline: "before next intake",
        expectedOutcome: "stock is back above reorder point and supply is confirmed",
        rollbackTrigger: "if a supplier cannot confirm supply, pause growth commitments",
        escalationRule: "escalate to owner if an overdue payable risks a supply cutoff" };
    case "proof":
      return { ...base,
        reasonNow: "proof for completed work is overdue — the result cannot be verified and learning is blocked",
        exactStep: "Collect the outstanding proof for each overdue item and record it against the action",
        assignedRole: "Assigned Staff", proofRequired: true, proofType: "before_after_image", deadline: "within 2 days",
        expectedOutcome: "every overdue action has verifiable proof and the loop can close",
        rollbackTrigger: "if proof shows the action failed, trigger redesign instead of closing",
        escalationRule: "escalate to owner if proof stays missing past the due date" };
    case "outcome":
      return { ...base,
        reasonNow: "an outcome check is due — verify the real result before any learning or new recommendation",
        exactStep: "Record the measured before/after result for each due action and mark whether it worked",
        assignedRole: "Owner", proofRequired: true, proofType: "short_note", deadline: "within 2 days",
        expectedOutcome: "outcomes are verified with evidence so learning is based on truth, not assumption",
        rollbackTrigger: "if the outcome made things worse, open a reassessment/redesign",
        escalationRule: "always verify outcomes before promoting any learning" };
    case "overload":
      return { ...base,
        reasonNow: "staff/owner are already overloaded and new load raises failure risk",
        exactStep: `Move one non-critical recurring task off the overloaded ${ag.workerNoun}/owner or pause it this week`,
        assignedRole: "Owner", proofRequired: true, proofType: "manager_confirmation", deadline: "this week",
        expectedOutcome: "daily load returns below the sustainable threshold",
        rollbackTrigger: "if delegation fails quality checks, reassign and retrain before re-delegating",
        escalationRule: "escalate to owner if no task can be safely delegated" };
    case "capacity":
      return { ...base,
        reasonNow: "a capacity bottleneck means overcommitting will break delivery",
        exactStep: "Cap intake at current safe capacity and schedule the bottleneck resource before accepting new work",
        assignedRole: "Operations Lead", proofRequired: true, proofType: "checklist_completion", deadline: "before next intake",
        expectedOutcome: "intake stays within the bottleneck's safe throughput",
        rollbackTrigger: "if backlog grows, pause intake and add capacity before resuming",
        escalationRule: "escalate to owner before committing to volume above safe capacity" };
    default: // margin / generic
      return { ...base,
        reasonNow: "margin is below a safe level on at least one service or segment",
        exactStep: "Identify the lowest-margin service line and either reprice it or stop discounting it this month",
        assignedRole: "Owner", proofRequired: true, proofType: "short_note", deadline: "this month",
        expectedOutcome: "the loss-making line is repriced or paused and margin recovers",
        rollbackTrigger: "if repricing loses key customers, revisit cost structure instead",
        escalationRule: "escalate to owner before changing prices for major accounts" };
  }
}

/** Build the live GuidanceContext + comparable state snapshot from persisted module data. */
export async function assembleGuidanceContext(
  workspaceId: string,
  businessId: string | null,
  deps: GuidanceDeps
): Promise<{ ctx: GuidanceContext; state: BusinessStateSnapshot; ag: ArchetypeGuidance; raw: { cashState?: string; finState?: string; discountAmount: number | null; revenue: number | null; b2bRevenue: number | null; newCustomers: number | null; repeatCustomers: number | null } }> {
  const scope = businessId ? { workspaceId, businessId } : { workspaceId };
  const order = { createdAt: "desc" as const };
  const periodOrder = { periodEnd: "desc" as const };
  const overdueBefore = new Date(deps.now() - PROOF_OVERDUE_AGE_MS);
  const nowDate = new Date(deps.now());

  const [cash, fin, emp, own, cap, metric, supplier, business, overdueProofCount, outcomeOpen, reassessOpen] = await Promise.all([
    deps.db.ownerCashflowCycle.findFirst({ where: scope, orderBy: order, select: { cashflowState: true, dataConfidenceScore: true } }),
    deps.db.ownerFinanceCycle.findFirst({ where: scope, orderBy: order, select: { survivalState: true, dataConfidenceScore: true } }),
    deps.db.ownerEmployeeWorkloadSnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { overburdened: true, utilizationPct: true } }),
    deps.db.ownerWorkloadSnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { overloaded: true, bottleneckRisk: true, dailyLoadPct: true } }),
    deps.db.ownerCapacitySnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { growthSafe: true, expansionTriggered: true, bottleneckUtilization: true } }),
    deps.db.ownerMetricSnapshot.findFirst({ where: scope, orderBy: periodOrder, select: { complaintCount: true, rewashCount: true, refundAmount: true, newCustomers: true, repeatCustomers: true, revenue: true, discountAmount: true, b2bRevenue: true } }),
    deps.db.ownerSupplierInventorySnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { worstStockoutRisk: true, riskScore: true, supplyCutoffRisk: true, belowReorderCount: true } }),
    businessId
      ? deps.db.ownerBusiness.findFirst({ where: { workspaceId, id: businessId }, select: { businessType: true } })
      : deps.db.ownerBusiness.findFirst({ where: { workspaceId, isActive: true }, orderBy: order, select: { businessType: true } }),
    safeCount(deps.db.proof.count({ where: { workspaceId, status: { in: OVERDUE_PROOF_STATUSES }, createdAt: { lt: overdueBefore } } })),
    safeCount(deps.db.ownerActionOutcome.count({ where: { workspaceId, OR: [{ outcomeStatus: OPEN_OUTCOME_STATUS }, { measurementPeriodEnd: { lt: nowDate } }] } })),
    safeCount(deps.db.ownerReassessmentEvent.count({ where: { workspaceId, status: "pending" } })),
  ]);

  const ag = archetypeGuidance(business?.businessType);
  const cashState = cash?.cashflowState;
  const finState = fin?.survivalState;
  const cashSafe = !!cashState && !!finState && SAFE_STATES.has(cashState) && SAFE_STATES.has(finState);
  const staffOverloaded = emp?.overburdened === true;
  const ownerOverloaded = own?.overloaded === true || own?.bottleneckRisk === true;
  const capacityGrowthSafe = cap?.growthSafe === true;
  const supplierRiskScore = supplier?.riskScore ?? 0;
  const supplierRiskHigh = supplierRiskScore >= 0.5;
  const growthGatePassed = cashSafe && capacityGrowthSafe && !supplierRiskHigh;

  const complaints = Math.round(metric?.complaintCount ?? 0);
  const rework = Math.round(metric?.rewashCount ?? 0);
  const newC = metric?.newCustomers ?? 0;
  const repeatC = metric?.repeatCustomers ?? 0;
  const churnRiskScore = newC + repeatC > 0 ? Math.max(0, 1 - repeatC / (newC + repeatC)) : 0;
  const outcomeChecksDue = outcomeOpen + reassessOpen;

  const confScore =
    cash && fin ? Math.min(cash.dataConfidenceScore, fin.dataConfidenceScore)
      : cash ? cash.dataConfidenceScore : fin ? fin.dataConfidenceScore : null;
  const dataConfidence = confidenceFromScore(confScore);

  // Named, smallest-useful-first missing data — never a generic warning.
  const missingCriticalData: string[] = [];
  if (!cash) missingCriticalData.push("latest cash position (cash on hand + obligations)");
  if (!fin) missingCriticalData.push("latest profit/margin figures");
  if (!metric) missingCriticalData.push("latest customer + complaint counts");
  if (!supplier) missingCriticalData.push("supplier reliability + stock levels");

  const issues: BusinessIssue[] = [];
  if (!cashSafe && (cashState || finState)) {
    const sev = cashSeverity(cashState && !SAFE_STATES.has(cashState) ? cashState : finState);
    issues.push({ id: "cash", category: IssueCategory.CASH_DANGER, businessFunction: [BusinessFunction.CASH_FLOW],
      severity: sev, headline: `Cash survival is ${cashState ?? "unknown"} / finance ${finState ?? "unknown"}`,
      requiresOwnerAction: sev === "CRITICAL" || sev === "HIGH" });
  }
  if (finState && !SAFE_STATES.has(finState)) {
    issues.push({ id: "margin", category: IssueCategory.PROFIT_LEAK, businessFunction: [BusinessFunction.PROFITABILITY],
      severity: finState === "CRITICAL" || finState === "INSOLVENT_RISK" ? "HIGH" : "MEDIUM",
      headline: "Profit/margin is below a safe level", requiresOwnerAction: false });
  }
  if (complaints >= 1) {
    issues.push({ id: "complaints", category: IssueCategory.CUSTOMER_SERVICE_FAILURE,
      businessFunction: [BusinessFunction.QUALITY, BusinessFunction.CUSTOMER_COMPLAINTS],
      severity: countSeverity(complaints, 10, 3), headline: `${complaints} customer complaints this period`,
      requiresOwnerAction: complaints >= 10 });
  }
  if (rework >= 1) {
    issues.push({ id: "rework", category: IssueCategory.CUSTOMER_SERVICE_FAILURE,
      businessFunction: [BusinessFunction.QUALITY, BusinessFunction.SOP_PROCESS],
      severity: countSeverity(rework, 10, 3), headline: `${rework} rework/redo jobs this period (cost of poor quality)`,
      requiresOwnerAction: false });
  }
  if (churnRiskScore >= 0.4) {
    issues.push({ id: "churn", category: IssueCategory.CUSTOMER_SERVICE_FAILURE,
      businessFunction: [BusinessFunction.CUSTOMER_RETENTION],
      severity: churnRiskScore >= 0.6 ? "HIGH" : "MEDIUM",
      headline: `Repeat business is weak (churn risk ${Math.round(churnRiskScore * 100)}%)`, requiresOwnerAction: false });
  }
  if (supplierRiskHigh) {
    issues.push({ id: "supplier", category: IssueCategory.CAPACITY_BOTTLENECK,
      businessFunction: [BusinessFunction.SUPPLIER, BusinessFunction.INVENTORY],
      severity: supplierRiskScore >= 0.75 ? "HIGH" : "MEDIUM",
      headline: `Supplier/inventory risk (worst stockout: ${supplier?.worstStockoutRisk ?? "n/a"})`,
      requiresOwnerAction: supplier?.supplyCutoffRisk === true });
  }
  if (overdueProofCount > 0) {
    issues.push({ id: "proof", category: IssueCategory.PENDING_PROOF_OUTCOME, businessFunction: [BusinessFunction.EVIDENCE_PROOF],
      severity: countSeverity(overdueProofCount, 5, 2), headline: `${overdueProofCount} proofs overdue`, requiresOwnerAction: false });
  }
  if (outcomeChecksDue > 0) {
    issues.push({ id: "outcome", category: IssueCategory.PENDING_PROOF_OUTCOME, businessFunction: [BusinessFunction.OUTCOME_LEARNING],
      severity: countSeverity(outcomeChecksDue, 5, 2), headline: `${outcomeChecksDue} outcome checks due`, requiresOwnerAction: false });
  }
  if (cap && (!cap.growthSafe || cap.expansionTriggered)) {
    const sev: BusinessIssue["severity"] = cap.bottleneckUtilization >= 0.95 ? "CRITICAL" : cap.bottleneckUtilization >= 0.85 ? "HIGH" : "MEDIUM";
    issues.push({ id: "capacity", category: IssueCategory.CAPACITY_BOTTLENECK, businessFunction: [BusinessFunction.CAPACITY],
      severity: sev, headline: `Capacity bottleneck at ${Math.round(cap.bottleneckUtilization * 100)}% utilization`,
      requiresOwnerAction: sev === "CRITICAL" });
  }
  if (staffOverloaded || ownerOverloaded) {
    issues.push({ id: "overload", category: IssueCategory.OVERLOAD,
      businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD, BusinessFunction.OWNER_WORKLOAD],
      severity: "HIGH", headline: "Staff/owner workload is over the sustainable limit", requiresOwnerAction: ownerOverloaded });
  }

  const ctx: GuidanceContext = {
    workspaceId, businessId: businessId ?? "", archetype: ag.archetype,
    dataConfidence, missingCriticalData, issues, changes: [],
    growthGatePassed, cashSafe, staffOverloaded, ownerOverloaded, unsafeToGuide: false,
  };

  const state: BusinessStateSnapshot = {
    cashRunwayDays: cashState ? RUNWAY_BY_STATE[cashState] ?? 0 : 0,
    netMarginPct: finState ? MARGIN_BY_STATE[finState] ?? 0 : 0,
    complaintsCount: complaints,
    reworkCount: rework,
    capacityUtilizationPct: cap ? cap.bottleneckUtilization * 100 : 0,
    staffOverloadPct: emp?.utilizationPct ?? 0,
    ownerLoadPct: own?.dailyLoadPct ?? 0,
    churnRiskScore,
    supplierInventoryRiskScore: supplierRiskScore,
    overdueProofCount,
    outcomeChecksDue,
    growthReadinessTier: growthGatePassed ? "GROWTH_READY" : "STABILIZE_FIRST",
  };

  return {
    ctx, state, ag,
    raw: {
      cashState, finState,
      discountAmount: metric?.discountAmount ?? null, revenue: metric?.revenue ?? null,
      b2bRevenue: metric?.b2bRevenue ?? null, newCustomers: metric?.newCustomers ?? null,
      repeatCustomers: metric?.repeatCustomers ?? null,
    },
  };
}

function buildBeginner(view: OwnerNowView, steps: GuidanceStep[]): BeginnerExplanation {
  const headline = view.topOwnerActions[0]?.headline ?? "Your business has no urgent issues right now";
  const whatToDoFirst = steps.length > 0 ? steps.map((s) => s.exactStep) : ["Keep tracking cash and complaints"];
  const whatNotToDo = view.actionsToAvoid.length > 0
    ? view.actionsToAvoid.map((a) => a.avoid)
    : ["Do not take on risk you cannot measure yet"];
  return buildBeginnerExplanation({
    headline,
    businessFunction: view.topOwnerActions[0]?.businessFunction ?? [BusinessFunction.CASH_FLOW],
    whatToDoFirst,
    whatNotToDo,
    proofToCollect: steps.map((s) => s.proofType),
    howToKnowItWorked: "the most urgent issue's status improves on the next check",
    ifIgnoredConsequence: view.cashDangerStatus === "CRITICAL"
      ? "you may run out of cash without warning"
      : "the most urgent problem will get worse and harder to fix",
    dataIsWeak: view.confidenceCapped,
  });
}

/** Produce the live Owner Now View: assemble, diff vs prior snapshot, run orchestrator, persist. */
export async function getOwnerNowView(
  workspaceId: string,
  businessId: string | null,
  injected?: GuidanceDeps
): Promise<OwnerNowViewPayload> {
  const deps = injected ?? (await resolveDefaultDeps());
  const { ctx, state, ag, raw } = await assembleGuidanceContext(workspaceId, businessId, deps);

  // Owner Workload Budget signals — concrete owner-decision surfaces (workspace-scoped).
  // opportunityApprovalsPending has no persisted queue yet (decisions are computed on demand),
  // so it contributes 0 here rather than a fabricated count.
  const [pendingProofReviews, pendingReassessments] = await Promise.all([
    safeCount(deps.db.proof.count({ where: { workspaceId, status: "NEEDS_HUMAN_REVIEW" } })),
    safeCount(deps.db.ownerReassessmentEvent.count({ where: { workspaceId, status: "pending" } })),
  ]);
  const workloadBudget = computeOwnerWorkloadBudget(ctx.issues, {
    pendingProofReviews,
    pendingReassessments,
    opportunityApprovalsPending: 0,
  });

  // Dispute → Business Risk — map governed proof-dispute categories (from the proof.disputed audit
  // trail) into Profit-Leak + Constraint drivers. Live path only; a fake-DI unit test omits it, so
  // dispute-derived leaks/constraints simply do not fire (no fabrication).
  let disputeRisk: DisputeRiskAnalysis | null = null;
  if (typeof deps.disputeRisk === "function") {
    disputeRisk = await deps.disputeRisk(workspaceId);
  }
  const da = disputeRisk?.aggregates;

  // Complaint/Rework → proof linkage (per-event model). Feeds the same profit/constraint drivers
  // (with measured impact when supplied) + credibility, and makes proof→complaint/rework measurable.
  let complaintReworkLinks: ComplaintReworkAnalysis | null = null;
  if (typeof deps.complaintRework === "function") {
    complaintReworkLinks = await deps.complaintRework(workspaceId);
  }
  const cr = complaintReworkLinks?.aggregates;

  // Constraint / Bottleneck Engine — identify the single binding constraint from the SAME
  // live signals (workspace-scoped). Only signals actually backed by current snapshots are
  // passed; unbacked event signals (delivery/discount/major-client-loss/startup) stay absent
  // so the engine never fabricates them here — it fires them only when a real source provides them.
  const constraintSignals: ConstraintSignals = {
    workspaceId,
    // Honest: pass the RAW survival state, or null when the snapshot is absent — never
    // fabricate a cash crisis from missing data (that path returns DATA_INSUFFICIENT).
    cashState: raw.cashState ?? null,
    marginSafe: raw.finState ? SAFE_STATES.has(raw.finState) : null,
    ownerBottleneckItems: workloadBudget.ownerBottleneckItems,
    ownerDecisionsRequired: workloadBudget.ownerDecisionsRequired,
    ownerReviewsRequired: workloadBudget.reviewsRequired,
    ownerOverloaded: ctx.ownerOverloaded,
    staffOverloaded: ctx.staffOverloaded,
    overdueProofCount: state.overdueProofCount,
    capacityUtilizationPct: state.capacityUtilizationPct,
    supplierInventoryRiskScore: state.supplierInventoryRiskScore,
    complaintsCount: state.complaintsCount,
    reworkCount: state.reworkCount,
    churnRiskScore: state.churnRiskScore,
    // Dispute-derived + linked complaint/rework quality/staff/manager drivers.
    disputeQualityCount: (da?.disputeQualityCount ?? 0) + (cr?.qualityCount ?? 0),
    disputeStaffCount: da?.disputeStaffCount ?? 0,
    disputeManagerCount: da?.disputeManagerCount ?? 0,
    missingCriticalData: ctx.missingCriticalData,
    evaluatedAt: new Date(deps.now()).toISOString(),
  };
  const topConstraint = identifyConstraints(constraintSignals).topConstraint;

  // Profit-Leak Radar — highest-value leak from the SAME live signals (workspace-scoped),
  // linked to the current binding constraint. Fabricates nothing: real figures (discount
  // amount, revenue) are reported as data; margin is left unknown (no 0..1 margin source),
  // so margin-dependent leaks carry lower confidence / NEEDS_DATA rather than a fake number.
  const profitLeakSignals: ProfitLeakSignals = {
    workspaceId,
    revenue: raw.revenue,
    discountAmount: raw.discountAmount,
    marginPct: null,
    marginSafe: raw.finState ? SAFE_STATES.has(raw.finState) : null,
    b2bRevenue: raw.b2bRevenue,
    newCustomers: raw.newCustomers,
    repeatCustomers: raw.repeatCustomers,
    complaintsCount: state.complaintsCount,
    reworkCount: state.reworkCount,
    overdueProofCount: state.overdueProofCount,
    capacityUtilizationPct: state.capacityUtilizationPct,
    ownerBottleneckItems: workloadBudget.ownerBottleneckItems,
    ownerReviewsRequired: workloadBudget.reviewsRequired,
    ownerDecisionsRequired: workloadBudget.ownerDecisionsRequired,
    currentConstraint: topConstraint?.constraintType ?? null,
    // Dispute-derived + linked complaint/rework drivers (with measured impact when supplied).
    disputeReworkCount: (da?.disputeReworkCount ?? 0) + (cr?.reworkLinkedCount ?? 0),
    disputeComplaintCount: (da?.disputeComplaintCount ?? 0) + (cr?.complaintLinkedCount ?? 0),
    disputeWeakProofCount: da?.disputeWeakProofCount ?? 0,
    disputeReworkImpactAmount: cr?.measuredReworkImpact ?? null,
    disputeComplaintImpactAmount: cr?.measuredComplaintImpact ?? null,
    missingCriticalData: ctx.missingCriticalData,
    evaluatedAt: new Date(deps.now()).toISOString(),
  };
  const topProfitLeak = identifyProfitLeaks(profitLeakSignals).topLeak;

  // Proof→Outcome Linkage — accepted-proof contradiction (later DISPUTED/OVERRIDDEN) + rework,
  // from the proof.reviewed audit trail. Live path only; feeds credibility + the integrity SLO.
  let proofOutcomeReport: ProofOutcomeLinkageReport | null = null;
  if (typeof deps.proofOutcome === "function") {
    proofOutcomeReport = await deps.proofOutcome(workspaceId);
  }

  // Cross-Event Anti-Gaming Analytics — the single highest-risk staff/manager pattern from the
  // workspace's proof/review events, linked to the current constraint + profit leak. Only runs
  // when the client exposes proof.findMany (the live path); a DI mock without it → null (no fake).
  let topGamingSignal: GamingSignal | null = null;
  let topCredibilityConcern: CredibilityFinding | null = null;
  let totalProofCount: number | null = null;
  let weakProofCount: number | null = null;
  let overdueReviewCount: number | null = null;
  if (typeof deps.db.proof.findMany === "function") {
    // One workspace-scoped query feeds both anti-gaming and the credibility graph.
    const proofRows = await deps.db.proof.findMany({
      where: { workspaceId },
      select: { submittedByUserId: true, reviewedByUserId: true, proofType: true, status: true, duplicateFlagged: true, tamperSuspected: true, createdAt: true, reviewedAt: true },
    });
    const nowMs = deps.now();
    const { actors, reviewers } = aggregateProofEvents(proofRows, nowMs);
    topGamingSignal = identifyGamingSignals({
      workspaceId, actors, reviewers,
      currentConstraint: topConstraint?.constraintType ?? null,
      topProfitLeakType: topProfitLeak?.leakType ?? null,
      evaluatedAt: new Date(nowMs).toISOString(),
    }).topSignal;

    // Evidence Credibility Graph — which proof/staff/reviewer/process can be trusted, and why.
    const credAggregates = aggregateCredibility(proofRows, nowMs);
    topCredibilityConcern = buildEvidenceCredibility({
      workspaceId, ...credAggregates,
      currentConstraint: topConstraint?.constraintType ?? null,
      topProfitLeakType: topProfitLeak?.leakType ?? null,
      topGamingSignalType: topGamingSignal?.signalType ?? null,
      // Real accepted-proof contradictions (from the proof.reviewed audit trail) — a submitter
      // whose accepted proof was reversed is no longer "reliable". Undefined on the fake-DI path.
      submitterContradictions: proofOutcomeReport?.submitterContradictions.map((c) => ({ actorId: c.actorId, contradictedCount: c.contradictedCount })),
      contradictedProofCount: proofOutcomeReport?.workspaceContradictedCount,
      // Real linked complaint/rework events per submitter (per-event model) → credibility concern.
      submitterComplaints: complaintReworkLinks?.submitterComplaints,
      submitterReworks: complaintReworkLinks?.submitterReworks,
      missingSources: complaintReworkLinks && complaintReworkLinks.aggregates.complaintLinkedCount > 0 ? [] : ["no complaint event linked to accepted proof yet"],
      evaluatedAt: new Date(nowMs).toISOString(),
    }).topConcern;

    // Proof counts for the Business-Control SLOs (from the same rows — no extra query).
    const WEAK = new Set(["NEEDS_HUMAN_REVIEW", "AI_PRECHECK_FAILED"]);
    const OVERDUE_BEFORE = nowMs - PROOF_OVERDUE_AGE_MS;
    totalProofCount = proofRows.length;
    weakProofCount = proofRows.filter((p) => WEAK.has(p.status)).length;
    overdueReviewCount = proofRows.filter((p) => WEAK.has(p.status) && p.createdAt.getTime() < OVERDUE_BEFORE).length;
  }

  // Runtime control correlations — measure OpsIQ's own control loop linkage (reassessment
  // close latency, shock→re-eval latency, governed-mutation→audit coverage) from real persisted
  // timestamps. Only on the live path (deps.correlations present); a fake-DI unit test omits it,
  // so the correlation-backed SLOs stay honestly NOT_MEASURABLE.
  let controlCorrelations: ControlCorrelationReport | null = null;
  if (typeof deps.correlations === "function") {
    controlCorrelations = await deps.correlations(workspaceId);
  }

  // Business-Control SLOs — grade OpsIQ's own control loop from the signals above (+ proof
  // counts + measured correlations). Honest NOT_MEASURABLE where the source is not persisted
  // (startup data, runtime isolation, or no correlated events in the window).
  const businessControlHealth = evaluateBusinessControlSLOs({
    workspaceId,
    workloadBudget: {
      ownerDecisionsRequired: workloadBudget.ownerDecisionsRequired,
      approvalsRequired: workloadBudget.approvalsRequired,
      reviewsRequired: workloadBudget.reviewsRequired,
      ownerBottleneckItems: workloadBudget.ownerBottleneckItems,
    },
    topConstraintType: topConstraint?.constraintType ?? null,
    topConstraintSeverity: topConstraint?.severity ?? null,
    topProfitLeakType: topProfitLeak?.leakType ?? null,
    topProfitLeakSeverity: topProfitLeak?.severity ?? null,
    topGamingSignalType: topGamingSignal?.signalType ?? null,
    topGamingSeverity: topGamingSignal?.severity ?? null,
    topCredibilitySignalType: topCredibilityConcern?.signalType ?? null,
    topCredibilitySeverity: topCredibilityConcern?.severity ?? null,
    totalProofCount, weakProofCount, overdueReviewCount,
    // "Present" = the signal computed at all (a DATA_INSUFFICIENT finding still means the
    // pipeline ran and is exposed — that is an honest data gap, not a now-view completeness gap).
    nowViewSignalsPresent: {
      workload: true,
      constraint: !!topConstraint,
      profitLeak: !!topProfitLeak,
      gaming: !!topGamingSignal,
      credibility: !!topCredibilityConcern,
    },
    // Measured runtime correlations (live path only); null → those SLOs stay NOT_MEASURABLE.
    auditDurability: controlCorrelations?.auditDurability ?? null,
    reassessmentLatency: controlCorrelations?.reassessmentLatency ?? null,
    shockHandlingLatency: controlCorrelations?.shockHandlingLatency ?? null,
    // Measured proof→outcome integrity (live path only); null → PROOF_OUTCOME_INTEGRITY NOT_MEASURABLE.
    proofOutcome: proofOutcomeReport?.measurement ?? null,
    // Honest: these sources are not persisted for a runtime metric yet.
    opportunityEnvelopeFields: null,
    startupDataAvailable: false,
    isolationTestPassed: null,
    evaluatedAt: new Date(deps.now()).toISOString(),
  });

  const prev = await deps.db.ownerGuidanceSnapshot.findFirst({
    where: businessId ? { workspaceId, businessId } : { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  const changes: DetectedChange[] = prev ? detectChanges(prevState(prev), state) : [];

  const view = buildOwnerNowView({ ...ctx, changes });
  const stepByStep = view.topOwnerActions.map((i) => stepFor(i, ag));
  const beginnerExplanation = buildBeginner(view, stepByStep);

  await deps.db.ownerGuidanceSnapshot.create({
    data: {
      id: deps.uuid(), workspaceId, businessId: businessId ?? null,
      classification: view.classification, cashSafe: ctx.cashSafe, growthGatePassed: ctx.growthGatePassed,
      staffOverloaded: ctx.staffOverloaded, ownerOverloaded: ctx.ownerOverloaded, dataConfidence: ctx.dataConfidence,
      topIssueCount: view.topOwnerActions.length, missingDataCount: view.missingDataRequests.length,
      cashRunwayDays: state.cashRunwayDays, netMarginPct: state.netMarginPct, complaintsCount: state.complaintsCount,
      reworkCount: state.reworkCount, capacityUtilizationPct: state.capacityUtilizationPct,
      staffOverloadPct: state.staffOverloadPct, ownerLoadPct: state.ownerLoadPct, churnRiskScore: state.churnRiskScore,
      supplierInventoryRiskScore: state.supplierInventoryRiskScore, overdueProofCount: state.overdueProofCount,
      outcomeChecksDue: state.outcomeChecksDue, growthReadinessTier: state.growthReadinessTier,
      payload: { view, whatChanged: changes, stepByStep, beginnerExplanation, archetype: ag.archetype } as unknown as Record<string, unknown>,
    },
  });

  return { view, whatChanged: changes, beginnerExplanation, stepByStep, archetype: ag.archetype, generatedFromLiveData: true, workloadBudget, topConstraint, topProfitLeak, topGamingSignal, topCredibilityConcern, businessControlHealth, controlCorrelations, proofOutcomeLinkage: proofOutcomeReport, disputeRisk, complaintReworkLinks };
}

function prevState(row: GuidanceSnapshotRow): BusinessStateSnapshot {
  return {
    cashRunwayDays: row.cashRunwayDays, netMarginPct: row.netMarginPct, complaintsCount: row.complaintsCount,
    reworkCount: row.reworkCount, capacityUtilizationPct: row.capacityUtilizationPct, staffOverloadPct: row.staffOverloadPct,
    ownerLoadPct: row.ownerLoadPct, churnRiskScore: row.churnRiskScore, supplierInventoryRiskScore: row.supplierInventoryRiskScore,
    overdueProofCount: row.overdueProofCount, outcomeChecksDue: row.outcomeChecksDue, growthReadinessTier: row.growthReadinessTier,
  };
}
