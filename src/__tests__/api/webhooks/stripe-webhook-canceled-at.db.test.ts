/**
 * [db] POST /api/webhooks/stripe — canceledAt comes from the event
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-canceled-at.db.test.ts
 *
 * customer.subscription.deleted records canceledAt from the subscription's canceled_at, else the
 * event's created, never the receive clock (a delayed or retried delivery must not move it).
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("cxl");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — canceledAt comes from the event", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    await f.beforeEachCase();
  });

  it("deleted sets canceledAt from canceled_at, else from event.created", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.deleted", f.BASE_S + 900, f.dahliaSubscription({ status: "canceled", canceled_at: f.BASE_S + 890 })));
    expect((await f.subscription()).canceledAt?.getTime()).toBe((f.BASE_S + 890) * 1000);

    await f.resetSubscription(f.STRIPE_SUB, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.deleted", f.BASE_S + 950, f.dahliaSubscription({ status: "canceled", canceled_at: null })));
    expect((await f.subscription()).canceledAt?.getTime()).toBe((f.BASE_S + 950) * 1000);
  });
});
