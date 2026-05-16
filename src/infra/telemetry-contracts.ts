/**
 * PHASE 4: CANONICAL TELEMETRY CONTRACTS
 *
 * Immutable, deterministic telemetry event schemas.
 * Zero route-specific fields. Zero dynamic shape drift.
 * Forward-compatible versioning.
 *
 * This is NOT logging. This is operational truth.
 * Events MUST:
 * - emit deterministically
 * - preserve correlation IDs
 * - preserve execution traces
 * - classify auth vs infra vs policy correctly
 * - support SOC automation
 * - support attack detection
 * - never leak secrets or credentials
 * - never leak tenant existence
 */

/**
 * Core telemetry event types
 * Each type represents a distinct operational classification
 */
export type TelemetryEventType =
  | "AUTH_FAILURE"
  | "AUTH_SUCCESS"
  | "WORKSPACE_DENIED"
  | "CAPABILITY_DENIED"
  | "RATE_LIMITED"
  | "REPLAY_DETECTED"
  | "CIRCUIT_OPEN"
  | "REQUEST_SHED"
  | "SYSTEM_DEGRADED"
  | "INFRA_UNAVAILABLE"
  | "PARTIAL_VERIFICATION"
  | "HANDLER_EXECUTION_STARTED"
  | "HANDLER_EXECUTION_COMPLETED"
  | "HANDLER_EXECUTION_FAILED";

/**
 * Severity classification for operational truth
 */
export type TelemetrySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Telemetry classification for SOC visibility
 */
export type TelemetryClass =
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "AUTH_TAMPERED"
  | "AUTH_BACKEND_UNAVAILABLE"
  | "WORKSPACE_DENIED"
  | "WORKSPACE_NOT_FOUND"
  | "CAPABILITY_DENIED"
  | "RATE_LIMITED"
  | "REPLAY_DETECTED"
  | "CIRCUIT_OPEN"
  | "REQUEST_SHED"
  | "SYSTEM_DEGRADED"
  | "INFRA_UNAVAILABLE"
  | "PARTIAL_VERIFICATION"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

/**
 * Immutable telemetry event — operational truth record
 * Every field is deterministic, never route-specific
 */
export interface TelemetryEvent {
  // Event identity
  eventId: string;
  eventType: TelemetryEventType;
  timestamp: number; // Unix milliseconds
  correlationId: string;
  requestId: string;

  // Source classification
  sourceIp: string;
  route: string;
  method: string;

  // Actor/tenant (redacted for tenant existence)
  workspaceId?: string; // May be redacted; never expose existence
  actorId?: string; // User ID if authenticated; undefined otherwise
  actorType?: string; // "user" | "service" | undefined

  // Auth layer classification
  authLayer: "identity" | "tenant" | "capability" | "operational" | "infra" | "unknown";
  authState?: string; // The auth state evaluated (e.g., AUTH_MISSING, WORKSPACE_NOT_FOUND)

  // Telemetry classification
  telemetryClass: TelemetryClass;
  severity: TelemetrySeverity;

  // Response classification
  httpStatus: number;
  retryable: boolean;
  handlerAllowed: boolean;
  mutationAllowed: boolean;

  // Execution trace (complete audit trail)
  executionTrace?: Array<{
    stage: string;
    startedAt: number;
    completedAt: number;
    state: string;
    decision: string;
    terminated: boolean;
  }>;

  // Sampling metadata
  sampled: boolean;
  sampleRate: number;

  // Never included
  // - stack traces
  // - credentials
  // - secrets
  // - tenant enumeration hints
  // - raw error messages
}

/**
 * Security signal — attack detection aggregation
 */
export interface SecuritySignal {
  signal: string; // "credential_stuffing", "replay_attack", "workspace_enum", "capability_abuse"
  severity: TelemetrySeverity;
  count: number; // within window
  window: number; // milliseconds
  threshold: number; // alert threshold
  currentRate: number; // events per second
}

/**
 * Infrastructure signal — ops visibility
 */
export interface InfrastructureSignal {
  signal: string; // "auth_backend_down", "circuit_open", "request_shed", "system_degraded"
  severity: TelemetrySeverity;
  isActive: boolean;
  durationMs: number;
  affectedPath: string;
  upstreamService: string;
}

