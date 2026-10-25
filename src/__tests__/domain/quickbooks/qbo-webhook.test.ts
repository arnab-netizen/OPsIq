import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeIntuitSignature, verifyIntuitSignature, parseQboWebhookPayload, QBO_WEBHOOK_MAX_REALMS,
} from "@/domain/quickbooks/qbo-webhook";

const TOKEN = "verifier-token-DO-NOT-LEAK";
const legacy = (realms: string[]) => ({ eventNotifications: realms.map((realmId) => ({ realmId, dataChangeEvent: { entities: [{ name: "Invoice", id: "1", operation: "Update", lastUpdated: "2026-10-24T00:00:00Z" }] } })) });

describe("intuit-signature", () => {
  it("accepts the HMAC-SHA256 (base64) of the exact raw body", () => {
    const body = JSON.stringify(legacy(["123"]));
    const sig = computeIntuitSignature(body, TOKEN);
    expect(verifyIntuitSignature({ rawBody: body, signature: sig, verifierToken: TOKEN })).toBe(true);
  });
  it("rejects a changed body, wrong token, missing/empty signature, and an unset verifier token (fail closed)", () => {
    const body = JSON.stringify(legacy(["123"]));
    const sig = computeIntuitSignature(body, TOKEN);
    expect(verifyIntuitSignature({ rawBody: body + " ", signature: sig, verifierToken: TOKEN })).toBe(false);
    expect(verifyIntuitSignature({ rawBody: body, signature: sig, verifierToken: "other" })).toBe(false);
    expect(verifyIntuitSignature({ rawBody: body, signature: null, verifierToken: TOKEN })).toBe(false);
    expect(verifyIntuitSignature({ rawBody: body, signature: "", verifierToken: TOKEN })).toBe(false);
    expect(verifyIntuitSignature({ rawBody: body, signature: sig, verifierToken: undefined })).toBe(false);
    expect(verifyIntuitSignature({ rawBody: body, signature: sig, verifierToken: "  " })).toBe(false);
  });
  it("a signature of different length is rejected without throwing (constant-time compare guard)", () => {
    expect(verifyIntuitSignature({ rawBody: "x", signature: "short", verifierToken: TOKEN })).toBe(false);
  });
});

describe("payload parsing — realm ids only", () => {
  it("legacy format: unique valid realms, duplicates collapsed", () => {
    expect(parseQboWebhookPayload(legacy(["123", "456", "123"]))).toEqual({ ok: true, realmIds: ["123", "456"], eventCount: 3 });
  });
  it("CloudEvents format: single object and array, company id from intuitaccountid", () => {
    const ev = (id: string, acct: string) => ({ specversion: "1.0", id, source: "intuit.qbo", type: "qbo.invoice.updated.v1", intuitaccountid: acct, time: "2026-10-24T00:00:00Z", data: { anything: 1 } });
    expect(parseQboWebhookPayload(ev("a", "777"))).toEqual({ ok: true, realmIds: ["777"], eventCount: 1 });
    expect(parseQboWebhookPayload([ev("a", "777"), ev("b", "888"), ev("c", "777")])).toEqual({ ok: true, realmIds: ["777", "888"], eventCount: 3 });
  });
  it("invalid realm ids are dropped (never trusted); an event without a usable realm still counts as recognised", () => {
    const r = parseQboWebhookPayload(legacy(["../../etc", "12 3", "123"]));
    expect(r).toEqual({ ok: true, realmIds: ["123"], eventCount: 3 });
  });
  it("malformed / unrelated payloads are not recognised", () => {
    for (const p of [null, 5, "x", [], {}, { eventNotifications: [] }, { eventNotifications: "no" }, [1, 2], { hello: "world" }]) {
      expect(parseQboWebhookPayload(p)).toEqual({ ok: false });
    }
  });
  it("is bounded: a flood of realms is capped", () => {
    const realms = Array.from({ length: QBO_WEBHOOK_MAX_REALMS + 40 }, (_, i) => String(1000 + i));
    const r = parseQboWebhookPayload(legacy(realms));
    expect(r.ok && r.realmIds.length).toBe(QBO_WEBHOOK_MAX_REALMS);
  });
  it("event content (entity ids, operations, amounts) is never surfaced", () => {
    const r = parseQboWebhookPayload({ eventNotifications: [{ realmId: "123", dataChangeEvent: { entities: [{ name: "Invoice", id: "999", operation: "Delete", amount: 5000 }] } }] });
    expect(JSON.stringify(r)).not.toMatch(/999|Delete|5000|Invoice/);
  });
});

