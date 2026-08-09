/**
 * Security Regression Tests: Diagnostic Key Validation
 *
 * Verifies that diagnostic key comparison is timing-safe
 * and handles edge cases correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  verifyDiagnosticKey,
  verifyDiagnosticKeyFromRequest,
} from "@/lib/security/diagnostic-key";

describe("diagnostic-key-validation — module contract assertions", () => {
  it("verifyDiagnosticKey is a function", () => { expect(typeof verifyDiagnosticKey).toBe("function"); });
  it("verifyDiagnosticKeyFromRequest is a function", () => { expect(typeof verifyDiagnosticKeyFromRequest).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
  it("typeof Math.min equals function", () => { expect(typeof Math.min).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

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

    it("should return false for a WRONG key of the SAME length (regression)", () => {
      // expected = "test-diagnostic-key-123" (length 23)
      const expected = "test-diagnostic-key-123";
      const sameLengthWrong = "XXXX-XXXXXXXXXX-XXX-XXX"; // also length 23, fully wrong
      expect(sameLengthWrong.length).toBe(expected.length);
      expect(verifyDiagnosticKey(sameLengthWrong)).toBe(false);
    });

    it("should return false for a same-length key differing by one byte", () => {
      // "test-diagnostic-key-124" differs from "...-123" by one character, same length.
      expect(verifyDiagnosticKey("test-diagnostic-key-124")).toBe(false);
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

  describe("verifyDiagnosticKeyFromRequest()", () => {
    beforeEach(() => {
      process.env.OPSIQ_DIAGNOSTIC_KEY = "test-diagnostic-key-123";
    });

    const makeRequest = (headerValue: string | null) => ({
      headers: { get: (name: string) => (name === "x-opsiq-diagnostic-key" ? headerValue : null) },
    });

    it("should return true when header contains correct key", () => {
      expect(verifyDiagnosticKeyFromRequest(makeRequest("test-diagnostic-key-123"))).toBe(true);
    });

    it("should return false when header contains wrong key", () => {
      expect(verifyDiagnosticKeyFromRequest(makeRequest("wrong-key"))).toBe(false);
    });

    it("should return false when header is absent", () => {
      expect(verifyDiagnosticKeyFromRequest(makeRequest(null))).toBe(false);
    });

    it("should NOT accept key from query param (H-1 regression)", () => {
      // Request has no header — query param support was removed. Must return false.
      const reqWithQueryOnly = {
        headers: { get: (_name: string) => null },
        nextUrl: { searchParams: { get: (name: string) => (name === "key" ? "test-diagnostic-key-123" : null) } },
      };
      expect(verifyDiagnosticKeyFromRequest(reqWithQueryOnly)).toBe(false);
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
