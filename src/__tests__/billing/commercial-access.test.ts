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
    m.findFirst.mockResolvedValue({ status: "active", currentPeriodEnd: new Date() });
    await expect(assertCommercialAccess(WS)).resolves.toBeUndefined();
  });
  it("when ON: past_due passes during the grace window and is denied after it", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    const day = 24 * 60 * 60 * 1000;
    m.findFirst.mockResolvedValue({ status: "past_due", currentPeriodEnd: new Date(Date.now() - 2 * day) });
    await expect(assertCommercialAccess(WS)).resolves.toBeUndefined();
    m.findFirst.mockResolvedValue({ status: "past_due", currentPeriodEnd: new Date(Date.now() - 8 * day) });
    await expect(assertCommercialAccess(WS)).rejects.toMatchObject({ statusCode: 402 });
  });
  it("when ON: no subscription, canceled, paused, trialing all get 402", async () => {
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    const end = new Date();
    for (const row of [null, { status: "canceled", currentPeriodEnd: end }, { status: "paused", currentPeriodEnd: end }, { status: "trialing", currentPeriodEnd: end }]) {
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
    m.findFirst.mockResolvedValue({ status: "active", currentPeriodEnd: new Date() });
    await assertCommercialAccess(WS);
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { billingAccount: { workspaceId: WS } } }));
  });
});

describe("owner-visible billing status", () => {
  it("reports no subscription as not entitled", async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await getBillingStatus(WS)).toMatchObject({ state: "none", entitled: false, access: "denied", paymentProblem: false, planName: null });
  });
  it("reports past_due as grace access with a visible payment problem and a recovery action", async () => {
    const day = 24 * 60 * 60 * 1000;
    const end = new Date(Date.now() - 2 * day);
    m.findFirst.mockResolvedValue({ status: "past_due", currentPeriodEnd: end, cancelAtPeriodEnd: false, plan: { name: "OpsIQ Pro" } });
    const dto = await getBillingStatus(WS);
    expect(dto).toMatchObject({ state: "past_due", entitled: true, access: "grace", paymentProblem: true, canUpdatePaymentMethod: true });
    expect(dto.graceEndsAt).toBe(new Date(end.getTime() + 7 * day).toISOString());
  });
  it("reports past_due after grace as denied but still recoverable", async () => {
    const day = 24 * 60 * 60 * 1000;
    m.findFirst.mockResolvedValue({ status: "past_due", currentPeriodEnd: new Date(Date.now() - 9 * day), cancelAtPeriodEnd: false, plan: { name: "OpsIQ Pro" } });
    expect(await getBillingStatus(WS)).toMatchObject({ entitled: false, access: "denied", paymentProblem: true, canUpdatePaymentMethod: true });
  });
  it("paused and canceled are denied with no recovery action", async () => {
    for (const status of ["paused", "canceled"]) {
      m.findFirst.mockResolvedValue({ status, currentPeriodEnd: new Date(), cancelAtPeriodEnd: false, plan: { name: "OpsIQ Pro" } });
      expect(await getBillingStatus(WS)).toMatchObject({ entitled: false, access: "denied", paymentProblem: false, canUpdatePaymentMethod: false });
    }
  });
  it("reports active + scheduled cancellation", async () => {
    m.findFirst.mockResolvedValue({
      status: "active",
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
      cancelAtPeriodEnd: true,
      plan: { name: "OpsIQ Pro" },
    });
    expect(await getBillingStatus(WS)).toMatchObject({
      state: "active", entitled: true, access: "paid", cancelAtPeriodEnd: true, planName: "OpsIQ Pro", currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    });
  });
});
