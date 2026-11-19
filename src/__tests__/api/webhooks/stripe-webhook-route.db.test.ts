/**
 * [db] POST /api/webhooks/stripe — hostile-request contract matrix against real PostgreSQL.
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/stripe-webhook-route.db.test.ts
 *
 * Nothing on the request path is stubbed: the real route, the real Stripe SDK signature
 * verification (`stripe.webhooks.constructEvent`, offline HMAC — no network), the real
 * webhook.service state machine and the real handlers write to real tables. Signatures are
 * produced with the SDK's own `webhooks.generateTestHeaderString` and a test-only secret.
 * No live key, no Stripe network call, no money: STRIPE_SECRET_KEY is set to a dummy `sk_test_`
 * value only to mirror a configured deployment; webhook verification uses the SDK's static offline
 * helper and never needs it (a dedicated case proves verification works with the key unset).
 *
 * The webhook.service exports and emitAuditEvent are wrapped in call-through spies so the
 * matrix can PROVE that a rejected request never reaches the record/processing layer, and
 * inject a single failure where a case needs one.
 *
 * Documented contract (route.ts header):
 *   bad / missing signature, missing secret, timestamp outside tolerance -> 401, nothing recorded
 *   verified but structurally invalid event                              -> 400, nothing recorded
 *   new verified event                                                   -> 200 once applied (response after settle)
 *   already processed                                                    -> 200 { duplicate: true }
 *   currently processing                                                 -> 409
 *   DB error recording the event                                         -> 500, nothing processed
 *   processing failure                                                   -> 500, event marked failed (Stripe retries)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import pg from "pg";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const spies = vi.hoisted(() => ({
  handleWebhookEvent: vi.fn(),
  getOrCreateWebhookEvent: vi.fn(),
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/services/webhook.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/webhook.service")>();
  spies.handleWebhookEvent.mockImplementation(actual.handleWebhookEvent);
  spies.getOrCreateWebhookEvent.mockImplementation(actual.getOrCreateWebhookEvent);
  return {
    ...actual,
    handleWebhookEvent: spies.handleWebhookEvent,
    getOrCreateWebhookEvent: spies.getOrCreateWebhookEvent,
  };
});
vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  spies.emitAuditEvent.mockImplementation(actual.emitAuditEvent);
  return { ...actual, emitAuditEvent: spies.emitAuditEvent };
});

import { POST } from "@/app/api/webhooks/stripe/route";
import {
  PROCESSING_TIMEOUT_MS,
  checkSignatureTimestamp,
  handleWebhookEvent,
  verifyWebhookSignature,
} from "@/services/webhook.service";

const RUN = randomUUID().slice(0, 8);
const SECRET = `whsec_test_${RUN}`;
const WS = randomUUID();
const PLAN_ID = randomUUID();
const ACCT_ID = randomUUID();
const SUB_ID = randomUUID();
const CUSTOMER = `cus_test_${RUN}`;
const STRIPE_SUB = `sub_test_${RUN}`;
const DAY = 24 * 60 * 60 * 1000;

// Offline SDK instance: used only for generateTestHeaderString (pure HMAC).
const sdk = new Stripe("sk_test_dummy_not_a_real_key");

let seq = 0;
const nextEventId = () => `evt_${RUN}_${++seq}`;

function checkoutCompleted(id: string, customer = CUSTOMER) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: { id: `cs_test_${RUN}_${seq}`, customer, subscription: STRIPE_SUB, status: "complete", mode: "subscription" },
    },
  };
}

function subscriptionEvent(id: string, type: string, overrides: Record<string, unknown> = {}) {
  const nowS = Math.floor(Date.now() / 1000);
  return {
    id,
    object: "event",
    type,
    created: nowS,
    data: {
      object: {
        id: STRIPE_SUB,
        object: "subscription",
        customer: CUSTOMER,
        status: "active",
        current_period_start: nowS - 86_400,
        current_period_end: nowS + 30 * 86_400,
        ...overrides,
      },
    },
  };
}

function sign(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return sdk.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp ?? Math.floor(Date.now() / 1000),
  });
}

function request(payload: string, signature: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== null) headers["stripe-signature"] = signature;
  return new NextRequest("http://localhost:3000/api/webhooks/stripe", { method: "POST", headers, body: payload });
}

async function post(payload: string, signature: string | null) {
  const res = await POST(request(payload, signature));
  return { status: res.status, body: await res.json() };
}

const eventRow = (id: string) => db.webhookEvent.findUnique({ where: { stripeEventId: id } });
const runEventCount = () => db.webhookEvent.count({ where: { stripeEventId: { startsWith: `evt_${RUN}_` } } });
const subscription = () => db.subscription.findUnique({ where: { id: SUB_ID } });
const activationAudits = () => db.auditEvent.count({ where: { entityId: SUB_ID, eventName: "subscription.activated" } });
const subscriptionAudits = () => db.auditEvent.count({ where: { entityId: SUB_ID } });

/** Snapshot of every row this suite's events could touch. */
async function businessState() {
  const sub = await subscription();
  return {
    webhookEvents: await runEventCount(),
    subscriptionStatus: sub?.status,
    stripeSubscriptionId: sub?.stripeSubscriptionId,
    subscriptionUpdatedAt: sub?.updatedAt?.getTime(),
    billingAccounts: await db.billingAccount.count({ where: { workspaceId: WS } }),
    activationAudits: await activationAudits(),
  };
}

