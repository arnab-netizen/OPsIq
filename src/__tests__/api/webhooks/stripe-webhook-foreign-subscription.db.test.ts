/**
 * [db] POST /api/webhooks/stripe — events for a different Stripe subscription (P4)
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-foreign-subscription.db.test.ts
 *
 * The row binds one Stripe subscription id. An updated/deleted event whose data.object.id is a
 * different subscription (e.g. a late cancellation of the replaced one) is acknowledged, audited
 * as ignored (billing.subscription_event_ignored, reason subscription_mismatch) and never touches
 * the row. subscription.created and checkout.session.completed deliberately (re)bind the id.
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("foreign");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — events for a different Stripe subscription (P4)", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    await f.beforeEachCase();
  });

  it("P4: a newer deleted / updated for a different Stripe subscription id never touches the row; audited as ignored", async () => {
    await f.resetSubscription(`sub_NEW_${f.RUN}`, "active");
    const deletedOld = f.envelope(f.nextEventId(), "customer.subscription.deleted", f.BASE_S + 600, f.dahliaSubscription({ id: `sub_OLD_${f.RUN}`, status: "canceled", canceled_at: f.BASE_S + 600 }));
    const updatedOld = f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 601, f.dahliaSubscription({ id: `sub_OLD_${f.RUN}`, status: "past_due" }));
    await f.deliverApplied(deletedOld);
    await f.deliverApplied(updatedOld);

    expect(await f.subscription()).toMatchObject({ status: "active", stripeSubscriptionId: `sub_NEW_${f.RUN}`, canceledAt: null, lastEventId: null });
    for (const e of [deletedOld, updatedOld]) {
      const rows = await f.audits("billing.subscription_event_ignored", e.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({ provider: "stripe", reason: "subscription_mismatch", eventSubscriptionId: `sub_OLD_${f.RUN}`, storedSubscriptionId: `sub_NEW_${f.RUN}` });
    }
  });

  it("P4: subscription.created for a new id rebinds the row (resubscription); the old id's late events are then foreign", async () => {
    await f.resetSubscription(`sub_OLD2_${f.RUN}`, "canceled");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.created", f.BASE_S + 700, f.dahliaSubscription({ id: `sub_NEW2_${f.RUN}` })));
    expect(await f.subscription()).toMatchObject({ status: "active", stripeSubscriptionId: `sub_NEW2_${f.RUN}` });
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.deleted", f.BASE_S + 701, f.dahliaSubscription({ id: `sub_OLD2_${f.RUN}`, status: "canceled" })));
    expect(await f.subscription()).toMatchObject({ status: "active", stripeSubscriptionId: `sub_NEW2_${f.RUN}` });
  });

  it("P4: an event for the stored id (and for a row with no id yet) still applies", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 710, f.dahliaSubscription({ status: "past_due" })));
    expect((await f.subscription()).status).toBe("past_due");
    await f.resetSubscription(null, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.deleted", f.BASE_S + 720, f.dahliaSubscription({ status: "canceled" })));
    expect((await f.subscription()).status).toBe("canceled");
  });
});
