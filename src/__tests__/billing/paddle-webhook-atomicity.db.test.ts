/**
 * [db] POST /api/webhooks/paddle — claim settlement is atomic with the mutation + audit.
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/billing/paddle-webhook-atomicity.db.test.ts
 *
 * The event's processing -> processed transition, the subscription/billing mutation and its audit
 * rows commit in ONE transaction (the pattern the Stripe path uses: applyClaimedWebhookEvent).
 * A failure anywhere rolls everything back and leaves the event retryable; a committed mutation is
 * never left with a retryable event state (which re-applies it on redelivery) and a settled event
 * is never left without its mutation.
 *
 * Nothing in the database path is mocked: the real route, real HMAC verification (test-only
 * secret), the real webhook.service state machine and real tables. webhook.service and
 * emitAuditEvent are wrapped in call-through spies only to inject single failures. The outbound
 * Paddle HTTP API (fetch) is stubbed — no live Paddle call is ever made.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const spies = vi.hoisted(() => ({
  markWebhookEventProcessed: vi.fn(),
  emitAuditEvent: vi.fn(),
  actual: {} as { markWebhookEventProcessed?: (key: string) => Promise<void>; emitAuditEvent?: (...args: never[]) => Promise<string> },
}));

vi.mock("@/services/webhook.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/webhook.service")>();
  spies.actual.markWebhookEventProcessed = actual.markWebhookEventProcessed;
  spies.markWebhookEventProcessed.mockImplementation(actual.markWebhookEventProcessed);
  return { ...actual, markWebhookEventProcessed: spies.markWebhookEventProcessed };
});
vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  spies.actual.emitAuditEvent = actual.emitAuditEvent as never;
  spies.emitAuditEvent.mockImplementation(actual.emitAuditEvent);
  return { ...actual, emitAuditEvent: spies.emitAuditEvent };
});

import { POST } from "@/app/api/webhooks/paddle/route";
import { computePaddleSignature } from "@/services/billing/paddle-signature";
import { processClaimedPaddleEvent } from "@/services/billing/paddle-webhook.service";

const RUN = randomUUID().slice(0, 8);
const WS = randomUUID();
const ACCT_ID = randomUUID();
const PLAN_ID = randomUUID();
const PRICE = `pri_atom_${RUN}`;
const SECRET = `whsec_atom_${RUN}`;
const CUST = `ctm_atom_${RUN}`;
const SUB = `sub_atom_${RUN}`;
const SUB_DUP = `sub_atom_dup_${RUN}`;
const DAY = 24 * 60 * 60 * 1000;

const fetchMock = vi.fn();
let seq = 0;
const T = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();

function subData(over: Record<string, unknown> = {}, subId = SUB) {
  const now = Date.now();
  return {
    id: subId,
    status: "active",
    customer_id: CUST,
    custom_data: { workspaceId: WS, billingAccountId: ACCT_ID },
    items: [{ price: { id: PRICE } }],
    current_billing_period: { starts_at: new Date(now - 10 * DAY).toISOString(), ends_at: new Date(now + 20 * DAY).toISOString() },
    scheduled_change: null,
    canceled_at: null,
    ...over,
  };
}
function evt(type: string, at: string, data: Record<string, unknown>) {
  return { event_id: `evt_${RUN}_${++seq}`, event_type: type, occurred_at: at, data };
}
function signed(envelope: unknown) {
  const raw = JSON.stringify(envelope);
  const ts = Math.floor(Date.now() / 1000);
  return new Request("http://test/api/webhooks/paddle", {
    method: "POST",
    headers: { "paddle-signature": `ts=${ts};h1=${computePaddleSignature(SECRET, String(ts), raw)}` },
    body: raw,
  });
}
async function deliver(envelope: unknown) {
  const res = await POST(signed(envelope));
  return { status: res.status, body: await res.json() };
}

const eventRow = (eventId: string) => db.webhookEvent.findUnique({ where: { stripeEventId: `paddle:${eventId}` } });
const sub = () => db.subscription.findFirst({ where: { billingAccountId: ACCT_ID } });
const audits = (eventName: string) => db.auditEvent.count({ where: { workspaceId: WS, eventName } });

/** Bind the Paddle subscription to the account with one clean first event. */
async function bindSubscription() {
  const created = evt("subscription.created", T(1), subData());
  expect((await deliver(created)).status).toBe(200);
  expect((await sub())?.status).toBe("active");
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Paddle webhook — atomic claim + apply + audit", () => {
  const saved = { ...process.env };

  beforeAll(async () => {
    await db.workspace.create({ data: { id: WS, name: `Paddle ATOM ${RUN}`, slug: `paddle-atom-${RUN}` } });
    await db.plan.create({
      data: { id: PLAN_ID, name: `Paddle ATOM ${RUN}`, priceMonthly: 1, priceYearly: 12, paddlePriceId: PRICE, active: true },
    });
  });

  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `paddle:evt_${RUN}_` } } });
    await db.subscription.deleteMany({ where: { billingAccountId: ACCT_ID } });
    await db.billingAccount.deleteMany({ where: { id: ACCT_ID } });
    await db.auditEvent.deleteMany({ where: { workspaceId: WS } });
    await db.plan.deleteMany({ where: { id: PLAN_ID } });
    await db.workspace.deleteMany({ where: { id: WS } });
    process.env = { ...saved };
  });

  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    // Reset (not just clear): an injected one-shot failure never leaks into the next case.
    spies.markWebhookEventProcessed.mockReset().mockImplementation(spies.actual.markWebhookEventProcessed!);
    spies.emitAuditEvent.mockReset().mockImplementation(spies.actual.emitAuditEvent!);
    process.env.PADDLE_WEBHOOK_SECRET = SECRET;
    process.env.PADDLE_API_KEY = "test_key";
    process.env.PADDLE_PRICE_ID = PRICE;
    delete process.env.PADDLE_ENV;
    await db.subscription.deleteMany({ where: { billingAccountId: ACCT_ID } });
    await db.billingAccount.deleteMany({ where: { id: ACCT_ID } });
    await db.auditEvent.deleteMany({ where: { workspaceId: WS } });
    // Mirrors what the authenticated server-side checkout creates before any webhook.
    await db.billingAccount.create({ data: { id: ACCT_ID, workspaceId: WS, provider: "paddle", providerCustomerId: "" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a failure where the old separate 'mark processed' commit ran can no longer double-apply on redelivery", async () => {
    await bindSubscription();
    // Inject a failure into the post-apply mark-processed commit the route used to make.
    spies.markWebhookEventProcessed.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    const payment = evt("transaction.completed", T(5), { id: `txn_${RUN}`, subscription_id: SUB, customer_id: CUST });

    const first = await deliver(payment);
    const row = await eventRow(payment.event_id);
    const paymentAudits = await audits("billing.payment_succeeded");
    // Atomic: either applied AND settled, or neither. Never applied-but-retryable.
    expect({ status: first.status, eventStatus: row?.status, paymentAudits }).toEqual({ status: 200, eventStatus: "processed", paymentAudits: 1 });
    // The claim is settled inside the applying transaction, not by a second commit.
    expect(spies.markWebhookEventProcessed).not.toHaveBeenCalled();

    const redelivery = await deliver(payment);
    expect(redelivery).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(await audits("billing.payment_succeeded")).toBe(1);
  });

  it("a cancel applied once stays applied once across a redelivery (no second synced audit)", async () => {
    await bindSubscription();
    spies.markWebhookEventProcessed.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    const canceled = evt("subscription.canceled", T(9), subData({ status: "canceled", canceled_at: T(9) }));
    const syncedBefore = await audits("billing.subscription_synced");

    expect((await deliver(canceled)).status).toBe(200);
    expect(await deliver(canceled)).toEqual({ status: 200, body: { received: true, duplicate: true } });

    expect((await sub())?.status).toBe("canceled");
    expect(await audits("billing.subscription_synced")).toBe(syncedBefore + 1);
    expect(await eventRow(canceled.event_id)).toMatchObject({ status: "processed", attempts: 0 });
  });

  it("an audit failure inside the apply rolls back the mutation AND leaves the event retryable; retry applies once", async () => {
    await bindSubscription();
    const pastDue = evt("subscription.past_due", T(7), subData({ status: "past_due" }));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));

    expect((await deliver(pastDue)).status).toBe(500);
    expect((await sub())?.status).toBe("active");
    expect(await eventRow(pastDue.event_id)).toMatchObject({ status: "failed", attempts: 1 });

    expect((await deliver(pastDue)).status).toBe(200);
    expect((await sub())?.status).toBe("past_due");
    expect(await eventRow(pastDue.event_id)).toMatchObject({ status: "processed" });
  });

  it("a rejected (unacceptable) event is audited and settled in one commit; a failure leaves neither", async () => {
    const unknownPrice = evt("subscription.created", T(2), subData({ items: [{ price: { id: `pri_unknown_${RUN}` } }] }));
    spies.markWebhookEventProcessed.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    const first = await deliver(unknownPrice);
    expect(first).toEqual({ status: 200, body: { received: true, rejected: "unknown_price" } });
    expect(await eventRow(unknownPrice.event_id)).toMatchObject({ status: "processed" });
    expect(await audits("billing.event_rejected")).toBe(1);
    expect(await deliver(unknownPrice)).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(await audits("billing.event_rejected")).toBe(1);

    // Rejection-audit failure: nothing recorded, event retryable, retry records it once.
    const unknownPrice2 = evt("subscription.created", T(3), subData({ items: [{ price: { id: `pri_unknown2_${RUN}` } }] }));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));
    expect((await deliver(unknownPrice2)).status).toBe(500);
    expect(await eventRow(unknownPrice2.event_id)).toMatchObject({ status: "failed", attempts: 1 });
    expect(await audits("billing.event_rejected")).toBe(1);
    expect((await deliver(unknownPrice2)).status).toBe(200);
    expect(await audits("billing.event_rejected")).toBe(2);
  });

  it("duplicate live subscription: provider cancel first, then rejection + cancel audits commit with the settlement", async () => {
    await bindSubscription();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
    const dup = evt("subscription.created", T(4), subData({}, SUB_DUP));
    // The settlement transaction fails once after the provider cancel succeeded.
    spies.emitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("audit write failed");
    });

    expect((await deliver(dup)).status).toBe(500);
    expect(await eventRow(dup.event_id)).toMatchObject({ status: "failed", attempts: 1 });
    expect(await audits("billing.event_rejected")).toBe(0);
    expect(await audits("billing.duplicate_subscription_canceled")).toBe(0);

    // Retry: the provider says it is already canceled (4xx is final), everything is recorded once.
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: "subscription_locked_canceled" } }) });
    expect(await deliver(dup)).toEqual({ status: 200, body: { received: true, rejected: "second_live_subscription" } });
    expect(await eventRow(dup.event_id)).toMatchObject({ status: "processed" });
    expect(await audits("billing.event_rejected")).toBe(1);
    expect(await audits("billing.duplicate_subscription_canceled")).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await sub())?.paddleSubscriptionId).toBe(SUB);
  });

  it("the ordering watermark pair always names one event: a Paddle event replaces a stale Stripe lastEventId", async () => {
    const created = evt("subscription.created", T(1), subData());
    expect((await deliver(created)).status).toBe(200);
    expect(await sub()).toMatchObject({ lastEventId: `paddle:${created.event_id}`, lastEventTimestamp: new Date(T(1)) });

    // A row last moved by a Stripe event (or the pre-upgrade code) carries a foreign event id.
    await db.subscription.updateMany({ where: { billingAccountId: ACCT_ID }, data: { lastEventId: "evt_stripe_stale" } });
    const pastDue = evt("subscription.past_due", T(6), subData({ status: "past_due" }));
    expect((await deliver(pastDue)).status).toBe(200);
    expect(await sub()).toMatchObject({ status: "past_due", lastEventId: `paddle:${pastDue.event_id}`, lastEventTimestamp: new Date(T(6)) });
  });

  it("cross-provider tie: a Paddle cancel at the same second as a stored Stripe watermark goes to the stored provider; a later one applies", async () => {
    await bindSubscription();
    await db.subscription.updateMany({ where: { billingAccountId: ACCT_ID }, data: { lastEventTimestamp: new Date(T(9)), lastEventId: "evt_stripe_stored" } });
    expect((await deliver(evt("subscription.canceled", T(9), subData({ status: "canceled", canceled_at: T(9) })))).status).toBe(200);
    expect((await sub())?.status).toBe("active");
    expect((await deliver(evt("subscription.canceled", T(10), subData({ status: "canceled", canceled_at: T(10) })))).status).toBe(200);
    expect((await sub())?.status).toBe("canceled");
  });

  it("the claimed apply refuses an event this delivery does not hold the processing claim for", async () => {
    await bindSubscription();
    const pastDue = evt("subscription.past_due", T(8), subData({ status: "past_due" }));
    await db.webhookEvent.create({ data: { stripeEventId: `paddle:${pastDue.event_id}`, type: pastDue.event_type, status: "failed", attempts: 1 } });
    await expect(processClaimedPaddleEvent(`paddle:${pastDue.event_id}`, pastDue)).rejects.toThrow(/not claimed/);
    expect((await sub())?.status).toBe("active");
    expect(await eventRow(pastDue.event_id)).toMatchObject({ status: "failed", attempts: 1 });
  });
});
