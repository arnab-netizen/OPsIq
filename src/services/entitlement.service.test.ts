import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getWorkspacePlan,
  getUsage,
  resolveEntitlements,
  assertCapability,
  trackUsage,
} from "@/services/entitlement.service";
import { db } from "@/lib/db";
import { NotFoundError, ForbiddenError } from "@/infra/errors";

vi.mock("@/lib/db");

describe("Entitlement Service", () => {
  const mockWorkspaceId = "workspace-1";
  const mockPlanId = "plan-1";
  const mockBillingAccountId = "billing-1";

  const mockPlan = {
    id: mockPlanId,
    name: "Pro Plan",
    priceMonthly: 99,
    priceYearly: 990,
    capabilities: [
      { key: "decision_engine", limit: 1000 },
      { key: "audit_logging", limit: null },
      { key: "custom_workflows", limit: 5 },
    ],
  };

  const mockSubscription = {
    plan: mockPlan,
    status: "active",
    currentPeriodStart: new Date("2026-01-01"),
    currentPeriodEnd: new Date("2026-02-01"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWorkspacePlan", () => {
    it("returns plan for active subscription", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce({
        plan: {
          id: mockPlanId,
          name: "Pro Plan",
          priceMonthly: 99,
          priceYearly: 990,
        },
        status: "active",
      } as never);

      const plan = await getWorkspacePlan(mockWorkspaceId);

      expect(plan).toEqual({
        id: mockPlanId,
        name: "Pro Plan",
        priceMonthly: 99,
        priceYearly: 990,
      });
    });

    it("throws if subscription not found", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(null);

      await expect(getWorkspacePlan(mockWorkspaceId)).rejects.toThrow(
        NotFoundError
      );
    });

    it("throws if plan not found", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce({
        plan: null,
        status: "active",
      } as never);

      await expect(getWorkspacePlan(mockWorkspaceId)).rejects.toThrow(
        NotFoundError
      );
    });

    it("throws if subscription not active", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce({
        plan: mockPlan,
        status: "canceled",
      } as never);

      await expect(getWorkspacePlan(mockWorkspaceId)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe("getUsage", () => {
    it("sums usage events by key for current period", async () => {
      const periodStart = new Date("2026-01-01");

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([
        { key: "decision_engine", value: 100 },
        { key: "decision_engine", value: 50 },
        { key: "custom_workflows", value: 2 },
      ] as never);

      const usage = await getUsage(mockWorkspaceId, periodStart);

      expect(usage).toEqual([
        { key: "decision_engine", value: 150 },
        { key: "custom_workflows", value: 2 },
      ]);
    });

    it("fetches subscription period if not provided", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce({
        currentPeriodStart: new Date("2026-01-01"),
      } as never);

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([]);

      await getUsage(mockWorkspaceId);

      expect(db.subscription.findFirst).toHaveBeenCalledWith({
        where: {
          billingAccount: {
            workspaceId: mockWorkspaceId,
          },
        },
        select: {
          currentPeriodStart: true,
        },
      });
    });

    it("throws if subscription not found and period not provided", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(null);

      await expect(getUsage(mockWorkspaceId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("resolveEntitlements", () => {
    it("combines plan, capabilities, and usage", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(
        mockSubscription as never
      );

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([
        { key: "decision_engine", value: 500 },
      ] as never);

      const entitlements = await resolveEntitlements(mockWorkspaceId);

      expect(entitlements.plan).toEqual({
        id: mockPlanId,
        name: "Pro Plan",
        priceMonthly: 99,
        priceYearly: 990,
      });
      expect(entitlements.capabilities).toHaveLength(3);
      expect(entitlements.usage).toEqual([
        { key: "decision_engine", value: 500 },
      ]);
      expect(entitlements.status).toBe("active");
    });

    it("throws if subscription not found", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(null);

      await expect(resolveEntitlements(mockWorkspaceId)).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("assertCapability", () => {
    it("allows capability when within limit", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(
        mockSubscription as never
      );

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([
        { key: "decision_engine", value: 800 },
      ] as never);

      const result = await assertCapability(
        mockWorkspaceId,
        "decision_engine"
      );

      expect(result).toEqual({
        allowed: true,
        usage: 800,
        limit: 1000,
      });
    });

    it("denies capability when usage exceeds limit", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(
        mockSubscription as never
      );

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([
        { key: "decision_engine", value: 1000 },
      ] as never);

      const result = await assertCapability(
        mockWorkspaceId,
        "decision_engine"
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("exceeds limit");
    });

    it("allows unlimited capabilities", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(
        mockSubscription as never
      );

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([
        { key: "audit_logging", value: 999999 },
      ] as never);

      const result = await assertCapability(
        mockWorkspaceId,
        "audit_logging"
      );

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeNull();
    });

    it("denies if capability not in plan", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce(
        mockSubscription as never
      );

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([]);

      const result = await assertCapability(
        mockWorkspaceId,
        "unknown_capability"
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("fails closed if subscription not active", async () => {
      vi.spyOn(db.subscription, "findFirst").mockResolvedValueOnce({
        plan: mockPlan,
        status: "canceled",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      } as never);

      vi.spyOn(db.usageEvent, "findMany").mockResolvedValueOnce([]);

      const result = await assertCapability(
        mockWorkspaceId,
        "decision_engine"
      );

      expect(result.allowed).toBe(false);
    });

    it("fails closed on any error", async () => {
      vi.spyOn(db.subscription, "findFirst").mockRejectedValueOnce(
        new Error("Database error")
      );

      const result = await assertCapability(
        mockWorkspaceId,
        "decision_engine"
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Entitlement check failed");
    });

    it("fails closed if workspaceId missing", async () => {
      const result = await assertCapability("", "decision_engine");

      expect(result.allowed).toBe(false);
    });

    it("fails closed if key missing", async () => {
      const result = await assertCapability(mockWorkspaceId, "");

      expect(result.allowed).toBe(false);
    });
  });

  describe("trackUsage", () => {
    it("creates usage event", async () => {
      vi.spyOn(db.usageEvent, "create").mockResolvedValueOnce({
        id: "event-1",
      } as never);

      await trackUsage(mockWorkspaceId, "decision_engine", 5);

      expect(db.usageEvent.create).toHaveBeenCalledWith({
        data: {
          workspaceId: mockWorkspaceId,
          key: "decision_engine",
          value: 5,
          timestamp: expect.any(Date),
        },
      });
    });

    it("defaults value to 1", async () => {
      vi.spyOn(db.usageEvent, "create").mockResolvedValueOnce({
        id: "event-1",
      } as never);

      await trackUsage(mockWorkspaceId, "decision_engine");

      expect(db.usageEvent.create).toHaveBeenCalledWith({
        data: {
          workspaceId: mockWorkspaceId,
          key: "decision_engine",
          value: 1,
          timestamp: expect.any(Date),
        },
      });
    });
  });
});
