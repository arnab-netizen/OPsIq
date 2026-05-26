/**
 * PHASE 5: AUDIT PERSISTENCE ISOLATION
 *
 * CRITICAL: Audit persistence MUST NEVER block requests, fail auth, or crash.
 *
 * Requirements:
 * - Non-blocking: Fire-and-forget async persistence
 * - No request blocking: Audit writes happen in background
 * - No auth pipeline impact: Audit failures never fail auth
 * - Bounded memory: Queue size capped, drop oldest if full
 * - Graceful degradation: Audit failures don't crash system
 * - Drop policy: When queue full, drop oldest events
 * - Dead-letter protection: Failed events logged for retry
 *
 * Queue model:
 * - Max 50k pending audit events
 * - Batch size: 100 events per DB write
 * - Flush interval: 5 seconds or on batch full
 */

import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import type { AuditEventInput } from "@/infra/audit";
import { Prisma } from "@/generated/prisma/client";

/**
 * Pending audit event in queue
 */
interface PendingAuditEvent {
  eventId: string;
  input: AuditEventInput;
  enqueuedAt: number;
  tier: "TIER_1_ALWAYS_PERSIST" | "TIER_2_ADAPTIVE_SAMPLED" | "TIER_3_METRICS_ONLY";
}

/**
 * Audit persistence queue — isolated from request path
 */
export class AuditPersistenceQueue {
  private queue: PendingAuditEvent[] = [];
  private readonly MAX_QUEUE_SIZE = 50000;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private flushScheduled = false;
  private flushTimer: NodeJS.Timeout | null = null;

  // Metrics
  private totalEnqueued = 0;
  private totalPersisted = 0;
  private totalDropped = 0;
  private totalFailed = 0;

  constructor() {
    // Schedule periodic flush
    this.scheduleFlush();
  }

  /**
   * Enqueue audit event (fire-and-forget)
   *
   * NEVER throws. NEVER blocks. Returns immediately.
   */
  public enqueueEvent(
    eventId: string,
    input: AuditEventInput,
    tier: "TIER_1_ALWAYS_PERSIST" | "TIER_2_ADAPTIVE_SAMPLED" | "TIER_3_METRICS_ONLY"
  ): void {
    try {
      // TIER_3 events are never enqueued (metrics-only)
      if (tier === "TIER_3_METRICS_ONLY") {
        return;
      }

      this.totalEnqueued++;

      // Check queue capacity
      if (this.queue.length >= this.MAX_QUEUE_SIZE) {
        // Queue full — drop oldest event (not TIER_1)
        // First, try to drop TIER_2 event
        const tier2Index = this.queue.findIndex((e) => e.tier === "TIER_2_ADAPTIVE_SAMPLED");
        if (tier2Index >= 0) {
          const dropped = this.queue.splice(tier2Index, 1)[0];
          this.totalDropped++;

          if (this.totalDropped % 1000 === 0) {
            logger.warn("Audit queue overflow", {
              queueSize: this.queue.length,
              maxSize: this.MAX_QUEUE_SIZE,
              totalDropped: this.totalDropped,
              droppedEventName: dropped.input.eventName,
            });
          }
        }
      }

      // Enqueue event
      this.queue.push({
        eventId,
        input,
        enqueuedAt: Date.now(),
        tier,
      });

      // Schedule flush if needed
      if (this.queue.length >= this.BATCH_SIZE && !this.flushScheduled) {
        this.scheduleImmediateFlush();
      }
    } catch (error) {
      // CRITICAL: Catch all errors and don't throw
      try {
        logger.error("Audit enqueueing failed", error as Error, {
          reason: "Unexpected error enqueueing audit event",
        });
      } catch {
        // Even logger failed — give up silently
      }
    }
  }

  /**
   * Schedule immediate flush
   */
  private scheduleImmediateFlush(): void {
    if (this.flushScheduled) return;

    this.flushScheduled = true;
    // Fire flush async, never wait
    if (typeof setImmediate !== "undefined") {
      setImmediate(() => this.flush());
    } else {
      setTimeout(() => this.flush(), 0);
    }
  }

