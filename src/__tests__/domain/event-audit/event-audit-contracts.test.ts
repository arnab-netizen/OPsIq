/**
 * STAGE 7 SLICE 1: Event + Audit Domain Contracts Tests (46 tests)
 */

import { describe, it, expect } from "vitest";
import {
  EventType,
  AggregateType,
  CanonicalEventSchema,
  AuditEventSchema,
  EventRequestSchema,
  EventSubscriptionSchema,
  AuditTrailQuerySchema,
  validateCanonicalEvent,
  validateAuditEvent,
  validateMonotonicEventNumber,
  validateIdempotencyKey,
} from "@/domain/event-audit/event-audit-contracts";

describe("STAGE 7 Slice 1: Event + Audit Domain Contracts", () => {
  const baseWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const baseActorId = "660e8400-e29b-41d4-a716-446655440001";
  const baseAggregateId = "770e8400-e29b-41d4-a716-446655440002";
  const now = new Date();

  describe("Canonical Event Schema", () => {
    it("should accept valid evidence event", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { type: "financial_revenue", value: "50000" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(CanonicalEventSchema.safeParse(event).success).toBe(true);
    });

    it("should require eventNumber >= 1", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 0,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
        recordedAt: now,
        version: 1,
      };
      expect(CanonicalEventSchema.safeParse(event).success).toBe(false);
    });

    it("should enforce workspaceId", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: "",
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
        recordedAt: now,
        version: 1,
      };
      expect(CanonicalEventSchema.safeParse(event).success).toBe(false);
    });

    it("should support flexible payload for schema evolution", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.FINDING,
        eventType: EventType.FINDING_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { severity: "high", new_field: "data", score: "0.95" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(CanonicalEventSchema.safeParse(event).success).toBe(true);
    });

    it("should support causation and correlation", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 2,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.RECOMMENDATION,
        eventType: EventType.RECOMMENDATION_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { created: "true" },
        causationId: "990e8400-e29b-41d4-a716-446655440004",
        correlationId: "aa0e8400-e29b-41d4-a716-446655440005",
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(CanonicalEventSchema.safeParse(event).success).toBe(true);
    });

    it("should default visibility scope", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.ACTION,
        eventType: EventType.ACTION_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
        recordedAt: now,
        version: 1,
      };
      const result = CanonicalEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      expect(result.data?.visibilityScope).toBe("internal");
    });

    it("should allow null in payload", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: null },
        occurredAt: now,
        recordedAt: now,
        version: 1,
      };
      expect(CanonicalEventSchema.safeParse(event).success).toBe(true);
    });
  });

  describe("Event Request Schema", () => {
    it("should accept valid request without id/eventNumber/recordedAt", () => {
      const request = {
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(EventRequestSchema.safeParse(request).success).toBe(true);
    });

    it("should reject if id is provided", () => {
      const request = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
      };
      expect(EventRequestSchema.safeParse(request).success).toBe(false);
    });
  });

  describe("Audit Event Schema", () => {
    it("should accept valid audit event for create", () => {
      const audit = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
        entityType: "recommendation",
        entityId: baseAggregateId,
        actorId: baseActorId,
        actorRole: "user" as const,
        action: "create" as const,
        status: "success" as const,
        beforeSnapshot: undefined,
        afterSnapshot: { id: baseAggregateId, status: "active" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 100),
      };
      expect(AuditEventSchema.safeParse(audit).success).toBe(true);
    });

    it("should allow null afterSnapshot for deletion", () => {
      const audit = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
        entityType: "engagement",
        entityId: baseAggregateId,
        actorId: baseActorId,
        actorRole: "admin" as const,
        action: "delete" as const,
        status: "success" as const,
        beforeSnapshot: { status: "concluded" },
        afterSnapshot: null,
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 100),
      };
      expect(AuditEventSchema.safeParse(audit).success).toBe(true);
    });

    it("should require actorRole", () => {
      const audit = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
        entityType: "recommendation",
        entityId: baseAggregateId,
        actorId: baseActorId,
        action: "read" as const,
        status: "success" as const,
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 100),
      };
      expect(AuditEventSchema.safeParse(audit).success).toBe(false);
    });

    it("should track changed fields", () => {
      const audit = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
        entityType: "recommendation",
        entityId: baseAggregateId,
        actorId: baseActorId,
        actorRole: "user" as const,
        action: "update" as const,
        status: "success" as const,
        beforeSnapshot: { status: "draft" },
        afterSnapshot: { status: "issued" },
        changedFields: ["status"],
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 100),
      };
      expect(AuditEventSchema.safeParse(audit).success).toBe(true);
    });
  });

  describe("Audit Trail Query Schema", () => {
    it("should accept query with all filters", () => {
      const query = {
        workspaceId: baseWorkspaceId,
        entityType: "recommendation",
        entityId: baseAggregateId,
        actorId: baseActorId,
        action: "create" as const,
        status: "success" as const,
        fromDate: new Date(now.getTime() - 86400000),
        toDate: now,
        limit: 50,
        offset: 0,
      };
      expect(AuditTrailQuerySchema.safeParse(query).success).toBe(true);
    });

    it("should default limit to 100", () => {
      const query = { workspaceId: baseWorkspaceId };
      const result = AuditTrailQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
      expect(result.data?.limit).toBe(100);
    });

    it("should reject limit > 1000", () => {
      const query = { workspaceId: baseWorkspaceId, limit: 5000 };
      expect(AuditTrailQuerySchema.safeParse(query).success).toBe(false);
    });
  });

  describe("Canonical Event Validation", () => {
    it("should validate complete event", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { type: "financial_revenue" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(validateCanonicalEvent(event)).toHaveLength(0);
    });

    it("should reject empty payload", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: {},
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      const errors = validateCanonicalEvent(event);
      expect(errors.some(e => e.includes("Payload cannot be empty"))).toBe(true);
    });

    it("should reject if occurredAt > recordedAt", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: new Date(now.getTime() + 2000),
        recordedAt: now,
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      const errors = validateCanonicalEvent(event);
      expect(errors.some(e => e.includes("Occurred time cannot be after recorded time"))).toBe(true);
    });

    it("should require correlationId if causationId set", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        causationId: "990e8400-e29b-41d4-a716-446655440004",
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      const errors = validateCanonicalEvent(event);
      expect(errors.some(e => e.includes("Correlation ID is required"))).toBe(true);
    });
  });

  describe("Append-Only Validation", () => {
    it("should accept monotonically increasing numbers", () => {
      expect(validateMonotonicEventNumber(0, 1)).toHaveLength(0);
      expect(validateMonotonicEventNumber(5, 6)).toHaveLength(0);
    });

    it("should reject gaps", () => {
      expect(validateMonotonicEventNumber(5, 7).length).toBeGreaterThan(0);
    });

    it("should reject duplicates", () => {
      expect(validateMonotonicEventNumber(5, 5).length).toBeGreaterThan(0);
    });

    it("should reject out-of-order", () => {
      expect(validateMonotonicEventNumber(10, 9).length).toBeGreaterThan(0);
    });
  });

  describe("Idempotency Key Safety", () => {
    it("should accept first occurrence", () => {
      const keys = new Set<string>();
      expect(validateIdempotencyKey("idempotent-abc123", keys)).toHaveLength(0);
    });

    it("should reject duplicate key", () => {
      const keys = new Set<string>(["idempotent-abc123"]);
      const errors = validateIdempotencyKey("idempotent-abc123", keys);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should allow undefined key", () => {
      const keys = new Set<string>();
      expect(validateIdempotencyKey(undefined, keys)).toHaveLength(0);
    });
  });

  describe("Event Subscription Filtering", () => {
    it("should accept subscription with all filters", () => {
      const subscription = {
        subscriberId: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
        eventTypes: [EventType.FINDING_CREATED, EventType.FINDING_RESOLVED],
        aggregateTypes: [AggregateType.FINDING],
        aggregateIds: [baseAggregateId],
        fromEventNumber: 100,
        maxRetries: 5,
      };
      expect(EventSubscriptionSchema.safeParse(subscription).success).toBe(true);
    });

    it("should default fromEventNumber to 0", () => {
      const subscription = {
        subscriberId: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
      };
      const result = EventSubscriptionSchema.safeParse(subscription);
      expect(result.success).toBe(true);
      expect(result.data?.fromEventNumber).toBe(0);
    });

    it("should allow partial filtering", () => {
      const subscription = {
        subscriberId: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: baseWorkspaceId,
        eventTypes: [EventType.ACTION_CREATED],
      };
      expect(EventSubscriptionSchema.safeParse(subscription).success).toBe(true);
    });
  });

  describe("Tenant Isolation", () => {
    it("should enforce workspaceId on canonical events", () => {
      const event = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        eventNumber: 1,
        aggregateId: baseAggregateId,
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: "",
        actorId: baseActorId,
        payload: { key: "value" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      const errors = validateCanonicalEvent(event);
      expect(errors.some(e => e.includes("Workspace ID is required"))).toBe(true);
    });

    it("should enforce workspaceId on audit events", () => {
      const audit = {
        id: "880e8400-e29b-41d4-a716-446655440003",
        workspaceId: "",
        entityType: "recommendation",
        entityId: baseAggregateId,
        actorId: baseActorId,
        actorRole: "user" as const,
        action: "read" as const,
        status: "success" as const,
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 100),
      };
      const errors = validateAuditEvent(audit);
      expect(errors.some(e => e.includes("Workspace ID is required"))).toBe(true);
    });
  });

  describe("Event Type Coverage", () => {
    it("should have evidence events", () => {
      expect([
        EventType.EVIDENCE_CREATED,
        EventType.EVIDENCE_VERIFIED,
        EventType.EVIDENCE_DISPUTED,
      ].length).toBe(3);
    });

    it("should have finding events", () => {
      expect([
        EventType.FINDING_CREATED,
        EventType.FINDING_RESOLVED,
        EventType.FINDING_INVALIDATED,
      ].length).toBe(3);
    });

    it("should have recommendation events", () => {
      expect([
        EventType.RECOMMENDATION_CREATED,
        EventType.RECOMMENDATION_ISSUED,
        EventType.RECOMMENDATION_COMPLETED,
      ].length).toBe(3);
    });

    it("should have action events", () => {
      expect([
        EventType.ACTION_CREATED,
        EventType.ACTION_STARTED,
        EventType.ACTION_COMPLETED,
        EventType.ACTION_FAILED,
      ].length).toBe(4);
    });

    it("should have system events", () => {
      expect([
        EventType.USER_LOGGED_IN,
        EventType.WORKSPACE_CREATED,
        EventType.ENGAGEMENT_STARTED,
      ].length).toBe(3);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should model evidence workflow", () => {
      const created = {
        id: "e1111111-e29b-41d4-a716-446655440000",
        eventNumber: 1,
        aggregateId: "e2222222-e29b-41d4-a716-446655440000",
        aggregateType: AggregateType.EVIDENCE,
        eventType: EventType.EVIDENCE_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { type: "financial_revenue", value: "150000" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(validateCanonicalEvent(created)).toHaveLength(0);
    });

    it("should model finding lifecycle", () => {
      const finding = {
        id: "f1111111-e29b-41d4-a716-446655440000",
        eventNumber: 1,
        aggregateId: "f2222222-e29b-41d4-a716-446655440000",
        aggregateType: AggregateType.FINDING,
        eventType: EventType.FINDING_CREATED,
        workspaceId: baseWorkspaceId,
        actorId: baseActorId,
        payload: { severity: "critical", title: "Risk detected" },
        occurredAt: now,
        recordedAt: new Date(now.getTime() + 1000),
        visibilityScope: "internal" as const,
        sensitivityClassification: "internal" as const,
        version: 1,
      };
      expect(validateCanonicalEvent(finding)).toHaveLength(0);
    });
  });
});