/**
 * Telemetry event validation schema
 * IMMUTABLE. NO ROUTE-SPECIFIC FIELDS.
 */
export function validateTelemetryEvent(event: unknown): event is TelemetryEvent {
  if (typeof event !== "object" || event === null) return false;

  const e = event as Record<string, unknown>;

  // Required fields
  if (typeof e.eventId !== "string") return false;
  if (typeof e.eventType !== "string") return false;
  if (typeof e.timestamp !== "number") return false;
  if (typeof e.correlationId !== "string") return false;
  if (typeof e.requestId !== "string") return false;
  if (typeof e.sourceIp !== "string") return false;
  if (typeof e.route !== "string") return false;
  if (typeof e.method !== "string") return false;
  if (typeof e.httpStatus !== "number") return false;
  if (typeof e.retryable !== "boolean") return false;
  if (typeof e.handlerAllowed !== "boolean") return false;
  if (typeof e.mutationAllowed !== "boolean") return false;

  // Deterministic values
  const validEventTypes = new Set<string>([
    "AUTH_FAILURE",
    "AUTH_SUCCESS",
    "WORKSPACE_DENIED",
    "CAPABILITY_DENIED",
    "RATE_LIMITED",
    "REPLAY_DETECTED",
    "CIRCUIT_OPEN",
    "REQUEST_SHED",
    "SYSTEM_DEGRADED",
    "INFRA_UNAVAILABLE",
    "PARTIAL_VERIFICATION",
    "HANDLER_EXECUTION_STARTED",
    "HANDLER_EXECUTION_COMPLETED",
    "HANDLER_EXECUTION_FAILED",
  ]);
  if (!validEventTypes.has(e.eventType as string)) return false;

  if (
    e.severity !== "LOW" &&
    e.severity !== "MEDIUM" &&
    e.severity !== "HIGH" &&
    e.severity !== "CRITICAL"
  ) {
    return false;
  }

  // Validate auth layer
  const validAuthLayers = new Set(["identity", "tenant", "capability", "operational", "infra", "unknown"]);
  if (!validAuthLayers.has(e.authLayer as string)) return false;

  // Validate telemetry class
  const validClasses = new Set<string>([
    "AUTH_INVALID",
    "AUTH_EXPIRED",
    "AUTH_REVOKED",
    "AUTH_TAMPERED",
    "AUTH_BACKEND_UNAVAILABLE",
    "WORKSPACE_DENIED",
    "WORKSPACE_NOT_FOUND",
    "CAPABILITY_DENIED",
    "RATE_LIMITED",
    "REPLAY_DETECTED",
    "CIRCUIT_OPEN",
    "REQUEST_SHED",
    "SYSTEM_DEGRADED",
    "INFRA_UNAVAILABLE",
    "PARTIAL_VERIFICATION",
    "VALIDATION_ERROR",
    "INTERNAL_ERROR",
  ]);
  if (!validClasses.has(e.telemetryClass as string)) return false;

  return true;
}

/**
 * Telemetry event serialization — deterministic JSON
 * No stack traces. No internal details.
 */
export function serializeTelemetryEvent(event: TelemetryEvent): string {
  const serialized = {
    eventId: event.eventId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    correlationId: event.correlationId,
    requestId: event.requestId,
    sourceIp: event.sourceIp,
    route: event.route,
    method: event.method,
    workspaceId: event.workspaceId,
    actorId: event.actorId,
    actorType: event.actorType,
    authLayer: event.authLayer,
    authState: event.authState,
    telemetryClass: event.telemetryClass,
    severity: event.severity,
    httpStatus: event.httpStatus,
    retryable: event.retryable,
    handlerAllowed: event.handlerAllowed,
    mutationAllowed: event.mutationAllowed,
    executionTrace: event.executionTrace,
    sampled: event.sampled,
    sampleRate: event.sampleRate,
  };

  return JSON.stringify(serialized);
}

/**
 * Create deterministic sampling decision
 * Same request = same decision (using request/correlation ID)
 */
export function shouldSampleEvent(correlationId: string, sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  // Deterministic sampling: hash of correlation ID
  const hash = correlationId
    .split("")
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  return Math.abs(hash % 100) < sampleRate * 100;
}
