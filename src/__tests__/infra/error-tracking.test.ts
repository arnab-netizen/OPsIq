import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  classifyError,
  formatErrorForLog,
  reportError,
  extractErrorContext,
  getErrorTrackingConfig,
  type ErrorClassification,
  type ClassifiedError,
} from "@/infra/error-tracking";

describe("Phase 13 Slice 4: Error Tracking + Monitoring", () => {
  describe("classifyError: Authentication Errors", () => {
    it("should classify 'Unauthorized' as AUTH_ERROR with 401", () => {
      const error = new Error("Unauthorized");
      const result = classifyError(error);

      expect(result.classification).toBe("AUTH_ERROR");
      expect(result.statusCode).toBe(401);
      expect(result.code).toBe("AUTH_001");
    });

    it("should classify 'authentication failed' as AUTH_ERROR", () => {
      const error = new Error("authentication failed");
      const result = classifyError(error);

      expect(result.classification).toBe("AUTH_ERROR");
      expect(result.statusCode).toBe(401);
    });

    it("should classify 'Forbidden' as AUTH_ERROR with 403", () => {
      const error = new Error("Forbidden");
      const result = classifyError(error);

      expect(result.classification).toBe("AUTH_ERROR");
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe("AUTH_002");
    });

    it("should classify 'permission denied' as AUTH_ERROR", () => {
      const error = new Error("permission denied");
      const result = classifyError(error);

      expect(result.classification).toBe("AUTH_ERROR");
      expect(result.statusCode).toBe(403);
    });

    it("should classify 'capability check failed' as AUTH_ERROR", () => {
      const error = new Error("capability check failed");
      const result = classifyError(error);

      expect(result.classification).toBe("AUTH_ERROR");
    });
  });

  describe("classifyError: Validation Errors", () => {
    it("should classify validation errors", () => {
      const error = new Error("validation failed");
      const result = classifyError(error);

      expect(result.classification).toBe("VALIDATION_ERROR");
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe("VAL_001");
    });

    it("should classify 'Invalid input' errors", () => {
      const error = new Error("Invalid input");
      const result = classifyError(error);

      expect(result.classification).toBe("VALIDATION_ERROR");
      expect(result.statusCode).toBe(400);
    });

    it("should classify 'required field missing' errors", () => {
      const error = new Error("required field missing");
      const result = classifyError(error);

      expect(result.classification).toBe("VALIDATION_ERROR");
    });
  });

  describe("classifyError: Database Errors", () => {
    it("should classify database connection errors", () => {
      const error = new Error("database connection failed");
      const result = classifyError(error);

      expect(result.classification).toBe("DATABASE_ERROR");
      expect(result.statusCode).toBe(503);
      expect(result.code).toBe("DB_001");
    });

    it("should classify ECONNREFUSED errors", () => {
      const error = new Error("Connection refused ECONNREFUSED");
      const result = classifyError(error);

      expect(result.classification).toBe("DATABASE_ERROR");
      expect(result.statusCode).toBe(503);
    });

    it("should classify ETIMEDOUT errors", () => {
      const error = new Error("ETIMEDOUT database timeout");
      const result = classifyError(error);

      expect(result.classification).toBe("DATABASE_ERROR");
    });

    it("should classify Connection refused errors", () => {
      const error = new Error("Connection refused from database");
      const result = classifyError(error);

      expect(result.classification).toBe("DATABASE_ERROR");
    });
  });

  describe("classifyError: External API Errors", () => {
    it("should classify HTTP errors", () => {
      const error = new Error("HTTP 502 Bad Gateway");
      const result = classifyError(error);

      expect(result.classification).toBe("EXTERNAL_API_ERROR");
      expect(result.statusCode).toBe(502);
      expect(result.code).toBe("API_001");
    });

    it("should classify fetch errors", () => {
      const error = new Error("fetch failed");
      const result = classifyError(error);

      expect(result.classification).toBe("EXTERNAL_API_ERROR");
    });

    it("should classify request timeout errors", () => {
      const error = new Error("request timeout");
      const result = classifyError(error);

      expect(result.classification).toBe("EXTERNAL_API_ERROR");
    });
  });

  describe("classifyError: Workspace Errors", () => {
    it("should classify workspace isolation errors", () => {
      const error = new Error("workspace scoping violation");
      const result = classifyError(error);

      expect(result.classification).toBe("WORKSPACE_ERROR");
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe("WS_001");
    });

    it("should classify workspace access errors", () => {
      const error = new Error("workspace access denied");
      const result = classifyError(error);

      expect(result.classification).toBe("WORKSPACE_ERROR");
    });

    it("should classify tenant isolation errors", () => {
      const error = new Error("tenant isolation violation");
      const result = classifyError(error);

      expect(result.classification).toBe("WORKSPACE_ERROR");
    });
  });

  describe("classifyError: Internal Errors", () => {
    it("should classify unknown errors as INTERNAL_ERROR", () => {
      const error = new Error("Something went wrong");
      const result = classifyError(error);

      expect(result.classification).toBe("INTERNAL_ERROR");
      expect(result.statusCode).toBe(500);
      expect(result.code).toBe("INT_001");
    });

    it("should handle non-Error objects", () => {
      const result = classifyError("string error");

      expect(result.classification).toBe("INTERNAL_ERROR");
      expect(result.message).toBe("string error");
    });

    it("should handle null errors", () => {
      const result = classifyError(null);

      expect(result.classification).toBe("INTERNAL_ERROR");
      expect(result.message).toBe("null");
    });
  });

  describe("classifyError: Context Preservation", () => {
    it("should preserve provided context", () => {
      const context = { userId: "user123", workspaceId: "ws456" };
      const error = new Error("Test error");
      const result = classifyError(error, context);

      expect(result.context).toEqual(context);
    });

    it("should include timestamp", () => {
      const error = new Error("Test error");
      const result = classifyError(error);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("formatErrorForLog", () => {
    it("should format error for logging", () => {
      const classified: ClassifiedError = {
        classification: "DATABASE_ERROR",
        message: "Connection failed",
        code: "DB_001",
        statusCode: 503,
        context: { db: "postgres" },
        timestamp: "2026-05-11T12:00:00Z",
      };

      const formatted = formatErrorForLog(classified);
      const parsed = JSON.parse(formatted);

      expect(parsed.classification).toBe("DATABASE_ERROR");
      expect(parsed.message).toBe("Connection failed");
      expect(parsed.code).toBe("DB_001");
      expect(parsed.statusCode).toBe(503);
    });

    it("should be valid JSON", () => {
      const classified: ClassifiedError = {
        classification: "AUTH_ERROR",
        message: "Unauthorized",
        statusCode: 401,
        timestamp: "2026-05-11T12:00:00Z",
      };

      const formatted = formatErrorForLog(classified);
      expect(() => JSON.parse(formatted)).not.toThrow();
    });
  });

  describe("extractErrorContext", () => {
    it("should extract context from Error objects", () => {
      const error = new Error("Test error");
      const context = extractErrorContext(error);

      expect(context.message).toBe("Test error");
      expect(context.name).toBe("Error");
      expect(context.stack).toBeDefined();
    });

    it("should extract stack trace (first 5 frames)", () => {
      const error = new Error("Test error");
      const context = extractErrorContext(error);

      expect(context.stack).toBeDefined();
      const frames = (context.stack as string).split("\n").length;
      expect(frames).toBeLessThanOrEqual(5);
    });

    it("should handle non-Error objects", () => {
      const context = extractErrorContext("string error");

      expect(context.rawError).toBe("string error");
    });

    it("should handle null", () => {
      const context = extractErrorContext(null);

      expect(context.rawError).toBe("null");
    });
  });

  describe("reportError", () => {
    it("should not throw when reporting errors", () => {
      const classified: ClassifiedError = {
        classification: "INTERNAL_ERROR",
        message: "Test error",
        statusCode: 500,
        timestamp: "2026-05-11T12:00:00Z",
      };

      // Should not throw
      expect(() => reportError(classified)).not.toThrow();
    });
  });

  describe("getErrorTrackingConfig", () => {
    it("should return a config object with required fields", () => {
      const config = getErrorTrackingConfig();

      expect(config).toHaveProperty("captureRate");
      expect(config).toHaveProperty("reportToSentry");
      expect(config).toHaveProperty("logLevel");
    });

    it("should have valid capture rate (0-1)", () => {
      const config = getErrorTrackingConfig();
      expect(config.captureRate).toBeGreaterThanOrEqual(0);
      expect(config.captureRate).toBeLessThanOrEqual(1);
    });

    it("should have valid log level", () => {
      const config = getErrorTrackingConfig();
      const validLevels = ["info", "warn", "error"];
      expect(validLevels).toContain(config.logLevel);
    });

    it("should have reportToSentry as boolean", () => {
      const config = getErrorTrackingConfig();
      expect(typeof config.reportToSentry).toBe("boolean");
    });
  });

  describe("Error Classification Comprehensiveness", () => {
    it("should classify all major error types", () => {
      const errorTests = [
        { msg: "Unauthorized", expected: "AUTH_ERROR" as ErrorClassification },
        { msg: "validation failed", expected: "VALIDATION_ERROR" as ErrorClassification },
        { msg: "database error", expected: "DATABASE_ERROR" as ErrorClassification },
        { msg: "HTTP 502", expected: "EXTERNAL_API_ERROR" as ErrorClassification },
        { msg: "workspace violation", expected: "WORKSPACE_ERROR" as ErrorClassification },
        { msg: "unknown", expected: "INTERNAL_ERROR" as ErrorClassification },
      ];

      errorTests.forEach(({ msg, expected }) => {
        const result = classifyError(new Error(msg));
        expect(result.classification).toBe(expected);
      });
    });

    it("should preserve error message in classification", () => {
      const message = "Custom error message";
      const error = new Error(message);
      const result = classifyError(error);

      expect(result.message).toBe(message);
    });

    it("should include timestamp in all classifications", () => {
      const errors = [
        new Error("Unauthorized"),
        new Error("validation failed"),
        new Error("database error"),
      ];

      errors.forEach((error) => {
        const result = classifyError(error);
        expect(result.timestamp).toBeDefined();
        expect(result.timestamp.length).toBeGreaterThan(0);
      });
    });
  });
});
