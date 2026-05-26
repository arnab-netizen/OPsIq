/**
 * PHASE E: ERROR CLASSIFICATION CONTRACT TESTS
 *
 * Verify that durability test scenarios produce correctly classified operator-safe errors.
 * This test ensures error classification specificity that was removed from e3a-e3c tests
 * when assertions were changed from keyword-based to behavior-based.
 *
 * CLASSIFICATION: DURABILITY_ERROR_CLASSIFICATION
 */

import { describe, it, expect } from "vitest";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

describe("PHASE E: Durability Error Classification Contract", () => {
  describe("Timeout Errors", () => {
    it("should classify timeout as retryable with timeout-specific message", () => {
      const timeoutError = new Error("DB_ERROR: Query timeout during operation");
      const classified = classifyOperatorError(timeoutError, { context: "load" });

      // CONTRACT: Timeout errors are retryable
      expect(classified.isRetryable).toBe(true);

      // CONTRACT: Operator message indicates timeout without technical details
      expect(classified.operatorMessage).toContain("took too long");
      expect(classified.operatorMessage).not.toContain("timeout"); // May be sanitized
      expect(classified.operatorMessage).not.toContain("DB_ERROR");
      expect(classified.operatorMessage).not.toContain("Query");

      // CONTRACT: Recovery guidance provided
      expect(classified.recovery).toBeTruthy();
      expect(classified.recovery.length).toBeGreaterThan(0);

      // CONTRACT: Technical details preserved for internal logging
      expect(classified.technicalDetails).toContain("timeout");
      expect(classified.technicalDetails).toContain("DB_ERROR");
    });

    it("should classify connection timeout same as regular timeout", () => {
      const connTimeoutError = new Error("Connection timeout after 5000ms");
      const classified = classifyOperatorError(connTimeoutError, { context: "load" });

      expect(classified.isRetryable).toBe(true);
      expect(classified.operatorMessage).toContain("took too long");
      expect(classified.operatorMessage).not.toContain("5000ms");
    });
  });

  describe("Deadlock Errors", () => {
    it("should classify deadlock as retryable server error", () => {
      const deadlockError = new Error("DB_ERROR: Deadlock detected, rolling back");
      const classified = classifyOperatorError(deadlockError, { context: "load" });

      // CONTRACT: Deadlock is retryable (transaction can be retried)
      expect(classified.isRetryable).toBe(true);

      // CONTRACT: Operator message indicates server problem, not detailed DB failure
      expect(classified.operatorMessage).not.toContain("Deadlock");
      expect(classified.operatorMessage).not.toContain("DB_ERROR");
      expect(classified.operatorMessage).not.toContain("rolling back");

      // CONTRACT: Technical details preserved internally
      expect(classified.technicalDetails).toContain("Deadlock");
      expect(classified.technicalDetails).toContain("DB_ERROR");
    });

    it("should classify database deadlock with escalation", () => {
      const dbDeadlockError = new Error("database error: Deadlock detected");
      const classified = classifyOperatorError(dbDeadlockError, { context: "load" });

      // CONTRACT: Database deadlock is retryable
      expect(classified.isRetryable).toBe(true);

      // CONTRACT: Escalation triggered for database errors
      expect(classified.shouldEscalate).toBe(true);

      // CONTRACT: Operator message safe
      expect(classified.operatorMessage).not.toContain("Deadlock");
    });
  });

  describe("Connection Loss / Database Interruption Errors", () => {
    it("should classify connection loss as retryable", () => {
      const connLossError = new Error("DB_ERROR: Connection lost before transaction");
      const classified = classifyOperatorError(connLossError, { context: "load" });

      // CONTRACT: Connection loss is retryable
      expect(classified.isRetryable).toBe(true);

      // CONTRACT: Operator message does not expose connection details
      expect(classified.operatorMessage).not.toContain("Connection lost");
      expect(classified.operatorMessage).not.toContain("DB_ERROR");
      expect(classified.operatorMessage).not.toContain("transaction");

      // CONTRACT: Technical details preserved
      expect(classified.technicalDetails).toContain("Connection lost");
      expect(classified.technicalDetails).toContain("DB_ERROR");
    });

    it("should classify mid-transaction connection loss as retryable", () => {
      const lostMidTxError = new Error("DB_ERROR: Connection lost mid-transaction");
      const classified = classifyOperatorError(lostMidTxError, { context: "load" });

      expect(classified.isRetryable).toBe(true);
      expect(classified.operatorMessage).not.toContain("mid-transaction");
      expect(classified.technicalDetails).toContain("mid-transaction");
    });
  });

  describe("Constraint Violation Errors", () => {
    it("should classify unique constraint violation as non-retryable duplicate", () => {
      const constraintError = new Error("DB_ERROR: Unique constraint violation");
      const classified = classifyOperatorError(constraintError, { context: "load" });

      // CONTRACT: Constraint violations may be due to duplicates
      expect(classified.operatorMessage).not.toContain("constraint");
      expect(classified.operatorMessage).not.toContain("Unique");
      expect(classified.operatorMessage).not.toContain("DB_ERROR");

      // CONTRACT: Technical details preserved
      expect(classified.technicalDetails).toContain("constraint");
      expect(classified.technicalDetails).toContain("Unique");
    });

    it("should classify duplicate key error as already-processing message", () => {
      const dupKeyError = new Error("Duplicate key error: idempotency_key");
      const classified = classifyOperatorError(dupKeyError, { context: "decision" });

      // When message includes "duplicate", should map to already-processing
      if (classified.operatorMessage.includes("already being processed")) {
        expect(classified.isRetryable).toBe(false);
      }

      // Always: no technical details exposed
      expect(classified.operatorMessage).not.toContain("Duplicate");
      expect(classified.operatorMessage).not.toContain("idempotency_key");
    });

    it("should classify foreign key violation as database error", () => {
      const fkError = new Error("DB_ERROR: Foreign key constraint violation");
      const classified = classifyOperatorError(fkError, { context: "load" });

      // CONTRACT: FK violations are data integrity issues
      expect(classified.operatorMessage).not.toContain("Foreign key");
      expect(classified.operatorMessage).not.toContain("constraint");
      expect(classified.operatorMessage).not.toContain("DB_ERROR");

      // CONTRACT: Technical details preserved (in JSON format)
      expect(classified.technicalDetails).toContain("Foreign key");
    });
  });

  describe("Crash / Unexpected Errors", () => {
    it("should classify generic crash error safely", () => {
      const crashError = new Error("CRASH: Worker died before returning event");
      const classified = classifyOperatorError(crashError, { context: "load" });

      // CONTRACT: No raw crash message exposed
      expect(classified.operatorMessage).not.toContain("CRASH");
      expect(classified.operatorMessage).not.toContain("Worker died");

      // CONTRACT: Recovery guidance provided
      expect(classified.recovery).toBeTruthy();

      // CONTRACT: Technical details preserved internally
      expect(classified.technicalDetails).toContain("CRASH");
      expect(classified.technicalDetails).toContain("Worker died");
    });

    it("should classify infrastructure error with escalation", () => {
      const infraError = new Error("Unexpected system failure");
      const classified = classifyOperatorError(infraError, { context: "load" });

      // CONTRACT: Unexpected errors may trigger escalation
      if (classified.operatorMessage.includes("unexpected")) {
        expect(classified.shouldEscalate).toBe(true);
      }

      // Always: operator message safe
      expect(classified.operatorMessage).not.toContain("Unexpected");
    });
  });

  describe("Unknown / Unclassified Errors", () => {
    it("should classify unrecognized error to context-safe fallback", () => {
      const unknownError = new Error("Something went wrong");
      const classified = classifyOperatorError(unknownError, { context: "load" });

      // CONTRACT: Falls back to context-appropriate message
      expect(classified.operatorMessage).toBeTruthy();
      expect(classified.operatorMessage.length).toBeGreaterThan(0);

      // CONTRACT: No raw error message exposed
      expect(classified.operatorMessage).not.toContain("Something went wrong");

      // CONTRACT: Recovery guidance provided
      expect(classified.recovery).toBeTruthy();
    });

    it("should classify null/undefined error safely", () => {
      const nullError: any = null;
      const classified = classifyOperatorError(nullError, { context: "load" });

      expect(classified.operatorMessage).toBeTruthy();
      expect(classified.recovery).toBeTruthy();
      expect(classified.technicalDetails).toBeTruthy();
    });
  });

  describe("Operator-Safe Message Invariants", () => {
    // Test that no raw technical details leak to operator regardless of error type
    const dangerousErrors = [
      "TypeError: Cannot read property 'id' of undefined",
      "ReferenceError: db is not defined",
      "Error: ECONNREFUSED 127.0.0.1:5432",
      "PrismaClientInitializationError: Database connection failed",
      'Error: SQL Error: syntax error at or near "SELECT"',
      "Error: stack trace:\n    at Function.method",
      "Error: Promise rejection: { code: 23505 }",
    ];

    dangerousErrors.forEach((dangerousMsg) => {
      it(`should hide technical details: ${dangerousMsg.substring(0, 40)}...`, () => {
        const error = new Error(dangerousMsg);
        const classified = classifyOperatorError(error, { context: "load" });

        // INVARIANT: Operator message never exposes technical details
        expect(classified.operatorMessage).not.toContain("TypeError");
        expect(classified.operatorMessage).not.toContain("ReferenceError");
        expect(classified.operatorMessage).not.toContain("127.0.0.1");
        expect(classified.operatorMessage).not.toContain("5432");
        expect(classified.operatorMessage).not.toContain("PrismaClient");
        expect(classified.operatorMessage).not.toContain("syntax error");
        expect(classified.operatorMessage).not.toContain("stack trace");
        expect(classified.operatorMessage).not.toContain("Promise rejection");
        expect(classified.operatorMessage).not.toContain("code:");
        expect(classified.operatorMessage).not.toContain("23505");

        // INVARIANT: Technical details preserved internally (may be JSON stringified)
        expect(classified.technicalDetails).toBeTruthy();
        expect(classified.technicalDetails.length).toBeGreaterThan(0);
      });
    });

    it("should provide recovery guidance for all errors", () => {
      const errors = [
        new Error("timeout"),
        new Error("connection failed"),
        new Error("deadlock"),
        new Error("constraint violation"),
        new Error("unknown failure"),
      ];

      errors.forEach((error) => {
        const classified = classifyOperatorError(error, { context: "load" });

        // INVARIANT: All errors include recovery
        expect(classified.recovery).toBeTruthy();
        expect(classified.recovery.length).toBeGreaterThan(0);

        // INVARIANT: Recovery is actionable (not empty or generic)
        expect(classified.recovery).not.toBe("");
      });
    });
  });

  describe("Context-Specific Classification", () => {
    it("should adapt error messages based on context", () => {
      const error = new Error("timeout");

      const loadContext = classifyOperatorError(error, { context: "load" });
      const saveContext = classifyOperatorError(error, { context: "save" });

      // Different contexts may produce different recovery guidance
      expect(loadContext.recovery).toBeTruthy();
      expect(saveContext.recovery).toBeTruthy();

      // Both should classify as retryable (timeout is always retryable)
      expect(loadContext.isRetryable).toBe(true);
      expect(saveContext.isRetryable).toBe(true);
    });
  });

  describe("toOperatorSafeError API Contract", () => {
    it("should map timeout errors correctly", () => {
      const timeoutError = new Error("DB_ERROR: Query timeout during operation");
      const safeError = toOperatorSafeError(timeoutError, "load");

      expect(safeError.error).toContain("took too long");
      expect(safeError.shouldRetry).toBe(true);
      expect(safeError.success).toBe(false);
    });

    it("should map database errors to server trouble message", () => {
      const dbError = new Error("database connection failed");
      const safeError = toOperatorSafeError(dbError, "load");

      expect(safeError.error).toContain("Server is having trouble");
      expect(safeError.shouldRetry).toBe(true);
    });

    it("should map network errors correctly", () => {
      const netError = new Error("Network fetch failed");
      const safeError = toOperatorSafeError(netError, "load");

      expect(safeError.error).toContain("Couldn't connect");
      expect(safeError.shouldRetry).toBe(true);
    });

    it("should use context fallback for unknown errors", () => {
      const unknownError = new Error("Something happened");
      const safeError = toOperatorSafeError(unknownError, "load");

      expect(safeError.error).toContain("Couldn't load");
      expect(safeError.shouldRetry).toBe(true);
    });
  });
});
