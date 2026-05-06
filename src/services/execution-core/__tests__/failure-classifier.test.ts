import { describe, it, expect } from "vitest";
import { FailureClassifier } from "../failure-classifier";
import { FailureClass } from "@/domain/execution/failure-classification";

describe("FailureClassifier", () => {
  const classifier = new FailureClassifier();

  describe("classifyFailure", () => {
    it("should classify network errors as RECOVERABLE", () => {
      const errors = [
        "ECONNREFUSED: Connection refused",
        "ENOTFOUND: getaddrinfo ENOTFOUND example.com",
        "ETIMEDOUT: Connection timeout",
      ];

      for (const error of errors) {
        const result = classifier.classifyFailure(error);
        expect(result.failure_class).toBe(FailureClass.RECOVERABLE);
        expect(result.should_retry).toBe(true);
        expect(result.should_rollback).toBe(false);
      }
    });

    it("should classify transient service errors as RECOVERABLE", () => {
      const errors = [
        "Service temporarily unavailable",
        "Connection reset by peer",
        "The operation timed out after 30 seconds",
      ];

      for (const error of errors) {
        const result = classifier.classifyFailure(error);
        expect(result.failure_class).toBe(FailureClass.RECOVERABLE);
      }
    });

    it("should classify database errors as RETRYABLE", () => {
      const errors = [
        "Lock wait timeout exceeded",
        "Deadlock detected",
      ];

      for (const error of errors) {
        const result = classifier.classifyFailure(error);
        expect(result.failure_class).toBe(FailureClass.RETRYABLE);
        expect(result.should_retry).toBe(true);
      }
    });

    it("should classify rate limiting as RETRYABLE", () => {
      const result = classifier.classifyFailure("Too many requests (429)");

      expect(result.failure_class).toBe(FailureClass.RETRYABLE);
      expect(result.should_retry).toBe(true);
    });

    it("should classify authorization errors as FATAL", () => {
      const errors = [
        "Permission denied",
        "403 Forbidden",
        "401 Unauthorized",
        "Access denied",
      ];

      for (const error of errors) {
        const result = classifier.classifyFailure(error);
        expect(result.failure_class).toBe(FailureClass.FATAL);
        expect(result.should_retry).toBe(false);
        expect(result.should_rollback).toBe(true);
      }
    });

    it("should classify not found errors as FATAL", () => {
      const errors = [
        "File not found",
        "404 Not Found",
        "No such file or directory",
      ];

      for (const error of errors) {
        const result = classifier.classifyFailure(error);
        expect(result.failure_class).toBe(FailureClass.FATAL);
        expect(result.should_rollback).toBe(true);
      }
    });

    it("should classify validation errors as FATAL", () => {
      const errors = [
        "Invalid argument provided",
        "Bad request (400)",
        "Schema mismatch detected",
      ];

      for (const error of errors) {
        const result = classifier.classifyFailure(error);
        expect(result.failure_class).toBe(FailureClass.FATAL);
      }
    });

    it("should classify constraint violations as FATAL", () => {
      const result = classifier.classifyFailure("Constraint violation: duplicate key");

      expect(result.failure_class).toBe(FailureClass.FATAL);
      expect(result.should_rollback).toBe(true);
    });

    it("should default to RETRYABLE for unknown errors", () => {
      const result = classifier.classifyFailure("Some random error message");

      expect(result.failure_class).toBe(FailureClass.RETRYABLE);
      expect(result.should_retry).toBe(true);
    });

    it("should include reason in classification result", () => {
      const result = classifier.classifyFailure("ECONNREFUSED");

      expect(result.reason).toBeDefined();
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it("should include suggested action in result", () => {
      const result = classifier.classifyFailure("Some error");

      expect(result.suggested_action).toBeDefined();
      expect(result.suggested_action.length).toBeGreaterThan(0);
    });
  });

  describe("shouldRetry", () => {
    it("should not retry FATAL failures", () => {
      expect(classifier.shouldRetry(FailureClass.FATAL, 1, 3)).toBe(false);
    });

    it("should retry RECOVERABLE failures within max attempts", () => {
      expect(classifier.shouldRetry(FailureClass.RECOVERABLE, 1, 3)).toBe(true);
      expect(classifier.shouldRetry(FailureClass.RECOVERABLE, 2, 3)).toBe(true);
    });

    it("should not retry after max attempts", () => {
      expect(classifier.shouldRetry(FailureClass.RECOVERABLE, 3, 3)).toBe(false);
    });

    it("should retry RETRYABLE failures within max attempts", () => {
      expect(classifier.shouldRetry(FailureClass.RETRYABLE, 1, 3)).toBe(true);
    });
  });

  describe("shouldRollback", () => {
    it("should rollback FATAL failures", () => {
      expect(classifier.shouldRollback(FailureClass.FATAL)).toBe(true);
    });

    it("should not rollback RECOVERABLE failures", () => {
      expect(classifier.shouldRollback(FailureClass.RECOVERABLE)).toBe(false);
    });

    it("should not rollback RETRYABLE failures", () => {
      expect(classifier.shouldRollback(FailureClass.RETRYABLE)).toBe(false);
    });
  });

  describe("getRecoveryWindow", () => {
    it("should return exponential backoff for RECOVERABLE", () => {
      const window1 = classifier.getRecoveryWindow(FailureClass.RECOVERABLE, 1);
      const window2 = classifier.getRecoveryWindow(FailureClass.RECOVERABLE, 2);
      const window3 = classifier.getRecoveryWindow(FailureClass.RECOVERABLE, 3);

      expect(window1).toBe(1000);
      expect(window2).toBe(2000);
      expect(window3).toBe(4000);
    });

    it("should return longer backoff for RETRYABLE", () => {
      const window1 = classifier.getRecoveryWindow(FailureClass.RETRYABLE, 1);
      const window2 = classifier.getRecoveryWindow(FailureClass.RETRYABLE, 2);

      expect(window1).toBe(5000);
      expect(window2).toBe(10000);
    });

    it("should return 0 for FATAL", () => {
      const window = classifier.getRecoveryWindow(FailureClass.FATAL, 1);

      expect(window).toBe(0);
    });

    it("should cap backoff at maximum", () => {
      const window10 = classifier.getRecoveryWindow(FailureClass.RECOVERABLE, 10);

      expect(window10).toBe(8000); // Capped at 2^3 = 8s
    });
  });

  describe("validateClassification", () => {
    it("should validate correct classification", () => {
      const result = classifier.classifyFailure("ECONNREFUSED");

      expect(classifier.validateClassification(result)).toBe(true);
    });

    it("should reject classification missing failure_class", () => {
      const invalid = {
        failure_class: undefined as any,
        error_message: "error",
        reason: "test",
        should_retry: false,
        should_rollback: false,
        suggested_action: "test",
      };

      expect(classifier.validateClassification(invalid)).toBe(false);
    });

    it("should reject FATAL without rollback", () => {
      const invalid = {
        failure_class: FailureClass.FATAL,
        error_message: "error",
        reason: "test",
        should_retry: false,
        should_rollback: false, // Invalid
        suggested_action: "test",
      };

      expect(classifier.validateClassification(invalid)).toBe(false);
    });

    it("should reject non-FATAL with rollback", () => {
      const invalid = {
        failure_class: FailureClass.RECOVERABLE,
        error_message: "error",
        reason: "test",
        should_retry: true,
        should_rollback: true, // Invalid
        suggested_action: "test",
      };

      expect(classifier.validateClassification(invalid)).toBe(false);
    });
  });

  describe("getMatchingPatterns", () => {
    it("should find matching patterns for error", () => {
      const patterns = classifier.getMatchingPatterns("ECONNREFUSED");

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].class).toBe(FailureClass.RECOVERABLE);
    });

    it("should find multiple matching patterns", () => {
      const patterns = classifier.getMatchingPatterns("Connection timeout error");

      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should return empty for non-matching error", () => {
      const patterns = classifier.getMatchingPatterns("completely unknown error xyz");

      expect(patterns.length).toBe(0);
    });

    it("should be case insensitive", () => {
      const patterns1 = classifier.getMatchingPatterns("ECONNREFUSED");
      const patterns2 = classifier.getMatchingPatterns("econnrefused");
      const patterns3 = classifier.getMatchingPatterns("EConnRefused");

      expect(patterns1.length).toBe(patterns2.length);
      expect(patterns2.length).toBe(patterns3.length);
    });
  });

  describe("getPatternsForClass", () => {
    it("should get all RECOVERABLE patterns", () => {
      const patterns = classifier.getPatternsForClass(FailureClass.RECOVERABLE);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.pattern.length > 0)).toBe(true);
    });

    it("should get all RETRYABLE patterns", () => {
      const patterns = classifier.getPatternsForClass(FailureClass.RETRYABLE);

      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should get all FATAL patterns", () => {
      const patterns = classifier.getPatternsForClass(FailureClass.FATAL);

      expect(patterns.length).toBeGreaterThan(0);
    });

    it("should include reasons for patterns", () => {
      const patterns = classifier.getPatternsForClass(FailureClass.FATAL);

      expect(patterns.every((p) => p.reason.length > 0)).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty error message", () => {
      const result = classifier.classifyFailure("");

      expect(result.failure_class).toBeDefined();
      expect(result.should_retry).toBeDefined();
    });

    it("should handle very long error message", () => {
      const long_error = "E".repeat(10000) + "CONNREFUSED" + "X".repeat(10000);
      const result = classifier.classifyFailure(long_error);

      expect(result.failure_class).toBe(FailureClass.RECOVERABLE);
    });

    it("should be deterministic", () => {
      const error = "Some network timeout occurred";
      const result1 = classifier.classifyFailure(error);
      const result2 = classifier.classifyFailure(error);

      expect(result1.failure_class).toBe(result2.failure_class);
      expect(result1.should_retry).toBe(result2.should_retry);
    });

    it("should handle errors with special characters", () => {
      const result = classifier.classifyFailure("Error: ECONNREFUSED (errno: -111)");

      expect(result.failure_class).toBe(FailureClass.RECOVERABLE);
    });

    it("should correctly classify mixed error patterns", () => {
      // This error could match multiple patterns, should pick first match
      const result = classifier.classifyFailure("timeout and connection refused");

      expect(result.failure_class).toBeDefined();
    });
  });
});
