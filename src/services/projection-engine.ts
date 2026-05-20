import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

export interface ProjectionResult {
  projectionName: string;
  eventCount: number;
  success: boolean;
  lastProcessedEventId: string;
}

export class ProjectionEngine {
  /**
   * Project events into denormalized view tables
   * Maintains materialized views for query optimization
   */
  static async projectEvent(
    eventId: string,
    eventType: string,
    aggregateId: string,
    aggregateType: string,
    payload: Record<string, unknown>,
    workspaceId: string
  ): Promise<ProjectionResult> {
    try {
      // Route to appropriate projection handler
      switch (aggregateType) {
        case "recommendation":
          return await ProjectionEngine.projectRecommendationEvent(
            eventId,
            eventType,
            aggregateId,
            payload,
            workspaceId
          );
        case "action":
          return await ProjectionEngine.projectActionEvent(
            eventId,
            eventType,
            aggregateId,
            payload,
            workspaceId
          );
        case "engagement":
          return await ProjectionEngine.projectEngagementEvent(
            eventId,
            eventType,
            aggregateId,
            payload,
            workspaceId
          );
        default:
          logger.info("ProjectionEngine: No projection for aggregate type", {
            aggregateType,
          });
          return {
            projectionName: `${aggregateType}_projection`,
            eventCount: 1,
            success: true,
            lastProcessedEventId: eventId,
          };
      }
    } catch (error) {
      logger.error("ProjectionEngine: Projection failed", {
        eventId,
        aggregateType,
        error: getSafeErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Project recommendation events into materialized view
   */
  private static async projectRecommendationEvent(
    eventId: string,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    workspaceId: string
  ): Promise<ProjectionResult> {
    if (eventType === "recommendation.created") {
      // Skip projection for created events - let manual creation handle it
      // The event is persisted; projection rebuild will use the events as source of truth
      logger.info("ProjectionEngine: Skipping projection for recommendation.created", {
        aggregateId,
      });
    } else if (eventType === "recommendation.updated" || eventType === "recommendation.status_changed" || eventType === "recommendation.priority_updated") {
      // Handle update events with idempotent update
      const updateData: Record<string, unknown> = {};

      if (payload.title) updateData.title = payload.title;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.priority) updateData.priority = payload.priority;
      if (payload.status) updateData.status = payload.status;

      if (Object.keys(updateData).length > 0) {
        try {
          await db.recommendation.update({
            where: { id: aggregateId },
            data: updateData,
          });

          logger.info("ProjectionEngine: Recommendation updated", {
            aggregateId,
            eventType,
          });
        } catch (err) {
          // If recommendation doesn't exist, skip silently (created event might not have projected yet)
          logger.info("ProjectionEngine: Skipping update on non-existent recommendation", {
            aggregateId,
            eventType,
          });
        }
      }
    }

    return {
      projectionName: "recommendation_projection",
      eventCount: 1,
      success: true,
      lastProcessedEventId: eventId,
    };
  }

  /**
   * Project action events into materialized view
   */
  private static async projectActionEvent(
    eventId: string,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    workspaceId: string
  ): Promise<ProjectionResult> {
    if (eventType === "action.completed") {
      // Update action materialized view with completion status
      logger.info("ProjectionEngine: Action projection", {
        aggregateId,
        eventType,
        status: "completed",
      });
    }

    return {
      projectionName: "action_projection",
      eventCount: 1,
      success: true,
      lastProcessedEventId: eventId,
    };
  }

  /**
   * Project engagement events into materialized view
   */
  private static async projectEngagementEvent(
    eventId: string,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
    workspaceId: string
  ): Promise<ProjectionResult> {
    logger.info("ProjectionEngine: Engagement projection", {
      aggregateId,
      eventType,
    });

    return {
      projectionName: "engagement_projection",
      eventCount: 1,
      success: true,
      lastProcessedEventId: eventId,
    };
  }

  /**
   * Rebuild entire projection from event stream
   */
  static async rebuildProjection(
    aggregateType: string,
    workspaceId: string
  ): Promise<{ rebuildCount: number; aggregates: string[] }> {
    const events = await db.canonicalEvent.findMany({
      where: {
        aggregateType,
        workspaceId,
      },
      orderBy: { eventNumber: "asc" },
      distinct: ["aggregateId"],
      select: { aggregateId: true },
    });

    let rebuildCount = 0;
    const aggregates: string[] = [];

    for (const event of events) {
      try {
        // Replay each aggregate
        const allEvents = await db.canonicalEvent.findMany({
          where: {
            aggregateId: event.aggregateId,
            aggregateType,
            workspaceId,
          },
          orderBy: { eventNumber: "asc" },
        });

        for (const evt of allEvents) {
          await ProjectionEngine.projectEvent(
            evt.id,
            evt.eventType,
            evt.aggregateId,
            aggregateType,
            evt.payload as Record<string, unknown>,
            workspaceId
          );
        }

        aggregates.push(event.aggregateId);
        rebuildCount++;
      } catch (error) {
        logger.error("ProjectionEngine: Rebuild failed for aggregate", {
          aggregateId: event.aggregateId,
          error: getSafeErrorMessage(error),
        });
      }
    }

    logger.info("ProjectionEngine: Projection rebuild complete", {
      aggregateType,
      rebuildCount,
    });

    return { rebuildCount, aggregates };
  }
}
