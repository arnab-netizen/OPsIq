/**
 * QuickBooks Online V1 — platform-operator health (aggregate, read-only, no tenant identifiers, no payloads).
 *
 * Surfaced inside the EXISTING admin overview (GET /api/admin/overview); no new admin subsystem. Counts only: connection states,
 * how many active connections are stale / failing / never synced, and the distribution of the last bounded failure codes — enough
 * to see "QuickBooks sync is unhealthy" without ever exposing a company, token, realm or report value.
 */
import { db } from "@/lib/db";
import { QBO_STALE_AFTER_HOURS } from "@/domain/quickbooks/qbo-report-model";

export interface QboAdminHealth {
  connections: { active: number; reauthRequired: number; disconnected: number; error: number };
  activeHealth: { neverSynced: number; baselining: number; failing: number; stale: number };
  lastFailureCodes: Record<string, number>;
  staleAfterHours: number;
}

export async function getQboAdminHealth(now: Date = new Date(), client: typeof db = db): Promise<QboAdminHealth> {
  const staleBefore = new Date(now.getTime() - QBO_STALE_AFTER_HOURS * 3_600_000);
  const [byStatus, neverSynced, baselining, failing, stale, codes] = await Promise.all([
    client.qboConnection.groupBy({ by: ["status"], _count: { _all: true } }),
    client.qboConnection.count({ where: { status: "ACTIVE", OR: [{ syncState: null }, { syncState: { lastSuccessAt: null } }] } }),
    client.qboSyncState.count({ where: { lifecycle: "BASELINING", connection: { status: "ACTIVE" } } }),
    client.qboSyncState.count({ where: { consecutiveFailures: { gt: 0 }, connection: { status: "ACTIVE" } } }),
    client.qboSyncState.count({ where: { lastSuccessAt: { lt: staleBefore }, connection: { status: "ACTIVE" } } }),
    client.qboSyncState.groupBy({ by: ["lastErrorCode"], where: { lastErrorCode: { not: null }, connection: { status: "ACTIVE" } }, _count: { _all: true } }),
  ]);
  const n = (s: string) => (byStatus as Array<{ status: string; _count: { _all: number } }>).find((r) => r.status === s)?._count._all ?? 0;
  return {
    connections: { active: n("ACTIVE"), reauthRequired: n("REAUTH_REQUIRED"), disconnected: n("DISCONNECTED"), error: n("ERROR") },
    activeHealth: { neverSynced, baselining, failing, stale },
    lastFailureCodes: Object.fromEntries((codes as Array<{ lastErrorCode: string | null; _count: { _all: number } }>).map((c) => [c.lastErrorCode as string, c._count._all])),
    staleAfterHours: QBO_STALE_AFTER_HOURS,
  };
}
