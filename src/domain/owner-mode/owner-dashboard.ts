/**
 * Owner Mode Dashboard Domain Contracts
 *
 * Defines workspace health, action queue aggregates, and dashboard configuration
 * visible only to workspace owners and admins.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";

// ─── Phase 23: Reality Loop Stage Proof ──────────────────────────────────────

export type LoopStageStatus =
  | "complete"
  | "in_progress"
  | "pending"
  | "requires_owner_action"
  | "blocked"
  | "not_applicable"
  | "missing_data";

export interface LoopStageSnapshot {
  stage: string;
  status: LoopStageStatus;
  requiresOwnerAction: boolean;
  summary?: string;
}

export interface OwnerLoopDashboardInput {
  workspaceId: string;
  businessId: string;
  periodLabel: string;
  inputQuality: LoopStageStatus;
  diagnosis: LoopStageStatus;
  recommendation: LoopStageStatus;
  ownerDecision: LoopStageStatus;
  action: LoopStageStatus;
  evidence: LoopStageStatus;
  outcomeStatus: LoopStageStatus;
  adjudication: LoopStageStatus;
  reassessment: LoopStageStatus;
  learningEligibility: LoopStageStatus;
  businessTrendWarnings?: string[];
  activeRecommendationSummary?: string;
  openBlockers?: string[];
  ownerAttentionItems?: string[];
  reassessmentRequired: boolean;
  ownerDecisionPending: boolean;
  harmFlagged: boolean;
}

export interface OwnerLoopDashboardView {
  valid: boolean;
  violations: string[];
  workspaceId: string;
  businessId: string;
  periodLabel: string;
  stages: LoopStageSnapshot[];
  activeRecommendationSummary: string | null;
  businessTrendWarnings: string[];
  openBlockers: string[];
  ownerAttentionItems: string[];
  harmFlagged: boolean;
  requiresOwnerAttention: boolean;
  reassessmentRequired: boolean;
  ownerDecisionPending: boolean;
  missingDataStages: string[];
}

// DASHBOARD-RULE-3: internal field names must not appear in owner-visible text
const INTERNAL_FIELD_PATTERNS: ReadonlyArray<RegExp> = [
  /adjudication_verdict/i,
  /attribution_class/i,
  /learning_confidence/i,
  /model_hint/i,
  /prompt_result/i,
  /causal_class/i,
  /eligibility_score/i,
  /internal_/i,
  /raw_score/i,
  /llm_output/i,
];

function containsInternalField(text: string): boolean {
  return INTERNAL_FIELD_PATTERNS.some((re) => re.test(text));
}

function checkText(label: string, text: string | undefined, violations: string[]): void {
  if (text && containsInternalField(text)) {
    violations.push(`${label} must not expose internal field names (DASHBOARD-RULE-3)`);
  }
}

const OWNER_ACTION_STAGES: ReadonlySet<string> = new Set([
  "ownerDecision",
  "reassessment",
]);

const STAGE_LABELS: ReadonlyArray<{ key: keyof OwnerLoopDashboardInput; label: string }> = [
  { key: "inputQuality", label: "Input Quality" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "recommendation", label: "Recommendation" },
  { key: "ownerDecision", label: "Owner Decision" },
  { key: "action", label: "Action" },
  { key: "evidence", label: "Evidence" },
  { key: "outcomeStatus", label: "Outcome" },
  { key: "adjudication", label: "Adjudication" },
  { key: "reassessment", label: "Reassessment" },
  { key: "learningEligibility", label: "Learning Eligibility" },
];

// DASHBOARD-RULE-1: workspaceId enforced by assertWorkspaceScopedQuery
// DASHBOARD-RULE-2: periodLabel required
// DASHBOARD-RULE-3: no internal field names in owner-visible text
// DASHBOARD-RULE-4: ownerAttentionItems required when reassessmentRequired or ownerDecisionPending

export function buildOwnerLoopDashboard(input: OwnerLoopDashboardInput): OwnerLoopDashboardView {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });

  const violations: string[] = [];

  // DASHBOARD-RULE-2
  if (!input.periodLabel || input.periodLabel.trim().length === 0) {
    violations.push("periodLabel is required (DASHBOARD-RULE-2)");
  }

  // DASHBOARD-RULE-3
  checkText("activeRecommendationSummary", input.activeRecommendationSummary, violations);
  for (const w of input.businessTrendWarnings ?? []) checkText("businessTrendWarnings item", w, violations);
  for (const b of input.openBlockers ?? []) checkText("openBlockers item", b, violations);
  for (const a of input.ownerAttentionItems ?? []) checkText("ownerAttentionItems item", a, violations);

  // DASHBOARD-RULE-4
  if ((input.reassessmentRequired || input.ownerDecisionPending) &&
      (!input.ownerAttentionItems || input.ownerAttentionItems.length === 0)) {
    violations.push(
      "ownerAttentionItems must be provided when reassessmentRequired or ownerDecisionPending (DASHBOARD-RULE-4)"
    );
  }

  const stages: LoopStageSnapshot[] = STAGE_LABELS.map(({ key, label }) => {
    const status = input[key] as LoopStageStatus;
    const requiresOwnerAction =
      status === "requires_owner_action" ||
      (OWNER_ACTION_STAGES.has(key) && status === "in_progress");
    return { stage: label, status, requiresOwnerAction };
  });

  const missingDataStages = stages
    .filter((s) => s.status === "missing_data" || s.status === "not_applicable")
    .map((s) => s.stage);

  const requiresOwnerAttention =
    input.reassessmentRequired ||
    input.ownerDecisionPending ||
    input.harmFlagged ||
    stages.some((s) => s.requiresOwnerAction);

  return {
    valid: violations.length === 0,
    violations,
    workspaceId: input.workspaceId,
    businessId: input.businessId,
    periodLabel: input.periodLabel,
    stages,
    activeRecommendationSummary: input.activeRecommendationSummary ?? null,
    businessTrendWarnings: input.businessTrendWarnings ?? [],
    openBlockers: input.openBlockers ?? [],
    ownerAttentionItems: input.ownerAttentionItems ?? [],
    harmFlagged: input.harmFlagged,
    requiresOwnerAttention,
    reassessmentRequired: input.reassessmentRequired,
    ownerDecisionPending: input.ownerDecisionPending,
    missingDataStages,
  };
}

export function loopDashboardRequiresOwnerAttention(view: OwnerLoopDashboardView): boolean {
  return view.requiresOwnerAttention;
}

// ─── Workspace Health Dashboard (existing) ────────────────────────────────────

export enum HealthStatus {
  CRITICAL = "critical",
  AT_RISK = "at_risk",
  HEALTHY = "healthy",
  IMPROVING = "improving",
  /**
   * Evidence is insufficient to assess the business (e.g. the cash position is not confirmed). This is an explicit UNKNOWN —
   * not a severity: it is never healthy, at-risk, critical or improving, and never counted as measured danger.
   */
  NEEDS_DATA = "needs_data",
}

