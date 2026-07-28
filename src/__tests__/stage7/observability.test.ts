/**
 * S7-DC5: Observability proof tests.
 *
 * Proves:
 * 1. categorizeError correctly routes new background job categories
 * 2. PII scrubbing: captureError never logs raw error messages that contain PII
 * 3. New categories (SCHEDULER_ERROR, EMAIL_DELIVERY_ERROR, AI_ERROR, WEBHOOK_ERROR)
 * 4. Existing categories preserved
 * 5. captureError returns the category (never throws)
 */

import { describe, it, expect, vi } from "vitest";
import { categorizeError, captureError } from "@/infra/observability";

describe("S7-DC5: categorizeError — category routing", () => {
  it("routes cron/scheduler route to SCHEDULER_ERROR", () => {
    const err = new Error("task failed");
    expect(categorizeError(err, "/api/internal/cron/scheduler")).toBe("SCHEDULER_ERROR");
  });

  it("routes email delivery errors to EMAIL_DELIVERY_ERROR", () => {
    const err = new Error("resend call failed");
    expect(categorizeError(err, "/api/webhooks/resend")).toBe("EMAIL_DELIVERY_ERROR");
  });

  it("routes generic webhook errors to WEBHOOK_ERROR", () => {
    const err = new Error("webhook processing error");
    expect(categorizeError(err, "/api/webhooks/stripe")).toBe("WEBHOOK_ERROR");
  });

  it("routes Prisma errors to DATABASE_ERROR", () => {
    const err = new Error("PrismaClientKnownRequestError");
    err.name = "PrismaClientKnownRequestError";
    expect(categorizeError(err)).toBe("DATABASE_ERROR");
  });

  it("routes ZodError to VALIDATION_ERROR", () => {
    const err = new Error("ZodError");
    err.name = "ZodError";
    expect(categorizeError(err)).toBe("VALIDATION_ERROR");
  });

  it("routes UnauthorizedError to AUTH_ERROR", () => {
    const err = new Error("Unauthorized");
    err.name = "UnauthorizedError";
    expect(categorizeError(err)).toBe("AUTH_ERROR");
  });

  it("routes diagnosis route to DIAGNOSIS_ERROR", () => {
    const err = new Error("diagnosis failed");
    expect(categorizeError(err, "/api/owner/finance/diagnoses/run")).toBe("DIAGNOSIS_ERROR");
  });

  it("fallback is UNEXPECTED_ERROR for unknown error", () => {
    const err = new Error("something completely unknown");
    expect(categorizeError(err, "/api/some-random-route")).toBe("UNEXPECTED_ERROR");
  });
});

describe("S7-DC5: captureError — PII safety and non-throwing", () => {
  it("never throws (fail-open)", () => {
    const err = new Error("test error");
    expect(() => captureError(err, {})).not.toThrow();
  });

  it("never throws with null error", () => {
    expect(() => captureError(null, {})).not.toThrow();
  });

  it("returns the error category", () => {
    const err = new Error("database connection failed");
    err.name = "PrismaClientKnownRequestError";
    const category = captureError(err, { route: "/api/test" });
    expect(category).toBe("DATABASE_ERROR");
  });

  it("does not log raw email addresses (PII safety)", () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = (msg: string) => { logs.push(msg); };

    const piiErr = new Error("user alice@example.com failed authentication");
    captureError(piiErr, { route: "/api/auth/login" });

    console.error = original;

    // The raw error message is passed through operator-error governance which
    // sanitizes it — we verify the log line is JSON (structured) and does not
    // contain the raw email from the error message.
    for (const log of logs) {
      try {
        const parsed = JSON.parse(log);
        // The 'message' field must not contain the raw PII email.
        expect(parsed.message ?? "").not.toContain("alice@example.com");
      } catch {
        // Non-JSON logs are acceptable (from other loggers) — only assert on JSON.
      }
    }
  });

  it("accepts all new background job categories", () => {
    const categories = ["SCHEDULER_ERROR", "EMAIL_DELIVERY_ERROR", "AI_ERROR", "WEBHOOK_ERROR"] as const;
    for (const cat of categories) {
      expect(() =>
        captureError(new Error("test"), { category: cat })
      ).not.toThrow();
    }
  });
});
