/**
 * [db] POST /api/webhooks/stripe — response only after the event settles
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-settle-before-response.db.test.ts
 *
 * Stripe treats any 2xx as delivered and never redelivers it. The route therefore answers only
 * once processing has settled: 200 when the event is applied (row processed), 500 when it failed
 * (row failed, so Stripe's redelivery re-claims it once through the existing failed -> processing
 * CAS). Formerly a 202 was returned before unawaited processing, so a failure after the response
 * (schema error, unknown customer, DB error, timeout, frozen serverless process) was never retried.
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const spies = vi.hoisted(() => ({ emitAuditEvent: vi.fn(), actual: null as null | ((...args: never[]) => Promise<string>) }));
vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  spies.actual = actual.emitAuditEvent as never;
  spies.emitAuditEvent.mockImplementation(actual.emitAuditEvent);
  return { ...actual, emitAuditEvent: spies.emitAuditEvent };
});

import { maxDuration } from "@/app/api/webhooks/stripe/route";
import { PROCESSING_TIMEOUT_MS } from "@/services/webhook.service";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("sbr");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — response only after the event settles", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    spies.emitAuditEvent.mockReset().mockImplementation(spies.actual!);
    await f.beforeEachCase();
  });

  it("the processing bound fits inside the request lifetime (response after settle or bounded timeout)", () => {
    expect(PROCESSING_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PROCESSING_TIMEOUT_MS).toBeLessThan(maxDuration * 1000);
  });

  it("success answers 200 only after the event row is processed and the mutation committed", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    const event = f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 10, f.legacySubscription({ status: "past_due" }));
    await f.deliverApplied(event);
    expect((await f.subscription()).status).toBe("past_due");
  });

  it("a processing failure answers 500 with the row failed; the redelivery re-claims it once and answers 200", async () => {
    await f.resetSubscription(f.STRIPE_SUB, "active");
    const event = f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 20, f.legacySubscription({ status: "past_due" }));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));
    const failed = await f.deliver(event);
    expect(failed).toEqual({ status: 500, body: { error: "Internal error" } });
    expect(await f.eventRow(event.id)).toMatchObject({ status: "failed", attempts: 1 });
    expect((await f.subscription()).status).toBe("active");

    await f.deliverApplied(event);
    expect(await f.eventRow(event.id)).toMatchObject({ status: "processed", attempts: 1 });
    expect((await f.subscription()).status).toBe("past_due");
    expect(await f.audits("billing.subscription_synced", event.id)).toHaveLength(1);
  });

  it("an unknown Stripe customer answers 500 and leaves the event failed (never a 2xx for an unapplied event)", async () => {
    const id = f.nextEventId();
    const res = await f.deliver(f.checkoutCompleted(id, f.BASE_S + 30, f.STRIPE_SUB, `cus_unknown_${f.RUN}`));
    expect(res.status).toBe(500);
    expect(await f.eventRow(id)).toMatchObject({ status: "failed", attempts: 1 });
  });
});
