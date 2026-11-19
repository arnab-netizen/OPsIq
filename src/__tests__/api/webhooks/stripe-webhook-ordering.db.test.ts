/**
 * [db] POST /api/webhooks/stripe — out-of-order delivery against real PostgreSQL.
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-ordering.db.test.ts
 *
 * Stripe does not guarantee delivery order. Every subscription-state event is ordered by the
 * Stripe event's own `created` (event id as the same-second tiebreak), the watermark is stored on
 * the subscription, and the compare-and-apply runs in the transaction that applies the event:
 *   - an event older than the stored watermark is processed-but-ignored: the event row is settled
 *     `processed`, a stale-ignored audit row is written, nothing on the subscription changes;
 *   - older-then-newer still applies the newer event;
 *   - replay of an applied event stays an idempotent duplicate.
 *
 * Nothing on the request path is stubbed: real route, real offline Stripe SDK HMAC verification
 * (signatures from the SDK's own generateTestHeaderString with a test-only secret), real
 * webhook.service state machine and handlers, real tables. No live key, no Stripe network call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { POST } from "@/app/api/webhooks/stripe/route";

const RUN = randomUUID().slice(0, 8);
const SECRET = `whsec_test_ord_${RUN}`;
const WS = randomUUID();
const PLAN_ID = randomUUID();
const ACCT_ID = randomUUID();
const SUB_ID = randomUUID();
const CUSTOMER = `cus_ord_${RUN}`;
const STRIPE_SUB = `sub_ord_${RUN}`;
const DAY = 24 * 60 * 60 * 1000;
/** Event creation times well in the past: ordering uses `created`, replay protection uses t=. */
const BASE_S = Math.floor(Date.now() / 1000) - 3_600;

const sdk = new Stripe("sk_test_dummy_not_a_real_key");

let seq = 0;
/** Zero-padded so ids sort identically in JS and in any Postgres collation. */
const nextEventId = () => `evt_${RUN}_${String(++seq).padStart(4, "0")}`;

function subscriptionEvent(id: string, type: string, created: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    object: "event",
    type,
    created,
    data: {
      object: {
        id: STRIPE_SUB,
        object: "subscription",
        customer: CUSTOMER,
        status: "active",
        current_period_start: created - 86_400,
        current_period_end: created + 30 * 86_400,
        ...overrides,
      },
    },
  };
}

function checkoutCompleted(id: string, created: number) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    created,
    data: { object: { id: `cs_ord_${RUN}_${seq}`, customer: CUSTOMER, subscription: STRIPE_SUB, status: "complete" } },
  };
}

async function deliver(event: object) {
  const payload = JSON.stringify(event);
  const signature = sdk.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) });
  const res = await POST(
    new NextRequest("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    }),
  );
  return { status: res.status, body: await res.json() };
}

const eventRow = (id: string) => db.webhookEvent.findUnique({ where: { stripeEventId: id } });
const subscription = () => db.subscription.findUnique({ where: { id: SUB_ID } });
const audits = (eventName: string, correlationId?: string) =>
  db.auditEvent.count({ where: { entityId: SUB_ID, eventName, ...(correlationId ? { correlationId } : {}) } });
const STALE = "billing.subscription_stale_event_ignored";
const SYNCED = "billing.subscription_synced";

