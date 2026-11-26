/**
 * [db] POST /api/webhooks/stripe — same-second ties never undo a cancellation (P2)
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-terminal-tie.db.test.ts
 *
 * Stripe's created is whole seconds and event ids are not time-ordered. A terminal event
 * (customer.subscription.deleted, or a status of canceled / incomplete_expired) wins a same-second
 * tie against a non-terminal event, in either delivery order and whatever the ids; ties between
 * events of the same class fall back to the event id (deterministic convergence).
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("tie");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — same-second ties never undo a cancellation (P2)", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    await f.beforeEachCase();
  });

  it("P2: deleted (lower id) then same-second updated{active} (higher id) -> stays canceled, update audited stale", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    const t = f.BASE_S + 100;
    const deleted = f.envelope(`evt_${f.RUN}_p2a_a`, "customer.subscription.deleted", t, f.dahliaSubscription({ status: "canceled", canceled_at: t }));
    const update = f.envelope(`evt_${f.RUN}_p2a_b`, "customer.subscription.updated", t, f.dahliaSubscription({ status: "active" }));
    await f.deliverApplied(deleted);
    await f.deliverApplied(update);
    expect((await f.subscription()).status).toBe("canceled");
    expect(await f.audits("billing.subscription_stale_event_ignored", update.id)).toHaveLength(1);
  });

  it("P2: updated{active} then same-second deleted -> canceled, for both id orders", async () => {
    const t = f.BASE_S + 200;
    for (const [first, second] of [
      ["p2b_a", "p2b_b"],
      ["p2c_b", "p2c_a"],
    ] as const) {
      await f.resetSubscription(f.STRIPE_SUB, "active");
      await f.deliverApplied(f.envelope(`evt_${f.RUN}_${first}`, "customer.subscription.updated", t, f.dahliaSubscription({ status: "active" })));
      await f.deliverApplied(f.envelope(`evt_${f.RUN}_${second}`, "customer.subscription.deleted", t, f.dahliaSubscription({ status: "canceled", canceled_at: t })));
      expect((await f.subscription()).status).toBe("canceled");
    }
  });

  it("P2: updated{status: canceled} is terminal too: wins a same-second tie against updated{active} in both orders", async () => {
    const t = f.BASE_S + 300;
    for (const [canceledId, activeId, canceledFirst] of [
      ["p2d_a", "p2d_b", true],
      ["p2e_b", "p2e_a", false],
    ] as const) {
      await f.resetSubscription(f.STRIPE_SUB, "active");
      const canceled = f.envelope(`evt_${f.RUN}_${canceledId}`, "customer.subscription.updated", t, f.dahliaSubscription({ status: "canceled", canceled_at: t }));
      const active = f.envelope(`evt_${f.RUN}_${activeId}`, "customer.subscription.updated", t, f.dahliaSubscription({ status: "active" }));
      for (const e of canceledFirst ? [canceled, active] : [active, canceled]) await f.deliverApplied(e);
      expect((await f.subscription()).status).toBe("canceled");
    }
  });

  it("P2: a strictly NEWER non-terminal event still applies after a cancellation (resubscribe/reactivation is time-ordered)", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 350, f.dahliaSubscription({ status: "canceled" })));
    await f.deliverApplied(f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 351, f.dahliaSubscription({ status: "active" })));
    expect((await f.subscription()).status).toBe("active");
  });
});
