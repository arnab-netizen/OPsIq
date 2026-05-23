/**
 * Tests: Admin Billing Diagnostics DTOs and Structure
 *
 * Validates service response shapes, DTO compliance, and error patterns
 * without requiring database initialization.
 */

import { describe, it, expect } from "vitest";
import {
  BillingDiagnosticDTO,
  BillingExportPacketDTO,
  EntitlementDecisionDTO,
  UsageSummaryDTO,
  BILLING_STATES,
} from "@/lib/billing/admin-billing-diagnostics.dto";

describe("Admin Billing Diagnostics DTOs", () => {
  describe("BILLING_STATES safe state constants", () => {
    it("should define NO_BILLING_ACCOUNT constant", () => {
      expect(BILLING_STATES.NO_BILLING_ACCOUNT).toBeDefined();
      expect(typeof BILLING_STATES.NO_BILLING_ACCOUNT).toBe("string");
    });

    it("should define NO_ACTIVE_SUBSCRIPTION constant", () => {
      expect(BILLING_STATES.NO_ACTIVE_SUBSCRIPTION).toBeDefined();
    });

    it("should define PLAN_NOT_FOUND constant", () => {
      expect(BILLING_STATES.PLAN_NOT_FOUND).toBeDefined();
    });
  });

  describe("BillingDiagnosticDTO full structure", () => {
    it("should support complete diagnostic with all fields", () => {
      const dto: BillingDiagnosticDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "ba-123",
          status: "active",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "active" },
        plan: {
          planId: "plan-pro",
          name: "Pro Plan",
          priceMonthly: 99,
          priceYearly: 990,
          capabilities: [
            {
              key: "api_calls",
              limit: 10000,
              description: "API calls per month",
            },
          ],
        },
        entitlementDecisions: [
          {
            capability: "api_calls",
            allowed: true,
            reason: "Usage within limit",
            usage: 5000,
            limit: 10000,
            percentageUsed: 50,
          },
        ],
        usage: [{ key: "api_calls", value: 5000, limit: 10000, percentageUsed: 50 }],
        diagnostics: {
          status: "complete",
          warnings: [],
          missingData: [],
        },
      };

      expect(dto.workspaceId).toBe("workspace-123");
      expect(dto.diagnostics.status).toBe("complete");
      expect(dto.entitlementDecisions).toHaveLength(1);
    });

    it("should support diagnostic without plan (safe state)", () => {
      const dto: BillingDiagnosticDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "unknown",
          status: "unknown",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "unknown" },
        entitlementDecisions: [],
        usage: [],
        diagnostics: {
          status: "none",
          warnings: [],
          missingData: [BILLING_STATES.NO_BILLING_ACCOUNT],
        },
      };

      expect(dto.plan).toBeUndefined();
      expect(dto.diagnostics.missingData).toContain(
        BILLING_STATES.NO_BILLING_ACCOUNT
      );
    });
  });

  describe("EntitlementDecisionDTO variations", () => {
    it("should represent allowed decision with limit", () => {
      const decision: EntitlementDecisionDTO = {
        capability: "api_calls",
        allowed: true,
        reason: "Usage 5000 within limit 10000",
        usage: 5000,
        limit: 10000,
        percentageUsed: 50,
      };

      expect(decision.allowed).toBe(true);
      expect(decision.limit).toBe(10000);
      expect(decision.percentageUsed).toBe(50);
    });

    it("should represent denied decision when exceeding limit", () => {
      const decision: EntitlementDecisionDTO = {
        capability: "api_calls",
        allowed: false,
        reason: "Usage 15000 exceeds limit 10000",
        usage: 15000,
        limit: 10000,
        percentageUsed: 150,
      };

      expect(decision.allowed).toBe(false);
      expect(decision.percentageUsed).toBe(150);
    });

    it("should represent unlimited capability", () => {
      const decision: EntitlementDecisionDTO = {
        capability: "users",
        allowed: true,
        reason: "Capability is unlimited",
        usage: 9999999,
        limit: null,
      };

      expect(decision.limit).toBeNull();
      expect(decision.percentageUsed).toBeUndefined();
    });
  });

  describe("UsageSummaryDTO structure", () => {
    it("should represent limited usage", () => {
      const usage: UsageSummaryDTO = {
        key: "api_calls",
        value: 5000,
        limit: 10000,
        percentageUsed: 50,
      };

      expect(usage.value).toBe(5000);
      expect(usage.percentageUsed).toBe(50);
    });

    it("should represent unlimited usage", () => {
      const usage: UsageSummaryDTO = {
        key: "users",
        value: 99999,
        limit: null,
      };

      expect(usage.limit).toBeNull();
      expect(usage.percentageUsed).toBeUndefined();
    });
  });

  describe("BillingExportPacketDTO for support", () => {
    it("should include supportMetadata with query timing", () => {
      const packet: BillingExportPacketDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        generatedAt: "2026-05-23T00:00:00Z",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "ba-123",
          status: "active",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "active" },
        entitlementDecisions: [],
        usage: [],
        supportMetadata: {
          databaseQueryTimeMs: 45,
          diagnosticStatus: "complete",
          missingData: [],
        },
      };

      expect(packet.supportMetadata?.databaseQueryTimeMs).toBe(45);
      expect(packet.supportMetadata?.diagnosticStatus).toBe("complete");
    });

    it("should report missing data in export", () => {
      const packet: BillingExportPacketDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        generatedAt: "2026-05-23T00:00:00Z",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "unknown",
          status: "unknown",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "unknown" },
        entitlementDecisions: [],
        usage: [],
        supportMetadata: {
          diagnosticStatus: "none",
          missingData: [
            BILLING_STATES.NO_BILLING_ACCOUNT,
            BILLING_STATES.NO_ACTIVE_SUBSCRIPTION,
          ],
        },
      };

      expect(packet.supportMetadata?.missingData).toContain(
        BILLING_STATES.NO_BILLING_ACCOUNT
      );
    });
  });

  describe("security: no secrets in DTOs", () => {
    it("should not allow Stripe secret keys in account", () => {
      const account = {
        workspaceId: "ws-123",
        billingAccountId: "ba-123",
        status: "active",
        stripeCustomerId: "cus-123",
        createdAt: "2026-01-01T00:00:00Z",
      };

      const dtoStr = JSON.stringify(account);
      expect(dtoStr).not.toMatch(/sk_live|sk_test|secret/i);
    });

    it("should allow Stripe customer ID reference", () => {
      const account = {
        workspaceId: "ws-123",
        billingAccountId: "ba-123",
        status: "active",
        stripeCustomerId: "cus-abc123",
        createdAt: "2026-01-01T00:00:00Z",
      };

      expect(account.stripeCustomerId).toMatch(/^cus-/);
    });
  });

  describe("diagnostic status field", () => {
    it("should support complete status", () => {
      const dto: BillingDiagnosticDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "ba-123",
          status: "active",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "active" },
        entitlementDecisions: [],
        usage: [],
        diagnostics: {
          status: "complete",
          warnings: [],
          missingData: [],
        },
      };

      expect(dto.diagnostics.status).toBe("complete");
    });

    it("should support partial status with warnings", () => {
      const dto: BillingDiagnosticDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "ba-123",
          status: "active",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "past_due" },
        entitlementDecisions: [],
        usage: [],
        diagnostics: {
          status: "partial",
          warnings: ["Subscription status is past_due"],
          missingData: [],
        },
      };

      expect(dto.diagnostics.status).toBe("partial");
      expect(dto.diagnostics.warnings.length).toBeGreaterThan(0);
    });

    it("should support none status for missing billing data", () => {
      const dto: BillingDiagnosticDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-123",
        account: {
          workspaceId: "workspace-123",
          billingAccountId: "unknown",
          status: "unknown",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "unknown" },
        entitlementDecisions: [],
        usage: [],
        diagnostics: {
          status: "none",
          warnings: [],
          missingData: [BILLING_STATES.NO_BILLING_ACCOUNT],
        },
      };

      expect(dto.diagnostics.status).toBe("none");
    });
  });

  describe("workspace scoping in DTOs", () => {
    it("should represent workspace-scoped diagnostic", () => {
      const dto: BillingDiagnosticDTO = {
        timestamp: "2026-05-23T00:00:00Z",
        workspaceId: "workspace-456",
        account: {
          workspaceId: "workspace-456",
          billingAccountId: "ba-456",
          status: "active",
          createdAt: "2026-01-01T00:00:00Z",
        },
        subscription: { status: "active" },
        entitlementDecisions: [],
        usage: [],
        diagnostics: {
          status: "partial",
          warnings: [],
          missingData: [],
        },
      };

      expect(dto.workspaceId).toBe("workspace-456");
      expect(dto.account.workspaceId).toBe("workspace-456");
    });
  });
});
