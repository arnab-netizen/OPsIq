import { describe, expect, it } from "vitest";
import { createSearchConsoleStubModule, SEARCH_CONSOLE_BLOCKED_REASON } from "@/lib/daily-report/sources/search-console-stub";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T00:00:00.000Z");

describe("google-search-console stub", () => {
  it("always reports BLOCKED with reason 'no credential configured', regardless of env", async () => {
    const mod = createSearchConsoleStubModule();
    for (const env of [{}, { GOOGLE_SEARCH_CONSOLE_KEY: "something" }, { GSC_API_KEY: "x", GSC_SITE_URL: "https://opsiq.example" }]) {
      const report = await mod.run({ window: WINDOW, now: NOW, env });
      expect(report.metrics).toHaveLength(1);
      expect(report.metrics[0].status).toBe("BLOCKED");
      expect(report.metrics[0].detail).toBe(SEARCH_CONSOLE_BLOCKED_REASON);
      expect(report.metrics[0].value).toBeNull();
    }
  });

  it("never throws and always produces exactly one metric with full provenance", async () => {
    const mod = createSearchConsoleStubModule();
    const ctx: SourceContext = { window: WINDOW, now: NOW, env: {} };
    const report = await mod.run(ctx);
    expect(report.moduleError).toBeNull();
    const [metric] = report.metrics;
    expect(metric.source).toBe("google-search-console");
    expect(metric.window).toEqual(WINDOW);
    expect(typeof metric.retrievedAt).toBe("string");
  });
});