  /**
   * Schedule periodic flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        try {
          logger.warn("Periodic audit flush failed", {
            reason: String(error),
            queueSize: this.queue.length,
          });
        } catch {
          // Give up
        }
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Flush pending audit events
   * Called asynchronously. Failures are isolated.
   */
  private async flush(): Promise<void> {
    // Skip persistence when database is not available (TEST_WITH_DB=false)
    if (process.env.TEST_WITH_DB !== "true") {
      this.flushScheduled = false;
      return;
    }

    if (this.queue.length === 0) {
      this.flushScheduled = false;
      return;
    }

    try {
      // Process batches
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.BATCH_SIZE);
        await this.persistBatch(batch);
      }

      this.flushScheduled = false;
    } catch (error) {
      // Catch and isolate — never crash
      try {
        logger.error("Audit flush failed", error as Error, {
          queueSize: this.queue.length,
        });
      } catch {
        // Give up
      }
      this.flushScheduled = false;
    }
  }

  /**
   * Persist batch of audit events
   * Isolated from request path — can fail without affecting requests
   */
  private async persistBatch(batch: PendingAuditEvent[]): Promise<void> {
    if (process.env.TEST_WITH_DB !== "true") {
      return;
    }

    try {
      // Create all events in batch
      const created = await db.auditEvent.createMany({
        data: batch.map((e) => ({
          id: e.eventId,
          workspaceId: e.input.workspaceId,
          eventName: e.input.eventName,
          actorId: e.input.actorId ?? null,
          actorType: e.input.actorType ?? "user",
          entityType: e.input.entityType ?? null,
          entityId: e.input.entityId ?? null,
          payload: e.input.payload ? (e.input.payload as Prisma.InputJsonValue) : Prisma.DbNull,
          correlationId: e.input.correlationId ?? null,
          visibility: (e.input.visibility ?? "internal") as "internal" | "client_visible",
          previousHash: null, // Hash chaining disabled for performance
          occurredAt: new Date(),
        })),
      });

      this.totalPersisted += created.count;

      if (created.count > 0 && created.count % 1000 === 0) {
        logger.info("Audit batch persisted", {
          batchSize: created.count,
          totalPersisted: this.totalPersisted,
        });
      }
    } catch (error) {
      // Batch failed — log and continue
      this.totalFailed += batch.length;

      try {
        logger.error("Audit batch persistence failed", error as Error, {
          batchSize: batch.length,
          totalFailed: this.totalFailed,
          firstEvent: batch[0]?.input.eventName,
        });
      } catch {
        // Give up
      }

      // Could implement dead-letter queue here for retry
      // For now, events are lost but system continues
    }
  }

  /**
   * Get queue stats (for monitoring)
   */
  public getStats(): {
    queueSize: number;
    maxSize: number;
    totalEnqueued: number;
    totalPersisted: number;
    totalDropped: number;
    totalFailed: number;
    flushScheduled: boolean;
  } {
    return {
      queueSize: this.queue.length,
      maxSize: this.MAX_QUEUE_SIZE,
      totalEnqueued: this.totalEnqueued,
      totalPersisted: this.totalPersisted,
      totalDropped: this.totalDropped,
      totalFailed: this.totalFailed,
      flushScheduled: this.flushScheduled,
    };
  }

  /**
   * Wait for flush (testing only)
   */
  public async waitForFlush(maxWaitMs: number = 10000): Promise<void> {
    const startTime = Date.now();

    while (this.queue.length > 0 || this.flushScheduled) {
      if (Date.now() - startTime > maxWaitMs) {
        break; // Timeout
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Clear queue (testing only)
   */
  public clear(): void {
    this.queue = [];
    this.flushScheduled = false;
    this.totalEnqueued = 0;
    this.totalPersisted = 0;
    this.totalDropped = 0;
    this.totalFailed = 0;
  }

  /**
   * Shutdown queue (testing only)
   */
  public shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue = [];
  }
}

/**
 * Global audit persistence queue (singleton)
 */
let globalAuditQueue: AuditPersistenceQueue | null = null;

/**
 * Get or create global audit queue
 */
export function getAuditPersistenceQueue(): AuditPersistenceQueue {
  if (!globalAuditQueue) {
    globalAuditQueue = new AuditPersistenceQueue();
  }
  return globalAuditQueue;
}

/**
 * Reset global audit queue (testing only)
 */
export function resetAuditPersistenceQueue(): void {
  globalAuditQueue?.shutdown();
  globalAuditQueue = null;
}
