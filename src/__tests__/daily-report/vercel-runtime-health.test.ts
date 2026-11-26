import { describe, expect, it } from "vitest";
import { createVercelRuntimeHealthModule } from "@/lib/daily-report/sources/vercel-runtime-health";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T00:00:00.000Z");

function ctx(env: Record<string, string | undefined>): SourceContext {
  return { window: WINDOW, now: NOW, env };
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("vercel-runtime-health", () => {
  it("reports BLOCKED when VERCEL_TOKEN is absent (the real state of this sandbox)", async () => {
    const mod = createVercelRuntimeHealthModule();
    const report = await mod.run(ctx({}));
    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/VERCEL_TOKEN/);
    expect(report.moduleError).toBeNull();
  });

  it("reports BLOCKED when VERCEL_PROJECT_ID is absent", async () => {
    const mod = createVercelRuntimeHealthModule();
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok" }));
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/VERCEL_PROJECT_ID/);
  });

  it("reports VERIFIED for a fresh, ready deployment", async () => {
    const mod = createVercelRuntimeHealthModule({
      fetchImpl: async () =>
        jsonResponse(200, { deployments: [{ uid: "dpl_1", readyState: "READY", createdAt: NOW().getTime() - 60_000, meta: { githubCommitSha: "abc123" } }] }),
    });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("VERIFIED");
    expect(report.metrics[0].value).toMatchObject({ state: "READY", commitSha: "abc123" });
  });

  it("reports STALE for a deployment older than the freshness bound", async () => {
    const mod = createVercelRuntimeHealthModule({
      staleAfterMs: 1000,
      fetchImpl: async () => jsonResponse(200, { deployments: [{ uid: "dpl_old", readyState: "READY", createdAt: NOW().getTime() - 60_000 }] }),
    });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("STALE");
  });

  it("reports UNAVAILABLE when zero deployments are returned", async () => {
    const mod = createVercelRuntimeHealthModule({ fetchImpl: async () => jsonResponse(200, { deployments: [] }) });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("UNAVAILABLE");
  });

  it("reports FAILED on an HTTP error status", async () => {
    const mod = createVercelRuntimeHealthModule({ fetchImpl: async () => jsonResponse(500, { error: "boom" }) });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("FAILED");
    expect(report.metrics[0].detail).toMatch(/500/);
  });

  it("reports FAILED on a network error, never throwing", async () => {
    const mod = createVercelRuntimeHealthModule({
      fetchImpl: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    const report = await mod.run(ctx({ VERCEL_TOKEN: "tok", VERCEL_PROJECT_ID: "prj_1" }));
    expect(report.metrics[0].status).toBe("FAILED");
  });

  it("every metric carries source, window, retrievedAt and status", async () => {
    const mod = createVercelRuntimeHealthModule();
    const report = await mod.run(ctx({}));
    for (const m of report.metrics) {
      expect(m.source).toBe("vercel-runtime-health");
      expect(m.window).toEqual(WINDOW);
      expect(typeof m.retrievedAt).toBe("string");
      expect(m.detail.length).toBeGreaterThan(0);
    }
  });
});
