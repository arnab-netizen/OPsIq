/**
 * [db] POST /api/webhooks/stripe — the ordering decision holds the subscription row lock (F2).
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-row-lock.db.test.ts
 *
 * Production runs several serverless instances (one pooled connection each), so two deliveries
 * for one billing row can be decided concurrently on different connections. The decision
 * (read binding + watermark -> decide -> write) runs after SELECT … FOR UPDATE on the row, so a
 * delivery waits for a concurrent rebind to commit and then decides against the committed
 * binding. A SECOND raw pg connection plays the concurrent instance: it locks the row and rebinds
 * it to sub_NEW inside an open transaction while a stale sub_OLD event goes through the REAL route
 * (offline SDK HMAC, test-only secret; no Stripe call).
 *   - L1: the OLD event must wait on the lock, see the committed NEW binding, be ignored (audited),
 *     and leave the row active on NEW. Without the lock it decides on the pre-commit binding and
 *     writes `canceled` onto the row now bound to NEW.
 *   - Lock-wait timeout: the statement timeout cancels the wait -> 500, event failed (attempts 1),
 *     nothing applied; the retry processes it. The apply transaction's statement timeout is
 *     lowered for this file only (call-through wrapper on withStatementTimeout) so the case takes
 *     about a second instead of the production 10s bound.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import pg from "pg";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const timeouts = vi.hoisted(() => ({ applyMs: null as number | null }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDbInstance: actual.getDbInstance,
    withStatementTimeout: ((prisma, timeoutMs, fn, label) =>
      actual.withStatementTimeout(prisma, label === "stripe-webhook.apply" && timeouts.applyMs !== null ? timeouts.applyMs : timeoutMs, fn, label)) as typeof actual.withStatementTimeout,
  };
});

import { createStripeSubscriptionFixture } from "./support/stripe-subscription-fixture";

const f = createStripeSubscriptionFixture("lock");
const DAY_S = 86_400;
const OLD = `sub_OLD_${f.RUN}`;
const NEW = `sub_NEW_${f.RUN}`;
const OLD_CREATED = f.BASE_S - 60 * DAY_S;
const NEW_CREATED = f.BASE_S;

const boundToOld = () =>
  f.resetSubscription(OLD, "active", {
    stripeSubscriptionCreatedAt: new Date(OLD_CREATED * 1000),
    lastEventTimestamp: new Date((f.BASE_S - 20 * DAY_S) * 1000),
    lastEventId: `evt_${f.RUN}_old_renewal`,
  });

/** A second connection = a concurrent instance; holds FOR UPDATE on the row until released. */
async function holdRowLock() {
  const other = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await other.connect();
  await other.query("BEGIN");
  await other.query("SELECT id FROM subscriptions WHERE id = $1::uuid FOR UPDATE", [f.SUB_ID]);
  const waitersOnLock = async () => {
    const { rows } = await other.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()",
    );
    return rows[0].n as number;
  };
  return { other, waitersOnLock };
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Stripe webhook — row lock around the ordering decision (F2)", () => {
  beforeAll(() => f.setup());
  afterAll(() => f.teardown());
  beforeEach(async () => {
    timeouts.applyMs = null;
    await f.beforeEachCase();
  });

  it("L1: a stale sub_OLD event waits for a concurrent rebind to sub_NEW, then is ignored; the row stays active on NEW", async () => {
    await boundToOld();
    const { other, waitersOnLock } = await holdRowLock();
    try {
      // The concurrent instance rebinds the row to sub_NEW (uncommitted).
      await other.query(
        `UPDATE subscriptions SET stripe_subscription_id = $2, stripe_subscription_created_at = $3, status = 'active',
                last_event_timestamp = $4, last_event_id = $5 WHERE id = $1::uuid`,
        [f.SUB_ID, NEW, new Date(NEW_CREATED * 1000), new Date((f.BASE_S + 1) * 1000), `evt_${f.RUN}_new_created`],
      );

      // A stale cancellation of sub_OLD that is newer than OLD's watermark: under the pre-commit
      // binding it would apply.
      const stale = f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 2, f.dahliaSubscription({ id: OLD, created: OLD_CREATED, status: "canceled", canceled_at: f.BASE_S + 2 }));
      const pending = f.deliver(stale);

      // It must be blocked on the row lock (not decided yet).
      await vi.waitFor(async () => expect(await waitersOnLock()).toBeGreaterThan(0), { timeout: 10_000, interval: 25 });
      await other.query("COMMIT");

      const res = await pending;
      expect(res).toEqual({ status: 200, body: { received: true, id: stale.id, type: stale.type, status: "processed" } });
      expect(await f.subscription()).toMatchObject({ status: "active", stripeSubscriptionId: NEW, canceledAt: null });
      const ignored = await f.audits("billing.subscription_event_ignored", stale.id);
      expect(ignored).toHaveLength(1);
      expect(ignored[0].payload).toMatchObject({ reason: "subscription_mismatch", eventSubscriptionId: OLD, storedSubscriptionId: NEW });
      expect(await f.audits("billing.subscription_synced", stale.id)).toHaveLength(0);
    } finally {
      await other.end();
    }
  });

  it("lock-wait timeout: the statement timeout cancels the wait -> 500, event failed (attempts 1), nothing applied; the retry processes it", async () => {
    await boundToOld();
    timeouts.applyMs = 1_000;
    const { other, waitersOnLock } = await holdRowLock();
    const event = f.envelope(f.nextEventId(), "customer.subscription.updated", f.BASE_S + 3, f.dahliaSubscription({ id: OLD, created: OLD_CREATED, status: "past_due" }));
    try {
      const pending = f.deliver(event);
      await vi.waitFor(async () => expect(await waitersOnLock()).toBeGreaterThan(0), { timeout: 10_000, interval: 25 });
      const res = await pending; // the wait is cancelled by the statement timeout while the lock is still held
      expect(res).toEqual({ status: 500, body: { error: "Internal error" } });
    } finally {
      await other.query("ROLLBACK");
      await other.end();
    }
    expect(await f.eventRow(event.id)).toMatchObject({ status: "failed", attempts: 1 });
    expect(await f.subscription()).toMatchObject({ status: "active", stripeSubscriptionId: OLD });

    timeouts.applyMs = null;
    await f.deliverApplied(event);
    expect(await f.eventRow(event.id)).toMatchObject({ status: "processed", attempts: 1 });
    expect((await f.subscription()).status).toBe("past_due");
  });
});
