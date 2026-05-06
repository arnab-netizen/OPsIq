/**
 * CANONICAL TEST FACTORIES
 *
 * All test objects MUST be created using these factories.
 * Inline object literals for contract types are forbidden.
 *
 * Rule: If you need a test contract object, use a factory.
 * No exceptions.
 */

import type {
  AuthContext,
  SessionInfo,
  AuthenticatedUser,
  PolicyContext,
  FeedbackAction,
  OutcomeAuditInput,
  ExecutionPlanStep,
  Action,
  WebhookPayload,
  MeasuredMetric,
} from "@/contracts";

// ─── AuthenticatedUser Factory ─────────────────────────────────────────────

export function createMockAuthenticatedUser(overrides?: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    isActive: true,
    ...overrides,
  };
}

// ─── SessionInfo Factory ──────────────────────────────────────────────────

export function createMockSessionInfo(overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    user: createMockAuthenticatedUser(),
    sessionId: "session-123",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    ...overrides,
  };
}

// ─── PolicyContext Factory ────────────────────────────────────────────────

export function createMockPolicyContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    userId: "user-123",
    roles: [
      {
        role: "SYSTEM_ADMIN" as RoleName,
        scope: undefined,
        scopeId: undefined,
      },
    ],
    engagementMemberships: [],
    ...overrides,
  };
}

// ─── AuthContext Factory (PRIMARY - use this) ────────────────────────────

export function createMockAuthContext(overrides?: {
  session?: Partial<SessionInfo>;
  policy?: Partial<PolicyContext>;
}): AuthContext {
  return {
    session: createMockSessionInfo(overrides?.session),
    policy: createMockPolicyContext(overrides?.policy),
  };
}

// ─── Mock Response Factory ─────────────────────────────────────────────────

export function createMockResponse(
  data: unknown = {},
  options?: { ok?: boolean; status?: number; statusText?: string }
): Response {
  const json = async () => data;
  const text = async () => JSON.stringify(data);

  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    statusText: options?.statusText ?? "OK",
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "http://test.local",
    clone: function() { return this; },
    blob: async () => new Blob([JSON.stringify(data)]),
    arrayBuffer: async () => new ArrayBuffer(0),
    text,
    json,
    formData: async () => new FormData(),
  } as Response;
}

// ─── Persistence Service Args Factory ─────────────────────────────────────

export function createPersistenceArgs(
  workspaceId: string = "workspace-123",
  actorId: string = "user-123"
): [workspaceId: string, actorId: string] {
  return [workspaceId, actorId];
}

// ─── Event Args Factory ────────────────────────────────────────────────────

export function createEventArgs(
  workspaceId: string = "workspace-123",
  actorId: string = "user-123",
  reason?: string
): [workspaceId: string, actorId: string, reason?: string] {
  return reason ? [workspaceId, actorId, reason] : [workspaceId, actorId];
}

// ─── Measured Metric Factory ──────────────────────────────────────────────

export function createMeasuredMetric(overrides?: Partial<MeasuredMetric>): MeasuredMetric {
  return {
    name: "Revenue",
    baseline_value: 100000,
    actual_value: 95000,
    unit: "USD",
    ...overrides,
  };
}

// ─── Outcome Audit Input Factory ──────────────────────────────────────────

export function createOutcomeAuditInput(overrides?: Partial<OutcomeAuditInput>): OutcomeAuditInput {
  return {
    action_id: "action-123",
    decision_id: "decision-123",
    workspace_id: "workspace-123",
    baseline_metric: createMeasuredMetric(),
    actual_outcome: createMeasuredMetric({ actual_value: 95000 }),
    variance: -5000,
    variance_pct: -5,
    before_confidence: 75,
    after_confidence: 60,
    feedback_action: "CONTINUE" as FeedbackAction,
    measurement_quality: "HIGH",
    ...overrides,
  };
}

// ─── Feedback Action Factory ──────────────────────────────────────────────

export function createFeedbackAction(action: FeedbackAction = "CONTINUE" as FeedbackAction): FeedbackAction {
  return action;
}

// ─── Action Factory ────────────────────────────────────────────────────────

export function createAction(overrides?: Partial<Action>): Action {
  return {
    action_id: "action-123",
    estimated_effort_hours: 40,
    title: "Test Action",
    ...overrides,
  };
}

// ─── Execution Plan Step Factory ──────────────────────────────────────────

export function createExecutionPlanStep(overrides?: Partial<ExecutionPlanStep>): ExecutionPlanStep {
  const now = new Date();
  const start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);

  return {
    action_id: "action-123",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    friction_delay_days: 0,
    capacity_hours_allocated: 40,
    ...overrides,
  };
}

// ─── Webhook Payload Factory ──────────────────────────────────────────────

export function createWebhookPayload(overrides?: Partial<WebhookPayload>): WebhookPayload {
  return {
    event_type: "action.completed",
    timestamp: new Date().toISOString(),
    workspace_id: "workspace-123",
    payload: { action_id: "action-123" },
    ...overrides,
  };
}
