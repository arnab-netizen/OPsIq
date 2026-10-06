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
import { buildCashProfitProtection, cashProfitRiskIsActive, cashSignalState, deriveFinanceCashProfitFacts, type CashProfitProtectionAnalysis, type CashRiskState, type FinanceCashProfitFacts, type FinanceReadingFacts } from "@/domain/owner-mode/cash-profit-protection";
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
import { ownerDnrAnnotationFromGate, type DoNotRepeatAnnotation } from "@/services/owner-mode/do-not-repeat.service";
import { evaluateOwnerActionGate, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { loadProvisionalCashFinance, type ProvisionalCashFinanceDb } from "@/services/owner-spine/provisional-cash-finance";
import { buildObjectivePortfolio, type ObjectiveType, type ObjectiveHealthStatus } from "@/domain/owner-mode/objective-portfolio";
import type { SurvivalLikeState } from "@/domain/owner-guidance/cash-finance-conflict";
import { cashFlowEvidenceGaps, financeEvidenceGaps, currentCashFinanceReading, toUnitConfidence, UNVERIFIED_GATE_CONFIDENCE } from "@/services/owner-spine/current-cash-finance-reading";
import { cashFinanceOwnerNarrative } from "@/domain/owner-guidance/cash-finance-narrative";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import { hasExactlyOneRealBusiness } from "@/services/founder-recovery/business.service";
import { getFixtureTaintedStartupSessionIds } from "@/services/owner-strategy/startup-session.service";
import { financeSurvivalDriver, type CurrentOwnerDecision, type OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import { ownerImperativeContext, ownerTargetIntent, quoteTitles, reconcileOwnerProhibition, type OwnerProhibition } from "@/domain/owner-spine/owner-imperatives";
import type { ActionToAvoid } from "@/domain/owner-guidance/next-best-step";
import { projectCashflowCycleRow } from "@/domain/owner-cashflow/cycle-projection";
export type { DoNotRepeatAnnotation };

const SAFE_STATES = new Set(["SAFE", "WATCH"]);
const OVERDUE_PROOF_STATUSES = ["REQUIRED", "PENDING_SUBMISSION", "RESUBMISSION_REQUIRED", "DISPUTED", "NEEDS_HUMAN_REVIEW"];
const OPEN_OUTCOME_STATUS = "too_early_to_judge";
const PROOF_OVERDUE_AGE_MS = 48 * 60 * 60 * 1000;

const RUNWAY_BY_STATE: Record<string, number> = { SAFE: 120, WATCH: 45, AT_RISK: 18, CRITICAL: 7, INSOLVENT_RISK: 2 };
const MARGIN_BY_STATE: Record<string, number> = { SAFE: 20, WATCH: 10, AT_RISK: 3, CRITICAL: -2, INSOLVENT_RISK: -10 };

type FinanceSnapshotFigures = NonNullable<FinanceReadingFacts["snapshot"]>;
interface CycleRow { cashflowState?: string; survivalState?: string; dataConfidenceScore: number; createdAt?: Date; generatedAt?: Date; snapshot?: ({ periodEnd: Date; supersededById?: string | null } & FinanceSnapshotFigures) | null; findings?: Array<{ code: string; sourceMetric?: string; sourceValue?: number | null; threshold?: number | null }> }
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
  ownerBusiness: {
    findFirst(args: unknown): Promise<BusinessRow | null>;
    /** Present on the live client: resolves the workspace's sole real business when no business is given. */
    findMany?(args: unknown): Promise<Array<{ id: string }>>;
  };
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

/**
 * Narrow structural type for the two ProcessExecutionTask* delegates used by
 * buildExecutionLifecycle. Not part of GuidanceDb itself (that interface stays a minimal,
 * hand-typed fake-DI surface for unit tests, most of which don't need Phase 3 data) — this exists
 * only so the live `db` value can be accessed here without `any`, matching the eslint
 * `no-explicit-any` rule this file must pass.
 */
interface ProcessExecutionTaskDb {
  processExecutionTask: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
      take: number;
    }): Promise<Array<Record<string, unknown>>>;
  };
  processExecutionTaskProgress: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: Record<string, unknown>;
      distinct: string[];
      select: Record<string, unknown>;
    }): Promise<Array<{ taskId: string; progressPct: number | null; blockerActive: boolean }>>;
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
   * The owner action gate's constraints loader (loadOwnerGateConstraints — the SAME constraints the canonical
   * decision is resolved with). Present on the live path, so a caller that does not pass `ownerGate` still
   * gets the gate's growth limits; absent on a fake-DI unit test, in which case growth readiness for a
   * business is UNVERIFIED (never GROWTH_READY) — a missing gate never reads as "growth ready".
   */
  ownerGate?: (workspaceId: string, businessId: string) => Promise<OwnerGateConstraints>;
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
  /**
   * Optional — the goal Home shows for the selected business (goal.service.ts resolveHomeGoal): the
   * business's own ACTIVE goal, or a legacy workspace goal only in a single-business workspace.
   * Absent on a fake-DI test → null. `goal: null` = no goal applies (scopeLabel says for which business).
   */
  goalTrajectoryFn?: (workspaceId: string, businessId: string | null) => Promise<{
    goal: { targetType: string; targetAmount: number; targetCurrency: string; targetDate: Date; scope?: "business" | "workspace" };
    /** "Business goal · <name>" | "Workspace goal". */
    scopeLabel?: string;
    /** Set when the goal is not projected (e.g. not measured, or a legacy goal spanning businesses). */
    unavailableReason?: string | null;
    metricBasis?: string;
    trajectory: {
      confidence: string;
      confidenceRationale: string;
      trajectoryMiss: boolean;
      projectedMonthsToGoal: number | null;
      currentTrajectoryDate: Date | null;
      gapToClose: number | null;
      requiredMonthlyImprovement: number | null;
      assumptions: string[];
      /** Absent on older/fake trajectories; null = cannot be determined. */
      onTrack?: boolean | null;
    };
  } | { goal: null; scopeLabel: string } | null>;
  /**
   * Optional — which objectives' linkedGoalId resolves (following successors of replaced goals) to an
   * ACTIVE goal in the objective's scope (goal.service.ts resolveAlignedObjectiveLinks). Absent on a
   * fake-DI test → a link counts as aligned when set (previous behaviour).
   */
  objectiveGoalAlignmentFn?: (
    workspaceId: string,
    links: Array<{ objectiveId: string; objectiveBusinessId: string | null; linkedGoalId: string | null }>,
  ) => Promise<Set<string>>;
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
  const { resolveHomeGoal, resolveAlignedObjectiveLinks } = await import("@/services/owner-strategy/goal.service");
  const { listPolicies, evaluatePolicy } = await import("@/services/governance/operating-policy.service");
  const { loadOwnerGateConstraints } = await import("@/services/owner-mode/owner-action-gate.service");
  return {
    db: db as unknown as GuidanceDb,
    ownerGate: (workspaceId: string, businessId: string) => loadOwnerGateConstraints(workspaceId, businessId),
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
    goalTrajectoryFn: async (workspaceId: string, businessId: string | null) => {
      const home = await resolveHomeGoal(workspaceId, businessId);
      if (!home.view) return { goal: null, scopeLabel: home.scopeLabel };
      return {
        goal: { ...home.view.goal, scope: home.view.goal.scope },
        trajectory: home.view.trajectory,
        scopeLabel: home.scopeLabel,
        unavailableReason: home.view.unavailableReason,
        metricBasis: home.view.metricBasis,
      };
    },
    objectiveGoalAlignmentFn: (workspaceId, links) => resolveAlignedObjectiveLinks(workspaceId, links),
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

/** `score` is the fractional 0..1 confidence scale (toUnitConfidence) — never the raw 0..100 DB score. */
function confidenceFromScore(score: number | null): EvidenceConfidenceLevel {
  if (score === null) return EvidenceConfidenceLevel.INSUFFICIENT;
  if (score >= 0.85) return EvidenceConfidenceLevel.VERIFIED;
  if (score >= 0.7) return EvidenceConfidenceLevel.STRONG;
  if (score >= 0.5) return EvidenceConfidenceLevel.MODERATE;
  if (score >= 0.3) return EvidenceConfidenceLevel.WEAK;
  return EvidenceConfidenceLevel.INSUFFICIENT;
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
  /** "Business goal · <name>" | "Workspace goal" | "No goal set for <name>"; null on fake-DI paths. */
  scopeLabel?: string | null;
  /** Which goal scope is shown; null when no goal applies. */
  goalScope?: "business" | "workspace" | null;
  /** Why the goal is not projected, when it isn't (stated, never a guessed number). */
  unavailableReason?: string | null;
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
   * Do-Not-Repeat Annotation — whether the owner's main target (the canonical decision's primary
   * class when supplied, else Now View's top operating signal) is blocked by an active
   * do-not-repeat rule. Null when no matching rule exists.
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
  /**
   * The task's origin family (e.g. "PROCESS_CORRECTION") — a stable, server-authoritative field
   * on ProcessExecutionTask, not derived from display text. Used (paired with
   * ownerVisibleSummary) to group repeated, semantically-identical suggestions in the owner UI
   * (P0-F) without grouping by raw title string alone.
   */
  sourceFamily: string;
  status: string;
  ownerVisibleSummary: string;
  severity: string;
  assignedRole: string;
  /** When the underlying task was created — for humanized "reported X ago" display only. */
  createdAt: string;
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
  deps: GuidanceDeps,
  /**
   * The owner action gate's constraints for this business (the SAME ones the canonical decision was
   * resolved with): growth is never shown as ready while the gate holds growth. Not supplied (undefined) →
   * loaded through `deps.ownerGate`; unavailable (null, or no loader) → growth readiness is unverified for a
   * business (never ready).
   */
  gateInput?: OwnerGateConstraints | null
): Promise<{ ctx: GuidanceContext; state: BusinessStateSnapshot; ag: ArchetypeGuidance; raw: { cashState?: string; finState?: string; financeFacts: FinanceCashProfitFacts | null; discountAmount: number | null; revenue: number | null; b2bRevenue: number | null; newCustomers: number | null; repeatCustomers: number | null }; cashFinanceEffectiveState: SurvivalLikeState | null; cashSignalState: CashRiskState | null; avgActiveMargin: number | null; pipelineSummary: { openDealsCount: number; weightedPipelineValue: number } | null; evidenceScope: { workspaceId: string; businessId?: string } | null }> {
  const order = { createdAt: "desc" as const };
  const periodOrder = { periodEnd: "desc" as const };
  const overdueBefore = new Date(deps.now() - PROOF_OVERDUE_AGE_MS);
  const nowDate = new Date(deps.now());
  // Business-scoped evidence (cash, Finance, workload, capacity, metrics, supplier) is read for ONE business,
  // never aggregated across businesses: the requested business; with none requested, the workspace's sole
  // real business; with several (or none), no business-scoped evidence at all — never whichever business
  // wrote last. (A DI client without ownerBusiness.findMany is a single-business fixture by construction.)
  let scopedBusinessId: string | null = businessId;
  if (!scopedBusinessId && deps.db.ownerBusiness.findMany) {
    const real = await deps.db.ownerBusiness.findMany({ where: { workspaceId, isActive: true, isFixtureBusiness: false }, select: { id: true }, take: 2 });
    scopedBusinessId = real.length === 1 ? real[0].id : null;
  }
  const unscopedLegacy = !businessId && !deps.db.ownerBusiness.findMany;
  const gate: OwnerGateConstraints | null =
    gateInput !== undefined ? gateInput : scopedBusinessId && deps.ownerGate ? await deps.ownerGate(workspaceId, scopedBusinessId) : null;
  const scope: { workspaceId: string; businessId?: string } | null = scopedBusinessId
    ? { workspaceId, businessId: scopedBusinessId }
    : unscopedLegacy ? { workspaceId } : null;
  const none = Promise.resolve(null);
  // A current cycle is one whose evidence period has ended (current-diagnosis-cycle.ts currentEvidenceWhere).
  const cycleScope = scope ? { ...scope, ...currentEvidenceWhere(nowDate) } : null;

  const CLOSED_STAGES = ["CLOSED_WON", "CLOSED_LOST"];
  const [cashRow, fin, emp, own, cap, metric, supplier, business, overdueProofCount, outcomeOpen, reassessOpen, latestCohorts, activePriceTiers, activeOpenDeals] = await Promise.all([
    cycleScope ? deps.db.ownerCashflowCycle.findFirst({ where: cycleScope, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true, dataConfidenceScore: true, createdAt: true, generatedAt: true, snapshot: true } }) : none,
    cycleScope ? deps.db.ownerFinanceCycle.findFirst({ where: cycleScope, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true, dataConfidenceScore: true, createdAt: true, snapshot: { select: { periodEnd: true, supersededById: true, revenue: true, fixedCosts: true, variableCosts: true, costOfGoods: true, rent: true, payroll: true, utilities: true, deliveryCost: true, marketingSpend: true, cashOnHand: true } }, findings: { select: { code: true, severity: true, sourceMetric: true, sourceValue: true, threshold: true } } } }) : none,
    // ownerEmployeeWorkloadSnapshot has no businessId column (it's employee-scoped, genuinely
    // workspace-wide) — workspaceId-only is correct here. ownerWorkloadSnapshot,
    // ownerCapacitySnapshot, and ownerSupplierInventorySnapshot DO each have a businessId column
    // and must use `scope` like ownerCashflowCycle/ownerFinanceCycle/ownerMetricSnapshot above —
    // without it, in a multi-business workspace this business inherits whichever OTHER business
    // most recently wrote a workload/capacity/supplier snapshot, presenting that business's real
    // problem (or lack of one) as this business's own.
    deps.db.ownerEmployeeWorkloadSnapshot.findFirst({ where: { workspaceId }, orderBy: order, select: { overburdened: true, utilizationPct: true } }),
    scope ? deps.db.ownerWorkloadSnapshot.findFirst({ where: scope, orderBy: order, select: { overloaded: true, bottleneckRisk: true, dailyLoadPct: true } }) : none,
    scope ? deps.db.ownerCapacitySnapshot.findFirst({ where: scope, orderBy: order, select: { growthSafe: true, expansionTriggered: true, bottleneckUtilization: true } }) : none,
    // The latest COMPLETED period's metrics (a period still in progress, or not started, is never "this period").
    scope ? deps.db.ownerMetricSnapshot.findFirst({ where: { ...scope, periodEnd: { lte: nowDate } }, orderBy: periodOrder, select: { complaintCount: true, rewashCount: true, refundAmount: true, newCustomers: true, repeatCustomers: true, revenue: true, discountAmount: true, b2bRevenue: true } }) : none,
    scope ? deps.db.ownerSupplierInventorySnapshot.findFirst({ where: scope, orderBy: order, select: { worstStockoutRisk: true, riskScore: true, supplyCutoffRisk: true, belowReorderCount: true } }) : none,
    scopedBusinessId
      ? deps.db.ownerBusiness.findFirst({ where: { workspaceId, id: scopedBusinessId }, select: { businessType: true } })
      : unscopedLegacy
        ? deps.db.ownerBusiness.findFirst({ where: { workspaceId, isActive: true }, orderBy: order, select: { businessType: true } })
        : none,
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
  // Read-time projection (cycle-projection.ts): a Cash flow cycle whose snapshot cannot establish total cash is never
  // shown as its persisted (possibly pre-fix, partial-total) conclusion; the gap is carried as evidence, not as danger.
  const cash = cashRow ? projectCashflowCycleRow(cashRow) : null;

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

  // The in-progress current period's cash/Finance readings (provisional: they may only tighten).
  const provisional = scopedBusinessId
    ? await loadProvisionalCashFinance(deps.db as unknown as ProvisionalCashFinanceDb, { workspaceId, businessId: scopedBusinessId }, nowDate)
    : null;
  const ag = archetypeGuidance(business?.businessType);
  // Cash-survival-triage and finance diagnosis are two separate signals for the same business that
  // can go stale relative to each other, and a Finance diagnosis whose figures the owner has since
  // amended is not a current reading. The ONE current cash/finance reading (the same one Home and the
  // safety gates use) arbitrates them — see current-cash-finance-reading.ts / cash-finance-conflict.ts.
  const cashFinanceResolution = currentCashFinanceReading(
    cash ? { state: cash.cashflowState, snapshot: cash.snapshot, evidenceGaps: cashFlowEvidenceGaps(cash) } : null,
    fin ? { state: fin.survivalState, snapshot: fin.snapshot, driver: financeSurvivalDriver(fin.findings), evidenceGaps: financeEvidenceGaps(fin.findings) } : null,
    deps.now(),
    provisional
  );
  // The state the safety gates enforce (stale, amended and in-progress figures included) — Now View never
  // shows cash as safer than it.
  const enforcedState = cashFinanceResolution.gateState;
  // Each source's CURRENT state only: a reading that is out of date, future-dated or (Finance) amended is
  // last-known context, never presented as current truth (it is named as last known below, and the gate's
  // unverified state applies).
  const cashState: string | undefined = cashFinanceResolution.cashCurrent ? cashFinanceResolution.cashState ?? undefined : undefined;
  const finState: string | undefined = cashFinanceResolution.financeCurrent ? cashFinanceResolution.financeState ?? undefined : undefined;
  // Measured cash/profit facts are read ONLY from a Finance diagnosis that is current (not stale/amended/superseded).
  const financeFacts = cashFinanceResolution.financeCurrent && fin
    ? deriveFinanceCashProfitFacts({ findings: fin.findings, snapshot: fin.snapshot })
    : null;
  const cashLastKnown = !cashFinanceResolution.cashCurrent ? cashFinanceResolution.cashState : null;
  const finStaleLastKnown = !cashFinanceResolution.financeCurrent ? cashFinanceResolution.financeState : null;
  const finAmendedLastKnown = cashFinanceResolution.financeAmendedLastKnown;
  // Growth/high-impact gating stays conservative when either current signal is missing (fail closed on
  // missing critical data, tracked separately below via missingCriticalData).
  const enforcedSafe = enforcedState !== null && SAFE_STATES.has(enforcedState);
  // R10 P2-9: driven ONLY by the authoritative gateState (enforcedSafe) — never by the legacy
  // resolution's own `.safe`, which is a second, independent arbitration of the same facts.
  // State and EVIDENCE are separate: a safe-looking state resting on incomplete material cash evidence (a Cash flow position
  // whose total cash is unknown, Finance liquidity unconfirmed) is never "cash safe" — it is a gap to fill, not a danger.
  const cashSafe = !!cashState && !!finState && enforcedSafe && cashFinanceResolution.gateEvidenceSufficient;
  // One safe reading with the other missing: a caution on the cash status, never a manufactured danger issue.
  const cashHalfMeasured = (!!cashState !== !!finState) && enforcedSafe;
  const staffOverloaded = emp?.overburdened === true;
  const ownerOverloaded = own?.overloaded === true || own?.bottleneckRisk === true;
  // Deliberately conservative, matching cashSafe above: no capacity snapshot means growth
  // capacity has never been assessed, so growthReadinessTier stays "STABILIZE_FIRST" rather than
  // asserting readiness on no evidence. This does not raise a capacity "issue" for missing data —
  // the issue push below (`cap && ...`) is separately gated on `cap` existing — it only keeps the
  // growth-readiness gate itself fail-closed on unmeasured capacity, same as unmeasured cash.
  const capacityGrowthSafe = cap?.growthSafe === true;
  const supplierRiskScore = supplier?.riskScore ?? 0;
  const supplierRiskHigh = supplierRiskScore >= 0.5;

  const complaints = Math.round(metric?.complaintCount ?? 0);
  const rework = Math.round(metric?.rewashCount ?? 0);
  const newC = metric?.newCustomers ?? 0;
  const repeatC = metric?.repeatCustomers ?? 0;
  const hasCustomerEvidence = newC + repeatC > 0;
  const metricChurnRate = hasCustomerEvidence ? Math.max(0, 1 - repeatC / (newC + repeatC)) : null;
  // RetentionCohort is a workspace-level aggregate (no businessId column) — it must never stand
  // in for this business's retention when this business itself has no measured customer activity
  // yet (UNKNOWN != BAD). Without that guard, a business with zero customers inherits another
  // business's cohort churn rate and gets a false "customers aren't coming back" signal.
  const cohortAvgChurn = hasCustomerEvidence ? (latestCohorts[0]?.avgMonthlyChurn ?? null) : null;
  const churnRiskScore = cohortAvgChurn !== null ? Math.min(1, cohortAvgChurn * 5) : (metricChurnRate ?? 0);
  const retentionRiskHigh = hasCustomerEvidence && churnRiskScore >= 0.5;
  // The owner action gate's own growth limits (cash, capacity, margin, compliance — never a domain-specific
  // do-not-repeat rule): growth is never "ready" here while the gate would hold a growth step.
  // Without the gate (not supplied and no loader) a business's growth readiness is unverified: never ready.
  const gateHoldsGrowth = scopedBusinessId !== null && (
    gate === null ||
    !evaluateOwnerActionGate({ ...gate, doNotRepeat: [] }, { domain: "sales", intent: "GROW", findingId: null, findingCode: null }).allowed
  );
  const growthGatePassed = cashSafe && capacityGrowthSafe && !supplierRiskHigh && !retentionRiskHigh && !gateHoldsGrowth;
  const outcomeChecksDue = outcomeOpen + reassessOpen;

  // R10 P2-7: dataConfidenceScore is persisted 0..100; confidenceFromScore's thresholds (and
  // UNVERIFIED_GATE_CONFIDENCE) are the fractional 0..1 scale every confidence constant in this domain
  // uses -- convert ONCE, at this boundary, with the one shared helper (toUnitConfidence). Comparing the
  // raw 0..100 score against the 0..1 cap directly (the previous `* 100` at the cap instead of dividing the
  // score) made the cap numerically vacuous: any positive raw score already exceeds every fractional
  // threshold in confidenceFromScore, so the capped value never changed which tier was reported.
  const rawConfScore =
    cash && fin ? Math.min(cash.dataConfidenceScore, fin.dataConfidenceScore)
      : cash ? cash.dataConfidenceScore : fin ? fin.dataConfidenceScore : null;
  const rawConfUnit = toUnitConfidence(rawConfScore);
  // Figures that are not current (out of date, amended, in progress) are never high confidence: the same
  // cap the gate applies (UNVERIFIED_GATE_CONFIDENCE).
  const confUnit = rawConfUnit !== null && cashFinanceResolution.gateDriver === "unverified"
    ? Math.min(rawConfUnit, UNVERIFIED_GATE_CONFIDENCE)
    : rawConfUnit;
  const dataConfidence = confidenceFromScore(confUnit);

  // Named, smallest-useful-first missing data — never a generic warning.
  const missingCriticalData: string[] = [];
  // No Cash flow check yet. When the CURRENT Finance snapshot already carries cash on hand, that figure is
  // measured and the owner is not asked for it again — only what the Cash flow check adds (what is due and
  // expected) is named as missing. Without a measured cash figure the full cash position is requested.
  if (!cash) {
    missingCriticalData.push(financeFacts?.cashPositionMeasured
      ? "cash obligations and expected inflows from a Cash flow check (your cash on hand is already measured from your Finance snapshot)"
      : "latest cash position (cash on hand + obligations)");
  }
  if (!fin) missingCriticalData.push("latest profit/margin figures");
  else if (finAmendedLastKnown) missingCriticalData.push("a Finance diagnosis of your amended figures (re-run the Finance diagnosis)");
  // Readings exist but none is current (out of date): the same unverified state the gate enforces.
  if ((cash || fin) && cashFinanceResolution.gateDriver === "unverified" && !finAmendedLastKnown) {
    missingCriticalData.push(
      cashFinanceResolution.provisional
        ? "cash and Finance figures for the latest completed period (only this period's in-progress figures are available)"
        : "current cash and Finance figures (the latest ones are out of date)"
    );
  }
  // A present current reading whose material cash evidence is incomplete: name exactly what to enter (never a danger claim).
  for (const gap of cashFinanceResolution.gateEvidenceGaps) {
    const what = gap.missing.map((m) => (m === "bankBalance" ? "bank balance" : "cash in hand")).join(" and ");
    missingCriticalData.push(
      gap.reason === "CASH_POSITION_INCOMPLETE"
        ? `${what} in a Cash flow check (total cash isn't confirmed, so OpsIQ does not treat your cash as safe for growth yet)`
        : `your bank balance (total cash isn't confirmed — enter 0 if you hold none, so OpsIQ can treat your cash as safe for growth)`
    );
  }
  if (!metric) missingCriticalData.push("latest customer + complaint counts");
  if (!supplier) missingCriticalData.push("supplier reliability + stock levels");

  const issues: BusinessIssue[] = [];
  // Finance's survival state reads overall financial survival; its OWN findings say whether a danger there
  // is about cash (runway, debt, payables) or about profit/margin — independent of whether Finance is the
  // source currently deciding the gate. A profit-driven Finance state is described as the profit problem
  // it is — never as "cash danger" — even when it is stale/superseded and `gateDriver` is "cash".
  const financeProfitDriven = financeSurvivalDriver(fin?.findings) === "profit";
  // R10 P2-9: the ONE narrative mapper for cash/finance issue text — it narrates the already-decided
  // gateState/gateDriver/gateSource projection only; it never independently re-arbitrates via the
  // legacy resolution's `.safe`/`.effectiveState`/`.supersededSource`/`.supersededState`. The one
  // exception is `bothCurrentDisagree` (Case F): a narration trigger only, never a decider.
  issues.push(...cashFinanceOwnerNarrative({
    cashState, finState, cashLastKnown, finStaleLastKnown, finAmendedLastKnown,
    gateState: enforcedState, gateDriver: cashFinanceResolution.gateDriver, gateSource: cashFinanceResolution.gateSource,
    provisional: cashFinanceResolution.provisional, financeProfitDriven,
    bothCurrentDisagree: Boolean(cashState) && Boolean(finState) && cashFinanceResolution.conflicting,
    // CONTEXT ONLY (see cash-finance-narrative.ts doc): names which earlier reading is out of date,
    // never used to decide severity/classification — gateState/gateDriver/gateSource do that.
    supersededSource: cashFinanceResolution.supersededSource, supersededState: cashFinanceResolution.supersededState,
  }));
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
    growthGatePassed, cashSafe, cashHalfMeasured, staffOverloaded, ownerOverloaded, unsafeToGuide: false,
  };

  const state: BusinessStateSnapshot = {
    cashRunwayDays: cashState ? RUNWAY_BY_STATE[cashState] ?? 0 : 0,
    // The runway above is a state PROXY, never a measurement, and it is a COMPARABLE figure only when CURRENT Cashflow evidence
    // supports it: a Cashflow reading that is current (not absent, stale, future-dated or superseded) AND whose cash position is
    // complete. Anything else (including a Finance-only reading) leaves it unmeasured, so no owner-facing change message is built
    // from a synthetic 0 / 45 / 120.
    cashRunwayMeasured: !!cashState && !(cash?.cashPosition.judged && !cash.cashPosition.complete),
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
      cashState, finState, financeFacts,
      discountAmount: metric?.discountAmount ?? null, revenue: metric?.revenue ?? null,
      b2bRevenue: metric?.b2bRevenue ?? null, newCustomers: metric?.newCustomers ?? null,
      repeatCustomers: metric?.repeatCustomers ?? null,
    },
    // The arbitrated cash/finance reading (currentCashFinanceReading above) — callers that
    // build an owner-facing cash-risk signal from a state must use THIS, never raw.cashState
    // directly. Using the raw, un-arbitrated cashflow-cycle state is exactly the bug a real human
    // usability test reproduced: Home presented a superseded AT_RISK/INSOLVENT_RISK cash reading
    // as the top priority while the newer finance diagnosis was SAFE, because the arbitration
    // result was computed here but never threaded through to the cash/profit-protection signal
    // builder downstream in getOwnerNowView.
    cashFinanceEffectiveState: cashFinanceResolution.gateState,
    // The state the owner-facing CASH signal may be raised from (cash-profit-protection.ts cashSignalState): a
    // profit-driven Finance state is not a cash danger. `cashFinanceEffectiveState` itself stays the enforced state.
    cashSignalState: cashSignalState({
      gateState: cashFinanceResolution.gateState as CashRiskState | null,
      gateDriver: cashFinanceResolution.gateDriver,
      cashState: cashFinanceResolution.supersededSource === "cash" ? null : (cashState as CashRiskState | undefined) ?? null,
      provisionalCashState: cashFinanceResolution.provisionalCashState as CashRiskState | null,
      financeMeasuredCash: financeFacts !== null && (financeFacts.cashRunwayDays !== null || financeFacts.cashDaysOfCosts !== null),
    }),
    avgActiveMargin,
    pipelineSummary,
    // The ONE business whose evidence was read (null ⇒ none): later business-scoped reads use the same scope.
    evidenceScope: scope,
  };
}

