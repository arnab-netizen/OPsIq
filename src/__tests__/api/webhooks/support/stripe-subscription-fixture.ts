/**
 * Shared real-DB fixture for the Stripe webhook financial-review suites: one workspace, plan,
 * billing account and subscription per suite, signed local deliveries through the REAL route
 * (offline SDK HMAC with a test-only secret; no live key, no Stripe network call), and payload
 * builders in the installed SDK's own shape (stripe 22.x, API 2026-04-22.dahlia) plus the legacy
 * top-level-period shape. Not a test file: imported by *.db.test.ts suites only.
 */
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { expect } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/webhooks/stripe/route";

/** A subscription object in the installed SDK's shape (compile-time checked against its types). */
export type DahliaSubscription = Pick<
  Stripe.Subscription,
  "id" | "object" | "customer" | "status" | "canceled_at" | "cancellation_details" | "trial_end" | "created"
> & {
  items: { object: "list"; data: Array<Pick<Stripe.SubscriptionItem, "id" | "object" | "current_period_start" | "current_period_end">> };
};

export function createStripeSubscriptionFixture(tag: string) {
  const RUN = randomUUID().slice(0, 8);
  const SECRET = `whsec_test_${tag}_${RUN}`;
  const WS = randomUUID();
  const PLAN_ID = randomUUID();
  const ACCT_ID = randomUUID();
  const SUB_ID = randomUUID();
  const CUSTOMER = `cus_${tag}_${RUN}`;
  const STRIPE_SUB = `sub_${tag}_${RUN}`;
  const BASE_S = Math.floor(Date.now() / 1000) - 7_200;
  const INITIAL_PERIOD_START = new Date(Date.UTC(2026, 0, 1));
  const INITIAL_PERIOD_END = new Date(Date.UTC(2026, 0, 31));
  const sdk = new Stripe("sk_test_dummy_not_a_real_key");
  let seq = 0;
  const nextEventId = () => `evt_${RUN}_${String(++seq).padStart(4, "0")}`;
  const saved = { ...process.env };

  function dahliaSubscription(over: Partial<DahliaSubscription> & { periods?: Array<[number, number]> } = {}): DahliaSubscription {
    const { periods = [[BASE_S - 86_400, BASE_S + 30 * 86_400]], ...rest } = over;
    return {
      id: STRIPE_SUB,
      object: "subscription",
      customer: CUSTOMER,
      status: "active",
      canceled_at: null,
      cancellation_details: { comment: null, feedback: null, reason: null },
      trial_end: null,
      created: BASE_S - 86_400,
      items: {
        object: "list",
        data: periods.map(([start, end], i) => ({ id: `si_${RUN}_${i}`, object: "subscription_item", current_period_start: start, current_period_end: end })),
      },
      ...rest,
    };
  }

  /** The pre-dahlia shape: top-level current_period_* and cancel_reason. */
  function legacySubscription(over: Record<string, unknown> = {}) {
    return { id: STRIPE_SUB, object: "subscription", customer: CUSTOMER, status: "active", current_period_start: BASE_S - 86_400, current_period_end: BASE_S + 30 * 86_400, ...over };
  }

  function envelope(id: string, type: string, created: number, object: object) {
    return { id, object: "event", type, created, data: { object } };
  }

  function checkoutCompleted(id: string, created: number, subscription = STRIPE_SUB, customer = CUSTOMER) {
    return envelope(id, "checkout.session.completed", created, { id: `cs_${tag}_${RUN}_${seq}`, object: "checkout.session", customer, subscription, status: "complete" });
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
  const subscription = () => db.subscription.findUniqueOrThrow({ where: { id: SUB_ID } });
  const audits = (eventName: string, correlationId?: string) =>
    db.auditEvent.findMany({ where: { entityId: SUB_ID, eventName, ...(correlationId ? { correlationId } : {}) } });

  /** The route answers after settle: 200 means the event row is already processed. */
  async function deliverApplied(event: { id: string; type: string }) {
    const res = await deliver(event);
    expect(res).toEqual({ status: 200, body: { received: true, id: event.id, type: event.type, status: "processed" } });
    expect((await eventRow(event.id))?.status).toBe("processed");
  }

  async function resetSubscription(stripeSubscriptionId: string | null = null, status = "trialing") {
    await db.subscription.update({
      where: { id: SUB_ID },
      data: {
        status,
        stripeSubscriptionId,
        lastEventTimestamp: null,
        lastEventId: null,
        canceledAt: null,
        cancelReason: null,
        trialEndsAt: null,
        currentPeriodStart: INITIAL_PERIOD_START,
        currentPeriodEnd: INITIAL_PERIOD_END,
      },
    });
    await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
  }

  async function setup() {
    await db.workspace.create({ data: { id: WS, name: `Stripe ${tag} ${RUN}`, slug: `stripe-${tag}-${RUN}` } });
    await db.plan.create({ data: { id: PLAN_ID, name: `Stripe ${tag} Plan ${RUN}`, priceMonthly: 1, priceYearly: 12, stripePriceId: `price_${tag}_${RUN}`, active: true } });
    await db.billingAccount.create({ data: { id: ACCT_ID, workspaceId: WS, provider: "stripe", providerCustomerId: CUSTOMER, stripeCustomerId: CUSTOMER } });
    await db.subscription.create({
      data: { id: SUB_ID, billingAccountId: ACCT_ID, planId: PLAN_ID, status: "trialing", currentPeriodStart: INITIAL_PERIOD_START, currentPeriodEnd: INITIAL_PERIOD_END },
    });
  }

  async function teardown() {
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `evt_${RUN}_` } } });
    await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
    await db.subscription.deleteMany({ where: { id: SUB_ID } });
    await db.billingAccount.deleteMany({ where: { id: ACCT_ID } });
    await db.plan.deleteMany({ where: { id: PLAN_ID } });
    await db.workspace.deleteMany({ where: { id: WS } });
    process.env = { ...saved };
  }

  /** Per-test: configured webhook secret + dummy key (verification never needs it), clean row. */
  async function beforeEachCase() {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_not_a_real_key";
    await resetSubscription();
  }

  return {
    RUN, CUSTOMER, STRIPE_SUB, SUB_ID, BASE_S,
    nextEventId, dahliaSubscription, legacySubscription, envelope, checkoutCompleted,
    deliver, deliverApplied, eventRow, subscription, audits, resetSubscription,
    setup, teardown, beforeEachCase,
  };
}
