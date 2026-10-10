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
 *  - The task idempotency key coalesces hints per connection per lease epoch (see below); the sync runs only for an unserved hint.
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
import { markWebhookEventsProcessed, markWebhookHint, readSyncState, recordWebhookEvent, resolveRealmForWebhook, type WebhookHintResolution } from "./qbo-sync-store.service";

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
  input: { rawBody: Uint8Array; signature: string | null; declaredLength: number | null },
  deps: QboWebhookDeps,
): Promise<QboWebhookResult> {
  const now = (deps.now ?? (() => new Date()))();
  const webhookConfig = resolveQboWebhookConfig(deps.env);
  const providerConfig = resolveQboConfig(deps.env);
  if (!webhookConfig.available || !providerConfig.available) return { httpStatus: 503, body: { error: "NOT_CONFIGURED" } };

  if ((input.declaredLength !== null && input.declaredLength > QBO_WEBHOOK_MAX_BODY_BYTES) || input.rawBody.byteLength > QBO_WEBHOOK_MAX_BODY_BYTES) {
    return { httpStatus: 413, body: { error: "PAYLOAD_TOO_LARGE" } };
  }
  // Signature FIRST, over the exact raw body. An unsigned or mis-signed request is rejected before any parsing or lookup.
  if (!verifyQboWebhookSignature(input.rawBody, input.signature, webhookConfig.verifierToken)) {
    return { httpStatus: 401, body: { error: "UNAUTHORIZED" } };
  }
  const parsed = parseQboWebhookBody(new TextDecoder("utf-8").decode(input.rawBody), now);
  if (!parsed.ok) return { httpStatus: 400, body: { error: "BAD_REQUEST" } };

  const environment = providerConfig.config.environment;
  const enqueue = deps.enqueue ?? ((t) => defaultEnqueue(t, now));
  const realmCache = new Map<string, WebhookHintResolution>();
  const hintedConnections = new Map<string, { workspaceId: string; businessId: string; connectionId: string; events: number }>();
  const pendingKeys: string[] = [];
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
    // Events for an unknown realm or a non-ACTIVE connection are COUNTED, not stored: a signed sender must not be able to grow
    // the ledger without bound, and there is nothing to dedupe or serve.
    if (resolution.kind !== "ACTIVE") { ignored++; continue; }
    const ledger = {
      eventKey: ev.eventKey, format: ev.format, realmId: ev.realmId, entityName: ev.entityName, entityId: ev.entityId,
      operation: ev.operation, providerEventTime: ev.eventTime,
    };
    const recorded = await recordWebhookEvent({ ...ledger, disposition: "HINT_RECORDED", resolution }, deps);
    if (recorded === "DUPLICATE") { duplicates++; continue; }
    // NEW, or RETRY_PENDING: an earlier delivery recorded the hint but never finished serving it — finish it now.
    hints++;
    pendingKeys.push(ev.eventKey);
    const prior = hintedConnections.get(resolution.connectionId);
    hintedConnections.set(resolution.connectionId, { workspaceId: resolution.workspaceId, businessId: resolution.businessId, connectionId: resolution.connectionId, events: (prior?.events ?? 0) + 1 });
  }

  for (const c of hintedConnections.values()) {
    await markWebhookHint({ workspaceId: c.workspaceId, businessId: c.businessId, connectionId: c.connectionId }, deps);
    // The task key carries the connection's lease epoch: hints that arrive before a sync starts coalesce into ONE task; once a
    // sync has taken the lease (epoch + 1) a later hint — which that sync may have missed — gets a NEW task instead of being
    // swallowed by an already-completed one. The sync itself runs only while an unserved hint exists (webhook_hint_at).
    const state = await readSyncState({ workspaceId: c.workspaceId, businessId: c.businessId, connectionId: c.connectionId }, deps);
    const created = await enqueue({ workspaceId: c.workspaceId, connectionId: c.connectionId, idempotencyKey: `${TASK_NAME_QBO_READ_SYNC}:webhook:${c.connectionId}:${state?.leaseEpoch ?? 0}` });
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QBO_WEBHOOK_HINT_RECORDED, workspaceId: c.workspaceId, actorType: "system",
      entityType: "qbo_connection", entityId: c.connectionId, visibility: "internal",
      payload: { businessId: c.businessId, events: c.events, syncEnqueued: created },
    });
  }
  // Only after every hint + task exists is the ledger completed; a crash before this line makes the redelivery finish the work.
  await markWebhookEventsProcessed(pendingKeys, deps);
  return { httpStatus: 200, body: { received: true, hints, duplicates, ignored } };
}
