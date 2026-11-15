/**
 * QuickBooks Online V1 — inbound webhook contract (pure).
 *
 * Webhooks are TRIGGERS ONLY. A notification says "something changed for realm X"; OpsIQ never reads financial values from it.
 * The reaction is to request an (idempotent, coalesced) re-read of that company's reports, so a duplicate, replayed,
 * reordered or forged-but-unsigned delivery can at worst cause one extra read-only sync.
 *
 * Authentication: Intuit signs the exact request body with HMAC-SHA256 keyed by the app's webhook verifier token and sends the
 * base64 digest in the `intuit-signature` header. The token is a server-side secret (QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN) and
 * the comparison is constant-time. An unset token fails closed.
 *
 * Payload formats accepted (realm extraction only):
 *   legacy   { "eventNotifications": [ { "realmId": "123", "dataChangeEvent": { "entities": [ ... ] } } ] }
 *   CloudEvents  one event object or an array of them, each carrying the company id as `intuitaccountid`
 *                (also tolerated: `realmId`), e.g. { "specversion": "1.0", "id": "...", "type": "qbo.invoice.created.v1", ... }
 * Contract points (Intuit's developer guidance on webhooks, as published): the signature is the base64 HMAC-SHA256 of the raw
 * payload keyed by the verifier token; the endpoint must answer HTTP 200 within 3 seconds and do any real work asynchronously;
 * delivery can be duplicated, retried and out of order, and one notification can name several companies; missed events are healed
 * by reconciliation. Here that means: signature first, realm ids only, two small DB writes per connection, no provider call before
 * answering, and the scheduled report re-reads (daily for the 3 newest closed months, a full 12-month reconcile every 7 days) as
 * the reconciliation for anything a collapsed, dropped or reordered event could have missed. The exact current CloudEvents field
 * list could not be re-fetched from the build environment (Intuit hosts are not reachable), so the parser reads only the one
 * field it needs and ignores everything else.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { isValidRealmId } from "./qbo-identifiers";

export const QBO_WEBHOOK_VERIFIER_ENV_KEY = "QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN";
export const QBO_WEBHOOK_SIGNATURE_HEADER = "intuit-signature";
export const QBO_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;
export const QBO_WEBHOOK_MAX_REALMS = 50;

export function computeIntuitSignature(rawBody: string, verifierToken: string): string {
  return createHmac("sha256", verifierToken).update(rawBody, "utf8").digest("base64");
}

export function verifyIntuitSignature(input: { rawBody: string; signature: string | null; verifierToken: string | undefined }): boolean {
  const token = input.verifierToken?.trim();
  if (!token || !input.signature) return false;
  const expected = Buffer.from(computeIntuitSignature(input.rawBody, token), "utf8");
  const given = Buffer.from(input.signature.trim(), "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type WebhookParse = { ok: true; realmIds: string[]; eventCount: number } | { ok: false };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseQboWebhookPayload(body: unknown): WebhookParse {
  const realms = new Set<string>();
  let events = 0;
  const take = (v: unknown) => {
    const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
    if (isValidRealmId(s) && realms.size < QBO_WEBHOOK_MAX_REALMS) realms.add(s);
  };

  if (isObj(body) && Array.isArray(body.eventNotifications)) {
    for (const n of body.eventNotifications) {
      if (!isObj(n)) continue;
      events++;
      take(n.realmId);
    }
    return events > 0 ? { ok: true, realmIds: [...realms], eventCount: events } : { ok: false };
  }

  const list = Array.isArray(body) ? body : isObj(body) ? [body] : [];
  for (const e of list) {
    if (!isObj(e)) continue;
    if (e.specversion === undefined && e.intuitaccountid === undefined && e.realmId === undefined) continue;
    events++;
    take(e.intuitaccountid ?? e.realmId);
  }
  return events > 0 ? { ok: true, realmIds: [...realms], eventCount: events } : { ok: false };
}
