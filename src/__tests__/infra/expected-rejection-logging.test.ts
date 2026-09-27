/**
 * Expected-rejection logging (production polish).
 *
 * Production acceptance: a duplicate-period POST correctly returned 409, but the logs showed the
 * conflict at ERROR ("Handler failed") and "[WRAPPER_FAILED] [object Object]". Root causes:
 *  1. the wrapper passed its context object in logger.error's error slot, which was stringified;
 *  2. every handler AppError — including expected 4xx domain rejections — was logged at ERROR.
 * These tests pin the classification helper, the logger's argument handling and the telemetry
 * level. The real wrapper path is covered end-to-end by
 * src/__tests__/owner-strategy/duplicate-period-logging.db.test.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { errorLogArgs, logger } from "@/infra/logger";
import { isExpectedClientRejection } from "@/lib/canonical-route-enforcement";
import { CanonicalTelemetryLifecycle } from "@/lib/canonical-telemetry-lifecycle";
import {
  BadRequestError,
  ConflictError,
  DuplicateSubmissionError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "@/infra/errors";

afterEach(() => vi.restoreAllMocks());

describe("isExpectedClientRejection", () => {
  it("expected: owner-safe domain 400/404/409/422 that are not security-relevant", () => {
    expect(isExpectedClientRejection(new ConflictError("dup"), true, 409)).toBe(true);
    expect(isExpectedClientRejection(new ValidationError("bad"), true, 400)).toBe(true);
    expect(isExpectedClientRejection(new BadRequestError("bad"), true, 400)).toBe(true);
    expect(isExpectedClientRejection(new NotFoundError("OwnerStrategySnapshot", "x"), true, 404)).toBe(true);
    expect(isExpectedClientRejection(new InvalidStateTransitionError("a", "b", "c"), true, 422)).toBe(true);
  });

  it("not expected: security-relevant, auth/permission, 5xx, or anything not a known-safe AppError", () => {
    expect(isExpectedClientRejection(new DuplicateSubmissionError("again"), true, 409)).toBe(false); // securityRelevant
    expect(isExpectedClientRejection(new UnauthorizedError("AUTH_INVALID"), true, 401)).toBe(false);
    expect(isExpectedClientRejection(new ForbiddenError("CAPABILITY_NOT_GRANTED"), true, 403)).toBe(false);
    expect(isExpectedClientRejection(new ServiceUnavailableError("CIRCUIT_OPEN"), false, 503)).toBe(false);
    expect(isExpectedClientRejection(new Error("boom"), false, 500)).toBe(false);
    // A 409-shaped object that the wrapper did not classify as a known-safe AppError.
    expect(isExpectedClientRejection({ statusCode: 409 }, false, 409)).toBe(false);
  });
});

describe("logger.error / fatal argument handling", () => {
  it("a plain context object in the error slot is logged as context, not as '[object Object]'", () => {
    expect(errorLogArgs({ correlationId: "c-1", stage: "handler_invocation" }, undefined)).toEqual({
      error: undefined,
      context: { correlationId: "c-1", stage: "handler_invocation" },
    });
    // An explicit context still wins over keys of the misplaced object.
    expect(errorLogArgs({ a: 1, b: 2 }, { b: 3 })).toEqual({ error: undefined, context: { a: 1, b: 3 } });
  });

  it("Error instances and other values are handled as before", () => {
    const e = new Error("real");
    expect(errorLogArgs(e, { x: 1 })).toEqual({ error: e, context: { x: 1 } });
    expect(errorLogArgs("text", undefined).error?.message).toBe("text");
    expect(errorLogArgs(undefined, undefined).error?.message).toBe("undefined");
    // Class instances that are not Errors are not treated as context.
    class Custom { toString() { return "custom"; } }
    expect(errorLogArgs(new Custom(), undefined).error?.message).toBe("custom");
  });

  it("no written log line contains '[object Object]' for a context-in-error-slot call", () => {
    const writes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { writes.push(args.map(String).join(" ")); });
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { writes.push(args.map(String).join(" ")); });
    logger.error("[TEST_CONTEXT_IN_ERROR_SLOT]", { correlationId: "c-9", classification: "x" });
    logger.flush();
    const line = writes.find((w) => w.includes("[TEST_CONTEXT_IN_ERROR_SLOT]"));
    expect(line).toBeDefined();
    expect(line).not.toContain("[object Object]");
    expect(line).toContain("c-9");
  });
});

describe("telemetry handler_failed level", () => {
  it("an expected rejection is a WARN, a real failure stays ERROR", () => {
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");
    new CanonicalTelemetryLifecycle({ correlationId: "c-1", requestId: "r-1", method: "POST", pathname: "/api/x" }).emitHandlerFailed(new ConflictError("dup"), { expected: true });
    expect(warn).toHaveBeenCalledWith("Handler rejected request", expect.objectContaining({ correlationId: "c-1", errorMessage: "dup" }));
    expect(error).not.toHaveBeenCalled();

    new CanonicalTelemetryLifecycle({ correlationId: "c-2", requestId: "r-2", method: "POST", pathname: "/api/x" }).emitHandlerFailed(new Error("boom"));
    expect(error).toHaveBeenCalledWith("Handler failed", expect.any(Error), expect.objectContaining({ correlationId: "c-2" }));
  });
});
