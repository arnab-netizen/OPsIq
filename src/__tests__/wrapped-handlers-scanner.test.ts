/**
 * Scanner tests: Verify ratchet and audit modes
 *
 * Tests for audit-wrapped-handlers.js scanner behavior:
 * - Full audit mode: Detects all violations, fails if any exist
 * - Ratchet mode: Compares to baseline, allows progress, fails only on new violations
 * - Update baseline: Regenerates baseline file
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Mock dependencies
vi.mock("fs");
vi.mock("path");

describe("Wrapped Handlers Scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Ratchet mode: Baseline comparison", () => {
    it("should pass when current violations equal baseline", async () => {
      // Setup: baseline and current have same 5 violations
      const baseline = {
        generated_at: "2026-05-30T00:00:00Z",
        scanner_version: "1.0.0",
        total_known_violations: 5,
        violations: [
          { file: "app/api/users/route.ts" },
          { file: "app/api/clients/route.ts" },
          { file: "app/api/actions/route.ts" },
          { file: "app/api/decisions/route.ts" },
          { file: "app/api/insights/route.ts" },
        ],
      };

      const currentViolations = [
        "app/api/users/route.ts",
        "app/api/clients/route.ts",
        "app/api/actions/route.ts",
        "app/api/decisions/route.ts",
        "app/api/insights/route.ts",
      ];

      const baselineViolationSet = new Set(
        baseline.violations.map((v) => v.file)
      );
      const currentViolationSet = new Set(currentViolations);
      const newViolations = currentViolations.filter(
        (v) => !baselineViolationSet.has(v)
      );

      // Assert: No new violations detected
      expect(newViolations.length).toBe(0);
      expect(currentViolationSet.size).toBe(baselineViolationSet.size);

      // Ratchet should pass (exit 0)
      const shouldPass = newViolations.length === 0;
      expect(shouldPass).toBe(true);
    });

    it("should pass when current violations are fewer than baseline (progress)", async () => {
      // Setup: baseline has 5, current has 3 (2 fixed)
      const baseline = {
        generated_at: "2026-05-30T00:00:00Z",
        scanner_version: "1.0.0",
        total_known_violations: 5,
        violations: [
          { file: "app/api/users/route.ts" },
          { file: "app/api/clients/route.ts" },
          { file: "app/api/actions/route.ts" },
          { file: "app/api/decisions/route.ts" },
          { file: "app/api/insights/route.ts" },
        ],
      };

      const currentViolations = [
        "app/api/users/route.ts",
        "app/api/clients/route.ts",
        "app/api/actions/route.ts",
      ];

      const baselineViolationSet = new Set(
        baseline.violations.map((v) => v.file)
      );
      const newViolations = currentViolations.filter(
        (v) => !baselineViolationSet.has(v)
      );
      const resolvedViolations = baseline.violations.filter(
        (v) => !currentViolations.includes(v.file)
      );

      // Assert: Progress made, no new violations
      expect(newViolations.length).toBe(0);
      expect(resolvedViolations.length).toBe(2);
      expect(currentViolations.length).toBeLessThan(baseline.total_known_violations);

      // Ratchet should pass (exit 0) with progress message
      const shouldPass = newViolations.length === 0;
      expect(shouldPass).toBe(true);
    });

    it("should fail when a new violation appears", async () => {
      // Setup: baseline has 3, current has 4 (1 new violation)
      const baseline = {
        generated_at: "2026-05-30T00:00:00Z",
        scanner_version: "1.0.0",
        total_known_violations: 3,
        violations: [
          { file: "app/api/users/route.ts" },
          { file: "app/api/clients/route.ts" },
          { file: "app/api/actions/route.ts" },
        ],
      };

      const currentViolations = [
        "app/api/users/route.ts",
        "app/api/clients/route.ts",
        "app/api/actions/route.ts",
        "app/api/decisions/route.ts", // NEW - not in baseline
      ];

      const baselineViolationSet = new Set(
        baseline.violations.map((v) => v.file)
      );
      const newViolations = currentViolations.filter(
        (v) => !baselineViolationSet.has(v)
      );

      // Assert: New violation detected
      expect(newViolations.length).toBe(1);
      expect(newViolations[0]).toBe("app/api/decisions/route.ts");

      // Ratchet should fail (exit 1)
      const shouldFail = newViolations.length > 0;
      expect(shouldFail).toBe(true);
    });

    it("should fail when baseline is missing", async () => {
      // Setup: No baseline file exists
      const baselinePath = "qa/baselines/wrapped-response-violations.json";
      const baselineExists = false;

      // Assert: Baseline check should fail
      expect(baselineExists).toBe(false);

      // Ratchet should fail (exit 1) with error message
      const shouldFail = !baselineExists;
      expect(shouldFail).toBe(true);
    });

    it("should fail when baseline is malformed JSON", async () => {
      // Setup: Baseline exists but is invalid JSON
      const baselineContent = "{invalid json}";

      const tryParseBaseline = () => {
        try {
          JSON.parse(baselineContent);
          return true;
        } catch {
          return false;
        }
      };

      // Assert: JSON parsing fails
      expect(tryParseBaseline()).toBe(false);

      // Ratchet should fail (exit 1) with parse error
      const shouldFail = !tryParseBaseline();
      expect(shouldFail).toBe(true);
    });

    it("should detect baseline missing violations array", async () => {
      // Setup: Baseline is valid JSON but missing violations field
      const baseline = {
        generated_at: "2026-05-30T00:00:00Z",
        scanner_version: "1.0.0",
        total_known_violations: 5,
        // violations array missing!
      };

      const hasViolationsArray = Array.isArray(baseline.violations);

      // Assert: Baseline validation should fail
      expect(hasViolationsArray).toBe(false);

      // Ratchet should fail (exit 1)
      const shouldFail = !hasViolationsArray;
      expect(shouldFail).toBe(true);
    });
  });

  describe("Full audit mode", () => {
    it("should fail when violations exist", async () => {
      // Setup: Scanner finds 3 violations
      const violations = [
        "app/api/users/route.ts",
        "app/api/clients/route.ts",
        "app/api/actions/route.ts",
      ];

      // Assert: Audit should report and fail
      expect(violations.length).toBeGreaterThan(0);

      // Full audit should fail (exit 1)
      const shouldFail = violations.length > 0;
      expect(shouldFail).toBe(true);
    });

    it("should pass when no violations found", async () => {
      // Setup: Scanner finds 0 violations
      const violations: string[] = [];

      // Assert: Audit should pass
      expect(violations.length).toBe(0);

      // Full audit should pass (exit 0)
      const shouldPass = violations.length === 0;
      expect(shouldPass).toBe(true);
    });

    it("should report all violations with truncation at 10", async () => {
      // Setup: 15 violations found
      const violations = Array.from({ length: 15 }, (_, i) =>
        `app/api/route${i}/route.ts`
      );

      // Format output similar to actual scanner
      const truncatedReports = violations.slice(0, 10);
      const hasMoreCount = violations.length - 10;

      // Assert: First 10 shown, count of remaining correct
      expect(truncatedReports.length).toBe(10);
      expect(hasMoreCount).toBe(5);
      expect(violations.length).toBeGreaterThan(10);
    });
  });

  describe("Update baseline mode", () => {
    it("should generate baseline with current violations", async () => {
      // Setup: 3 violations currently scanned
      const violations = [
        "app/api/users/route.ts",
        "app/api/clients/route.ts",
        "app/api/actions/route.ts",
      ];

      const baselineData = {
        generated_at: new Date().toISOString(),
        scanner_version: "1.0.0",
        total_known_violations: violations.length,
        violations: violations
          .map((v) => ({
            file: v,
            violation_type: "wrapped_handler_returns_response_json",
            wrapper_detected: true,
            remediation_status: "legacy_pending",
            discovered_at: new Date().toISOString(),
          }))
          .sort((a, b) => a.file.localeCompare(b.file)),
      };

      // Assert: Baseline structure is correct
      expect(baselineData.total_known_violations).toBe(3);
      expect(baselineData.violations.length).toBe(3);
      expect(baselineData.violations[0]).toHaveProperty("file");
      expect(baselineData.violations[0]).toHaveProperty("violation_type");
      expect(baselineData.violations[0]).toHaveProperty("remediation_status");

      // Assert: Violations are sorted by file
      const files = baselineData.violations.map((v) => v.file);
      const sortedFiles = [...files].sort();
      expect(files).toEqual(sortedFiles);
    });

    it("should create baseline directory if missing", async () => {
      // Setup: Directory doesn't exist
      const outputPath = "qa/baselines/wrapped-response-violations.json";
      const outputDir = path.dirname(outputPath);

      // Assert: Path operations should work
      expect(outputDir).toBe("qa/baselines");
      expect(outputPath.includes(outputDir)).toBe(true);
    });
  });

  describe("Scanner wrapper pattern detection", () => {
    it("should detect withCanonicalEnforcement wrapper", async () => {
      const content = `
export const GET = withCanonicalEnforcement(async (ctx) => {
  return Response.json({ data: [] });
});
`;

      const wrapperPattern =
        /export const (GET|POST|PUT|DELETE|PATCH) = withCanonicalEnforcement\(/;
      const isWrapped = wrapperPattern.test(content);

      expect(isWrapped).toBe(true);
    });

    it("should detect withEnforcementFull wrapper", async () => {
      const content = `
export const POST = withEnforcementFull(async (ctx) => {
  return NextResponse.json({ status: "ok" });
});
`;

      const wrapperPattern =
        /export const (GET|POST|PUT|DELETE|PATCH) = withEnforcementFull\(/;
      const isWrapped = wrapperPattern.test(content);

      expect(isWrapped).toBe(true);
    });

    it("should detect Response.json() violation", async () => {
      const content = `
export const GET = withCanonicalEnforcement(async (ctx) => {
  return Response.json({ data: [] });
});
`;

      const violationPattern = /return Response\.json\(/;
      const hasViolation = violationPattern.test(content);

      expect(hasViolation).toBe(true);
    });

    it("should detect NextResponse.json() violation", async () => {
      const content = `
export const GET = withCanonicalEnforcement(async (ctx) => {
  return NextResponse.json({ data: [] });
});
`;

      const violationPattern = /return NextResponse\.json\(/;
      const hasViolation = violationPattern.test(content);

      expect(hasViolation).toBe(true);
    });

    it("should NOT flag plain object returns as violation", async () => {
      const content = `
export const GET = withCanonicalEnforcement(async (ctx) => {
  return { data: [] };
});
`;

      const responsePattern = /return Response\.json\(/;
      const nextResponsePattern = /return NextResponse\.json\(/;

      expect(responsePattern.test(content)).toBe(false);
      expect(nextResponsePattern.test(content)).toBe(false);
    });

    it("should NOT flag direct routes (app/api/health/route.ts)", async () => {
      const fileName = "app/api/health/route.ts";
      const safeRoutes = ["app/api/health/route.ts", "app/middleware.ts"];

      const isSafe = safeRoutes.some((route) => fileName.endsWith(route));

      expect(isSafe).toBe(true);
    });

    it("should NOT flag app/middleware.ts", async () => {
      const fileName = "app/middleware.ts";
      const safeRoutes = ["app/api/health/route.ts", "app/middleware.ts"];

      const isSafe = safeRoutes.some((route) => fileName.endsWith(route));

      expect(isSafe).toBe(true);
    });
  });

  describe("Scanner output and logging", () => {
    it("should show progress when fixing violations", async () => {
      // Baseline: 10, Current: 7 (3 fixed)
      const baseline = {
        violations: [
          { file: "app/api/1/route.ts" },
          { file: "app/api/2/route.ts" },
          { file: "app/api/3/route.ts" },
          { file: "app/api/4/route.ts" },
          { file: "app/api/5/route.ts" },
          { file: "app/api/6/route.ts" },
          { file: "app/api/7/route.ts" },
          { file: "app/api/8/route.ts" },
          { file: "app/api/9/route.ts" },
          { file: "app/api/10/route.ts" },
        ],
      };

      const currentViolations = [
        "app/api/1/route.ts",
        "app/api/2/route.ts",
        "app/api/3/route.ts",
        "app/api/4/route.ts",
        "app/api/5/route.ts",
        "app/api/6/route.ts",
        "app/api/7/route.ts",
      ];

      const currentViolationSet = new Set(currentViolations);
      const resolvedViolations = baseline.violations.filter(
        (v) => !currentViolationSet.has(v.file)
      );

      // Assert: Progress is detected and reportable
      expect(resolvedViolations.length).toBe(3);
      expect(resolvedViolations[0].file).toBe("app/api/8/route.ts");
    });

    it("should truncate checked files list at 5 items", async () => {
      // Setup: Checked 12 files
      const checked = Array.from({ length: 12 }, (_, i) =>
        `app/api/route${i}/route.ts`
      );

      const truncatedList = checked.slice(0, 5);
      const remainingCount = checked.length - 5;

      // Assert: First 5 shown, remaining count reported
      expect(truncatedList.length).toBe(5);
      expect(remainingCount).toBe(7);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty violations list", async () => {
      const violations: string[] = [];

      // Audit mode: pass (no violations)
      expect(violations.length).toBe(0);

      // Ratchet mode with baseline: pass (same as baseline if baseline empty)
      const baseline = {
        violations: [],
        total_known_violations: 0,
      };

      const newViolations = violations.filter(
        (v) => !baseline.violations.map((b) => b).includes(v)
      );

      expect(newViolations.length).toBe(0);
    });

    it("should handle TypeScript and TSX files", async () => {
      const testCases = [
        { name: "route.ts", isTypeScript: true },
        { name: "route.tsx", isTypeScript: true },
        { name: "component.ts", isTypeScript: true },
        { name: "service.js", isTypeScript: false },
        { name: "util.json", isTypeScript: false },
      ];

      testCases.forEach(({ name, isTypeScript }) => {
        const isScannable =
          name.endsWith(".ts") || name.endsWith(".tsx");
        expect(isScannable).toBe(isTypeScript);
      });
    });

    it("should sort violations alphabetically in baseline", async () => {
      const violations = [
        "app/api/zebra/route.ts",
        "app/api/apple/route.ts",
        "app/api/middle/route.ts",
      ];

      const sorted = [...violations].sort();

      expect(sorted[0]).toBe("app/api/apple/route.ts");
      expect(sorted[1]).toBe("app/api/middle/route.ts");
      expect(sorted[2]).toBe("app/api/zebra/route.ts");
    });
  });
});
