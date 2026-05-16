/**
 * STAGE 7 SLICE 1: Minimal Event + Audit Fabric
 *
 * Domain contracts for canonical event store and audit trail.
 * This is the NON-PERSISTENT foundation: schemas, validation, and interfaces only.
 * Database persistence comes in STAGE 7 Slice 2.
 *
 * Design principles:
 * 1. Append-only: Events are immutable once persisted
 * 2. Deterministic: Same event stream replays to identical state
 * 3. Auditable: All material operations create canonical events
 * 4. Tenant-scoped: Every event enforces workspaceId
 * 5. Fail-closed: Missing events = operation incomplete, never silently dropped
 */

import { z } from "zod";

// ============================================================================
// EVENT DOMAIN CONTRACTS
// ============================================================================

/**
 * Event type classification for all system events.
 * Used to route events to correct handlers and filter subscriptions.
 */
export enum EventType {
  // Evidence lifecycle
  EVIDENCE_CREATED = "evidence:created",
  EVIDENCE_UPDATED = "evidence:updated",
  EVIDENCE_VERIFIED = "evidence:verified",
  EVIDENCE_DISPUTED = "evidence:disputed",
  EVIDENCE_CONTRADICTED = "evidence:contradicted",

  // Finding lifecycle
  FINDING_CREATED = "finding:created",
  FINDING_STATUS_CHANGED = "finding:status_changed",
  FINDING_RESOLVED = "finding:resolved",
  FINDING_INVALIDATED = "finding:invalidated",
  FINDING_PARKED = "finding:parked",

  // Business condition
  BUSINESS_CONDITION_ASSESSED = "business_condition:assessed",
  FINANCIAL_HEALTH_CHANGED = "business_condition:financial_health_changed",
  OWNER_AVAILABILITY_CHANGED = "business_condition:owner_availability_changed",
  TEAM_CAPABILITY_CHANGED = "business_condition:team_capability_changed",
  CUSTOMER_HEALTH_CHANGED = "business_condition:customer_health_changed",

  // Recommendation lifecycle
  RECOMMENDATION_CREATED = "recommendation:created",
  RECOMMENDATION_ISSUED = "recommendation:issued",
  RECOMMENDATION_DECLINED = "recommendation:declined",
  RECOMMENDATION_COMPLETED = "recommendation:completed",
  RECOMMENDATION_FAILED = "recommendation:failed",

  // Action tracking
  ACTION_CREATED = "action:created",
  ACTION_STARTED = "action:started",
  ACTION_UPDATED = "action:updated",
  ACTION_COMPLETED = "action:completed",
  ACTION_FAILED = "action:failed",
  ACTION_CANCELLED = "action:cancelled",

  // Experiment
  EXPERIMENT_CREATED = "experiment:created",
  EXPERIMENT_STARTED = "experiment:started",
  EXPERIMENT_RESULT_RECORDED = "experiment:result_recorded",
  EXPERIMENT_ANALYZED = "experiment:analyzed",

  // System events
  USER_LOGGED_IN = "user:logged_in",
  USER_LOGGED_OUT = "user:logged_out",
  WORKSPACE_CREATED = "workspace:created",
  ENGAGEMENT_STARTED = "engagement:started",
  ENGAGEMENT_CONCLUDED = "engagement:concluded",
}

/**
 * Aggregate type for domain-driven design.
 * Identifies which aggregate root an event modifies.
 */
export enum AggregateType {
  EVIDENCE = "evidence",
  FINDING = "finding",
  BUSINESS_CONDITION = "business_condition",
  RECOMMENDATION = "recommendation",
  ACTION = "action",
  EXPERIMENT = "experiment",
  ENGAGEMENT = "engagement",
  WORKSPACE = "workspace",
}

/**
 * Raw event payload: unstructured, flexible, preserves all event data.
 * Allows schema evolution: new fields can be added without breaking old events.
 */
export const RawEventPayloadSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export type RawEventPayload = z.infer<typeof RawEventPayloadSchema>;

