/**
 * Memory pressure metric — unit contract.
 *
 * Root cause under test: memory health was derived from heapUsed/heapTotal,
 * which measures committed-heap packing rather than headroom. It reads 90%+ on
 * healthy processes and forced /api/health to 503 in production.
 *
 * These tests pin the corrected contract: saturation is heapUsed against V8's
 * reported heap_size_limit, thresholds are applied to that value, and
 * unmeasurable metrics fail safe rather than reporting exhaustion.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import v8 from "node:v8";
import {
  MEMORY_PRESSURE_THRESHOLDS,
  bytesToMb,
  getMemoryPressure,
  isMemoryExhausted,
  isMemoryWarning,
} from "@/infra/memory-pressure";

const MB = 1024 * 1024;

/** Force a specific heapUsed / heap_size_limit ratio. */
function stubMemory(opts: {
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  rss?: number;
  external?: number;
  arrayBuffers?: number;
}) {
  vi.spyOn(process, "memoryUsage").mockReturnValue({
    heapUsed: opts.heapUsed,
    heapTotal: opts.heapTotal,
    rss: opts.rss ?? 200 * MB,
    external: opts.external ?? 3 * MB,
    arrayBuffers: opts.arrayBuffers ?? 1 * MB,
  } as NodeJS.MemoryUsage);
  vi.spyOn(v8, "getHeapStatistics").mockReturnValue({
    heap_size_limit: opts.heapLimit,
  } as ReturnType<typeof v8.getHeapStatistics>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getMemoryPressure — saturation is measured against the V8 heap limit", () => {
  it("(2) reports LOW when committed-heap packing is high but real headroom is ample", () => {
    // heapUsed/heapTotal = 98% (the old metric would call this unhealthy)
    // heapUsed/heap_size_limit = 2.45% (actual pressure is negligible)
    stubMemory({ heapUsed: 49 * MB, heapTotal: 50 * MB, heapLimit: 2000 * MB });

    const snapshot = getMemoryPressure();

    expect(snapshot.available).toBe(true);
    expect(snapshot.heapUtilizationPercent).toBeCloseTo(98, 0);
    expect(snapshot.heapHeadroomUsedPercent).toBeCloseTo(2.45, 1);
    expect(snapshot.level).toBe("LOW");
    expect(isMemoryExhausted(snapshot)).toBe(false);
    expect(isMemoryWarning(snapshot)).toBe(false);
  });

  it("(3) reports CRITICAL on genuine heap exhaustion", () => {
    stubMemory({ heapUsed: 1940 * MB, heapTotal: 1950 * MB, heapLimit: 2000 * MB });

    const snapshot = getMemoryPressure();

    expect(snapshot.heapHeadroomUsedPercent).toBeGreaterThanOrEqual(
      MEMORY_PRESSURE_THRESHOLDS.CRITICAL
    );
    expect(snapshot.level).toBe("CRITICAL");
    expect(isMemoryExhausted(snapshot)).toBe(true);
  });

  it("(4) distinguishes warning-level pressure from exhaustion", () => {
    stubMemory({ heapUsed: 1760 * MB, heapTotal: 1800 * MB, heapLimit: 2000 * MB });

    const snapshot = getMemoryPressure();

    expect(snapshot.level).toBe("HIGH");
    expect(isMemoryWarning(snapshot)).toBe(true);
    expect(isMemoryExhausted(snapshot)).toBe(false);
  });

  it("(9) applies thresholds at their exact boundaries", () => {
    const limit = 1000 * MB;
    const at = (pct: number) => {
      stubMemory({ heapUsed: (limit * pct) / 100, heapTotal: limit, heapLimit: limit });
      return getMemoryPressure().level;
    };

    expect(at(MEMORY_PRESSURE_THRESHOLDS.MEDIUM - 0.01)).toBe("LOW");
    expect(at(MEMORY_PRESSURE_THRESHOLDS.MEDIUM)).toBe("MEDIUM");
    expect(at(MEMORY_PRESSURE_THRESHOLDS.HIGH - 0.01)).toBe("MEDIUM");
    expect(at(MEMORY_PRESSURE_THRESHOLDS.HIGH)).toBe("HIGH");
    expect(at(MEMORY_PRESSURE_THRESHOLDS.CRITICAL - 0.01)).toBe("HIGH");
    expect(at(MEMORY_PRESSURE_THRESHOLDS.CRITICAL)).toBe("CRITICAL");
  });

  it("(6) preserves diagnostic fields alongside the saturation metric", () => {
    stubMemory({
      heapUsed: 40 * MB,
      heapTotal: 50 * MB,
      heapLimit: 2000 * MB,
      rss: 180 * MB,
      external: 7 * MB,
      arrayBuffers: 2 * MB,
    });

    const snapshot = getMemoryPressure();

    expect(snapshot.heapUsedBytes).toBe(40 * MB);
    expect(snapshot.heapTotalBytes).toBe(50 * MB);
    expect(snapshot.heapLimitBytes).toBe(2000 * MB);
    expect(snapshot.rssBytes).toBe(180 * MB);
    expect(snapshot.externalBytes).toBe(7 * MB);
    expect(snapshot.arrayBuffersBytes).toBe(2 * MB);
    expect(snapshot.heapUtilizationPercent).toBeCloseTo(80, 0);
  });
});

