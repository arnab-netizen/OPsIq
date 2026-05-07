import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

export interface ReplayedAggregate {
  aggregateId: string;
  aggregateType: string;
  version: number;
  eventCount: number;
  state: Record<string, unknown>;
  lastEventNumber: number;
  lastEventTimestamp: Date;
}

export class EventReplayEngine {
  /**
   * Replay events for an aggregate to reconstruct its state
   * Returns the full aggregate state as of a specific event number
   */
  static async replayAggregate(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    upToEventNumber?: number
  ): Promise<ReplayedAggregate> {
    // Fetch all events in order
    const query = {
      where: {
        aggregateId,
        aggregateType,
        workspaceId,
        ...(upToEventNumber && { eventNumber: { lte: upToEventNumber } }),
      },
      orderBy: { eventNumber: "asc" as const },
    };

    const events = await db.canonicalEvent.findMany(query);

    if (events.length === 0) {
      throw new Error(`No events found for aggregate ${aggregateId}/${aggregateType}`);
    }

    // Fold events to rebuild state
    const state: Record<string, unknown> = {
      aggregateId,
      aggregateType,
      createdAt: events[0].occurredAt,
      events: [],
    };

    for (const event of events) {
      // Apply event to state
      EventReplayEngine.applyEvent(state, event);
    }

    const lastEvent = events[events.length - 1];

    logger.info("EventReplayEngine: Aggregate replayed", {
      aggregateId,
      aggregateType,
      eventCount: events.length,
      lastEventNumber: lastEvent.eventNumber,
    });

    return {
      aggregateId,
      aggregateType,
      version: events.length,
      eventCount: events.length,
      state,
      lastEventNumber: lastEvent.eventNumber,
      lastEventTimestamp: lastEvent.recordedAt,
    };
  }

  /**
   * Apply an event to aggregate state
   * Implements event sourcing fold logic
   */
  private static applyEvent(
    state: Record<string, unknown>,
    event: {
      eventType: string;
      payload: Record<string, unknown>;
      eventNumber: number;
      occurredAt: Date;
    }
  ) {
    // Store event in history
    const events = (state.events || []) as Array<Record<string, unknown>>;
    events.push({
      eventType: event.eventType,
      eventNumber: event.eventNumber,
      occurredAt: event.occurredAt,
      payload: event.payload,
    });
    state.events = events;

    // Apply event-specific transformations
    switch (event.eventType) {
      case "recommendation.created": {
        state.recommendationId = event.payload.engagementId;
        state.priority = event.payload.priority;
        state.title = event.payload.title;
        state.status = "active";
        state.evidenceReliability = event.payload.reliabilityLevel;
        state.kpiHealth = event.payload.kpiRiskLevel;
        break;
      }
      case "action.completed": {
        state.actionStatus = "completed";
        state.completedAt = event.occurredAt;
        break;
      }
      case "evidence.validated": {
        state.evidenceStatus = "validated";
        state.validatedAt = event.occurredAt;
        break;
      }
      default: {
        // Generic event application
        Object.assign(state, event.payload);
      }
    }
  }

  /**
   * Get aggregate version as of a specific timestamp
   */
  static async replayAggregateAsOf(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    asOf: Date
  ): Promise<ReplayedAggregate> {
    const event = await db.canonicalEvent.findFirst({
      where: {
        aggregateId,
        aggregateType,
        workspaceId,
        occurredAt: { lte: asOf },
      },
      orderBy: { eventNumber: "desc" },
      select: { eventNumber: true },
    });

    if (!event) {
      throw new Error(
        `No events found for aggregate ${aggregateId}/${aggregateType} before ${asOf.toISOString()}`
      );
    }

    return EventReplayEngine.replayAggregate(
      aggregateId,
      aggregateType,
      workspaceId,
      event.eventNumber
    );
  }
}