/**
 * Canonical event: the unit of truth in the system.
 * Every material operation results in exactly one canonical event.
 * Events are immutable and append-only.
 */
export const CanonicalEventSchema = z.object({
  id: z.string().uuid().describe("Unique event ID (UUID v4)"),
  eventNumber: z.number().int().min(1).describe("Monotonic sequence per aggregate"),
  aggregateId: z.string().uuid().describe("Which aggregate (evidence, finding, etc) changed"),
  aggregateType: z.nativeEnum(AggregateType).describe("Type of aggregate"),
  eventType: z.nativeEnum(EventType).describe("What happened"),
  workspaceId: z.string().uuid().describe("Tenant scope enforcement"),
  actorId: z.string().uuid().describe("Who caused the event (user/service)"),
  payload: RawEventPayloadSchema.describe("Event data (flexible, forward-compatible)"),
  causationId: z.string().uuid().optional().describe("Event that triggered this event"),
  correlationId: z.string().uuid().optional().describe("Trace across distributed calls"),
  idempotencyKey: z.string().optional().describe("Prevents duplicate event creation"),
  occurredAt: z.date().describe("When the change happened (from actor clock)"),
  recordedAt: z.date().describe("When we recorded it (from server clock)"),
  visibilityScope: z
    .enum(["public", "owner", "admin", "internal"])
    .default("internal")
    .describe("Who can see this event"),
  sensitivityClassification: z
    .enum(["public", "confidential", "restricted", "internal"])
    .default("internal")
    .describe("Data sensitivity level"),
  version: z.number().int().min(1).default(1).describe("Event schema version"),
});

export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

/**
 * Event request: input for creating a new event.
 * omits: id, eventNumber, recordedAt (assigned by event store)
 * Strict mode rejects unknown fields to catch client errors
 */
export const EventRequestSchema = CanonicalEventSchema.omit({
  id: true,
  eventNumber: true,
  recordedAt: true,
}).strict();

export type EventRequest = z.infer<typeof EventRequestSchema>;

/**
 * Event subscription: filter for event stream consumption.
 * Allows handlers to subscribe to specific event types or aggregates.
 */
export const EventSubscriptionSchema = z.object({
  subscriberId: z.string().uuid().describe("Handler/service ID"),
  workspaceId: z.string().uuid().describe("Tenant scope"),
  eventTypes: z.array(z.nativeEnum(EventType)).optional().describe("Filter by event type"),
  aggregateTypes: z.array(z.nativeEnum(AggregateType)).optional().describe("Filter by aggregate"),
  aggregateIds: z.array(z.string().uuid()).optional().describe("Filter by aggregate ID"),
  fromEventNumber: z.number().int().min(0).default(0).describe("Start from event number"),
  maxRetries: z.number().int().min(0).default(3).describe("Delivery retry limit"),
});

export type EventSubscription = z.infer<typeof EventSubscriptionSchema>;

// ============================================================================
// AUDIT TRAIL CONTRACTS
// ============================================================================

/**
 * Audit event: immutable record of a material operation with before/after state.
 * Used for compliance, debugging, and forensics.
 */