/** Business function each canonical priority class speaks to (plain-language "why it matters"). */
const BUSINESS_FUNCTION_BY_OWNER_CLASS: Record<OwnerPriorityClass, BusinessFunction> = {
  SAFETY_COMPLIANCE: BusinessFunction.RISK_COMPLIANCE,
  SURVIVAL_CASH: BusinessFunction.CASH_FLOW,
  CUSTOMER_SERVICE_FAILURE: BusinessFunction.CUSTOMER_COMPLAINTS,
  OVERLOAD_BLOCKING: BusinessFunction.CAPACITY,
  PROFIT_LOSS: BusinessFunction.PROFITABILITY,
  BLOCKED_EXECUTION: BusinessFunction.SOP_PROCESS,
  PLAN_COMMITMENT_RISK: BusinessFunction.STRATEGY,
  MISSING_CRITICAL_EVIDENCE: BusinessFunction.DATA_QUALITY,
  GROWTH_OPPORTUNITY: BusinessFunction.GROWTH_READINESS,
  PROCESS_OPTIMISATION: BusinessFunction.SOP_PROCESS,
};

/** What happens if the canonical main target is ignored, per business-priority class. */
const IF_IGNORED_BY_OWNER_CLASS: Record<OwnerPriorityClass, string> = {
  SAFETY_COMPLIANCE: "a legal or safety requirement stays unmet and can stop the business from operating",
  SURVIVAL_CASH: "you may run out of cash without warning",
  CUSTOMER_SERVICE_FAILURE: "customers keep getting let down and some will stop coming back",
  OVERLOAD_BLOCKING: "the overload keeps blocking work and the backlog grows",
  PROFIT_LOSS: "the business keeps losing money it could keep",
  BLOCKED_EXECUTION: "the blocked work stays stuck and the problems behind it get worse",
  PLAN_COMMITMENT_RISK: "committing to the plan now could put money or delivery at risk",
  MISSING_CRITICAL_EVIDENCE: "OpsIQ's advice stays based on missing or old numbers and can point you the wrong way",
  GROWTH_OPPORTUNITY: "the opportunity stays unused",
  PROCESS_OPTIMISATION: "the process keeps costing more time than it needs to",
};

