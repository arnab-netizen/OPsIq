import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/signup/route";

// Build a signup request with an intentionally-invalid body so the request
// fails fast at validation (no DB writes). The rate limiter runs BEFORE
// validation, so flooding still trips it without creating users.
function makeReq(ip?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}

async function statusOrThrow(req: Request): Promise<number | "threw"> {
  try {
    const res = await POST(req as never);
    return res.status;
  } catch {
    // BadRequestError/ConflictError thrown by the handler for invalid bodies.
    return "threw";
  }
}

describe("signup route rate limiting", () => {
  it("returns 429 once a single client IP floods the signup endpoint", async () => {
    const ip = "203.0.113.99"; // TEST-NET-3, unique to this test
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const result = await statusOrThrow(makeReq(ip));
      if (result === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  });

  it("does not rate limit requests without a client IP (test/CI traffic)", async () => {
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      const result = await statusOrThrow(makeReq(undefined));
      if (result === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(false);
  });
});
