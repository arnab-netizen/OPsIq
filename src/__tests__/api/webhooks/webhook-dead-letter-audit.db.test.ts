/**
 * [db] Webhook dead-letter transition is audited, exactly once, atomically with the move.
 *
 * Run (disposable loopback database with every migration applied):
 *   TEST_WITH_DB=true OPSIQ_DB_TARGET=local DATABASE_URL=postgresql://…@127.0.0.1:…/db \
 *     TEST_DATABASE_URL=<same> npx vitest run src/__tests__/api/webhooks/webhook-dead-letter-audit.db.test.ts
 *
 * A failed event redelivered past MAX_ATTEMPTS is moved failed -> dead_letter (no more retries:
 * a governed financial event is abandoned and needs manual investigation). That move and its
 * WEBHOOK_DEAD_LETTERED audit row commit in one transaction: never a dead-lettered event without
 * its audit row, never an audit row for a move that did not happen, and a redelivery of an
 * already dead-lettered event adds nothing.
 *
 * Real route, real offline Stripe SDK HMAC verification (test-only secret), real tables; the
 * audit emitter is a call-through spy only to inject one failure. No Stripe network call.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const spies = vi.hoisted(() => ({ emitAuditEvent: vi.fn(), actual: null as null | ((...args: never[]) => Promise<string>) }));
vi.mock("@/infra/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infra/audit")>();
  spies.actual = actual.emitAuditEvent as never;
  spies.emitAuditEvent.mockImplementation(actual.emitAuditEvent);
  return { ...actual, emitAuditEvent: spies.emitAuditEvent };
});

import { POST } from "@/app/api/webhooks/stripe/route";
import { getOrCreateWebhookEvent } from "@/services/webhook.service";

const RUN = randomUUID().slice(0, 8);
const SECRET = `whsec_test_dl_${RUN}`;
const DEAD = "webhook.dead_lettered";
const sdk = new Stripe("sk_test_dummy_not_a_real_key");
let seq = 0;
const nextEventId = () => `evt_${RUN}_${++seq}`;

async function deliver(id: string) {
  const payload = JSON.stringify({
    id,
    object: "event",
    type: "invoice.paid",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `in_${RUN}_${seq}` } },
  });
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

/** A failed event that has used every retry: the next delivery moves it to dead_letter. */
const exhaustedFailedEvent = (id: string) =>
  db.webhookEvent.create({ data: { stripeEventId: id, type: "invoice.paid", status: "failed", attempts: 5, lastError: "Billing account not found" } });
const eventRow = (id: string) => db.webhookEvent.findUnique({ where: { stripeEventId: id } });
const deadLetterAudits = (id: string) => db.auditEvent.findMany({ where: { eventName: DEAD, entityId: id } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] webhook dead-letter move is audited atomically", () => {
  const saved = { ...process.env };

  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { eventName: DEAD, entityId: { startsWith: `evt_${RUN}_` } } });
    await db.auditEvent.deleteMany({ where: { eventName: DEAD, entityId: { startsWith: `paddle:evt_${RUN}_` } } });
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `evt_${RUN}_` } } });
    await db.webhookEvent.deleteMany({ where: { stripeEventId: { startsWith: `paddle:evt_${RUN}_` } } });
    process.env = { ...saved };
  });
  beforeEach(() => {
    spies.emitAuditEvent.mockReset().mockImplementation(spies.actual!);
  });

  it("moving an exhausted event to dead_letter writes exactly one audit row; redelivery adds none", async () => {
    const id = nextEventId();
    await exhaustedFailedEvent(id);

    expect(await deliver(id)).toEqual({ status: 400, body: { error: "Event exceeded max retries" } });
    expect(await eventRow(id)).toMatchObject({ status: "dead_letter", attempts: 6 });
    const rows = await deadLetterAudits(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorType: "system", actorId: null, entityType: "WebhookEvent", correlationId: id, visibility: "internal" });
    expect(rows[0].payload).toMatchObject({ type: "invoice.paid", attempts: 6, maxAttempts: 5, previousError: "Billing account not found" });

    expect((await deliver(id)).status).toBe(400);
    expect(await deadLetterAudits(id)).toHaveLength(1);
  });

  it("concurrent redeliveries of an exhausted event dead-letter it once with one audit row", async () => {
    const id = nextEventId();
    await exhaustedFailedEvent(id);
    const results = await Promise.all(Array.from({ length: 5 }, () => deliver(id)));
    for (const r of results) expect([400, 409]).toContain(r.status);
    expect(await eventRow(id)).toMatchObject({ status: "dead_letter", attempts: 6 });
    expect(await deadLetterAudits(id)).toHaveLength(1);
  });

  it("an audit write failure rolls the dead-letter move back (500, still failed); the next delivery moves + audits once", async () => {
    const id = nextEventId();
    await exhaustedFailedEvent(id);
    spies.emitAuditEvent.mockRejectedValueOnce(new Error("audit write failed"));

    expect(await deliver(id)).toEqual({ status: 500, body: { error: "Internal error" } });
    expect(await eventRow(id)).toMatchObject({ status: "failed", attempts: 5 });
    expect(await deadLetterAudits(id)).toHaveLength(0);

    expect((await deliver(id)).status).toBe(400);
    expect(await eventRow(id)).toMatchObject({ status: "dead_letter", attempts: 6 });
    expect(await deadLetterAudits(id)).toHaveLength(1);
  });

  it("the same shared transition audits Paddle-keyed events (one state machine for both providers)", async () => {
    const key = `paddle:evt_${RUN}_${++seq}`;
    await db.webhookEvent.create({ data: { stripeEventId: key, type: "subscription.updated", status: "failed", attempts: 5 } });
    const claim = await getOrCreateWebhookEvent(key, "subscription.updated", Math.floor(Date.now() / 1000));
    expect(claim.disposition).toBe("dead_letter");
    expect(await deadLetterAudits(key)).toHaveLength(1);
  });
});
