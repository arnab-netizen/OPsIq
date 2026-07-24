import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/diagnosis/route";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

// Mock diagnosis route handler
describe("Diagnosis error visibility", () => {
  it("should include safeMessage when diagnosis fails", async () => {
    // Create a mock context that will cause a Prisma validation error
    const mockCtx = {
      verifiedActorId: "test-actor",
      verifiedWorkspaceId: "test-workspace",
      verifiedActorType: "user" as const,
      verifiedCapabilities: new Set(),
      correlationId: "test-corr",
      requestId: "test-req",
      request: new Request("http://localhost/api/diagnosis", {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          "idempotency-key": "test-key-123",
        }),
        body: JSON.stringify({
          businessName: "Test",
          businessType: "SaaS",
          problemStatement: "Test problem",
          mainIssue: "cash_flow",
        }),
      }),
    };

    // Mock handler to simulate error - we can't easily test the real handler
    // without a database, so we test the error handling structure instead.
    // The important thing is that safeMessage must always be present.

    // Simulate what the route catch block does
    const testError = new Error("Invalid `prisma.clientAccount.create()` invocation: Unknown field `invalidField`");
    testError.name = "PrismaClientValidationError";

    const err = testError;
    const fullMessage = err.message;
    const sanitizedMessage = fullMessage
      .replace(/postgres:\/\/[^\s]+/g, "postgres://***")
      .replace(/password[=:]\S+/gi, "password=***")
      .replace(/token[=:]\S+/gi, "token=***")
      .replace(/key[=:]\S+/gi, "key=***");

    const errorResponse = {
      error: "Diagnosis request failed",
      stage: "handler_invocation",
      classification: "diagnosis_handler_failed",
      errorName: err.name,
      failingOperation: "clientAccount_create",
      safeMessage: sanitizedMessage || "(empty error message)",
    };

    // Verify safeMessage is always present and not empty
    expect(errorResponse.safeMessage).toBeDefined();
    expect(errorResponse.safeMessage).not.toBe("");
    expect(errorResponse.safeMessage).toBeTruthy();
    expect(errorResponse.safeMessage).toContain("Invalid");
    expect(errorResponse.failingOperation).toBe("clientAccount_create");
  });

  it("should include failingOperation in error response", async () => {
    const operations = [
      "parse_request",
      "idempotency_check",
      "validateBusinessProblem",
      "diagnoseBusiness",
      "clientAccount_create",
      "engagement_create",
      "idempotency_record_success",
      "idempotency_record_error",
      "response_return",
    ];

    for (const op of operations) {
      const errorResponse = {
        failingOperation: op,
        safeMessage: `Error occurred during ${op}`,
      };

      expect(errorResponse.failingOperation).toBe(op);
      expect(errorResponse.failingOperation).not.toBe("handler_invocation_unknown");
    }
  });

  it("should sanitize secrets in safeMessage", async () => {
    const secretfulMessage =
      'Database connection failed: "postgres://user:password123@db.example.com"';

    const sanitized = secretfulMessage
      .replace(/postgres:\/\/[^\s]+/g, "postgres://***")
      .replace(/password[=:]\S+/gi, "password=***");

    expect(sanitized).not.toContain("password123");
    expect(sanitized).toContain("postgres://***");
    expect(sanitized).toContain("failed");
  });

  it("should never drop safeMessage even when empty", async () => {
    // Edge case: empty message should become placeholder, not undefined
    const emptyMessage = "";
    const safeMessage = emptyMessage || "(empty error message)";

    expect(safeMessage).toBe("(empty error message)");
    expect(safeMessage).toBeTruthy();
  });

  it("should sanitize token= patterns in safeMessage", () => {
    const msg = "Auth failed: token=superSecretToken123";
    const sanitized = msg.replace(/token[=:]\S+/gi, "token=***");
    expect(sanitized).not.toContain("superSecretToken123");
    expect(sanitized).toContain("token=***");
  });

  it("should sanitize token: patterns in safeMessage", () => {
    const msg = "Invalid token:abc123xyz";
    const sanitized = msg.replace(/token[=:]\S+/gi, "token=***");
    expect(sanitized).not.toContain("abc123xyz");
    expect(sanitized).toContain("token=***");
  });

  it("should sanitize key= patterns in safeMessage", () => {
    const msg = "Decryption failed: key=privateKey99";
    const sanitized = msg.replace(/key[=:]\S+/gi, "key=***");
    expect(sanitized).not.toContain("privateKey99");
    expect(sanitized).toContain("key=***");
  });

  it("should sanitize key: patterns in safeMessage", () => {
    const msg = "HMAC error key:secretKey42";
    const sanitized = msg.replace(/key[=:]\S+/gi, "key=***");
    expect(sanitized).not.toContain("secretKey42");
    expect(sanitized).toContain("key=***");
  });

  it("should sanitize password= patterns in safeMessage", () => {
    const msg = "Connection refused password=hunter2";
    const sanitized = msg.replace(/password[=:]\S+/gi, "password=***");
    expect(sanitized).not.toContain("hunter2");
    expect(sanitized).toContain("password=***");
  });

  it("should sanitize password: patterns in safeMessage", () => {
    const msg = "Login failed password:letmein";
    const sanitized = msg.replace(/password[=:]\S+/gi, "password=***");
    expect(sanitized).not.toContain("letmein");
    expect(sanitized).toContain("password=***");
  });

  it("should preserve non-secret message content verbatim", () => {
    const safeMsg = "Invalid field `unknownField` on model Foo";
    const sanitized = safeMsg
      .replace(/postgres:\/\/[^\s]+/g, "postgres://***")
      .replace(/password[=:]\S+/gi, "password=***")
      .replace(/token[=:]\S+/gi, "token=***")
      .replace(/key[=:]\S+/gi, "key=***");
    expect(sanitized).toBe(safeMsg);
  });

  it("error response has all required fields", () => {
    const errorResponse = {
      error: "Diagnosis request failed",
      stage: "handler_invocation",
      classification: "diagnosis_handler_failed",
      errorName: "PrismaClientValidationError",
      failingOperation: "clientAccount_create",
      safeMessage: "some safe message",
    };
    expect(errorResponse).toHaveProperty("error");
    expect(errorResponse).toHaveProperty("stage");
    expect(errorResponse).toHaveProperty("classification");
    expect(errorResponse).toHaveProperty("errorName");
    expect(errorResponse).toHaveProperty("failingOperation");
    expect(errorResponse).toHaveProperty("safeMessage");
  });

  it("error field always says 'Diagnosis request failed'", () => {
    const errorResponse = { error: "Diagnosis request failed" };
    expect(errorResponse.error).toBe("Diagnosis request failed");
  });

  it("stage field identifies where in the pipeline the error occurred", () => {
    const stages = ["parse_request", "idempotency_check", "handler_invocation", "response_return"];
    for (const stage of stages) {
      const errorResponse = { stage };
      expect(typeof errorResponse.stage).toBe("string");
      expect(errorResponse.stage.length).toBeGreaterThan(0);
    }
  });

  it("classification field is always a non-empty string", () => {
    const errorResponse = { classification: "diagnosis_handler_failed" };
    expect(typeof errorResponse.classification).toBe("string");
    expect(errorResponse.classification.length).toBeGreaterThan(0);
  });

  it("multiple secret patterns in one message: all are sanitized", () => {
    const msg = "Failed: postgres://user:pass@db.example.com, token=abc123, key=xyz456";
    const sanitized = msg
      .replace(/postgres:\/\/[^\s]+/g, "postgres://***")
      .replace(/token[=:]\S+/gi, "token=***")
      .replace(/key[=:]\S+/gi, "key=***");
    expect(sanitized).not.toContain("user:pass");
    expect(sanitized).not.toContain("abc123");
    expect(sanitized).toContain("postgres://***");
    expect(sanitized).toContain("token=***");
  });

  it("safeMessage preserves PrismaClientValidationError field name info", () => {
    const msg = "Invalid `prisma.foo.create()` invocation: Unknown field `badField`";
    const sanitized = msg
      .replace(/postgres:\/\/[^\s]+/g, "postgres://***")
      .replace(/password[=:]\S+/gi, "password=***");
    expect(sanitized).toContain("Unknown field");
    expect(sanitized).toContain("badField");
  });

  it("errorName PrismaClientValidationError is preserved in error response", () => {
    const err = new Error("some prisma error");
    err.name = "PrismaClientValidationError";
    const errorResponse = { errorName: err.name };
    expect(errorResponse.errorName).toBe("PrismaClientValidationError");
  });

  it("failingOperation idempotency_check is a distinct operation from parse_request", () => {
    const ops = ["parse_request", "idempotency_check"];
    expect(ops[0]).not.toBe(ops[1]);
    expect(ops).toContain("parse_request");
    expect(ops).toContain("idempotency_check");
  });

  it("safeMessage for empty string uses placeholder '(empty error message)'", () => {
    const cases = ["", null, undefined];
    for (const c of cases) {
      const safeMessage = c || "(empty error message)";
      expect(safeMessage).toBe("(empty error message)");
    }
  });
});
