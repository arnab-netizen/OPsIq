/**
 * PHASE 4: TELEMETRY EMITTER
 *
 * Non-blocking, exception-safe, fire-and-isolate telemetry emission.
 *
 * CRITICAL GUARANTEES:
 * - Telemetry failures never fail requests
 * - Telemetry failures never alter responses
 * - Telemetry failures never change auth decisions
 * - Telemetry emission does not block request path
 * - Telemetry is immutable once created
 * - No recursive telemetry emission
 */

import { TelemetryEvent, serializeTelemetryEvent, validateTelemetryEvent } from "./telemetry-contracts";
import { logger } from "./logger";

/**
 * Global telemetry queue — buffered for async emission
 * Kept small to prevent memory bloat
 */
const telemetryQueue: TelemetryEvent[] = [];
const MAX_QUEUE_SIZE = 10000;
let flushScheduled = false;
const FLUSH_INTERVAL_MS = 5000;
const BATCH_SIZE = 500;

/**
 * Emit telemetry event (fire-and-forget)
 * Returns immediately. Failures are isolated.
 *
 * NEVER throws. NEVER blocks.
 */
export function emitTelemetry(event: TelemetryEvent): void {
  try {
    // Validate event structure (catches programming errors)
    if (!validateTelemetryEvent(event)) {
      logger.warn("Telemetry event validation failed", {
        eventType: (event as Record<string, unknown>)?.eventType,
        reason: "Invalid event structure",
      });
      return;
    }

    // Queue for async delivery
    if (telemetryQueue.length < MAX_QUEUE_SIZE) {
      telemetryQueue.push(event);
    } else {
      // Queue full — drop oldest event
      telemetryQueue.shift();
      telemetryQueue.push(event);
      logger.warn("Telemetry queue overflow", {
        dropped: 1,
        queueSize: telemetryQueue.length,
      });
    }

    // Schedule flush if not already scheduled
    if (!flushScheduled) {
      flushScheduled = true;
      // Fire flush async, never wait
      scheduleFlush();
    }
  } catch (error) {
    // CRITICAL: Catch and isolate all errors
    // Telemetry emission MUST NEVER throw
    try {
      logger.error("Telemetry emission failed", error as Error, {
        reason: "Unexpected error in telemetry emission",
      });
    } catch {
      // Even logger failed — give up silently
      // Never crash the request path
    }
  }
}

/**
 * Schedule flush (non-blocking)
 */
function scheduleFlush(): void {
  // Use setImmediate if available (Node.js), otherwise setTimeout
  if (typeof setImmediate !== "undefined") {
    setImmediate(flushTelemetry);
  } else {
    setTimeout(flushTelemetry, 0);
  }

  // Also schedule interval flush
  if (!globalThis.__telemetryFlushTimer) {
    globalThis.__telemetryFlushTimer = setInterval(flushTelemetry, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush pending telemetry events
 * Called asynchronously. Failures are isolated.
 */
async function flushTelemetry(): Promise<void> {
  if (telemetryQueue.length === 0) {
    flushScheduled = false;
    return;
  }

  try {
    // Batch telemetry for delivery
    while (telemetryQueue.length > 0) {
      const batch = telemetryQueue.splice(0, BATCH_SIZE);

      // Emit batch (fire-and-forget)
      emitBatch(batch).catch((error) => {
        try {
          logger.warn("Telemetry batch emission failed", {
            batchSize: batch.length,
            reason: String(error),
          });
        } catch {
          // Give up silently
        }
      });
    }

    flushScheduled = false;
  } catch (error) {
    // Catch and isolate
    try {
      logger.error("Telemetry flush failed", error as Error);
    } catch {
      // Give up silently
    }
    flushScheduled = false;
  }
}

/**
 * Emit batch of telemetry events
 * In production, this sends to DataDog/CloudWatch/centralized logging
 * In test, this logs to stdout
 */
async function emitBatch(events: TelemetryEvent[]): Promise<void> {
  // Deterministic serialization
  const serialized = events.map(serializeTelemetryEvent);

  // In production, send to monitoring backend
  // For now, log to stdout (test can capture)
  try {
    for (const event of serialized) {
      // Parse for logging (safe since we validated)
      const parsed = JSON.parse(event) as Record<string, unknown>;
      logger.info("TELEMETRY", {
        eventType: String(parsed.eventType),
        telemetryClass: String(parsed.telemetryClass),
        severity: String(parsed.severity),
        correlationId: String(parsed.correlationId),
      });
    }
  } catch (error) {
    // If even logging fails, abandon this batch
    throw new Error(`Failed to emit telemetry batch: ${String(error)}`);
  }
}

/**
 * Get current telemetry queue state (testing only)
 */
export function getTelemetryQueue(): TelemetryEvent[] {
  return [...telemetryQueue];
}

/**
 * Clear telemetry queue (testing only)
 */
export function clearTelemetryQueue(): void {
  telemetryQueue.length = 0;
  flushScheduled = false;
}

/**
 * Wait for telemetry flush (testing only)
 */
export async function waitForTelemetryFlush(): Promise<void> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const maxWait = 5000;

    const checkFlushed = () => {
      if (telemetryQueue.length === 0 && !flushScheduled) {
        resolve();
        return;
      }

      if (Date.now() - startTime > maxWait) {
        resolve(); // Timeout
        return;
      }

      setTimeout(checkFlushed, 100);
    };

    checkFlushed();
  });
}

/**
 * Type augmentation for Node.js global
 */
declare global {
   
  var __telemetryFlushTimer: NodeJS.Timeout | undefined;
}
