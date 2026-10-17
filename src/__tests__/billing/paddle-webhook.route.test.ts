import { describe, it, expect, beforeEach, vi } from "vitest";
import { computePaddleSignature } from "@/services/billing/paddle-signature";

const m = vi.hoisted(() => ({
  getOrCreate: vi.fn(),
  markProcessed: vi.fn(),
  markFailed: vi.fn(),
  process: vi.fn(),
  auditRejected: vi.fn(),
}));
vi.mock("@/services/webhook.service", () => ({
  getOrCreateWebhookEvent: m.getOrCreate,
  markWebhookEventProcessed: m.markProcessed,
  markWebhookEventFailed: m.markFailed,
}));
vi.mock("@/services/billing/paddle-webhook.service", async () => {
  class PaddleEventRejectedError extends Error {
    constructor(public reason: string, public workspaceId?: string) { super(reason); }
  }
  return { PaddleEventRejectedError, processPaddleEvent: m.process, auditRejectedPaddleEvent: m.auditRejected };
});

import { POST } from "@/app/api/webhooks/paddle/route";
import { PaddleEventRejectedError } from "@/services/billing/paddle-webhook.service";

const SECRET = "route_test_secret";
const body = JSON.stringify({
  event_id: "evt_9",
  event_type: "subscription.created",
  occurred_at: "2026-10-01T10:00:00Z",
  data: { id: "sub_1" },
});
function req(raw = body, opts: { secret?: string; ts?: number; header?: string | null } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const header =
    opts.header === undefined ? `ts=${ts};h1=${computePaddleSignature(opts.secret ?? SECRET, String(ts), raw)}` : opts.header;
  return new Request("http://x/api/webhooks/paddle", {
    method: "POST",
    headers: header ? { "paddle-signature": header } : {},
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PADDLE_WEBHOOK_SECRET = SECRET;
  m.getOrCreate.mockResolvedValue({ event: { status: "processing" }, isNew: true, shouldProcess: true, shouldRetry: false, isDeadLetter: false });
  m.process.mockResolvedValue("applied");
  m.markProcessed.mockResolvedValue(undefined);
});

describe("POST /api/webhooks/paddle", () => {
  it("rejects a forged signature with 401 and touches nothing", async () => {
    const res = await POST(req(body, { secret: "attacker" }));
    expect(res.status).toBe(401);
    expect(m.getOrCreate).not.toHaveBeenCalled();
    expect(m.process).not.toHaveBeenCalled();
  });
  it("rejects missing header, stale timestamp, and unset secret with 401", async () => {
    expect((await POST(req(body, { header: null }))).status).toBe(401);
    expect((await POST(req(body, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    delete process.env.PADDLE_WEBHOOK_SECRET;
    expect((await POST(req())).status).toBe(401);
    expect(m.process).not.toHaveBeenCalled();
  });
  it("rejects a validly signed but malformed envelope with 400", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req(JSON.stringify({ event_type: "x" })))).status).toBe(400);
    expect(m.process).not.toHaveBeenCalled();
  });
  it("applies a verified event once and marks it processed (200)", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(m.getOrCreate).toHaveBeenCalledWith("paddle:evt_9", "subscription.created", expect.any(Number));
    expect(m.process).toHaveBeenCalledTimes(1);
    expect(m.markProcessed).toHaveBeenCalledWith("paddle:evt_9");
  });
  it("duplicate delivery of a processed event is acknowledged without reprocessing", async () => {
    m.getOrCreate.mockResolvedValue({ event: { status: "processed" }, isNew: false, shouldProcess: false, shouldRetry: false, isDeadLetter: false });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(m.process).not.toHaveBeenCalled();
  });
  it("concurrent in-flight delivery gets 409 so the provider retries", async () => {
    m.getOrCreate.mockResolvedValue({ event: { status: "processing" }, isNew: false, shouldProcess: false, shouldRetry: false, isDeadLetter: false });
    expect((await POST(req())).status).toBe(409);
    expect(m.process).not.toHaveBeenCalled();
  });
  it("transient processing failure returns 500 and records the failure for retry", async () => {
    m.process.mockRejectedValue(new Error("db down"));
    expect((await POST(req())).status).toBe(500);
    expect(m.markFailed).toHaveBeenCalledWith("paddle:evt_9", expect.any(Error));
    expect(m.markProcessed).not.toHaveBeenCalled();
  });
  it("a signed but unacceptable (cross-tenant) event is audited, acknowledged, and grants nothing", async () => {
    m.process.mockRejectedValue(new PaddleEventRejectedError("tenant_mismatch", "ws"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rejected: "tenant_mismatch" });
    expect(m.auditRejected).toHaveBeenCalledTimes(1);
  });
});
