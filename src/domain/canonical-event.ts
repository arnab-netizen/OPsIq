// Canonical append-only event model
// Phase 3 Slice 1: Event schema for deterministic temporal governance

import { z } from 'zod';

// Valid event types
export const VALID_EVENT_TYPES = [
  'recommendation_created',
  'recommendation_approved',
  'recommendation_rejected',
  'recommendation_accepted',
  'action_started',
  'action_completed',
  'action_verified',
  'evidence_submitted',
  'evidence_validated',
  'finding_discovered',
  'constraint_detected',
  'kpi_recorded',
  'adherence_signal_recorded',
  'business_model_updated',
  'engagement_created',
  'engagement_status_changed',
  'decision_made',
] as const;
export type DomainEventType = (typeof VALID_EVENT_TYPES)[number];

// Valid aggregate types
export const VALID_AGGREGATE_TYPES = [
  'recommendation',
  'action',
  'evidence',
  'finding',
  'engagement',
  'decision',
  'constraint',
  'kpi',
  'operator',
] as const;
export type EventAggregateType = (typeof VALID_AGGREGATE_TYPES)[number];

export const CanonicalEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(), // Tenant isolation
  eventType: z.string(), // Validated in service
  aggregateType: z.string(), // Validated in service
  aggregateId: z.string().uuid(), // ID of the entity this event describes
  idempotencyKey: z.string(), // Prevent duplicate event emission
  eventNumber: z.number().int().positive(), // Sequence number per aggregate
  payload: z.record(z.string(), z.any()),  // Event data
  metadata: z.object({
    actorId: z.union([z.string().uuid(), z.null()]).optional(),
    actorType: z.union([z.string(), z.null()]).optional(), // 'user', 'system', 'ai'
    correlationId: z.union([z.string(), z.null()]).optional(), // Trace across events
    causedBy: z.union([z.string().uuid(), z.null()]).optional(), // Parent event ID
  }),
  // Immutability enforcement
  isImmutable: z.boolean().default(true),
  occurredAt: z.date(), // When event actually happened (not system time)
  recordedAt: z.date(), // When event entered system
  version: z.number().int().positive().default(1),
  createdAt: z.date(),
  updatedAt: z.date(), // Should never change after creation, but schema allows it for Prisma
});

export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

export type EventMetadata = CanonicalEvent['metadata'];

export const EmitEventRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  eventType: z.string(), // Validated separately
  aggregateType: z.string(), // Validated separately
  aggregateId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(255),
  payload: z.record(z.string(), z.any()),
  metadata: z.object({
    actorId: z.union([z.string().uuid(), z.null()]).optional(),
    actorType: z.union([z.string(), z.null()]).optional(),
    correlationId: z.union([z.string(), z.null()]).optional(),
    causedBy: z.union([z.string().uuid(), z.null()]).optional(),
  }).optional(),
  occurredAt: z.date().optional(), // Defaults to now()
});

export type EmitEventRequest = z.infer<typeof EmitEventRequestSchema>;
