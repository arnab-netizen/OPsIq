import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import crypto from "crypto";

/**
 * SnapshotOptimizationEngine: Use snapshots to optimize replay
 * Snapshots must be validated before use (checksummed)
 * Stale snapshots are detected and regenerated
 */
export class SnapshotOptimizationEngine {
  /**
   * Stable JSON stringify with sorted keys
   */
  private static stableStringify(obj: unknown): string {
    if (obj === null) return "null";
    if (typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      return "[" + obj.map(v => this.stableStringify(v)).join(",") + "]";
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map(k => `"${k}":${this.stableStringify((obj as any)[k])}`);
    return "{" + pairs.join(",") + "}";
  }

  /**
   * Create snapshot with integrity checksum
   * Includes: all state at that point + checksum of state
   */
  static async createSnapshot(
    aggregateId: string,
    aggregateType: string,
    state: Record<string, unknown>,
    lastEventNumber: number,
    workspaceId: string
  ): Promise<string> {
    // Create checksum of state (integrity verification)
    // Use stable JSON serialization (sorted keys) for consistent checksums
    const stateString = this.stableStringify(state);
    const checksum = crypto.createHash("sha256").update(stateString).digest("hex");

    const snapshot = await db.snapshotData.create({
      data: {
        aggregateId,
        aggregateType,
        state,
        eventNumber: lastEventNumber,
        checksum, // Store checksum for validation
        workspaceId,
      },
    });

    logger.info("SnapshotOptimization: Snapshot created with checksum", {
      aggregateId,
      lastEventNumber,
      checksum,
    });

    return snapshot.id;
  }

  /**
   * Get valid snapshot if it exists and checksum matches
   * Returns null if snapshot is stale or corrupted
   */
  static async getValidSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string
  ): Promise<
    | {
        state: Record<string, unknown>;
        lastEventNumber: number;
        checksum: string;
      }
    | null
  > {
    const snapshot = await db.snapshotData.findFirst({
      where: {
        aggregateId,
        aggregateType,
        workspaceId,
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    if (!snapshot) {
      return null;
    }

    // Validate checksum (detect corruption)
    // Use stable JSON serialization (sorted keys) for consistent checksums
    const stateString = this.stableStringify(snapshot.state);
    const expectedChecksum = crypto
      .createHash("sha256")
      .update(stateString)
      .digest("hex");

    if (snapshot.checksum !== expectedChecksum) {
      logger.error("SnapshotOptimization: Checksum mismatch (corruption detected)", {
        aggregateId,
        storedChecksum: snapshot.checksum,
        expectedChecksum,
      });
      // Corruption detected: mark snapshot invalid and regenerate
      await db.snapshotData.delete({
        where: { id: snapshot.id },
      });
      return null;
    }

    // Check freshness: snapshot must be recent (within 24 hours)
    const snapshotAge = Date.now() - snapshot.createdAt.getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (snapshotAge > maxAge) {
      logger.warn("SnapshotOptimization: Snapshot is stale", {
        aggregateId,
        ageHours: Math.round(snapshotAge / (60 * 60 * 1000)),
      });
      // Snapshot is stale: regenerate
      await db.snapshotData.delete({
        where: { id: snapshot.id },
      });
      return null;
    }

    return {
      state: snapshot.state as Record<string, unknown>,
      lastEventNumber: snapshot.eventNumber,
      checksum: snapshot.checksum,
    };
  }

  /**
   * Invalidate snapshot (used when corruption detected or state changed)
   */
  static async invalidateSnapshot(
    aggregateId: string,
    aggregateType: string,
    workspaceId: string
  ): Promise<void> {
    await db.snapshotData.deleteMany({
      where: {
        aggregateId,
        aggregateType,
        workspaceId,
      },
    });

    logger.info("SnapshotOptimization: Snapshot invalidated", {
      aggregateId,
    });
  }

  /**
   * Get snapshots info for diagnostics
   */
  static async getSnapshotStats(
    workspaceId: string
  ): Promise<{
    totalSnapshots: number;
    corruptedSnapshots: number;
    staleSnapshots: number;
    validSnapshots: number;
  }> {
    const snapshots = await db.snapshotData.findMany({
      where: { workspaceId },
    });

    let corruptedCount = 0;
    let staleCount = 0;
    let validCount = 0;

    const maxAge = 24 * 60 * 60 * 1000;

    for (const snapshot of snapshots) {
      const stateString = JSON.stringify(snapshot.state);
      const expectedChecksum = crypto
        .createHash("sha256")
        .update(stateString)
        .digest("hex");

      if (snapshot.checksum !== expectedChecksum) {
        corruptedCount++;
      } else if (Date.now() - snapshot.createdAt.getTime() > maxAge) {
        staleCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalSnapshots: snapshots.length,
      corruptedSnapshots: corruptedCount,
      staleSnapshots: staleCount,
      validSnapshots: validCount,
    };
  }
}
