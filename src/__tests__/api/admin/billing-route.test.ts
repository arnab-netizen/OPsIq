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

    it("should scope to the verified workspace, never a client header (GAP-TEN-03)", () => {
      const content = getRouteContent();
      // system_admin is workspace-scoped (getPolicyContext filters roles by
      // scope=workspace); the diagnostic must use the membership-verified
      // workspace and must NOT trust a client-supplied x-workspace-id header.
      expect(content).toContain("ctx.verifiedWorkspaceId");
      expect(content).toContain("requireWorkspace: true");
      expect(content).not.toContain('headers.get("x-workspace-id")');
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

    it("should require workspace context via the canonical wrapper", () => {
      // Missing/invalid workspace membership is rejected by the wrapper
      // (requireWorkspace: true) before the handler runs — no manual header
      // null-check is needed or wanted.
      const content = getRouteContent();
      expect(content).toContain("requireWorkspace: true");
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
    it("should filter by the verified workspace, not a client header", () => {
      const content = getRouteContent();
      expect(content).toContain("workspaceId");
      expect(content).toContain("ctx.verifiedWorkspaceId");
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
    it("should delegate missing-workspace rejection to the canonical wrapper", () => {
      // The wrapper (requireWorkspace: true) fails closed before the handler
      // when the caller has no verified workspace membership.
      expect(getRouteContent()).toContain("requireWorkspace: true");
    });

    it("should not expose raw database errors", () => {
      const content = getRouteContent();
      // Error classification/sanitization is delegated to withCanonicalEnforcement
      // (no raw error rendering in the handler); the handler stays thin.
      expect(content).toContain("withCanonicalEnforcement");
      expect(content).not.toMatch(/error\.message/);
    });
  });
});