const hoisted = vi.hoisted(() => ({ react: vi.fn() }));
vi.mock("@/services/quickbooks/qbo-webhook.service", () => ({ reactToQboWebhook: hoisted.react }));
vi.mock("@/infra/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
import { POST } from "@/app/api/webhooks/quickbooks/route";

const post = (body: string, headers: Record<string, string> = {}) => POST(new Request("http://t/api/webhooks/quickbooks", { method: "POST", body, headers }));

describe("POST /api/webhooks/quickbooks", () => {
  beforeEach(() => { hoisted.react.mockReset(); hoisted.react.mockResolvedValue({ realmsReceived: 1, connectionsTriggered: 1 }); process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN = TOKEN; });

  it("valid signature => 200 and the reaction receives realm ids only", async () => {
    const body = JSON.stringify(legacy(["123"]));
    const res = await post(body, { "intuit-signature": computeIntuitSignature(body, TOKEN) });
    expect(res.status).toBe(200);
    expect(hoisted.react).toHaveBeenCalledWith({ realmIds: ["123"] }, expect.anything());
    expect(await res.json()).toEqual({ received: true });
  });
  it("invalid / missing signature => 401 and NOTHING is parsed or enqueued", async () => {
    const body = JSON.stringify(legacy(["123"]));
    expect((await post(body, { "intuit-signature": "bad" })).status).toBe(401);
    expect((await post(body)).status).toBe(401);
    expect(hoisted.react).not.toHaveBeenCalled();
  });
  it("unset verifier token => 401 (fail closed) even with a 'valid-looking' signature", async () => {
    delete process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    const body = JSON.stringify(legacy(["123"]));
    expect((await post(body, { "intuit-signature": computeIntuitSignature(body, TOKEN) })).status).toBe(401);
    expect(hoisted.react).not.toHaveBeenCalled();
  });
  it("signed but unparseable / unrecognised payloads are acknowledged and ignored (a retry cannot fix them)", async () => {
    for (const body of ["not json", JSON.stringify({ hello: 1 })]) {
      const res = await post(body, { "intuit-signature": computeIntuitSignature(body, TOKEN) });
      expect(res.status).toBe(200);
    }
    expect(hoisted.react).not.toHaveBeenCalled();
  });
  it("an oversized body is refused before any work", async () => {
    const res = await post("x", { "content-length": String(5 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
  it("unknown realm is acknowledged exactly like a known one (no information leak)", async () => {
    hoisted.react.mockResolvedValue({ realmsReceived: 1, connectionsTriggered: 0 });
    const body = JSON.stringify(legacy(["424242"]));
    const res = await post(body, { "intuit-signature": computeIntuitSignature(body, TOKEN) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
  it("a transient failure answers 500 so Intuit redelivers; duplicates are handled by idempotent coalescing downstream", async () => {
    hoisted.react.mockRejectedValue(new Error("db down"));
    const body = JSON.stringify(legacy(["123"]));
    expect((await post(body, { "intuit-signature": computeIntuitSignature(body, TOKEN) })).status).toBe(500);
  });
  it("source: public route is registered as signed-webhook exempt and the verifier token is never logged", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/app/api/webhooks/quickbooks/route.ts", "utf8");
    expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/logger\.\w+\([^)]*(process\.env|rawBody|headers\.get|VERIFIER)/);
    expect(readFileSync("src/domain/constants/public-route-exemptions.ts", "utf8")).toContain("/api/webhooks/quickbooks");
  });
});
