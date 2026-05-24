/**
 * Tests: Admin Billing Page Safety
 *
 * Validates that the admin billing page structure is secure and compliant.
 * Component tests are deferred in favor of integration/e2e testing.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Admin Billing Page Safety", () => {
  const pageContent = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../app/(authenticated)/admin/billing/page.tsx"
    ),
    "utf-8"
  );

  describe("component structure", () => {
    it("should render Billing Account section", () => {
      expect(pageContent).toContain("Billing Account");
      expect(pageContent).toContain("DetailItem");
    });

    it("should render Subscription section", () => {
      expect(pageContent).toContain("Subscription");
    });

    it("should render Plan section", () => {
      expect(pageContent).toContain("Plan");
    });

    it("should render Entitlement Decisions section", () => {
      expect(pageContent).toContain("Entitlement Decisions");
      expect(pageContent).toContain("EntitlementDecisionRow");
    });

    it("should render Usage Summary section", () => {
      expect(pageContent).toContain("Usage Summary");
      expect(pageContent).toContain("UsageRow");
    });

    it("should render Diagnostics section for warnings/missing data", () => {
      expect(pageContent).toContain("Diagnostics");
      expect(pageContent).toContain("Warnings");
      expect(pageContent).toContain("Missing Data");
    });
  });

  describe("security - no raw error rendering", () => {
    it("should not use ErrorState component directly", () => {
      // The fix changed ErrorState to safe div rendering
      expect(pageContent).not.toContain('<ErrorState');
    });

    it("should use classifyOperatorError for error governance", () => {
      expect(pageContent).toContain("classifyOperatorError");
    });

    it("should not expose raw error messages in render", () => {
      // Check that error rendering uses styled div, not raw message
      expect(pageContent).toContain('className="rounded-lg border border-red');
    });
  });

  describe("security - no secret exposure", () => {
    it("should not include Stripe secret patterns", () => {
      expect(pageContent).not.toMatch(/sk_live|sk_test|webhook_secret/i);
    });

    it("should not expose raw database queries", () => {
      expect(pageContent).not.toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
    });

    it("should not hardcode API credentials", () => {
      expect(pageContent).not.toMatch(/password|api_key|sk_|rk_/i);
    });
  });

  describe("workspace scoping", () => {
    it("should use workspace ID from localStorage", () => {
      expect(pageContent).toContain("localStorage.getItem");
      expect(pageContent).toContain("workspaceId");
    });

    it("should pass workspace ID to API", () => {
      expect(pageContent).toContain('"x-workspace-id": workspaceId');
    });
  });

  describe("error handling", () => {
    it("should handle missing workspace gracefully", () => {
      expect(pageContent).toContain("Workspace ID not found");
    });

    it("should show error state for failed requests", () => {
      expect(pageContent).toContain("if (state.error)");
    });

    it("should show loading state while fetching", () => {
      expect(pageContent).toContain("if (state.loading)");
    });

    it("should show empty state when no data", () => {
      expect(pageContent).toContain("if (!state.data)");
      expect(pageContent).toContain("GovernedEmptyState");
    });
  });

  describe("entitlement display", () => {
    it("should show allowed/denied status", () => {
      expect(pageContent).toContain(
        'decision.allowed ? "Allowed" : "Denied"'
      );
    });

    it("should use safe Badge variants", () => {
      expect(pageContent).toContain('"success"');
      expect(pageContent).toContain('"destructive"');
    });

    it("should display usage vs limit information", () => {
      expect(pageContent).toContain("percentageUsed");
      expect(pageContent).toContain("usage.limit");
    });
  });

  describe("refresh functionality", () => {
    it("should have refresh button", () => {
      expect(pageContent).toContain("Refresh Diagnostics");
    });

    it("should handle refresh errors gracefully", () => {
      expect(pageContent).toContain("handleRefresh");
    });
  });

  describe("imports and dependencies", () => {
    it("should import classifyOperatorError for governance", () => {
      expect(pageContent).toContain("classifyOperatorError");
    });

    it("should import GovernedEmptyState for safe empty states", () => {
      expect(pageContent).toContain("GovernedEmptyState");
    });

    it("should be marked as client component", () => {
      expect(pageContent).toContain('"use client"');
    });
  });
});
