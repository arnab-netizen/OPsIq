/**
 * QuickBooks Online V1 — webhook reaction: request a coalesced, read-only re-sync for the live connection(s) of the notified
 * realm(s). Nothing expensive happens here (the HTTP route must answer quickly): two small writes per connection —
 * a pending marker on the sync state and one idempotent scheduler task keyed by a 10-minute bucket, so a burst of events or
 * Intuit redelivery collapses into a single task. A realm with no live connection in this deployment's environment is
 * ignored without any distinguishable behaviour (no information leak about which companies are connected).
 */
import { db } from "@/lib/db";
import { resolveQboConfig } from "@/domain/quickbooks/qbo-config";
import { enqueueQboSync, qboSyncKey } from "./qbo-sync-scheduling";

export interface WebhookReaction {
  realmsReceived: number;
  connectionsTriggered: number;
}

export async function reactToQboWebhook(
  input: { realmIds: string[] },
  deps: { env: Record<string, string | undefined>; now?: () => Date; client?: typeof db; enqueue?: typeof enqueueQboSync },
): Promise<WebhookReaction> {
  const client = deps.client ?? db;
  const now = (deps.now ?? (() => new Date()))();
  const enqueue = deps.enqueue ?? enqueueQboSync;
  const cfg = resolveQboConfig(deps.env);
  if (!cfg.available || input.realmIds.length === 0) return { realmsReceived: input.realmIds.length, connectionsTriggered: 0 };

  const conns = await client.qboConnection.findMany({
    where: { environment: cfg.config.environment, realmId: { in: input.realmIds }, status: "ACTIVE" },
    select: { id: true, workspaceId: true, businessId: true },
  });
  let triggered = 0;
  for (const c of conns as Array<{ id: string; workspaceId: string; businessId: string }>) {
    await client.qboSyncState.upsert({
      where: { connectionId: c.id },
      create: { connectionId: c.id, workspaceId: c.workspaceId, businessId: c.businessId, lifecycle: "NEVER_SYNCED", webhookPendingAt: now, lastWebhookAt: now },
      update: { lastWebhookAt: now },
    });
    // Arm the pending marker only if not already armed (coalescing): the first event of a burst owns it.
    await client.qboSyncState.updateMany({ where: { connectionId: c.id, webhookPendingAt: null }, data: { webhookPendingAt: now } });
    await enqueue({ workspaceId: c.workspaceId, connectionId: c.id, trigger: "WEBHOOK", key: qboSyncKey(c.id, "wh", now) });
    triggered++;
  }
  return { realmsReceived: input.realmIds.length, connectionsTriggered: triggered };
}
