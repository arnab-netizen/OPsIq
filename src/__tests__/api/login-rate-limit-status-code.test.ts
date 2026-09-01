/**
 * Regression test: exceeding the login rate limit must return HTTP 429 with a
 * retryable, generic body -- not the bare 500 "Login failed" response the
 * route fell through to before RateLimitError was special-cased (matching
 * the RateLimitError -> 429 handling already established in the signup and
 * forgot-password routes; see src/app/api/auth/signup/route.ts and
 * src/app/api/auth/forgot-password/route.ts).
 *
 * Root cause: POST /api/auth/login's catch-all only special-cased
 * UnauthorizedError; RateLimitError (thrown by requireRateLimit before any
 * DB access) fell through to the generic 500 branch, which is the wrong HTTP
 * status for a rate-limit response and additionally exposed internal
 * "classification"/"stage" pipeline-stage strings to an unauthenticated
 * public caller on every login error, not only rate-limit ones.
 */
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/login/route";

function makeReq(email: string, ip?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: "definitely-wrong-password" }),
  });
}

describe("login route rate limiting (status code)", () => {
  it("[db] returns 429 (not 500) once the login rate limit is exceeded for one IP+email pair", async () => {
    const ip = "203.0.113.201"; // TEST-NET-3, unique to this test
    const email = "login-rate-limit-status-code@example.com";

    let sawStatus: number | null = null;
    for (let i = 0; i < 15; i++) {
      const res = await POST(makeReq(email, ip) as never);
      if (res.status === 429) {
        sawStatus = res.status;
        const body = await res.json();
        expect(body.error).not.toMatch(/internal server error/i);
        expect(body).not.toHaveProperty("stage");
        expect(res.headers.get("retry-after")).toBeTruthy();
        break;
      }
      // Every attempt before the limiter trips must be a normal auth
      // rejection (401), never the bare 500 fallback this test guards
      // against.
      expect(res.status).not.toBe(500);
    }
    expect(sawStatus).toBe(429);
  });

  it("[db] a fresh distinct IP+email pair is not immediately rate-limited", async () => {
    const res = await POST(
      makeReq("login-rate-limit-fresh@example.com", "198.51.100.201") as never
    );
    expect(res.status).not.toBe(429);
    expect(res.status).not.toBe(500);
  });
});
