/**
 * QuickBooks Online — inbound webhook verification and payload parsing.
 *
 * Pure module: no DB, no network, no process.env reads. Notifications carry
 * NO entity data that is ever trusted — a webhook is a trigger only; the
 * sync layer always refetches canonical state via CDC/query. This module's
 * only job is: (1) prove the delivery really came from Intuit, and (2) turn
 * either of Intuit's two notification envelopes into a small, uniform list
 * of { dedupKey, realmId, entity, entityId, operation, occurredAt } tuples,
 * silently dropping anything that does not resolve to a known QBO entity or
 * a syntactically valid realm id (never an info-leaking error for those).
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { isValidRealmId } from "./qbo-config";
import { QBO_ENTITY_NAMES, type QboEntityName } from "./qbo-entities";

// ─── Signature verification ─────────────────────────────────────────────────

/**
 * Verifies the Intuit `intuit-signature` header: base64(HMAC-SHA256(key =
 * verifierToken, message = raw request body bytes)). Compares with
 * `timingSafeEqual` on equal-length buffers only — a length mismatch (or a
 * missing header/token) is treated as a verification failure, never thrown.
 *
 * `rawBody` accepts a `Buffer` (the EXACT bytes as received, before any
 * charset re-encoding — the correct input for HMAC verification) or a
 * `string` (re-encoded UTF-8; kept for callers/tests that only have text —
 * ASCII/UTF-8-safe payloads verify identically either way, but a caller with
 * access to the original bytes should always pass the Buffer).
 */
export function verifyQboWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
  verifierToken: string
): boolean {
  if (!signatureHeader || signatureHeader.length === 0) return false;
  if (!verifierToken || verifierToken.length === 0) return false;

  let expected: Buffer;
  let actual: Buffer;
  try {
    const hmac = createHmac("sha256", verifierToken);
    if (Buffer.isBuffer(rawBody)) hmac.update(rawBody);
    else hmac.update(rawBody, "utf8");
    expected = hmac.digest();
    actual = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ─── Notification shape ─────────────────────────────────────────────────────

export interface QboWebhookNotification {
  /** Stable key for at-least-once delivery de-duplication. */
  dedupKey: string;
  realmId: string;
  entity: QboEntityName;
  entityId: string;
  /** Lower-case, past-tense operation label, e.g. "created" | "updated" | "deleted" | "voided" | "merged". */
  operation: string;
  occurredAt: string;
}

export type QboWebhookParseResult =
  | { ok: true; notifications: QboWebhookNotification[] }
  | { ok: false; reason: string };

const ENTITY_NAME_BY_LOWER: ReadonlyMap<string, QboEntityName> = new Map(
  QBO_ENTITY_NAMES.map((name) => [name.toLowerCase(), name])
);

function resolveEntityName(raw: string): QboEntityName | null {
  return ENTITY_NAME_BY_LOWER.get(raw.toLowerCase()) ?? null;
}

const LEGACY_OPERATION_LABEL: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  void: "voided",
  merge: "merged",
};

function normalizeLegacyOperation(raw: string): string {
  const lower = raw.toLowerCase();
  return LEGACY_OPERATION_LABEL[lower] ?? lower;
}

// ─── CloudEvents envelope (JSON array; the required format) ────────────────

const CLOUD_EVENT_TYPE_PATTERN = /^qbo\.([a-z0-9]+)\.([a-z]+)\.v\d+$/i;

const CloudEventItemSchema = z.object({
  specversion: z.string().min(1),
  id: z.string().min(1),
  source: z.string().optional(),
  type: z.string().min(1),
  datacontenttype: z.string().optional(),
  time: z.string().optional(),
  intuitentityid: z.string().min(1),
  intuitaccountid: z.string().min(1),
  data: z.unknown().optional(),
});

const CloudEventArraySchema = z.array(CloudEventItemSchema).min(1);

function parseCloudEvents(items: z.infer<typeof CloudEventArraySchema>): QboWebhookNotification[] {
  const notifications: QboWebhookNotification[] = [];

  for (const item of items) {
    if (!isValidRealmId(item.intuitaccountid)) continue;

    const match = CLOUD_EVENT_TYPE_PATTERN.exec(item.type);
    if (!match) continue;
    const entity = resolveEntityName(match[1]);
    if (!entity) continue;
    const operation = match[2].toLowerCase();

    const occurredAt = item.time && !Number.isNaN(Date.parse(item.time)) ? item.time : new Date().toISOString();

    notifications.push({
      dedupKey: item.id,
      realmId: item.intuitaccountid,
      entity,
      entityId: item.intuitentityid,
      operation,
      occurredAt,
    });
  }

  return notifications;
}

// ─── Legacy envelope (still accepted) ───────────────────────────────────────

const LegacyEntitySchema = z.object({
  name: z.string().min(1),
  id: z.string().min(1),
  operation: z.string().min(1),
  lastUpdated: z.string().optional(),
});

const LegacyEventNotificationSchema = z.object({
  realmId: z.string().min(1),
  dataChangeEvent: z.object({
    entities: z.array(LegacyEntitySchema).min(1),
  }),
});

const LegacyPayloadSchema = z.object({
  eventNotifications: z.array(LegacyEventNotificationSchema).min(1),
});

function parseLegacy(payload: z.infer<typeof LegacyPayloadSchema>): QboWebhookNotification[] {
  const notifications: QboWebhookNotification[] = [];

  for (const notif of payload.eventNotifications) {
    if (!isValidRealmId(notif.realmId)) continue;

    for (const e of notif.dataChangeEvent.entities) {
      const entity = resolveEntityName(e.name);
      if (!entity) continue;
      const operation = normalizeLegacyOperation(e.operation);
      const lastUpdated = e.lastUpdated ?? "";
      const occurredAt = lastUpdated && !Number.isNaN(Date.parse(lastUpdated)) ? lastUpdated : new Date().toISOString();
      const dedupKey = createHash("sha256")
        .update(`${notif.realmId}|${entity}|${e.id}|${operation}|${lastUpdated}`)
        .digest("hex");

      notifications.push({
        dedupKey,
        realmId: notif.realmId,
        entity,
        entityId: e.id,
        operation,
        occurredAt,
      });
    }
  }

  return notifications;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Parses either the CloudEvents array format or the legacy
 * `{ eventNotifications }` format. Unknown entities and invalid realm ids
 * are silently dropped from the result (never leaked as an error — an
 * attacker probing realm ids gets the same 200/shape either way). Only a
 * payload that matches NEITHER envelope's schema is reported malformed.
 */
export function parseQboWebhookPayload(json: unknown): QboWebhookParseResult {
  if (Array.isArray(json)) {
    const parsed = CloudEventArraySchema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, reason: `Malformed QuickBooks webhook payload (CloudEvents format, ${parsed.error.issues.length} validation issue(s)).` };
    }
    return { ok: true, notifications: parseCloudEvents(parsed.data) };
  }

  if (json !== null && typeof json === "object") {
    const parsed = LegacyPayloadSchema.safeParse(json);
    if (parsed.success) {
      return { ok: true, notifications: parseLegacy(parsed.data) };
    }
    return { ok: false, reason: `Malformed QuickBooks webhook payload (legacy format, ${parsed.error.issues.length} validation issue(s)).` };
  }

  return { ok: false, reason: "Malformed QuickBooks webhook payload: expected a JSON array or object" };
}
