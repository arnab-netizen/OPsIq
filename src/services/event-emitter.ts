import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { v4 as uuidv4 } from "uuid";
import { ProjectionEngine } from "@/services/projection-engine";

export type EventPayload = Record<string, string | undefined>;

export interface EmitEventRequest {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventVersion: number;
  payload: EventPayload;
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
  payload: EventPayload;
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

function isEventPayload(data: unknown): data is EventPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  for (const value of Object.values(data)) {
    if (value !== undefined && typeof value !== "string") {
      return false;
    }
  }
  return true;
}

export class EventEmitterService {
  /**
   * Emit an event to the canonical event store with atomic serialization
   * CRITICAL: Uses transaction with Serializable isolation to prevent concurrent
   * eventNumber allocation race conditions
   *
   * Guarantees:
   * - Monotonic eventNumber per aggregate (no gaps, no duplicates)
   * - Deterministic replay order
   * - Idempotency via idempotencyKey
   * - Append-only invariant maintained
   * - Workspace isolation enforced
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

        const payloadData = existing.payload as unknown;
        if (!isEventPayload(payloadData)) {
          throw new Error("Invalid payload structure in idempotent event");
        }

        return {
          id: existing.id,
          aggregateId: existing.aggregateId,
          aggregateType: existing.aggregateType,
          eventType: existing.eventType,
          eventVersion: existing.eventVersion,
          eventNumber: existing.eventNumber,
          payload: payloadData,
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

    // ATOMIC SERIALIZED EVENT NUMBER ALLOCATION
    // Uses transaction with Serializable isolation level to ensure:
    // - No two concurrent requests calculate the same eventNumber
    // - No gaps in event sequence
    // - Deterministic ordering preserved
    const event = await db.$transaction(
      async (tx) => {
        // Step 1: Acquire aggregate lock (serial point)
        // This ensures only one transaction at a time can allocate eventNumbers for this aggregate
        await tx.$executeRaw`
          INSERT INTO aggregate_locks (aggregate_id, aggregate_type, workspace_id, version)
          VALUES (${request.aggregateId}, ${request.aggregateType}, ${request.workspaceId}, 0)
          ON CONFLICT (aggregate_id, aggregate_type, workspace_id)
          DO UPDATE SET version = aggregate_locks.version + 1
        `;

        // Step 2: Within locked transaction, find the last event number
        // No other transaction can modify this aggregate's events until we commit
        const lastEvent = await tx.canonicalEvent.findFirst({
          where: {
            aggregateId: request.aggregateId,
            aggregateType: request.aggregateType,
            workspaceId: request.workspaceId,
          },
          orderBy: { eventNumber: "desc" },
          select: { eventNumber: true },
        });

        const nextEventNumber = (lastEvent?.eventNumber ?? 0) + 1;

        // Step 3: Create event with guaranteed unique eventNumber
        const newEvent = await tx.canonicalEvent.create({
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

        logger.info("EventEmitterService: Event emitted (atomic serialized)", {
          eventId: newEvent.id,
          eventNumber: nextEventNumber,
          aggregateId: request.aggregateId,
          workspaceId: request.workspaceId,
        });

        return newEvent;
      },
      {
        isolationLevel: "Serializable",
        timeout: 10000, // 10 second timeout for deadlock/contention
        maxWait: 5000,  // Max 5 seconds waiting for transaction slot
      }
    );

    const payloadData = event.payload as unknown;
    if (!isEventPayload(payloadData)) {
      throw new Error("Invalid payload structure in emitted event");
    }

    // Trigger projection (non-blocking)
    try {
      await ProjectionEngine.projectEvent(
        event.id,
        event.eventType,
        event.aggregateId,
        event.aggregateType,
        event.payload as Record<string, unknown>,
        event.workspaceId
      );
    } catch (error) {
      logger.warn("EventEmitterService: Projection failed (non-blocking)", {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      id: event.id,
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      eventNumber: event.eventNumber,
      payload: payloadData,
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
}
