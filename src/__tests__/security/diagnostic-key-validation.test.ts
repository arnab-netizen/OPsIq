/**
 * Security Regression Tests: Diagnostic Key Validation
 *
 * Verifies that diagnostic key comparison is timing-safe
 * and handles edge cases correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  verifyDiagnosticKey,
  extractDiagnosticKeyFromRequest,
} from "@/lib/security/diagnostic-key";

describe("Diagnostic Key Validation", () => {
  const originalEnv = process.env.OPSIQ_DIAGNOSTIC_KEY;

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.OPSIQ_DIAGNOSTIC_KEY = originalEnv;
    } else {
      delete process.env.OPSIQ_DIAGNOSTIC_KEY;
    }
  });

  describe("verifyDiagnosticKey()", () => {
    beforeEach(() => {
      process.env.OPSIQ_DIAGNOSTIC_KEY = "test-diagnostic-key-123";
    });

    it("should return true for correct key", () => {
      expect(verifyDiagnosticKey("test-diagnostic-key-123")).toBe(true);
    });

    it("should return false for incorrect key", () => {
      expect(verifyDiagnosticKey("wrong-key")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(verifyDiagnosticKey("")).toBe(false);
    });

    it("should return false for null", () => {
      expect(verifyDiagnosticKey(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(verifyDiagnosticKey(undefined)).toBe(false);
    });

    it("should return false when environment key is not configured", () => {
      delete process.env.OPSIQ_DIAGNOSTIC_KEY;
      expect(verifyDiagnosticKey("test-key")).toBe(false);
    });

    it("should return false for different length strings", () => {
      expect(verifyDiagnosticKey("test-key-short")).toBe(false);
      expect(verifyDiagnosticKey("test-diagnostic-key-123-extra-long")).toBe(false);
    });

    it("should trim whitespace from provided key", () => {
      expect(verifyDiagnosticKey("  test-diagnostic-key-123  ")).toBe(true);
      expect(verifyDiagnosticKey("\ntest-diagnostic-key-123\n")).toBe(true);
    });

    it("should handle UTF-8 keys correctly", () => {
      const unicodeKey = "test-key-🔐-unicode";
      process.env.OPSIQ_DIAGNOSTIC_KEY = unicodeKey;
      expect(verifyDiagnosticKey(unicodeKey)).toBe(true);
      expect(verifyDiagnosticKey("wrong-key-🔐")).toBe(false);
    });
  });

  describe("extractDiagnosticKeyFromRequest()", () => {
    it("should return header value when present", () => {
      expect(extractDiagnosticKeyFromRequest("header-key", null)).toBe(
        "header-key"
      );
    });

    it("should return query param when header is null", () => {
      expect(extractDiagnosticKeyFromRequest(null, "query-key")).toBe(
        "query-key"
      );
    });

    it("should prefer header over query param", () => {
      expect(extractDiagnosticKeyFromRequest("header-key", "query-key")).toBe(
        "header-key"
      );
    });

    it("should return null when both are null", () => {
      expect(extractDiagnosticKeyFromRequest(null, null)).toBe(null);
    });
  });

  describe("Timing-safety (no exceptions on mismatched lengths)", () => {
    beforeEach(() => {
      process.env.OPSIQ_DIAGNOSTIC_KEY = "12345";
    });

    it("should not throw for length mismatch", () => {
      expect(() => {
        verifyDiagnosticKey("1");
        verifyDiagnosticKey("123456789");
        verifyDiagnosticKey("");
      }).not.toThrow();
    });

    it("should return consistent false for different lengths", () => {
      expect(verifyDiagnosticKey("1")).toBe(false);
      expect(verifyDiagnosticKey("123456789")).toBe(false);
      expect(verifyDiagnosticKey("123456")).toBe(false);
    });
  });
});
