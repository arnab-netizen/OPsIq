import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyQboWebhookSignature, parseQboWebhookBody, resolveQboWebhookConfig, QBO_WEBHOOK_MAX_EVENTS } from "@/domain/quickbooks/qbo-webhook";

const TOKEN = "verifier-token-1234567890";
const sign = (body: string, token = TOKEN) => createHmac("sha256", token).update(body).digest("base64");
const legacy = (entities: unknown[], realmId = "9341458068893772") => JSON.stringify({ eventNotifications: [{ realmId, dataChangeEvent: { entities } }] });
const cloud = (events: unknown[]) => JSON.stringify(events);

describe("signature", () => {
  const body = legacy([{ name: "Invoice", id: "1", operation: "Update", lastUpdated: "2026-10-10T00:00:00Z" }]);
  it("accepts the HMAC-SHA256 base64 of the exact raw body", () => {
    expect(verifyQboWebhookSignature(body, sign(body), TOKEN)).toBe(true);
    expect(verifyQboWebhookSignature(Buffer.from(body), sign(body), TOKEN)).toBe(true);
  });
  it("rejects tampering, the wrong token, missing/garbage/oversized headers and an empty token", () => {
    expect(verifyQboWebhookSignature(body + " ", sign(body), TOKEN)).toBe(false);
    expect(verifyQboWebhookSignature(body, sign(body, "other-token-0000000000"), TOKEN)).toBe(false);
    for (const bad of [null, undefined, "", "not-base64!!", "A".repeat(200), sign(body).slice(0, -4)]) {
      expect(verifyQboWebhookSignature(body, bad as never, TOKEN)).toBe(false);
    }
    expect(verifyQboWebhookSignature(body, sign(body, ""), "")).toBe(false);
  });
  it("config needs a verifier token of sane length", () => {
    expect(resolveQboWebhookConfig({})).toEqual({ available: false });
    expect(resolveQboWebhookConfig({ QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: "short" })).toEqual({ available: false });
    expect(resolveQboWebhookConfig({ QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: TOKEN })).toEqual({ available: true, verifierToken: TOKEN });
  });
});

describe("payload parsing", () => {
  it("parses the legacy format and flags supported entities", () => {
    const r = parseQboWebhookBody(legacy([
      { name: "Invoice", id: "1", operation: "Create", lastUpdated: "2026-10-10T00:00:00Z" },
      { name: "Employee", id: "2", operation: "Update" },
      { name: "invoice", id: "3", operation: "Delete" },
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => [e.entityName, e.operation, e.supported])).toEqual([["Invoice", "CREATED", true], ["Employee", "UPDATED", false], ["Invoice", "DELETED", true]]);
    expect(r.events[0].realmId).toBe("9341458068893772");
    expect(r.events[0].format).toBe("LEGACY");
  });
  it("parses the CloudEvents format (array or single object)", () => {
    const ev = { specversion: "1.0", id: "evt-1", source: "intuit.qbo", type: "qbo.customer.merged.v1", datacontenttype: "application/json", time: "2026-10-10T00:00:00Z", intuitentityid: "55", intuitaccountid: "9341458068893772", data: { x: 1 } };
    for (const payload of [cloud([ev]), JSON.stringify(ev)]) {
      const r = parseQboWebhookBody(payload);
      expect(r.ok && r.events).toHaveLength(1);
      if (r.ok) expect(r.events[0]).toMatchObject({ format: "CLOUDEVENTS", entityName: "Customer", operation: "MERGED", entityId: "55", providerEventId: "evt-1", supported: true });
    }
  });
  it("drops malformed events and counts them; never guesses", () => {
    const r = parseQboWebhookBody(legacy([{ name: "Invoice" }, { id: "1" }, { name: "Invoice", id: "a/b" }, { name: "Invoice", id: "1" }]));
    expect(r.ok && r.events).toHaveLength(1);
    expect(r.ok && r.rejectedEvents).toBe(3);
    const c = parseQboWebhookBody(cloud([{ specversion: "2.0", type: "qbo.invoice.created.v1" }, { specversion: "1.0", type: "evil", intuitaccountid: "1", intuitentityid: "1" }, { specversion: "1.0", type: "qbo.invoice.created.v1", intuitaccountid: "abc", intuitentityid: "1" }]));
    expect(c.ok && c.events).toHaveLength(0);
    expect(c.ok && c.rejectedEvents).toBe(3);
    expect(parseQboWebhookBody(legacy([{ name: "Invoice", id: "1" }], "12ab")).ok).toBe(true); // note: bad realm -> notification rejected
    const badRealm = parseQboWebhookBody(legacy([{ name: "Invoice", id: "1" }], "12ab"));
    expect(badRealm.ok && badRealm.events).toHaveLength(0);
  });
  it("rejects non-JSON, unknown shapes and floods", () => {
    expect(parseQboWebhookBody("<xml/>")).toEqual({ ok: false, reason: "NOT_JSON" });
    expect(parseQboWebhookBody(JSON.stringify({ hello: 1 }))).toEqual({ ok: false, reason: "UNRECOGNIZED_SHAPE" });
    expect(parseQboWebhookBody(JSON.stringify("x"))).toEqual({ ok: false, reason: "UNRECOGNIZED_SHAPE" });
    const flood = Array.from({ length: QBO_WEBHOOK_MAX_EVENTS + 2 }, (_, i) => ({ name: "Invoice", id: String(i) }));
    expect(parseQboWebhookBody(legacy(flood))).toEqual({ ok: false, reason: "TOO_MANY_EVENTS" });
  });
  it("event keys are deterministic, distinct per event, and identical for a redelivery", () => {
    const body = legacy([{ name: "Invoice", id: "1", operation: "Update", lastUpdated: "2026-10-10T00:00:00Z" }, { name: "Invoice", id: "1", operation: "Update", lastUpdated: "2026-10-10T00:05:00Z" }]);
    const a = parseQboWebhookBody(body);
    const b = parseQboWebhookBody(body);
    if (!a.ok || !b.ok) throw new Error("parse");
    expect(a.events[0].eventKey).toBe(b.events[0].eventKey);
    expect(a.events[0].eventKey).not.toBe(a.events[1].eventKey);
    expect(a.events[0].eventKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