async function settled(id: string, status = "processed") {
  await vi.waitFor(
    async () => {
      expect((await eventRow(id))?.status).toBe(status);
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** Deliver one event through the route and wait until its background processing settles. */
async function deliverAndSettle(event: { id: string }) {
  const res = await deliver(event);
  expect(res.status).toBe(200);
  await settled(event.id);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook ordering — event.created watermark", () => {
  const saved = { ...process.env };

  beforeAll(async () => {
    await db.workspace.create({ data: { id: WS, name: `Stripe ORD ${RUN}`, slug: `stripe-ord-${RUN}` } });
    await db.plan.create({
      data: { id: PLAN_ID, name: `Stripe ORD Plan ${RUN}`, priceMonthly: 1, priceYearly: 12, stripePriceId: `price_ord_${RUN}`, active: true },
    });
    await db.billingAccount.create({
      data: { id: ACCT_ID, workspaceId: WS, provider: "stripe", providerCustomerId: CUSTOMER, stripeCustomerId: CUSTOMER },
    });
    await db.subscription.create({
      data: {
        id: SUB_ID,
        billingAccountId: ACCT_ID,
        planId: PLAN_ID,
        status: "trialing",
        currentPeriodStart: new Date(Date.now() - DAY),
        currentPeriodEnd: new Date(Date.now() + 30 * DAY),
      },
    });
  });

  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `evt_${RUN}_` } } });
    await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
    await db.subscription.deleteMany({ where: { id: SUB_ID } });
    await db.billingAccount.deleteMany({ where: { id: ACCT_ID } });
    await db.plan.deleteMany({ where: { id: PLAN_ID } });
    await db.workspace.deleteMany({ where: { id: WS } });
    process.env = { ...saved };
  });

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_not_a_real_key";
    await db.subscription.update({
      where: { id: SUB_ID },
      data: { status: "trialing", stripeSubscriptionId: null, lastEventTimestamp: null, lastEventId: null, canceledAt: null, cancelReason: null },
    });
    await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
  });

  it("newer then OLDER subscription.updated: the older event is processed-but-ignored, audited, and never regresses state", async () => {
    const newer = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 100, { status: "past_due" });
    const older = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 50, {
      status: "active",
      current_period_end: BASE_S + 50 + 99 * 86_400,
    });

    await deliverAndSettle(newer);
    const afterNewer = await subscription();
    expect(afterNewer?.status).toBe("past_due");

    await deliverAndSettle(older);
    const final = await subscription();
    expect(final?.status).toBe("past_due");
    expect(final?.currentPeriodEnd.getTime()).toBe(afterNewer?.currentPeriodEnd.getTime());
    expect(final?.lastEventTimestamp?.getTime()).toBe((BASE_S + 100) * 1000);
    expect(final?.lastEventId).toBe(newer.id);

    expect(await eventRow(older.id)).toMatchObject({ status: "processed", attempts: 0 });
    expect(await audits(SYNCED, newer.id)).toBe(1);
    expect(await audits(SYNCED, older.id)).toBe(0);
    expect(await audits(STALE, older.id)).toBe(1);
  });

  it("older then newer: both apply in order and the newer state wins", async () => {
    const older = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 10, { status: "past_due" });
    const newer = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 20, { status: "active" });

    await deliverAndSettle(older);
    expect((await subscription())?.status).toBe("past_due");
    await deliverAndSettle(newer);

    const final = await subscription();
    expect(final?.status).toBe("active");
    expect(final?.lastEventId).toBe(newer.id);
    expect(await audits(SYNCED)).toBe(2);
    expect(await audits(STALE)).toBe(0);
  });

  it("replay of an applied event is an idempotent duplicate (no reprocessing, no new audit)", async () => {
    const event = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 30, { status: "past_due" });
    await deliverAndSettle(event);
    const before = await subscription();

    const replay = await deliver(event);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ received: true, duplicate: true });
    expect((await subscription())?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
    expect(await audits(SYNCED, event.id)).toBe(1);
    expect(await audits(STALE)).toBe(0);
  });

  it("a delayed OLDER updated(active) after subscription.deleted cannot resurrect the subscription", async () => {
    const deleted = subscriptionEvent(nextEventId(), "customer.subscription.deleted", BASE_S + 200, { status: "canceled" });
    const olderUpdate = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 150, { status: "active" });

    await deliverAndSettle(deleted);
    expect((await subscription())?.status).toBe("canceled");
    await deliverAndSettle(olderUpdate);

    expect((await subscription())?.status).toBe("canceled");
    expect(await audits(STALE, olderUpdate.id)).toBe(1);
  });

  it("a delayed OLDER subscription.created / checkout.session.completed after deletion cannot reactivate", async () => {
    const deleted = subscriptionEvent(nextEventId(), "customer.subscription.deleted", BASE_S + 300, { status: "canceled" });
    const olderCreated = subscriptionEvent(nextEventId(), "customer.subscription.created", BASE_S + 250);
    const olderCheckout = checkoutCompleted(nextEventId(), BASE_S + 240);

    await deliverAndSettle(deleted);
    await deliverAndSettle(olderCreated);
    await deliverAndSettle(olderCheckout);

    expect((await subscription())?.status).toBe("canceled");
    expect(await audits("subscription.activated")).toBe(0);
    expect(await audits(STALE, olderCreated.id)).toBe(1);
    expect(await audits(STALE, olderCheckout.id)).toBe(1);
  });

  it("same-second events converge on one deterministic winner (event id tiebreak) in either delivery order", async () => {
    const created = BASE_S + 400;
    const low = subscriptionEvent(`evt_${RUN}_tie_a`, "customer.subscription.updated", created, { status: "active" });
    const high = subscriptionEvent(`evt_${RUN}_tie_b`, "customer.subscription.updated", created, { status: "past_due" });

    await deliverAndSettle(high);
    await deliverAndSettle(low);
    expect((await subscription())?.status).toBe("past_due");
    expect(await audits(STALE, low.id)).toBe(1);

    // Reverse delivery order on a fresh subscription state: same final state.
    await db.subscription.update({ where: { id: SUB_ID }, data: { status: "trialing", lastEventTimestamp: null, lastEventId: null } });
    const low2 = subscriptionEvent(`evt_${RUN}_tie2_a`, "customer.subscription.updated", created, { status: "active" });
    const high2 = subscriptionEvent(`evt_${RUN}_tie2_b`, "customer.subscription.updated", created, { status: "past_due" });
    await deliverAndSettle(low2);
    await deliverAndSettle(high2);
    expect((await subscription())?.status).toBe("past_due");
    expect((await subscription())?.lastEventId).toBe(high2.id);
  });

  it("concurrent delivery of a newer and an older event converges on the newer state", async () => {
    const newer = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 600, { status: "canceled" });
    const older = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 500, { status: "active" });

    const results = await Promise.all([deliver(newer), deliver(older)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    await settled(newer.id);
    await settled(older.id);

    const final = await subscription();
    expect(final?.status).toBe("canceled");
    expect(final?.lastEventId).toBe(newer.id);
  });

  it("legacy row (watermark written by the pre-fix receive-time code, no event id) accepts the next event and adopts its watermark", async () => {
    await db.subscription.update({ where: { id: SUB_ID }, data: { lastEventTimestamp: new Date(), lastEventId: null } });
    const event = subscriptionEvent(nextEventId(), "customer.subscription.updated", BASE_S + 700, { status: "past_due" });
    await deliverAndSettle(event);
    const final = await subscription();
    expect(final?.status).toBe("past_due");
    expect(final?.lastEventTimestamp?.getTime()).toBe((BASE_S + 700) * 1000);
    expect(final?.lastEventId).toBe(event.id);
  });

  it("an event without a numeric `created` is rejected 400 before anything is recorded", async () => {
    const id = nextEventId();
    const res = await deliver({ ...subscriptionEvent(id, "customer.subscription.updated", BASE_S), created: "yesterday" });
    expect(res.status).toBe(400);
    expect(await eventRow(id)).toBeNull();
  });
});
