/**
 * Internal reassessment-scan route — authorization proof (M8 runtime-readiness).
 *
 * The due-scanner mutates governed state across workspaces, so the endpoint MUST fail closed: disabled unless a strong
 * `SCHEDULER_INTERNAL_TOKEN` is configured, and rejects a missing / wrong / short-token request. No hardcoded
 * credential. (The scan behaviour itself is proven DB-backed in due-reassessment.service.db.test.ts.)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { POST } from "@/app/api/internal/reassessment-scan/route";

const ORIGINAL = process.env.SCHEDULER_INTERNAL_TOKEN;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SCHEDULER_INTERNAL_TOKEN;
  else process.env.SCHEDULER_INTERNAL_TOKEN = ORIGINAL;
  vi.restoreAllMocks();
});

function post(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/internal/reassessment-scan", { method: "POST", headers });
}

describe("[unit] internal reassessment-scan route auth (fail-closed)", () => {
  it("returns 401 when no token is configured (endpoint disabled)", async () => {
    delete process.env.SCHEDULER_INTERNAL_TOKEN;
    const res = await POST(post({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the configured token is too short to be safe", async () => {
    process.env.SCHEDULER_INTERNAL_TOKEN = "short";
    const res = await POST(post({ authorization: "Bearer short" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a missing or wrong bearer token", async () => {
    process.env.SCHEDULER_INTERNAL_TOKEN = "a-strong-scheduler-token-value";
    expect((await POST(post())).status).toBe(401); // no header
    expect((await POST(post({ authorization: "Bearer wrong-token-value-here!!" }))).status).toBe(401);
  });
});
