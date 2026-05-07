// EventProjection service - Projection engine for read-side materializations
// Phase 3 Slice 4: Query-optimized views from canonical events

import { PrismaClient } from '../generated/prisma';
import { CanonicalEvent } from '../domain/canonical-event';
import { EventEmitterService } from './event-emitter';

export interface ProjectionState {
  projectionId: string;
  aggregateId: string;
  projectionType: string;
  version: number;
  data: Record<string, unknown>;
  builtFromEventCount: number;
  builtAt: Date;
}

export interface ProjectionConsistencyResult {
  projectionId: string;
  isConsistent: boolean;
  expectedVersion: number;
  actualVersion: number;
  reason?: string;
}

export class ProjectionEngine {
  /**
   * Build a projection from canonical events
   * Projection is a query-optimized read model built from events
   */
  static async buildProjection(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    projectionType: string
  ): Promise<ProjectionState> {
    // Get all events for aggregate
    const events = await EventEmitterService.getAggregateEvents(
      db,
      workspaceId,
      aggregateId
    );

    // Apply events in order to build projection
    const projectionData = this.applyEventsToProjection(
      events,
      projectionType
    );

    const projection: ProjectionState = {
      projectionId: this.generateProjectionId(
        workspaceId,
        aggregateId,
        projectionType
      ),
      aggregateId,
      projectionType,
      version: events.length,
      data: projectionData,
      builtFromEventCount: events.length,
      builtAt: new Date(),
    };

    return projection;
  }

  /**
   * Incrementally update projection from new events
   * More efficient than full rebuild for append-only streams
   */
  static async updateProjectionIncremental(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    projectionType: string,
    fromVersion: number
  ): Promise<ProjectionState> {
    // Get all events
    const allEvents = await EventEmitterService.getAggregateEvents(
      db,
      workspaceId,
      aggregateId
    );

    // Filter to events after fromVersion
    const newEvents = allEvents.filter((e) => e.eventNumber > fromVersion);

    if (newEvents.length === 0) {
      // No new events, return current state
      const currentProjection = await this.buildProjection(
        db,
        workspaceId,
        aggregateId,
        projectionType
      );
      return currentProjection;
    }

    // Build projection starting from previous state
    // In production, would load previous projection and apply only new events
    const projectionData = this.applyEventsToProjection(
      allEvents,
      projectionType
    );

    const projection: ProjectionState = {
      projectionId: this.generateProjectionId(
        workspaceId,
        aggregateId,
        projectionType
      ),
      aggregateId,
      projectionType,
      version: allEvents.length,
      data: projectionData,
      builtFromEventCount: allEvents.length,
      builtAt: new Date(),
    };

    return projection;
  }

