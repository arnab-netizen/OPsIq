import { describe, it, expect, vi, afterEach } from "vitest";
import {
  categorizeError,
  captureError,
  scrubEvent,
  type ObservabilityCategory,
} from "@/infra/observability";

function named(name: string, message: string): Error {
  const e = new Error(message);
  Object.defineProperty(e, "name", { value: name });
  return e;
}

describe("observability — module contract assertions", () => {
  it("categorizeError is a function", () => {
    expect(typeof categorizeError).toBe("function");
  });
  it("captureError is a function", () => {
    expect(typeof captureError).toBe("function");
  });
  it("named() returns an Error instance", () => {
    expect(named("ZodError", "bad input")).toBeInstanceOf(Error);
  });
  it("categorizeError returns a string", () => {
    expect(typeof categorizeError(new Error("x"), "/unknown")).toBe("string");
  });
  it("categorizeError maps ZodError on /api/diagnosis to VALIDATION_ERROR", () => {
    expect(categorizeError(named("ZodError", "bad input"), "/api/diagnosis")).toBe("VALIDATION_ERROR");
  });
  it("categorizeError maps PrismaClientKnownRequestError to DATABASE_ERROR", () => {
    expect(categorizeError(named("PrismaClientKnownRequestError", "db fail"), "/api/x")).toBe("DATABASE_ERROR");
  });
  it("categorizeError maps /something-else to UNEXPECTED_ERROR", () => {
    expect(categorizeError(new Error("boom"), "/something-else")).toBe("UNEXPECTED_ERROR");
  });
  it("categorizeError maps /diagnosis to DIAGNOSIS_ERROR", () => {
    expect(categorizeError(new Error("boom"), "/diagnosis")).toBe("DIAGNOSIS_ERROR");
  });
  it("categorizeError maps RateLimitError on /api/auth/signup to AUTH_RATE_LIMIT", () => {
    expect(categorizeError(named("RateLimitError", "rate limit exceeded"), "/api/auth/signup")).toBe("AUTH_RATE_LIMIT");
  });
  it("categorizeError maps Unauthorized error on /api/auth/login to AUTH_ERROR", () => {
    expect(categorizeError(new Error("Unauthorized"), "/api/auth/login")).toBe("AUTH_ERROR");
  });
  it("captureError returns a string category", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(typeof captureError(new Error("x"), { route: "/api/auth/login" })).toBe("string");
    spy.mockRestore();
  });
  it("captureError with /api/auth/login returns AUTH_ERROR", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(captureError(new Error("Unauthorized"), { route: "/api/auth/login" })).toBe("AUTH_ERROR");
    spy.mockRestore();
  });
  it("named() sets name property on the error", () => {
    expect(named("ZodError", "bad input").name).toBe("ZodError");
  });
  it("named() sets message property on the error", () => {
    expect(named("ZodError", "bad input").message).toBe("bad input");
  });
  it("categorizeError is deterministic: same input gives same output twice", () => {
    const err = new Error("boom");
    expect(categorizeError(err, "/diagnosis")).toBe(categorizeError(err, "/diagnosis"));
  });
  it("categorizeError maps /dashboard to DASHBOARD_ERROR", () => {
    expect(categorizeError(new Error("boom"), "/dashboard")).toBe("DASHBOARD_ERROR");
  });
});

describe("observability categorization (deterministic, low-cardinality)", () => {
  const cases: Array<{ error: unknown; route?: string; expected: ObservabilityCategory }> = [
    { error: named("ZodError", "bad input"), route: "/api/diagnosis", expected: "VALIDATION_ERROR" },
    { error: named("PrismaClientKnownRequestError", "db fail"), route: "/api/x", expected: "DATABASE_ERROR" },
    { error: named("RateLimitError", "rate limit exceeded"), route: "/api/auth/signup", expected: "AUTH_RATE_LIMIT" },
    { error: new Error("Unauthorized"), route: "/api/auth/login", expected: "AUTH_ERROR" },
    { error: new Error("boom"), route: "/diagnosis", expected: "DIAGNOSIS_ERROR" },
    { error: new Error("boom"), route: "/dashboard", expected: "DASHBOARD_ERROR" },
    { error: new Error("boom"), route: "/something-else", expected: "UNEXPECTED_ERROR" },
  ];

  it("maps each surface to a stable category", () => {
    for (const c of cases) {
      expect(categorizeError(c.error, c.route)).toBe(c.expected);
      // deterministic: identical on repeat
      expect(categorizeError(c.error, c.route)).toBe(c.expected);
    }
  });
});

describe("captureError — fail-open and PII-safe without a DSN", () => {
  it("returns the category and never throws when Sentry is unconfigured", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cat = captureError(new Error("kaboom"), {
      route: "/api/auth/login",
      userId: "u1",
      workspaceId: "w1",
      requestId: "req-123",
    });
    expect(cat).toBe("AUTH_ERROR");
    spy.mockRestore();
  });

  it("never logs the raw error message / secrets (uses the governed operator message)", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    captureError(named("Error", "password=SUPERSECRET_TOKEN_xyz leaked"), { route: "/api/auth/login" });
    spy.mockRestore();
    const out = lines.join("\n");
    expect(out).not.toContain("SUPERSECRET_TOKEN_xyz");
    // safe, low-cardinality fields are present
    expect(out).toMatch(/AUTH_ERROR/);
    expect(out).toMatch(/"observability":"error"/);
  });

  it("honours an explicit category override", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(captureError(new Error("x"), { category: "DIAGNOSIS_ERROR" })).toBe("DIAGNOSIS_ERROR");
    spy.mockRestore();
  });
});

