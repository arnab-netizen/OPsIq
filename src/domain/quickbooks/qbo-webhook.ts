/**
 * QuickBooks Online — webhook notification handling primitives (pure: no DB, no network).
 *
 * A webhook is an EVENT HINT: "something changed for realm R, entity E". It is never financial truth. The receiver
 * verifies the signature over the RAW body, validates the shape, deduplicates, and at most schedules a normal
 * READ-ONLY sync. No webhook body value is ever written to a financial table.
 *
 * Provider contract implemented here (Intuit's current webhook documentation; see docs/opsiq/product/QBO_READ_ONLY_SYNC.md §8,
 * where each point is tied to a test in qbo-webhook-contract.test.ts):
 *  - Payload: CloudEvents 1.0 — a JSON ARRAY of event objects with `specversion` ("1.0"), `id`, `source`, `type`
 *    (`qbo.<entity>.<operation>.v<n>`), `datacontenttype`, `time`, `intuitentityid` (the changed entity's id),
 *    `intuitaccountid` (the QBO company / realm id) and `data`. The legacy `eventNotifications[].dataChangeEvent.entities[]`
 *    shape is still parsed for in-flight deliveries; any other shape is rejected.
 *  - Signature: header `intuit-signature` = Base64( HMAC-SHA256( key = the app's webhook verifier token, message = the EXACT raw
 *    request body ) ). Compared in constant time over the raw bytes, before anything is parsed.
 *  - Environments: Development/Sandbox and Production webhooks are configured separately at Intuit, each with its own verifier
 *    token. A deployment is bound to ONE environment (QUICKBOOKS_ENVIRONMENT) and ONE verifier token; a payload signed with the
 *    other environment's token fails verification, and realms are only resolved within the configured environment.
 *  - Delivery: at-least-once, unordered, expected to be acknowledged quickly with HTTP 200. The design deduplicates, never trusts
 *    event content, and does the actual reading asynchronously through the normal GET-only sync.
 *  - Webhooks can be missed; the scheduled incremental sync is the safety net and the source of truth.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isSafeEntityId, isValidRealmId } from "./qbo-identifiers";

export const QBO_WEBHOOK_SIGNATURE_HEADER = "intuit-signature";
export const QBO_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;
export const QBO_WEBHOOK_MAX_EVENTS = 1000;

export type QboWebhookConfig = { available: true; verifierToken: string } | { available: false };

/** Callers pass the environment record; this module never reads process.env. */
export function resolveQboWebhookConfig(env: Readonly<Record<string, string | undefined>>): QboWebhookConfig {
  const token = env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN?.trim();
  return token && token.length >= 16 && token.length <= 512 ? { available: true, verifierToken: token } : { available: false };
}

/**
 * Constant-time verification of Intuit's signature over the exact raw bytes received. Anything that is not a valid
 * base64 SHA-256 HMAC of the body under the verifier token returns false.
 */
