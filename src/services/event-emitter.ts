// EventEmitter service - Append-only event emission
// Phase 3 Slice 2: Runtime wiring for deterministic event recording

import { PrismaClient } from '../generated/prisma';
import {
  CanonicalEvent,
  EmitEventRequest,
  VALID_EVENT_TYPES,
  VALID_AGGREGATE_TYPES,
  DomainEventType,
  EventAggregateType,
} from '../domain/canonical-event';
import { CanonicalEventService } from './canonical-event';

export interface EventEmitterResult {
  success: boolean;
  eventId?: string;
  eventNumber?: number;
  reason?: string; // If failed
}

export class EventEmitterService {
  /**
   * Emit a canonical event (append-only, idempotent)
   * Returns success/failure with event ID and sequence number
   * Fail-closed: returns error reason if preconditions not met
   */
  static async emit(
    db: PrismaClient,
    request: EmitEventRequest
  ): Promise<EventEmitterResult> {
    // Step 1: Validate request
    try {
      CanonicalEventService.validateEventRequest(request);
    } catch (error) {
      return {
        success: false,
        reason: `Invalid event request: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Step 2: Validate event types
    if (!VALID_EVENT_TYPES.includes(request.eventType as DomainEventType)) {
      return {
        success: false,
        reason: `Invalid event type: ${request.eventType}. Valid types: ${VALID_EVENT_TYPES.join(', ')}`,
      };
    }

    if (!VALID_AGGREGATE_TYPES.includes(request.aggregateType as EventAggregateType)) {
      return {
        success: false,
        reason: `Invalid aggregate type: ${request.aggregateType}. Valid types: ${VALID_AGGREGATE_TYPES.join(', ')}`,
      };
    }

    // Step 3: Check idempotency (prevent duplicate emission)
    const existingEvent = await db.canonicalEvent.findFirst({
      where: {
        workspaceId: request.workspaceId,
        idempotencyKey: request.idempotencyKey,
      },
    });

    if (existingEvent) {
      // Event already emitted with this idempotency key
      return {
        success: true,
        eventId: existingEvent.id,
        eventNumber: existingEvent.eventNumber,
        reason: 'Event already emitted (idempotency key match)',
      };
    }

    // Step 4: Calculate next event number for this aggregate
    const lastEvent = await db.canonicalEvent.findFirst({
      where: {
        workspaceId: request.workspaceId,
        aggregateId: request.aggregateId,
      },
      orderBy: {
        eventNumber: 'desc',
      },
    });

    const nextEventNumber = (lastEvent?.eventNumber || 0) + 1;

    // Step 5: Create the event
    try {
      const event = await db.canonicalEvent.create({
        data: {
          workspaceId: request.workspaceId,
          eventType: request.eventType,
          aggregateType: request.aggregateType,
          aggregateId: request.aggregateId,
          idempotencyKey: request.idempotencyKey,
          eventNumber: nextEventNumber,
          payload: request.payload,
          actorId: request.metadata?.actorId || null,
          actorType: request.metadata?.actorType || null,
          correlationId: request.metadata?.correlationId || null,
          causedBy: request.metadata?.causedBy || null,
          isImmutable: true,
          occurredAt: request.occurredAt || new Date(),
          recordedAt: new Date(),
        },
      });

      return {
        success: true,
        eventId: event.id,
        eventNumber: event.eventNumber,
      };
    } catch (error) {
      return {
        success: false,
        reason: `Failed to create event: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get event count for an aggregate (for ordering verification)
   */
  static async getEventCount(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<number> {
    const count = await db.canonicalEvent.count({
      where: {
        workspaceId,
        aggregateId,
      },
    });
    return count;
  }

  /**
   * Get all events for an aggregate in order
   */
  static async getAggregateEvents(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<CanonicalEvent[]> {
    const events = await db.canonicalEvent.findMany({
      where: {
        workspaceId,
        aggregateId,
      },
      orderBy: {
        eventNumber: 'asc',
      },
    });

    return events.map((e) => ({
      ...e,
      payload: e.payload as Record<string, unknown>,
      metadata: {
        actorId: e.actorId,
        actorType: e.actorType,
        correlationId: e.correlationId,
        causedBy: e.causedBy,
      },
    }));
  }

  /**
   * Get events by type for a workspace
   */
  static async getEventsByType(
    db: PrismaClient,
    workspaceId: string,
    eventType: string
  ): Promise<CanonicalEvent[]> {
    const events = await db.canonicalEvent.findMany({
      where: {
        workspaceId,
        eventType,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });

    return events.map((e) => ({
      ...e,
      payload: e.payload as Record<string, unknown>,
      metadata: {
        actorId: e.actorId,
        actorType: e.actorType,
        correlationId: e.correlationId,
        causedBy: e.causedBy,
      },
    }));
  }

  /**
   * Verify event ordering for a correlation chain
   */
  static async verifyCorrelationChain(
    db: PrismaClient,
    workspaceId: string,
    correlationId: string
  ): Promise<{
    valid: boolean;
    eventCount: number;
    reason?: string;
  }> {
    const events = await db.canonicalEvent.findMany({
      where: {
        workspaceId,
        correlationId,
      },
      orderBy: {
        occurredAt: 'asc',
      },
    });

    if (events.length === 0) {
      return {
        valid: true,
        eventCount: 0,
        reason: 'No events found for correlation chain',
      };
    }

    // Verify all events in chain are immutable
    const allImmutable = events.every((e) => e.isImmutable);
    if (!allImmutable) {
      return {
        valid: false,
        eventCount: events.length,
        reason: 'Correlation chain contains mutable events',
      };
    }

    // Verify ordering is preserved (occurredAt monotonically increasing)
    for (let i = 1; i < events.length; i++) {
      if (events[i].occurredAt < events[i - 1].occurredAt) {
        return {
          valid: false,
          eventCount: events.length,
          reason: `Event ordering violated at index ${i}`,
        };
      }
    }

    return {
      valid: true,
      eventCount: events.length,
    };
  }
}