/** The evidence period a cash/finance reading describes, or null when that evidence is out of date. */


/**
 * Now View's avoid rules, described by what each would forbid (see owner-imperatives.ts). They pass
 * through the ONE shared reconciler, so an avoid rule never vetoes the canonical main target or a
 * supporting step: growth/volume/discount rules touch only a genuine GROW target; the workload rule
 * touches any action target; the hiring rule names no target work and is always kept as-is. A refresh
 * main target is a data request, so every avoid is kept as-is.
 */
const AVOID_PROHIBITION: Record<string, Pick<OwnerProhibition, "vetoes" | "levers" | "asCondition">> = {
  // Each condition states the PERMITTED SCOPE of the canonical steps it touches — never a "do not" that
  // would forbid them.
  avoid_growth_before_gates: { vetoes: "GROW", asCondition: (t) => `Run ${quoteTitles(t)} as a capped trial within its existing budget until the cash, profit, capacity, workload and quality gates pass.` },
  avoid_growth_on_cash_danger: { vetoes: "GROW", asCondition: (t) => `Run ${quoteTitles(t)} as a small, low-cost trial within its existing budget while cash or financial survival is at risk.` },
  avoid_discount_on_cash_danger: { vetoes: "GROW", asCondition: (t) => `Carry out ${quoteTitles(t)} at your normal prices and margins while cash or financial survival is at risk.` },
  avoid_marketing_on_service_failure: { vetoes: "GROW", asCondition: (t) => `Run ${quoteTitles(t)} only at a volume your service can handle well until service quality is fixed.` },
  avoid_volume_on_capacity: { vetoes: "GROW", asCondition: (t) => `Run ${quoteTitles(t)} only up to what current capacity can deliver.` },
  avoid_growth_on_supplier_risk: { vetoes: "GROW", asCondition: (t) => `Run ${quoteTitles(t)} only up to what current supply can support until supplier risk is resolved.` },
  avoid_new_tasks_on_overload: { vetoes: "ANY_ACTION", asCondition: (t) => `Go ahead with ${quoteTitles(t)}; hold other new non-critical tasks for staff and the owner until the workload eases.` },
};

