/**
 * [db] POST /api/webhooks/stripe — current Stripe API subscription shape (P3)
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-current-api-shape.db.test.ts
 *
 * The installed SDK (stripe 22.x, API 2026-04-22.dahlia) carries the billing period on
 * items.data[*].current_period_start/end (no top-level fields) and the cancellation reason on
 * cancellation_details.reason. Both that shape and the legacy top-level shape must apply; an
 * event with no period in either shape fails closed (retryable), never applies half a state.
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("shape");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — current Stripe API subscription shape (P3)", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    await f.beforeEachCase();
  });

  it("P3: dahlia-shaped updated{canceled} applies: period from items (min start / max end), reason from cancellation_details", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    const t = f.BASE_S + 400;
    const object = f.dahliaSubscription({
      status: "canceled",
      canceled_at: t,
      cancellation_details: { comment: null, feedback: null, reason: "cancellation_requested" },
      periods: [
        [f.BASE_S + 10, f.BASE_S + 20 * 86_400],
        [f.BASE_S, f.BASE_S + 30 * 86_400],
      ],
    });
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.updated", t, object));
    const s = await f.subscription();
    expect(s.status).toBe("canceled");
    expect(s.currentPeriodStart.getTime()).toBe(f.BASE_S * 1000);
    expect(s.currentPeriodEnd.getTime()).toBe((f.BASE_S + 30 * 86_400) * 1000);
    expect(s.cancelReason).toBe("cancellation_requested");
    expect(s.canceledAt?.getTime()).toBe(t * 1000);
  });

  it("P3: dahlia-shaped subscription.created applies the item period and trial", async () => {
    const trialEnd = f.BASE_S + 14 * 86_400;
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.created", f.BASE_S + 410, f.dahliaSubscription({ trial_end: trialEnd, periods: [[f.BASE_S + 5, f.BASE_S + 31 * 86_400]] })));
    const s = await f.subscription();
    expect(s).toMatchObject({ status: "active", stripeSubscriptionId: f.STRIPE_SUB });
    expect(s.currentPeriodStart.getTime()).toBe((f.BASE_S + 5) * 1000);
    expect(s.currentPeriodEnd.getTime()).toBe((f.BASE_S + 31 * 86_400) * 1000);
    expect(s.trialEndsAt?.getTime()).toBe(trialEnd * 1000);
  });

  it("P3: legacy-shaped updated (top-level periods, cancel_reason) still applies", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 500, f.legacySubscription({ status: "past_due", cancel_reason: "legacy_reason" })));
    const s = await f.subscription();
    expect(s.status).toBe("past_due");
    expect(s.currentPeriodEnd.getTime()).toBe((f.BASE_S + 30 * 86_400) * 1000);
    expect(s.cancelReason).toBe("legacy_reason");
  });

  it("P3: a subscription event with no period in either shape fails closed (500, retryable), nothing applied", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    const id = f.nextEventId();
    const res = await f.deliver(f.envelope(id, "customer.subscription.updated", f.BASE_S + 550, f.dahliaSubscription({ status: "past_due", periods: [] })));
    expect(res.status).toBe(500);
    expect(await f.eventRow(id)).toMatchObject({ status: "failed", attempts: 1 });
    expect((await f.subscription()).status).toBe("active");
  });
});
