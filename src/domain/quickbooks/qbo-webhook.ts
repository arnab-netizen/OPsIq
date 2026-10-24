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
 * Intuit's published schema for the CloudEvents format and the exact acknowledgement deadline could not be re-verified from the
 * build environment (developer.intuit.com unreachable); the parser therefore reads only the one field it needs and ignores
 * everything else, and the route does no provider calls before answering (DB writes only), keeping it well inside the ~3 second
 * window Intuit documented for the legacy format.
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
