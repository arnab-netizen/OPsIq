import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/infra/logger";

type RecommendationCreateData = Prisma.RecommendationUncheckedCreateInput;

type CanonicalRecommendationEvent = {
  eventType: string;
  payload: Record<string, unknown>;
  eventNumber: number;
};

/**
 * ProjectionRebuildEngine: Rebuild projections solely from CanonicalEvent.
 * Truth source: CanonicalEvent only.
 * No other sources of truth are used during rebuild.
 */
export class ProjectionRebuildEngine {
  /**
   * Rebuild recommendation projection from event stream.
   * Deletes existing projection and rebuilds from scratch.
   * Returns parity check result.
   */
  static async rebuildRecommendationProjection(
    recommendationId: string,
    workspaceId: string
  ): Promise<{
    success: boolean;
    eventsProcessed: number;
    parityCheckPassed: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const events = await db.canonicalEvent.findMany({
        where: {
          aggregateId: recommendationId,
          aggregateType: "recommendation",
          workspaceId,
        },
        orderBy: { eventNumber: "asc" },
      });

      if (events.length === 0) {
        return {
          success: false,
          eventsProcessed: 0,
          parityCheckPassed: false,
          errors: ["No events found for recommendation"],
        };
      }

      try {
        await db.recommendation.delete({
          where: { id: recommendationId },
        });

        logger.info("ProjectionRebuild: Deleted existing projection", {
          recommendationId,
        });
      } catch {
        logger.info("ProjectionRebuild: Projection not found, will create new", {
          recommendationId,
        });
      }

      let projectionState: Record<string, unknown> = {
        id: recommendationId,
        workspaceId,
      };

      for (const event of events) {
        try {
          projectionState = ProjectionRebuildEngine.applyEventToProjection(
            projectionState,
            {
              eventType: event.eventType,
              payload: event.payload as Record<string, unknown>,
              eventNumber: event.eventNumber,
            }
          );
        } catch (err) {
          errors.push(`Error applying event ${event.eventNumber}: ${err}`);
        }
      }

      await db.recommendation.create({
        data: projectionState as RecommendationCreateData,
      });

      logger.info("ProjectionRebuild: Rebuilt projection from events", {
        recommendationId,
        eventsProcessed: events.length,
      });

      const rebuildSuccess = await this.verifyProjectionParity(
        recommendationId,
        workspaceId
      );

      return {
        success: errors.length === 0,
        eventsProcessed: events.length,
        parityCheckPassed: rebuildSuccess,
        errors,
      };
    } catch (error) {
      errors.push(
        `Rebuild failed: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        success: false,
        eventsProcessed: 0,
        parityCheckPassed: false,
        errors,
      };
    }
  }

  /**
   * Apply event to projection state.
   */
  private static applyEventToProjection(
    state: Record<string, unknown>,
    event: CanonicalRecommendationEvent
  ): Record<string, unknown> {
    if (event.eventType === "recommendation.created") {
      return {
        ...state,
        engagementId: event.payload.engagementId as string,
        title: event.payload.title as string,
        description: event.payload.description as string,
        priority: event.payload.priority as string,
        evidenceValidationScore: event.payload.evidenceValidationScore
          ? Math.round(
              typeof event.payload.evidenceValidationScore === "string"
                ? parseFloat(event.payload.evidenceValidationScore)
                : (event.payload.evidenceValidationScore as number)
            )
          : undefined,
        reliabilityLevel: event.payload.reliabilityLevel as string | undefined,
        kpiHealthScore: event.payload.kpiHealthScore
          ? Math.round(
              typeof event.payload.kpiHealthScore === "string"
                ? parseFloat(event.payload.kpiHealthScore)
                : (event.payload.kpiHealthScore as number)
            )
          : undefined,
        kpiRiskLevel: event.payload.kpiRiskLevel as string | undefined,
      };
    }

    return state;
  }

  /**
   * Verify projection parity.
   * Replay is parked, so parity verification is unavailable in active runtime.
   */
  private static async verifyProjectionParity(
    recommendationId: string,
    workspaceId: string
  ): Promise<boolean> {
    const liveProjection = await db.recommendation.findUnique({
      where: { id: recommendationId, workspaceId },
    });

    if (!liveProjection) {
      logger.error("ProjectionParity: Live projection not found", {
        recommendationId,
        workspaceId,
      });

      return false;
    }

    logger.warn("ProjectionParity: Parity check unavailable because replay is parked", {
      recommendationId,
      workspaceId,
    });

    return false;
  }

  /**
   * Rebuild all recommendation projections for a workspace.
   * Used for disaster recovery or corruption repair.
   * Rebuilds from canonical_events source of truth.
   */
  static async rebuildAllProjections(
    workspaceId: string
  ): Promise<{
    totalRecommendations: number;
    successful: number;
    failed: number;
    errors: Array<{ recommendationId: string; error: string }>;
  }> {
    const events = await db.canonicalEvent.findMany({
      where: {
        aggregateType: "recommendation",
        workspaceId,
      },
      select: { aggregateId: true },
      distinct: ["aggregateId"],
    });

    const recommendationIds = events.map(
      (event: { aggregateId: string }) => event.aggregateId
    );

    const errors: Array<{ recommendationId: string; error: string }> = [];

    let successful = 0;
    let failed = 0;

    for (const recommendationId of recommendationIds) {
      const result = await this.rebuildRecommendationProjection(
        recommendationId,
        workspaceId
      );

      if (result.success && result.parityCheckPassed) {
        successful++;
      } else {
        failed++;
        errors.push({
          recommendationId,
          error: result.errors.join("; "),
        });
      }
    }

    return {
      totalRecommendations: recommendationIds.length,
      successful,
      failed,
      errors,
    };
  }
}