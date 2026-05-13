import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { EventReplayEngine } from "@/services/event-replay-engine";

/**
 * ProjectionRebuildEngine: Rebuild projections solely from CanonicalEvent
 * Truth source: CanonicalEvent only
 * No other sources of truth used during rebuild
 */
export class ProjectionRebuildEngine {
  /**
   * Rebuild recommendation projection from event stream
   * Deletes existing projection and rebuilds from scratch
   * Returns parity check result
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
      // Step 1: Delete existing projection (clear it)
      await db.recommendation.delete({
        where: { id: recommendationId },
      });

      logger.info("ProjectionRebuild: Deleted existing projection", {
        recommendationId,
      });

      // Step 2: Replay events using EventReplayEngine to reconstruct aggregate state
      let replayed;
      try {
        replayed = await EventReplayEngine.replayAggregate(
          recommendationId,
          "recommendation",
          workspaceId
        );
      } catch (replayErr) {
        throw new Error(
          `Replay failed: ${replayErr instanceof Error ? replayErr.message : String(replayErr)}`
        );
      }

      if (!replayed) {
        return {
          success: false,
          eventsProcessed: 0,
          parityCheckPassed: false,
          errors: ["EventReplayEngine returned no state for recommendation"],
        };
      }

      // Step 3: Transform replayed state to projection format and persist
      // Note: applyEvent() sets state fields directly (not prefixed with payload_)
      const convertScoreToInt = (val: unknown): number | undefined => {
        if (!val) return undefined;
        const num = typeof val === "string" ? parseFloat(val) : (val as number);
        return Number.isNaN(num) ? undefined : Math.round(num * 100);
      };

      const engagementId = replayed.state.engagementId as string | undefined;
      const title = replayed.state.title as string | undefined;
      const priority = replayed.state.priority as string | undefined;

      if (!engagementId) {
        throw new Error("Replayed state missing engagementId");
      }
      if (!title) {
        throw new Error("Replayed state missing title");
      }
      if (!priority) {
        throw new Error("Replayed state missing priority");
      }

      const projectionState = {
        id: recommendationId,
        workspaceId,
        engagementId,
        title,
        description: replayed.state.description as string | undefined,
        priority,
        evidenceValidationScore: convertScoreToInt(replayed.state.evidenceValidationScore),
        reliabilityLevel: replayed.state.reliabilityLevel as string | undefined,
        kpiHealthScore: convertScoreToInt(replayed.state.kpiHealthScore),
        kpiRiskLevel: replayed.state.kpiRiskLevel as string | undefined,
      };

      await db.recommendation.create({
        data: projectionState,
      });

      logger.info("ProjectionRebuild: Rebuilt projection from events via EventReplayEngine", {
        recommendationId,
        eventsProcessed: replayed.eventCount,
        usedSnapshot: replayed.usedSnapshot,
      });

      // Step 4: Verify parity - replay should equal projection
      const rebuildSuccess = await this.verifyProjectionParity(
        recommendationId,
        workspaceId
      );

      return {
        success: errors.length === 0,
        eventsProcessed: replayed.eventCount,
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
   * Apply event to projection state (fold logic)
   */
  private static applyEventToProjection(
    state: Record<string, unknown>,
    event: {
      eventType: string;
      payload: Record<string, unknown>;
      eventNumber: number;
    }
  ): Record<string, unknown> {
    // projection.created event
    if (event.eventType === "recommendation.created") {
      return {
        ...state,
        engagementId: event.payload.engagementId as string,
        title: event.payload.title as string,
        description: event.payload.description as string,
        priority: event.payload.priority as string,
        evidenceValidationScore: event.payload.evidenceValidationScore
          ? Math.round(
              (typeof event.payload.evidenceValidationScore === "string"
                ? parseFloat(event.payload.evidenceValidationScore)
                : (event.payload.evidenceValidationScore as number)) * 100
            )
          : undefined,
        reliabilityLevel: event.payload.reliabilityLevel as string | undefined,
        kpiHealthScore: event.payload.kpiHealthScore
          ? Math.round(
              (typeof event.payload.kpiHealthScore === "string"
                ? parseFloat(event.payload.kpiHealthScore)
                : (event.payload.kpiHealthScore as number)) * 100
            )
          : undefined,
        kpiRiskLevel: event.payload.kpiRiskLevel as string | undefined,
      };
    }

    return state;
  }

  /**
   * Verify projection parity: replay equals live projection
   * Truth check: Replayed state matches database projection
   */
  private static async verifyProjectionParity(
    recommendationId: string,
    workspaceId: string
  ): Promise<boolean> {
    try {
      // Get live projection from database
      const liveProjection = await db.recommendation.findUnique({
        where: { id: recommendationId },
      });

      if (!liveProjection) {
        logger.error("ProjectionParity: Live projection not found", {
          recommendationId,
        });
        return false;
      }

      // Get replayed state
      const replayed = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );

      // Compare critical fields
      const replayedPayload = replayed.state;
      const parityChecks = {
        engagementId:
          liveProjection.engagementId ===
          (replayedPayload.engagementId as string),
        title:
          liveProjection.title === (replayedPayload.title as string),
        description:
          liveProjection.description ===
          (replayedPayload.description as string),
        priority:
          liveProjection.priority === (replayedPayload.priority as string),
        evidenceValidationScore:
          liveProjection.evidenceValidationScore ===
          (replayedPayload.evidenceValidationScore as number),
        kpiHealthScore:
          liveProjection.kpiHealthScore ===
          (replayedPayload.kpiHealthScore as number),
      };

      const allMatch = Object.values(parityChecks).every((v) => v);

      if (!allMatch) {
        logger.warn("ProjectionParity: Mismatch detected", {
          recommendationId,
          parityChecks,
        });
      }

      return allMatch;
    } catch (error) {
      logger.error("ProjectionParity: Check failed", {
        recommendationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Rebuild all recommendation projections for a workspace
   * Used for disaster recovery or corruption repair
   */
  static async rebuildAllProjections(
    workspaceId: string
  ): Promise<{
    totalRecommendations: number;
    successful: number;
    failed: number;
    errors: Array<{ recommendationId: string; error: string }>;
  }> {
    const recommendationIds = await db.recommendation.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    const errors: Array<{ recommendationId: string; error: string }> = [];
    let successful = 0;
    let failed = 0;

    for (const { id } of recommendationIds) {
      const result = await this.rebuildRecommendationProjection(id, workspaceId);
      if (result.success && result.parityCheckPassed) {
        successful++;
      } else {
        failed++;
        errors.push({
          recommendationId: id,
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
