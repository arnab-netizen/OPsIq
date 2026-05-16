/**
 * Tests: Structured Logging Service
 *
 * Validates structured logging, context management, log formatting,
 * and buffer management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LogLevel,
  logger,
  createLogger,
  setGlobalContext,
  clearGlobalContext,
  updateGlobalContext,
  getGlobalContext,
  flushLogs,
  getLogBuffer,
  clearLogBuffer,
  DEFAULT_CONFIG,
} from "@/infra/logger";

describe("Structured Logger", () => {
  beforeEach(() => {
    clearGlobalContext();
    clearLogBuffer();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    flushLogs();
    clearLogBuffer();
  });

  describe("Log Levels", () => {
    it("should have all log levels defined", () => {
      expect(LogLevel.DEBUG).toBe("DEBUG");
      expect(LogLevel.INFO).toBe("INFO");
      expect(LogLevel.WARN).toBe("WARN");
      expect(LogLevel.ERROR).toBe("ERROR");
      expect(LogLevel.FATAL).toBe("FATAL");
    });

    it("should respect minimum log level", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.WARN };
      logger.debug("debug message", {}, undefined, config);
      logger.info("info message", {}, undefined, config);

      const buffer = getLogBuffer();
      expect(buffer.length).toBe(0);
    });

    it("should log warnings and above with WARN config", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.WARN };
      logger.warn("warn message", {}, undefined, config);
      logger.error("error message", undefined, {}, undefined, config);

      const buffer = getLogBuffer();
      // Errors are written immediately, warn is buffered
      expect(buffer.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Basic Logging", () => {
    it("should log debug messages", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.DEBUG };
      logger.debug("test debug", {}, undefined, config);

      flushLogs(config);
      expect(console.log).toHaveBeenCalled();
    });

    it("should log info messages", () => {
      logger.info("test info");
      flushLogs();
      expect(console.log).toHaveBeenCalled();
    });

    it("should log warning messages", () => {
      logger.warn("test warning");
      flushLogs();
      expect(console.warn).toHaveBeenCalled();
    });

    it("should log error messages", () => {
      logger.error("test error");
      expect(console.error).toHaveBeenCalled();
    });

    it("should log fatal messages", () => {
      logger.fatal("test fatal");
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should capture error object", () => {
      const error = new Error("Test error");
      logger.error("operation failed", error);

      const buffer = getLogBuffer();
      const lastEntry = buffer.find((e) => e.level === LogLevel.ERROR);

      expect(lastEntry?.error).toBeDefined();
      expect(lastEntry?.error?.name).toBe("Error");
      expect(lastEntry?.error?.message).toBe("Test error");
    });

    it("should capture error stack trace", () => {
      const error = new Error("Test error with stack");
      logger.error("operation failed", error);

      const buffer = getLogBuffer();
      const entry = buffer.find((e) => e.level === LogLevel.ERROR);

      expect(entry?.error?.stack).toBeDefined();
      expect(entry?.error?.stack).toContain("Test error with stack");
    });

    it("should handle non-Error objects", () => {
      logger.error("operation failed", "string error");

      const buffer = getLogBuffer();
      const entry = buffer.find((e) => e.level === LogLevel.ERROR);

      expect(entry?.error?.message).toBe("string error");
    });
  });

  describe("Context Management", () => {
    it("should set global context", () => {
      setGlobalContext({ requestId: "req-123", userId: "user-1" });

      const context = getGlobalContext();
      expect(context.requestId).toBe("req-123");
      expect(context.userId).toBe("user-1");
    });

    it("should merge contexts", () => {
      setGlobalContext({ requestId: "req-123" });
      updateGlobalContext({ userId: "user-1" });

      const context = getGlobalContext();
      expect(context.requestId).toBe("req-123");
      expect(context.userId).toBe("user-1");
    });

    it("should clear global context", () => {
      setGlobalContext({ requestId: "req-123" });
      clearGlobalContext();

      const context = getGlobalContext();
      expect(Object.keys(context).length).toBe(0);
    });

    it("should include global context in log entries", () => {
      setGlobalContext({ workspaceId: "ws-1", userId: "user-1" });
      logger.info("test message");

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.context.workspaceId).toBe("ws-1");
      expect(entry?.context.userId).toBe("user-1");
    });

    it("should merge global and local context", () => {
      setGlobalContext({ workspaceId: "ws-1" });
      logger.info("test message", { userId: "user-1" });

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.context.workspaceId).toBe("ws-1");
      expect(entry?.context.userId).toBe("user-1");
    });

    it("should allow local context to override global", () => {
      setGlobalContext({ userId: "global-user" });
      logger.info("test message", { userId: "local-user" });

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.context.userId).toBe("local-user");
    });
  });

  describe("Log Formatting", () => {
    it("should format as JSON by default", () => {
      logger.info("test message", { requestId: "req-123" });

      flushLogs();
      const callArgs = (console.log as any).mock.calls[0][0];

      const parsed = JSON.parse(callArgs);
      expect(parsed.message).toBe("test message");
      expect(parsed.level).toBe("INFO");
    });

    it("should format as text when configured", () => {
      const config = { ...DEFAULT_CONFIG, format: "text" as const };
      logger.info("test message", {}, undefined, config);

      flushLogs(config);
      const callArgs = (console.log as any).mock.calls[0][0];

      expect(callArgs).toContain("[INFO]");
      expect(callArgs).toContain("test message");
    });

    it("should include timestamp in JSON", () => {
      logger.info("test message");

      flushLogs();
      const callArgs = (console.log as any).mock.calls[0][0];
      const parsed = JSON.parse(callArgs);

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it("should include timestamp in text format", () => {
      const config = { ...DEFAULT_CONFIG, format: "text" as const };
      logger.info("test message", {}, undefined, config);

      flushLogs(config);
      const callArgs = (console.log as any).mock.calls[0][0];

      expect(callArgs).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it("should include metadata in JSON", () => {
      logger.info("test message", {}, { statusCode: 201, duration: 123 });

      flushLogs();
      const callArgs = (console.log as any).mock.calls[0][0];
      const parsed = JSON.parse(callArgs);

      expect(parsed.metadata.statusCode).toBe(201);
      expect(parsed.metadata.duration).toBe(123);
    });

    it("should skip empty context in JSON", () => {
      logger.info("test message");

      flushLogs();
      const callArgs = (console.log as any).mock.calls[0][0];
      const parsed = JSON.parse(callArgs);

      expect(parsed.context).toBeUndefined();
    });

    it("should skip context when includeContext is false", () => {
      const config = { ...DEFAULT_CONFIG, includeContext: false };
      setGlobalContext({ requestId: "req-123" });
      logger.info("test message", {}, undefined, config);

      flushLogs(config);
      const callArgs = (console.log as any).mock.calls[0][0];
      const parsed = JSON.parse(callArgs);

      expect(parsed.context).toBeUndefined();
    });
  });

  describe("Log Buffer Management", () => {
    it("should buffer non-error logs", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.DEBUG };
      logger.debug("debug message", {}, undefined, config);
      logger.info("info message", {}, undefined, config);

      const buffer = getLogBuffer();
      expect(buffer.length).toBeGreaterThanOrEqual(2);
    });

    it("should write errors immediately", () => {
      logger.error("error message");

      expect(console.error).toHaveBeenCalled();
    });

    it("should flush buffer on demand", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.DEBUG };
      logger.info("test message", {}, undefined, config);

      const beforeFlush = getLogBuffer().length;
      flushLogs(config);
      const afterFlush = getLogBuffer().length;

      expect(beforeFlush).toBeGreaterThan(0);
      expect(afterFlush).toBe(0);
    });

    it("should respect maxBufferSize", () => {
      const config = { ...DEFAULT_CONFIG, maxBufferSize: 5, minLevel: LogLevel.DEBUG };
      for (let i = 0; i < 10; i++) {
        logger.debug(`message ${i}`, {}, undefined, config);
      }

      // Some should have been flushed
      expect(console.log).toHaveBeenCalled();
    });

    it("should clear log buffer", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.DEBUG };
      logger.info("test message", {}, undefined, config);

      expect(getLogBuffer().length).toBeGreaterThan(0);

      clearLogBuffer();
      expect(getLogBuffer().length).toBe(0);
    });
  });

  describe("Child Logger", () => {
    it("should create logger with default context", () => {
      const childLogger = createLogger({ requestId: "req-123" });
      childLogger.info("test message");

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.context.requestId).toBe("req-123");
    });

    it("should merge child context with local context", () => {
      const childLogger = createLogger({ requestId: "req-123" });
      childLogger.info("test message", { userId: "user-1" });

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.context.requestId).toBe("req-123");
      expect(entry?.context.userId).toBe("user-1");
    });

    it("should support all log levels", () => {
      const childLogger = createLogger({ requestId: "req-123" });

      childLogger.debug("debug");
      childLogger.info("info");
      childLogger.warn("warn");
      childLogger.error("error");
      childLogger.fatal("fatal");

      const buffer = getLogBuffer();
      expect(buffer.filter((e) => e.context.requestId === "req-123").length).toBeGreaterThan(0);
    });

    it("should allow local context to override child context", () => {
      const childLogger = createLogger({ requestId: "child-req" });
      childLogger.info("test message", { requestId: "local-req" });

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.context.requestId).toBe("local-req");
    });
  });

  describe("Log Entry Timestamps", () => {
    it("should include timestamp in entries", () => {
      logger.info("test message");

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.timestamp).toBeDefined();
      expect(entry?.timestamp instanceof Date).toBe(true);
    });

    it("should have current timestamp", () => {
      const before = new Date();
      logger.info("test message");
      const after = new Date();

      const entry = getLogBuffer().find((e) => e.message === "test message");

      expect(entry?.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(entry?.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("Log Context Variations", () => {
    it("should handle requestId", () => {
      logger.info("test", { requestId: "req-123" });

      const entry = getLogBuffer().find((e) => e.message === "test");
      expect(entry?.context.requestId).toBe("req-123");
    });

    it("should handle userId", () => {
      logger.info("test", { userId: "user-456" });

      const entry = getLogBuffer().find((e) => e.message === "test");
      expect(entry?.context.userId).toBe("user-456");
    });

    it("should handle workspaceId", () => {
      logger.info("test", { workspaceId: "ws-789" });

      const entry = getLogBuffer().find((e) => e.message === "test");
      expect(entry?.context.workspaceId).toBe("ws-789");
    });

    it("should handle correlationId", () => {
      logger.info("test", { correlationId: "corr-111" });

      const entry = getLogBuffer().find((e) => e.message === "test");
      expect(entry?.context.correlationId).toBe("corr-111");
    });

    it("should handle custom context fields", () => {
      const config = { ...DEFAULT_CONFIG, minLevel: LogLevel.DEBUG };
      logger.info("test", { customField: "value", anotherField: 42 }, undefined, config);

      const entry = getLogBuffer().find((e) => e.message === "test");
      expect(entry?.context.customField).toBe("value");
      expect(entry?.context.anotherField).toBe(42);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should log API request flow", () => {
      const requestLogger = createLogger({ requestId: "api-req-1" });

      requestLogger.info("Request received", { method: "POST", path: "/api/actions" });
      requestLogger.debug("Validating input", {}, { schema: "ActionSchema" });
      requestLogger.info("Request processed", {}, { statusCode: 201, duration: 45 });

      const entries = getLogBuffer().filter((e) => e.context.requestId === "api-req-1");

      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[0].message).toBe("Request received");
      expect(entries.some((e) => e.message === "Request processed")).toBe(true);
    });

    it("should log errors with context", () => {
      const error = new Error("Database connection failed");
      logger.error("Operation failed", error, { requestId: "req-fail", userId: "user-1" }, {
        operation: "createAction",
        retry: true,
      });

      expect(console.error).toHaveBeenCalled();
    });

    it("should track request through multiple operations", () => {
      setGlobalContext({ requestId: "multi-op-1", userId: "user-1" });

      logger.info("Starting validation");
      logger.info("Validation passed");
      logger.info("Saving data");
      logger.info("Operation complete");

      const entries = getLogBuffer();

      expect(entries.length).toBeGreaterThanOrEqual(4);
      expect(entries.every((e) => e.context.requestId === "multi-op-1")).toBe(true);
      expect(entries.every((e) => e.context.userId === "user-1")).toBe(true);
    });
  });
});
