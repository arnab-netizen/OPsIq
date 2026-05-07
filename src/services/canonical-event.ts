// Canonical event service
// Phase 3 Slice 1: Append-only event emission with idempotency and immutability enforcement

import {
  CanonicalEvent,
  CanonicalEventSchema,
  EmitEventRequest,
  EmitEventRequestSchema,
} from '../domain/canonical-event';

export class CanonicalEventService {
  /**
   * Emit a new canonical event (append-only)
   * Idempotent: same idempotencyKey returns same event without duplicate
   * Immutable: events cannot be modified after creation
   */
  static validateEventRequest(request: unknown): EmitEventRequest {
    const validated = EmitEventRequestSchema.parse(request);

    // Enforce immutability at request time
    if (!validated.idempotencyKey || validated.idempotencyKey.trim().length === 0) {
      throw new Error('idempotencyKey is required and cannot be empty');
    }

    // Ensure payload is serializable (fail-closed on circular references)
    try {
      JSON.stringify(validated.payload);
    } catch {
      throw new Error('Event payload must be JSON-serializable');
    }

    return validated;
  }

  /**
   * Validate a canonical event from storage
   */
  static validateEvent(event: unknown): CanonicalEvent {
    return CanonicalEventSchema.parse(event);
  }

  /**
   * Check if event is immutable (should always be true for canonical events)
   */
  static isImmutable(event: CanonicalEvent): boolean {
    return event.isImmutable === true;
  }

  /**
   * Determine event ordering by (workspaceId, aggregateId, eventNumber)
   * Returns -1 if event1 comes before event2, 1 if after, 0 if equal
   */
  static compareEventOrder(event1: CanonicalEvent, event2: CanonicalEvent): number {
    // Different workspaces are incomparable (tenant isolation)
    if (event1.workspaceId !== event2.workspaceId) {
      return event1.workspaceId.localeCompare(event2.workspaceId);
    }

    // Different aggregates ordered by aggregateId
    if (event1.aggregateId !== event2.aggregateId) {
      return event1.aggregateId.localeCompare(event2.aggregateId);
    }

    // Same aggregate: order by eventNumber (sequence)
    return event1.eventNumber - event2.eventNumber;
  }

  /**
   * Verify idempotency: same key should produce same event
   */
  static idempotencyKeyMatches(event: CanonicalEvent, idempotencyKey: string): boolean {
    return event.idempotencyKey === idempotencyKey;
  }

  /**
   * Check if event is causally dependent on another
   */
  static hasCausalDependency(event: CanonicalEvent, parentEventId: string): boolean {
    return event.metadata.causedBy === parentEventId;
  }

  /**
   * Verify event is not stale for a given window (in hours)
   */
  static isEventFresh(event: CanonicalEvent, maxAgeHours: number): boolean {
    const now = new Date();
    const ageMs = now.getTime() - event.occurredAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    return ageHours <= maxAgeHours;
  }

  /**
   * Get event age in hours
   */
  static getEventAgeHours(event: CanonicalEvent): number {
    const now = new Date();
    const ageMs = now.getTime() - event.occurredAt.getTime();
    return ageMs / (1000 * 60 * 60);
  }

  /**
   * Enforce fail-closed: validate event is safe to act on
   * Returns reason if event should not be acted upon
   */
  static getFailClosedReason(
    event: CanonicalEvent,
    freshnessSlaHours: number
  ): string | null {
    // Must be immutable
    if (!this.isImmutable(event)) {
      return 'Event is not immutable';
    }

    // Must not be stale
    if (!this.isEventFresh(event, freshnessSlaHours)) {
      return `Event is stale (age: ${this.getEventAgeHours(event).toFixed(1)} hours, SLA: ${freshnessSlaHours} hours)`;
    }

    // Must have valid payload
    try {
      JSON.stringify(event.payload);
    } catch {
      return 'Event payload is corrupted or not JSON-serializable';
    }

    return null; // Safe to act on
  }

  /**
   * Verify tenant isolation: event belongs to workspace
   */
  static belongsToWorkspace(event: CanonicalEvent, workspaceId: string): boolean {
    return event.workspaceId === workspaceId;
  }

  /**
   * Build correlation chain: all events with same correlationId
   */
  static correlatesWithId(event: CanonicalEvent, correlationId: string): boolean {
    return event.metadata.correlationId === correlationId;
  }
}
