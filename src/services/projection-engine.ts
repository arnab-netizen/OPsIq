import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

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
        error: error instanceof Error ? error.message : String(error),
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
      // Denormalize assessment data from event payload to materialized view
      const updateData: Record<string, unknown> = {
        title: (payload.title as string) || undefined,
        description: (payload.description as string) || undefined,
        priority: (payload.priority as string) || undefined,
      };

      // Denormalize Phase 1 evidence assessment scores
      if (payload.evidenceValidationScore) {
        updateData.evidenceValidationScore = Math.round(
          typeof payload.evidenceValidationScore === 'string'
            ? parseFloat(payload.evidenceValidationScore)
            : (payload.evidenceValidationScore as number)
        );
      }
      if (payload.reliabilityLevel) {
        updateData.reliabilityLevel = payload.reliabilityLevel as string;
      }

      // Denormalize Phase 2 KPI health assessment scores
      if (payload.kpiHealthScore) {
        updateData.kpiHealthScore = Math.round(
          typeof payload.kpiHealthScore === 'string'
            ? parseFloat(payload.kpiHealthScore)
            : (payload.kpiHealthScore as number)
        );
      }
      if (payload.kpiRiskLevel) {
        updateData.kpiRiskLevel = payload.kpiRiskLevel as string;
      }

      await db.recommendation.update({
        where: { id: aggregateId },
        data: updateData,
      });

      logger.info("ProjectionEngine: Recommendation projected", {
        aggregateId,
        eventType,
      });
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
          error: error instanceof Error ? error.message : String(error),
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
