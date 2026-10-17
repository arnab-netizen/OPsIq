import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const m = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDbInstance: vi.fn(), db: { subscription: { findFirst: m.findFirst } } }));

import { assertCommercialAccess, getBillingStatus, isPaywallEnforced } from "@/services/billing/commercial-access.service";

const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const saved = { ...process.env };
beforeEach(() => { vi.clearAllMocks(); delete process.env.BILLING_PAYWALL_ENFORCEMENT; });
afterEach(() => { process.env = { ...saved }; });

describe("paywall (assertCommercialAccess)", () => {
  it("is OFF by default: never blocks and never queries (live invited owners unaffected)", async () => {
    expect(isPaywallEnforced()).toBe(false);
    await expect(assertCommercialAccess(WS)).resolves.toBeUndefined();
    expect(m.findFirst).not.toHaveBeenCalled();
  });
  it("when ON: active subscription passes", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    m.findFirst.mockResolvedValue({ status: "active" });
    await expect(assertCommercialAccess(WS)).resolves.toBeUndefined();
  });
  it("when ON: no subscription, past_due, canceled, paused all get 402", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    for (const row of [null, { status: "past_due" }, { status: "canceled" }, { status: "paused" }, { status: "trialing" }]) {
      m.findFirst.mockResolvedValue(row);
      await expect(assertCommercialAccess(WS)).rejects.toMatchObject({ statusCode: 402 });
    }
  });
  it("when ON: a lookup failure fails closed", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    m.findFirst.mockRejectedValue(new Error("db down"));
    await expect(assertCommercialAccess(WS)).rejects.toMatchObject({ statusCode: 402 });
  });
  it("scopes the lookup to the caller's workspace", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    m.findFirst.mockResolvedValue({ status: "active" });
    await assertCommercialAccess(WS);
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { billingAccount: { workspaceId: WS } } }));
  });
});

describe("owner-visible billing status", () => {
  it("reports no subscription as not entitled", async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await getBillingStatus(WS)).toMatchObject({ state: "none", entitled: false, planName: null });
  });
  it("reports active + scheduled cancellation", async () => {
    m.findFirst.mockResolvedValue({
      status: "active",
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
      cancelAtPeriodEnd: true,
      plan: { name: "OpsIQ Pro" },
    });
    expect(await getBillingStatus(WS)).toMatchObject({
      state: "active", entitled: true, cancelAtPeriodEnd: true, planName: "OpsIQ Pro", currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    });
  });
});
