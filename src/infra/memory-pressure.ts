/**
 * Memory pressure measurement.
 *
 * ─── Why this module exists ──────────────────────────────────────────────────
 *
 * The codebase previously derived memory health from `heapUsed / heapTotal`.
 * That ratio is NOT a saturation metric:
 *
 *   - `heapTotal` is the heap V8 has *currently committed*, not the heap it is
 *     allowed to grow to. V8 commits lazily and compacts on GC, so a healthy,
 *     well-behaved process routinely runs with heapUsed close to heapTotal.
 *   - The ratio is bounded at 100% by construction. It therefore cannot express
 *     "how much room is left" — the quantity a health check actually needs.
 *   - Observed in production: the ratio sits at 94–98% on an instance with
 *     healthy database latency, flat request latency and no OOM, while true
 *     heap consumption is a low single-digit percentage of the V8 limit.
 *
 * The real headroom signal is `heapUsed` against V8's own reported
 * `heap_size_limit`. That denominator is read from the runtime (`v8.getHeapStatistics()`),
 * never assumed or hard-coded, so it stays correct across platforms and
 * `--max-old-space-size` settings.
 *
 * `heapUtilizationPercent` (the old ratio) is retained as a DIAGNOSTIC field so
 * operators keep the signal, but it never gates availability.
 */

import v8 from "node:v8";

export type MemoryPressureLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Thresholds are applied to heapUsed / heap_size_limit — actual headroom
 * consumed, not committed-heap packing.
 */
export const MEMORY_PRESSURE_THRESHOLDS = {
  MEDIUM: 70,
  HIGH: 85,
  CRITICAL: 95,
} as const;

export interface MemoryPressureSnapshot {
  /** False when the runtime does not expose usable memory metrics. */
  available: boolean;
  /** heapUsed / heap_size_limit — the saturation metric. 0 when unavailable. */
  heapHeadroomUsedPercent: number;
  /** heapUsed / heapTotal — diagnostic only, never gates availability. */
  heapUtilizationPercent: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  heapLimitBytes: number;
  rssBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  level: MemoryPressureLevel;
}

const UNAVAILABLE: MemoryPressureSnapshot = {
  available: false,
  heapHeadroomUsedPercent: 0,
  heapUtilizationPercent: 0,
  heapUsedBytes: 0,
  heapTotalBytes: 0,
  heapLimitBytes: 0,
  rssBytes: 0,
  externalBytes: 0,
  arrayBuffersBytes: 0,
  // Fail safe: an unmeasurable metric must never take the service down.
  level: "LOW",
};

function isUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function levelFor(headroomUsedPercent: number): MemoryPressureLevel {
  if (headroomUsedPercent >= MEMORY_PRESSURE_THRESHOLDS.CRITICAL) return "CRITICAL";
  if (headroomUsedPercent >= MEMORY_PRESSURE_THRESHOLDS.HIGH) return "HIGH";
  if (headroomUsedPercent >= MEMORY_PRESSURE_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

/**
 * Read a memory snapshot from the runtime.
 *
 * Never throws: if `process.memoryUsage` or `v8.getHeapStatistics` are missing
 * or return malformed values, an `available: false` snapshot is returned with
 * level LOW so callers degrade to "cannot measure" rather than "unavailable".
 */
export function getMemoryPressure(): MemoryPressureSnapshot {
  try {
    if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
      return UNAVAILABLE;
    }

    const usage = process.memoryUsage();
    if (!usage || !isUsableNumber(usage.heapUsed) || !isUsableNumber(usage.heapTotal)) {
      return UNAVAILABLE;
    }

    const stats = typeof v8.getHeapStatistics === "function" ? v8.getHeapStatistics() : undefined;
    const heapLimitBytes = stats?.heap_size_limit;

    // Without a trustworthy limit there is no valid saturation denominator.
    if (!isUsableNumber(heapLimitBytes) || heapLimitBytes === 0) {
      return UNAVAILABLE;
    }

    const heapHeadroomUsedPercent = (usage.heapUsed / heapLimitBytes) * 100;
    const heapUtilizationPercent =
      usage.heapTotal > 0 ? (usage.heapUsed / usage.heapTotal) * 100 : 0;

    return {
      available: true,
      heapHeadroomUsedPercent,
      heapUtilizationPercent,
      heapUsedBytes: usage.heapUsed,
      heapTotalBytes: usage.heapTotal,
      heapLimitBytes,
      rssBytes: isUsableNumber(usage.rss) ? usage.rss : 0,
      externalBytes: isUsableNumber(usage.external) ? usage.external : 0,
      arrayBuffersBytes: isUsableNumber(usage.arrayBuffers) ? usage.arrayBuffers : 0,
      level: levelFor(heapHeadroomUsedPercent),
    };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * True only when memory pressure is severe enough that the process cannot be
 * expected to keep serving traffic safely (imminent heap exhaustion).
 *
 * An unavailable snapshot is never exhausted — we do not fail a service because
 * we failed to measure it.
 */
export function isMemoryExhausted(snapshot: MemoryPressureSnapshot): boolean {
  return snapshot.available && snapshot.level === "CRITICAL";
}

/**
 * True when pressure warrants operator attention but the service is still
 * serving correctly. Warning-level pressure must not change HTTP status.
 */
export function isMemoryWarning(snapshot: MemoryPressureSnapshot): boolean {
  return snapshot.available && snapshot.level === "HIGH";
}

export function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
