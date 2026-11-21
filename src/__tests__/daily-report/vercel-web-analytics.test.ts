import { describe, expect, it } from "vitest";
import { createVercelWebAnalyticsModule, WEB_ANALYTICS_VISITS_COUNT_PATH } from "@/lib/daily-report/sources/vercel-web-analytics";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T00:00:00.000Z");

function ctx(env: Record<string, string | undefined>): SourceContext {
  return { window: WINDOW, now: NOW, env };
}
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("vercel-web-analytics", () => {
  it("reports BLOCKED when no credential is configured (the real state of this sandbox)", async () => {
    const mod = createVercelWebAnalyticsModule();
    const report = await mod.run(ctx({}));
    expect(report.metrics[0].status).toBe("BLOCKED");
  });

  it("reports UNAVAILABLE -- never a fabricated zero -- for the documented, known-broken 404", async () => {
    const mod = createVercelWebAnalyticsModule({ fetchImpl: async () => jsonResponse(404, { error: { code: "not_found" } }) });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("UNAVAILABLE");
    expect(report.metrics[0].value).toBeNull();
    expect(report.metrics[0].detail).toMatch(/404/);
    expect(report.metrics[0].detail).toContain(WEB_ANALYTICS_VISITS_COUNT_PATH);
  });

  it("reports VERIFIED once the endpoint is fixed and returns a real positive count", async () => {
    const mod = createVercelWebAnalyticsModule({ fetchImpl: async () => jsonResponse(200, { total: 42 }) });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("VERIFIED");
    expect(report.metrics[0].value).toEqual({ visits: 42 });
  });

  it("reports CONFIRMED_ZERO for a genuine, successfully-retrieved zero (distinct from UNAVAILABLE)", async () => {
    const mod = createVercelWebAnalyticsModule({ fetchImpl: async () => jsonResponse(200, { total: 0 }) });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("CONFIRMED_ZERO");
  });

  it("sends Vercel's documented since/until parameters (never from/to) plus projectId and teamId", async () => {
    let captured = "";
    const mod = createVercelWebAnalyticsModule({
      fetchImpl: async (url) => {
        captured = String(url);
        return jsonResponse(200, { total: 1 });
      },
    });
    await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1", VERCEL_TEAM_ID: "team_1" }));
    const q = new URL(captured).searchParams;
    expect(new URL(captured).pathname).toBe(WEB_ANALYTICS_VISITS_COUNT_PATH);
    expect(q.get("since")).toBe(WINDOW.start);
    expect(q.get("until")).toBe(WINDOW.end);
    expect(q.get("projectId")).toBe("prj_1");
    expect(q.get("teamId")).toBe("team_1");
    expect(q.has("from")).toBe(false);
    expect(q.has("to")).toBe(false);
  });

  it("reports FAILED for a non-404 HTTP error", async () => {
    const mod = createVercelWebAnalyticsModule({ fetchImpl: async () => jsonResponse(500, { error: "boom" }) });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("FAILED");
  });

  it("reports FAILED on a network error, never throwing", async () => {
    const mod = createVercelWebAnalyticsModule({
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("FAILED");
  });
});
