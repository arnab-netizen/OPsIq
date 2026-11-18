import { describe, expect, it } from "vitest";
import { createInternalRecordsModule, type InternalRecordsQueries } from "@/lib/daily-report/sources/internal-records";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T00:00:00.000Z");

function ctx(env: Record<string, string | undefined>): SourceContext {
  return { window: WINDOW, now: NOW, env };
}

function metricByName(metrics: readonly { name: string }[], name: string) {
  return metrics.find((m) => m.name === name)!;
}

describe("internal-records (signup/activation/revenue)", () => {
  it("reports BLOCKED for all three metrics when DATABASE_URL is absent (the real state of this sandbox) -- no query is attempted", async () => {
    const queries: InternalRecordsQueries = {
      countSignupsInWindow: async () => {
        throw new Error("should never be called");
      },
      countActivationsInWindow: async () => {
        throw new Error("should never be called");
      },
      sumActiveMonthlyRevenue: async () => {
        throw new Error("should never be called");
      },
    };
    // Note: no `queries` override is passed to createInternalRecordsModule here on purpose --
    // this proves the module's OWN DATABASE_URL gate blocks before any query object is touched.
    const mod = createInternalRecordsModule();
    const report = await mod.run(ctx({}));
    expect(report.metrics).toHaveLength(3);
    for (const m of report.metrics) {
      expect(m.status).toBe("BLOCKED");
      expect(m.detail).toMatch(/DATABASE_URL/);
    }
    void queries; // referenced only to document intent above
  });

  it("reports VERIFIED/CONFIRMED_ZERO per-metric against fixture query data", async () => {
    const queries: InternalRecordsQueries = {
      countSignupsInWindow: async () => 7,
      countActivationsInWindow: async () => 0,
      sumActiveMonthlyRevenue: async () => 1999.5,
    };
    const mod = createInternalRecordsModule({ queries });
    const report = await mod.run(ctx({ DATABASE_URL: "postgresql://irrelevant" }));

    expect(metricByName(report.metrics, "signups").status).toBe("VERIFIED");
    expect(metricByName(report.metrics, "signups").value).toBe(7);

    expect(metricByName(report.metrics, "activations").status).toBe("CONFIRMED_ZERO");
    expect(metricByName(report.metrics, "activations").value).toBe(0);

    expect(metricByName(report.metrics, "revenue").status).toBe("VERIFIED");
    expect(metricByName(report.metrics, "revenue").value).toBe(1999.5);
  });

  it("reports CONFIRMED_ZERO for a genuine zero-signup day, not BLOCKED/UNAVAILABLE", async () => {
    const queries: InternalRecordsQueries = {
      countSignupsInWindow: async () => 0,
      countActivationsInWindow: async () => 0,
      sumActiveMonthlyRevenue: async () => 0,
    };
    const mod = createInternalRecordsModule({ queries });
    const report = await mod.run(ctx({ DATABASE_URL: "postgresql://irrelevant" }));
    for (const m of report.metrics) expect(m.status).toBe("CONFIRMED_ZERO");
  });

  it("reports FAILED, not a thrown error, when an individual query rejects", async () => {
    const queries: InternalRecordsQueries = {
      countSignupsInWindow: async () => {
        throw new Error("connection reset");
      },
      countActivationsInWindow: async () => 3,
      sumActiveMonthlyRevenue: async () => 500,
    };
    const mod = createInternalRecordsModule({ queries });
    const report = await mod.run(ctx({ DATABASE_URL: "postgresql://irrelevant" }));
    expect(report.moduleError).toBeNull();
    expect(metricByName(report.metrics, "signups").status).toBe("FAILED");
    expect(metricByName(report.metrics, "signups").detail).toMatch(/connection reset/);
    // One failing query does not block the others within the same module.
    expect(metricByName(report.metrics, "activations").status).toBe("VERIFIED");
    expect(metricByName(report.metrics, "revenue").status).toBe("VERIFIED");
  });
});