  /**
   * Verify projection is consistent with event stream
   * Rebuilds projection and compares with stored version
   */
  static async verifyProjectionConsistency(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    projectionType: string,
    currentProjectionVersion: number
  ): Promise<ProjectionConsistencyResult> {
    try {
      const freshProjection = await this.buildProjection(
        db,
        workspaceId,
        aggregateId,
        projectionType
      );

      const projectionId = this.generateProjectionId(
        workspaceId,
        aggregateId,
        projectionType
      );

      if (freshProjection.version !== currentProjectionVersion) {
        return {
          projectionId,
          isConsistent: false,
          expectedVersion: freshProjection.version,
          actualVersion: currentProjectionVersion,
          reason: `Version mismatch: expected v${freshProjection.version}, got v${currentProjectionVersion}`,
        };
      }

      return {
        projectionId,
        isConsistent: true,
        expectedVersion: freshProjection.version,
        actualVersion: currentProjectionVersion,
      };
    } catch (error) {
      return {
        projectionId: this.generateProjectionId(
          workspaceId,
          aggregateId,
          projectionType
        ),
        isConsistent: false,
        expectedVersion: -1,
        actualVersion: -1,
        reason: `Consistency check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Get all projections for a workspace
   * Useful for bulk queries and reporting
   */
  static async getProjectionsByType(
    db: PrismaClient,
    workspaceId: string,
    projectionType: string
  ): Promise<ProjectionState[]> {
    // In a real implementation, would query a projections table
    // For now, simulates retrieving all aggregates and building projections
    const events = await EventEmitterService.getEventsByType(
      db,
      workspaceId,
      'recommendation_created' // Example: get recommendation events
    );

    // Group by aggregateId and build one projection per aggregate
    const aggregateIds = [
      ...new Set(events.map((e) => e.aggregateId)),
    ];

    const projections = await Promise.all(
      aggregateIds.map((aggId) =>
        this.buildProjection(db, workspaceId, aggId, projectionType)
      )
    );

    return projections;
  }

  /**
   * Rebuild all projections for a workspace
   * Useful for recovery from projection corruption
   */
  static async rebuildAllProjections(
    db: PrismaClient,
    workspaceId: string,
    projectionTypes: string[]
  ): Promise<{ rebuildCount: number; timestamp: Date }> {
    // Get all aggregates (events) in workspace
    const allEvents = await db.canonicalEvent.findMany({
      where: { workspaceId },
      distinct: ['aggregateId'],
    });

    const aggregateIds = [...new Set(allEvents.map((e) => e.aggregateId))];

    // Rebuild each projection type for each aggregate
    let rebuildCount = 0;
    for (const projectionType of projectionTypes) {
      for (const aggId of aggregateIds) {
        await this.buildProjection(
          db,
          workspaceId,
          aggId,
          projectionType
        );
        rebuildCount++;
      }
    }

    return {
      rebuildCount,
      timestamp: new Date(),
    };
  }

  /**
   * Get projection freshness (staleness)
   * Returns how many events have occurred since projection was built
   */
  static async getProjectionFreshness(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    projectionVersion: number
  ): Promise<{
    eventsSinceProjection: number;
    isFresh: boolean;
    stalePastVersions?: number;
  }> {
    // Get total event count for aggregate
    const totalEventCount =
      await EventEmitterService.getEventCount(
        db,
        workspaceId,
        aggregateId
      );

    const eventsSince = totalEventCount - projectionVersion;
    const isFresh = eventsSince === 0;
    const staleVersions = Math.max(0, eventsSince - 1);

    return {
      eventsSinceProjection: eventsSince,
      isFresh,
      stalePastVersions: staleVersions > 0 ? staleVersions : undefined,
    };
  }

  /**
   * Private: Apply events to build projection
   * Determines what fields are included in the projection
   */
  private static applyEventsToProjection(
    events: CanonicalEvent[],
    projectionType: string
  ): Record<string, unknown> {
    let projection: Record<string, unknown> = {
      projectionType,
      aggregateId: events.length > 0 ? events[0].aggregateId : undefined,
      eventCount: events.length,
    };

    for (const event of events) {
      // Include select payload fields in projection
      if (projectionType === 'summary') {
        projection = {
          ...projection,
          title: event.payload?.title,
          status: event.payload?.status,
          priority: event.payload?.priority,
        };
      } else if (projectionType === 'detailed') {
        // Include all payload
        projection = {
          ...projection,
          ...event.payload,
        };
      } else if (projectionType === 'timeline') {
        // Include event metadata for timeline
        if (!Array.isArray(projection.events)) {
          projection.events = [];
        }
        (projection.events as Array<Record<string, unknown>>).push({
          type: event.eventType,
          occurredAt: event.occurredAt.toISOString(),
          actorId: event.metadata?.actorId,
        });
      }
    }

    return projection;
  }

  /**
   * Private: Generate deterministic projection ID
   */
  private static generateProjectionId(
    workspaceId: string,
    aggregateId: string,
    projectionType: string
  ): string {
    return `${workspaceId}:${aggregateId}:${projectionType}`;
  }
}
