import { logger } from "@/infra/logger";

export interface AggregateSnapshot {
  aggregateId: string;
  aggregateType: string;
  snapshotNumber: number;
  state: Record<string, unknown>;
  createdAt: Date;
}

export class SnapshotEngine {
  // Snapshot every N events for performance optimization
  private static readonly SNAPSHOT_INTERVAL = 50;

  /**
   * Create a snapshot of aggregate state.
   * Used to optimize replay performance by skipping earlier events.
   *
   * EventReplayEngine is lazy-loaded to keep it out of the active runtime import graph.
   */
  static async createSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    atEventNumber: number
  ): Promise<AggregateSnapshot> {
    const { EventReplayEngine } = await import("@/services/event-replay-engine");

    const replayed = await EventReplayEngine.replayAggregate(
      aggregateId,
      aggregateType,
      workspaceId,
      atEventNumber
    );

    logger.info("SnapshotEngine: Snapshot created", {
      aggregateId,
      aggregateType,
      eventNumber: atEventNumber,
      stateSize: JSON.stringify(replayed.state).length,
    });

    return {
      aggregateId,
      aggregateType,
      snapshotNumber: atEventNumber,
      state: replayed.state,
      createdAt: new Date(),
    };
  }

  /**
   * Get snapshot for aggregate.
   * Returns the most recent snapshot before a given event number.
   */
  static async getSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string
  ): Promise<AggregateSnapshot | null> {
    logger.info("SnapshotEngine: Snapshot query", {
      aggregateId,
      aggregateType,
      workspaceId,
    });

    return null;
  }

  /**
   * Check if snapshot should be created.
   */
  static shouldCreateSnapshot(eventsSinceLastSnapshot: number): boolean {
    return eventsSinceLastSnapshot >= SnapshotEngine.SNAPSHOT_INTERVAL;
  }

  /**
   * Replay aggregate using snapshot if available.
   * Falls back to full replay if no snapshot exists.
   *
   * EventReplayEngine is lazy-loaded to keep it out of the active runtime import graph.
   */
  static async replayWithSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    upToEventNumber?: number
  ): Promise<Record<string, unknown>> {
    const snapshot = await SnapshotEngine.getSnapshot(
      aggregateId,
      aggregateType,
      workspaceId
    );

    if (snapshot) {
      logger.info("SnapshotEngine: Using snapshot for replay optimization", {
        aggregateId,
        snapshotEventNumber: snapshot.snapshotNumber,
      });

      // Future implementation:
      // Replay only events after snapshot.
      // Current implementation intentionally falls back to full replay.
    }

    const { EventReplayEngine } = await import("@/services/event-replay-engine");

    const replayed = await EventReplayEngine.replayAggregate(
      aggregateId,
      aggregateType,
      workspaceId,
      upToEventNumber
    );

    return replayed.state;
  }

  /**
   * Cleanup old snapshots.
   */
  static async cleanupOldSnapshots(
    workspaceId: string,
    keepCount: number = 5
  ): Promise<void> {
    logger.info("SnapshotEngine: Cleanup not yet implemented", {
      workspaceId,
      keepCount,
    });
  }
}