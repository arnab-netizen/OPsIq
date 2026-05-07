import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { v4 as uuidv4 } from "uuid";

export interface EmitEventRequest {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, any>;
  actorId: string;
  workspaceId: string;
  causationId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  visibilityScope?: string;
  sensitivityClassification?: string;
}

export interface EmittedEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  eventNumber: number;
  payload: Record<string, any>;
  actorId: string;
  workspaceId: string;
  causationId: string;
  correlationId: string;
  idempotencyKey?: string;
  visibilityScope: string;
  sensitivityClassification: string;
  occurredAt: Date;
  recordedAt: Date;
}

export class EventEmitterService {
  /**
   * Emit an event to the canonical event store
   * Enforces idempotency via idempotencyKey
   * Returns the emitted event or existing event if idempotent replay
   */
  static async emit(request: EmitEventRequest): Promise<EmittedEvent> {
    // Validate workspace is not empty
    if (!request.workspaceId) {
      throw new Error("workspaceId is required");
    }

    // Validate aggregate type is known
    const validAggregateTypes = [
      "recommendation",
      "decision",
      "action",
      "evidence",
      "outcome",
      "experiment",
      "engagement",
      "business_profile",
    ];
    if (!validAggregateTypes.includes(request.aggregateType)) {
      throw new Error(`Invalid aggregate type: ${request.aggregateType}`);
    }

    const causationId = request.causationId || uuidv4();
    const correlationId = request.correlationId || uuidv4();

    // Check for idempotent replay
    if (request.idempotencyKey) {
      const existing = await db.canonicalEvent.findFirst({
        where: {
          idempotencyKey: request.idempotencyKey,
          workspaceId: request.workspaceId,
        },
      });

      if (existing) {
        logger.info("EventEmitterService: Idempotent replay detected", {
          idempotencyKey: request.idempotencyKey,
          eventId: existing.id,
          aggregateId: existing.aggregateId,
        });

        return {
          id: existing.id,
          aggregateId: existing.aggregateId,
          aggregateType: existing.aggregateType,
          eventType: existing.eventType,
          eventVersion: existing.eventVersion,
          eventNumber: existing.eventNumber,
          payload: existing.payload as Record<string, any>,
          actorId: existing.actorId,
          workspaceId: existing.workspaceId,
          causationId: existing.causationId,
          correlationId: existing.correlationId,
          idempotencyKey: existing.idempotencyKey || undefined,
          visibilityScope: existing.visibilityScope,
          sensitivityClassification: existing.sensitivityClassification,
          occurredAt: existing.occurredAt,
          recordedAt: existing.recordedAt,
        };
      }
    }

    // Get next event number for this aggregate
    const lastEvent = await db.canonicalEvent.findFirst({
      where: {
        aggregateId: request.aggregateId,
        aggregateType: request.aggregateType,
        workspaceId: request.workspaceId,
      },
      orderBy: { eventNumber: "desc" },
      select: { eventNumber: true },
    });

    const nextEventNumber = (lastEvent?.eventNumber ?? 0) + 1;

    // Create the event
    const event = await db.canonicalEvent.create({
      data: {
        aggregateId: request.aggregateId,
        aggregateType: request.aggregateType,
        eventType: request.eventType,
        eventVersion: request.eventVersion,
        eventNumber: nextEventNumber,
        payload: request.payload,
        actorId: request.actorId,
        workspaceId: request.workspaceId,
        causationId,
        correlationId,
        idempotencyKey: request.idempotencyKey,
        visibilityScope: request.visibilityScope || "internal",
        sensitivityClassification: request.sensitivityClassification || "standard",
        occurredAt: new Date(),
        recordedAt: new Date(),
      },
    });

    logger.info("EventEmitterService: Event emitted", {
      eventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      eventNumber: event.eventNumber,
      workspaceId: event.workspaceId,
    });

    return {
      id: event.id,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      eventNumber: event.eventNumber,
      payload: event.payload as Record<string, any>,
      actorId: event.actorId,
      workspaceId: event.workspaceId,
      causationId: event.causationId,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey || undefined,
      visibilityScope: event.visibilityScope,
      sensitivityClassification: event.sensitivityClassification,
      occurredAt: event.occurredAt,
      recordedAt: event.recordedAt,
    };
  }

  /**
   * Retrieve all events for an aggregate in order
   */
  static async getAggregateEvents(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string
  ): Promise<EmittedEvent[]> {
    const events = await db.canonicalEvent.findMany({
      where: {
        aggregateId,
        aggregateType,
        workspaceId,
      },
      orderBy: { eventNumber: "asc" },
    });

    return events.map((e) => ({
      id: e.id,
      aggregateId: e.aggregateId,
      aggregateType: e.aggregateType,
      eventType: e.eventType,
      eventVersion: e.eventVersion,
      eventNumber: e.eventNumber,
      payload: e.payload as Record<string, any>,
      actorId: e.actorId,
      workspaceId: e.workspaceId,
      causationId: e.causationId,
      correlationId: e.correlationId,
      idempotencyKey: e.idempotencyKey || undefined,
      visibilityScope: e.visibilityScope,
      sensitivityClassification: e.sensitivityClassification,
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,
    }));
  }
}
