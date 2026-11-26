import { describe, expect, it } from "vitest";
import { createNeonUsageModule } from "@/lib/daily-report/sources/neon-usage";
import type { SourceContext } from "@/lib/daily-report/types";

const WINDOW = { start: "2026-11-16T00:00:00.000Z", end: "2026-11-17T00:00:00.000Z" };
const NOW = () => new Date("2026-11-17T00:00:00.000Z");

function ctx(env: Record<string, string | undefined>): SourceContext {
  return { window: WINDOW, now: NOW, env };
}
function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

describe("neon-usage", () => {
  it("reports BLOCKED when NEON_API_KEY is absent (the real state of this sandbox)", async () => {
    const mod = createNeonUsageModule();
    const report = await mod.run(ctx({}));
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/NEON_API_KEY/);
  });

  it("reports BLOCKED when NEON_PROJECT_ID is absent", async () => {
    const mod = createNeonUsageModule();
    const report = await mod.run(ctx({ NEON_API_KEY: "key" }));
    expect(report.metrics[0].status).toBe("BLOCKED");
    expect(report.metrics[0].detail).toMatch(/NEON_PROJECT_ID/);
  });

  it("reports VERIFIED with real consumption numbers", async () => {
    const mod = createNeonUsageModule({
      fetchImpl: async () =>
        jsonResponse(200, {
          projects: [
            {
              project_id: "proj_1",
              periods: [{ period_id: "p1", consumption: [{ compute_time_seconds: 120, written_data_bytes: 4096 }] }],
            },
          ],
        }),
    });
    const report = await mod.run(ctx({ NEON_API_KEY: "key", NEON_PROJECT_ID: "proj_1" }));
    expect(report.metrics[0].status).toBe("VERIFIED");
    expect(report.metrics[0].value).toMatchObject({ computeTimeSeconds: 120, writtenDataBytes: 4096 });
  });

  it("reports CONFIRMED_ZERO for a genuine zero-usage project", async () => {
    const mod = createNeonUsageModule({
      fetchImpl: async () =>
        jsonResponse(200, {
          projects: [{ project_id: "proj_1", periods: [{ period_id: "p1", consumption: [{ compute_time_seconds: 0, written_data_bytes: 0 }] }] }],
        }),
    });
    const report = await mod.run(ctx({ NEON_API_KEY: "key", NEON_PROJECT_ID: "proj_1" }));
    expect(report.metrics[0].status).toBe("CONFIRMED_ZERO");
  });

  it("reports UNAVAILABLE when the project is missing from the response", async () => {
    const mod = createNeonUsageModule({ fetchImpl: async () => jsonResponse(200, { projects: [] }) });
    const report = await mod.run(ctx({ NEON_API_KEY: "key", NEON_PROJECT_ID: "proj_1" }));
    expect(report.metrics[0].status).toBe("UNAVAILABLE");
  });

  it("reports FAILED on an HTTP error", async () => {
    const mod = createNeonUsageModule({ fetchImpl: async () => jsonResponse(401, { message: "unauthorized" }) });
    const report = await mod.run(ctx({ NEON_API_KEY: "bad-key", NEON_PROJECT_ID: "proj_1" }));
    expect(report.metrics[0].status).toBe("FAILED");
    expect(report.metrics[0].detail).toMatch(/401/);
  });

  it("reports FAILED on a network error, never throwing", async () => {
    const mod = createNeonUsageModule({
      fetchImpl: async () => {
        throw new Error("timeout");
      },
    });
    const report = await mod.run(ctx({ NEON_API_KEY: "key", NEON_PROJECT_ID: "proj_1" }));
    expect(report.metrics[0].status).toBe("FAILED");
  });
});
