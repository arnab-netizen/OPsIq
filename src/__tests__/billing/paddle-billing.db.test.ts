/**
 * [db] Commercial minimum — real-PostgreSQL proof of the Paddle billing lifecycle.
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     npx vitest run src/__tests__/billing/paddle-billing.db.test.ts
 *
 * Nothing in the database path is mocked: createCheckout / processPaddleEvent / the webhook route /
 * getBillingStatus / assertCommercialAccess / getWorkspacePlan all run against real tables and real
 * constraints. Only the outbound Paddle HTTP API (fetch) is stubbed — it is the external provider.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { POST as webhookPOST } from "@/app/api/webhooks/paddle/route";
import { computePaddleSignature } from "@/services/billing/paddle-signature";
import { processPaddleEvent, PaddleEventRejectedError } from "@/services/billing/paddle-webhook.service";
import { createCheckout, createPaymentMethodUpdate, requestCancellation } from "@/services/billing/checkout.service";
import { assertCommercialAccess, getBillingStatus } from "@/services/billing/commercial-access.service";
import { getWorkspacePlan, resolveWorkspaceTier } from "@/services/entitlement.service";

const RUN = randomUUID().slice(0, 8);
const WS_A = randomUUID();
const WS_B = randomUUID();
const USER_A = randomUUID();
const USER_B = randomUUID();
const PLAN_ID = randomUUID();
const PRICE = `pri_dbtest_${RUN}`;
const SECRET = `whsec_dbtest_${RUN}`;
const DAY = 24 * 60 * 60 * 1000;

const CUST_A = `ctm_a_${RUN}`;
const CUST_B = `ctm_b_${RUN}`;
const SUB_A = `sub_a_${RUN}`;
const SUB_A2 = `sub_a2_${RUN}`;
const SUB_B = `sub_b_${RUN}`;

const fetchMock = vi.fn();
const ACCT_ID: Record<string, string> = {};
let evtSeq = 0;

function subData(over: Record<string, unknown> = {}, ws: string | null = WS_A, subId = SUB_A, cust = CUST_A) {
  const now = Date.now();
  return {
    id: subId,
    status: "active",
    customer_id: cust,
    custom_data: ws ? { workspaceId: ws, billingAccountId: ACCT_ID[ws] } : null,
    items: [{ price: { id: PRICE } }],
    current_billing_period: { starts_at: new Date(now - 10 * DAY).toISOString(), ends_at: new Date(now + 20 * DAY).toISOString() },
    scheduled_change: null,
    canceled_at: null,
    ...over,
  };
}
function evt(type: string, at: string, data: Record<string, unknown>) {
  return { event_id: `evt_${RUN}_${++evtSeq}`, event_type: type, occurred_at: at, data };
}
const T = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();

function signedRequest(envelope: unknown, secret = SECRET) {
  const raw = JSON.stringify(envelope);
  const ts = Math.floor(Date.now() / 1000);
  return new Request("http://test/api/webhooks/paddle", {
    method: "POST",
    headers: { "paddle-signature": `ts=${ts};h1=${computePaddleSignature(secret, String(ts), raw)}` },
    body: raw,
  });
}

async function subOf(ws: string) {
  return db.subscription.findFirst({ where: { billingAccount: { workspaceId: ws } } });
}
async function acctOf(ws: string) {
  return db.billingAccount.findUnique({ where: { workspaceId: ws } });
}
async function auditCount(ws: string, eventName: string) {
  return db.auditEvent.count({ where: { workspaceId: ws, eventName } });
}
async function resetBilling() {
  delete ACCT_ID[WS_A];
  delete ACCT_ID[WS_B];
  await db.subscription.deleteMany({ where: { billingAccount: { workspaceId: { in: [WS_A, WS_B] } } } });
  await db.billingAccount.deleteMany({ where: { workspaceId: { in: [WS_A, WS_B] } } });
  await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `paddle:evt_${RUN}` } } });
  await db.auditEvent.deleteMany({ where: { workspaceId: { in: [WS_A, WS_B] } } });
}
/** Mirrors production: an authenticated owner starts checkout, which creates the BillingAccount. */
async function startCheckout(ws: string, user: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { id: `txn_${randomUUID().replace(/-/g, "").slice(0, 26)}`, checkout: { url: "https://pay.test/pay?_ptxn=txn_x" } } }),
  });
  const out = await createCheckout({ workspaceId: ws, actorId: user });
  ACCT_ID[ws] = (await acctOf(ws))!.id;
  return out;
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Paddle commercial minimum — real Postgres", () => {
  const saved = { ...process.env };

  beforeAll(async () => {
    await db.workspace.create({ data: { id: WS_A, name: `Billing A ${RUN}`, slug: `billing-a-${RUN}` } });
    await db.workspace.create({ data: { id: WS_B, name: `Billing B ${RUN}`, slug: `billing-b-${RUN}` } });
    await db.user.create({ data: { id: USER_A, email: `billing-a-${RUN}@test.local`, isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: USER_B, email: `billing-b-${RUN}@test.local`, isActive: true, updatedAt: new Date() } });
    await db.plan.create({
      data: { id: PLAN_ID, name: `OpsIQ Pro ${RUN}`, priceMonthly: 1, priceYearly: 12, paddlePriceId: PRICE, active: true },
    });
  });

  afterAll(async () => {
    await resetBilling();
    await db.plan.deleteMany({ where: { id: PLAN_ID } });
    await db.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: [USER_A, USER_B] } }, { workspaceId: { in: [WS_A, WS_B] } }] } });
    await db.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await db.workspace.deleteMany({ where: { id: { in: [WS_A, WS_B] } } });
    process.env = { ...saved };
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.PADDLE_API_KEY = "test_key";
    process.env.PADDLE_PRICE_ID = PRICE;
    process.env.PADDLE_WEBHOOK_SECRET = SECRET;
    delete process.env.PADDLE_ENV;
    delete process.env.BILLING_PAYWALL_ENFORCEMENT;
    await resetBilling();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("1. checkout creates the tenant's BillingAccount server-side, once, and audits it", async () => {
    const out = await startCheckout(WS_A, USER_A);
    expect(out.checkoutUrl).toContain("/pay?_ptxn=");
    const acct = await acctOf(WS_A);
    expect(acct).toMatchObject({ workspaceId: WS_A, provider: "paddle", paddleCustomerId: null });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.custom_data).toEqual({ workspaceId: WS_A, billingAccountId: acct!.id });
    await startCheckout(WS_A, USER_A); // second click: same account, no duplicate
    expect(await db.billingAccount.count({ where: { workspaceId: WS_A } })).toBe(1);
    expect(await auditCount(WS_A, "billing.checkout_created")).toBe(2);
    expect(await acctOf(WS_B)).toBeNull();
  });

  it("2+3. first subscription webhook activates the subscription and binds the Paddle customer", async () => {
    await startCheckout(WS_A, USER_A);
    expect(await processPaddleEvent(evt("subscription.created", T(1), subData()))).toBe("applied");
    const sub = await subOf(WS_A);
    expect(sub).toMatchObject({ status: "active", paddleSubscriptionId: SUB_A, planId: PLAN_ID, cancelAtPeriodEnd: false });
    expect((await acctOf(WS_A))!.paddleCustomerId).toBe(CUST_A);
    expect(await auditCount(WS_A, "billing.subscription_synced")).toBe(1);
    expect(await auditCount(WS_A, "subscription.activated")).toBe(1);
  });

  it("4. a duplicate delivery of the same signed webhook is acknowledged once and applied once (route + webhook_events)", async () => {
    await startCheckout(WS_A, USER_A);
    const envelope = evt("subscription.created", T(1), subData());
    const r1 = await webhookPOST(signedRequest(envelope));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ received: true, outcome: "applied" });
    const r2 = await webhookPOST(signedRequest(envelope));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ duplicate: true });
    expect(await db.subscription.count({ where: { billingAccount: { workspaceId: WS_A } } })).toBe(1);
    expect(await auditCount(WS_A, "billing.subscription_synced")).toBe(1);
    const row = await db.webhookEvent.findUnique({ where: { stripeEventId: `paddle:${envelope.event_id}` } });
    expect(row?.status).toBe("processed");
  });

  it("5+6. a stale event is ignored; a newer event wins; concurrent out-of-order deliveries converge on the newest", async () => {
    await startCheckout(WS_A, USER_A);
    await processPaddleEvent(evt("subscription.created", T(10), subData()));
    // stale canceled (older than stored) must not override
    expect(await processPaddleEvent(evt("subscription.canceled", T(5), subData({ status: "canceled" })))).toBe("stale_ignored");
    expect((await subOf(WS_A))!.status).toBe("active");
    expect(await auditCount(WS_A, "billing.subscription_stale_event_ignored")).toBe(1);
    // newer wins
    expect(await processPaddleEvent(evt("subscription.past_due", T(20), subData({ status: "past_due" })))).toBe("applied");
    expect((await subOf(WS_A))!.status).toBe("past_due");
    // concurrent, shuffled: final state must be the highest timestamp (T(60) = paused)
    const burst = [
      evt("subscription.updated", T(30), subData({ status: "active" })),
      evt("subscription.updated", T(60), subData({ status: "paused" })),
      evt("subscription.updated", T(40), subData({ status: "past_due" })),
      evt("subscription.updated", T(50), subData({ status: "active" })),
      evt("subscription.updated", T(25), subData({ status: "past_due" })),
    ];
    await Promise.all(burst.map((e) => processPaddleEvent(e)));
    const final = await subOf(WS_A);
    expect(final!.status).toBe("paused");
    expect(final!.lastEventTimestamp!.toISOString()).toBe(T(60).replace(".000Z", ".000Z"));
  });

  it("7. forged signatures, unknown tenants and spoofed custom_data cannot grant entitlement", async () => {
    await startCheckout(WS_A, USER_A);
    // forged signature → 401, nothing persisted
    const forged = evt("subscription.created", T(1), subData());
    const r = await webhookPOST(signedRequest(forged, "attacker-secret"));
    expect(r.status).toBe(401);
    expect(await subOf(WS_A)).toBeNull();
    expect(await db.webhookEvent.findUnique({ where: { stripeEventId: `paddle:${forged.event_id}` } })).toBeNull();
    // validly signed but unknown tenant (no BillingAccount created by an authenticated checkout)
    const stranger = randomUUID();
    const unknown = evt("subscription.created", T(2), subData({}, stranger, `sub_x_${RUN}`, `ctm_x_${RUN}`));
    const r2 = await webhookPOST(signedRequest(unknown));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ rejected: "unknown_tenant" });
    expect(await db.subscription.count({ where: { paddleSubscriptionId: `sub_x_${RUN}` } })).toBe(0);
    expect(await db.billingAccount.count({ where: { workspaceId: stranger } })).toBe(0);
    // no custom_data and unbound customer
    await expect(processPaddleEvent(evt("subscription.created", T(3), subData({}, null, `sub_y_${RUN}`, `ctm_y_${RUN}`)))).rejects.toMatchObject({ reason: "unknown_tenant" });
    expect(await subOf(WS_A)).toBeNull();
    // rejection is audited (platform-level, no tenant)
    const audits = await db.auditEvent.findMany({ where: { eventName: "billing.event_rejected" } });
    expect(audits.some((a) => (a.payload as { providerEventId?: string } | null)?.providerEventId === unknown.event_id)).toBe(true);
  });

  it("8. an unknown price id cannot grant entitlement", async () => {
    await startCheckout(WS_A, USER_A);
    await expect(
      processPaddleEvent(evt("subscription.created", T(1), subData({ items: [{ price: { id: "pri_unknown" } }] }))),
    ).rejects.toMatchObject({ reason: "unknown_price" });
    expect(await subOf(WS_A)).toBeNull();
    expect((await getBillingStatus(WS_A)).entitled).toBe(false);
  });

  it("9. cross-tenant provider ids are rejected and never rebind or leak entitlement", async () => {
    await startCheckout(WS_A, USER_A);
    await startCheckout(WS_B, USER_B);
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    // tenant B's workspace claimed, but with tenant A's provider customer / subscription ids
    await expect(processPaddleEvent(evt("subscription.updated", T(2), subData({}, WS_B, SUB_B, CUST_A)))).rejects.toMatchObject({ reason: "tenant_mismatch" });
    await expect(processPaddleEvent(evt("subscription.updated", T(3), subData({}, WS_B, SUB_A, CUST_A)))).rejects.toBeInstanceOf(PaddleEventRejectedError);
    // tenant B's own customer id replayed onto A's subscription id
    await expect(processPaddleEvent(evt("subscription.updated", T(4), subData({}, WS_A, SUB_A, CUST_B)))).rejects.toMatchObject({ reason: "customer_mismatch" });
    expect(await subOf(WS_B)).toBeNull();
    expect((await acctOf(WS_B))!.paddleCustomerId).toBeNull();
    expect((await acctOf(WS_A))!.paddleCustomerId).toBe(CUST_A);
    expect((await getBillingStatus(WS_B)).entitled).toBe(false);
    expect((await getBillingStatus(WS_A)).entitled).toBe(true);
    // billing actions are tenant scoped: B has no subscription to cancel or recover
    await expect(requestCancellation({ workspaceId: WS_B, actorId: USER_B })).rejects.toThrow("No active subscription");
    await expect(createPaymentMethodUpdate({ workspaceId: WS_B, actorId: USER_B })).rejects.toThrow("No subscription with a payment method");
    expect(fetchMock).toHaveBeenCalledTimes(2); // only the two startCheckout calls; nothing for B's refused actions
  });

  it("10. cancellation scheduling keeps access until effective, then denies", async () => {
    await startCheckout(WS_A, USER_A);
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) });
    await requestCancellation({ workspaceId: WS_A, actorId: USER_A });
    const call = fetchMock.mock.calls.at(-1)!;
    expect(call[0]).toBe(`https://sandbox-api.paddle.com/subscriptions/${SUB_A}/cancel`);
    expect((await subOf(WS_A))!.cancelAtPeriodEnd).toBe(false); // provider state unchanged until its webhook
    expect(await auditCount(WS_A, "billing.cancellation_requested")).toBe(1);
    const effective = new Date(Date.now() + 20 * DAY).toISOString();
    await processPaddleEvent(evt("subscription.updated", T(5), subData({ scheduled_change: { action: "cancel", effective_at: effective } })));
    const scheduled = await subOf(WS_A);
    expect(scheduled).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(await getBillingStatus(WS_A)).toMatchObject({ entitled: true, access: "paid", cancelAtPeriodEnd: true });
    await processPaddleEvent(evt("subscription.canceled", T(9), subData({ status: "canceled", canceled_at: effective, scheduled_change: null })));
    expect(await subOf(WS_A)).toMatchObject({ status: "canceled", cancelAtPeriodEnd: false });
    expect(await getBillingStatus(WS_A)).toMatchObject({ entitled: false, access: "denied", state: "canceled" });
  });

  it("11. active entitlement is granted through every server-side check", async () => {
    await startCheckout(WS_A, USER_A);
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    await expect(assertCommercialAccess(WS_A)).resolves.toBeUndefined();
    await expect(assertCommercialAccess(WS_B)).rejects.toMatchObject({ statusCode: 402 });
    expect((await getWorkspacePlan(WS_A)).id).toBe(PLAN_ID);
    expect(await resolveWorkspaceTier(WS_A)).toBe("pro");
    expect(await resolveWorkspaceTier(WS_B)).toBe("free");
    expect(await getBillingStatus(WS_A)).toMatchObject({ state: "active", entitled: true, access: "paid", paymentProblem: false, planName: `OpsIQ Pro ${RUN}` });
  });

  it("12. past_due: grace access + visible payment problem + recovery action, bounded, then restored by provider state", async () => {
    await startCheckout(WS_A, USER_A);
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    const missed = (daysAgo: number) => ({
      starts_at: new Date(Date.now() - (daysAgo + 30) * DAY).toISOString(),
      ends_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
    });
    // renewal missed 2 days ago → grace
    await processPaddleEvent(evt("subscription.past_due", T(10), subData({ status: "past_due", current_billing_period: missed(2) })));
    const grace = await getBillingStatus(WS_A);
    expect(grace).toMatchObject({ state: "past_due", entitled: true, access: "grace", paymentProblem: true, canUpdatePaymentMethod: true });
    expect(new Date(grace.graceEndsAt!).getTime()).toBeGreaterThan(Date.now());
    await expect(assertCommercialAccess(WS_A)).resolves.toBeUndefined();
    expect((await getWorkspacePlan(WS_A)).id).toBe(PLAN_ID);
    // recovery action: provider-controlled payment-method update, tenant scoped, no local change
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "txn_pm", checkout: { url: "https://pay.test/pay?_ptxn=txn_pm" } } }) });
    expect(await createPaymentMethodUpdate({ workspaceId: WS_A, actorId: USER_A })).toEqual({ checkoutUrl: "https://pay.test/pay?_ptxn=txn_pm" });
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`https://sandbox-api.paddle.com/subscriptions/${SUB_A}/update-payment-method-transaction`);
    expect((await subOf(WS_A))!.status).toBe("past_due");
    expect(await auditCount(WS_A, "billing.payment_method_update_requested")).toBe(1);
    // grace exhausted (missed 8 days ago) → denied, still flagged and recoverable
    await processPaddleEvent(evt("subscription.updated", T(20), subData({ status: "past_due", current_billing_period: missed(8) })));
    expect(await getBillingStatus(WS_A)).toMatchObject({ entitled: false, access: "denied", paymentProblem: true, canUpdatePaymentMethod: true });
    await expect(assertCommercialAccess(WS_A)).rejects.toMatchObject({ statusCode: 402 });
    await expect(getWorkspacePlan(WS_A)).rejects.toThrow(/past_due/);
    // only the verified provider state restores access
    await processPaddleEvent(evt("subscription.updated", T(30), subData({ status: "active" })));
    expect(await getBillingStatus(WS_A)).toMatchObject({ entitled: true, access: "paid", paymentProblem: false });
    await expect(assertCommercialAccess(WS_A)).resolves.toBeUndefined();
  });

  it("13. paused and canceled are denied", async () => {
    await startCheckout(WS_A, USER_A);
    process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    await processPaddleEvent(evt("subscription.paused", T(2), subData({ status: "paused" })));
    expect(await getBillingStatus(WS_A)).toMatchObject({ state: "paused", entitled: false, access: "denied", canUpdatePaymentMethod: false });
    await expect(assertCommercialAccess(WS_A)).rejects.toMatchObject({ statusCode: 402 });
    await expect(getWorkspacePlan(WS_A)).rejects.toThrow(/paused/);
    await processPaddleEvent(evt("subscription.resumed", T(3), subData()));
    expect((await getBillingStatus(WS_A)).entitled).toBe(true);
    await processPaddleEvent(evt("subscription.canceled", T(4), subData({ status: "canceled", canceled_at: T(4) })));
    expect(await getBillingStatus(WS_A)).toMatchObject({ state: "canceled", entitled: false });
    await expect(assertCommercialAccess(WS_A)).rejects.toMatchObject({ statusCode: 402 });
  });

  it("14. resubscription after cancellation replaces the lineage; a second live subscription is rejected", async () => {
    await startCheckout(WS_A, USER_A);
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    await expect(processPaddleEvent(evt("subscription.created", T(2), subData({}, WS_A, SUB_A2)))).rejects.toMatchObject({ reason: "second_live_subscription" });
    await processPaddleEvent(evt("subscription.canceled", T(3), subData({ status: "canceled" })));
    await startCheckout(WS_A, USER_A); // allowed once canceled
    await processPaddleEvent(evt("subscription.created", T(4), subData({}, WS_A, SUB_A2)));
    const sub = await subOf(WS_A);
    expect(sub).toMatchObject({ status: "active", paddleSubscriptionId: SUB_A2 });
    expect(await db.subscription.count({ where: { billingAccount: { workspaceId: WS_A } } })).toBe(1);
    expect((await getBillingStatus(WS_A)).entitled).toBe(true);
    // checkout is refused while a live subscription exists
    await expect(startCheckout(WS_A, USER_A)).rejects.toThrow("already has a subscription");
  });

  it("16. P1 regression: a public-token checkout claiming a victim workspace without the server-issued account id cannot bind", async () => {
    await startCheckout(WS_A, USER_A); // victim has a BillingAccount with no Paddle customer yet
    const forged = evt("subscription.created", T(1), subData({ custom_data: { workspaceId: WS_A } }, WS_A, `sub_evil_${RUN}`, `ctm_evil_${RUN}`));
    const res = await webhookPOST(signedRequest(forged));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rejected: "unverified_binding" });
    expect(await subOf(WS_A)).toBeNull();
    expect((await acctOf(WS_A))!.paddleCustomerId).toBeNull();
    expect((await getBillingStatus(WS_A)).entitled).toBe(false);
    await expect(startCheckout(WS_A, USER_A)).resolves.toBeTruthy(); // victim can still check out
  });

  it("17. P1 regression: paying twice cancels the duplicate at the provider, keeps the first subscription, flags a refund", async () => {
    await startCheckout(WS_A, USER_A);
    await webhookPOST(signedRequest(evt("subscription.created", T(1), subData())));
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    const dup = evt("subscription.created", T(2), subData({}, WS_A, SUB_A2));
    const res = await webhookPOST(signedRequest(dup));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rejected: "second_live_subscription" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://sandbox-api.paddle.com/subscriptions/${SUB_A2}/cancel`);
    expect(JSON.parse(init.body)).toEqual({ effective_from: "immediately" });
    expect(await subOf(WS_A)).toMatchObject({ status: "active", paddleSubscriptionId: SUB_A });
    const audits = await db.auditEvent.findMany({ where: { workspaceId: WS_A, eventName: "billing.duplicate_subscription_canceled" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ duplicateSubscriptionId: SUB_A2, refundRequired: true });
    // the duplicate's own canceled event is ignored, not looped
    const canceled = await webhookPOST(signedRequest(evt("subscription.canceled", T(3), subData({ status: "canceled" }, WS_A, SUB_A2))));
    expect(canceled.status).toBe(200);
    expect(await subOf(WS_A)).toMatchObject({ status: "active", paddleSubscriptionId: SUB_A });
    // transient provider failure → not acknowledged, so Paddle retries
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const retry = await webhookPOST(signedRequest(evt("subscription.created", T(4), subData({}, WS_A, `sub_dup2_${RUN}`))));
    expect(retry.status).toBe(500);
  });

  it("18. P2 regression: a delayed older-lineage event cannot resurrect access; equal-timestamp cancel wins", async () => {
    await startCheckout(WS_A, USER_A);
    await processPaddleEvent(evt("subscription.created", T(1), subData()));
    await processPaddleEvent(evt("subscription.canceled", T(5), subData({ status: "canceled" })));
    await processPaddleEvent(evt("subscription.created", T(6), subData({}, WS_A, SUB_A2)));
    await processPaddleEvent(evt("subscription.canceled", T(7), subData({ status: "canceled" }, WS_A, SUB_A2)));
    expect(await processPaddleEvent(evt("subscription.updated", T(3), subData()))).toBe("stale_ignored");
    expect(await subOf(WS_A)).toMatchObject({ status: "canceled", paddleSubscriptionId: SUB_A2 });
    // tie at T(20): paused (non-terminal) loses to stored active, canceled wins
    await processPaddleEvent(evt("subscription.created", T(19), subData({}, WS_A, `sub_t_${RUN}`)));
    expect(await processPaddleEvent(evt("subscription.updated", T(19), subData({ status: "paused" }, WS_A, `sub_t_${RUN}`)))).toBe("stale_ignored");
    expect(await processPaddleEvent(evt("subscription.canceled", T(19), subData({ status: "canceled" }, WS_A, `sub_t_${RUN}`)))).toBe("applied");
  });

  it("19. P2 regression: concurrent created+activated for a brand-new subscription both succeed (no unique-race failure)", async () => {
    await startCheckout(WS_A, USER_A);
    const results = await Promise.all([
      processPaddleEvent(evt("subscription.created", T(1), subData())),
      processPaddleEvent(evt("subscription.activated", T(2), subData())),
    ]);
    expect(results.every((r) => r === "applied" || r === "stale_ignored")).toBe(true);
    expect(await db.subscription.count({ where: { billingAccount: { workspaceId: WS_A } } })).toBe(1);
    expect((await subOf(WS_A))!.status).toBe("active");
  });

  it("15. uniqueness constraints are enforced by the database", async () => {
    const acctA = await db.billingAccount.create({ data: { id: randomUUID(), workspaceId: WS_A, provider: "paddle", providerCustomerId: "", paddleCustomerId: CUST_A } });
    await expect(
      db.billingAccount.create({ data: { id: randomUUID(), workspaceId: WS_B, provider: "paddle", providerCustomerId: "", paddleCustomerId: CUST_A } }),
    ).rejects.toThrow(/Unique constraint|paddle_customer_id/);
    await expect(
      db.billingAccount.create({ data: { id: randomUUID(), workspaceId: WS_A, provider: "paddle", providerCustomerId: "" } }),
    ).rejects.toThrow(/Unique constraint|workspace_id/);
    const period = { currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + DAY) };
    await db.subscription.create({ data: { id: randomUUID(), billingAccountId: acctA.id, planId: PLAN_ID, status: "active", paddleSubscriptionId: SUB_A, ...period } });
    await expect(
      db.subscription.create({ data: { id: randomUUID(), billingAccountId: acctA.id, planId: PLAN_ID, status: "active", paddleSubscriptionId: SUB_B, ...period } }),
    ).rejects.toThrow(/Unique constraint|billing_account_id/);
    const acctB = await db.billingAccount.create({ data: { id: randomUUID(), workspaceId: WS_B, provider: "paddle", providerCustomerId: "" } });
    await expect(
      db.subscription.create({ data: { id: randomUUID(), billingAccountId: acctB.id, planId: PLAN_ID, status: "active", paddleSubscriptionId: SUB_A, ...period } }),
    ).rejects.toThrow(/Unique constraint|paddle_subscription_id/);
    await expect(
      db.plan.create({ data: { id: randomUUID(), name: `dup-${RUN}`, priceMonthly: 1, priceYearly: 12, paddlePriceId: PRICE } }),
    ).rejects.toThrow(/Unique constraint|paddle_price_id/);
  });
});
