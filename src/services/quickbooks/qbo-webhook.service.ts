/**
 * QuickBooks Online — webhook receiver logic (event HINTS only).
 *
 * Order (security-critical): configuration -> body size -> SIGNATURE over the raw bytes -> shape -> per-event realm
 * resolution -> dedup ledger -> hint + coalesced READ-ONLY sync task. Nothing in the body is ever written to a financial
 * table; the only things taken from it are the realm (to find the connection), the entity name/id (recorded in the ledger
 * for dedup) and the fact that "something changed". The actual data is then fetched by the normal GET-only sync.
 *
 *  - A realm is resolved to a connection ONLY through qbo_connections for the CONFIGURED environment, to its single live
 *    connection. An unknown realm is recorded as such and ignored; a realm held by a non-ACTIVE connection is ignored.
 *    The workspace/business never come from the payload.
 *  - Duplicate deliveries (Intuit is at-least-once) are absorbed by the unique event key in the ledger.
 *  - Ordering is irrelevant by construction: every hint collapses into "run a sync", and the sync reads current state.
 *  - The task idempotency key coalesces hints per connection into 15-minute buckets.
 *  - Nothing here logs and no secret is placed in a result.
 */
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { TASK_NAME_QBO_READ_SYNC } from "@/infra/scheduler-handlers";
import { resolveQboConfig } from "@/domain/quickbooks/qbo-config";
import {
  QBO_WEBHOOK_MAX_BODY_BYTES,
  parseQboWebhookBody,
  resolveQboWebhookConfig,
  verifyQboWebhookSignature,
} from "@/domain/quickbooks/qbo-webhook";
import type { QboPersistenceDeps } from "./qbo-connection.service";
import { markWebhookHint, recordWebhookEvent, resolveRealmForWebhook, type WebhookHintResolution } from "./qbo-sync-store.service";

export interface QboWebhookDeps extends QboPersistenceDeps {
  env: Record<string, string | undefined>;
  /** Test seam; default enqueues a durable ScheduledTask. Returns true when this call created the task. */
  enqueue?: (task: { workspaceId: string; connectionId: string; idempotencyKey: string }) => Promise<boolean>;
}

export type QboWebhookResult =
  | { httpStatus: 200; body: { received: true; hints: number; duplicates: number; ignored: number } }
  | { httpStatus: 400 | 401 | 413 | 503; body: { error: "BAD_REQUEST" | "UNAUTHORIZED" | "PAYLOAD_TOO_LARGE" | "NOT_CONFIGURED" } };

async function defaultEnqueue(task: { workspaceId: string; connectionId: string; idempotencyKey: string }, now: Date): Promise<boolean> {
  const r = await new DatabaseSchedulerProvider().scheduleIdempotent({
    taskName: TASK_NAME_QBO_READ_SYNC,
    payload: { connectionId: task.connectionId, trigger: "WEBHOOK" },
    scheduledFor: now,
    maxAttempts: 2,
    workspaceId: task.workspaceId,
    idempotencyKey: task.idempotencyKey,
  });
  return r.created;
}

export async function handleQboWebhook(
  input: { rawBody: string; signature: string | null; declaredLength: number | null },
  deps: QboWebhookDeps,
): Promise<QboWebhookResult> {
  const now = (deps.now ?? (() => new Date()))();
  const webhookConfig = resolveQboWebhookConfig(deps.env);
  const providerConfig = resolveQboConfig(deps.env);
  if (!webhookConfig.available || !providerConfig.available) return { httpStatus: 503, body: { error: "NOT_CONFIGURED" } };

  if ((input.declaredLength !== null && input.declaredLength > QBO_WEBHOOK_MAX_BODY_BYTES) || Buffer.byteLength(input.rawBody, "utf8") > QBO_WEBHOOK_MAX_BODY_BYTES) {
    return { httpStatus: 413, body: { error: "PAYLOAD_TOO_LARGE" } };
  }
  // Signature FIRST, over the exact raw body. An unsigned or mis-signed request is rejected before any parsing or lookup.
  if (!verifyQboWebhookSignature(input.rawBody, input.signature, webhookConfig.verifierToken)) {
    return { httpStatus: 401, body: { error: "UNAUTHORIZED" } };
  }
  const parsed = parseQboWebhookBody(input.rawBody);
  if (!parsed.ok) return { httpStatus: 400, body: { error: "BAD_REQUEST" } };

  const environment = providerConfig.config.environment;
  const enqueue = deps.enqueue ?? ((t) => defaultEnqueue(t, now));
  const realmCache = new Map<string, WebhookHintResolution>();
  const hintedConnections = new Map<string, { workspaceId: string; businessId: string; connectionId: string; events: number }>();
  let hints = 0;
  let duplicates = 0;
  let ignored = parsed.rejectedEvents;

  for (const ev of parsed.events) {
    if (!ev.supported) { ignored++; continue; }
    let resolution = realmCache.get(ev.realmId);
    if (!resolution) {
      resolution = await resolveRealmForWebhook({ environment, realmId: ev.realmId }, deps);
      realmCache.set(ev.realmId, resolution);
    }
    const ledger = {
      eventKey: ev.eventKey, format: ev.format, realmId: ev.realmId, entityName: ev.entityName, entityId: ev.entityId,
      operation: ev.operation, providerEventTime: ev.eventTime,
    };
    if (resolution.kind !== "ACTIVE") {
      const recorded = await recordWebhookEvent({ ...ledger, disposition: resolution.kind === "UNKNOWN_REALM" ? "IGNORED_UNKNOWN_REALM" : "IGNORED_NOT_ACTIVE", resolution: null }, deps);
      if (!recorded) duplicates++;
      else ignored++;
      continue;
    }
    const recorded = await recordWebhookEvent({ ...ledger, disposition: "HINT_RECORDED", resolution }, deps);
    if (!recorded) { duplicates++; continue; }
    hints++;
    const prior = hintedConnections.get(resolution.connectionId);
    hintedConnections.set(resolution.connectionId, { workspaceId: resolution.workspaceId, businessId: resolution.businessId, connectionId: resolution.connectionId, events: (prior?.events ?? 0) + 1 });
  }

  const bucket = Math.floor(now.getTime() / (15 * 60 * 1000));
  for (const c of hintedConnections.values()) {
    await markWebhookHint({ workspaceId: c.workspaceId, businessId: c.businessId, connectionId: c.connectionId }, deps);
    const created = await enqueue({ workspaceId: c.workspaceId, connectionId: c.connectionId, idempotencyKey: `${TASK_NAME_QBO_READ_SYNC}:webhook:${c.connectionId}:${bucket}` });
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QBO_WEBHOOK_HINT_RECORDED, workspaceId: c.workspaceId, actorType: "system",
      entityType: "qbo_connection", entityId: c.connectionId, visibility: "internal",
      payload: { businessId: c.businessId, events: c.events, syncEnqueued: created },
    });
  }
  return { httpStatus: 200, body: { received: true, hints, duplicates, ignored } };
}
