import { describe, it, expect, vi } from "vitest";
import {
  categorizeError,
  captureError,
  type ObservabilityCategory,
} from "@/infra/observability";

function named(name: string, message: string): Error {
  const e = new Error(message);
  Object.defineProperty(e, "name", { value: name });
  return e;
}

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
