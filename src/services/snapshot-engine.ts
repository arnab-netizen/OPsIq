import { logger } from "@/infra/logger";

export interface AggregateSnapshot {
  aggregateId: string;
  aggregateType: string;
  snapshotNumber: number;
  state: Record<string, unknown>;
  createdAt: Date;
}

export class SnapshotEngine {
  private static readonly SNAPSHOT_INTERVAL = 50;

  /**
   * Snapshot creation is currently unavailable because replay is parked
   * and must not be wired into active runtime services.
   */
  static async createSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    atEventNumber: number
  ): Promise<AggregateSnapshot> {
    logger.warn("SnapshotEngine: Snapshot creation unavailable because replay is parked", {
      aggregateId,
      aggregateType,
      workspaceId,
      atEventNumber,
    });

    throw new Error("SnapshotEngine.createSnapshot unavailable because replay is parked");
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
   * Snapshot-backed replay is currently unavailable because replay is parked
   * and must not be wired into active runtime services.
   */
  static async replayWithSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string,
    upToEventNumber?: number
  ): Promise<Record<string, unknown>> {
    logger.warn("SnapshotEngine: Snapshot-backed replay unavailable because replay is parked", {
      aggregateId,
      aggregateType,
      workspaceId,
      upToEventNumber,
    });

    throw new Error("SnapshotEngine.replayWithSnapshot unavailable because replay is parked");
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