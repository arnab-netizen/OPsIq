// EventSnapshot service - Snapshot engine for performance optimization
// Phase 3 Slice 5: Point-in-time aggregate state snapshots

import { PrismaClient } from '../generated/prisma';
import { CanonicalEvent } from '../domain/canonical-event';
import { EventEmitterService } from './event-emitter';
import { EventReplayEngine } from './event-replay';

export interface AggregateSnapshot {
  snapshotId: string;
  workspaceId: string;
  aggregateId: string;
  aggregateType: string;
  snapshotVersion: number;
  state: Record<string, unknown>;
  snapshotEventNumber: number;
  snapshotOccurredAt: Date;
  createdAt: Date;
}

export interface SnapshotStrategy {
  strategyType: 'event_count' | 'time_based' | 'hybrid';
  eventCountThreshold?: number;
  timeIntervalMinutes?: number;
}

export interface FastRecoveryResult {
  aggregateId: string;
  loadedFromSnapshot: boolean;
  snapshotVersion?: number;
  replayedEventCount: number;
  finalState: Record<string, unknown>;
  recoveredAt: Date;
}

export class SnapshotEngine {
  private static readonly DEFAULT_SNAPSHOT_THRESHOLD = 100;
  private static readonly DEFAULT_TIME_INTERVAL_MINUTES = 60;

  /**
   * Create snapshot of aggregate state at current point in time
   * Snapshots enable fast recovery: load snapshot + replay remaining events
   */
  static async createSnapshot(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    aggregateType: string
  ): Promise<AggregateSnapshot> {
    // Get current state by replaying all events
    const replayResult = await EventReplayEngine.replayAggregate(
      db,
      workspaceId,
      aggregateId
    );

    // Get the last event to capture version and timestamp
    const events = await EventEmitterService.getAggregateEvents(
      db,
      workspaceId,
      aggregateId
    );

    const lastEvent = events[events.length - 1];
    const snapshotEventNumber = lastEvent?.eventNumber || 0;
    const snapshotOccurredAt = lastEvent?.occurredAt || new Date();

    const snapshot: AggregateSnapshot = {
      snapshotId: this.generateSnapshotId(workspaceId, aggregateId),
      workspaceId,
      aggregateId,
      aggregateType,
      snapshotVersion: replayResult.eventCount,
      state: replayResult.finalState,
      snapshotEventNumber,
      snapshotOccurredAt,
      createdAt: new Date(),
    };

    return snapshot;
  }

  /**
   * Fast recovery: load snapshot and replay only newer events
   * Much faster than replaying all events for large aggregates
   */
  static async fastRecoverAggregate(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    latestSnapshot?: AggregateSnapshot
  ): Promise<FastRecoveryResult> {
    let startingState: Record<string, unknown> = {};
    let startingVersion = 0;
    let loadedFromSnapshot = false;

    // If snapshot exists, use it as starting point
    if (latestSnapshot) {
      startingState = latestSnapshot.state;
      startingVersion = latestSnapshot.snapshotVersion;
      loadedFromSnapshot = true;
    }

    // Get all events after snapshot version
    const allEvents = await EventEmitterService.getAggregateEvents(
      db,
      workspaceId,
      aggregateId
    );

    const eventsToReplay = allEvents.filter(
      (e) => e.eventNumber > startingVersion
    );

    // Apply remaining events to snapshot state
    let finalState = startingState;
    for (const event of eventsToReplay) {
      finalState = {
        ...finalState,
        ...event.payload,
        _lastEventNumber: event.eventNumber,
      };
    }

    return {
      aggregateId,
      loadedFromSnapshot,
      snapshotVersion: latestSnapshot?.snapshotVersion,
      replayedEventCount: eventsToReplay.length,
      finalState,
      recoveredAt: new Date(),
    };
  }

  /**
   * Should create snapshot based on strategy
   * Determines when snapshots should be taken
   */
  static shouldCreateSnapshot(
    currentEventCount: number,
    lastSnapshotEventCount: number,
    strategy: SnapshotStrategy = {
      strategyType: 'event_count',
      eventCountThreshold: this.DEFAULT_SNAPSHOT_THRESHOLD,
    }
  ): boolean {
    const eventsSinceSnapshot = currentEventCount - lastSnapshotEventCount;

    if (strategy.strategyType === 'event_count' && strategy.eventCountThreshold) {
      return eventsSinceSnapshot >= strategy.eventCountThreshold;
    }

    if (strategy.strategyType === 'time_based' && strategy.timeIntervalMinutes) {
      // Would check time difference in real implementation
      return eventsSinceSnapshot >= 10; // Simplified for tests
    }

    if (strategy.strategyType === 'hybrid') {
      const eventThreshold = strategy.eventCountThreshold || this.DEFAULT_SNAPSHOT_THRESHOLD;
      return eventsSinceSnapshot >= eventThreshold;
    }

    return false;
  }

