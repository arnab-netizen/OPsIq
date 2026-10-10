/**
 * Intuit webhook CONTRACT proof (CloudEvents 1.0 payload + intuit-signature). The expectations below are written from Intuit's
 * documented contract, independently of the implementation:
 *   header  : intuit-signature
 *   digest  : Base64( HMAC-SHA256( key = webhook verifier token, message = exact raw request payload ) )
 *   payload : JSON array of CloudEvents 1.0 objects (specversion, id, source, type, datacontenttype, time,
 *             intuitentityid, intuitaccountid, data); intuitaccountid is the QBO company (realm) id.
 * The known-answer vector was produced OUTSIDE this codebase with `openssl dgst -sha256 -hmac <key> -binary | openssl base64`.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { QBO_WEBHOOK_SIGNATURE_HEADER, parseQboWebhookBody, resolveQboWebhookConfig, verifyQboWebhookSignature } from "@/domain/quickbooks/qbo-webhook";

const KAT_KEY = "kat-verifier-token-0123456789";
const KAT_BODY = '[{"specversion":"1.0","id":"a1b2","source":"intuit.qbo","type":"qbo.invoice.updated.v1","datacontenttype":"application/json","time":"2026-10-10T12:00:00Z","intuitentityid":"130","intuitaccountid":"9341458068893772","data":{}}]';
const KAT_SIGNATURE = "m/O2IKIeitcMudB3NP2qwJ1ORimj53LDx1bkYiIUNyk="; // from openssl, not from this repository

describe("webhook signature contract", () => {
  it("the header name is intuit-signature", () => {
    expect(QBO_WEBHOOK_SIGNATURE_HEADER).toBe("intuit-signature");
  });
  it("matches an independently computed HMAC-SHA256 / Base64 known-answer vector over the raw body", () => {
    expect(verifyQboWebhookSignature(KAT_BODY, KAT_SIGNATURE, KAT_KEY)).toBe(true);
    expect(verifyQboWebhookSignature(Buffer.from(KAT_BODY, "utf8"), KAT_SIGNATURE, KAT_KEY)).toBe(true);
    expect(createHmac("sha256", KAT_KEY).update(KAT_BODY).digest("base64")).toBe(KAT_SIGNATURE); // the vector really is HMAC-SHA256/Base64
  });
  it("is over the EXACT bytes: re-serialised JSON (whitespace, key order) or a changed byte does not verify", () => {
    expect(verifyQboWebhookSignature(JSON.stringify(JSON.parse(KAT_BODY), null, 2), KAT_SIGNATURE, KAT_KEY)).toBe(false);
    expect(verifyQboWebhookSignature(KAT_BODY.replace("130", "131"), KAT_SIGNATURE, KAT_KEY)).toBe(false);
    expect(verifyQboWebhookSignature(KAT_BODY + "\n", KAT_SIGNATURE, KAT_KEY)).toBe(false);
  });
  it("is Base64, not hex, and not another algorithm", () => {
    const hex = createHmac("sha256", KAT_KEY).update(KAT_BODY).digest("hex");
    expect(verifyQboWebhookSignature(KAT_BODY, hex, KAT_KEY)).toBe(false);
    expect(verifyQboWebhookSignature(KAT_BODY, createHmac("sha1", KAT_KEY).update(KAT_BODY).digest("base64"), KAT_KEY)).toBe(false);
    expect(verifyQboWebhookSignature(KAT_BODY, createHmac("sha512", KAT_KEY).update(KAT_BODY).digest("base64"), KAT_KEY)).toBe(false);
  });
  it("environment separation: a payload signed with another environment's verifier token never verifies", () => {
    const sandboxToken = "sandbox-verifier-token-0123456789";
    const productionToken = "production-verifier-token-012345";
    const sig = createHmac("sha256", sandboxToken).update(KAT_BODY).digest("base64");
    expect(verifyQboWebhookSignature(KAT_BODY, sig, sandboxToken)).toBe(true);
    expect(verifyQboWebhookSignature(KAT_BODY, sig, productionToken)).toBe(false);
    // One deployment = one environment = one verifier token (the token is configuration, never taken from the request).
    expect(resolveQboWebhookConfig({ QUICKBOOKS_ENVIRONMENT: "sandbox", QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: sandboxToken })).toEqual({ available: true, verifierToken: sandboxToken });
  });
});

describe("CloudEvents 1.0 payload contract", () => {
  const event = (o: Record<string, unknown> = {}) => ({
    specversion: "1.0", id: "evt-1", source: "intuit.qbo", type: "qbo.invoice.updated.v1", datacontenttype: "application/json",
    time: "2026-10-10T12:00:00Z", intuitentityid: "130", intuitaccountid: "9341458068893772", data: { anything: "ignored" }, ...o,
  });
  it("parses the documented array and takes realm = intuitaccountid, entity id = intuitentityid, entity+operation from type", () => {
    const r = parseQboWebhookBody(KAT_BODY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ format: "CLOUDEVENTS", realmId: "9341458068893772", entityId: "130", entityName: "Invoice", operation: "UPDATED", providerEventId: "a1b2", supported: true });
    expect(r.events[0].eventTime?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });
  it("handles a multi-event array and every documented operation word", () => {
    const body = JSON.stringify(["created", "updated", "deleted", "merged", "voided", "emailed"].map((op, i) => event({ id: `e${i}`, type: `qbo.customer.${op}.v1`, intuitentityid: String(i + 1) })));
    const r = parseQboWebhookBody(body);
    expect(r.ok && r.events.map((e) => e.operation)).toEqual(["CREATED", "UPDATED", "DELETED", "MERGED", "VOIDED", "EMAILED"]);
  });
  it("the `data` member is never interpreted (it cannot add events, change the realm or the entity)", () => {
    const r = parseQboWebhookBody(JSON.stringify([event({ data: { intuitaccountid: "1", intuitentityid: "2", type: "qbo.bill.created.v1", eventNotifications: [] } })]));
    expect(r.ok && r.events).toHaveLength(1);
    expect(r.ok && r.events[0]).toMatchObject({ realmId: "9341458068893772", entityId: "130", entityName: "Invoice" });
  });
  it("rejects events that are not CloudEvents 1.0 or lack the documented identity fields", () => {
    for (const bad of [event({ specversion: "0.3" }), event({ specversion: 1 }), event({ type: "invoice.updated" }), event({ type: "evil" }), event({ intuitaccountid: "abc" }), event({ intuitaccountid: undefined }), event({ intuitentityid: undefined }), event({ intuitentityid: "a/b" })]) {
      const r = parseQboWebhookBody(JSON.stringify([bad]));
      expect(r.ok && r.events).toHaveLength(0);
      expect(r.ok && r.rejectedEvents).toBe(1);
    }
  });
  it("environment separation of identity: the same realm id in a different deployment environment is resolved by configuration, not by the payload", () => {
    // The payload carries no environment field and none is read from it.
    expect(JSON.stringify(parseQboWebhookBody(KAT_BODY))).not.toMatch(/sandbox|production/i);
  });
});
