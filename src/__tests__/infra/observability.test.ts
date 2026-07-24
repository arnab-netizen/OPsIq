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
