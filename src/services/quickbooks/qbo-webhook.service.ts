/**
 * QuickBooks Online — inbound webhook handling.
 *
 * The HTTP boundary this module implements is intentionally thin and fast:
 * verify the signature, parse the envelope, resolve which OpsIQ
 * workspace(s)/connector(s) own the realm, and enqueue durable sync work —
 * no QuickBooks API call is ever made here. Entity data inside the
 * notification itself is never trusted or persisted; it only identifies
 * WHICH connector needs to refetch canonical state.
 *
 * Fails closed: an unconfigured or partially-configured webhook endpoint
 * returns 503 rather than silently accepting unverifiable deliveries. An
 * unrecognized realm is ignored with a plain 200 — never a distinguishing
 * error a prober could use to enumerate connected companies.
 */

import { db } from "@/lib/db";
import { logger } from "@/infra/logger";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { SCHEDULER_SYSTEM_ACTOR } from "@/domain/owner-budget/system-actor";
import { QBO_PROVIDER, resolveQboConfig } from "@/domain/quickbooks/qbo-config";
import { verifyQboWebhookSignature, parseQboWebhookPayload, type QboWebhookNotification } from "@/domain/quickbooks/qbo-webhook";
import { requestQuickBooksSync } from "@/services/quickbooks/qbo-sync.service";

export interface HandleQuickBooksWebhookInput {
  /** Buffer = exact received bytes (preferred — the correct input for signature verification); string is accepted for callers/tests without access to the raw bytes. */
  rawBody: string | Buffer;
  signatureHeader: string | null;
  env?: Record<string, string | undefined>;
}

export interface HandleQuickBooksWebhookResult {
  status: 200 | 400 | 401 | 503;
  dispatched: Array<{ workspaceId: string; connectorId: string; taskId: string }>;
}

export async function handleQuickBooksWebhook(input: HandleQuickBooksWebhookInput): Promise<HandleQuickBooksWebhookResult> {
  const env = input.env ?? process.env;
  const configResult = resolveQboConfig(env);
  if (!configResult.available || !configResult.config.webhookVerifierToken) {
    return { status: 503, dispatched: [] };
  }

  if (!verifyQboWebhookSignature(input.rawBody, input.signatureHeader, configResult.config.webhookVerifierToken)) {
    return { status: 401, dispatched: [] };
  }

  let json: unknown;
  try {
    const bodyText = Buffer.isBuffer(input.rawBody) ? input.rawBody.toString("utf8") : input.rawBody;
    json = JSON.parse(bodyText);
  } catch {
    return { status: 400, dispatched: [] };
  }

  const parsed = parseQboWebhookPayload(json);
  if (!parsed.ok) {
    return { status: 400, dispatched: [] };
  }

  const byRealm = new Map<string, QboWebhookNotification[]>();
  for (const n of parsed.notifications) {
    const list = byRealm.get(n.realmId);
    if (list) list.push(n);
    else byRealm.set(n.realmId, [n]);
  }

  const dispatched: Array<{ workspaceId: string; connectorId: string; taskId: string }> = [];
  const auditedWorkspaces = new Set<string>();

  for (const [realmId, notifications] of byRealm) {
    // Unrecognized realm: silently ignored, no info leak either way.
    const connectors = await db.ownerConnector.findMany({
      where: { provider: QBO_PROVIDER, status: "ACTIVE", externalAccountId: realmId },
      select: { id: true, workspaceId: true },
    });

    for (const connector of connectors) {
      for (const n of notifications) {
        try {
          const result = await requestQuickBooksSync({
            workspaceId: connector.workspaceId,
            actorId: SCHEDULER_SYSTEM_ACTOR,
            trigger: "WEBHOOK",
            dedupKey: n.dedupKey,
          });
          dispatched.push({ workspaceId: connector.workspaceId, connectorId: connector.id, taskId: result.taskId });
        } catch (err) {
          // A single connector's request failing must never abort the rest
          // of the delivery's routing — logged, and the webhook still 200s.
          logger.error("QuickBooks webhook: sync request failed for connector", err, {
            connectorId: connector.id,
            realmId,
            entity: n.entity,
          });
        }
      }

      if (!auditedWorkspaces.has(connector.workspaceId)) {
        auditedWorkspaces.add(connector.workspaceId);
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.QUICKBOOKS_WEBHOOK_RECEIVED,
          workspaceId: connector.workspaceId,
          actorType: "system",
          entityType: "OwnerConnector",
          entityId: connector.id,
          payload: { realmId, notificationCount: notifications.length },
        }).catch((err) => {
          logger.error("QuickBooks webhook: audit emit failed (delivery still processed)", err, { connectorId: connector.id });
        });
      }
    }
  }

  return { status: 200, dispatched };
}
