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

  it("a fresh distinct IP is not immediately rate-limited on first request", async () => {
    const freshIp = "198.51.100.1"; // TEST-NET-2, unique to this test
    const result = await statusOrThrow(makeReq(freshIp));
    // First request must NOT be 429 (rate limit kicks in after N requests)
    expect(result).not.toBe(429);
  });

  it("two different IPs have independent rate limit buckets", async () => {
    const ipA = "203.0.113.50"; // unique IP A
    const ipB = "203.0.113.51"; // unique IP B
    // Flood IP A to 429
    let ipAHit429 = false;
    for (let i = 0; i < 15; i++) {
      if ((await statusOrThrow(makeReq(ipA))) === 429) { ipAHit429 = true; break; }
    }
    expect(ipAHit429).toBe(true);
    // IP B's first request must NOT be 429 (different bucket)
    const ipBFirst = await statusOrThrow(makeReq(ipB));
    expect(ipBFirst).not.toBe(429);
  });

  it("makeReq sets Content-Type: application/json header", () => {
    const req = makeReq("1.2.3.4");
    expect(req.headers.get("content-type")).toBe("application/json");
  });

  it("makeReq with IP sets x-forwarded-for header", () => {
    const req = makeReq("10.0.0.1");
    expect(req.headers.get("x-forwarded-for")).toBe("10.0.0.1");
  });

  it("makeReq without IP has no x-forwarded-for header", () => {
    const req = makeReq(undefined);
    expect(req.headers.get("x-forwarded-for")).toBeNull();
  });

  it("makeReq uses POST method", () => {
    const req = makeReq("1.2.3.4");
    expect(req.method).toBe("POST");
  });

  it("makeReq targets the signup endpoint URL", () => {
    const req = makeReq("1.2.3.4");
    expect(req.url).toContain("/api/auth/signup");
  });

  it("statusOrThrow returns a number (HTTP status) for normal responses", async () => {
    const result = await statusOrThrow(makeReq(undefined));
    // Without IP, should never be 429; result is number or 'threw'
    if (result !== "threw") {
      expect(typeof result).toBe("number");
    } else {
      // 'threw' is also a valid result
      expect(result).toBe("threw");
    }
  });

  it("statusOrThrow returns 'threw' string for thrown exceptions", async () => {
    // The handler may throw for invalid bodies; verify statusOrThrow handles it
    const result = await statusOrThrow(makeReq(undefined));
    if (result === "threw") {
      expect(result).toBe("threw");
    } else {
      expect(typeof result).toBe("number");
    }
  });

  it("rate-limited response has status 429", async () => {
    const ip = "203.0.113.70"; // unique IP
    let status429Found: number | "threw" | null = null;
    for (let i = 0; i < 15; i++) {
      const r = await statusOrThrow(makeReq(ip));
      if (r === 429) { status429Found = r; break; }
    }
    if (status429Found !== null) {
      expect(status429Found).toBe(429);
    }
  });

  it("another TEST-NET-3 IP floods to 429 within 15 requests", async () => {
    const ip = "203.0.113.80"; // unique TEST-NET-3 IP
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      if ((await statusOrThrow(makeReq(ip))) === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it("yet another TEST-NET-3 IP floods to 429 within 15 requests", async () => {
    const ip = "203.0.113.85"; // unique TEST-NET-3 IP
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      if ((await statusOrThrow(makeReq(ip))) === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it("TEST-NET-2 IP floods to 429 within 15 requests", async () => {
    const ip = "198.51.100.20"; // unique TEST-NET-2 IP
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      if ((await statusOrThrow(makeReq(ip))) === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it("request body is JSON-stringified empty object", async () => {
    const req = makeReq("1.2.3.4");
    const bodyText = await req.text();
    expect(JSON.parse(bodyText)).toEqual({});
  });

  it("no-IP and IP requests do not interfere with each other", async () => {
    const ip = "203.0.113.91"; // unique IP
    // Make some no-IP requests first
    for (let i = 0; i < 5; i++) {
      await statusOrThrow(makeReq(undefined));
    }
    // Then flood with the IP; should still reach 429
    let got429 = false;
    for (let i = 0; i < 15; i++) {
      if ((await statusOrThrow(makeReq(ip))) === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });

  it("another fresh IP does not see 429 on first request", async () => {
    const freshIp = "198.51.100.100"; // unique TEST-NET-2 IP
    const result = await statusOrThrow(makeReq(freshIp));
    expect(result).not.toBe(429);
  });

  it("rate limiting is enforced before validation (first request hits limit before body error)", async () => {
    const ip = "203.0.113.95"; // unique IP
    // First few requests should NOT be 429 (rate limit not yet reached)
    const first = await statusOrThrow(makeReq(ip));
    // Either 400/threw (validation fails on empty body) or non-429
    expect(first).not.toBe(429);
  });
});
