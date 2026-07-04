/**
 * Internal reassessment-scan route — authorization + wiring proof (M8 / Wave 9 runtime-readiness).
 *
 * The due-scanner mutates governed state across workspaces, so the endpoint MUST fail closed: disabled unless a strong
 * `SCHEDULER_INTERNAL_TOKEN` is configured, and it rejects a missing / wrong / short-token request. No hardcoded
 * credential. Wave 9 additionally proves the AUTHORIZED half the external trigger relies on: a correctly-tokened caller
 * gets 200 and the route actually invokes the scanner and returns its result (the scan BEHAVIOUR is DB-proven
 * separately in due-reassessment.service.db.test.ts — mocked here so this route test does not invoke the global
 * scanner against a shared DB).
 */
import { describe, it, expect, afterEach, vi } from "vitest";

const scanMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/owner-budget/due-reassessment.service", () => ({
  scanDueReassessments: scanMock,
}));

import { POST } from "@/app/api/internal/reassessment-scan/route";

const ORIGINAL = process.env.SCHEDULER_INTERNAL_TOKEN;
const STRONG_TOKEN = "a-strong-scheduler-token-value";
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SCHEDULER_INTERNAL_TOKEN;
  else process.env.SCHEDULER_INTERNAL_TOKEN = ORIGINAL;
  vi.restoreAllMocks();
  scanMock.mockReset();
});

function post(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/internal/reassessment-scan", { method: "POST", headers });
}

describe("[unit] internal reassessment-scan route auth (fail-closed)", () => {
  it("returns 401 when no token is configured (endpoint disabled)", async () => {
    delete process.env.SCHEDULER_INTERNAL_TOKEN;
    const res = await POST(post({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
    expect(scanMock).not.toHaveBeenCalled(); // never reaches the scanner
  });

  it("returns 401 when the configured token is too short to be safe", async () => {
    process.env.SCHEDULER_INTERNAL_TOKEN = "short";
    const res = await POST(post({ authorization: "Bearer short" }));
    expect(res.status).toBe(401);
    expect(scanMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a missing or wrong bearer token", async () => {
    process.env.SCHEDULER_INTERNAL_TOKEN = STRONG_TOKEN;
    expect((await POST(post())).status).toBe(401); // no header
    expect((await POST(post({ authorization: "Bearer wrong-token-value-here!!" }))).status).toBe(401);
    expect(scanMock).not.toHaveBeenCalled();
  });
});

describe("[unit] internal reassessment-scan route authorized happy-path (Wave 9)", () => {
  it("returns 200 and invokes the scanner exactly once with the right bearer token", async () => {
    process.env.SCHEDULER_INTERNAL_TOKEN = STRONG_TOKEN;
    scanMock.mockResolvedValue({ scanned: 2, reassessed: 1, skipped: 1, businesses: [{ businessId: "b1", ok: true }] });

    const res = await POST(post({ authorization: `Bearer ${STRONG_TOKEN}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; scanned: number; reassessed: number };
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(2);
    expect(body.reassessed).toBe(1);
    expect(scanMock).toHaveBeenCalledTimes(1);
    // The route drives the scanner with a real Date (the scan's own logic buckets it per UTC day).
    expect(scanMock.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it("surfaces a governed 500 (not a raw error) if the scanner throws, without leaking internals", async () => {
    process.env.SCHEDULER_INTERNAL_TOKEN = STRONG_TOKEN;
    scanMock.mockRejectedValue(new Error("db exploded with secret connection string"));

    const res = await POST(post({ authorization: `Bearer ${STRONG_TOKEN}` }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).not.toContain("secret connection string"); // operator-safe, no raw leak
  });
});