export enum ActionQueuePriority {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export interface ActionQueueItem {
  id: string;
  engagementId: string;
  name: string;
  description?: string;
  owner?: string;
  priority: ActionQueuePriority;
  status: "draft" | "assigned" | "in_progress" | "blocked" | "completed" | "verified";
  dueDate?: string;
  assignee?: string;
  blockerCount: number;
  daysOverdue?: number;
}

export interface ActionQueueSummary {
  workspaceId: string;
  totalCount: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdueCount: number;
  blockedCount: number;
  completedThisWeek: number;
  averageCompletionDays: number;
  criticalActions: ActionQueueItem[];
  dueThisWeek: ActionQueueItem[];
}

export interface KPISummary {
  id: string;
  name: string;
  currentValue?: number;
  targetValue?: number;
  direction: "increase" | "decrease" | "maintain";
  trend: "improving" | "stable" | "deteriorating";
  percentOfTarget?: number;
  lastUpdated?: string;
}

export interface EngagementHealthSnapshot {
  engagementId: string;
  name: string;
  status: HealthStatus;
  kpiOnTrackCount: number;
  kpiTotalCount: number;
  actionCompletionRate: number;
  riskFactors: string[];
  lastReviewDate?: string;
  recommendation?: string;
}

export interface WorkspaceHealth {
  workspaceId: string;
  assessedAt: string;
  overallStatus: HealthStatus;
  engagementCount: number;
  healthyEngagements: number;
  atRiskEngagements: number;
  criticalEngagements: number;
  /** Businesses whose evidence is insufficient to assess (additive; absent on older payloads = 0). Never counted as risk. */
  needsDataEngagements?: number;
  /** Plain-language owner-attention lines for needs-data businesses (what to enter); never risk language. */
  needsDataItems?: string[];
  activeKPICount: number;
  onTrackKPICount: number;
  actionQueueSize: number;
  overdueActionCount: number;
  averageExecutionCertainty: number;
  engagementHealthSnapshots: EngagementHealthSnapshot[];
  topRisks: string[];
  recommendedActions: string[];
}

export interface OwnerDashboardConfig {
  workspaceId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  showCompletedActions: boolean;
  daysOfHistoryVisible: number;
  actionPriorityThreshold: ActionQueuePriority;
  healthStatusThreshold: HealthStatus;
  enableBulkActions: boolean;
  enableAdvancedFiltering: boolean;
  customFilters?: Record<string, unknown>;
}

export interface OwnerDashboardView {
  workspaceId: string;
  config: OwnerDashboardConfig;
  health: WorkspaceHealth;
  actionQueue: ActionQueueSummary;
  recentKPIs: KPISummary[];
}

export function validateActionQueueItem(item: ActionQueueItem): string[] {
  const errors: string[] = [];
  if (!item.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
    errors.push("Invalid action ID format");
  }
  if (!item.name || item.name.trim().length === 0) {
    errors.push("Action name required");
  }
  if (item.blockerCount < 0) {
    errors.push("blocker count must be non-negative");
  }
  return errors;
}

export function validateActionQueueSummary(summary: ActionQueueSummary): string[] {
  const errors: string[] = [];
  if (!summary.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(summary.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (summary.totalCount < 0) {
    errors.push("Total count must be non-negative");
  }
  if (summary.overdueCount < 0) {
    errors.push("Overdue count must be non-negative");
  }
  if (summary.averageCompletionDays < 0) {
    errors.push("Average completion days must be non-negative");
  }
  return errors;
}

export function validateWorkspaceHealth(health: WorkspaceHealth): string[] {
  const errors: string[] = [];
  if (!health.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(health.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (!health.assessedAt) {
    errors.push("Assessment timestamp required");
  }
  if (health.engagementCount < 0) {
    errors.push("Engagement count must be non-negative");
  }
  if (health.healthyEngagements + health.atRiskEngagements + health.criticalEngagements + (health.needsDataEngagements ?? 0) > health.engagementCount) {
    errors.push("Health snapshot counts exceed total engagement count");
  }
  if (health.averageExecutionCertainty < 0 || health.averageExecutionCertainty > 100) {
    errors.push("Execution certainty must be 0-100");
  }
  return errors;
}

export function validateOwnerDashboardConfig(config: OwnerDashboardConfig): string[] {
  const errors: string[] = [];
  if (!config.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (!config.ownerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.ownerId)) {
    errors.push("Invalid owner ID format");
  }
  if (config.daysOfHistoryVisible <= 0) {
    errors.push("Days of history visible must be positive");
  }
  return errors;
}

export function validateOwnerDashboardView(view: OwnerDashboardView): string[] {
  const errors: string[] = [];
  errors.push(...validateOwnerDashboardConfig(view.config));
  errors.push(...validateWorkspaceHealth(view.health));
  errors.push(...validateActionQueueSummary(view.actionQueue));
  return errors;
}