export function verifyQboWebhookSignature(rawBody: string | Uint8Array, signatureHeader: string | null | undefined, verifierToken: string): boolean {
  if (!verifierToken || typeof signatureHeader !== "string" || signatureHeader.length === 0 || signatureHeader.length > 128) return false;
  const expected = createHmac("sha256", verifierToken).update(rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader.trim(), "base64");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export type QboWebhookOperation = "CREATED" | "UPDATED" | "DELETED" | "MERGED" | "VOIDED" | "EMAILED" | "OTHER";

export interface QboWebhookEvent {
  format: "LEGACY" | "CLOUDEVENTS";
  realmId: string;
  /** PascalCase entity name when recognised, otherwise the provider's name (capped) — `supported` says which. */
  entityName: string;
  entityId: string;
  operation: QboWebhookOperation;
  /** Provider-reported time, informational only. */
  eventTime: Date | null;
  /** Provider event id (CloudEvents `id`) when present. */
  providerEventId: string | null;
  /** Deterministic deduplication key. */
  eventKey: string;
  /** True when the entity can change what the read-only sync fetches. */
  supported: boolean;
}

/** Entities whose change can alter a synced record or a synced report. */
const HINT_ENTITIES = [
  "Invoice", "Bill", "Customer", "Payment", "BillPayment", "CreditMemo", "VendorCredit", "SalesReceipt", "RefundReceipt",
  "Deposit", "Purchase", "JournalEntry", "Transfer", "Account", "Vendor", "Estimate", "PurchaseOrder",
] as const;
const HINT_LOOKUP: ReadonlyMap<string, string> = new Map(HINT_ENTITIES.map((e) => [e.toLowerCase(), e]));

function operationOf(v: unknown): QboWebhookOperation {
  if (typeof v !== "string") return "OTHER";
  switch (v.toLowerCase()) {
    case "create": case "created": return "CREATED";
    case "update": case "updated": return "UPDATED";
    case "delete": case "deleted": return "DELETED";
    case "merge": case "merged": return "MERGED";
    case "void": case "voided": return "VOIDED";
    case "emailed": return "EMAILED";
    default: return "OTHER";
  }
}

function instant(v: unknown): Date | null {
  if (typeof v !== "string" || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * An event with neither a provider id nor a provider time cannot be told apart from a later identical change, so it is keyed
 * by the 15-minute window it was RECEIVED in: redeliveries inside the window dedupe, a genuinely later change does not get
 * swallowed forever.
 */
function eventKeyOf(e: Omit<QboWebhookEvent, "eventKey" | "supported">, receivedAt: Date): string {
  const identity = e.providerEventId
    ? `${e.format}|${e.realmId}|id:${e.providerEventId}`
    : `${e.format}|${e.realmId}|${e.entityName}|${e.entityId}|${e.operation}|${e.eventTime?.toISOString() ?? `rx:${Math.floor(receivedAt.getTime() / (15 * 60 * 1000))}`}`;
  return createHash("sha256").update(identity, "utf8").digest("hex");
}

function build(partial: Omit<QboWebhookEvent, "eventKey" | "supported">, receivedAt: Date): QboWebhookEvent {
  return { ...partial, supported: HINT_LOOKUP.has(partial.entityName.toLowerCase()), eventKey: eventKeyOf(partial, receivedAt) };
}

export type QboWebhookParseResult =
  | { ok: true; events: QboWebhookEvent[]; rejectedEvents: number }
  | { ok: false; reason: "NOT_JSON" | "UNRECOGNIZED_SHAPE" | "TOO_MANY_EVENTS" };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse an already signature-verified body. Malformed individual events are counted and dropped, never guessed at. */
export function parseQboWebhookBody(rawBody: string, receivedAt: Date = new Date()): QboWebhookParseResult {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "NOT_JSON" };
  }
  const events: QboWebhookEvent[] = [];
  let rejected = 0;

  if (isObject(json) && Array.isArray(json.eventNotifications)) {
    for (const note of json.eventNotifications) {
      const realm = isObject(note) ? note.realmId : undefined;
      const entities = isObject(note) && isObject(note.dataChangeEvent) && Array.isArray(note.dataChangeEvent.entities) ? note.dataChangeEvent.entities : null;
      if (!isValidRealmId(realm) || !entities) { rejected++; continue; }
      for (const ent of entities) {
        if (events.length + rejected > QBO_WEBHOOK_MAX_EVENTS) return { ok: false, reason: "TOO_MANY_EVENTS" };
        if (!isObject(ent) || typeof ent.name !== "string" || !isSafeEntityId(ent.id)) { rejected++; continue; }
        const name = ent.name.slice(0, 64);
        events.push(build({ format: "LEGACY", realmId: realm, entityName: HINT_LOOKUP.get(name.toLowerCase()) ?? name, entityId: ent.id, operation: operationOf(ent.operation), eventTime: instant(ent.lastUpdated), providerEventId: null }, receivedAt));
      }
    }
    return { ok: true, events, rejectedEvents: rejected };
  }

  const cloud = Array.isArray(json) ? json : isObject(json) && typeof json.specversion === "string" ? [json] : null;
  if (cloud) {
    if (cloud.length > QBO_WEBHOOK_MAX_EVENTS) return { ok: false, reason: "TOO_MANY_EVENTS" };
    for (const ev of cloud) {
      if (!isObject(ev) || ev.specversion !== "1.0" || typeof ev.type !== "string") { rejected++; continue; }
      const m = /^qbo\.([a-z0-9]{1,40})\.([a-z]{1,24})(?:\.v\d+)?$/.exec(ev.type);
      const realm = ev.intuitaccountid;
      if (!m || !isValidRealmId(realm) || !isSafeEntityId(ev.intuitentityid)) { rejected++; continue; }
      const providerEventId = typeof ev.id === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(ev.id) ? ev.id : null;
      events.push(build({ format: "CLOUDEVENTS", realmId: realm, entityName: HINT_LOOKUP.get(m[1]) ?? m[1], entityId: ev.intuitentityid, operation: operationOf(m[2]), eventTime: instant(ev.time), providerEventId }, receivedAt));
    }
    return { ok: true, events, rejectedEvents: rejected };
  }
  return { ok: false, reason: "UNRECOGNIZED_SHAPE" };
}
