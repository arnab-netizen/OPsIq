import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DuplicateSubmissionError,
  InvalidStateTransitionError,
  OptimisticLockError,
  PolicyViolationError,
  toAppError,
  errorToResponse,
} from "./errors";

describe("Error taxonomy", () => {
  it("AppError serializes to JSON with code and message", () => {
    const err = new AppError("VALIDATION_ERROR", "bad input", 400);
    expect(err.toJSON()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "bad input" },
    });
  });

  it("AppError includes details when provided", () => {
    const err = new AppError("VALIDATION_ERROR", "bad", 400, { field: "email" });
    expect(err.toJSON().error.details).toEqual({ field: "email" });
  });

  it("ValidationError has status 400", () => {
    const err = new ValidationError("invalid");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("NotFoundError includes entity info", () => {
    const err = new NotFoundError("User", "abc-123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("User");
    expect(err.details?.entityId).toBe("abc-123");
  });

  it("UnauthorizedError defaults to 401", () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it("ForbiddenError defaults to 403", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it("ConflictError has status 409", () => {
    const err = new ConflictError("duplicate");
    expect(err.statusCode).toBe(409);
  });

  it("DuplicateSubmissionError includes key", () => {
    const err = new DuplicateSubmissionError("key-1");
    expect(err.statusCode).toBe(409);
    expect(err.details?.idempotencyKey).toBe("key-1");
  });

  it("InvalidStateTransitionError includes from/to", () => {
    const err = new InvalidStateTransitionError("Stage", "draft", "completed");
    expect(err.statusCode).toBe(422);
    expect(err.details?.from).toBe("draft");
    expect(err.details?.to).toBe("completed");
  });

  it("OptimisticLockError includes entity info", () => {
    const err = new OptimisticLockError("User", "abc");
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("OPTIMISTIC_LOCK_FAILURE");
  });

  it("PolicyViolationError includes policy name", () => {
    const err = new PolicyViolationError("max_users", "limit reached");
    expect(err.statusCode).toBe(403);
    expect(err.details?.policy).toBe("max_users");
  });

  it("toAppError wraps plain Error into INTERNAL_ERROR", () => {
    const err = toAppError(new Error("oops"));
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("oops");
  });

  it("toAppError passes through AppError unchanged", () => {
    const original = new ValidationError("bad");
    expect(toAppError(original)).toBe(original);
  });

  it("toAppError handles non-Error values", () => {
    const err = toAppError("string error");
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  it("errorToResponse returns proper Response", async () => {
    const res = errorToResponse(new NotFoundError("User", "1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
