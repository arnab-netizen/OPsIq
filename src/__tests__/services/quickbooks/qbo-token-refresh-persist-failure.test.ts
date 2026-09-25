/**
 * F11 — qbo-token.service.ts performRefresh: the post-exchange persist
 * transaction must not be allowed to fail silently. If Intuit rotates the
 * refresh token (refreshQboTokens succeeds) but the DB transaction that
 * would persist the rotated token throws, the OLD refresh token is already
 * dead at Intuit and the NEW one was never saved — the connector must fail
 * closed (REFRESH_FAILED, audited) rather than stay ACTIVE with a lease that
 * merely self-expires after 30s.
 *
 * Fully mocked (no real DB): isolates performRefresh's catch path from the
 * DB-gated concurrency/rotation tests in qbo-token.service.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, emitAuditEvent } = vi.hoisted(() => ({
  dbMock: {
    ownerConnector: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    ownerConnectorToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  emitAuditEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock, getDbInstance: vi.fn().mockResolvedValue(dbMock) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...args: unknown[]) => emitAuditEvent(...args) }));

import { encryptOAuthToken } from "@/services/external-systems/oauth-token.service";
import { createQboTokenProvider } from "@/services/quickbooks/qbo-token.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const workspaceId = "11111111-1111-1111-1111-111111111111";
const connectorId = "22222222-2222-2222-2222-222222222222";
const actorId = "33333333-3333-3333-3333-333333333333";

const testEnv: Record<string, string | undefined> = {
  QUICKBOOKS_CLIENT_ID: "test-client-id",
  QUICKBOOKS_CLIENT_SECRET: "test-client-secret",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  OAUTH_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
};

function tokenRefreshFetch() {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        access_token: "new-access-token",
        refresh_token: "rotated-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
      }),
      { status: 200 },
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F11: performRefresh persist-failure fails closed", () => {
  it("releases the lease, transitions the connector to REFRESH_FAILED, audits it, and rethrows — instead of leaving the lease to self-expire", async () => {
    const now = new Date();
    const encrypted = encryptOAuthToken(
      { accessToken: "old-access-token", refreshToken: "old-refresh-token", tokenType: "bearer" },
      workspaceId,
    );

    dbMock.ownerConnector.findFirst.mockResolvedValue({
      id: connectorId,
      workspaceId,
      provider: "QUICKBOOKS",
      status: "ACTIVE",
      externalAccountId: "9999999999",
      environment: "sandbox",
      tokenExpiresAt: new Date(now.getTime() - 1000), // already expired -> forces refresh
      businessId: null,
    });
    dbMock.ownerConnectorToken.findUnique.mockResolvedValue({
      connectorId,
      encryptedAccessToken: encrypted.accessToken,
      encryptedRefreshToken: encrypted.refreshToken,
      tokenType: "bearer",
      refreshTokenExpiresAt: new Date(now.getTime() + 1_000_000), // not expired
      version: 0,
      refreshLockedUntil: null,
    });
    // Lease CAS acquire: winner.
    dbMock.ownerConnectorToken.updateMany.mockResolvedValue({ count: 1 });
    // The persist transaction itself fails (simulated DB outage / constraint failure).
    const persistError = new Error("simulated DB failure persisting rotated token");
    dbMock.$transaction.mockRejectedValue(persistError);
    // transitionToRefreshFailed's CAS update: succeeds (one row transitioned).
    dbMock.ownerConnector.updateMany.mockResolvedValue({ count: 1 });

    const provider = createQboTokenProvider({
      workspaceId,
      connectorId,
      actorId,
      env: testEnv,
      fetchImpl: tokenRefreshFetch() as unknown as typeof fetch,
    });

    await expect(provider.getCredentials()).rejects.toBe(persistError);

    // The failing $transaction was actually attempted (proves refreshQboTokens succeeded first).
    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);

    // Lease released: a releaseLease-shaped call (connectorId-only where, refreshLockedUntil: null)
    // happened AFTER the failed transaction — not left to self-expire after 30s.
    const releaseCalls = dbMock.ownerConnectorToken.updateMany.mock.calls.filter(
      ([args]) => args?.data?.refreshLockedUntil === null && !("version" in (args?.where ?? {})),
    );
    expect(releaseCalls.length).toBeGreaterThanOrEqual(1);

    // Connector transitioned to REFRESH_FAILED via the CAS updateMany (status: { not: "REFRESH_FAILED" }).
    expect(dbMock.ownerConnector.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: connectorId, workspaceId, status: { not: "REFRESH_FAILED" } }),
        data: expect.objectContaining({ status: "REFRESH_FAILED" }),
      }),
    );

    // Audited as a refresh failure — and the audit payload/message never contains any token material.
    expect(emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: AUDIT_EVENTS.QUICKBOOKS_TOKEN_REFRESH_FAILED, workspaceId, entityId: connectorId }),
    );
    const auditCallArgs = JSON.stringify(emitAuditEvent.mock.calls);
    expect(auditCallArgs).not.toMatch(/old-refresh-token|rotated-refresh-token|old-access-token|new-access-token/);
  });
});
