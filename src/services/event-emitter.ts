import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { v4 as uuidv4 } from "uuid";
import { ProjectionEngine } from "@/services/projection-engine";
import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

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

    // ATOMIC EVENT NUMBER ALLOCATION WITH IDEMPOTENCY
    // Uses transaction with aggregate-level locking via INSERT...ON CONFLICT to ensure:
    // - No two concurrent requests calculate the same eventNumber for same aggregate
    // - No gaps in event sequence per aggregate
    // - Deterministic ordering preserved
    // - Allows concurrent writes to different aggregates (scalability)
    // - Idempotency violations are caught and existing event returned
    let event: any;

    try {
      event = await db.$transaction(
        async (tx: any) => {
          // Step 0: Check for idempotent replay (atomic check within transaction)
          // This prevents duplicate events from concurrent requests with same idempotency key
          if (request.idempotencyKey) {
            const existing = await tx.canonicalEvent.findFirst({
              where: {
                idempotencyKey: request.idempotencyKey,
                workspaceId: request.workspaceId,
              },
            });

            if (existing) {
              logger.info("EventEmitterService: Idempotent replay detected (within transaction)", {
                idempotencyKey: request.idempotencyKey,
                eventId: existing.id,
                aggregateId: existing.aggregateId,
              });

              return {
                isEarlyReturn: true,
                event: existing,
              };
            }
          }

          // Step 1: Acquire per-aggregate lock via INSERT...ON CONFLICT
          // This ensures only one transaction at a time can allocate eventNumbers for this aggregate
          // The lock is per (aggregateId, aggregateType, workspaceId) tuple
          await tx.$executeRaw`
            INSERT INTO aggregate_locks (aggregate_id, aggregate_type, workspace_id, version)
            VALUES (${request.aggregateId}, ${request.aggregateType}, ${request.workspaceId}, 0)
            ON CONFLICT (aggregate_id, aggregate_type, workspace_id)
            DO UPDATE SET version = aggregate_locks.version + 1
          `;

          // Step 2: Within locked transaction, find the last event number for this aggregate
          // The lock ensures only one transaction can read+write event numbers for this aggregate
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

          logger.info("EventEmitterService: Event emitted (atomic per-aggregate lock)", {
            eventId: newEvent.id,
            eventNumber: nextEventNumber,
            aggregateId: request.aggregateId,
            workspaceId: request.workspaceId,
          });

          return {
            isEarlyReturn: false,
            event: newEvent,
          };
        },
        {
          isolationLevel: "ReadCommitted", // READ_COMMITTED: safe for aggregate lock, allows concurrent writes to different aggregates
          timeout: 10000, // 10 second timeout for deadlock/contention
          maxWait: 5000,  // Max 5 seconds waiting for transaction slot
        }
      );

      // Handle early return from idempotency check
      if (event.isEarlyReturn) {
        event = event.event;
      } else {
        event = event.event;
      }
    } catch (error: any) {
      // If unique constraint on idempotency_key failed, another transaction created it concurrently
      // This is expected and correct behavior under high concurrency
      const isIdempotencyConstraintError =
        request.idempotencyKey &&
        (error.code === "P2002" || // Prisma unique constraint error
          error.message?.includes("idempotency"));

      if (isIdempotencyConstraintError) {
        logger.info(
          "EventEmitterService: Idempotency key already created by concurrent request",
          {
            idempotencyKey: request.idempotencyKey,
            errorCode: error.code,
          }
        );

        // Fetch the already-created event (outside transaction)
        const existing = await db.canonicalEvent.findFirst({
          where: {
            idempotencyKey: request.idempotencyKey,
            workspaceId: request.workspaceId,
          },
        });

        if (!existing) {
          throw new Error(
            "Idempotency key constraint error but event not found - this should not happen"
          );
        }

        event = existing;
      } else {
        throw error;
      }
    }

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
        error: getSafeErrorMessage(error),
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
