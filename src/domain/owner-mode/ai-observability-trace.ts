/**
 * AI Observability Trace Layer — Phase 26
 *
 * Traces every advisory cycle end-to-end so AI contributions are auditable
 * and strictly separated from deterministic human decisions.
 *
 * AI contributions are observable but never decision-making.
 */

import { assertWorkspaceScopedQuery } from "./security-rules";

// ─── Trace Event Types ────────────────────────────────────────────────────────

export type AiTraceEventType =
  | "input_received"
  | "input_quality_assessed"
  | "diagnosis_generated"
  | "recommendation_generated"
  | "recommendation_verified"
  | "owner_decision_recorded"
  | "action_created"
  | "evidence_submitted"
  | "evidence_verified"
  | "outcome_reported"
  | "harm_recorded"
  | "adjudication_completed"
  | "causal_attribution_completed"
  | "reassessment_created"
  | "learning_eligibility_decided"
  | "dashboard_updated";

// ─── Core Trace Structures ────────────────────────────────────────────────────

export interface AiTraceInputSummary {
  /** Field names used — never raw values */
  fieldNames: string[];
  fieldCount: number;
  estimatedFieldCount: number;
  staleFieldCount: number;
}

export interface AiTraceRiskFlag {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface AiTraceBlockedGate {
  gateName: string;
  reason: string;
  blockedAt: string;
}

export interface OwnerAiTraceEvent {
  /** Unique event within the trace */
  eventId: string;
  traceId: string;
  workspaceId: string;
  eventType: AiTraceEventType;
  timestamp: string;
  /** Summary of inputs used — never raw business values */
  inputsSummary?: AiTraceInputSummary;
  /** What AI output or advisory was generated */
  decisionMade?: string;
  confidenceScore?: number;
  riskFlags: AiTraceRiskFlag[];
  blockedGates: AiTraceBlockedGate[];
  latencyMs?: number;
  errorCode?: string;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptTemplateVersion?: string;
  rulesetVersion?: string;
  retrievalContextVersion?: string;
  createdAt: string;
}

export interface OwnerAiTrace {
  traceId: string;
  workspaceId: string;
  businessId: string;
  userId: string;
  module: string;
  createdAt: string;
  events: OwnerAiTraceEvent[];
}

// ─── Public Trace View (no internal AI model metadata exposed) ─────────────

export interface PublicAiTraceEventView {
  eventId: string;
  traceId: string;
  eventType: AiTraceEventType;
  timestamp: string;
  riskFlags: AiTraceRiskFlag[];
  blockedGates: AiTraceBlockedGate[];
  latencyMs?: number;
  errorCode?: string;
  createdAt: string;
  // model_provider, model_name, model_version, prompt_template_version,
  // ruleset_version, retrieval_context_version are intentionally excluded
  // from the public view — these are internal AI infrastructure fields.
}

export interface PublicAiTraceView {
  traceId: string;
  workspaceId: string;
  businessId: string;
  module: string;
  createdAt: string;
  eventCount: number;
  blockedGateCount: number;
  events: PublicAiTraceEventView[];
}

// ─── Input Validation ─────────────────────────────────────────────────────────

export interface CreateAiTraceInput {
  traceId: string;
  workspaceId: string;
  businessId: string;
  userId: string;
  module: string;
  createdAt: string;
}

export interface AddTraceEventInput {
  eventId: string;
  traceId: string;
  workspaceId: string;
  eventType: AiTraceEventType;
  timestamp: string;
  inputsSummary?: AiTraceInputSummary;
  decisionMade?: string;
  confidenceScore?: number;
  riskFlags?: AiTraceRiskFlag[];
  blockedGates?: AiTraceBlockedGate[];
  latencyMs?: number;
  errorCode?: string;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  promptTemplateVersion?: string;
  rulesetVersion?: string;
  retrievalContextVersion?: string;
  createdAt: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateCreateAiTraceInput(input: CreateAiTraceInput): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const errors: string[] = [];
  if (!input.traceId || input.traceId.trim().length === 0) {
    errors.push("traceId is required");
  }
  if (!input.businessId || input.businessId.trim().length === 0) {
    errors.push("businessId is required");
  }
  if (!input.userId || input.userId.trim().length === 0) {
    errors.push("userId is required");
  }
  if (!input.module || input.module.trim().length === 0) {
    errors.push("module is required");
  }
  if (!input.createdAt || input.createdAt.trim().length === 0) {
    errors.push("createdAt is required");
  }
  return errors;
}

export function validateAddTraceEventInput(input: AddTraceEventInput): string[] {
  assertWorkspaceScopedQuery({ workspaceId: input.workspaceId });
  const errors: string[] = [];
  if (!input.eventId || input.eventId.trim().length === 0) {
    errors.push("eventId is required");
  }
  if (!input.traceId || input.traceId.trim().length === 0) {
    errors.push("traceId is required");
  }
  if (!input.eventType) {
    errors.push("eventType is required");
  }
  if (!input.timestamp || input.timestamp.trim().length === 0) {
    errors.push("timestamp is required");
  }
  if (!input.createdAt || input.createdAt.trim().length === 0) {
    errors.push("createdAt is required");
  }
  if (input.confidenceScore !== undefined) {
    if (input.confidenceScore < 0 || input.confidenceScore > 100) {
      errors.push("confidenceScore must be 0–100");
    }
  }
  if (input.latencyMs !== undefined && input.latencyMs < 0) {
    errors.push("latencyMs must be non-negative");
  }
  return errors;
}

// ─── Trace Builder (in-memory, no DB required) ───────────────────────────────

export function createAiTrace(input: CreateAiTraceInput): OwnerAiTrace {
  const errors = validateCreateAiTraceInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid trace input: ${errors.join("; ")}`);
  }
  return {
    traceId: input.traceId,
    workspaceId: input.workspaceId,
    businessId: input.businessId,
    userId: input.userId,
    module: input.module,
    createdAt: input.createdAt,
    events: [],
  };
}

export function addTraceEvent(
  trace: OwnerAiTrace,
  input: AddTraceEventInput
): OwnerAiTrace {
  const errors = validateAddTraceEventInput(input);
  if (errors.length > 0) {
    throw new Error(`Invalid trace event input: ${errors.join("; ")}`);
  }
  if (input.traceId !== trace.traceId) {
    throw new Error(
      `Trace ID mismatch: event traceId "${input.traceId}" does not match trace "${trace.traceId}"`
    );
  }
  if (input.workspaceId !== trace.workspaceId) {
    throw new Error(
      `Workspace mismatch: event workspaceId "${input.workspaceId}" does not match trace "${trace.workspaceId}"`
    );
  }

  const event: OwnerAiTraceEvent = {
    eventId: input.eventId,
    traceId: input.traceId,
    workspaceId: input.workspaceId,
    eventType: input.eventType,
    timestamp: input.timestamp,
    inputsSummary: input.inputsSummary,
    decisionMade: input.decisionMade,
    confidenceScore: input.confidenceScore,
    riskFlags: input.riskFlags ?? [],
    blockedGates: input.blockedGates ?? [],
    latencyMs: input.latencyMs,
    errorCode: input.errorCode,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    modelVersion: input.modelVersion,
    promptTemplateVersion: input.promptTemplateVersion,
    rulesetVersion: input.rulesetVersion,
    retrievalContextVersion: input.retrievalContextVersion,
    createdAt: input.createdAt,
  };

  return {
    ...trace,
    events: [...trace.events, event],
  };
}

// ─── Public View Projection ───────────────────────────────────────────────────

export function toPublicTraceEventView(event: OwnerAiTraceEvent): PublicAiTraceEventView {
  return {
    eventId: event.eventId,
    traceId: event.traceId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    riskFlags: event.riskFlags,
    blockedGates: event.blockedGates,
    latencyMs: event.latencyMs,
    errorCode: event.errorCode,
    createdAt: event.createdAt,
    // model_provider, model_name, model_version, prompt_template_version,
    // ruleset_version, retrieval_context_version intentionally omitted
  };
}

export function toPublicTraceView(trace: OwnerAiTrace): PublicAiTraceView {
  assertWorkspaceScopedQuery({ workspaceId: trace.workspaceId });
  const blockedGateCount = trace.events.reduce(
    (sum, e) => sum + e.blockedGates.length,
    0
  );
  return {
    traceId: trace.traceId,
    workspaceId: trace.workspaceId,
    businessId: trace.businessId,
    module: trace.module,
    createdAt: trace.createdAt,
    eventCount: trace.events.length,
    blockedGateCount,
    events: trace.events.map(toPublicTraceEventView),
  };
}

// ─── Workspace Enforcement Query ─────────────────────────────────────────────

export function getTraceForWorkspace(
  trace: OwnerAiTrace,
  requestingWorkspaceId: string
): PublicAiTraceView {
  assertWorkspaceScopedQuery({ workspaceId: requestingWorkspaceId });
  if (trace.workspaceId !== requestingWorkspaceId) {
    throw new Error(
      `Access denied: trace belongs to workspace "${trace.workspaceId}", ` +
      `not "${requestingWorkspaceId}"`
    );
  }
  return toPublicTraceView(trace);
}

// ─── Full-Loop Trace Builder Helper ──────────────────────────────────────────

export interface FullLoopTraceSummary {
  traceId: string;
  workspaceId: string;
  businessId: string;
  totalEvents: number;
  eventsPresent: AiTraceEventType[];
  eventsMissing: AiTraceEventType[];
  blockedGateCount: number;
  hasError: boolean;
  complete: boolean;
}

const FULL_LOOP_EVENT_SEQUENCE: AiTraceEventType[] = [
  "input_received",
  "input_quality_assessed",
  "diagnosis_generated",
  "recommendation_generated",
  "recommendation_verified",
  "owner_decision_recorded",
  "action_created",
  "evidence_submitted",
  "evidence_verified",
  "outcome_reported",
  "harm_recorded",
  "adjudication_completed",
  "causal_attribution_completed",
  "reassessment_created",
  "learning_eligibility_decided",
  "dashboard_updated",
];

export function summarizeFullLoopTrace(trace: OwnerAiTrace): FullLoopTraceSummary {
  assertWorkspaceScopedQuery({ workspaceId: trace.workspaceId });
  const presentTypes = new Set(trace.events.map((e) => e.eventType));
  const eventsPresent = FULL_LOOP_EVENT_SEQUENCE.filter((t) => presentTypes.has(t));
  const eventsMissing = FULL_LOOP_EVENT_SEQUENCE.filter((t) => !presentTypes.has(t));
  const blockedGateCount = trace.events.reduce(
    (sum, e) => sum + e.blockedGates.length,
    0
  );
  const hasError = trace.events.some((e) => !!e.errorCode);
  return {
    traceId: trace.traceId,
    workspaceId: trace.workspaceId,
    businessId: trace.businessId,
    totalEvents: trace.events.length,
    eventsPresent,
    eventsMissing,
    blockedGateCount,
    hasError,
    complete: eventsMissing.length === 0,
  };
}
