/**
 * QuickBooks Online V1 — owner-initiated lifecycle: disconnect (with revocation at Intuit) and the "refresh now" request.
 *
 * Disconnect order (documented trade-off): revoke the grant at Intuit FIRST (bounded, best-effort), then disconnect locally
 * regardless of the revocation outcome. Local disconnect (a) makes the connection ineligible for the scheduler and webhooks
 * immediately, (b) deletes the stored token ciphertext, and (c) KEEPS the connection row, sync state, observations and
 * provenance — history stays tied to the realm that produced it. If revocation fails, the owner is told so (and where to
 * finish it in QuickBooks); it is audited as qbo.revocation_failed. A failed revoke followed by a failed local write leaves an
 * ACTIVE connection with a dead token, which the next sync turns into REAUTH_REQUIRED — it cannot persist silently.
 *
 * Reconnecting the SAME company reuses the connection row (finalizeQboConnection), so provenance and history continue; a
 * DIFFERENT company needs this disconnect first (BUSINESS_BOUND_TO_OTHER_REALM), gets a new connection row, and never
 * rewrites evidence another company produced (REALM_MISMATCH in materialization).
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { resolveQboConfig } from "@/domain/quickbooks/qbo-config";
import { isQboProviderError } from "@/domain/quickbooks/qbo-errors";
import { disconnectQboConnection, loadQboTokensForUse } from "./qbo-connection.service";
import { revokeQboToken } from "./qbo-oauth.service";
import type { QboFetch } from "./qbo-http";

export type RevocationOutcome = "REVOKED" | "ALREADY_INVALID" | "FAILED" | "SKIPPED";

export interface DisconnectResult {
  changed: boolean;
  revocation: RevocationOutcome;
}

export async function disconnectQuickBooks(
  input: { workspaceId: string; businessId: string; actorId: string },
  deps: { env: Record<string, string | undefined>; fetchImpl?: QboFetch; now?: () => Date; client?: typeof db },
): Promise<DisconnectResult> {
  const client = deps.client ?? db;
  const conn = await client.qboConnection.findFirst({
    where: { workspaceId: input.workspaceId, businessId: input.businessId, status: { not: "DISCONNECTED" } },
    select: { id: true, environment: true },
  });
  if (!conn) {
    const any = await client.qboConnection.findFirst({ where: { workspaceId: input.workspaceId, businessId: input.businessId }, select: { id: true } });
    if (!any) throw new NotFoundError("QboConnection", input.businessId);
    return { changed: false, revocation: "SKIPPED" };
  }

  let revocation: RevocationOutcome = "SKIPPED";
  const cfg = resolveQboConfig(deps.env);
  if (cfg.available && cfg.config.environment === conn.environment) {
    try {
      const tokens = await loadQboTokensForUse({ workspaceId: input.workspaceId, connectionId: conn.id }, { client, now: deps.now });
      if (tokens.ok) {
        try {
          await revokeQboToken(cfg.config, tokens.tokens.refreshToken, { fetchImpl: deps.fetchImpl, timeoutMs: 10_000 });
          revocation = "REVOKED";
        } catch (e) {
          // Intuit answers a token it no longer recognises (already revoked/expired) with a 400 (invalid_grant): already unusable = fine.
          revocation = isQboProviderError(e) && (e.kind === "REFRESH_INVALID" || e.kind === "AUTHORIZATION_INVALID") ? "ALREADY_INVALID" : "FAILED";
        }
      }
    } catch {
      revocation = "FAILED";
    }
  }

  const { changed } = await disconnectQboConnection({ workspaceId: input.workspaceId, actorId: input.actorId, connectionId: conn.id }, { client, now: deps.now });
  await client.qboSyncState.updateMany({ where: { connectionId: conn.id, workspaceId: input.workspaceId }, data: { webhookPendingAt: null } });
  if (revocation === "FAILED") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.QBO_REVOCATION_FAILED, workspaceId: input.workspaceId, actorId: input.actorId, entityType: "qbo_connection",
      entityId: conn.id, visibility: "internal", payload: { businessId: input.businessId },
    }, client);
  }
  return { changed, revocation };
}
