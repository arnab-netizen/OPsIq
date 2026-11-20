/**
 * [db] POST /api/webhooks/stripe — partial events do not move the ordering watermark (P1)
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-partial-event-watermark.db.test.ts
 *
 * checkout.session.completed carries only the subscription id (no status snapshot, period or
 * trial). It is still ordered (an older checkout never undoes newer state) but it does not advance
 * the watermark, so a subscription.created created earlier than it but delivered later still
 * applies its period and trial. Either delivery order converges on the same end state.
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("partial");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — partial events do not move the ordering watermark (P1)", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    await f.beforeEachCase();
  });

  it("P1: checkout (T+1) and subscription.created (T) reach the same end state in either order, period + trial populated", async () => {
    const trialEnd = f.BASE_S + 14 * 86_400;
    const object = f.dahliaSubscription({ trial_end: trialEnd, periods: [[f.BASE_S - 3_600, f.BASE_S + 30 * 86_400]] });
    const snapshot = async () => {
      const s = await f.subscription();
      return {
        status: s.status,
        stripeSubscriptionId: s.stripeSubscriptionId,
        currentPeriodStart: s.currentPeriodStart.toISOString(),
        currentPeriodEnd: s.currentPeriodEnd.toISOString(),
        trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
        lastEventTimestamp: s.lastEventTimestamp?.toISOString() ?? null,
      };
    };
    const expected = {
      status: "active",
      stripeSubscriptionId: f.STRIPE_SUB,
      currentPeriodStart: new Date((f.BASE_S - 3_600) * 1000).toISOString(),
      currentPeriodEnd: new Date((f.BASE_S + 30 * 86_400) * 1000).toISOString(),
      trialEndsAt: new Date(trialEnd * 1000).toISOString(),
      lastEventTimestamp: new Date(f.BASE_S * 1000).toISOString(),
    };

    await f.deliverApplied(f.checkoutCompleted(f.nextEventId(), f.BASE_S + 1));
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.created", f.BASE_S, object));
    const orderA = await snapshot();
    expect(orderA).toEqual(expected);
    expect(await f.audits("billing.subscription_stale_event_ignored")).toHaveLength(0);

    await f.resetSubscription();
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.created", f.BASE_S, object));
    await f.deliverApplied(f.checkoutCompleted(f.nextEventId(), f.BASE_S + 1));
    expect(await snapshot()).toEqual(orderA);
  });

  it("P1: an OLDER checkout after a newer cancellation is still ignored (ordered, audited stale)", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.deleted", f.BASE_S + 50, f.dahliaSubscription({ status: "canceled" })));
    const checkout = f.checkoutCompleted(f.nextEventId(), f.BASE_S + 40);
    await f.deliverApplied(checkout);
    expect((await f.subscription()).status).toBe("canceled");
    expect(await f.audits("billing.subscription_stale_event_ignored", checkout.id)).toHaveLength(1);
  });
});
