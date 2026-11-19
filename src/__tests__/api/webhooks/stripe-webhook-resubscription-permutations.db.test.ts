/**
 * [db] POST /api/webhooks/stripe — resubscription converges in EVERY delivery order (B1).
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-resubscription-permutations.db.test.ts
 *
 * Ordering is per Stripe subscription, not per row. Events for the bound subscription follow the
 * (created, terminal, id) watermark; an event for a different subscription is decided by the
 * binding key (Stripe's subscription created, subscription id): the newest subscription is
 * authoritative, so a cancelled row bound to sub_OLD rebinds to sub_NEW whatever the delivery
 * order, sub_NEW's later events apply, and a delayed event of the older subscription never
 * hijacks the binding. Each scenario delivers ALL permutations of its event set through the
 * real route and asserts one identical final row (status, stripeSubscriptionId, period, trial,
 * canceledAt).
 *
 * Real route, real offline SDK HMAC verification (test-only secret), real webhook.service and
 * handlers, real tables (support/stripe-subscription-fixture.ts). No live key, no Stripe call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("perm");
const DAY_S = 86_400;
const T = f.BASE_S; // the resubscription moment
const OLD = `sub_OLD_${f.RUN}`;
const NEW = `sub_NEW_${f.RUN}`;
const OLD_CREATED = T - 60 * DAY_S;
const NEW_CREATED = T;

function permutations<X>(items: X[]): X[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

type EventFactory = (eventId: string) => { id: string; type: string };

async function finalRow() {
  const s = await f.subscription();
  return {
    status: s.status,
    stripeSubscriptionId: s.stripeSubscriptionId,
    currentPeriodStart: s.currentPeriodStart.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    canceledAt: s.canceledAt?.toISOString() ?? null,
  };
}

/** Deliver every permutation of `events` from the same starting row; return each final row. */
async function runAllOrders(scenario: string, reset: () => Promise<void>, events: Record<string, EventFactory>) {
  const names = Object.keys(events);
  const finals: Array<{ order: string; row: Awaited<ReturnType<typeof finalRow>> }> = [];
  for (const [p, order] of permutations(names).entries()) {
    await reset();
    for (const name of order) await f.deliverApplied(events[name](`evt_${f.RUN}_${scenario}${p}_${name}`));
    finals.push({ order: order.join(">"), row: await finalRow() });
  }
  return finals;
}

const iso = (s: number) => new Date(s * 1000).toISOString();
const NEW_LATER_PERIOD: [number, number] = [T + 10, T + 40 * DAY_S];

/** sub_NEW's later renewal update: the final word on status / period / trial. */
const newUpdated = (created: number): EventFactory => (id) =>
  f.envelope(id, "customer.subscription.updated", created, f.dahliaSubscription({ id: NEW, created: NEW_CREATED, status: "active", periods: [NEW_LATER_PERIOD] }));
const newCreated = (created: number): EventFactory => (id) =>
  f.envelope(id, "customer.subscription.created", created, f.dahliaSubscription({ id: NEW, created: NEW_CREATED, status: "active", trial_end: T + 7 * DAY_S, periods: [[T, T + 30 * DAY_S]] }));
const newCheckout = (created: number): EventFactory => (id) => f.checkoutCompleted(id, created, NEW, f.CUSTOMER, NEW_CREATED - 120);
const oldDeleted = (created: number): EventFactory => (id) =>
  f.envelope(id, "customer.subscription.deleted", created, f.dahliaSubscription({ id: OLD, created: OLD_CREATED, status: "canceled", canceled_at: created }));
const oldCreated = (created: number): EventFactory => (id) =>
  f.envelope(id, "customer.subscription.created", created, f.dahliaSubscription({ id: OLD, created: OLD_CREATED, status: "active", periods: [[OLD_CREATED, OLD_CREATED + 30 * DAY_S]] }));

const EXPECTED_ACTIVE_ON_NEW = {
  status: "active",
  stripeSubscriptionId: NEW,
  currentPeriodStart: iso(NEW_LATER_PERIOD[0]),
  currentPeriodEnd: iso(NEW_LATER_PERIOD[1]),
  trialEndsAt: null,
  canceledAt: null,
};

