import { describe, expect, it } from "vitest";
import {
  buildOwnerSafeMessage,
  classifyQboHttpFailure,
  classifyQboNetworkFailure,
  parseQboFault,
  parseRetryAfter,
} from "@/domain/quickbooks/qbo-errors";

function headersFrom(map: Record<string, string>): { get(name: string): string | null } {
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

describe("parseQboFault", () => {
  it("parses the standard Fault/Error envelope", () => {
    const body = {
      Fault: {
        type: "ValidationFault",
        Error: [{ Message: "Business Validation Error", Detail: "Something is wrong", code: "6000", element: "Line" }],
      },
    };
    const parsed = parseQboFault(body);
    expect(parsed.faultType).toBe("ValidationFault");
    expect(parsed.faults).toEqual([
      { code: "6000", message: "Business Validation Error", detail: "Something is wrong", element: "Line" },
    ]);
  });

  it("parses the lower-cased fault/error envelope", () => {
    const body = { fault: { type: "AuthenticationFault", error: [{ message: "Token expired", code: "3200" }] } };
    const parsed = parseQboFault(body);
    expect(parsed.faultType).toBe("AuthenticationFault");
    expect(parsed.faults[0]).toEqual({ code: "3200", message: "Token expired", detail: null, element: null });
  });

  it("returns empty faults for a body with no fault envelope", () => {
    expect(parseQboFault({ Invoice: {} })).toEqual({ faultType: null, faults: [] });
    expect(parseQboFault(null)).toEqual({ faultType: null, faults: [] });
    expect(parseQboFault(undefined)).toEqual({ faultType: null, faults: [] });
    expect(parseQboFault("oops")).toEqual({ faultType: null, faults: [] });
  });

  it("handles a single (non-array) Error node", () => {
    const body = { Fault: { type: "ValidationFault", Error: { Message: "Single error" } } };
    expect(parseQboFault(body).faults).toEqual([{ code: null, message: "Single error", detail: null, element: null }]);
  });
});

describe("buildOwnerSafeMessage", () => {
  it("combines Message and Detail when distinct", () => {
    const msg = buildOwnerSafeMessage([{ code: "6000", message: "Bad thing", detail: "More info", element: null }], "fallback");
    expect(msg).toBe("Bad thing — More info");
  });

  it("uses Message alone when Detail duplicates it", () => {
    const msg = buildOwnerSafeMessage([{ code: null, message: "Same", detail: "Same", element: null }], "fallback");
    expect(msg).toBe("Same");
  });

  it("falls back when there are no faults", () => {
    expect(buildOwnerSafeMessage([], "fallback message")).toBe("fallback message");
  });

  it("truncates long messages and never echoes a request body", () => {
    const long = "x".repeat(500);
    const msg = buildOwnerSafeMessage([{ code: null, message: long, detail: null, element: null }], "fallback");
    expect(msg.length).toBeLessThanOrEqual(300);
    expect(msg.endsWith("…")).toBe(true);
  });
});

describe("parseRetryAfter", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");

  it("parses a seconds value", () => {
    expect(parseRetryAfter("30", now)).toBe(30_000);
  });

  it("parses an HTTP-date value", () => {
    const future = new Date(now.getTime() + 45_000).toUTCString();
    expect(parseRetryAfter(future, now)).toBeCloseTo(45_000, -2);
  });

  it("returns null for missing or unparseable headers", () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter("", now)).toBeNull();
    expect(parseRetryAfter("not-a-date-or-number", now)).toBeNull();
  });

  it("never returns a negative delay for a past date", () => {
    const past = new Date(now.getTime() - 10_000).toUTCString();
    expect(parseRetryAfter(past, now)).toBe(0);
  });
});