/**
 * Now View's avoid list reconciled with the canonical decision (main target AND supporting steps). A
 * rule that would forbid a canonical step becomes a condition on it (`conditionOn` set, `avoid` = the
 * permitted scope); surfaces show conditions as how to carry out the steps, never under "do not".
 */
export function reconcileAvoidsWithOwnerDecision(avoids: ActionToAvoid[], decision: CurrentOwnerDecision): ActionToAvoid[] {
  const ctx = ownerImperativeContext(decision);
  return avoids.map((a) => {
    const spec = AVOID_PROHIBITION[a.id];
    if (!spec) return a;
    const r = reconcileOwnerProhibition({ text: a.avoid, ...spec }, ctx);
    return r.kind === "condition" ? { ...a, avoid: r.text, conditionOn: r.conditionOn } : a;
  });
}

function buildBeginner(view: OwnerNowView, steps: GuidanceStep[], ownerDecision?: CurrentOwnerDecision | null): BeginnerExplanation {
  // When the canonical owner decision is available, EVERY overall-priority field (headline, what to
  // do first, why it matters, what not to do, what happens if ignored) comes from it — Now View's
  // own operating signals (topOwnerActions / step-by-step) are domain context and may not name a
  // different overall priority. Without a decision, Now View never elects its own "#1": the
  // headline stays neutral and the steps are presented as operating signals.
  const avoidFromView = view.actionsToAvoid.map((a) => a.avoid);
  if (ownerDecision) {
    const primary = ownerDecision.primaryTarget;
    const whatToDoFirst = primary
      // The main target is the ONE first step; supporting steps follow it and never read as equals.
      ? [primary.title, ...ownerDecision.supportingSteps.map((t) => `Then: ${t.title}`)]
      : ownerDecision.whatToDoFirst
        ? [...new Set([ownerDecision.whatToDoFirst, ...ownerDecision.missingInformation])]
        : ownerDecision.missingInformation.length > 0
          ? ownerDecision.missingInformation
          : ["Keep your business numbers up to date so OpsIQ can spot problems early"];
    // The decision's own "don't" list only: Now View's avoid list is shown separately on the page
    // (and was already reconciled with the main target), so repeating it here would duplicate it.
    const whatNotToDo = ownerDecision.whatNotToDo;
    // No open diagnosed action is not the same as "no danger": the operating signals on this same
    // page can still show cash danger, so the headline never contradicts them.
    const cashSignalUnsafe = view.cashDangerStatus === "CRITICAL" || view.cashDangerStatus === "DANGER";
    return buildBeginnerExplanation({
      headline: primary
        ? `Your main target: ${primary.title}`
        : ownerDecision.state === "NO_EVIDENCE"
          ? "OpsIQ needs your business numbers before it can pick a main target"
          : cashSignalUnsafe
            ? "No diagnosed area has an open action, but your cash signals need a check"
            : "No diagnosed area has an open action right now",
      businessFunction: [primary && primary.source !== "evidence_refresh" ? BUSINESS_FUNCTION_BY_OWNER_CLASS[primary.priorityClass] : BusinessFunction.DATA_QUALITY],
      whatToDoFirst,
      whatNotToDo: whatNotToDo.length > 0 ? whatNotToDo : ["Do not take on risk you cannot measure yet"],
      proofToCollect: ownerDecision.evidence.slice(0, 4),
      howToKnowItWorked: primary
        ? `${primary.title} is done and its result is measured against fresh figures on the next check`
        : "OpsIQ can name a main target from your numbers",
      ifIgnoredConsequence: primary
        ? primary.source === "evidence_refresh"
          // A refresh target stands in for out-of-date findings: the consequence is acting (or not)
          // on figures that may no longer be true — never a claim that the old problem is current.
          ? "OpsIQ's advice keeps resting on out-of-date figures, and a real problem they showed could go unchecked"
          : IF_IGNORED_BY_OWNER_CLASS[primary.priorityClass]
        : cashSignalUnsafe
          ? "you may run out of cash without warning"
          : "problems can build up unnoticed",
      dataIsWeak: ownerDecision.confidence.capped || view.confidenceCapped,
    });
  }
  return buildBeginnerExplanation({
    headline: "Your current operating signals",
    businessFunction: [BusinessFunction.DATA_QUALITY],
    whatToDoFirst: steps.length > 0 ? steps.map((s) => s.exactStep) : ["Keep tracking cash and complaints"],
    whatNotToDo: avoidFromView.length > 0 ? avoidFromView : ["Do not take on risk you cannot measure yet"],
    proofToCollect: steps.map((s) => s.proofType),
    howToKnowItWorked: "the signals improve on the next check",
    ifIgnoredConsequence: view.cashDangerStatus === "CRITICAL"
      ? "you may run out of cash without warning"
      : "problems can build up unnoticed",
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
  EXTERNAL_EVENT_INTERFERENCE: "External event interfered",
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
  db: GuidanceDeps["db"],
  /**
   * The active business this lifecycle view is being computed for (D1 fix). When supplied, a task
   * is only included if it belongs to this business OR is genuinely workspace-level (businessId
   * null AND sourceFamily is one of WORKSPACE_LEVEL_SOURCE_FAMILIES — the
   * WORKLOAD_REDUCTION/CAPABILITY_GAP/SOP_CHECKLIST/TRAINING/EFFECTIVENESS_RECHECK families never
   * carry a businessId by design; see BridgedExecutionRoute.businessId's doc comment in
   * process-execution-bridge.ts). This is the exact read path Cockpit's Execution lifecycle →
   * "Requires your decision" list renders from.
   *
   * A null businessId OUTSIDE that family set (in practice, legacy STARTUP_MODE rows created
   * before createBlueprint() stamped session.businessId — see startup-execution-blueprint.service.ts)
   * is NEVER treated as workspace-level here: a null businessId there means "not yet attributed,"
   * not "intentionally shared," and showing it to every business in the workspace regardless of
   * which one it actually belongs to was the exact residual mechanism behind the controlled-beta
   * launch-blocker cross-business leak (D1) after the write-path fix. See
   * WORKSPACE_LEVEL_SOURCE_FAMILIES in process-execution-bridge.service.ts for the single source
   * of truth for this family list — duplicated as a literal here (not imported) to avoid a
   * services/owner-mode -> services/owner-guidance layering dependency for one small constant;
   * keep the two lists in sync if the family set ever changes.
   */
  businessId: string | null = null,
  /**
   * Controlled-beta cockpit business-scoping fix (D-cockpit) — see GetOwnerNowViewOptions' doc
   * comment in getOwnerNowView. OFF by default (byte-for-byte the pre-existing query); when true
   * (only ever passed by getOwnerNowView when the caller opted in AND the workspace is ambiguous —
   * more than one real business), rows are further restricted to RELIABLY_ATTRIBUTABLE_SOURCE_FAMILIES
   * below, so a PROCESS_CORRECTION/expansion-family row — whose businessId is stamped from whichever
   * business happened to be active when it was computed, not from anything proving the underlying
   * proof/gaming/credibility evidence is actually about that business (see the workspace-wide
   * `deps.db.proof.findMany` scan in getOwnerNowView) — can never be shown as if it were the selected
   * business's own execution lifecycle item.
   */
  suppressUnattributableFamilies: boolean = false,
): Promise<OwnerExecutionLifecycleView | null> {
  try {
    const cutoff = new Date(Date.now() - RECENTLY_VERIFIED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const dbUntyped = db as unknown as ProcessExecutionTaskDb;
    const WORKSPACE_LEVEL_SOURCE_FAMILIES = ["WORKLOAD_REDUCTION", "CAPABILITY_GAP", "SOP_CHECKLIST", "TRAINING", "EFFECTIVENESS_RECHECK"] as const;
    // The only source families whose CONTENT (not just their persisted businessId column) is verified
    // to genuinely belong to the business it is stamped with: CASH_PROFIT is arbitrated per-business
    // cash/finance state (see cashFinanceEffectiveState in getOwnerNowView); STARTUP_MODE is always
    // stamped from the owning OwnerStartupSession.businessId by createBlueprint(). Every other family
    // (PROCESS_CORRECTION plus the PASS23 WORKSPACE_LEVEL_SOURCE_FAMILIES above) is derived, directly or
    // indirectly, from the workspace-wide process-intelligence/proof scan and carries no verified
    // per-business attribution, whatever businessId happens to be stamped on the persisted row.
    const RELIABLY_ATTRIBUTABLE_SOURCE_FAMILIES = ["CASH_PROFIT", "STARTUP_MODE"] as const;
    const tasks = await dbUntyped.processExecutionTask.findMany({
      where: {
        workspaceId,
        // Excludes acceptance/QA fixture tasks (see ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md) — Home
        // must never surface a QA blueprint's task to a real owner.
        isFixtureRecord: false,
        ...(businessId
          ? (suppressUnattributableFamilies
              ? { businessId, sourceFamily: { in: RELIABLY_ATTRIBUTABLE_SOURCE_FAMILIES } }
              : { OR: [{ businessId }, { businessId: null, sourceFamily: { in: WORKSPACE_LEVEL_SOURCE_FAMILIES } }] })
          : {}),
        AND: [
          {
            OR: [
              { status: { in: ["PROPOSED", "ACKNOWLEDGED", "IN_PROGRESS", "BLOCKED", "NEEDS_DATA", "COMPLETED", "OUTCOME_RECORDED", "OUTCOME_DISPUTED"] } },
              { status: "OUTCOME_VERIFIED", updatedAt: { gte: cutoff } },
            ],
          },
        ],
      },
      orderBy: { priorityRank: "asc" },
      take: 500,
    });

    // Fetch latest progress record per task (most recent createdAt)
    const taskIds: string[] = tasks.map((t) => t.id as string);
    const progressRows: Array<{ taskId: string; progressPct: number | null; blockerActive: boolean }> = taskIds.length > 0
      ? await dbUntyped.processExecutionTaskProgress.findMany({
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
        sourceFamily: t.sourceFamily as string,
        status,
        ownerVisibleSummary: t.ownerVisibleSummary as string,
        severity: t.severity as string,
        assignedRole: t.actionOwner as string,
        createdAt: (t.createdAt as Date).toISOString(),
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
  db: GuidanceDeps["db"],
  businessId: string | null = null,
  suppressUnattributableFamilies: boolean = false,
): Promise<OwnerExecutionLifecycleView | null> {
  return buildExecutionLifecycle(workspaceId, db, businessId, suppressUnattributableFamilies);
}

// ── Phase 4: Business Operating System summary ───────────────────────────────

async function buildBusinessOperatingSystem(
  workspaceId: string,
  businessId: string | null,
  db: GuidanceDeps["db"],
  objectiveGoalAlignmentFn?: GuidanceDeps["objectiveGoalAlignmentFn"],
): Promise<BusinessOperatingSystemView | null> {
  try {
    // GuidanceDb is deliberately a minimal interface (see its own doc comment); this function
    // reads several Prisma models (businessRiskEntry, constraintResolutionRecord, etc.) that are
    // intentionally not part of it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;
    const now = Date.now();

    // 1. Active business objectives with blocking dependencies and child counts.
    //
    // Scoped to the selected active business: businessId=null on a BusinessObjective row is an
    // EXPLICIT workspace/portfolio-level objective (see prisma/schema.prisma), not "unset" or a
    // wildcard match, so this must never fall back to a workspace-wide query. A business-specific
    // Home/Priorities view (businessId provided) shows only that business's own objectives — an
    // objective belonging to a different business in the same workspace must never appear here.
    // A zero-active-business view (businessId === null) shows only explicit workspace-level
    // objectives, never any business's own objectives folded in.
    const objectiveScope = { workspaceId, businessId, status: "ACTIVE", isFixtureRecord: false };
    const rawObjectives: Array<{
      id: string; title: string; objectiveType: string; status: string;
      priorityScore: number; targetValue: number | null; currentValue: number | null;
      deadline: Date | null; linkedGoalId: string | null; parentId: string | null;
      blockedBy: { id: string }[]; _count: { children: number };
    }> = await dbAny.businessObjective.findMany({
      // isFixtureRecord: false — Home must never surface a QA blueprint's objective as a real
      // owner's goal. See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
      where: objectiveScope,
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
        // isFixtureRecord: false — a QA blueprint's allocation must never skew a real owner's
        // resource-utilization percentage. See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
        where: { workspaceId, poolId: { in: poolIds }, status: "ALLOCATED", isFixtureRecord: false },
        _sum: { allocationAmount: true },
      });
      totalAllocated = Number(aggResult._sum?.allocationAmount ?? 0);
    }
    const resourceUtilizationPct = totalCapacity > 0
      ? Math.min(100, Math.round((totalAllocated / totalCapacity) * 100))
      : null;

    // 3. Top risks by severity (active risks: IDENTIFIED, ASSESSED, MITIGATING, ACCEPTED)
    //
    // hasExactlyOneRealBusiness gate (D2, controlled-beta launch-blocker closure) — stricter than
    // the earlier hasAnyRealBusiness staleness fix. BusinessRiskEntry has NO businessId column at
    // all, so this query can never filter by the currently-selected business. Live production
    // browser acceptance proved that in a workspace with MORE than one real business, showing
    // these workspace-wide rows on Home/Cockpit silently misattributes them: the SAME risk record
    // IDs render as if they belonged to whichever business happens to be selected. With exactly one
    // real business, workspace-wide data and that business's data are the same set by definition,
    // so surfacing it is correct; with zero or two-or-more, it is hidden rather than guessed at.
    // (The nav entry for the standalone Risk page is hidden for the same underlying reason — see
    // sidebar-nav.tsx.)
    // Read-time correction for historical rows whose isFixtureRecord was incorrectly persisted as
    // false (createBlueprint()'s write-time gap, now fixed) — excludes any risk/constraint linked
    // to a startup session that is itself, or is handed off to a business that is,
    // isFixtureBusiness: true. Never touches stored data. Fetched unconditionally (used by both
    // the risk query below, gated on hasExactlyOneRealBusiness, and the constraint query further
    // down, which is not gated on business count). See getFixtureTaintedStartupSessionIds() doc
    // comment.
    const fixtureTaintedSessionIds = await getFixtureTaintedStartupSessionIds(workspaceId);
    const fixtureSessionExclusion =
      fixtureTaintedSessionIds.length > 0
        ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: fixtureTaintedSessionIds } }] }
        : {};

    const topRisks: Array<{ id: string; title: string; severity: number; status: string; category: string }> =
      (await hasExactlyOneRealBusiness(workspaceId))
        ? await dbAny.businessRiskEntry.findMany({
            // isFixtureRecord: false — Home must never surface a QA blueprint's risk as a real
            // owner's top risk. See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
            where: {
              workspaceId,
              status: { in: ["IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED"] },
              isFixtureRecord: false,
              ...fixtureSessionExclusion,
            },
            orderBy: { severity: "desc" },
            take: 3,
            select: { id: true, title: true, severity: true, status: true, category: true },
          })
        : [];

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
      // isFixtureRecord: false — Home must never surface a QA blueprint's constraint as a real
      // owner's active constraint. See ACCEPTANCE_FIXTURE_ISOLATION_PLAN.md.
      where: { workspaceId, status: "ACTIVE", isFixtureRecord: false, ...fixtureSessionExclusion },
      orderBy: { bindingScore: "desc" },
      take: 5,
      select: { id: true, title: true, constraintType: true, bindingScore: true, status: true, remediationAction: true },
    }).catch(() => [] as typeof activeConstraintRows);
    const activeConstraintCount: number = await dbAny.constraintResolutionRecord.count({
      where: { workspaceId, status: "ACTIVE", isFixtureRecord: false, ...fixtureSessionExclusion },
    }).catch(() => 0);

    // 6. KPI ownership count — isFixtureRecord: false excludes acceptance/QA fixture KPIs.
    const kpiCount: number = await dbAny.kPIOwnershipRecord.count({ where: { workspaceId, isFixtureRecord: false } });

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

    // Goal-link alignment re-evaluated at read time: a link to a replaced goal follows its successor,
    // and only an ACTIVE goal in the objective's scope counts (the objectives here are all in `businessId`'s scope).
    const alignedObjectiveIds = objectiveGoalAlignmentFn
      ? await objectiveGoalAlignmentFn(
          workspaceId,
          rawObjectives.map((o) => ({ objectiveId: o.id, objectiveBusinessId: businessId, linkedGoalId: o.linkedGoalId })),
        )
      : null;

    // Build portfolio view from raw objectives
    const portfolioInputs = rawObjectives.map((obj) => {
      const daysRemaining = obj.deadline
        ? Math.round((obj.deadline.getTime() - now) / 86_400_000)
        : null;
      // null (not 0) when no target is set or progress has never been measured — a never-measured
      // objective is not evidence it's 0% done (UNKNOWN != BAD). scoreObjectiveHealth treats null
      // as "no progress penalty applies," not as a bad score.
      const progressPct = obj.targetValue && obj.currentValue !== null
        ? Math.min(100, Math.round(((obj.currentValue ?? 0) / obj.targetValue) * 100))
        : null;
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
        linkedGoalAligned: alignedObjectiveIds ? alignedObjectiveIds.has(obj.id) : obj.linkedGoalId !== null,
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

/**
 * Optional read-time restriction (controlled-beta cockpit business-scoping fix, D-cockpit).
 *
 * `processCorrections` / `sopChecklistCorrections` / `trainingAssignments` / `ownerWorkloadReduction` /
 * `capabilityGaps` / `sopTrainingEffectiveness` (and therefore the PROCESS_CORRECTION routes and the
 * PASS23 expansion families they feed into `processExecution`) are ALL ultimately derived from
 * `processIntelligence`, which is built from a workspace-wide proof scan
 * (`deps.db.proof.findMany({ where: { workspaceId } })` above — deliberately workspace-wide so
 * anti-gaming/credibility detection catches an operator gaming proof ACROSS businesses in the same
 * workspace, not a per-business bug). `ProcessIntelligenceAnalysis` carries no per-finding business
 * attribution at all. `buildProcessExecutionBridge`'s `businessId` parameter only stamps the CURRENTLY
 * ACTIVE business onto a PROCESS_CORRECTION/expansion route's `businessId`/`taskKey` for persistence
 * identity — it does not (and cannot, from this input) prove the underlying finding is actually about
 * that business. In a workspace with more than one real business this makes a workspace-wide finding
 * indistinguishable, from the owner's side, from a genuine cross-business leak: switching the selected
 * business does not change this content, so a Cockpit "Governed work" / "Execution lifecycle" widget can
 * silently keep showing one business's evidence under every other business's name.
 *
 * `restrictExecutionToAttributableBusiness: true` closes exactly that display gap using the SAME
 * precedented pattern this file already uses for BusinessRiskEntry (see hasExactlyOneRealBusiness's own
 * doc comment): when a `businessId` is supplied and the workspace holds MORE than one real business,
 * `processExecution` and `executionLifecycle` are restricted to the source families that ARE genuinely,
 * verifiably attributable to the stamped business (CASH_PROFIT — arbitrated per-business cash/finance
 * state, see cashFinanceEffectiveState below — and STARTUP_MODE — createBlueprint() always stamps the
 * owning session's real businessId). With zero or exactly one real business this is a no-op (unambiguous
 * by definition), so a single-business workspace is byte-for-byte unaffected.
 *
 * OFF by default (`undefined`/`false` preserves the exact pre-existing payload for every caller). Used
 * ONLY by the cockpit's own now-view read (see src/app/api/owner/now-view/route.ts's opt-in query
 * parameter and MinimumOwnerCockpitPage's fetch) — never by the process-execution POST route's
 * server-authoritative re-derivation+persist step, nor by /owner/priorities, /owner/process-intelligence,
 * or /owner/now, which already document and rely on today's workspace-wide semantics for these exact
 * signals and are out of scope for this fix.
 */
export interface GetOwnerNowViewOptions {
  restrictExecutionToAttributableBusiness?: boolean;
  /**
   * The ONE canonical owner decision (owner-home service → Spine arbiter). Now View ENRICHES it and
   * never elects a competing overall target: when supplied, the plain-language headline names this
   * decision's primary target. (The decision's own change history is recorded by the owner-home
   * resolver, independent of this route.)
   */
  ownerDecision?: CurrentOwnerDecision | null;
  /**
   * The owner action gate's constraints the canonical decision was resolved with (same business). The
   * growth-readiness tier and the Cockpit's do-not-repeat annotation are derived from them (never from a
   * second lookup); without them no do-not-repeat annotation is shown.
   */
  ownerGate?: OwnerGateConstraints | null;
}

/**
 * Produce the live Owner Now View: assemble, diff vs the prior guidance snapshot, run the orchestrator, and
 * append a guidance-history row only when the observed state changed. Raises no alerts and emits no audit.
 */
export async function getOwnerNowView(
  workspaceId: string,
  businessId: string | null,
  injected?: GuidanceDeps,
  _actorId?: string,
  options?: GetOwnerNowViewOptions,
): Promise<OwnerNowViewPayload> {
  // Read-only: overdue risk-review alerts are raised by the scheduler's risk-review scan and by the risk
  // mutations (business-risk.service.ts), never by loading this view.
  const deps = injected ?? (await resolveDefaultDeps());
  const { ctx, state, ag, raw, cashFinanceEffectiveState, cashSignalState: cashSignalStateForProtection, avgActiveMargin, pipelineSummary, evidenceScope } = await assembleGuidanceContext(workspaceId, businessId, deps, options?.ownerGate);

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

  // The guidance history this view appends to is keyed exactly as it is written (businessId or null).
  const prev = await deps.db.ownerGuidanceSnapshot.findFirst({
    where: { workspaceId, businessId: businessId ?? null },
    orderBy: { createdAt: "desc" },
  });
  const changes: DetectedChange[] = prev ? detectChanges(prevState(prev), state) : [];

  // PASS 26: read the persisted execution tasks ONCE so effectiveness attribution uses the REAL execution state
  // (completed-with-evidence vs proposed/in-progress) rather than assuming nothing was executed, and so the
  // bridge status annotation below reuses the same read. Best-effort — an unavailable table yields [].
  const persistedProcessTasks = (processIntelligence && processCorrections)
    ? await getPersistedProcessTasks(workspaceId, undefined, businessId).catch(() => [])
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
        cashRunwayDays: cashFinanceEffectiveState != null && !SAFE_STATES.has(cashFinanceEffectiveState) ? raw.financeFacts?.cashRunwayDays ?? null : null,
        netMarginPct: null,
        // Arbitrated (see resolveCashFinanceSignal / cashFinanceEffectiveState above), never
        // raw.cashState directly -- using the raw, un-arbitrated cashflow-cycle reading here was
        // the exact bug a real human usability test reproduced: Home presented a superseded
        // AT_RISK/INSOLVENT_RISK cash reading as the top priority action while the newer finance
        // diagnosis was SAFE.
        cashRunwayState: cashSignalStateForProtection,
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
        // Profit is assessed from the CURRENT Finance diagnosis's own figures (revenue, costs, margin) — the
        // Cash-flow cycle is a separate module and its absence is not a profit-data gap. A gap is named only
        // when the current Finance snapshot genuinely lacks a figure the assessment needs.
        financialDataComplete: raw.finState != null && (raw.financeFacts?.missingFinancialFields.length ?? 0) === 0,
        missingFinancialFields: raw.finState != null ? raw.financeFacts?.missingFinancialFields ?? [] : [],
        // Enrichment for an already-raised cash risk only (the arbitrated state still decides).
        financeCashDaysOfCosts: raw.financeFacts?.cashDaysOfCosts ?? null,
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
  // See GetOwnerNowViewOptions' doc comment: only when the caller opts in AND a specific business is
  // selected AND the workspace holds more than one real business (ambiguous attribution) do we drop the
  // PROCESS_CORRECTION / expansion-family inputs from the bridge below — CASH_PROFIT stays in either way,
  // since it is genuinely per-business (arbitrated cash/finance state, not the workspace-wide proof scan).
  const restrictExecutionToBusiness = Boolean(options?.restrictExecutionToAttributableBusiness) && businessId !== null;
  const executionAttributionAmbiguous = restrictExecutionToBusiness ? !(await hasExactlyOneRealBusiness(workspaceId)) : false;
  const processExecution: ProcessExecutionBridgeAnalysis | null =
    (processCorrections || cashProfitProtection || bridgeExpansion.routes.length > 0)
      ? buildProcessExecutionBridge(
          executionAttributionAmbiguous ? null : processCorrections,
          cashProfitProtection,
          workspaceId,
          new Date(deps.now()).toISOString(),
          executionAttributionAmbiguous ? null : bridgeExpansion,
          businessId,
        )
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
            r.canStart = computeCanStart(r.executionRoute, s, r.approvalLevel);
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
  const cashProfitRiskActive = cashProfitRiskIsActive(cashProfitProtection, cashFinanceEffectiveState as CashRiskState | null);

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
          cashProfitRiskActive: cashProfitRiskIsActive(cashProfitProtection, cashFinanceEffectiveState as CashRiskState | null),
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
          cashProfitRiskActive: cashProfitRiskIsActive(cashProfitProtection, cashFinanceEffectiveState as CashRiskState | null),
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
  // Scoped to the selected business: another business's goal is never shown here, and a legacy
  // workspace goal only in a single-business workspace (goal.service.ts resolveHomeGoal).
  const goalResolved = hasGoalFn
    ? await deps.goalTrajectoryFn!(workspaceId, businessId).catch(() => null)
    : null;
  const goalTrajectoryRaw = goalResolved && goalResolved.goal ? goalResolved : null;
  const noGoalScopeLabel = goalResolved && !goalResolved.goal ? goalResolved.scopeLabel : null;
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
      beginnerExplanation: `${noGoalScopeLabel ?? "No active goal is set"}. Add a goal to track your progress.`,
      scopeLabel: noGoalScopeLabel,
      goalScope: null,
      unavailableReason: null,
    };
  }
  if (goalTrajectoryRaw) {
    const { goal, trajectory } = goalTrajectoryRaw;
    const unavailableReason = "unavailableReason" in goalTrajectoryRaw ? goalTrajectoryRaw.unavailableReason ?? null : null;
    const goalTitle = GOAL_TYPE_LABEL[goal.targetType] ?? goal.targetType.toLowerCase().replace(/_/g, " ");
    const ownerMonths = (goal.targetDate.getTime() - Date.now()) / (30.44 * 24 * 60 * 60 * 1000);

    let goalState: GoalAttentionSignal["state"];
    let beginnerExplanation: string;

    if (unavailableReason) {
      goalState = "INSUFFICIENT_DATA";
      beginnerExplanation = unavailableReason;
    } else if (trajectory.confidence === "LOW") {
      goalState = "INSUFFICIENT_DATA";
      beginnerExplanation = "Not enough data yet to project your goal. Keep recording results.";
    } else if (trajectory.confidence === "MEDIUM" && trajectory.confidenceRationale.includes("days old")) {
      goalState = "STALE";
      beginnerExplanation = "Your last result was recorded more than 60 days ago. Update your numbers to get a fresh projection.";
    } else if (trajectory.projectedMonthsToGoal === null && trajectory.trajectoryMiss) {
      goalState = "AT_RISK";
      beginnerExplanation = "At the current rate your goal is decades away. Growth needs to speed up substantially.";
    } else if (trajectory.projectedMonthsToGoal === null && trajectory.onTrack !== null) {
      goalState = "NO_GROWTH";
      beginnerExplanation = "At the current rate, your goal cannot be reached. Growth needs to turn positive.";
    } else if (trajectory.projectedMonthsToGoal === null) {
      // e.g. results crossing from a loss into profit: no compound rate exists, so no projection.
      goalState = "INSUFFICIENT_DATA";
      beginnerExplanation = "Your results cross zero, so OpsIQ can't project a date yet. Keep recording results.";
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
      currentTrajectoryDateIso:
        trajectory.currentTrajectoryDate && Number.isFinite(trajectory.currentTrajectoryDate.getTime())
          ? trajectory.currentTrajectoryDate.toISOString()
          : null,
      requiredMonthlyImprovement: trajectory.requiredMonthlyImprovement,
      confidence: trajectory.confidence as "LOW" | "MEDIUM" | "HIGH",
      trajectoryMiss: trajectory.trajectoryMiss,
      assumptions: trajectory.assumptions,
      beginnerExplanation,
      scopeLabel: "scopeLabel" in goalTrajectoryRaw ? goalTrajectoryRaw.scopeLabel ?? null : null,
      goalScope: goal.scope ?? null,
      unavailableReason,
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
  if (deps.db.ownerMetricSnapshot.findMany && evidenceScope) {
    // One business's periods only: comparing business A's period with business B's is not a trend.
    // Completed periods only: an in-progress (partial) or future period compared with a full one is not a trend.
    const snapshots = await deps.db.ownerMetricSnapshot.findMany({
      where: { ...evidenceScope, periodEnd: { lte: new Date(deps.now()) } },
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
    // An incomplete cash position is UNKNOWN to the business-condition signals (never a proxy state / resilience).
    cashState: state.cashRunwayMeasured === false ? undefined : raw.cashState,
    finState: raw.finState,
    cashRunwayDays: state.cashRunwayMeasured === false ? 0 : state.cashRunwayDays,
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

  const builtView = buildOwnerNowView({ ...ctx, changes });
  // Now View's avoid list never vetoes the owner's canonical main target (see reconcileAvoidsWithOwnerDecision).
  const view = options?.ownerDecision
    ? { ...builtView, actionsToAvoid: reconcileAvoidsWithOwnerDecision(builtView.actionsToAvoid, options.ownerDecision) }
    : builtView;
  const stepByStep = view.topOwnerActions.map((i) => stepFor(i, ag));
  const beginnerExplanation = buildBeginner(view, stepByStep, options?.ownerDecision);

  // Do-Not-Repeat Annotation — the canonical main target, against the SAME gate constraints the decision was
  // resolved with (ownerDnrAnnotationFromGate: business attribution, opt-out, lifted rules and this
  // business's Owner overrides). A step the gate allows is never claimed to be held.
  const canonicalPrimary = options?.ownerDecision?.primaryTarget ?? null;
  const doNotRepeatAnnotation: DoNotRepeatAnnotation | null = canonicalPrimary
    ? ownerDnrAnnotationFromGate(options?.ownerGate ?? null, {
        source: canonicalPrimary.source,
        domain: canonicalPrimary.domain,
        findingId: canonicalPrimary.findingId,
        findingCode: canonicalPrimary.findingCode,
        intent: ownerTargetIntent(canonicalPrimary),
        ruleId: canonicalPrimary.ruleId ?? null,
      })
    : null;
  const [executionLifecycle, businessOperatingSystem] = await Promise.all([
    buildExecutionLifecycle(workspaceId, deps.db, businessId, executionAttributionAmbiguous),
    buildBusinessOperatingSystem(workspaceId, businessId, deps.db, deps.objectiveGoalAlignmentFn),
  ]);

  // Guidance history ("what changed since the last check", and the SOP-effectiveness baseline) is only
  // appended when the observed state differs from the latest recorded one: re-reading an unchanged business
  // — repeatedly or concurrently — writes nothing. (Reads never raise alerts or audit events.)
  const guidanceState = {
    classification: view.classification, cashSafe: ctx.cashSafe, growthGatePassed: ctx.growthGatePassed,
    staffOverloaded: ctx.staffOverloaded, ownerOverloaded: ctx.ownerOverloaded, dataConfidence: ctx.dataConfidence,
    topIssueCount: view.topOwnerActions.length, missingDataCount: view.missingDataRequests.length,
    cashRunwayDays: state.cashRunwayDays, netMarginPct: state.netMarginPct, complaintsCount: state.complaintsCount,
    reworkCount: state.reworkCount, capacityUtilizationPct: state.capacityUtilizationPct,
    staffOverloadPct: state.staffOverloadPct, ownerLoadPct: state.ownerLoadPct, churnRiskScore: state.churnRiskScore,
    supplierInventoryRiskScore: state.supplierInventoryRiskScore, overdueProofCount: state.overdueProofCount,
    outcomeChecksDue: state.outcomeChecksDue, growthReadinessTier: state.growthReadinessTier,
  };
  const prevRecord = prev as unknown as Record<string, unknown> | null;
  const unchangedSincePrev = prevRecord !== null &&
    (Object.keys(guidanceState) as Array<keyof typeof guidanceState>).every((k) => (prevRecord[k] ?? null) === (guidanceState[k] ?? null));
  if (!unchangedSincePrev) {
    await deps.db.ownerGuidanceSnapshot.create({
      data: {
        id: deps.uuid(), workspaceId, businessId: businessId ?? null,
        ...guidanceState,
        payload: { view, whatChanged: changes, stepByStep, beginnerExplanation, archetype: ag.archetype, cashRunwayMeasured: state.cashRunwayMeasured !== false } as unknown as Record<string, unknown>,
      },
    });
  }

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
    cashRunwayDays: row.cashRunwayDays,
    cashRunwayMeasured: (row.payload as { cashRunwayMeasured?: unknown } | null | undefined)?.cashRunwayMeasured !== false, netMarginPct: row.netMarginPct, complaintsCount: row.complaintsCount,
    reworkCount: row.reworkCount, capacityUtilizationPct: row.capacityUtilizationPct, staffOverloadPct: row.staffOverloadPct,
    ownerLoadPct: row.ownerLoadPct, churnRiskScore: row.churnRiskScore, supplierInventoryRiskScore: row.supplierInventoryRiskScore,
    overdueProofCount: row.overdueProofCount, outcomeChecksDue: row.outcomeChecksDue, growthReadinessTier: row.growthReadinessTier,
  };
}