// Open-beta hardening: targeted proof of the beforeSend scrubber's actual
// behavior, driven directly against constructed Sentry-event-shaped objects
// (no real @sentry/nextjs SDK needed for this half of the contract).
describe("scrubEvent — beforeSend scrubber", () => {
  it("scrubs request cookies", () => {
    const event = { request: { cookies: { opsiq_session: "abc123" }, headers: {} } };
    const scrubbed = scrubEvent(event);
    expect((scrubbed.request as Record<string, unknown>).cookies).toBeUndefined();
  });

  it("scrubs the Authorization header (and the cookie header, and the diagnostic-key header)", () => {
    const event = {
      request: {
        headers: {
          authorization: "Bearer super-secret-token",
          cookie: "opsiq_session=abc123",
          "x-opsiq-diagnostic-key": "the-shared-diagnostic-secret",
          "user-agent": "vitest",
        },
      },
    };
    const scrubbed = scrubEvent(event);
    const headers = (scrubbed.request as Record<string, unknown>).headers as Record<string, unknown>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers["x-opsiq-diagnostic-key"]).toBeUndefined();
    // Non-sensitive headers are left alone — this is scrubbing, not wholesale deletion.
    expect(headers["user-agent"]).toBe("vitest");
  });

  it("scrubs the request body (event.request.data)", () => {
    const event = { request: { data: { password: "hunter2", email: "user@example.com" }, headers: {} } };
    const scrubbed = scrubEvent(event);
    expect((scrubbed.request as Record<string, unknown>).data).toBeUndefined();
  });

  it("scrubs user email, ip_address, and username from event.user", () => {
    const event = { user: { id: "user-123", email: "user@example.com", ip_address: "203.0.113.5", username: "someone" } };
    const scrubbed = scrubEvent(event);
    const user = scrubbed.user as Record<string, unknown>;
    expect(user.email).toBeUndefined();
    expect(user.ip_address).toBeUndefined();
    expect(user.username).toBeUndefined();
    // A non-PII identifier (id) is left alone.
    expect(user.id).toBe("user-123");
  });

  it("is a no-op on an event with no request/user (never throws on a minimal event)", () => {
    expect(() => scrubEvent({ message: "something happened" })).not.toThrow();
  });

  it("scrubs all of cookies, authorization, body, email, and IP in a single realistic event", () => {
    const event = {
      request: {
        cookies: { opsiq_session: "abc" },
        data: { problemStatement: "confidential business detail" },
        headers: { authorization: "Bearer xyz", cookie: "opsiq_session=abc" },
      },
      user: { id: "user-1", email: "owner@company.com", ip_address: "203.0.113.9" },
    };
    const scrubbed = scrubEvent(event);
    const req = scrubbed.request as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown>;
    const user = scrubbed.user as Record<string, unknown>;
    expect(req.cookies).toBeUndefined();
    expect(req.data).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(user.email).toBeUndefined();
    expect(user.ip_address).toBeUndefined();
  });
});

describe("initObservability — release/environment attachment and beforeSend wiring", () => {
  const originalDsn = process.env.SENTRY_DSN;

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = originalDsn;
    vi.doUnmock("@sentry/nextjs");
    vi.resetModules();
  });

  it("attaches VERCEL_GIT_COMMIT_SHA as the release and passes a working scrubbing beforeSend", async () => {
    process.env.SENTRY_DSN = "https://example@o0.ingest.sentry.io/0";
    const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123deadbeef";

    const init = vi.fn();
    vi.doMock("@sentry/nextjs", () => ({ init, captureException: vi.fn() }));
    vi.resetModules();
    const { initObservability: freshInit } = await import("@/infra/observability");

    await freshInit("server");

    expect(init).toHaveBeenCalledTimes(1);
    const config = init.mock.calls[0][0];
    expect(config.release).toBe("abc123deadbeef");
    expect(typeof config.beforeSend).toBe("function");

    // The wired beforeSend really does scrub — not just present, but functional.
    const scrubbedByWiredFn = config.beforeSend({ request: { cookies: { a: "b" }, headers: {} } });
    expect(scrubbedByWiredFn.request.cookies).toBeUndefined();

    if (originalSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
  });

  it("is a no-op (never calls Sentry.init) when no DSN is configured — fail-open by absence", async () => {
    delete process.env.SENTRY_DSN;
    const init = vi.fn();
    vi.doMock("@sentry/nextjs", () => ({ init, captureException: vi.fn() }));
    vi.resetModules();
    const { initObservability: freshInit } = await import("@/infra/observability");

    await freshInit("server");
    expect(init).not.toHaveBeenCalled();
  });
});

describe("real instrumentation entrypoints actually call initObservability", () => {
  // Static-inspection regression guard (same technique as
  // src/__tests__/security/route-scanner.test.ts): scrubbing correctness
  // alone proves nothing if initObservability is never actually invoked from
  // Next.js's real bootstrap hooks. This pins that both hooks genuinely call
  // it, not merely define something never wired up.
  it("src/instrumentation.ts (server) calls initObservability", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const content = fs.readFileSync(path.join(process.cwd(), "src/instrumentation.ts"), "utf8");
    expect(content).toMatch(/initObservability\s*\(\s*["']server["']\s*\)/);
  });

  it("src/instrumentation-client.ts calls initObservability", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const content = fs.readFileSync(path.join(process.cwd(), "src/instrumentation-client.ts"), "utf8");
    expect(content).toMatch(/initObservability\s*\(\s*["']client["']\s*\)/);
  });
});
