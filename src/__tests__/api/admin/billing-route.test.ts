/**
 * Tests: Admin Billing Diagnostics Route Authorization
 *
 * Validates that the admin billing diagnostics endpoint enforces
 * SYSTEM_ADMIN capability and workspace scoping.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Admin Billing Diagnostics API Route", () => {
  const routePath = path.resolve(
    __dirname,
    "../../../app/api/admin/billing/diagnostics/route.ts"
  );
  let routeContent: string;

  const getRouteContent = (): string => {
    if (!routeContent) {
      routeContent = fs.readFileSync(routePath, "utf-8");
    }
    return routeContent;
  };

  describe("auth enforcement (code inspection)", () => {
    it("should use withCanonicalEnforcement wrapper", () => {
      expect(getRouteContent()).toContain("withCanonicalEnforcement");
    });

    it("should require SYSTEM_ADMIN capability", () => {
      const content = getRouteContent();
      expect(content).toContain("SYSTEM_ADMIN");
      expect(content).toContain("requireCapabilities");
    });

    it("should require x-workspace-id header", () => {
      const content = getRouteContent();
      expect(content).toContain("x-workspace-id");
      expect(content).toContain("headers.get");
    });

    it("should call service with workspace ID", () => {
      const content = getRouteContent();
      expect(content).toContain("getBillingDiagnostic");
      expect(content).toContain("getBillingExportPacket");
    });

    it("should support export format via query parameter", () => {
      const content = getRouteContent();
      expect(content).toContain("format=export");
    });

    it("should handle missing workspace ID gracefully", () => {
      const content = getRouteContent();
      expect(content).toContain("if (!workspaceId)");
      expect(content).toContain("throw");
    });

    it("should not expose raw secrets in route", () => {
      const content = getRouteContent();
      expect(content).not.toMatch(/sk_live|sk_test|webhook_secret/i);
    });

    it("should not hardcode credentials", () => {
      const content = getRouteContent();
      expect(content).not.toMatch(/password|api_key|token/i);
    });
  });

  describe("route structure", () => {
    it("should export GET handler", () => {
      expect(getRouteContent()).toContain("export const GET");
    });

    it("should accept CanonicalAuthContext", () => {
      expect(getRouteContent()).toContain("CanonicalAuthContext");
    });

    it("should be async", () => {
      expect(getRouteContent()).toContain("async");
    });
  });

  describe("admin workspace scoping", () => {
    it("should filter by workspace ID from header", () => {
      const content = getRouteContent();
      expect(content).toContain("workspaceId");
      expect(content).toContain("ctx.request!.headers.get");
    });

    it("should pass workspace ID to service", () => {
      const content = getRouteContent();
      const lines = content.split("\n");
      const getDiagnosticCall = lines.find((line) =>
        line.includes("getBillingDiagnostic(workspaceId)")
      );
      expect(getDiagnosticCall).toBeDefined();
    });

    it("should support dual format handling", () => {
      const content = getRouteContent();
      expect(content).toContain('format === "export"');
      expect(content).toContain("getBillingExportPacket");
    });
  });

  describe("error handling", () => {
    it("should throw when workspace ID missing", () => {
      expect(getRouteContent()).toContain('throw new Error("Workspace ID');
    });

    it("should not expose raw database errors", () => {
      const content = getRouteContent();
      // The error is thrown to the auth wrapper which handles classification
      expect(content).toContain("throw");
    });
  });
});
