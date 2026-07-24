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
import { aggregateProofEvents, identifyGamingSignals, aggregateSuspiciousProof, type GamingSignal, type SuspiciousDisputeRecord, type SuspiciousProofRow } from "@/domain/owner-mode/anti-gaming-analytics";
import { evaluateFastCompletion, evaluateEscalationTiming, type TimingSignal, type CompletionTimingRow, type EscalationTimingRow } from "@/domain/owner-mode/timing-evidence";
import { buildProcessIntelligence, type ProcessIntelligenceAnalysis } from "@/domain/owner-mode/process-intelligence";
import { buildProcessCorrections, type ProcessCorrectionRouting } from "@/domain/owner-mode/bottleneck-correction-routing";
import { buildSopChecklistCorrections, type SopChecklistCorrectionAnalysis } from "@/domain/owner-mode/sop-checklist-correction-engine";
import { buildTrainingAssignments, type TrainingAssignmentAnalysis } from "@/domain/owner-mode/staff-training-assignment-engine";
import { buildEffectivenessEvaluations, type EffectivenessAnalysis, type EffectivenessInputItem } from "@/domain/owner-mode/sop-training-effectiveness-loop";
import { correctionExecutionStateFromTask } from "@/domain/owner-mode/effectiveness-attribution";
import { buildOwnerWorkloadReduction, type OwnerWorkloadReductionAnalysis, type WorkloadSignals } from "@/domain/owner-mode/owner-workload-reduction";
import { buildApprovalPolicy, type ApprovalPolicyAnalysis, type PolicyActionCandidate, type PolicyActionType, type RiskCategory, type ImpactLevel, type PolicyConfidence } from "@/domain/owner-mode/approval-threshold-policy";
import { buildCapabilityGapDetector, type CapabilityGapAnalysis, type CapabilityGapSignal, type MissingCapabilityType, type GapConfidence } from "@/domain/owner-mode/system-capability-gap-detector";
import { buildCashProfitProtection, type CashProfitProtectionAnalysis, type CashRiskState } from "@/domain/owner-mode/cash-profit-protection";
import { buildProcessExecutionBridge, computeCanStart, type ProcessExecutionBridgeAnalysis } from "@/domain/owner-mode/process-execution-bridge";
import { buildBridgeExpansion } from "@/domain/owner-mode/process-execution-bridge-expansion";
import { getPersistedProcessTasks } from "@/services/owner-mode/process-execution-bridge.service";
import { buildExternalOpportunityIntelligence, type ExternalOpportunityAnalysis, type RawOpportunitySignal } from "@/domain/owner-mode/external-opportunity-intelligence";
import { buildOpportunityValidationPlan, type OpportunityValidationAnalysis } from "@/domain/owner-mode/opportunity-validation-experiment-engine";
import { buildOpportunityPortfolio, type OpportunityPortfolioAnalysis } from "@/domain/owner-mode/opportunity-portfolio-capital-allocation";
import { buildOpportunityOperatingLayer, type OpportunityOperatingAnalysis, type BusinessStateContext } from "@/domain/owner-mode/opportunity-operating-layer";
import { mapPersistedSignalToRaw, type PersistedIntakeRow } from "@/domain/owner-mode/external-opportunity-intake";
import type { ValidationOutcomeView } from "@/services/owner-mode/validation-outcome.service";
import { deriveOpportunityExecutionTasks, type OpportunityExecutionAnalysis, type PersistedTaskStatus } from "@/domain/owner-mode/opportunity-execution";
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
import { deriveBusinessConditionSignals, type DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";
import { analyzeBusinessTrend, type TrendAlert, type BusinessMetricName, type MetricDataPoint } from "@/domain/owner-mode/business-state-timeline";
import { checkDoNotRepeatForGuidance, type DoNotRepeatAnnotation } from "@/services/owner-mode/do-not-repeat.service";
import { buildObjectivePortfolio, type ObjectiveType, type ObjectiveHealthStatus } from "@/domain/owner-mode/objective-portfolio";
export type { DoNotRepeatAnnotation };

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

interface RetentionCohortRow {
  avgMonthlyChurn: number;
  cohortMonth: string;
}

interface PriceTierRow {
  entryPrice: number;
  variableCost: number | null;
  allocatedCost: number | null;
  status: string;
}

interface SalesDealRow {
  value: number;
  probability: number;
  stage: string;
}

interface MetricSnapshotForTrend {
  periodEnd: Date;
  revenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  newCustomers: number | null;
  averageOrderValue: number | null;
  refundAmount: number | null;
  rewashCount: number | null;
  complaintCount: number | null;
  receivables: number | null;
  marketingSpend: number | null;
  staffProductivity: number | null;
}

interface GuidanceDb {
  ownerCashflowCycle: { findFirst(args: unknown): Promise<CycleRow | null> };
  ownerFinanceCycle: { findFirst(args: unknown): Promise<CycleRow | null> };
  ownerEmployeeWorkloadSnapshot: { findFirst(args: unknown): Promise<EmployeeRow | null> };
  ownerWorkloadSnapshot: { findFirst(args: unknown): Promise<OwnerRow | null> };
  ownerCapacitySnapshot: { findFirst(args: unknown): Promise<CapacityRow | null> };
  ownerMetricSnapshot: {
    findFirst(args: unknown): Promise<MetricRow | null>;
    /** Optional — for trend analysis; present on the live client. */
    findMany?(args: { where: Record<string, unknown>; select: Record<string, boolean>; orderBy: Record<string, unknown>; take: number }): Promise<MetricSnapshotForTrend[]>;
  };
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
  /**
   * Optional — retention cohorts table (present on the live client).
   * Used to derive churn risk from DB-persisted cohort data rather than the metric snapshot ratio.
   * When absent (DI unit test), churnRiskScore falls back to the metric-based repeat-customer ratio.
   */
  retentionCohort?: {
    findMany(args: unknown): Promise<RetentionCohortRow[]>;
  };
  /**
   * Optional — price tiers table (present on the live client).
   * Used to derive avgActiveMargin for the profit-leak radar (0..1 fractional margin).
   * When absent (DI unit test), marginPct stays null — honestly unknown, not fabricated.
   */
  growthPriceTier?: {
    findMany(args: unknown): Promise<PriceTierRow[]>;
  };
  /**
   * Optional — sales deal records table (present on the live client).
   * Used to compute salesPipelineSummary (open deal count + weighted pipeline value).
   * When absent (DI unit test), salesPipelineSummary is null — honestly unknown, not fabricated.
   */
  salesDealRecord?: {
    findMany(args: unknown): Promise<SalesDealRow[]>;
  };
  /** Optional — do-not-repeat rules; present on the live client. */
  ownerDoNotRepeatRule?: {
    findFirst(args: {
      where: { workspaceId: string; memoryKey: { in: string[] }; blocksRepetition: boolean; active: boolean };
      orderBy: { createdAt: "desc" };
    }): Promise<{ memoryKey: string; summary: string; reason: string; changedContextExplanation: string | null; blocksRepetition: boolean } | null>;
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
  /** Optional — live structured external opportunity signals (PASS 10 intake). Absent on a fake-DI test. */
  externalOpportunitySignals?: (workspaceId: string) => Promise<PersistedIntakeRow[]>;
  /** Optional — persisted opportunity validation outcomes (PASS 11) that gate live portfolio scaling. Absent on a fake-DI test. */
  validationOutcomes?: (workspaceId: string) => Promise<ValidationOutcomeView[]>;
  /** Optional — persisted opportunity execution-task statuses (PASS 12). Absent on a fake-DI test. */
  executionTasks?: (workspaceId: string) => Promise<Map<string, PersistedTaskStatus>>;
  /** Optional — active owner goal trajectory (Phase 5). Absent on a fake-DI test → null. */
  goalTrajectoryFn?: (workspaceId: string) => Promise<{
    goal: { targetType: string; targetAmount: number; targetCurrency: string; targetDate: Date };
    trajectory: {
      confidence: string;
      confidenceRationale: string;
      trajectoryMiss: boolean;
      projectedMonthsToGoal: number | null;
      currentTrajectoryDate: Date | null;
      gapToClose: number;
      requiredMonthlyImprovement: number;
      assumptions: string[];
    };
  } | null>;
  /** Optional — active operating policies for this workspace (Phase 7). Absent on a fake-DI test → null. */
  policyListFn?: (workspaceId: string) => Promise<Array<{ policyKey: string; isActive: boolean; hardBlock: boolean }>>;
  /** Optional — evaluate a single policy against a live measurement (Phase 7). Absent on a fake-DI test → null. */
  policyEvalFn?: (workspaceId: string, policyKey: string, value: number, unit: string) => Promise<{ decision: "ALLOW" | "WARN" | "BLOCK"; activeOverride?: { overriddenBy: string; reason: string; expiresAt: Date | null } | null }>;
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
  const { getActiveExternalOpportunitySignals } = await import("@/services/owner-mode/external-opportunity-intake.service");
  const { getActiveValidationOutcomes } = await import("@/services/owner-mode/validation-outcome.service");
  const { getPersistedExecutionTasks } = await import("@/services/owner-mode/opportunity-execution.service");
  const { computeActiveGoalTrajectory } = await import("@/services/owner-strategy/goal.service");
  const { listPolicies, evaluatePolicy } = await import("@/services/governance/operating-policy.service");
  return {
    db: db as unknown as GuidanceDb,
    uuid: () => randomUUID(),
    now: () => Date.now(),
    externalOpportunitySignals: (workspaceId: string) => getActiveExternalOpportunitySignals(workspaceId),
    validationOutcomes: (workspaceId: string) => getActiveValidationOutcomes(workspaceId),
    executionTasks: (workspaceId: string) => getPersistedExecutionTasks(workspaceId),
    correlations: (workspaceId: string) => getControlCorrelations(workspaceId),
    proofOutcome: (workspaceId: string) => getProofOutcomeLinkage(workspaceId),
    disputeRisk: (workspaceId: string) => getDisputeRiskAnalysis(workspaceId),
    complaintRework: (workspaceId: string) => getComplaintReworkLinks(workspaceId),
    reusedHash: (workspaceId: string) => getReusedHashFindings(workspaceId),
    proofRiskAdjudications: (workspaceId: string) => getProofRiskAdjudications(workspaceId),
    goalTrajectoryFn: (workspaceId: string) => computeActiveGoalTrajectory(workspaceId),
    policyListFn: (workspaceId: string) => listPolicies(workspaceId),
    policyEvalFn: (workspaceId: string, policyKey: string, value: number, unit: string) => evaluatePolicy(workspaceId, policyKey, value, unit),
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

// ─── Phase 2 attention signal types ─────────────────────────────────────────

export interface GoalAttentionSignal {
  state: "NO_GOAL" | "INSUFFICIENT_DATA" | "STALE" | "ON_TRACK" | "AT_RISK" | "NO_GROWTH";
  goalTitle: string | null;
  targetAmount: number | null;
  targetCurrency: string | null;
  targetDateIso: string | null;
  gapToClose: number | null;
  projectedMonthsToGoal: number | null;
  currentTrajectoryDateIso: string | null;
  requiredMonthlyImprovement: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  trajectoryMiss: boolean | null;
  assumptions: string[];
  beginnerExplanation: string;
}

export interface ActivePolicyDetail {
  policyKey: string;
  label: string;
  hardBlock: boolean;
  isCurrentlyTriggered: boolean;
  hasActiveOverride: boolean;
  decision: "ALLOW" | "WARN" | "BLOCK";
  overrideReason: string | null;
}

export interface PolicyAttentionSignal {
  configuredHardBlockCount: number;
  configuredWarningCount: number;
  triggeredBlockCount: number;
  triggeredWarningCount: number;
  activeOverrideCount: number;
  details: ActivePolicyDetail[];
}

export interface EscalationAttentionItem {
  id: string;
  title: string;
  severity: string;
  status: "OPEN";
  raisedAtIso: string;
  dueAtIso: string | null;
}

const GOAL_TYPE_LABEL: Record<string, string> = {
  PROFIT: "profit target",
  REVENUE: "revenue target",
  NET_WORTH: "net worth target",
  MULTIPLE: "business multiple",
};

const POLICY_LABEL: Record<string, string> = {
  growth_before_capacity: "Growth before capacity",
  high_cost_low_payback: "Cost vs payback",
};

const ISSUE_CATEGORY_TO_IMPACT_AREA: Record<string, string> = {
  CASH_DANGER: "cash",
  CUSTOMER_SERVICE_FAILURE: "operations",
  OVERLOAD: "management",
  PROFIT_LEAK: "finance",
  CAPACITY_BOTTLENECK: "operations",
  COMPLIANCE_SAFETY_RISK: "compliance",
  BLOCKED_EXECUTION: "operations",
  PENDING_PROOF_OUTCOME: "governance",
  GROWTH_OPPORTUNITY: "growth",
  PROCESS_IMPROVEMENT: "operations",
};

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
  /**
   * SOP / Training Effectiveness Loop — did the correction/training work? Compares the targeted problem's
   * metric in the previous owner-guidance snapshot (baseline) against the current one, per finding with a
   * routed correction. Honest INSUFFICIENT_DATA when there is no baseline. Null on the fake-DI path or when
   * there is no correction to evaluate.
   */
  sopTrainingEffectiveness: EffectivenessAnalysis | null;
  /**
   * Process-Correction Execution Bridge (PASS 20) — the cockpit findings converted into GOVERNED execution
   * routes (route + owner + approval + evidence + completion + reassessment) so the owner sees the single top
   * bridged action to take, not a raw diagnosis to re-key. Read-only summary; persistence/completion is via
   * the process-execution-bridge service. Null when there are no bridgeable findings.
   */
  processExecution: ProcessExecutionBridgeAnalysis | null;
  /**
   * Owner Workload Reduction v2 — the avoidable owner burden (repeated adjudications, review burden,
   * approval bottleneck/backlog, low-risk interrupts, recurring complaints, manager over-escalation,
   * missing-data loops, training delegation) with a safe reduction recommendation and a risk guardrail.
   * High-risk decisions always keep owner approval. Null on the fake-DI path or when nothing is avoidable.
   */
  ownerWorkloadReduction: OwnerWorkloadReductionAnalysis | null;
  /**
   * Approval Threshold / Auto-Action Policy — for each action OpsIQ is currently considering (derived from
   * the proposed process corrections), the required approval before it may run: auto-allowed, manager,
   * owner, never auto-executed, or needs-data. High-harm/irreversible actions are hard-blocked; material
   * money/legal/reputation decisions stay owner-controlled; a capability gap keeps the human in the loop and
   * surfaces what OpsIQ would have to build first. Null on the fake-DI path or with no candidate actions.
   */
  approvalPolicy: ApprovalPolicyAnalysis | null;
  /**
   * OpsIQ Capability Gap Detector — the system features OpsIQ itself would have to build to close the gaps
   * it keeps hitting: decisions it cannot safely automate, missing operational data, and manual owner burden
   * it cannot yet remove. Each is a governed recommendation (never auto-adopted); material decisions stay
   * owner-controlled even after the capability exists. Null when no gap is observed.
   */
  capabilityGaps: CapabilityGapAnalysis | null;
  /**
   * Cash / Profit Protection — where the business is losing (or about to lose) cash or margin, and the one
   * protective action for each: short cash runway, thin-margin work, pricing/discount leaks, rework/delivery/
   * labour cost, under-priced B2B, working-capital strain, and honest data gaps. Risk is a type + severity +
   * a real metric value (or null), never a fabricated amount; material money decisions keep owner review.
   * Null when there is no real activity or financial context to protect.
   */
  cashProfitProtection: CashProfitProtectionAnalysis | null;
  /**
   * External Opportunity Intelligence v1 — potentially profitable opportunities suggested by structured,
   * evidence-backed external/customer signals, each gated by evidence, cash safety, owner-workload awareness,
   * capability fit, and legal/compliance risk. No candidate is ever ready-to-scale; every one requires cheap
   * validation first. Null when no evidence-backed opportunity signal exists.
   */
  externalOpportunityIntelligence: ExternalOpportunityAnalysis | null;
  opportunityValidation: OpportunityValidationAnalysis | null;
  opportunityPortfolio: OpportunityPortfolioAnalysis | null;
  opportunityOperating: OpportunityOperatingAnalysis | null;
  opportunityValidationOutcomes: ValidationOutcomeView[] | null;
  opportunityExecution: OpportunityExecutionAnalysis | null;
  /**
   * Sales Pipeline Summary — open deal count and total weighted pipeline value (sum of value × probability)
   * for all open (non-closed) deals in this workspace. Null when no salesDealRecord table is available
   * in the DI context (unit tests) or when no deals have been recorded.
   */
  salesPipelineSummary: { openDealsCount: number; weightedPipelineValue: number } | null;
  /**
   * Goal Attention Signal — owner-facing 6-state DTO derived from the active goal + trajectory.
   * Null when goalTrajectoryFn is unavailable (fake-DI tests).
   */
  goalAttentionSignal: GoalAttentionSignal | null;
  /**
   * Policy Attention Signal — triggered vs configured breakdown across all workspace policies.
   * Null when policyListFn/policyEvalFn are unavailable (fake-DI tests).
   */
  policyAttentionSignal: PolicyAttentionSignal | null;
  /**
   * Trend Alerts — pairwise directional metric alerts from the last two metric snapshots.
   * null = insufficient history (fewer than 2 snapshots or duplicate period timestamps);
   * [] = valid pair but no alert thresholds exceeded.
   */
  trendAlerts: TrendAlert[] | null;
  /**
   * Do-Not-Repeat Annotation — whether the top priority guidance action is blocked by an
   * active do-not-repeat rule. Null when no matching rule exists.
   */
  doNotRepeatAnnotation: DoNotRepeatAnnotation | null;
  /**
   * Active Escalations — open escalations requiring owner attention (OPEN status only, max 5).
   * null = escalation table unavailable; [] = no open escalations.
   */
  activeEscalations: EscalationAttentionItem[] | null;
  /**
   * Derived Business Condition Signals — the 11 risk-dimension fields derived from the
   * snapshot data already read during Now View synthesis. Never "unknown" when the source
   * records exist; "unknown" only when no supporting data is available for that dimension.
   */
  derivedBusinessCondition: DerivedBusinessConditionSignals | null;
  /**
   * Phase 3 — Execution Lifecycle View: groups all ProcessExecutionTasks by phase so the
   * cockpit can render the full owner execution loop (decision → execution → verification).
   * Null when unavailable (DB error or table missing). Never null when tasks exist.
   */
  executionLifecycle: OwnerExecutionLifecycleView | null;
  /**
   * Phase 4 — Business Operating System summary: objective portfolio health, resource
   * utilization, top risks, latest goal arbitration, constraint + KPI counts, and cost
   * attribution coverage. Null when unavailable (DB error or no Phase 4 data yet).
   */
  businessOperatingSystem: BusinessOperatingSystemView | null;
}

// ── Phase 3: Execution Lifecycle types ──────────────────────────────────────

export interface ExecutionLifecycleItem {
  taskId: string;
  taskKey: string;
  status: string;
  ownerVisibleSummary: string;
  severity: string;
  assignedRole: string;
  dueAt: string | null;
  progressPct: number | null;
  blockerActive: boolean;
  outcomeId: string | null;
  verificationClassification: string | null;
  verificationClassificationLabel: string | null;
  expectedBenefit: string | null;
  baselineMetricName: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  requiredEvidence: string[];
  evidenceRefs: string[];
  evidenceComplete: boolean;
  canAcknowledge: boolean;
  canStart: boolean;
  canRecordProgress: boolean;
  canRecordOutcome: boolean;
  canVerify: boolean;
}

export interface OwnerExecutionLifecycleView {
  requiresDecision: ExecutionLifecycleItem[];
  inExecution: ExecutionLifecycleItem[];
  awaitingVerification: ExecutionLifecycleItem[];
  recentlyVerified: ExecutionLifecycleItem[];
  totalPendingVerification: number;
}

// ── Phase 4: Business Operating System types ─────────────────────────────────

export interface BusinessOperatingSystemObjectiveSummary {
  objectiveId: string;
  title: string;
  objectiveType: string;
  status: string;
  priorityScore: number;
  health: ObjectiveHealthStatus;
  /** System-recommended portfolio decision from latest arbitration (null if not yet arbitrated). */
  portfolioDecision: string | null;
  portfolioRationale: string | null;
  /** Whether an owner override exists for this objective's arbitration record. */
  hasOverride: boolean;
  /** INTERNAL_OBJECTIVE or EXTERNAL_OPPORTUNITY (from latest arbitration portfolioDecisions). */
  candidateType: "INTERNAL_OBJECTIVE" | "EXTERNAL_OPPORTUNITY";
}

export interface BusinessOperatingSystemConstraintSummary {
  constraintId: string;
  title: string;
  constraintType: string;
  bindingScore: number;
  status: string;
  remediationAction: string | null;
}

export interface BusinessOperatingSystemRiskSummary {
  riskId: string;
  title: string;
  severity: number;
  status: string;
  riskCategory: string;
}

export interface BusinessOperatingSystemView {
  totalActiveObjectives: number;
  objectiveHealthCounts: { ON_TRACK: number; AT_RISK: number; BLOCKED: number; CRITICAL: number };
  topObjectives: BusinessOperatingSystemObjectiveSummary[];
  activePoolCount: number;
  resourceUtilizationPct: number | null;
  latestArbitration: {
    winnerObjectiveId: string | null;
    dominantConstraint: string | null;
    arbitratedAt: string;
  } | null;
  /** Owner override on the latest arbitration, if any. Shown alongside (not instead of) system recommendation. */
  latestArbitrationOverride: {
    decision: string;
    overrideRationale: string;
    actorId: string;
    createdAt: string;
  } | null;
  topRisks: BusinessOperatingSystemRiskSummary[];
  /** Top active constraints by bindingScore — for cockpit constraint list. */
  activeConstraints: BusinessOperatingSystemConstraintSummary[];
  activeConstraintCount: number;
  kpiCount: number;
  costAttributionCoverage: number | null;
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
): Promise<{ ctx: GuidanceContext; state: BusinessStateSnapshot; ag: ArchetypeGuidance; raw: { cashState?: string; finState?: string; discountAmount: number | null; revenue: number | null; b2bRevenue: number | null; newCustomers: number | null; repeatCustomers: number | null }; avgActiveMargin: number | null; pipelineSummary: { openDealsCount: number; weightedPipelineValue: number } | null }> {
  const scope = businessId ? { workspaceId, businessId } : { workspaceId };
  const order = { createdAt: "desc" as const };
  const periodOrder = { periodEnd: "desc" as const };
  const overdueBefore = new Date(deps.now() - PROOF_OVERDUE_AGE_MS);
  const nowDate = new Date(deps.now());

  const CLOSED_STAGES = ["CLOSED_WON", "CLOSED_LOST"];
  const [cash, fin, emp, own, cap, metric, supplier, business, overdueProofCount, outcomeOpen, reassessOpen, latestCohorts, activePriceTiers, activeOpenDeals] = await Promise.all([
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
    deps.db.retentionCohort
      ? deps.db.retentionCohort.findMany({ where: { workspaceId }, orderBy: { cohortMonth: "desc" }, take: 3, select: { avgMonthlyChurn: true, cohortMonth: true } })
      : Promise.resolve([] as RetentionCohortRow[]),
    deps.db.growthPriceTier
      ? deps.db.growthPriceTier.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { entryPrice: true, variableCost: true, allocatedCost: true, status: true } })
      : Promise.resolve([] as PriceTierRow[]),
    deps.db.salesDealRecord
      ? deps.db.salesDealRecord.findMany({ where: { workspaceId, stage: { notIn: CLOSED_STAGES } }, select: { value: true, probability: true, stage: true } })
      : Promise.resolve([] as SalesDealRow[]),
  ]);

  // Compute avgActiveMargin from ACTIVE tiers that have cost data (0..1 fractional, same unit as profit-leak-radar marginPct).
  const tiersWithCost = activePriceTiers.filter(
    (t) => t.entryPrice > 0 && (t.variableCost !== null || t.allocatedCost !== null)
  );
  const avgActiveMargin =
    tiersWithCost.length > 0
      ? tiersWithCost.reduce((sum, t) => {
          const totalCost = (t.variableCost ?? 0) + (t.allocatedCost ?? 0);
          return sum + Math.max(0, Math.min(1, (t.entryPrice - totalCost) / t.entryPrice));
        }, 0) / tiersWithCost.length
      : null;

  // Compute salesPipelineSummary: open deal count + weighted value (sum of value × probability).
  const weightedPipelineValue = activeOpenDeals.reduce((sum, d) => sum + d.value * d.probability, 0);
  const pipelineSummary: { openDealsCount: number; weightedPipelineValue: number } | null = deps.db.salesDealRecord
    ? { openDealsCount: activeOpenDeals.length, weightedPipelineValue }
    : null;

  const ag = archetypeGuidance(business?.businessType);
  const cashState = cash?.cashflowState;
  const finState = fin?.survivalState;
  const cashSafe = !!cashState && !!finState && SAFE_STATES.has(cashState) && SAFE_STATES.has(finState);
  const staffOverloaded = emp?.overburdened === true;
  const ownerOverloaded = own?.overloaded === true || own?.bottleneckRisk === true;
  const capacityGrowthSafe = cap?.growthSafe === true;
  const supplierRiskScore = supplier?.riskScore ?? 0;
  const supplierRiskHigh = supplierRiskScore >= 0.5;

  const complaints = Math.round(metric?.complaintCount ?? 0);
  const rework = Math.round(metric?.rewashCount ?? 0);
  const newC = metric?.newCustomers ?? 0;
  const repeatC = metric?.repeatCustomers ?? 0;
  const metricChurnRate = newC + repeatC > 0 ? Math.max(0, 1 - repeatC / (newC + repeatC)) : 0;
  // Prefer DB-persisted cohort churn (scaled to 0–1 risk score) over the metric snapshot ratio.
  const cohortAvgChurn = latestCohorts[0]?.avgMonthlyChurn ?? null;
  const churnRiskScore = cohortAvgChurn !== null ? Math.min(1, cohortAvgChurn * 5) : metricChurnRate;
  const retentionRiskHigh = churnRiskScore >= 0.5;
  const growthGatePassed = cashSafe && capacityGrowthSafe && !supplierRiskHigh && !retentionRiskHigh;
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
    staffOverloadPct: (emp?.utilizationPct ?? 0) / 100,
    ownerLoadPct: (own?.dailyLoadPct ?? 0) / 100,
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
    avgActiveMargin,
    pipelineSummary,
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

// ── Phase 3: Execution Lifecycle ────────────────────────────────────────────

const VERIFICATION_CLASS_LABELS: Record<string, string> = {
  SUCCESS: "Verified success",
  PARTIAL_SUCCESS: "Partial success",
  NO_MEASURABLE_IMPACT: "No measurable impact",
  FAILURE: "Did not work",
  NEGATIVE_IMPACT: "Made things worse",
  INCONCLUSIVE: "Inconclusive",
  OBSERVATION_WINDOW_OPEN: "Observation window open",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

const RECENTLY_VERIFIED_WINDOW_DAYS = 90;

/**
 * Build the execution lifecycle view for Phase 3. Grouped by stage:
 *   requiresDecision  — PROPOSED tasks awaiting owner decision
 *   inExecution       — ACKNOWLEDGED + IN_PROGRESS + BLOCKED + NEEDS_DATA
 *   awaitingVerification — COMPLETED + OUTCOME_RECORDED + OUTCOME_DISPUTED
 *   recentlyVerified  — OUTCOME_VERIFIED in last 90 days
 *
 * Wrapped in try/catch — returns null on any DB error so the Now View remains operational.
 */
async function buildExecutionLifecycle(
  workspaceId: string,
  db: GuidanceDeps["db"]
): Promise<OwnerExecutionLifecycleView | null> {
  try {
    const cutoff = new Date(Date.now() - RECENTLY_VERIFIED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const tasks = await (db as any).processExecutionTask.findMany({
      where: {
        workspaceId,
        OR: [
          { status: { in: ["PROPOSED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "NEEDS_DATA", "COMPLETED", "OUTCOME_RECORDED", "OUTCOME_DISPUTED"] } },
          { status: "OUTCOME_VERIFIED", updatedAt: { gte: cutoff } },
        ],
      },
      orderBy: { priorityRank: "asc" },
      take: 500,
    });

    // Fetch latest progress record per task (most recent createdAt)
    const taskIds: string[] = tasks.map((t: { id: string }) => t.id);
    const progressRows: Array<{ taskId: string; progressPct: number | null; blockerActive: boolean }> = taskIds.length > 0
      ? await (db as any).processExecutionTaskProgress.findMany({
          where: { taskId: { in: taskIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["taskId"],
          select: { taskId: true, progressPct: true, blockerActive: true },
        })
      : [];

    const progressByTaskId = new Map(progressRows.map((p) => [p.taskId, p]));

    function toItem(t: Record<string, unknown>): ExecutionLifecycleItem {
      const status = t.status as string;
      const prog = progressByTaskId.get(t.id as string);
      const evidenceComplete = (t.evidenceRefs as string[]).length >= (t.requiredEvidence as string[]).length && (t.requiredEvidence as string[]).length > 0;
      const vClass = (t.verificationClassification as string | null) ?? null;
      return {
        taskId: t.id as string,
        taskKey: t.taskKey as string,
        status,
        ownerVisibleSummary: t.ownerVisibleSummary as string,
        severity: t.severity as string,
        assignedRole: t.actionOwner as string,
        dueAt: null,
        progressPct: prog?.progressPct ?? null,
        blockerActive: prog?.blockerActive ?? false,
        outcomeId: (t.outcomeId as string | null) ?? null,
        verificationClassification: vClass,
        verificationClassificationLabel: vClass ? (VERIFICATION_CLASS_LABELS[vClass] ?? vClass) : null,
        expectedBenefit: (t.expectedBenefit as string | null) ?? null,
        baselineMetricName: (t.baselineMetricName as string | null) ?? null,
        baselineValue: (t.baselineValue as number | null) ?? null,
        targetValue: (t.targetValue as number | null) ?? null,
        requiredEvidence: t.requiredEvidence as string[],
        evidenceRefs: t.evidenceRefs as string[],
        evidenceComplete,
        canAcknowledge: status === "PROPOSED",
        canStart: ["PROPOSED", "ACKNOWLEDGED", "BLOCKED", "NEEDS_DATA"].includes(status),
        canRecordProgress: ["ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED"].includes(status),
        canRecordOutcome: status === "COMPLETED",
        canVerify: ["OUTCOME_RECORDED", "OUTCOME_DISPUTED"].includes(status),
      };
    }

    const requiresDecision: ExecutionLifecycleItem[] = [];
    const inExecution: ExecutionLifecycleItem[] = [];
    const awaitingVerification: ExecutionLifecycleItem[] = [];
    const recentlyVerified: ExecutionLifecycleItem[] = [];

    for (const t of tasks) {
      const item = toItem(t);
      switch (t.status) {
        case "PROPOSED": requiresDecision.push(item); break;
        case "ACKNOWLEDGED": case "IN_PROGRESS": case "BLOCKED": case "NEEDS_DATA": inExecution.push(item); break;
        case "COMPLETED": case "OUTCOME_RECORDED": case "OUTCOME_DISPUTED": awaitingVerification.push(item); break;
        case "OUTCOME_VERIFIED": recentlyVerified.push(item); break;
      }
    }

    return {
      requiresDecision,
      inExecution,
      awaitingVerification,
      recentlyVerified,
      totalPendingVerification: awaitingVerification.length,
    };
  } catch (err) {
    console.error("[phase3] buildExecutionLifecycle failed", err);
    return null;
  }
}

/** Direct export for DB tests: query Phase 3 execution lifecycle groups. */
export async function queryExecutionLifecycle(
  workspaceId: string,
  db: GuidanceDeps["db"]
): Promise<OwnerExecutionLifecycleView | null> {
  return buildExecutionLifecycle(workspaceId, db);
}

// ── Phase 4: Business Operating System summary ───────────────────────────────

async function buildBusinessOperatingSystem(
  workspaceId: string,
  db: GuidanceDeps["db"],
): Promise<BusinessOperatingSystemView | null> {
  try {
    const dbAny = db as any;
    const now = Date.now();

    // 1. Active business objectives with blocking dependencies and child counts
    const rawObjectives: Array<{
      id: string; title: string; objectiveType: string; status: string;
      priorityScore: number; targetValue: number | null; currentValue: number | null;
      deadline: Date | null; linkedGoalId: string | null; parentId: string | null;
      blockedBy: { id: string }[]; _count: { children: number };
    }> = await dbAny.businessObjective.findMany({
      where: { workspaceId, status: "ACTIVE" },
      include: { blockedBy: { select: { id: true } }, _count: { select: { children: true } } },
    });

    // 2. Resource pool utilization
    const pools: Array<{ id: string; totalCapacity: number }> = await dbAny.resourcePool.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, totalCapacity: true },
    });
    const poolIds = pools.map((p) => p.id);
    const totalCapacity = pools.reduce((s, p) => s + p.totalCapacity, 0);
    let totalAllocated = 0;
    if (poolIds.length > 0) {
      const aggResult = await dbAny.resourceAllocation.aggregate({
        where: { workspaceId, poolId: { in: poolIds }, status: "ALLOCATED" },
        _sum: { allocationAmount: true },
      });
      totalAllocated = Number(aggResult._sum?.allocationAmount ?? 0);
    }
    const resourceUtilizationPct = totalCapacity > 0
      ? Math.min(100, Math.round((totalAllocated / totalCapacity) * 100))
      : null;

    // 3. Top risks by severity (active risks: IDENTIFIED, ASSESSED, MITIGATING, ACCEPTED)
    const topRisks: Array<{ id: string; title: string; severity: number; status: string; category: string }> =
      await dbAny.businessRiskEntry.findMany({
        where: { workspaceId, status: { in: ["IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED"] } },
        orderBy: { severity: "desc" },
        take: 3,
        select: { id: true, title: true, severity: true, status: true, category: true },
      });

    // 4. Latest goal arbitration + its owner override (if any) + portfolioDecisions JSON
    const latestArb: { id: string; winnerObjectiveId: string | null; dominantConstraint: string | null; arbitratedAt: Date; portfolioDecisions: unknown } | null =
      await dbAny.goalArbitrationRecord.findFirst({
        where: { workspaceId },
        orderBy: { arbitratedAt: "desc" },
        select: { id: true, winnerObjectiveId: true, dominantConstraint: true, arbitratedAt: true, portfolioDecisions: true },
      });
    const latestOverride: { decision: string; overrideRationale: string; actorId: string; createdAt: Date } | null =
      latestArb
        ? await dbAny.ownerArbitrationOverride.findFirst({
            where: { workspaceId, overriddenRecordId: latestArb.id },
            orderBy: { createdAt: "desc" },
            select: { decision: true, overrideRationale: true, actorId: true, createdAt: true },
          })
        : null;

    // Build a lookup: objectiveId → { decision, rationale, candidateType } from latest arbitration
    type PdRow = { objectiveId: string; decision: string; rationale: string; candidateType?: string };
    const portfolioDecisionMap = new Map<string, PdRow>();
    if (latestArb?.portfolioDecisions && Array.isArray(latestArb.portfolioDecisions)) {
      for (const pd of latestArb.portfolioDecisions as PdRow[]) {
        if (pd?.objectiveId) portfolioDecisionMap.set(pd.objectiveId, pd);
      }
    }

    // 5. Active constraints (top 5 by bindingScore) + count
    const activeConstraintRows: Array<{
      id: string; title: string; constraintType: string; bindingScore: number;
      status: string; remediationAction: string | null;
    }> = await dbAny.constraintResolutionRecord.findMany({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { bindingScore: "desc" },
      take: 5,
      select: { id: true, title: true, constraintType: true, bindingScore: true, status: true, remediationAction: true },
    }).catch(() => [] as typeof activeConstraintRows);
    const activeConstraintCount: number = await dbAny.constraintResolutionRecord.count({
      where: { workspaceId, status: "ACTIVE" },
    }).catch(() => 0);

    // 6. KPI ownership count
    const kpiCount: number = await dbAny.kPIOwnershipRecord.count({ where: { workspaceId } });

    // 7. Cost attribution coverage (% of spend entries linked to an objective)
    const [totalSpend, linkedSpend] = await Promise.all([
      dbAny.spendEntry.count({ where: { workspaceId } }),
      dbAny.spendEntry.count({
        where: { workspaceId, linkedObjectiveId: { not: null } },
      }),
    ]);
    const costAttributionCoverage = totalSpend > 0
      ? Math.round(((linkedSpend as number) / (totalSpend as number)) * 100)
      : null;

    // Build portfolio view from raw objectives
    const portfolioInputs = rawObjectives.map((obj) => {
      const daysRemaining = obj.deadline
        ? Math.round((obj.deadline.getTime() - now) / 86_400_000)
        : null;
      const progressPct = obj.targetValue && obj.currentValue !== null
        ? Math.min(100, Math.round(((obj.currentValue ?? 0) / obj.targetValue) * 100))
        : 0;
      return {
        objectiveId: obj.id,
        parentId: obj.parentId,
        title: obj.title,
        objectiveType: obj.objectiveType as ObjectiveType,
        status: "ACTIVE" as const,
        priorityScore: obj.priorityScore,
        targetValue: obj.targetValue,
        currentValue: obj.currentValue,
        progressPct,
        deadlineDaysRemaining: daysRemaining,
        linkedGoalAligned: obj.linkedGoalId !== null,
        hasBlockingDependencies: obj.blockedBy.length > 0,
        resourceBudgetUsedPct: 0,
        childCount: obj._count.children,
        completedChildCount: 0,
      };
    });

    const portfolio = buildObjectivePortfolio(portfolioInputs);

    const topObjectives: BusinessOperatingSystemObjectiveSummary[] = portfolio.items
      .filter((i) => i.status === "ACTIVE")
      .sort((a, b) => (a.healthScore !== b.healthScore ? a.healthScore - b.healthScore : b.priorityScore - a.priorityScore))
      .slice(0, 5)
      .map((i) => {
        const pd = portfolioDecisionMap.get(i.objectiveId);
        return {
          objectiveId: i.objectiveId,
          title: i.title,
          objectiveType: i.objectiveType,
          status: i.status,
          priorityScore: i.priorityScore,
          health: i.healthStatus,
          portfolioDecision: pd?.decision ?? null,
          portfolioRationale: pd?.rationale ?? null,
          hasOverride: latestOverride !== null && latestArb?.winnerObjectiveId === i.objectiveId,
          candidateType: (pd?.candidateType as "INTERNAL_OBJECTIVE" | "EXTERNAL_OPPORTUNITY") ?? "INTERNAL_OBJECTIVE",
        };
      });

    return {
      totalActiveObjectives: portfolio.totalActive,
      objectiveHealthCounts: {
        ON_TRACK: portfolio.onTrackCount,
        AT_RISK: portfolio.atRiskCount,
        BLOCKED: portfolio.totalBlocked,
        CRITICAL: portfolio.criticalCount,
      },
      topObjectives,
      activePoolCount: pools.length,
      resourceUtilizationPct,
      latestArbitration: latestArb ? {
        winnerObjectiveId: latestArb.winnerObjectiveId,
        dominantConstraint: latestArb.dominantConstraint,
        arbitratedAt: latestArb.arbitratedAt.toISOString(),
      } : null,
      latestArbitrationOverride: latestOverride ? {
        decision: latestOverride.decision,
        overrideRationale: latestOverride.overrideRationale,
        actorId: latestOverride.actorId,
        createdAt: latestOverride.createdAt.toISOString(),
      } : null,
      topRisks: topRisks.map((r) => ({
        riskId: r.id,
        title: r.title,
        severity: r.severity,
        status: r.status,
        riskCategory: r.category,
      })),
      activeConstraints: activeConstraintRows.map((c) => ({
        constraintId: c.id,
        title: c.title,
        constraintType: c.constraintType,
        bindingScore: c.bindingScore,
        status: c.status,
        remediationAction: c.remediationAction,
      })),
      activeConstraintCount,
      kpiCount,
      costAttributionCoverage,
    };
  } catch (err) {
    console.error("[phase4] buildBusinessOperatingSystem failed", err);
    return null;
  }
}

/** Produce the live Owner Now View: assemble, diff vs prior snapshot, run orchestrator, persist. */
export async function getOwnerNowView(
  workspaceId: string,
  businessId: string | null,
  injected?: GuidanceDeps,
  actorId?: string,
): Promise<OwnerNowViewPayload> {
  // Best-effort overdue risk alert evaluation on every owner now-view load.
  if (actorId) {
    import("@/services/owner-mode/business-risk.service")
      .then(({ evaluateOverdueRiskAlerts }) =>
        evaluateOverdueRiskAlerts(workspaceId, actorId).catch(() => {})
      )
      .catch(() => {});
  }
  const deps = injected ?? (await resolveDefaultDeps());
  const { ctx, state, ag, raw, avgActiveMargin, pipelineSummary } = await assembleGuidanceContext(workspaceId, businessId, deps);

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
    marginPct: avgActiveMargin,
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

  // PASS 26: read the persisted execution tasks ONCE so effectiveness attribution uses the REAL execution state
  // (completed-with-evidence vs proposed/in-progress) rather than assuming nothing was executed, and so the
  // bridge status annotation below reuses the same read. Best-effort — an unavailable table yields [].
  const persistedProcessTasks = (processIntelligence && processCorrections)
    ? await getPersistedProcessTasks(workspaceId).catch(() => [])
    : [];

  // SOP / Training Effectiveness Loop — for each finding with a routed correction, compare the targeted
  // problem's metric in the previous snapshot (baseline) against the current one. A prior snapshot means the
  // problem has been under correction since the last review; with no baseline the loop returns
  // INSUFFICIENT_DATA. Attribution (PASS 26) uses the persisted execution state so an improvement is only
  // called effective when the correction was actually completed with evidence. Pure derivation — no new schema.
  const sopTrainingEffectiveness: EffectivenessAnalysis | null = (processIntelligence && processCorrections)
    ? buildEffectivenessEvaluations(
        deriveEffectivenessItems(processIntelligence, processCorrections, sopChecklistCorrections, trainingAssignments, prev, state, workspaceId, persistedProcessTasks),
        workspaceId,
        new Date(deps.now()).toISOString(),
      )
    : null;

  // Owner Workload Reduction v2 — the avoidable owner burden + a safe reduction recommendation. Pure
  // derivation over the findings/corrections/training + counted burden signals; high-risk stays owner-gated.
  const ownerWorkloadReduction: OwnerWorkloadReductionAnalysis | null = processIntelligence
    ? buildOwnerWorkloadReduction(
        deriveWorkloadSignals(processIntelligence, processCorrections, trainingAssignments, proofRiskAdjudications, weakProofCount, overdueReviewCount, workloadBudget.ownerBottleneckItems),
        workspaceId,
        new Date(deps.now()).toISOString(),
      )
    : null;

  // Approval Threshold / Auto-Action Policy — classify each proposed correction as an action candidate and
  // decide the required approval before OpsIQ may run it. Pure derivation over the routed corrections; the
  // DATA_INSUFFICIENT no-op is not a real action, so an empty/thin workspace yields no candidates → null
  // (nothing to govern). High-harm actions never arise from ordinary corrections.
  const approvalCandidates = processCorrections ? deriveApprovalCandidates(processCorrections) : [];
  const approvalPolicy: ApprovalPolicyAnalysis | null = approvalCandidates.length > 0
    ? buildApprovalPolicy({ candidates: approvalCandidates }, workspaceId, new Date(deps.now()).toISOString())
    : null;

  // OpsIQ Capability Gap Detector — turn the gaps OpsIQ keeps hitting (unautomatable decisions, missing
  // operational data, manual owner burden) into governed system feature recommendations. Pure derivation
  // over the already-computed approval policy + workload + corrections; no gaps → null.
  const capabilityGapSignals = deriveCapabilityGapSignals(approvalPolicy, ownerWorkloadReduction, processCorrections);
  const capabilityGaps: CapabilityGapAnalysis | null = capabilityGapSignals.length > 0
    ? buildCapabilityGapDetector({ signals: capabilityGapSignals, dataConfidence: gapConfidenceFromLevel(ctx.dataConfidence) }, workspaceId, new Date(deps.now()).toISOString())
    : null;

  // Cash / Profit Protection — where cash or margin is at risk, with one protective action each. Only real
  // financial readings feed it (defaulted 0s are treated as "no reading", never a fabricated cash crisis).
  // Computed only when there is real activity or a real financial context; otherwise null (nothing to protect).
  const hasRealActivity = Boolean(processIntelligence?.findings.some((f) => f.findingType !== "DATA_INSUFFICIENT")) || raw.cashState != null || raw.finState != null;
  const cashProfitProtection: CashProfitProtectionAnalysis | null = hasRealActivity
    ? buildCashProfitProtection({
        // PASS 19 / H4: the survival/finance states are CATEGORICAL, not measured figures. Feeding the
        // state→day/percent bucket constants as a metric implied a precision OpsIQ does not have (e.g. a
        // "CRITICAL" state rendered as "7 days runway"). Pass no measured figure and let the domain fire the
        // risk qualitatively from the categorical state (metricValue stays null — no false precision).
        cashRunwayDays: null,
        netMarginPct: null,
        cashRunwayState: (raw.cashState ?? null) as CashRiskState | null,
        netMarginState: (raw.finState ?? null) as CashRiskState | null,
        lowMarginJobCount: 0,
        pricingLeakCount: 0,
        discountLeakCount: 0,
        reworkCostEventCount: cr?.reworkLinkedCount ?? 0,
        deliveryCostEventCount: cr?.deliveryCount ?? 0,
        staffInefficiencyCount: 0,
        b2bUnderpricedCount: 0,
        overdueReceivableCount: 0,
        hasUnitEconomics: false,
        financialDataComplete: raw.cashState != null && raw.finState != null,
        supportingProofIds: [],
        supportingOperationalEventIds: [],
        supportingFinancialSnapshotIds: [],
      }, workspaceId, new Date(deps.now()).toISOString())
    : null;

  // Process-Correction Execution Bridge (PASS 20) — convert the diagnosed process corrections + cash/profit
  // findings into governed execution routes so the owner sees the top bridged ACTION (route/owner/evidence/
  // approval) instead of a raw diagnosis to re-key. Read-only here; a route is persisted/completed via the
  // process-execution-bridge service.
  // PASS 23 — bridge the remaining engines (workload / capability / standalone SOP / standalone training /
  // effectiveness re-check) DIRECTLY into the same governed substrate, not only through the correction router
  // (R2/R3). Specific SOP/training routes collapse the generic correction route for the same fix (no cockpit spam).
  const bridgeExpansion = buildBridgeExpansion(
    {
      workload: ownerWorkloadReduction, capability: capabilityGaps,
      sop: sopChecklistCorrections, training: trainingAssignments, effectiveness: sopTrainingEffectiveness,
    },
    workspaceId,
  );
  const processExecution: ProcessExecutionBridgeAnalysis | null =
    (processCorrections || cashProfitProtection || bridgeExpansion.routes.length > 0)
      ? buildProcessExecutionBridge(processCorrections, cashProfitProtection, workspaceId, new Date(deps.now()).toISOString(), bridgeExpansion)
      : null;
  // Reflect persisted task state so the cockpit shows the REAL status (PROPOSED/IN_PROGRESS/APPROVED/COMPLETED/…)
  // and the interactive controls only offer valid transitions. Best-effort read: if the table is unavailable,
  // routes keep their PROPOSED default. The top action skips terminal (completed/rejected) tasks.
  if (processExecution && processExecution.routes.length > 0) {
    try {
      const persisted = persistedProcessTasks;
      if (persisted.length > 0) {
        const statusByKey = new Map(persisted.map((t) => [t.taskKey, t.status]));
        for (const r of processExecution.routes) {
          const s = statusByKey.get(r.taskKey);
          if (s) {
            r.status = s;
            r.canStart = computeCanStart(r.executionRoute, s);
          }
        }
        const TERMINAL = new Set(["COMPLETED", "REJECTED", "OUTCOME_RECORDED", "OUTCOME_DISPUTED", "OUTCOME_VERIFIED"]);
        processExecution.topRoute =
          processExecution.routes.find((r) => r.executionRoute !== "MONITOR_ONLY" && !TERMINAL.has(r.status)) ??
          processExecution.topRoute;
      }
    } catch {
      // best-effort annotation; keep PROPOSED defaults when the persisted table/DB is unavailable
    }
  }

  // Structured external opportunity intake (PASS 10) — LIVE owner/manager/system-submitted signals persisted
  // via /api/owner/opportunities/signals. They feed the intelligence engine alongside the internal-derived
  // family, and drive the hardened opportunity operating layer. Missing table / no signals → empty.
  const persistedOpportunityRows: PersistedIntakeRow[] = typeof deps.externalOpportunitySignals === "function"
    ? await deps.externalOpportunitySignals(workspaceId).catch(() => [])
    : [];
  const nowMs = deps.now();
  const cashProfitRiskActive = Boolean(cashProfitProtection?.signals.some((s) => s.category === "CASH" || s.severity === "CRITICAL"));

  // External Opportunity Intelligence v1 — evidence-backed candidates from live structured intake PLUS the
  // internal customer-complaint→retention family, each filtered through cash/profit protection, the
  // capability gap, and the approval boundary. No signal → null.
  const internalOpportunitySignals = deriveExternalOpportunitySignals(complaintReworkLinks, cashProfitProtection, capabilityGaps, topConstraint);
  const opportunitySignals = [...persistedOpportunityRows.map((r) => mapPersistedSignalToRaw(r, nowMs)), ...internalOpportunitySignals];
  const externalOpportunityIntelligence: ExternalOpportunityAnalysis | null = opportunitySignals.length > 0
    ? buildExternalOpportunityIntelligence({
        signals: opportunitySignals,
        context: { cashProfitRiskActive, capabilityGapPresent: capabilityGaps != null },
      }, workspaceId, new Date(nowMs).toISOString())
    : null;

  // Opportunity Operating Layer (hostile-hardened) — over the LIVE structured signals: source quality,
  // current-business-fit gate, tender bid/no-bid, win-readiness, prep checklists, freshness, clustering,
  // negative reasons, next-action ownership, proof-pack, quality bands, repeated-blocker learning. No
  // structured signals → null (the internal retention family is served by externalOpportunityIntelligence).
  const businessContext: BusinessStateContext = {
    hasCriticalQualityBottleneck: (complaintReworkLinks?.aggregates.complaintLinkedCount ?? 0) >= 2 || (complaintReworkLinks?.aggregates.reworkLinkedCount ?? 0) >= 2,
    hasCashProfitRisk: cashProfitRiskActive,
    staffCapacity: "UNKNOWN",
    equipmentCapacity: "UNKNOWN",
    deliveryCapacity: "UNKNOWN",
    ownerWorkloadHigh: Boolean(ctx.ownerOverloaded),
    unresolvedTrainingOrSopGap: false,
    activeHighRiskApproval: false,
    capabilityGapPresent: capabilityGaps != null,
    topConstraintType: topConstraint?.constraintType ?? null,
  };
  const opportunityOperating: OpportunityOperatingAnalysis | null = persistedOpportunityRows.length > 0
    ? buildOpportunityOperatingLayer(persistedOpportunityRows, businessContext, workspaceId, new Date(nowMs).toISOString())
    : null;

  // Opportunity Validation Experiment Engine — turn each promoted candidate into the cheapest bounded,
  // falsifiable experiment (cost/time/sample capped, stop-loss, never ready-to-scale). No candidates → null.
  const opportunityValidation: OpportunityValidationAnalysis | null = externalOpportunityIntelligence && externalOpportunityIntelligence.candidates.length > 0
    ? buildOpportunityValidationPlan(
        externalOpportunityIntelligence.candidates,
        {
          cashProfitRiskActive: Boolean(cashProfitProtection?.signals.some((s) => s.category === "CASH" || s.severity === "CRITICAL")),
          capabilityGapPresent: capabilityGaps != null,
        },
        workspaceId,
        new Date(deps.now()).toISOString(),
      )
    : null;

  // Validation Outcome Persistence (PASS 11) — persisted outcomes override each experiment's design-time
  // NOT_STARTED status so the live portfolio can reach real KILL / SCALE_CANDIDATE decisions on evidence.
  const validationOutcomes: ValidationOutcomeView[] = typeof deps.validationOutcomes === "function"
    ? await deps.validationOutcomes(workspaceId).catch(() => [])
    : [];
  const outcomeByKey = new Map(validationOutcomes.map((o) => [o.opportunityKey, o]));
  const opportunityValidationWithOutcomes: OpportunityValidationAnalysis | null = opportunityValidation
    ? {
        ...opportunityValidation,
        experiments: opportunityValidation.experiments.map((e) => {
          const o = outcomeByKey.get(`${e.signalSourceType}:${e.opportunityType}`);
          return o ? { ...e, validationStatus: o.validationStatus } : e;
        }),
      }
    : null;

  // Opportunity Portfolio / Capital Allocation — allocate each candidate into a governed portfolio decision;
  // capital and scale go only to opportunities whose validation has passed. No candidates → null.
  const opportunityPortfolio: OpportunityPortfolioAnalysis | null = externalOpportunityIntelligence && externalOpportunityIntelligence.candidates.length > 0
    ? buildOpportunityPortfolio(
        externalOpportunityIntelligence.candidates,
        opportunityValidationWithOutcomes,
        {
          cashProfitRiskActive: Boolean(cashProfitProtection?.signals.some((s) => s.category === "CASH" || s.severity === "CRITICAL")),
          capabilityGapPresent: capabilityGaps != null,
        },
        workspaceId,
        new Date(deps.now()).toISOString(),
      )
    : null;

  // Opportunity Execution & Delegation Tracking (PASS 12) — derive governed, trackable execution tasks from
  // the live operating layer (prep checklist / tender readiness / proof pack) + portfolio + validation hints,
  // overlaying persisted task statuses (completed evidence-backed work). No structured opportunities → null.
  const persistedExecutionTasks: Map<string, PersistedTaskStatus> = typeof deps.executionTasks === "function"
    ? await deps.executionTasks(workspaceId).catch(() => new Map<string, PersistedTaskStatus>())
    : new Map<string, PersistedTaskStatus>();
  const opportunityExecution: OpportunityExecutionAnalysis | null = opportunityOperating && opportunityOperating.opportunities.length > 0
    ? deriveOpportunityExecutionTasks(
        opportunityOperating.opportunities,
        {
          portfolioOwnerReview: opportunityPortfolio?.topItem?.portfolioDecision === "OWNER_REVIEW_REQUIRED",
          portfolioScaleCandidate: opportunityPortfolio?.topItem?.portfolioDecision === "SCALE_CANDIDATE",
          validationExperimentPending: Boolean(opportunityValidation?.topExperiment) && !validationOutcomes.some((o) => o.result === "PASSED" || o.result === "FAILED"),
          validationDataCollectionOnly: opportunityValidation?.topExperiment?.experimentType === "DATA_COLLECTION_ONLY",
        },
        persistedExecutionTasks,
        workspaceId,
        new Date(nowMs).toISOString(),
      )
    : null;

  // Goal Attention Signal — full 6-state owner DTO derived from the active goal + trajectory.
  // Only available on the live path (goalTrajectoryFn present). Absent on fake-DI unit tests → null.
  // When function is present but returns null: NO_GOAL state (workspace has no active goal set).
  const hasGoalFn = typeof deps.goalTrajectoryFn === "function";
  const goalTrajectoryRaw = hasGoalFn
    ? await deps.goalTrajectoryFn!(workspaceId).catch(() => null)
    : null;
  let goalAttentionSignal: GoalAttentionSignal | null = null;
  if (hasGoalFn && !goalTrajectoryRaw) {
    goalAttentionSignal = {
      state: "NO_GOAL",
      goalTitle: null,
      targetAmount: null,
      targetCurrency: null,
      targetDateIso: null,
      gapToClose: null,
      projectedMonthsToGoal: null,
      currentTrajectoryDateIso: null,
      requiredMonthlyImprovement: null,
      confidence: null,
      trajectoryMiss: null,
      assumptions: [],
      beginnerExplanation: "No active goal is set. Add a goal to track your progress.",
    };
  }
  if (goalTrajectoryRaw) {
    const { goal, trajectory } = goalTrajectoryRaw;
    const goalTitle = GOAL_TYPE_LABEL[goal.targetType] ?? goal.targetType.toLowerCase().replace(/_/g, " ");
    const ownerMonths = (goal.targetDate.getTime() - Date.now()) / (30.44 * 24 * 60 * 60 * 1000);

    let goalState: GoalAttentionSignal["state"];
    let beginnerExplanation: string;

    if (trajectory.confidence === "LOW") {
      goalState = "INSUFFICIENT_DATA";
      beginnerExplanation = "Not enough data yet to project your goal. Keep recording results.";
    } else if (trajectory.confidence === "MEDIUM" && trajectory.confidenceRationale.includes("days old")) {
      goalState = "STALE";
      beginnerExplanation = "Your last result was recorded more than 60 days ago. Update your numbers to get a fresh projection.";
    } else if (trajectory.projectedMonthsToGoal === null) {
      goalState = "NO_GROWTH";
      beginnerExplanation = "At the current rate, your goal cannot be reached. Growth needs to turn positive.";
    } else if (trajectory.trajectoryMiss) {
      goalState = "AT_RISK";
      const behindMonths = trajectory.projectedMonthsToGoal - Math.max(0, ownerMonths);
      beginnerExplanation = `Your goal may slip. At the current rate you are ${Math.round(behindMonths)} months behind schedule.`;
    } else {
      goalState = "ON_TRACK";
      beginnerExplanation = `You are on pace to reach your ${goalTitle} in about ${trajectory.projectedMonthsToGoal} months.`;
    }

    goalAttentionSignal = {
      state: goalState,
      goalTitle,
      targetAmount: goal.targetAmount,
      targetCurrency: goal.targetCurrency,
      targetDateIso: goal.targetDate.toISOString(),
      gapToClose: trajectory.gapToClose,
      projectedMonthsToGoal: trajectory.projectedMonthsToGoal,
      currentTrajectoryDateIso: trajectory.currentTrajectoryDate?.toISOString() ?? null,
      requiredMonthlyImprovement: trajectory.requiredMonthlyImprovement,
      confidence: trajectory.confidence as "LOW" | "MEDIUM" | "HIGH",
      trajectoryMiss: trajectory.trajectoryMiss,
      assumptions: trajectory.assumptions,
      beginnerExplanation,
    };
  }

  // Policy Attention Signal — triggered vs configured breakdown using live measurements.
  // Only available on the live path (policyListFn + policyEvalFn provided by resolveDefaultDeps).
  // Absent on fake-DI unit tests → null (no fabrication).
  let policyAttentionSignal: PolicyAttentionSignal | null = null;
  if (typeof deps.policyListFn === "function" && typeof deps.policyEvalFn === "function") {
    const allPolicies = await deps.policyListFn(workspaceId).catch(() => [] as Array<{ policyKey: string; isActive: boolean; hardBlock: boolean }>);
    const activePolicies = allPolicies.filter((p) => p.isActive);
    if (activePolicies.length > 0) {
      const policyDetails: ActivePolicyDetail[] = await Promise.all(
        activePolicies.map(async (p) => {
          const measurement = p.policyKey === "growth_before_capacity" ? state.capacityUtilizationPct : 0;
          const unit = p.policyKey === "growth_before_capacity" ? "%" : " months";
          const evalResult = await deps.policyEvalFn!(workspaceId, p.policyKey, measurement, unit).catch(
            () => ({ decision: "ALLOW" as const, activeOverride: null }),
          );
          return {
            policyKey: p.policyKey,
            label: POLICY_LABEL[p.policyKey] ?? p.policyKey,
            hardBlock: p.hardBlock,
            isCurrentlyTriggered: evalResult.decision !== "ALLOW",
            hasActiveOverride: Boolean(evalResult.activeOverride),
            decision: evalResult.decision,
            overrideReason: evalResult.activeOverride?.reason ?? null,
          };
        }),
      );
      policyAttentionSignal = {
        configuredHardBlockCount: activePolicies.filter((p) => p.hardBlock).length,
        configuredWarningCount: activePolicies.filter((p) => !p.hardBlock).length,
        triggeredBlockCount: policyDetails.filter((d) => d.decision === "BLOCK").length,
        triggeredWarningCount: policyDetails.filter((d) => d.decision === "WARN").length,
        activeOverrideCount: policyDetails.filter((d) => d.hasActiveOverride).length,
        details: policyDetails,
      };
    }
  }

  // Trend Alerts — pairwise directional alerts from the last two ownerMetricSnapshot periods.
  // Null when fewer than 2 snapshots are available or period timestamps are identical.
  let trendAlerts: TrendAlert[] | null = null;
  if (deps.db.ownerMetricSnapshot.findMany) {
    const snapshots = await deps.db.ownerMetricSnapshot.findMany({
      where: { workspaceId },
      select: {
        periodEnd: true, revenue: true, grossProfit: true, netProfit: true,
        newCustomers: true, averageOrderValue: true, refundAmount: true, rewashCount: true,
        complaintCount: true, receivables: true, marketingSpend: true, staffProductivity: true,
      },
      orderBy: { periodEnd: "desc" },
      take: 2,
    }).catch(() => [] as MetricSnapshotForTrend[]);

    if (snapshots.length >= 2 && snapshots[0].periodEnd.getTime() !== snapshots[1].periodEnd.getTime()) {
      const toMetricPoints = (s: MetricSnapshotForTrend): MetricDataPoint[] => {
        const pairs: Array<[BusinessMetricName, number | null]> = [
          ["revenue", s.revenue],
          ["gross_profit", s.grossProfit],
          ["net_profit", s.netProfit],
          ["customer_count", s.newCustomers],
          ["average_order_value", s.averageOrderValue],
          ["refunds", s.refundAmount],
          ["rework_rate", s.rewashCount],
          ["complaints", s.complaintCount],
          ["receivables", s.receivables],
          ["marketing_spend", s.marketingSpend],
          ["staff_productivity", s.staffProductivity],
        ];
        return pairs
          .filter((p): p is [BusinessMetricName, number] => p[1] !== null)
          .map(([metricName, value]) => ({ metricName, value, periodLabel: s.periodEnd.toISOString().slice(0, 7) }));
      };
      const currentPeriod = toMetricPoints(snapshots[0]);
      const previousPeriod = toMetricPoints(snapshots[1]);
      if (currentPeriod.length > 0 && previousPeriod.length > 0) {
        const trendResult = analyzeBusinessTrend({
          workspaceId,
          businessId: businessId ?? "",
          currentPeriod,
          previousPeriod,
        });
        trendAlerts = trendResult.valid ? trendResult.trendAlerts : null;
      }
    }
  }

  // Active Escalations — open escalations requiring owner attention (OPEN status only, max 5).
  // Null when escalation table is unavailable (fake-DI tests).
  const openEscalationRows = deps.db.escalation?.findMany
    ? await deps.db.escalation.findMany({
        where: { workspaceId, status: "OPEN" },
        select: { id: true, assignedTarget: true, severity: true, status: true, createdAt: true, dueAt: true },
      }).catch(() => null)
    : null;
  const activeEscalations: EscalationAttentionItem[] | null = openEscalationRows
    ? openEscalationRows
        .filter((e) => e.status === "OPEN")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          title: e.assignedTarget ?? "Escalation",
          severity: e.severity,
          status: "OPEN" as const,
          raisedAtIso: e.createdAt.toISOString(),
          dueAtIso: e.dueAt?.toISOString() ?? null,
        }))
    : null;

  // Derive the 11 business-condition risk dimensions from snapshot data already in memory.
  // Pure function — no extra DB query. Produces "unknown" only when the source record was absent.
  const derivedBusinessCondition = deriveBusinessConditionSignals({
    cashState: raw.cashState,
    finState: raw.finState,
    cashRunwayDays: state.cashRunwayDays,
    supplierInventoryRiskScore: state.supplierInventoryRiskScore,
    ownerLoadPct: state.ownerLoadPct,
    staffOverloadPct: state.staffOverloadPct,
    ownerOverloaded: ctx.ownerOverloaded,
    staffOverloaded: ctx.staffOverloaded,
    capacityUtilizationPct: state.capacityUtilizationPct,
    complaintsCount: state.complaintsCount,
    reworkCount: state.reworkCount,
    overdueProofCount: state.overdueProofCount,
    outcomeChecksDue: state.outcomeChecksDue,
    churnRiskScore: state.churnRiskScore,
    growthReadinessTier: state.growthReadinessTier,
  });

  const view = buildOwnerNowView({ ...ctx, changes });
  const stepByStep = view.topOwnerActions.map((i) => stepFor(i, ag));
  const beginnerExplanation = buildBeginner(view, stepByStep);

  // Do-Not-Repeat Annotation — check if the top priority guidance action is blocked by a DNR rule.
  const topActionCategory = view.topOwnerActions[0]?.category;
  const topActionImpactArea = topActionCategory ? (ISSUE_CATEGORY_TO_IMPACT_AREA[topActionCategory] ?? null) : null;
  const [doNotRepeatAnnotation, executionLifecycle, businessOperatingSystem] = await Promise.all([
    topActionImpactArea
      ? checkDoNotRepeatForGuidance(workspaceId, topActionImpactArea, null, deps.db).catch(() => null)
      : Promise.resolve(null),
    buildExecutionLifecycle(workspaceId, deps.db),
    buildBusinessOperatingSystem(workspaceId, deps.db),
  ]);

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

  return { view, whatChanged: changes, beginnerExplanation, stepByStep, archetype: ag.archetype, generatedFromLiveData: true, workloadBudget, topConstraint, topProfitLeak, topGamingSignal, topCredibilityConcern, businessControlHealth, controlCorrelations, proofOutcomeLinkage: proofOutcomeReport, disputeRisk, complaintReworkLinks, operationalEventHealth: complaintReworkLinks?.eventHealth ?? null, reusedProofFindings, proofRiskAdjudications, proofRiskAdjudicationSummary: proofRiskAdjudications ? summarizeAdjudications(proofRiskAdjudications) : null, timingEvidence: (fastCompletionSignal || escalationTimingSignal) ? { fastCompletion: fastCompletionSignal, escalationTiming: escalationTimingSignal } : null, processIntelligence, processCorrections, sopChecklistCorrections, trainingAssignments, sopTrainingEffectiveness, processExecution, ownerWorkloadReduction, approvalPolicy, capabilityGaps, cashProfitProtection, externalOpportunityIntelligence, opportunityValidation, opportunityPortfolio, opportunityOperating, opportunityValidationOutcomes: validationOutcomes.length > 0 ? validationOutcomes : null, opportunityExecution, salesPipelineSummary: pipelineSummary, goalAttentionSignal, policyAttentionSignal, trendAlerts, doNotRepeatAnnotation, activeEscalations, derivedBusinessCondition, executionLifecycle, businessOperatingSystem };
}

/**
 * Derive the effectiveness-loop inputs: for each finding with a routed correction whose targeted problem
 * maps to a snapshot metric, compare the previous snapshot (baseline) against the current state. A prior
 * snapshot means the problem has been under correction since the last review; no prior snapshot →
 * no baseline → INSUFFICIENT_DATA. Pure over existing derived data + persisted snapshot metrics.
 */
function deriveEffectivenessItems(
  intel: ProcessIntelligenceAnalysis,
  routing: ProcessCorrectionRouting,
  sop: SopChecklistCorrectionAnalysis | null,
  training: TrainingAssignmentAnalysis | null,
  prev: GuidanceSnapshotRow | null,
  state: BusinessStateSnapshot,
  workspaceId: string,
  persistedTasks: { taskKey: string; status: string; evidenceRefs: string[]; notes: string | null }[],
): EffectivenessInputItem[] {
  // PASS 26: index the persisted execution tasks by key so each correction's REAL execution state drives
  // attribution. A correction is scored as executed only when its task is COMPLETED with evidence.
  const taskByKey = new Map(persistedTasks.map((t) => [t.taskKey, t]));
  // Which finding types map to a persisted snapshot metric (baseline vs current).
  const METRIC: Record<string, { problem: string; cur: number; base: number | null }> = {
    QUALITY_FAILURE_LOOP: { problem: "QUALITY_COMPLAINTS", cur: state.complaintsCount, base: prev ? prev.complaintsCount : null },
    REWORK_LOOP: { problem: "REWORK_EVENTS", cur: state.reworkCount, base: prev ? prev.reworkCount : null },
    PROOF_QUALITY_BREAKDOWN: { problem: "WEAK_PROOF", cur: state.overdueProofCount, base: prev ? prev.overdueProofCount : null },
  };
  const items: EffectivenessInputItem[] = [];
  for (const f of intel.findings) {
    const m = METRIC[f.findingType];
    if (!m) continue;
    const correction = routing.corrections.find((c) => c.sourceFindingType === f.findingType);
    if (!correction) continue;
    const sopDraft = sop?.drafts.find((d) => d.sourceProcessFindingKey === `${workspaceId}:${f.findingType}` && d.status !== "NEEDS_DATA") ?? null;
    const trainingItem = training?.assignments.find((t) => t.sourceProcessFindingKey === `${workspaceId}:${f.findingType}`) ?? null;
    const kind: EffectivenessInputItem["kind"] = sopDraft ? "SOP" : trainingItem ? "TRAINING" : "CORRECTION";
    // PASS 26 honesty gate, now execution-linked: derive the REAL execution state from the persisted
    // `pc:<correctionId>` task. A correction is scored as executed (active) ONLY when its task is COMPLETED
    // with evidence — so an improvement is attributed to the correction only with proven execution, and a
    // never-executed correction still returns INSUFFICIENT_EXECUTION_EVIDENCE rather than a causal claim.
    const persistedTask = taskByKey.get(`pc:${correction.correctionId}`);
    const executionState = correctionExecutionStateFromTask(persistedTask
      ? { status: persistedTask.status, evidenceCount: persistedTask.evidenceRefs.length, hasOutcomeNote: !!(persistedTask.notes && persistedTask.notes.trim()) }
      : null);
    const executed = executionState === "EXECUTED_WITH_EVIDENCE" || executionState === "EXECUTED_WITH_WEAK_EVIDENCE";
    items.push({
      kind,
      sourceCorrectionKey: correction.correctionId,
      sourceTrainingKey: trainingItem ? `${trainingItem.sourceProcessFindingKey}:${trainingItem.trainingType}` : null,
      sourceProcessFindingKey: `${workspaceId}:${f.findingType}`,
      targetedProblemType: m.problem,
      // `active` (scored as implemented) is true ONLY when the persisted task proves execution with evidence;
      // `executionState` carries the precise lifecycle stage so attribution never claims a fix worked without it.
      active: executed,
      executionState,
      windowElapsed: prev !== null,
      minDataMet: m.base !== null && m.base >= 2,
      baselineMetricValue: m.base,
      currentMetricValue: m.cur,
      baselineWindow: "previous owner-guidance snapshot",
      evaluationWindow: "current owner-guidance snapshot",
      supportingBeforeEventIds: [],
      supportingAfterEventIds: f.supportingOperationalEventIds,
      supportingProofIds: f.supportingProofIds,
      relatedOperationalEventIds: f.supportingOperationalEventIds,
      relatedEscalationIds: f.supportingEscalationIds,
      relatedProfitLeak: f.relatedProfitLeak,
      relatedConstraint: f.relatedConstraint,
      relatedSLO: f.relatedSLO,
      approvalLevel: correction.requiredApprovalLevel,
      missingData: m.base === null ? ["no earlier snapshot to use as a baseline"] : [],
    });
  }
  return items;
}

/**
 * Derive the owner-workload signals from the already-computed analyses + counted scalars. High-risk owner
 * corrections (money/reputation impact) are flagged so the workload engine keeps them owner-gated.
 */
function deriveWorkloadSignals(
  intel: ProcessIntelligenceAnalysis,
  routing: ProcessCorrectionRouting | null,
  training: TrainingAssignmentAnalysis | null,
  adjudications: ProofRiskAdjudicationView[] | null,
  weakProofCount: number | null,
  overdueReviewCount: number | null,
  ownerBottleneckItems: number,
): WorkloadSignals {
  const HIGH_RISK_IMPACT = new Set(["CASH_DELAY", "COMPLAINT_RISK", "TRUST_RISK"]);
  const ownerApprovalCorrections = (routing?.corrections ?? [])
    .filter((c) => c.requiresOwnerApproval)
    .map((c) => ({ key: c.correctionId, highRisk: HIGH_RISK_IMPACT.has(c.expectedImpactType), supportingProofIds: c.supportingProofIds }));
  const managerTrainingKeys = (training?.assignments ?? [])
    .filter((t) => t.approvalLevel === "MANAGER")
    .map((t) => `${t.sourceProcessFindingKey}:${t.trainingType}`);
  const missingData = Array.from(new Set((routing?.corrections ?? []).flatMap((c) => c.missingData)));
  return {
    adjudicationTotal: adjudications?.length ?? 0,
    adjudicationIds: (adjudications ?? []).map((a) => a.id),
    weakProofCount: weakProofCount ?? 0,
    overdueReviewCount: overdueReviewCount ?? 0,
    ownerBottleneckItems,
    findings: intel.findings.map((f) => ({
      findingType: f.findingType,
      supportingProofIds: f.supportingProofIds,
      supportingOperationalEventIds: f.supportingOperationalEventIds,
      supportingEscalationIds: f.supportingEscalationIds,
      relatedSLO: f.relatedSLO,
    })),
    ownerApprovalCorrections,
    managerTrainingKeys,
    missingData,
  };
}

/**
 * Map each proposed process correction into an approval-policy action candidate. The correction type sets
 * the action class; the finding's expected impact type sets the risk category + impact level; the
 * correction's own confidence and data-sufficiency drive the confidence + evidence flags. Every value is
 * read from real correction data — none is guessed. Ordinary corrections never map to high-harm actions.
 */
function deriveApprovalCandidates(routing: ProcessCorrectionRouting): PolicyActionCandidate[] {
  const ACTION_BY_CORRECTION: Record<string, PolicyActionType> = {
    REQUIRE_FRESH_PROOF: "REQUEST_MISSING_PROOF",
    UPDATE_CHECKLIST: "DRAFT_CHECKLIST",
    REVIEW_PROCESS_STEP: "MINOR_PROCESS_CHANGE",
    ASSIGN_TRAINING_REVIEW: "PROPOSE_TRAINING",
    ESCALATE_TO_MANAGER: "ROUTINE_COACHING",
    ESCALATE_TO_OWNER: "REPUTATION_RESPONSE",
    RESOLVE_OPERATIONAL_EVENT: "MINOR_PROCESS_CHANGE",
    COLLECT_MISSING_DATA: "COLLECT_DATA",
    NO_ACTION_DATA_INSUFFICIENT: "DRAFT_ONLY_RECOMMENDATION",
  };
  const RISK_BY_IMPACT: Record<string, { risk: RiskCategory; impact: ImpactLevel }> = {
    CASH_DELAY: { risk: "FINANCIAL", impact: "HIGH" },
    REWORK_COST: { risk: "FINANCIAL", impact: "MEDIUM" },
    COMPLAINT_RISK: { risk: "CUSTOMER_TRUST", impact: "MEDIUM" },
    TRUST_RISK: { risk: "REPUTATION", impact: "HIGH" },
    QUALITY_RISK: { risk: "OPERATIONAL", impact: "MEDIUM" },
    OWNER_TIME: { risk: "OPERATIONAL", impact: "LOW" },
    NONE: { risk: "NONE", impact: "LOW" },
  };
  const CONFIDENCE: Record<string, PolicyConfidence> = { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW", NEEDS_DATA: "NEEDS_DATA" };

  // Corrections routed from the DATA_INSUFFICIENT sentinel (the empty/thin-workspace "no real breakdown yet"
  // state — whether the no-op or a data-collection correction) are not real proposed actions and must not
  // fabricate an approval decision to govern.
  return routing.corrections.filter((c) => c.sourceFindingType !== "DATA_INSUFFICIENT").map((c) => {
    const dataInsufficient = c.confidence === "NEEDS_DATA";
    const rk = RISK_BY_IMPACT[c.expectedImpactType] ?? { risk: "UNKNOWN" as RiskCategory, impact: "UNKNOWN" as ImpactLevel };
    return {
      actionKey: c.correctionId,
      actionType: ACTION_BY_CORRECTION[c.correctionType] ?? "UNKNOWN",
      title: c.title,
      riskCategory: dataInsufficient ? "UNKNOWN" : rk.risk,
      impactLevel: dataInsufficient ? "UNKNOWN" : rk.impact,
      confidence: CONFIDENCE[c.confidence] ?? "NEEDS_DATA",
      // The candidate is well-specified enough to classify unless it is the explicit no-data no-op.
      evidenceComplete: !dataInsufficient && c.confidence !== "NEEDS_DATA",
      reversible: true,
      supportingEvidenceIds: [...c.supportingProofIds, ...c.supportingOperationalEventIds, ...c.supportingEscalationIds],
      sourceProcessFinding: c.sourceFindingType,
      missingData: c.missingData,
    };
  });
}

/** Map the evidence confidence level to the capability-gap detector's confidence band. */
function gapConfidenceFromLevel(level: EvidenceConfidenceLevel): GapConfidence {
  switch (level) {
    case EvidenceConfidenceLevel.VERIFIED:
    case EvidenceConfidenceLevel.STRONG:
      return "HIGH";
    case EvidenceConfidenceLevel.MODERATE:
      return "MEDIUM";
    case EvidenceConfidenceLevel.WEAK:
      return "LOW";
    default:
      return "NEEDS_DATA";
  }
}

/**
 * Derive capability-gap signals from the already-computed now-view blocks: decisions the approval policy
 * cannot safely automate (each already tagged with the capability it needs), missing complaint/rework data,
 * and manual owner proof/review burden. Every signal is backed by real refs the caller counted.
 */
function deriveCapabilityGapSignals(
  approvalPolicy: ApprovalPolicyAnalysis | null,
  workload: OwnerWorkloadReductionAnalysis | null,
  routing: ProcessCorrectionRouting | null,
): CapabilityGapSignal[] {
  // The approval policy uses a lightweight per-decision capability enum; map it to the detector's catalogue.
  const CAP_MAP: Record<string, MissingCapabilityType> = {
    VERIFIED_AMOUNT_LEDGER: "VERIFIED_FINANCIAL_LEDGER",
    REFUND_RECONCILIATION: "REFUND_RECONCILIATION",
    MARGIN_SIMULATION: "MARGIN_SIMULATION",
    SPEND_CONTROL_LEDGER: "SPEND_CONTROL_LEDGER",
    PAYROLL_INTEGRATION: "COMPENSATION_INTEGRATION",
    CONTRACT_TERMS_REGISTRY: "CONTRACT_TERMS_REGISTRY",
    LEGAL_REVIEW_WORKFLOW: "LEGAL_REVIEW_WORKFLOW",
    IDENTITY_EVIDENCE_CHAIN: "IDENTITY_EVIDENCE_CHAIN",
    AUTOMATED_ROLLBACK: "AUTOMATED_ROLLBACK",
  };
  const signals: CapabilityGapSignal[] = [];

  // 1. Decisions the approval policy cannot safely automate → a capability the system must build.
  for (const d of approvalPolicy?.decisions ?? []) {
    if (!d.capabilityGap || !d.missingCapabilityType) continue;
    const cap = CAP_MAP[d.missingCapabilityType];
    if (!cap) continue;
    signals.push({
      signalType: "UNAUTOMATABLE_DECISION",
      missingCapability: cap,
      detail: `${d.title} cannot be safely automated today`,
      severity: d.approvalDecision === "NEVER_AUTO" ? "HIGH" : "MEDIUM",
      evidenceRefs: d.supportingEvidenceIds,
      blocksAutomationOf: d.actionType,
      missingData: [],
    });
  }

  // 2. Manual owner burden → a capability that removes the repeat: automated proof capture for weak-proof
  //    review burden, structured feedback intake for recurring complaint escalation.
  const WORKLOAD_CAP: Record<string, { cap: MissingCapabilityType; detail: string }> = {
    OWNER_REVIEW_BURDEN: { cap: "AUTOMATED_PROOF_CAPTURE", detail: "weak proof keeps reaching the owner's manual review" },
    REPEATED_OWNER_ADJUDICATION: { cap: "AUTOMATED_PROOF_CAPTURE", detail: "the owner keeps adjudicating the same weak-proof risk by hand" },
    RECURRING_COMPLAINT_ESCALATION: { cap: "CUSTOMER_FEEDBACK_INTAKE", detail: "quality complaints keep escalating to the owner" },
  };
  for (const f of workload?.findings ?? []) {
    const m = WORKLOAD_CAP[f.workloadType];
    if (!m) continue;
    signals.push({
      signalType: "MANUAL_OWNER_BURDEN",
      missingCapability: m.cap,
      detail: m.detail,
      severity: f.severity === "HIGH" || f.severity === "CRITICAL" ? "HIGH" : "MEDIUM",
      evidenceRefs: [...f.supportingProofIds, ...f.supportingAdjudicationIds, ...f.supportingOperationalEventIds],
      blocksAutomationOf: null,
      missingData: [],
    });
  }

  // 3. Missing complaint/rework data on a REAL correction → a structured customer-feedback intake sharpens
  //    the process signal. Corrections routed from the DATA_INSUFFICIENT sentinel (empty/thin workspace) are
  //    excluded — their missing-data list is the "no data yet" state, not an actionable capability gap.
  const feedbackGaps = Array.from(new Set(
    (routing?.corrections ?? []).filter((c) => c.sourceFindingType !== "DATA_INSUFFICIENT").flatMap((c) => c.missingData),
  )).filter((m) => /complaint|rework|operational-event/i.test(m));
  if (feedbackGaps.length > 0) {
    signals.push({
      signalType: "MISSING_OPERATIONAL_DATA",
      missingCapability: "CUSTOMER_FEEDBACK_INTAKE",
      detail: "complaint/rework data is captured ad hoc",
      severity: "LOW",
      evidenceRefs: [],
      blocksAutomationOf: null,
      missingData: feedbackGaps,
    });
  }

  return signals;
}

/**
 * Derive evidence-backed external opportunity signals from internal data. v1 derives a customer-retention
 * opportunity from a recurring complaint pattern (dissatisfied customers who could be won back); richer
 * external sources (competitor reviews, B2B demand, pricing gaps) come via structured/manual intake. Every
 * value is read from real complaint evidence — none is fabricated. No signal → empty (nothing to surface).
 */
function deriveExternalOpportunitySignals(
  complaintRework: ComplaintReworkAnalysis | null,
  cashProfit: CashProfitProtectionAnalysis | null,
  capabilityGaps: CapabilityGapAnalysis | null,
  topConstraint: { constraintType?: string } | null,
): RawOpportunitySignal[] {
  const complaintCount = complaintRework?.aggregates.complaintLinkedCount ?? 0;
  if (complaintCount < 2) return [];
  const refs = (complaintRework?.eventHealth.events ?? [])
    .filter((e) => e.active)
    .map((e) => e.eventId)
    .slice(0, 5);
  if (refs.length === 0) return [];
  return [{
    signalId: `retention:${refs[0]}`,
    dedupeKey: "customer-complaint-retention",
    signalSourceType: "CUSTOMER_COMPLAINT_PATTERN",
    opportunityType: "RETENTION_CAMPAIGN",
    sourceEvidenceSummary: "A recurring quality-complaint pattern points to dissatisfied customers who may be retained with a targeted fix or offer.",
    sourceRefs: refs,
    customerPainPoint: "repeat quality complaints on recent work",
    targetCustomerSegment: "recently-complaining local customers",
    expectedValueHypothesis: "A cheap, targeted retention offer or fix could reduce churn among dissatisfied customers.",
    relevanceToBusiness: "STRONG",
    rawConfidence: "MEDIUM",
    cashRisk: "LOW",
    ownerWorkloadRisk: "LOW",
    operationalFit: "MODERATE",
    capabilityFit: "MODERATE",
    localFeasibility: "STRONG",
    legalOrComplianceRisk: "LOW",
    // Without per-customer unit economics OpsIQ cannot yet measure the retention value → capability gap.
    hasUnitEconomics: false,
    validationCostEstimate: null,
    missingData: ["per-customer value / retention unit economics"],
    relatedCashProfitSignal: cashProfit?.topSignal?.signalType ?? null,
    relatedCapabilityGap: capabilityGaps?.topRecommendation?.capabilityType ?? null,
    relatedConstraint: topConstraint?.constraintType ?? null,
    relatedSLO: null,
  }];
}

function prevState(row: GuidanceSnapshotRow): BusinessStateSnapshot {
  return {
    cashRunwayDays: row.cashRunwayDays, netMarginPct: row.netMarginPct, complaintsCount: row.complaintsCount,
    reworkCount: row.reworkCount, capacityUtilizationPct: row.capacityUtilizationPct, staffOverloadPct: row.staffOverloadPct,
    ownerLoadPct: row.ownerLoadPct, churnRiskScore: row.churnRiskScore, supplierInventoryRiskScore: row.supplierInventoryRiskScore,
    overdueProofCount: row.overdueProofCount, outcomeChecksDue: row.outcomeChecksDue, growthReadinessTier: row.growthReadinessTier,
  };
}