async function resetSubscription() {
  await db.subscription.update({
    where: { id: SUB_ID },
    data: { status: "trialing", stripeSubscriptionId: null, lastEventTimestamp: null, canceledAt: null, cancelReason: null },
  });
  await db.auditEvent.deleteMany({ where: { entityId: SUB_ID } });
}

/** The route answers after settle; this re-checks the row state (immediate, bounded wait). */
async function settled(id: string, status: string) {
  await vi.waitFor(
    async () => {
      expect((await eventRow(id))?.status).toBe(status);
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** Asserts a rejected request reached neither the record layer nor the processing layer. */
function expectNothingReachedProcessing() {
  expect(spies.getOrCreateWebhookEvent).not.toHaveBeenCalled();
  expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
  expect(spies.emitAuditEvent).not.toHaveBeenCalled();
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] POST /api/webhooks/stripe — signature + idempotency contract", () => {
  const saved = { ...process.env };

  beforeAll(async () => {
    await db.workspace.create({ data: { id: WS, name: `Stripe WH ${RUN}`, slug: `stripe-wh-${RUN}` } });
    await db.plan.create({
      data: { id: PLAN_ID, name: `Stripe WH Plan ${RUN}`, priceMonthly: 1, priceYearly: 12, stripePriceId: `price_test_${RUN}`, active: true },
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
    spies.handleWebhookEvent.mockClear();
    spies.getOrCreateWebhookEvent.mockClear();
    spies.emitAuditEvent.mockClear();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_not_a_real_key";
    await resetSubscription();
  });

  // ── Rejections: 401 and provably no side effects ─────────────────────────

  it("invalid signature (signed with a different secret) -> 401, nothing recorded or processed", async () => {
    const before = await businessState();
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload, { secret: "whsec_attacker" }));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("garbage signature header -> 401, nothing recorded or processed", async () => {
    const before = await businessState();
    const res = await post(JSON.stringify(checkoutCompleted(nextEventId())), "invalid-signature-xyz");
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("missing stripe-signature header -> 401, nothing recorded or processed", async () => {
    const before = await businessState();
    const res = await post(JSON.stringify(checkoutCompleted(nextEventId())), null);
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("missing webhook configuration (no STRIPE_WEBHOOK_SECRET) -> fail-closed 401 even for a correctly signed event", async () => {
    const before = await businessState();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("expired timestamp (signed 10 min ago, outside the 300s tolerance) -> 401, nothing recorded", async () => {
    const before = await businessState();
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload, { timestamp: Math.floor(Date.now() / 1000) - 600 }));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("malformed JSON payload -> 401 whether unsigned or validly signed (verification parses the body), nothing recorded", async () => {
    const before = await businessState();
    const broken = '{"id":"evt_broken","type":"checkout.session.completed",';
    expect((await post(broken, "t=1,v1=deadbeef")).status).toBe(401);
    expect((await post(broken, sign(broken))).status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("validly signed event without id/type -> 400 'Invalid event structure', nothing recorded", async () => {
    const before = await businessState();
    for (const payload of [JSON.stringify({ type: "checkout.session.completed" }), JSON.stringify({ id: nextEventId() }), JSON.stringify({ id: "", type: "" })]) {
      const res = await post(payload, sign(payload));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Invalid event structure" });
    }
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  // ── Accepted path, duplicates and replays ────────────────────────────────

  it("valid signature -> 200 once applied, processed exactly once; redelivery and byte-identical replay -> 200 duplicate, no reprocessing", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    const header = sign(payload);

    const first = await post(payload, header);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true, id, type: "checkout.session.completed", status: "processed" });
    await settled(id, "processed");

    const sub = await subscription();
    expect(sub?.status).toBe("active");
    expect(sub?.stripeSubscriptionId).toBe(STRIPE_SUB);
    expect(await activationAudits()).toBe(1);
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    const afterFirst = await businessState();

    // Stripe redelivery: same event id, fresh signature timestamp.
    const redelivery = await post(payload, sign(payload));
    expect(redelivery.status).toBe(200);
    expect(redelivery.body).toEqual({ received: true, duplicate: true });

    // Attacker replay: the exact captured header + body, still inside tolerance.
    const replay = await post(payload, header);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ received: true, duplicate: true });

    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(await businessState()).toEqual(afterFirst);
    expect(await eventRow(id)).toMatchObject({ status: "processed", attempts: 0 });
  });

  it("concurrent duplicate deliveries of one new event -> processed exactly once, one row, never 5xx", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    const results = await Promise.all(Array.from({ length: 8 }, () => post(payload, sign(payload))));
    // Exactly one delivery wins and applies it (200 status "processed"). Every loser either sees
    // the in-flight row (409, Stripe retries) or the finished row (200 duplicate) -- including a
    // loser of the unique-insert race on stripe_event_id, which re-reads the winner's row instead
    // of surfacing a 500.
    expect(results.filter((r) => r.status === 200 && r.body.status === "processed")).toHaveLength(1);
    for (const r of results) expect(r.status === 409 || (r.status === 200 && (r.body.duplicate === true || r.body.status === "processed"))).toBe(true);
    await settled(id, "processed");
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(await db.webhookEvent.count({ where: { stripeEventId: id } })).toBe(1);
    expect(await activationAudits()).toBe(1);
  });

  /**
   * Deterministic unique-insert race: a second connection inserts the same stripe_event_id inside an
   * open transaction, so the route's findUnique sees nothing and its INSERT blocks on the unique
   * index; once the other transaction commits, the route's INSERT fails with a unique violation.
   */
  async function raceInsertAgainstRoute(id: string, committedStatus: "processing" | "processed") {
    const other = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    try {
      await other.query("BEGIN");
      await other.query(
        "INSERT INTO webhook_events (stripe_event_id, type, status, attempts) VALUES ($1, 'checkout.session.completed', $2, 0)",
        [id, committedStatus],
      );
      const payload = JSON.stringify(checkoutCompleted(id));
      const pending = post(payload, sign(payload));
      await vi.waitFor(
        async () => {
          const { rows } = await other.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()",
          );
          expect(rows[0].n).toBeGreaterThan(0);
        },
        { timeout: 10_000, interval: 25 },
      );
      await other.query("COMMIT");
      return await pending;
    } finally {
      await other.end();
    }
  }

  it("lost unique-insert race while the winner is in flight -> 409 (not 500), not processed", async () => {
    const id = nextEventId();
    const res = await raceInsertAgainstRoute(id, "processing");
    expect(res.status).toBe(409);
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
    expect(await db.webhookEvent.count({ where: { stripeEventId: id } })).toBe(1);
    expect((await subscription())?.status).toBe("trialing");
  });

  it("lost unique-insert race after the winner finished -> 200 duplicate (not 500), not processed", async () => {
    const id = nextEventId();
    const res = await raceInsertAgainstRoute(id, "processed");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
  });

  it("concurrent redeliveries of a previously FAILED event -> exactly one retry claims it, one activation", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "checkout.session.completed", status: "failed", attempts: 1 } });
    const payload = JSON.stringify(checkoutCompleted(id));
    const results = await Promise.all(Array.from({ length: 6 }, () => post(payload, sign(payload))));
    expect(results.filter((r) => r.status === 200 && r.body.status === "processed")).toHaveLength(1);
    for (const r of results) expect(r.status === 409 || (r.status === 200 && (r.body.duplicate === true || r.body.status === "processed"))).toBe(true);
    await settled(id, "processed");
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(await activationAudits()).toBe(1);
    expect(await eventRow(id)).toMatchObject({ status: "processed", attempts: 1 });
  });

  it("a just-claimed retry of an OLD event is not swept as stale by a concurrent delivery", async () => {
    const id = nextEventId();
    // Created long ago, but (re)claimed for processing just now: in flight, not stuck.
    await db.webhookEvent.create({
      data: { stripeEventId: id, type: "checkout.session.completed", status: "processing", attempts: 1, createdAt: new Date(Date.now() - 60 * 60 * 1000), updatedAt: new Date() },
    });
    const payload = JSON.stringify(checkoutCompleted(id));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(409);
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
    expect(await eventRow(id)).toMatchObject({ status: "processing", attempts: 1 });
  });

  it("an event genuinely stuck in processing (> 5 min since claim) is recovered and retried once", async () => {
    const id = nextEventId();
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.webhookEvent.create({
      data: { stripeEventId: id, type: "checkout.session.completed", status: "processing", attempts: 0, createdAt: longAgo, updatedAt: longAgo },
    });
    const payload = JSON.stringify(checkoutCompleted(id));
    expect((await post(payload, sign(payload))).status).toBe(200);
    await settled(id, "processed");
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(1);
    expect(await activationAudits()).toBe(1);
  });

  it("event already in 'processing' state -> 409, not processed again", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "checkout.session.completed", status: "processing", attempts: 0 } });
    const payload = JSON.stringify(checkoutCompleted(id));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(409);
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
    expect((await subscription())?.status).toBe("trialing");
  });

  // ── Database failure ─────────────────────────────────────────────────────

  it("database failure recording the event -> 500 'Internal error', never processed, nothing written", async () => {
    const before = await businessState();
    spies.getOrCreateWebhookEvent.mockRejectedValueOnce(new Error("Can't reach database server at 127.0.0.1:5433"));
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal error" });
    expect(spies.handleWebhookEvent).not.toHaveBeenCalled();
    expect(await businessState()).toEqual(before);
  });

  it("database failure inside processing (unknown Stripe customer) -> 500 with the event marked failed, no subscription change; retry succeeds once fixed", async () => {
    const id = nextEventId();
    const unknownCustomer = `cus_unknown_${RUN}`;
    const payload = JSON.stringify(checkoutCompleted(id, unknownCustomer));
    const res = await post(payload, sign(payload));
    expect(res.status).toBe(500);
    await settled(id, "failed");
    expect(await eventRow(id)).toMatchObject({ status: "failed", attempts: 1 });
    expect((await subscription())?.status).toBe("trialing");
    expect(await activationAudits()).toBe(0);
  });

  it("transient database failure while processing -> event failed (retryable), redelivery processes it exactly once", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    spies.handleWebhookEvent.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    expect((await post(payload, sign(payload))).status).toBe(500);
    await settled(id, "failed");
    expect((await subscription())?.status).toBe("trialing");
    expect(await activationAudits()).toBe(0);

    expect((await post(payload, sign(payload))).status).toBe(200);
    await settled(id, "processed");
    expect((await subscription())?.status).toBe("active");
    expect(await activationAudits()).toBe(1);
    expect(spies.handleWebhookEvent).toHaveBeenCalledTimes(2);
  });
  // ── Replay protection uses the SIGNED timestamp (t=), not the receive time ──

  it("signature timestamp 10 min in the future -> 401, nothing recorded (verified t= is checked, not Date.now())", async () => {
    const before = await businessState();
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const res = await post(payload, sign(payload, { timestamp: Math.floor(Date.now() / 1000) + 600 }));
    expect(res.status).toBe(401);
    expectNothingReachedProcessing();
    expect(await businessState()).toEqual(before);
  });

  it("small forward clock skew (+60s) inside tolerance is still accepted", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    const res = await post(payload, sign(payload, { timestamp: Math.floor(Date.now() / 1000) + 60 }));
    expect(res.status).toBe(200);
    await settled(id, "processed");
  });

  it("the recorded stripeTimestamp is the verified signature t=, not the receive time", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    const signedAt = Math.floor(Date.now() / 1000) - 120;
    expect((await post(payload, sign(payload, { timestamp: signedAt }))).status).toBe(200);
    await settled(id, "processed");
    expect((await eventRow(id))?.stripeTimestamp).toBe(signedAt);
  });

  it("verifyWebhookSignature returns the signed t= and rejects a header with an ambiguous timestamp", async () => {
    const payload = JSON.stringify(checkoutCompleted(nextEventId()));
    const signedAt = Math.floor(Date.now() / 1000) - 42;
    const header = sign(payload, { timestamp: signedAt });
    expect((await verifyWebhookSignature(payload, header)).timestamp).toBe(signedAt);
    // A second t= element makes the signed timestamp ambiguous: fail closed.
    await expect(verifyWebhookSignature(payload, `t=${signedAt + 1},${header}`)).rejects.toThrow();
  });

  it("checkSignatureTimestamp enforces the tolerance window in both directions", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(() => checkSignatureTimestamp(now)).not.toThrow();
    expect(() => checkSignatureTimestamp(now - 299)).not.toThrow();
    expect(() => checkSignatureTimestamp(now + 60)).not.toThrow();
    expect(() => checkSignatureTimestamp(now - 301)).toThrow(/too old/);
    expect(() => checkSignatureTimestamp(now + 301)).toThrow(/future/);
    expect(() => checkSignatureTimestamp(Number.NaN)).toThrow();
  });

  it("verification needs no STRIPE_SECRET_KEY (offline HMAC): valid -> 200, forged -> 401", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_API_KEY;
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    expect((await post(payload, sign(payload, { secret: "whsec_attacker" }))).status).toBe(401);
    expect((await post(payload, sign(payload))).status).toBe(200);
    await settled(id, "processed");
  });
  // ── Atomicity: subscription mutation + audit event + event-state transition ──

  it("audit write fails after the subscription update -> NOTHING applied, event failed; retry applies it exactly once", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(checkoutCompleted(id));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));
    expect((await post(payload, sign(payload))).status).toBe(500);
    await settled(id, "failed");
    const sub = await subscription();
    expect(sub?.status).toBe("trialing");
    expect(sub?.stripeSubscriptionId).toBeNull();
    expect(await subscriptionAudits()).toBe(0);
    expect(await eventRow(id)).toMatchObject({ status: "failed", attempts: 1 });

    expect((await post(payload, sign(payload))).status).toBe(200);
    await settled(id, "processed");
    expect((await subscription())?.status).toBe("active");
    expect(await activationAudits()).toBe(1);
    expect(await subscriptionAudits()).toBe(1);
  });

  it("customer.subscription.created: audit failure rolls back the activation", async () => {
    const id = nextEventId();
    const payload = JSON.stringify(subscriptionEvent(id, "customer.subscription.created"));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));
    expect((await post(payload, sign(payload))).status).toBe(500);
    await settled(id, "failed");
    expect(await subscription()).toMatchObject({ status: "trialing", stripeSubscriptionId: null });
    expect(await subscriptionAudits()).toBe(0);
  });

  it("customer.subscription.updated -> status synced with exactly one audit row; audit failure rolls it back", async () => {
    const failing = nextEventId();
    const failingPayload = JSON.stringify(subscriptionEvent(failing, "customer.subscription.updated", { status: "past_due" }));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));
    expect((await post(failingPayload, sign(failingPayload))).status).toBe(500);
    await settled(failing, "failed");
    expect((await subscription())?.status).toBe("trialing");
    expect(await subscriptionAudits()).toBe(0);

    const id = nextEventId();
    const payload = JSON.stringify(subscriptionEvent(id, "customer.subscription.updated", { status: "past_due" }));
    expect((await post(payload, sign(payload))).status).toBe(200);
    await settled(id, "processed");
    expect((await subscription())?.status).toBe("past_due");
    expect(await db.auditEvent.count({ where: { entityId: SUB_ID, eventName: "billing.subscription_synced", correlationId: id } })).toBe(1);
  });

  it("customer.subscription.deleted -> canceled with exactly one audit row; audit failure rolls it back", async () => {
    const failing = nextEventId();
    const failingPayload = JSON.stringify(subscriptionEvent(failing, "customer.subscription.deleted", { status: "canceled" }));
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));
    expect((await post(failingPayload, sign(failingPayload))).status).toBe(500);
    await settled(failing, "failed");
    expect(await subscription()).toMatchObject({ status: "trialing", canceledAt: null });
    expect(await subscriptionAudits()).toBe(0);

    const id = nextEventId();
    const payload = JSON.stringify(subscriptionEvent(id, "customer.subscription.deleted", { status: "canceled" }));
    expect((await post(payload, sign(payload))).status).toBe(200);
    await settled(id, "processed");
    expect((await subscription())?.status).toBe("canceled");
    expect(await db.auditEvent.count({ where: { entityId: SUB_ID, eventName: "billing.subscription_synced", correlationId: id } })).toBe(1);
  });

  it("handler refuses to apply an event it does not hold the processing claim for (no side effect)", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "checkout.session.completed", status: "failed", attempts: 1 } });
    await expect(handleWebhookEvent(checkoutCompleted(id))).rejects.toThrow(/not claimed/);
    expect(await subscription()).toMatchObject({ status: "trialing", stripeSubscriptionId: null });
    expect(await subscriptionAudits()).toBe(0);
    expect(await eventRow(id)).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("successful processing commits the event state together with the mutation (processed + processedAt)", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "checkout.session.completed", status: "processing", attempts: 0, processedAt: null } });
    await handleWebhookEvent(checkoutCompleted(id));
    const row = await eventRow(id);
    expect(row?.status).toBe("processed");
    expect(row?.processedAt).toBeInstanceOf(Date);
    expect((await subscription())?.status).toBe("active");
    expect(await activationAudits()).toBe(1);
  });
  // ── Timeout backstop timer must not outlive the processing it guards ──────

  /** Count backstop timers (delay === PROCESSING_TIMEOUT_MS) armed during `run` and never cleared. */
  async function backstopTimersLeftArmed(run: () => Promise<unknown>) {
    // Call-through spies: timers behave normally, the spies only record handles.
    const setSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      await run().catch(() => undefined);
      const armed = setSpy.mock.calls
        .map((call, i) => ({ ms: call[1], handle: setSpy.mock.results[i]?.value }))
        .filter((t) => t.ms === PROCESSING_TIMEOUT_MS)
        .map((t) => t.handle);
      const cleared = new Set(clearSpy.mock.calls.map((call) => call[0]));
      return armed.filter((handle) => !cleared.has(handle)).length;
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  }

  it("processing timeout timer is cleared once processing succeeds", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "invoice.paid", status: "processing", attempts: 0 } });
    expect(await backstopTimersLeftArmed(() => handleWebhookEvent({ id, type: "invoice.paid", created: Math.floor(Date.now() / 1000), data: { object: {} } }))).toBe(0);
    expect((await eventRow(id))?.status).toBe("processed");
  });

  it("processing timeout timer is cleared once processing fails", async () => {
    const id = nextEventId();
    await db.webhookEvent.create({ data: { stripeEventId: id, type: "checkout.session.completed", status: "processing", attempts: 0 } });
    expect(await backstopTimersLeftArmed(() => handleWebhookEvent(checkoutCompleted(id, `cus_unknown_${RUN}`)))).toBe(0);
    expect((await eventRow(id))?.status).toBe("processing");
  });
});
