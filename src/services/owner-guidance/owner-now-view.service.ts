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
import { aggregateProofEvents, identifyGamingSignals, aggregateSuspiciousProof, type GamingSignal, type ProofEventRow, type SuspiciousDisputeRecord, type SuspiciousProofRow } from "@/domain/owner-mode/anti-gaming-analytics";
import { evaluateFastCompletion, evaluateEscalationTiming, type TimingSignal, type CompletionTimingRow, type EscalationTimingRow } from "@/domain/owner-mode/timing-evidence";
import { buildProcessIntelligence, type ProcessIntelligenceAnalysis } from "@/domain/owner-mode/process-intelligence";
import { buildProcessCorrections, type ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";
import { buildSopChecklistCorrections, type SopChecklistCorrectionAnalysis } from "@/domain/owner-mode/sop-checklist-correction-engine";
import { buildTrainingAssignments, type TrainingAssignmentAnalysis } from "@/domain/owner-mode/staff-training-assignment-engine";
import { aggregateCredibility, buildEvidenceCredibility, type CredibilityFinding, type CredibilityProofRow } from "@/domain/owner-mode/evidence-credibility-graph";
import { evaluateBusinessControlSLOs, type BusinessControlHealth } from "@/domain/owner-mode/business-control-slo";
import type { ControlCorrelationReport } from "@/domain/owner-mode/control-correlation";
import type { ProofOutcomeLinkageReport } from "@/domain/owner-mode/proof-outcome-linkage";
import type { DisputeRiskAnalysis } from "@/domain/owner-mode/dispute-risk";
import type { ComplaintReworkAnalysis } from "@/domain/execution/complaint-rework";
import type { OperationalEventAgingSummary } from "@/domain/execution/operational-event-aging";
import type { ReusedHashAnalysis } from "@/domain/execution/reused-hash-precheck";
import { clearsFinding, isFindingSuppressed, AdjudicationSourceType } from "@/domain/execution/proof-risk-adjudication";
import type { ProofRiskAdjudicationView } from "@/services/execution/proof-risk-adjudication.service";

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

/** Proof row for the now-view analytics query — the credibility fields plus trusted timing fields. */
interface NowViewProofRow extends CredibilityProofRow {
  submittedAt?: Date | null;
  workStartedAt?: Date | null;
}
/** Escalation row for the ignores-escalation timing signal (trusted timestamps only). */
interface EscalationSelectRow {
  id: string;
  assignedTarget: string | null;
  severity: string;
  status: string;
  createdAt: Date;
  dueAt: Date | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
}

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
    /** Optional — present on the live client; enables anti-gaming + credibility + timing analytics. */
    findMany?(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<NowViewProofRow[]>;
  };
  /**
   * Optional — the escalation table (present on the live client). Enables the
   * MANAGER_IGNORES_ESCALATION timing signal; a DI mock without it → the signal is honestly absent.
   */
  escalation?: {
    findMany?(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<EscalationSelectRow[]>;
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
  /** Optional — the deterministic reused-hash / duplicate-proof precheck. Absent on a fake-DI unit test. */
  reusedHash?: (workspaceId: string) => Promise<ReusedHashAnalysis>;
  /** Optional — governed owner proof-risk adjudications (suppress cleared findings). Absent on a fake-DI test. */
  proofRiskAdjudications?: (workspaceId: string) => Promise<ProofRiskAdjudicationView[]>;
}

async function resolveDefaultDeps(): Promise<GuidanceDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  const { getControlCorrelations } = await import("@/services/owner-mode/control-correlation.service");
  const { getProofOutcomeLinkage } = await import("@/services/owner-mode/proof-outcome-linkage.service");
  const { getDisputeRiskAnalysis } = await import("@/services/owner-mode/dispute-risk.service");
  const { getComplaintReworkLinks } = await import("@/services/execution/complaint-rework.service");
  const { getReusedHashFindings } = await import("@/services/execution/reused-hash-precheck.service");
  const { getProofRiskAdjudications } = await import("@/services/execution/proof-risk-adjudication.service");
  return {
    db: db as unknown as GuidanceDb,
    uuid: () => randomUUID(),
    now: () => Date.now(),
    correlations: (workspaceId: string) => getControlCorrelations(workspaceId),
    proofOutcome: (workspaceId: string) => getProofOutcomeLinkage(workspaceId),
    disputeRisk: (workspaceId: string) => getDisputeRiskAnalysis(workspaceId),
    complaintRework: (workspaceId: string) => getComplaintReworkLinks(workspaceId),
    reusedHash: (workspaceId: string) => getReusedHashFindings(workspaceId),
    proofRiskAdjudications: (workspaceId: string) => getProofRiskAdjudications(workspaceId),
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
  /** Operational-event resolution + aging health (open/overdue/resolved), or null if unavailable. */
  operationalEventHealth: OperationalEventAgingSummary | null;
  /** Deterministic reused-hash / duplicate-proof findings (workspace-scoped), or null if unavailable. */
  reusedProofFindings: ReusedHashAnalysis | null;
  /** Governed owner proof-risk adjudications (workspace-scoped), or null if unavailable. */
  proofRiskAdjudications: ProofRiskAdjudicationView[] | null;
  /** Adjudication-state summary (active / cleared / inconclusive counts + top active action). */
  proofRiskAdjudicationSummary: ProofRiskAdjudicationSummary | null;
  /**
   * Timing-evidence signals (fast-completion + ignores-escalation) from persisted trusted timestamps.
   * Active statuses also surface via topGamingSignal; here the full status (incl. fail-visible
   * TIMING_MISSING / BASELINE_MISSING / ESCALATION_TIMING_MISSING / NO_MANAGER_ASSIGNMENT) is exposed
   * so the owner sees exactly what is measurable and what is still blocked. Null on the fake-DI path.
   */
  timingEvidence: { fastCompletion: TimingSignal | null; escalationTiming: TimingSignal | null } | null;
  /**
   * Process Intelligence v1 — the single highest-value process breakdown (where work is stuck / failing)
   * over the trusted event/proof/risk/timing/adjudication chain, with evidence + a specific correction +
   * required approval level. Null on the fake-DI path. A cleared adjudication cannot drive it.
   */
  processIntelligence: ProcessIntelligenceAnalysis | null;
  /**
   * Bottleneck → Correction Routing — the Process Intelligence findings turned into proposed, trackable
   * correction actions (with target, evidence, required approval, and whether owner approval is
   * mandatory). Derived from `processIntelligence`; null whenever that is null. Every correction is
   * PROPOSED — never auto-approved; only the DATA_INSUFFICIENT no-op is auto-executable.
   */
  processCorrections: ProcessCorrectionRouting | null;
  /**
   * SOP / Checklist Correction Engine — routed corrections turned into governed DRAFT SOP/checklist
   * changes (what step changes, why, which area, proof requirement, approval, success metric, review
   * cadence). Derived from `processCorrections` + `processIntelligence`; null whenever those are null.
   * Every draft is DRAFT/PROPOSED/NEEDS_DATA — never auto-approved, never auto-applied.
   */
  sopChecklistCorrections: SopChecklistCorrectionAnalysis | null;
  /**
   * Staff Training Assignment Engine — process/correction findings turned into governed, evidence-backed
   * training/review recommendations (what training, who, why, linked SOP correction, approval, success
   * metric). Derived from the findings + corrections + SOP drafts; null whenever those are null. Every
   * assignment is PROPOSED/NEEDS_DATA — never auto-assigned; coaching/review only, no HR/discipline.
   */
  trainingAssignments: TrainingAssignmentAnalysis | null;
}

export interface ProofRiskAdjudicationSummary {
  total: number;
  activeCount: number;
  clearedCount: number;
  inconclusiveCount: number;
  latest: ProofRiskAdjudicationView[];
  topActiveAction: { outcome: string; sourceType: string; recommendedNextAction: string } | null;
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

/** Recompute the dispute-risk aggregates from a (possibly adjudication-filtered) list of risks. */
function recomputeDisputeAggregates(risks: Array<{ profitLeakType: string | null; constraintType: string | null }>) {
  const agg = { total: risks.length, disputeReworkCount: 0, disputeComplaintCount: 0, disputeWeakProofCount: 0, disputeQualityCount: 0, disputeStaffCount: 0, disputeManagerCount: 0 };
  for (const r of risks) {
    if (r.profitLeakType === "REWORK_REDO_COST") agg.disputeReworkCount++;
    else if (r.profitLeakType === "COMPLAINT_REVENUE_RISK") agg.disputeComplaintCount++;
    else if (r.profitLeakType === "WEAK_PROOF_REWORK_RISK") agg.disputeWeakProofCount++;
    if (r.constraintType === "QUALITY") agg.disputeQualityCount++;
    else if (r.constraintType === "STAFF") agg.disputeStaffCount++;
    else if (r.constraintType === "MANAGER") agg.disputeManagerCount++;
  }
  return agg;
}

/** Summarize proof-risk adjudications (active vs cleared vs inconclusive) for the owner now-view. */
function summarizeAdjudications(list: ProofRiskAdjudicationView[]): ProofRiskAdjudicationSummary {
  const CLEARED = new Set(["ACCEPT_AS_VALID", "DISMISS_FALSE_POSITIVE"]);
  let cleared = 0, inconclusive = 0, active = 0;
  let topActive: ProofRiskAdjudicationView | null = null;
  for (const a of list) {
    if (CLEARED.has(a.outcome)) cleared++;
    else if (a.outcome === "MARK_INCONCLUSIVE_NEEDS_DATA") { inconclusive++; }
    else { active++; }
    if (!CLEARED.has(a.outcome) && a.ownerActionRequired && !topActive) topActive = a;
  }
  return {
    total: list.length, activeCount: active, clearedCount: cleared, inconclusiveCount: inconclusive,
    latest: list.slice(0, 5),
    topActiveAction: topActive ? { outcome: topActive.outcome, sourceType: topActive.sourceType, recommendedNextAction: topActive.recommendedNextAction } : null,
  };
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

  // Governed owner proof-risk adjudications — the owner's fair, audited decisions. A CLEARING
  // decision (accept-as-valid / dismiss-false-positive) suppresses that EXACT finding from
  // re-surfacing (reduces owner noise) without deleting evidence; a NEW supporting proof re-surfaces
  // it. Confirm / require-fresh / training / owner-review / inconclusive all keep the risk visible.
  // Cleared proof IDs are indexed PER SOURCE TYPE so a clearing decision only eases its own source.
  let proofRiskAdjudications: ProofRiskAdjudicationView[] | null = null;
  if (typeof deps.proofRiskAdjudications === "function") {
    proofRiskAdjudications = await deps.proofRiskAdjudications(workspaceId);
  }
  const clearedBySource = new Map<string, Set<string>>();
  for (const adj of proofRiskAdjudications ?? []) {
    if (!clearsFinding(adj.outcome)) continue;
    const set = clearedBySource.get(adj.sourceType) ?? new Set<string>();
    if (adj.sourceRef) set.add(adj.sourceRef);
    for (const pid of adj.proofIds) set.add(pid);
    clearedBySource.set(adj.sourceType, set);
  }
  const clearedReused = clearedBySource.get(AdjudicationSourceType.REUSED_HASH_FINDING) ?? new Set<string>();
  const clearedGaming = clearedBySource.get(AdjudicationSourceType.ANTI_GAMING_SIGNAL) ?? new Set<string>();
  const clearedCredibility = clearedBySource.get(AdjudicationSourceType.CREDIBILITY_CONCERN) ?? new Set<string>();
  const clearedDispute = clearedBySource.get(AdjudicationSourceType.PROOF_DISPUTE) ?? new Set<string>();

  // PROOF_DISPUTE clearing: drop the cleared dispute(s) from the dispute-derived profit/constraint
  // signals (reduces owner-review burden) — but the proof.disputed audit + PROOF_OUTCOME_INTEGRITY
  // are audit-derived and stay untouched (a cleared dispute is never marked "good work").
  const activeDisputeRisks = (disputeRisk?.risks ?? []).filter((r) => !clearedDispute.has(r.proofId));
  const da = disputeRisk
    ? recomputeDisputeAggregates(activeDisputeRisks)
    : undefined;

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
    // Linked delivery/pricing complaints (per-event model) → DELIVERY / PRICING constraints.
    complaintDeliveryCount: cr?.deliveryCount ?? 0,
    complaintPricingCount: cr?.pricingCount ?? 0,
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
    // Linked delivery/pricing complaints (per-event model) → DELIVERY_DELAY_COST / pricing leak,
    // sized only when a real amount was entered on the event (else qualitative / NEEDS_DATA).
    deliveryComplaintCount: cr?.deliveryCount ?? 0,
    deliveryComplaintImpactAmount: cr?.measuredDeliveryImpact ?? null,
    pricingComplaintCount: cr?.pricingCount ?? 0,
    pricingComplaintImpactAmount: cr?.measuredPricingImpact ?? null,
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

  // Deterministic reused-hash / duplicate-proof precheck — workspace-scoped, policy-aware (excludes
  // legitimate same-task reuse, ignores cross-workspace). Live path only; feeds the anti-gaming +
  // credibility signals with an explainable, per-operator reuse count and the matched proof IDs.
  let reusedProofFindings: ReusedHashAnalysis | null = null;
  if (typeof deps.reusedHash === "function") {
    const raw = await deps.reusedHash(workspaceId);
    // Suppress findings the owner has cleared (accept/dismiss) for the reused-hash source — evidence
    // is retained in the adjudication record + audit, but a cleared proof no longer re-surfaces (a NEW
    // reused proof has a fresh id not in the cleared set, so it still surfaces).
    if (clearedReused.size > 0) {
      const findings = raw.findings.filter((f) => !clearedReused.has(f.proofId));
      const submitter = new Map<string, { count: number; proofIds: string[] }>();
      for (const f of findings) {
        if (!f.actorId) continue;
        const s = submitter.get(f.actorId) ?? { count: 0, proofIds: [] };
        s.count++; s.proofIds.push(f.proofId); submitter.set(f.actorId, s);
      }
      reusedProofFindings = {
        ...raw, findings,
        submitterReuse: [...submitter.entries()].map(([actorId, v]) => ({ actorId, count: v.count, proofIds: v.proofIds })),
        needsReviewCount: findings.length,
        topFinding: findings.length > 0 ? (raw.topFinding && !clearedReused.has(raw.topFinding.proofId) ? raw.topFinding : findings[0]) : null,
      };
    } else {
      reusedProofFindings = raw;
    }
  }

  // Cross-Event Anti-Gaming Analytics — the single highest-risk staff/manager pattern from the
  // workspace's proof/review events, linked to the current constraint + profit leak. Only runs
  // when the client exposes proof.findMany (the live path); a DI mock without it → null (no fake).
  let topGamingSignal: GamingSignal | null = null;
  let topCredibilityConcern: CredibilityFinding | null = null;
  let fastCompletionSignal: TimingSignal | null = null;
  let escalationTimingSignal: TimingSignal | null = null;
  let totalProofCount: number | null = null;
  let weakProofCount: number | null = null;
  let overdueReviewCount: number | null = null;
  if (typeof deps.db.proof.findMany === "function") {
    // One workspace-scoped query feeds both anti-gaming and the credibility graph.
    const proofRows = await deps.db.proof.findMany({
      where: { workspaceId },
      select: { id: true, submittedByUserId: true, reviewedByUserId: true, proofType: true, status: true, duplicateFlagged: true, tamperSuspected: true, createdAt: true, reviewedAt: true, submittedAt: true, workStartedAt: true },
    });
    const nowMs = deps.now();
    const { actors, reviewers } = aggregateProofEvents(proofRows, nowMs);

    // Fake / reused / suspicious proof-DISPUTE → anti-gaming behaviour patterns. Join the governed
    // dispute trail (disputeRisk.risks: proofId + category + audit ref) to the proof's submitter/
    // reviewer + persisted tamper/duplicate fields. Derived from existing data — no new mutation.
    const disputeRecords: SuspiciousDisputeRecord[] = (disputeRisk?.risks ?? []).map((r) => ({ proofId: r.proofId, disputeCategory: r.disputeCategory, auditEventId: r.sourceAuditEventId }));
    const suspiciousRows: SuspiciousProofRow[] = proofRows
      .filter((p): p is typeof p & { id: string } => typeof p.id === "string")
      .map((p) => ({ id: p.id, submittedByUserId: p.submittedByUserId, reviewedByUserId: p.reviewedByUserId, duplicateFlagged: p.duplicateFlagged, tamperSuspected: p.tamperSuspected, status: p.status }));
    const { suspiciousProofActors, suspiciousReviewers } = aggregateSuspiciousProof(disputeRecords, suspiciousRows);

    // Deterministic reused-hash reuse per operator (from the precheck) — authoritative reused-proof source.
    const reusedHashActors = (reusedProofFindings?.submitterReuse ?? []).map((s) => ({ actorId: s.actorId, crossTaskReuseCount: s.count, proofIds: s.proofIds, matchType: "HASH" }));

    // Timing-evidence signals from persisted trusted timestamps. Fast-completion uses the proof rows'
    // workStartedAt/submittedAt; ignores-escalation uses the escalation table when the live client
    // exposes it. Absent timing → the evaluators return a fail-visible blocked status (never faked).
    const isoAt = new Date(nowMs).toISOString();
    const completionRows: CompletionTimingRow[] = proofRows
      .filter((p): p is typeof p & { id: string } => typeof p.id === "string")
      .map((p) => ({ proofId: p.id, submittedByUserId: p.submittedByUserId, proofType: p.proofType, status: p.status, workStartedAt: p.workStartedAt ?? null, submittedAt: p.submittedAt ?? null }));
    fastCompletionSignal = evaluateFastCompletion({ workspaceId, rows: completionRows, evaluatedAt: isoAt });

    if (typeof deps.db.escalation?.findMany === "function") {
      const escRows = await deps.db.escalation.findMany({
        where: { workspaceId },
        select: { id: true, assignedTarget: true, severity: true, status: true, createdAt: true, dueAt: true, acknowledgedAt: true, resolvedAt: true },
      });
      const timingRows: EscalationTimingRow[] = escRows.map((e) => ({ escalationId: e.id, assignedTarget: e.assignedTarget, severity: e.severity, status: e.status, createdAt: e.createdAt, dueAt: e.dueAt, acknowledgedAt: e.acknowledgedAt, resolvedAt: e.resolvedAt }));
      escalationTimingSignal = evaluateEscalationTiming({ workspaceId, rows: timingRows, nowMs, evaluatedAt: isoAt });
    }

    const gamingAnalysis = identifyGamingSignals({
      workspaceId, actors, reviewers, suspiciousProofActors, suspiciousReviewers,
      reusedHashActors: reusedProofFindings ? reusedHashActors : undefined,
      fastCompletion: fastCompletionSignal,
      escalationTiming: escalationTimingSignal,
      currentConstraint: topConstraint?.constraintType ?? null,
      topProfitLeakType: topProfitLeak?.leakType ?? null,
      evaluatedAt: isoAt,
    });
    // Suppress a gaming signal the owner cleared (accept/dismiss) for the ANTI_GAMING_SIGNAL source —
    // only when every supporting proof is cleared; a new supporting proof re-surfaces it.
    topGamingSignal = gamingAnalysis.signals.find((s) => !isFindingSuppressed(s.supportingProofIds, clearedGaming)) ?? null;

    // Evidence Credibility Graph — which proof/staff/reviewer/process can be trusted, and why.
    const credAggregates = aggregateCredibility(proofRows, nowMs);
    const credibilityAnalysis = buildEvidenceCredibility({
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
      // Deterministic reused-hash reuse per submitter (from the precheck) → attributed REUSED_PROOF concern.
      submitterReusedHash: reusedProofFindings?.submitterReuse,
      missingSources: complaintReworkLinks && complaintReworkLinks.aggregates.complaintLinkedCount > 0 ? [] : ["no complaint event linked to accepted proof yet"],
      evaluatedAt: new Date(nowMs).toISOString(),
    });
    // Suppress a credibility concern the owner cleared (accept/dismiss) for the CREDIBILITY_CONCERN
    // source — only when every supporting proof is cleared; a new supporting proof re-surfaces it.
    topCredibilityConcern = credibilityAnalysis.findings.find((f) => !isFindingSuppressed(f.supportingProofIds, clearedCredibility)) ?? null;

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
    // Operational-event resolution/aging health (live path only); null → OPERATIONAL_EVENT_RESOLUTION
    // NOT_MEASURABLE when no complaint/rework events exist.
    operationalEventHealth: complaintReworkLinks
      ? {
          activeCount: complaintReworkLinks.eventHealth.activeCount,
          overdueCount: complaintReworkLinks.eventHealth.overdueCount,
          overdueSevereCount: complaintReworkLinks.eventHealth.overdueSevereCount,
          totalCount: complaintReworkLinks.eventHealth.events.length,
          escalationTriggered: complaintReworkLinks.eventHealth.escalationTriggered,
        }
      : null,
    // Honest: these sources are not persisted for a runtime metric yet.
    opportunityEnvelopeFields: null,
    startupDataAvailable: false,
    isolationTestPassed: null,
    evaluatedAt: new Date(deps.now()).toISOString(),
  });

  // Process Intelligence v1 — where the process is actually breaking, over the already-derived,
  // already-adjudication-suppressed signal/event chain. Pure read model; a cleared proof-risk finding
  // (suppressed top signal → null) cannot drive an active process failure; confirm/require-fresh does.
  const processIntelligence: ProcessIntelligenceAnalysis | null = totalProofCount === null ? null : buildProcessIntelligence({
    workspaceId,
    topGamingSignal: topGamingSignal
      ? { signalType: topGamingSignal.signalType, actorId: topGamingSignal.actorId, actorRole: topGamingSignal.actorRole, severity: topGamingSignal.severity, supportingProofIds: topGamingSignal.supportingProofIds, ownerExplanation: topGamingSignal.ownerExplanation }
      : null,
    topCredibilityConcern: topCredibilityConcern
      ? { signalType: topCredibilityConcern.signalType, entityId: topCredibilityConcern.entityId, entityType: topCredibilityConcern.entityType, severity: topCredibilityConcern.severity, supportingProofIds: topCredibilityConcern.supportingProofIds }
      : null,
    timingEvidence: (fastCompletionSignal || escalationTimingSignal)
      ? {
          fastCompletion: fastCompletionSignal ? { status: fastCompletionSignal.status, actorId: fastCompletionSignal.actorId, severity: fastCompletionSignal.severity, supportingProofIds: fastCompletionSignal.supportingProofIds } : null,
          escalationTiming: escalationTimingSignal ? { status: escalationTimingSignal.status, actorId: escalationTimingSignal.actorId, severity: escalationTimingSignal.severity, supportingProofIds: escalationTimingSignal.supportingProofIds } : null,
        }
      : null,
    reusedProofFindings: reusedProofFindings ? { submitterReuse: reusedProofFindings.submitterReuse } : null,
    complaintRework: complaintReworkLinks
      ? {
          submitterComplaints: complaintReworkLinks.submitterComplaints,
          submitterReworks: complaintReworkLinks.submitterReworks,
          aggregates: { complaintLinkedCount: complaintReworkLinks.aggregates.complaintLinkedCount, reworkLinkedCount: complaintReworkLinks.aggregates.reworkLinkedCount, qualityCount: complaintReworkLinks.aggregates.qualityCount, deliveryCount: complaintReworkLinks.aggregates.deliveryCount },
          eventHealth: {
            activeCount: complaintReworkLinks.eventHealth.activeCount,
            overdueCount: complaintReworkLinks.eventHealth.overdueCount,
            overdueSevereCount: complaintReworkLinks.eventHealth.overdueSevereCount,
            events: complaintReworkLinks.eventHealth.events.map((e) => ({ eventId: e.eventId, eventType: e.eventType, category: e.category, active: e.active, overdue: e.overdue })),
          },
        }
      : null,
    proofRiskAdjudications: proofRiskAdjudications?.map((a) => ({ id: a.id, sourceType: a.sourceType, sourceRef: a.sourceRef, status: a.status, outcome: a.outcome })) ?? null,
    weakProofCount, overdueReviewCount,
    ownerBottleneckItems: workloadBudget.ownerBottleneckItems,
    topProfitLeakType: topProfitLeak?.leakType ?? null,
    topConstraintType: topConstraint?.constraintType ?? null,
    evaluatedAt: new Date(deps.now()).toISOString(),
  });

  // Bottleneck → Correction Routing — turn the process breakdowns into proposed, trackable correction
  // actions. Pure derivation from processIntelligence; every correction is PROPOSED (never auto-approved).
  const processCorrections: ProcessCorrectionRouting | null = processIntelligence
    ? buildProcessCorrections(processIntelligence, workspaceId)
    : null;

  // SOP / Checklist Correction Engine — turn the corrections into governed draft SOP/checklist changes.
  // Pure derivation; every draft is DRAFT/PROPOSED/NEEDS_DATA (never auto-approved, never auto-applied).
  const sopChecklistCorrections: SopChecklistCorrectionAnalysis | null = (processIntelligence && processCorrections)
    ? buildSopChecklistCorrections(processIntelligence, processCorrections, workspaceId)
    : null;

  // Staff Training Assignment Engine — turn findings/corrections/SOP drafts into governed, evidence-backed
  // training/review recommendations. Pure derivation; every assignment is PROPOSED/NEEDS_DATA, coaching only.
  const trainingAssignments: TrainingAssignmentAnalysis | null = (processIntelligence && processCorrections && sopChecklistCorrections)
    ? buildTrainingAssignments(processIntelligence, processCorrections, sopChecklistCorrections, workspaceId)
    : null;

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

  return { view, whatChanged: changes, beginnerExplanation, stepByStep, archetype: ag.archetype, generatedFromLiveData: true, workloadBudget, topConstraint, topProfitLeak, topGamingSignal, topCredibilityConcern, businessControlHealth, controlCorrelations, proofOutcomeLinkage: proofOutcomeReport, disputeRisk, complaintReworkLinks, operationalEventHealth: complaintReworkLinks?.eventHealth ?? null, reusedProofFindings, proofRiskAdjudications, proofRiskAdjudicationSummary: proofRiskAdjudications ? summarizeAdjudications(proofRiskAdjudications) : null, timingEvidence: (fastCompletionSignal || escalationTimingSignal) ? { fastCompletion: fastCompletionSignal, escalationTiming: escalationTimingSignal } : null, processIntelligence, processCorrections, sopChecklistCorrections, trainingAssignments };
}

function prevState(row: GuidanceSnapshotRow): BusinessStateSnapshot {
  return {
    cashRunwayDays: row.cashRunwayDays, netMarginPct: row.netMarginPct, complaintsCount: row.complaintsCount,
    reworkCount: row.reworkCount, capacityUtilizationPct: row.capacityUtilizationPct, staffOverloadPct: row.staffOverloadPct,
    ownerLoadPct: row.ownerLoadPct, churnRiskScore: row.churnRiskScore, supplierInventoryRiskScore: row.supplierInventoryRiskScore,
    overdueProofCount: row.overdueProofCount, outcomeChecksDue: row.outcomeChecksDue, growthReadinessTier: row.growthReadinessTier,
  };
}
