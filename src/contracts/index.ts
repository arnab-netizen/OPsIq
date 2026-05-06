/**
 * CANONICAL CONTRACT LAYER
 *
 * All domain model, service, and test contracts are defined here.
 * NO duplicates allowed anywhere else in the codebase.
 *
 * Rule: If you need a contract type, import from @/contracts.
 * Inline object shapes or type definitions are forbidden for these types.
 */

// ─── AUTH & SESSION CONTRACTS ──────────────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
}

export interface SessionInfo {
  user: AuthenticatedUser;
  sessionId: string;
  expiresAt: Date;
}

export interface PolicyContext {
  userId: string;
  roles: Array<{
    role: string; // RoleName
    scope?: string | null;
    scopeId?: string | null;
  }>;
  engagementMemberships?: Array<{
    engagementId: string;
    role: string; // RoleName
  }>;
}

export interface AuthContext {
  session: SessionInfo;
  policy: PolicyContext;
}

// ─── OUTCOME & FEEDBACK CONTRACTS ─────────────────────────────────────────

export enum FeedbackAction {
  CONTINUE = "CONTINUE",
  REPLAN = "REPLAN",
  ROLLBACK = "ROLLBACK",
  HALT = "HALT",
}

export interface VarianceResult {
  variance_pct: number;
  variance_amount: number;
}

export interface FeedbackLoopInput {
  variance_result: VarianceResult;
  rollback_feasible: boolean;
  owner_id: string;
  decision_id: string;
}

export interface FeedbackLoopResult {
  action: FeedbackAction;
  reason: string;
  escalation_required: boolean;
  requires_owner_approval: boolean;
}

export interface MeasuredMetric {
  name: string;
  baseline_value: number;
  actual_value: number;
  unit: string;
}

export interface OutcomeAuditInput {
  action_id: string;
  decision_id: string;
  workspace_id: string;
  baseline_metric: MeasuredMetric;
  actual_outcome: MeasuredMetric;
  variance: number;
  variance_pct: number;
  before_confidence: number;
  after_confidence: number;
  feedback_action: FeedbackAction;
  measurement_quality: string;
}

export interface OutcomeAuditPacket {
  packet_id: string;
  action_id: string;
  decision_id: string;
  workspace_id: string;
  baseline_metric: MeasuredMetric;
  actual_outcome: MeasuredMetric;
  variance: number;
  variance_pct: number;
  confidence_before: number;
  confidence_after: number;
  feedback_action: FeedbackAction;
  measurement_quality: string;
  outcome_date: string;
  auditable: true;
}

export interface AuditQueryFilter {
  workspace_id?: string;
  action_id?: string;
  decision_id?: string;
  start_date?: string;
  end_date?: string;
}

// ─── EXECUTION PLAN CONTRACTS ─────────────────────────────────────────────

export interface Action {
  action_id: string;
  estimated_effort_hours: number;
  title: string;
}

export interface ExecutionPlanStep {
  action_id: string;
  start_time: string;
  end_time: string;
  friction_delay_days: number;
  capacity_hours_allocated: number;
}

export interface QuickWinValidationInput {
  execution_plan: ExecutionPlanStep[];
  action: Action;
  workspace_id: string;
}

export interface QuickWinValidationResult {
  is_quick_win: boolean;
  days_to_result: number;
  reason_if_blocked: string;
  max_days_allowed: number;
}

// ─── PERSISTENCE CONTRACTS ────────────────────────────────────────────────

export interface PersistenceInput {
  workspaceId: string;
  actorId: string;
}

export interface EventInput extends PersistenceInput {
  reason?: string;
}

// ─── WEBHOOK CONTRACTS ────────────────────────────────────────────────────

export interface WebhookPayload {
  event_type: string;
  timestamp: string;
  workspace_id: string;
  payload: unknown;
}

// ─── HTTP RESPONSE CONTRACT ───────────────────────────────────────────────

export interface MockResponse extends Response {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
}
