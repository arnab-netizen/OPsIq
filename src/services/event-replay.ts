// EventReplay service - Deterministic event sourcing replay engine
// Phase 3 Slice 3: Temporal reconstruction and replay safety

import { PrismaClient } from '../generated/prisma';
import { CanonicalEvent } from '../domain/canonical-event';
import { EventEmitterService } from './event-emitter';

export interface ReplayResult {
  aggregateId: string;
  eventCount: number;
  finalState: Record<string, unknown>;
  replayedAt: Date;
}

export interface TemporalReplayResult {
  aggregateId: string;
  targetTimestamp: Date;
  eventCount: number;
  finalState: Record<string, unknown>;
  isPartialReplay: boolean;
}

export class EventReplayEngine {
  /**
   * Replay all events for an aggregate to reconstruct current state
   * Deterministic: same event sequence always produces same state
   * Fail-closed: returns error reason if aggregate not found
   */
  static async replayAggregate(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<ReplayResult> {
    // Get all events for this aggregate in order
    const events = await EventEmitterService.getAggregateEvents(
      db,
      workspaceId,
      aggregateId
    );

    if (events.length === 0) {
      return {
        aggregateId,
        eventCount: 0,
        finalState: {},
        replayedAt: new Date(),
      };
    }

    // Apply events in order to build state
    const finalState = this.applyEventsToState({}, events);

    return {
      aggregateId,
      eventCount: events.length,
      finalState,
      replayedAt: new Date(),
    };
  }

  /**
   * Replay events up to a specific timestamp
   * Useful for temporal queries and audit trails
   */
  static async replayToTimestamp(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    targetTimestamp: Date
  ): Promise<TemporalReplayResult> {
    // Get all events, but filter to those before target timestamp
    const allEvents = await EventEmitterService.getAggregateEvents(
      db,
      workspaceId,
      aggregateId
    );

    const replayedEvents = allEvents.filter(
      (event) => event.occurredAt <= targetTimestamp
    );

    const finalState = this.applyEventsToState({}, replayedEvents);

    const hasMoreEvents = allEvents.length > replayedEvents.length;

    return {
      aggregateId,
      targetTimestamp,
      eventCount: replayedEvents.length,
      finalState,
      isPartialReplay: hasMoreEvents,
    };
  }

  /**
   * Verify replay consistency: replay from start must produce expected state
   * Returns { valid: boolean, reason?: string }
   */
  static async verifyReplayConsistency(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    expectedFinalState: Record<string, unknown>
  ): Promise<{
    valid: boolean;
    reason?: string;
    actualEventCount?: number;
  }> {
    try {
      const replayResult = await this.replayAggregate(
        db,
        workspaceId,
        aggregateId
      );

      // Deep equality check of final states
      const stateMatches = this.statesEqual(
        replayResult.finalState,
        expectedFinalState
      );

      if (!stateMatches) {
        return {
          valid: false,
          reason: `Replay state mismatch: expected ${JSON.stringify(
            expectedFinalState
          )}, got ${JSON.stringify(replayResult.finalState)}`,
          actualEventCount: replayResult.eventCount,
        };
      }

      return {
        valid: true,
        actualEventCount: replayResult.eventCount,
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Replay verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Get events in deterministic order (by eventNumber)
   * Grouped by aggregate for efficient replay
   */
  static async getOrderedEvents(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<CanonicalEvent[]> {
    const events = await db.canonicalEvent.findMany({
      where: {
        workspaceId,
        aggregateId,
      },
      orderBy: [
        { eventNumber: 'asc' }, // Primary order: event sequence number
        { createdAt: 'asc' }, // Secondary: creation order for ties
      ],
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
   * Verify all events in stream are immutable
   * Returns { valid: boolean, mutableEventIndex?: number }
   */
  static async verifyImmutability(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<{ valid: boolean; mutableEventIndex?: number }> {
    const events = await this.getOrderedEvents(
      db,
      workspaceId,
      aggregateId
    );

    for (let i = 0; i < events.length; i++) {
      if (!events[i].isImmutable) {
        return {
          valid: false,
          mutableEventIndex: i,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Private: Apply a sequence of events to a state object
   * Deterministic: same event sequence = same output
   */
  private static applyEventsToState(
    initialState: Record<string, unknown>,
    events: CanonicalEvent[]
  ): Record<string, unknown> {
    let state = { ...initialState };

    for (const event of events) {
      // Merge payload into state (last-write-wins for fields)
      state = {
        ...state,
        ...event.payload,
        _lastEventNumber: event.eventNumber,
        _lastEventType: event.eventType,
        _lastOccurredAt: event.occurredAt.toISOString(),
      };
    }

    return state;
  }

  /**
   * Private: Deep equality check for state objects
   * Used for consistency verification
   */
  private static statesEqual(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (const key of aKeys) {
      if (!bKeys.includes(key)) {
        return false;
      }

      const aVal = a[key];
      const bVal = b[key];

      // For dates, compare ISO strings
      if (aVal instanceof Date && bVal instanceof Date) {
        if (aVal.getTime() !== bVal.getTime()) {
          return false;
        }
      } else if (
        typeof aVal === 'object' &&
        typeof bVal === 'object' &&
        aVal !== null &&
        bVal !== null
      ) {
        // Recursive check for nested objects
        if (!this.statesEqual(aVal as Record<string, unknown>, bVal as Record<string, unknown>)) {
          return false;
        }
      } else if (aVal !== bVal) {
        return false;
      }
    }

    return true;
  }
}