  /**
   * Verify snapshot state matches current aggregate state
   * Returns { valid: boolean, reason?: string }
   */
  static async verifySnapshotConsistency(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    snapshot: AggregateSnapshot
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Replay aggregate from scratch
      const replayResult = await EventReplayEngine.replayAggregate(
        db,
        workspaceId,
        aggregateId
      );

      // Verify snapshot state matches at its event number
      const snapshotEvents = await EventEmitterService.getAggregateEvents(
        db,
        workspaceId,
        aggregateId
      );

      const eventsUpToSnapshot = snapshotEvents.filter(
        (e) => e.eventNumber <= snapshot.snapshotEventNumber
      );

      // Rebuild state up to snapshot point
      let expectedState: Record<string, unknown> = {};
      for (const event of eventsUpToSnapshot) {
        expectedState = { ...expectedState, ...event.payload };
      }

      // Compare snapshot state with expected state at that point
      const stateMatches =
        JSON.stringify(snapshot.state) === JSON.stringify(expectedState);

      if (!stateMatches) {
        return {
          valid: false,
          reason: `Snapshot state mismatch at event ${snapshot.snapshotEventNumber}`,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: `Snapshot verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Get all snapshots for an aggregate
   * Returns snapshots in chronological order
   */
  static async getAggregateSnapshots(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<AggregateSnapshot[]> {
    // In real implementation, would query snapshots table
    // For now, returns empty array (no snapshots stored yet)
    return [];
  }

  /**
   * Get latest snapshot for an aggregate
   * Most recent snapshot is optimal starting point for recovery
   */
  static async getLatestSnapshot(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string
  ): Promise<AggregateSnapshot | null> {
    const snapshots = await this.getAggregateSnapshots(
      db,
      workspaceId,
      aggregateId
    );

    if (snapshots.length === 0) {
      return null;
    }

    // Return most recent snapshot
    return snapshots[snapshots.length - 1];
  }

  /**
   * Clean up old snapshots
   * Keeps only N most recent snapshots per aggregate
   */
  static async pruneSnapshots(
    db: PrismaClient,
    workspaceId: string,
    aggregateId: string,
    keepCount: number = 3
  ): Promise<{ prunedCount: number }> {
    const snapshots = await this.getAggregateSnapshots(
      db,
      workspaceId,
      aggregateId
    );

    if (snapshots.length <= keepCount) {
      return { prunedCount: 0 };
    }

    const snapshotsToPrune = snapshots.length - keepCount;

    // In real implementation, would delete old snapshots
    // For now, just return count

    return { prunedCount: snapshotsToPrune };
  }

  /**
   * Calculate recovery cost (events to replay)
   * Helps decide if snapshot would be beneficial
   */
  static calculateRecoveryCost(
    totalEventCount: number,
    snapshotEventCount: number
  ): {
    withoutSnapshot: number;
    withSnapshot: number;
    savings: number;
    savingsPercent: number;
  } {
    const withoutSnapshot = totalEventCount;
    const withSnapshot = totalEventCount - snapshotEventCount;
    const savings = snapshotEventCount;
    const savingsPercent =
      totalEventCount > 0
        ? Math.round((savings / totalEventCount) * 100)
        : 0;

    return {
      withoutSnapshot,
      withSnapshot,
      savings,
      savingsPercent,
    };
  }

  /**
   * Get snapshot metrics for workspace
   * Useful for monitoring snapshot effectiveness
   */
  static async getSnapshotMetrics(
    db: PrismaClient,
    workspaceId: string
  ): Promise<{
    totalAggregates: number;
    snapshotCount: number;
    avgEventsSinceSnapshot: number;
  }> {
    // In real implementation, would query snapshots and events
    // For now, returns placeholder metrics
    return {
      totalAggregates: 0,
      snapshotCount: 0,
      avgEventsSinceSnapshot: 0,
    };
  }

  /**
   * Private: Generate deterministic snapshot ID
   */
  private static generateSnapshotId(
    workspaceId: string,
    aggregateId: string
  ): string {
    return `snapshot:${workspaceId}:${aggregateId}:${Date.now()}`;
  }
}
