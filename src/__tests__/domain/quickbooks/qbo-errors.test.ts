import { describe, it, expect } from "vitest";
import {
  QboProviderError,
  QBO_ERROR_KINDS,
  classifyApiHttpFailure,
  classifyOauthHttpFailure,
  qboErrorLogContext,
  sanitizeProviderCode,
} from "@/domain/quickbooks/qbo-errors";

describe("QboProviderError", () => {
  it("message is a fixed operator-safe sentence per kind, whatever diagnostics are attached", () => {
    for (const kind of QBO_ERROR_KINDS) {
      const e = new QboProviderError({ kind, httpStatus: 500, intuitTid: "tid-1", providerCode: "x", localReason: "R" });
      expect(e.message).toBe(e.operatorMessage);
      expect(e.message).not.toMatch(/intuit|oauth|token|secret|http|json|prisma|realm|[0-9]{3,}/i);
      expect(e.message.length).toBeGreaterThan(10);
    }
  });

  it("flags retryable and owner-action kinds", () => {
    expect(new QboProviderError({ kind: "RATE_LIMITED" }).retryable).toBe(true);
    expect(new QboProviderError({ kind: "TIMEOUT" }).retryable).toBe(true);
    expect(new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" }).retryable).toBe(true);
    for (const kind of ["AUTH_EXPIRED", "REFRESH_INVALID", "FORBIDDEN", "NOT_FOUND", "MALFORMED_RESPONSE", "CONFIGURATION_ERROR", "BAD_REQUEST", "CANCELLED"] as const) {
      expect(new QboProviderError({ kind }).retryable).toBe(false);
    }
    expect(new QboProviderError({ kind: "REFRESH_INVALID" }).requiresOwnerAction).toBe(true);
    expect(new QboProviderError({ kind: "FORBIDDEN" }).requiresOwnerAction).toBe(true);
    expect(new QboProviderError({ kind: "TIMEOUT" }).requiresOwnerAction).toBe(false);
  });

  it("log context carries only secret-free diagnostics", () => {
    const e = new QboProviderError({ kind: "FORBIDDEN", httpStatus: 403, intuitTid: "tid-9", providerCode: "403" });
    expect(qboErrorLogContext(e)).toEqual({ kind: "FORBIDDEN", httpStatus: 403, intuitTid: "tid-9", providerCode: "403", retryAfterMs: null, localReason: null });
  });
});

describe("classifyApiHttpFailure", () => {
  it.each([
    [401, "AUTH_EXPIRED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "TRANSIENT_PROVIDER_FAILURE"],
    [503, "TRANSIENT_PROVIDER_FAILURE"],
    [400, "BAD_REQUEST"],
    [409, "BAD_REQUEST"],
  ])("HTTP %i -> %s", (status, kind) => {
    expect(classifyApiHttpFailure({ status }).kind).toBe(kind);
  });

  it("carries the trace id and retry hint", () => {
    const e = classifyApiHttpFailure({ status: 429, intuitTid: "t", retryAfterMs: 5000 });
    expect(e.intuitTid).toBe("t");
    expect(e.retryAfterMs).toBe(5000);
  });
});

describe("classifyOauthHttpFailure", () => {
  it("invalid_grant is REFRESH_INVALID on refresh and AUTHORIZATION_INVALID on exchange (never transient)", () => {
    expect(classifyOauthHttpFailure("refresh", { status: 400, providerCode: "invalid_grant" }).kind).toBe("REFRESH_INVALID");
    expect(classifyOauthHttpFailure("exchange", { status: 400, providerCode: "invalid_grant" }).kind).toBe("AUTHORIZATION_INVALID");
    expect(classifyOauthHttpFailure("refresh", { status: 400, providerCode: "invalid_grant" }).retryable).toBe(false);
  });

  it("5xx and 429 are retryable; 401/invalid_client is configuration; other 400s are configuration", () => {
    expect(classifyOauthHttpFailure("refresh", { status: 503 }).kind).toBe("TRANSIENT_PROVIDER_FAILURE");
    expect(classifyOauthHttpFailure("refresh", { status: 429 }).kind).toBe("RATE_LIMITED");
    expect(classifyOauthHttpFailure("exchange", { status: 401, providerCode: "invalid_client" }).kind).toBe("CONFIGURATION_ERROR");
    expect(classifyOauthHttpFailure("exchange", { status: 400, providerCode: "invalid_request" }).kind).toBe("CONFIGURATION_ERROR");
  });

  it("a revoke client error is reported distinctly (token no longer recognised), not as success", () => {
    expect(classifyOauthHttpFailure("revoke", { status: 400 }).kind).toBe("REFRESH_INVALID");
  });
});

describe("sanitizeProviderCode", () => {
  it("keeps short identifier-like codes and drops everything else", () => {
    expect(sanitizeProviderCode("invalid_grant")).toBe("invalid_grant");
    expect(sanitizeProviderCode("6240")).toBe("6240");
    expect(sanitizeProviderCode("has spaces and a token eyJabc")).toBeNull();
    expect(sanitizeProviderCode("x".repeat(65))).toBeNull();
    expect(sanitizeProviderCode({ a: 1 })).toBeNull();
    expect(sanitizeProviderCode(undefined)).toBeNull();
  });
});
