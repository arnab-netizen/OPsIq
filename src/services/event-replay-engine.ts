import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { SnapshotOptimizationEngine } from "@/services/snapshot-optimization-engine";

export interface ReplayedAggregate {
  aggregateId: string;
  aggregateType: string;
  version: number;
  eventCount: number;
  state: Record<string, unknown>;
  lastEventNumber: number;
  lastEventTimestamp: Date;
  usedSnapshot: boolean;
}

export interface ReplayValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class EventReplayEngine {
  /**
   * Replay events for an aggregate to reconstruct its state
   * Uses snapshots for optimization when available
   * Returns the full aggregate state as of a specific event number
   */
  static async replayAggregate(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    upToEventNumber?: number
  ): Promise<ReplayedAggregate> {
    let usedSnapshot = false;
    let startEventNumber = 0;
    let initialState: Record<string, unknown> = {
      aggregateId,
      aggregateType,
      events: [],
    };

    // Phase 1: Try to use snapshot for optimization
    const validSnapshot = await SnapshotOptimizationEngine.getValidSnapshot(
      aggregateId,
      aggregateType,
      workspaceId
    );

    if (validSnapshot) {
      usedSnapshot = true;
      startEventNumber = validSnapshot.lastEventNumber + 1;
      initialState = {
        ...validSnapshot.state,
        events: (validSnapshot.state.events as Array<unknown>) || [],
      };

      logger.info("EventReplayEngine: Using snapshot for optimization", {
        aggregateId,
        startEventNumber,
      });
    }

    // Phase 2: Fetch remaining events (or all if no snapshot)
    const query = {
      where: {
        aggregateId,
        aggregateType,
        workspaceId,
        eventNumber: startEventNumber > 0 ? { gt: startEventNumber } : undefined,
        ...(upToEventNumber && { eventNumber: { lte: upToEventNumber } }),
      },
      orderBy: { eventNumber: "asc" as const },
    };

    const events = await db.canonicalEvent.findMany(query);

    if (events.length === 0 && !usedSnapshot) {
      throw new Error(
        `No events found for aggregate ${aggregateId}/${aggregateType}`
      );
    }

    // Phase 3: Fold events to rebuild state
    const state = initialState;

    for (const event of events) {
      // Validate event integrity
      const validationResult = EventReplayEngine.validateEvent(event);
      if (!validationResult.valid) {
        logger.error("EventReplayEngine: Event validation failed", {
          aggregateId,
          eventNumber: event.eventNumber,
          errors: validationResult.errors,
        });
        throw new Error(
          `Event corruption detected at event ${event.eventNumber}: ${validationResult.errors.join(
            "; "
          )}`
        );
      }

      // Apply event to state
      EventReplayEngine.applyEvent(state, event);
    }

    const lastEvent = events.length > 0 ? events[events.length - 1] : undefined;
    const firstEvent = usedSnapshot
      ? (state.createdAt as Date)
      : events[0]?.occurredAt || new Date();

    logger.info("EventReplayEngine: Aggregate replayed", {
      aggregateId,
      aggregateType,
      eventCount: events.length,
      usedSnapshot,
      lastEventNumber: lastEvent?.eventNumber,
    });

    const result: ReplayedAggregate = {
      aggregateId,
      aggregateType,
      version: events.length + (usedSnapshot ? startEventNumber : 0),
      eventCount: events.length,
      state,
      lastEventNumber: lastEvent?.eventNumber || startEventNumber,
      lastEventTimestamp: lastEvent?.recordedAt || new Date(),
      usedSnapshot,
    };

    // Step 4: Create/update snapshot for optimization if replay yielded new events
    if (events.length > 0 && lastEvent) {
      try {
        // Create snapshot without events array (only derived state)
        const snapshotState = { ...state };
        delete snapshotState.events;

        await SnapshotOptimizationEngine.createSnapshot(
          aggregateId,
          aggregateType,
          snapshotState,
          lastEvent.eventNumber,
          workspaceId
        );

        logger.info("EventReplayEngine: Snapshot created after replay", {
          aggregateId,
          lastEventNumber: lastEvent.eventNumber,
        });
      } catch (snapshotErr) {
        logger.warn("EventReplayEngine: Failed to create snapshot", {
          aggregateId,
          error: snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr),
        });
        // Do not fail replay if snapshot creation fails - logging only
      }
    }

    return result;
  }

  /**
   * Validate event has not been corrupted
   */
  private static validateEvent(event: {
    id: string;
    aggregateId: string;
    eventType: string;
    eventNumber: number;
    payload: Record<string, unknown>;
  }): ReplayValidationResult {
    const errors: string[] = [];

    // Check required fields
    if (!event.id) errors.push("Event missing id");
    if (!event.aggregateId) errors.push("Event missing aggregateId");
    if (!event.eventType) errors.push("Event missing eventType");
    if (event.eventNumber < 1) errors.push("Event eventNumber must be > 0");

    // Check payload is valid
    if (!event.payload || typeof event.payload !== "object") {
      errors.push("Event payload missing or invalid");
    }

    // Check required fields by event type
    if (event.eventType === "recommendation.created") {
      if (!event.payload?.title) errors.push("recommendation.created missing title");
      if (!event.payload?.priority) errors.push("recommendation.created missing priority");
      if (!event.payload?.engagementId) errors.push("recommendation.created missing engagementId");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: [],
    };
  }

  /**
   * Verify replay result matches expectations
   * Used to detect replay corruption
   */
  static async validateReplayResult(
    replayed: ReplayedAggregate,
    expectedAggregateId: string,
    expectedAggregateType: string
  ): Promise<ReplayValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check aggregate identifiers
    if (replayed.aggregateId !== expectedAggregateId) {
      errors.push(
        `Aggregate ID mismatch: ${replayed.aggregateId} vs ${expectedAggregateId}`
      );
    }
    if (replayed.aggregateType !== expectedAggregateType) {
      errors.push(
        `Aggregate type mismatch: ${replayed.aggregateType} vs ${expectedAggregateType}`
      );
    }

    // Check state completeness
    if (!replayed.state || typeof replayed.state !== "object") {
      errors.push("Replayed state is invalid");
    }

    // Check version consistency
    if (replayed.version < 1) {
      errors.push("Replayed version must be > 0");
    }

    // Check event count
    if (replayed.eventCount < 0) {
      errors.push("Event count cannot be negative");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
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
        const convertScoreToInt = (val: unknown): number | undefined => {
          if (!val) return undefined;
          const num = typeof val === "string" ? parseFloat(val) : (val as number);
          return Number.isNaN(num) ? undefined : Math.round(num * 100);
        };

        state.engagementId = event.payload.engagementId;
        state.priority = event.payload.priority;
        state.title = event.payload.title;
        state.description = event.payload.description;
        state.status = "active";
        state.evidenceValidationScore = convertScoreToInt(event.payload.evidenceValidationScore);
        state.reliabilityLevel = event.payload.reliabilityLevel;
        state.kpiHealthScore = convertScoreToInt(event.payload.kpiHealthScore);
        state.kpiRiskLevel = event.payload.kpiRiskLevel;
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