export const AuditEventSchema = z.object({
  id: z.string().uuid().describe("Unique audit ID"),
  workspaceId: z.string().uuid().describe("Tenant scope"),
  entityType: z.string().describe("What was modified (recommendation, action, etc)"),
  entityId: z.string().uuid().describe("Which entity"),
  actorId: z.string().uuid().describe("Who did it (user/service)"),
  actorRole: z.enum(["user", "service", "admin"]).describe("Role type of actor"),
  action: z.enum(["create", "read", "update", "delete", "export"]).describe("What operation"),
  status: z.enum(["success", "failure"]).describe("Did it work"),
  beforeSnapshot: z.record(z.string(), z.unknown()).optional().describe("State before change"),
  afterSnapshot: z.record(z.string(), z.unknown()).nullable().optional().describe("State after change"),
  changedFields: z.array(z.string()).optional().describe("Which fields changed"),
  reason: z.string().optional().describe("Why (user message)"),
  metadata: z.record(z.string(), z.unknown()).optional().describe("Extra context"),
  ipAddress: z.string().optional().describe("Source IP"),
  userAgent: z.string().optional().describe("Browser/client info"),
  occurredAt: z.date().describe("When"),
  recordedAt: z.date().describe("When recorded"),
  relatedEventId: z.string().uuid().optional().describe("Link to CanonicalEvent if applicable"),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * Audit trail query: filter for audit log searches.
 */
export const AuditTrailQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.enum(["create", "read", "update", "delete", "export"]).optional(),
  status: z.enum(["success", "failure"]).optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export type AuditTrailQuery = z.infer<typeof AuditTrailQuerySchema>;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a canonical event has all required fields.
 */
export function validateCanonicalEvent(event: CanonicalEvent): string[] {
  const errors: string[] = [];

  // Basic field validation
  if (!event.id || event.id.length === 0) {
    errors.push("Event ID is required");
  }

  if (event.eventNumber < 1) {
    errors.push("Event number must be >= 1");
  }

  if (!event.aggregateId || event.aggregateId.length === 0) {
    errors.push("Aggregate ID is required");
  }

  if (!event.workspaceId || event.workspaceId.length === 0) {
    errors.push("Workspace ID is required (tenant scoping)");
  }

  if (!event.actorId || event.actorId.length === 0) {
    errors.push("Actor ID is required (who caused change)");
  }

  // Timestamp validation
  if (!event.occurredAt) {
    errors.push("Occurred timestamp is required");
  }

  if (!event.recordedAt) {
    errors.push("Recorded timestamp is required");
  }

  if (event.occurredAt && event.recordedAt && event.occurredAt > event.recordedAt) {
    errors.push("Occurred time cannot be after recorded time");
  }

  // Correlation validation
  if (event.causationId && !event.correlationId) {
    errors.push("Correlation ID is required when causation ID is set");
  }

  // Payload validation
  if (!event.payload || Object.keys(event.payload).length === 0) {
    errors.push("Payload cannot be empty");
  }

  return errors;
}

/**
 * Validate an audit event has all required fields.
 */
export function validateAuditEvent(event: AuditEvent): string[] {
  const errors: string[] = [];

  if (!event.id) errors.push("Audit event ID is required");
  if (!event.workspaceId) errors.push("Workspace ID is required");
  if (!event.entityId) errors.push("Entity ID is required");
  if (!event.actorId) errors.push("Actor ID is required");
  if (!event.occurredAt) errors.push("Occurred timestamp is required");
  if (!event.recordedAt) errors.push("Recorded timestamp is required");

  if (event.occurredAt && event.recordedAt && event.occurredAt > event.recordedAt) {
    errors.push("Occurred time cannot be after recorded time");
  }

  // Before/after snapshots should be present for material changes
  if (event.action !== "read" && !event.beforeSnapshot && !event.afterSnapshot) {
    errors.push("Before or after snapshot is required for non-read operations");
  }

  return errors;
}

/**
 * Check if event is append-only safe.
 * Ensures event streams maintain monotonic event numbers.
 */
export function validateMonotonicEventNumber(
  previousEventNumber: number,
  newEventNumber: number
): string[] {
  const errors: string[] = [];

  if (newEventNumber !== previousEventNumber + 1) {
    errors.push(
      `Event number gap detected: expected ${previousEventNumber + 1}, got ${newEventNumber}`
    );
  }

  return errors;
}

/**
 * Validate idempotency key prevents duplicate events.
 */
export function validateIdempotencyKey(
  idempotencyKey: string | undefined,
  previousKeys: Set<string>
): string[] {
  const errors: string[] = [];

  if (idempotencyKey && previousKeys.has(idempotencyKey)) {
    errors.push("Idempotency key already processed (duplicate event prevention)");
  }

  return errors;
}