describe("(8) malformed or unavailable metrics fail safe", () => {
  it("returns unavailable, non-exhausted when heap statistics are missing", () => {
    vi.spyOn(process, "memoryUsage").mockReturnValue({
      heapUsed: 10 * MB,
      heapTotal: 20 * MB,
      rss: 50 * MB,
      external: 0,
      arrayBuffers: 0,
    } as NodeJS.MemoryUsage);
    vi.spyOn(v8, "getHeapStatistics").mockReturnValue(
      {} as ReturnType<typeof v8.getHeapStatistics>
    );

    const snapshot = getMemoryPressure();

    expect(snapshot.available).toBe(false);
    expect(snapshot.level).toBe("LOW");
    expect(isMemoryExhausted(snapshot)).toBe(false);
  });

  it("returns unavailable when heap limit is zero (no valid denominator)", () => {
    stubMemory({ heapUsed: 10 * MB, heapTotal: 20 * MB, heapLimit: 0 });

    const snapshot = getMemoryPressure();

    expect(snapshot.available).toBe(false);
    expect(isMemoryExhausted(snapshot)).toBe(false);
  });

  it("returns unavailable on NaN / negative / non-numeric readings", () => {
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      vi.restoreAllMocks();
      stubMemory({ heapUsed: bad, heapTotal: 20 * MB, heapLimit: 2000 * MB });
      const snapshot = getMemoryPressure();
      expect(snapshot.available).toBe(false);
      expect(isMemoryExhausted(snapshot)).toBe(false);
    }
  });

  it("never throws when process.memoryUsage itself throws", () => {
    vi.spyOn(process, "memoryUsage").mockImplementation(() => {
      throw new Error("unsupported platform");
    });

    expect(() => getMemoryPressure()).not.toThrow();
    expect(getMemoryPressure().available).toBe(false);
  });
});

describe("real runtime sanity", () => {
  it("(1) a healthy test process is not reported as exhausted", () => {
    const snapshot = getMemoryPressure();

    expect(snapshot.available).toBe(true);
    expect(snapshot.heapLimitBytes).toBeGreaterThan(0);
    // A test worker consumes a tiny fraction of the V8 limit.
    expect(snapshot.heapHeadroomUsedPercent).toBeLessThan(
      MEMORY_PRESSURE_THRESHOLDS.CRITICAL
    );
    expect(isMemoryExhausted(snapshot)).toBe(false);
  });

  it("bytesToMb rounds to one decimal", () => {
    expect(bytesToMb(1536 * 1024)).toBe(1.5);
    expect(bytesToMb(0)).toBe(0);
  });
});