describe("classifyQboHttpFailure", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");

  it("classifies 401 as AUTH", () => {
    const err = classifyQboHttpFailure({ status: 401, body: {}, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("AUTH");
    expect(err.httpStatus).toBe(401);
    expect(err.ambiguous).toBe(false);
  });

  it("classifies 403 with no fault body as FORBIDDEN", () => {
    const err = classifyQboHttpFailure({ status: 403, body: {}, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("FORBIDDEN");
  });

  it("classifies 403 with an AuthenticationFault as AUTH (not a blanket FORBIDDEN) so forceRefresh triggers", () => {
    const body = { Fault: { type: "AuthenticationFault", Error: [{ Message: "Token revoked", code: "3200" }] } };
    const err = classifyQboHttpFailure({ status: 403, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("AUTH");
  });

  it("classifies 403 with a 3001 throttle fault as RATE_LIMITED (retryable), not FORBIDDEN", () => {
    const body = { Fault: { type: "SystemFault", Error: [{ Message: "Throttle limit exceeded", code: "3001" }] } };
    const err = classifyQboHttpFailure({ status: 403, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("RATE_LIMITED");
    expect(err.retryable).toBe(true);
  });

  it("classifies 403 with an AuthorizationFault as FORBIDDEN", () => {
    const body = { Fault: { type: "AuthorizationFault", Error: [{ Message: "Not authorized" }] } };
    const err = classifyQboHttpFailure({ status: 403, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("FORBIDDEN");
  });

  it("classifies 429 as RATE_LIMITED and captures Retry-After", () => {
    const err = classifyQboHttpFailure({
      status: 429,
      body: {},
      headers: headersFrom({ "Retry-After": "12" }),
      isWrite: false,
      now,
    });
    expect(err.kind).toBe("RATE_LIMITED");
    expect(err.retryAfterMs).toBe(12_000);
    expect(err.retryable).toBe(true);
  });

  it("classifies fault code 5010 as STALE_OBJECT regardless of HTTP status", () => {
    const body = { Fault: { type: "ValidationFault", Error: [{ Message: "Stale Object Error", code: "5010" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: true, now });
    expect(err.kind).toBe("STALE_OBJECT");
    expect(err.retryable).toBe(false);
  });

  it("classifies fault code 610 as NOT_FOUND", () => {
    const body = { Fault: { type: "ValidationFault", Error: [{ Message: "Object Not Found", code: "610" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("NOT_FOUND");
  });

  it("classifies fault code 6240 as DUPLICATE", () => {
    const body = { Fault: { type: "ValidationFault", Error: [{ Message: "Duplicate Name Exists Error", code: "6240" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: true, now });
    expect(err.kind).toBe("DUPLICATE");
  });

  it("classifies a generic 6000-series duplicate message as DUPLICATE", () => {
    const body = { Fault: { type: "ValidationFault", Error: [{ Message: "Duplicate Document Number Error", code: "6000" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: true, now });
    expect(err.kind).toBe("DUPLICATE");
  });

  it("classifies fault code 3001 (ThrottleExceeded) as RATE_LIMITED even on HTTP 400", () => {
    const body = { Fault: { type: "SystemFault", Error: [{ Message: "Throttle limit exceeded", code: "3001" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("RATE_LIMITED");
  });

  it("classifies AuthenticationFault type as AUTH even without a specific code", () => {
    const body = { Fault: { type: "AuthenticationFault", Error: [{ Message: "Invalid token" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("AUTH");
  });

  it("classifies AuthorizationFault type as FORBIDDEN", () => {
    const body = { Fault: { type: "AuthorizationFault", Error: [{ Message: "Not authorized" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("FORBIDDEN");
  });

  it("classifies a generic ValidationFault as VALIDATION", () => {
    const body = { Fault: { type: "ValidationFault", Error: [{ Message: "Required field missing" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.kind).toBe("VALIDATION");
  });

  it("classifies 5xx as TRANSIENT and marks writes ambiguous", () => {
    const readErr = classifyQboHttpFailure({ status: 503, body: {}, headers: headersFrom({}), isWrite: false, now });
    expect(readErr.kind).toBe("TRANSIENT");
    expect(readErr.ambiguous).toBe(false);

    const writeErr = classifyQboHttpFailure({ status: 503, body: {}, headers: headersFrom({}), isWrite: true, now });
    expect(writeErr.kind).toBe("TRANSIENT");
    expect(writeErr.ambiguous).toBe(true);
  });

  it("captures intuit_tid when present", () => {
    const err = classifyQboHttpFailure({ status: 500, body: {}, headers: headersFrom({ intuit_tid: "abc-123" }), isWrite: false, now });
    expect(err.intuitTid).toBe("abc-123");
  });

  it("never echoes the request body in the message", () => {
    const body = { Fault: { type: "ValidationFault", Error: [{ Message: "Bad request" }] } };
    const err = classifyQboHttpFailure({ status: 400, body, headers: headersFrom({}), isWrite: false, now });
    expect(err.message).not.toContain("SecretField");
  });
});

describe("classifyQboNetworkFailure", () => {
  it("classifies a timeout as TIMEOUT and marks writes ambiguous", () => {
    const err = classifyQboNetworkFailure({ error: new Error("aborted"), isWrite: true, timedOut: true });
    expect(err.kind).toBe("TIMEOUT");
    expect(err.ambiguous).toBe(true);
    expect(err.retryable).toBe(true);
  });

  it("classifies a connection failure as TRANSIENT and marks writes ambiguous", () => {
    const err = classifyQboNetworkFailure({ error: new Error("ECONNRESET"), isWrite: true, timedOut: false });
    expect(err.kind).toBe("TRANSIENT");
    expect(err.ambiguous).toBe(true);
  });

  it("does not mark reads ambiguous", () => {
    const err = classifyQboNetworkFailure({ error: new Error("ECONNRESET"), isWrite: false, timedOut: false });
    expect(err.ambiguous).toBe(false);
  });

  it("never includes the raw network error text (hostnames, errno, internals) in the owner-facing message", () => {
    const sensitive = new Error("connect ECONNREFUSED 10.0.4.17:443 at TCPConnectWrap.afterConnect [as oncomplete]");
    const err = classifyQboNetworkFailure({ error: sensitive, isWrite: false, timedOut: false });
    expect(err.message).toBe("Could not reach QuickBooks");
    expect(err.message).not.toContain("10.0.4.17");
    expect(err.message).not.toContain("ECONNREFUSED");
  });

  it("uses a fixed owner-safe message for a timeout regardless of the underlying error", () => {
    const err = classifyQboNetworkFailure({ error: new Error("internal timeout detail"), isWrite: true, timedOut: true });
    expect(err.message).toBe("QuickBooks did not respond in time");
    expect(err.message).not.toContain("internal timeout detail");
  });
});
