import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const m = vi.hoisted(() => ({
  planFind: vi.fn(),
  subFindFirst: vi.fn(),
  acctUpsert: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn(),
  db: {
    plan: { findUnique: m.planFind },
    subscription: { findFirst: m.subFindFirst },
    billingAccount: { upsert: m.acctUpsert },
  },
}));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: m.audit }));

import { createCheckout, createPaymentMethodUpdate, requestCancellation } from "@/services/billing/checkout.service";

const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const saved = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.PADDLE_API_KEY = "test_key";
  process.env.PADDLE_PRICE_ID = "pri_pro";
  delete process.env.PADDLE_ENV;
  m.planFind.mockResolvedValue({ id: "plan-1", active: true });
  m.subFindFirst.mockResolvedValue(null);
  m.acctUpsert.mockResolvedValue({ id: "acct-1", paddleCustomerId: null });
});
afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

describe("checkout creation", () => {
  it("creates a sandbox transaction with server-set tenant binding and returns the hosted URL", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: "txn_1", checkout: { url: "https://pay.example/checkout" } } }) });
    const out = await createCheckout({ workspaceId: WS, actorId: "user-1" });
    expect(out).toEqual({ checkoutUrl: "https://pay.example/checkout" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sandbox-api.paddle.com/transactions");
    expect(init.headers.Authorization).toBe("Bearer test_key");
    expect(JSON.parse(init.body)).toEqual({
      items: [{ price_id: "pri_pro", quantity: 1 }],
      custom_data: { workspaceId: WS, billingAccountId: "acct-1" },
    });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ eventName: "billing.checkout_created", workspaceId: WS, actorId: "user-1" }));
  });
  it("uses the live API only when PADDLE_ENV=production", async () => {
    process.env.PADDLE_ENV = "production";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: "t", checkout: { url: "https://u" } } }) });
    await createCheckout({ workspaceId: WS, actorId: "u" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.paddle.com/transactions");
  });
  it("fails closed when not configured, plan not seeded, or no hosted URL", async () => {
    delete process.env.PADDLE_API_KEY;
    await expect(createCheckout({ workspaceId: WS, actorId: "u" })).rejects.toMatchObject({ statusCode: 503 });
    process.env.PADDLE_API_KEY = "k";
    m.planFind.mockResolvedValue(null);
    await expect(createCheckout({ workspaceId: WS, actorId: "u" })).rejects.toMatchObject({ statusCode: 503 });
    m.planFind.mockResolvedValue({ id: "p", active: true });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: "t", checkout: { url: null } } }) });
    await expect(createCheckout({ workspaceId: WS, actorId: "u" })).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("maps a provider error to a 502 without leaking upstream detail", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "secret detail" }) });
    await expect(createCheckout({ workspaceId: WS, actorId: "u" })).rejects.toMatchObject({ statusCode: 502, message: "Payment provider request failed" });
  });
  it("refuses a second checkout while any non-canceled subscription exists (active, past_due, paused)", async () => {
    for (const status of ["active", "past_due", "paused"]) {
      m.subFindFirst.mockResolvedValue({ status });
      await expect(createCheckout({ workspaceId: WS, actorId: "u" })).rejects.toThrow("already has a subscription");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows a new checkout after a canceled subscription", async () => {
    m.subFindFirst.mockResolvedValue({ status: "canceled" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: "t", checkout: { url: "https://u" } } }) });
    await expect(createCheckout({ workspaceId: WS, actorId: "u" })).resolves.toEqual({ checkoutUrl: "https://u" });
  });
});

describe("cancellation", () => {
  it("schedules cancel at next billing period via the provider and audits; does not mutate local status", async () => {
    m.subFindFirst.mockResolvedValue({ id: "s1", status: "active", paddleSubscriptionId: "sub_1" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    expect(await requestCancellation({ workspaceId: WS, actorId: "u" })).toEqual({ requested: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sandbox-api.paddle.com/subscriptions/sub_1/cancel");
    expect(JSON.parse(init.body)).toEqual({ effective_from: "next_billing_period" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ eventName: "billing.cancellation_requested" }));
  });
  it("allows cancelling a past_due subscription", async () => {
    m.subFindFirst.mockResolvedValue({ id: "s1", status: "past_due", paddleSubscriptionId: "sub_1" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    await expect(requestCancellation({ workspaceId: WS, actorId: "u" })).resolves.toEqual({ requested: true });
  });
  it("rejects cancelling when there is no active subscription", async () => {
    m.subFindFirst.mockResolvedValue({ id: "s1", status: "canceled", paddleSubscriptionId: "sub_1" });
    await expect(requestCancellation({ workspaceId: WS, actorId: "u" })).rejects.toThrow("No active subscription");
    m.subFindFirst.mockResolvedValue(null);
    await expect(requestCancellation({ workspaceId: WS, actorId: "u" })).rejects.toThrow("No active subscription");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("payment-method update (past-due recovery)", () => {
  it("obtains the provider-controlled update transaction for the caller's own subscription and audits", async () => {
    m.subFindFirst.mockResolvedValue({ id: "s1", status: "past_due", paddleSubscriptionId: "sub_1" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: "txn_u", checkout: { url: "https://pay.example/pay?_ptxn=txn_u" } } }) });
    expect(await createPaymentMethodUpdate({ workspaceId: WS, actorId: "u" })).toEqual({ checkoutUrl: "https://pay.example/pay?_ptxn=txn_u" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sandbox-api.paddle.com/subscriptions/sub_1/update-payment-method-transaction");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer test_key");
    expect(m.subFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { billingAccount: { workspaceId: WS } } }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ eventName: "billing.payment_method_update_requested", workspaceId: WS }));
  });
  it("is refused when there is no recoverable subscription (none, paused, canceled)", async () => {
    for (const row of [null, { id: "s", status: "canceled", paddleSubscriptionId: "sub_1" }, { id: "s", status: "paused", paddleSubscriptionId: "sub_1" }, { id: "s", status: "past_due", paddleSubscriptionId: null }]) {
      m.subFindFirst.mockResolvedValue(row);
      await expect(createPaymentMethodUpdate({ workspaceId: WS, actorId: "u" })).rejects.toThrow("No subscription with a payment method");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed when the provider returns no URL, without leaking provider detail", async () => {
    m.subFindFirst.mockResolvedValue({ id: "s1", status: "past_due", paddleSubscriptionId: "sub_1" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: "t", checkout: { url: null } } }) });
    await expect(createPaymentMethodUpdate({ workspaceId: WS, actorId: "u" })).rejects.toMatchObject({ statusCode: 503 });
  });
});