/** The row as an earlier subscription.created / renewal of sub_OLD left it. */
const boundToOld = () =>
  f.resetSubscription(OLD, "active", {
    stripeSubscriptionCreatedAt: new Date(OLD_CREATED * 1000),
    lastEventTimestamp: new Date((T - 20 * DAY_S) * 1000),
    lastEventId: `evt_${f.RUN}_old_renewal`,
  });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — resubscription in every delivery order (B1)", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(() => f.beforeEachCase());

  it("(a) bound to sub_OLD; sub_NEW checkout + created at t; sub_OLD deleted at t+5; sub_NEW updated at t+10 -> one end state, active on sub_NEW", async () => {
    const finals = await runAllOrders("a", boundToOld, {
      checkout: newCheckout(T),
      created: newCreated(T),
      deleted: oldDeleted(T + 5),
      updated: newUpdated(T + 10),
    });
    expect(finals).toHaveLength(24);
    for (const { order, row } of finals) expect({ order, row }).toEqual({ order, row: EXPECTED_ACTIVE_ON_NEW });
  });

  it("(b) same-second cancel of sub_OLD + creation of sub_NEW -> active on sub_NEW in every order", async () => {
    const finals = await runAllOrders("b", boundToOld, {
      deleted: oldDeleted(T),
      checkout: newCheckout(T),
      created: newCreated(T),
      updated: newUpdated(T + 10),
    });
    expect(finals).toHaveLength(24);
    for (const { order, row } of finals) expect({ order, row }).toEqual({ order, row: EXPECTED_ACTIVE_ON_NEW });
  });

  it("(b') same-second resubscription without a later update -> active on sub_NEW with sub_NEW's own period + trial in every order", async () => {
    const finals = await runAllOrders("c", boundToOld, {
      deleted: oldDeleted(T),
      checkout: newCheckout(T),
      created: newCreated(T),
    });
    for (const { order, row } of finals) {
      expect({ order, row }).toEqual({
        order,
        row: { status: "active", stripeSubscriptionId: NEW, currentPeriodStart: iso(T), currentPeriodEnd: iso(T + 30 * DAY_S), trialEndsAt: iso(T + 7 * DAY_S), canceledAt: null },
      });
    }
  });

  it("(c) fresh row: checkout(sub_NEW), delayed created(sub_OLD), deleted(sub_OLD), updated(sub_NEW) -> one end state, active on sub_NEW", async () => {
    const finals = await runAllOrders("d", () => f.resetSubscription(), {
      checkout: newCheckout(T),
      oldCreated: oldCreated(T - 1_000),
      oldDeleted: oldDeleted(T + 5),
      updated: newUpdated(T + 10),
    });
    expect(finals).toHaveLength(24);
    for (const { order, row } of finals) expect({ order, row }).toEqual({ order, row: EXPECTED_ACTIVE_ON_NEW });
  });

  it("a stale created for an older, dead subscription does not hijack a live binding (ignored + audited)", async () => {
    await f.resetSubscription();
    await f.deliverApplied(newCreated(T)(f.nextEventId()));
    const stale = oldCreated(T + 50)(f.nextEventId()); // delivered late, even with a later event time
    await f.deliverApplied(stale);
    expect(await f.subscription()).toMatchObject({ status: "active", stripeSubscriptionId: NEW });
    const audits = await f.audits("billing.subscription_event_ignored", stale.id);
    expect(audits).toHaveLength(1);
    expect(audits[0].payload).toMatchObject({ reason: "subscription_mismatch", eventSubscriptionId: OLD, storedSubscriptionId: NEW });
  });

  it("a rebind is audited with the previous and the new subscription id", async () => {
    await boundToOld();
    const created = newCreated(T)(f.nextEventId());
    await f.deliverApplied(created);
    const rows = await f.audits("billing.subscription_rebound", created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ provider: "stripe", previousSubscriptionId: OLD, subscriptionId: NEW });
    expect((await f.subscription()).stripeSubscriptionCreatedAt?.toISOString()).toBe(iso(NEW_CREATED));
  });
});
