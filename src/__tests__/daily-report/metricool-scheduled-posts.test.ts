import { describe, expect, it } from "vitest";
import { createMetricoolModule } from "@/lib/daily-report/sources/metricool-scheduled-posts";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T00:00:00.000Z");

function ctx(env: Record<string, string | undefined>): SourceContext {
  return { window: WINDOW, now: NOW, env };
}
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

const CREDS = { METRICOOL_API_TOKEN: "tok", METRICOOL_BLOG_ID: "blog_1", METRICOOL_USER_ID: "user_1" };

describe("metricool-scheduled-posts", () => {
  it("reports BLOCKED when no credential is configured (the real state of this sandbox; no Metricool integration exists yet)", async () => {
    const mod = createMetricoolModule();
    const report = await mod.run(ctx({}));
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/METRICOOL_API_TOKEN/);
  });

  it("reports BLOCKED listing every missing credential when partially configured", async () => {
    const mod = createMetricoolModule();
    const report = await mod.run(ctx({ METRICOOL_API_TOKEN: "tok" }));
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/METRICOOL_BLOG_ID/);
    expect(report.metrics[0].detail).toMatch(/METRICOOL_USER_ID/);
  });

  it("reports VERIFIED when real failed posts exist", async () => {
    const mod = createMetricoolModule({
      fetchImpl: async () => jsonResponse(200, [{ id: 1, status: "PUBLISHED" }, { id: 2, status: "ERROR" }, { id: 3, status: "error" }]),
    });
    const report = await mod.run(ctx(CREDS));
    expect(report.metrics[0].status).toBe("VERIFIED");
    expect(report.metrics[0].value).toMatchObject({ totalScheduled: 3, failures: 2 });
  });

  it("reports CONFIRMED_ZERO when the list is fetched successfully with zero failures", async () => {
    const mod = createMetricoolModule({ fetchImpl: async () => jsonResponse(200, [{ id: 1, status: "PUBLISHED" }, { id: 2, status: "SCHEDULED" }]) });
    const report = await mod.run(ctx(CREDS));
    expect(report.metrics[0].status).toBe("CONFIRMED_ZERO");
    expect(report.metrics[0].value).toMatchObject({ failures: 0 });
  });

  it("reports FAILED on an HTTP error", async () => {
    const mod = createMetricoolModule({ fetchImpl: async () => jsonResponse(403, { message: "forbidden" }) });
    const report = await mod.run(ctx(CREDS));
    expect(report.metrics[0].status).toBe("FAILED");
  });

  it("reports FAILED for a malformed (non-array) body, never throwing", async () => {
    const mod = createMetricoolModule({ fetchImpl: async () => jsonResponse(200, { unexpected: true }) });
    const report = await mod.run(ctx(CREDS));
    expect(report.metrics[0].status).toBe("FAILED");
  });

  it("reports FAILED on a network error, never throwing", async () => {
    const mod = createMetricoolModule({
      fetchImpl: async () => {
        throw new Error("DNS failure");
      },
    });
    const report = await mod.run(ctx(CREDS));
    expect(report.metrics[0].status).toBe("FAILED");
  });
});
