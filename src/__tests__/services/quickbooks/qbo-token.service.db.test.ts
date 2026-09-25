/**
 * DB-backed tests for qbo-token.service.ts.
 *
 * `[db]`-gated — run with:
 *   TEST_WITH_DB=true DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   OAUTH_TOKEN_ENCRYPTION_KEY=<64 hex chars> \
 *   npx vitest run src/__tests__/services/quickbooks/qbo-token.service.db.test.ts
 *
 * Never run against the Neon DATABASE_URL — local disposable DB only.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createQboTokenProvider, storeQboTokens } from "@/services/quickbooks/qbo-token.service";
import type { QboTokenResult } from "@/services/quickbooks/qbo-oauth.service";
import { QBO_PROVIDER } from "@/domain/quickbooks/qbo-config";

const actorId = randomUUID();

/** Fake-but-valid QBO app config so resolveQboConfig() succeeds without touching real env. */
const testEnv: Record<string, string | undefined> = {
  QUICKBOOKS_CLIENT_ID: "test-client-id",
  QUICKBOOKS_CLIENT_SECRET: "test-client-secret",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  OAUTH_TOKEN_ENCRYPTION_KEY: process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
};

function tokens(overrides: Partial<QboTokenResult> = {}): QboTokenResult {
  return {
    accessToken: `access-${randomUUID()}`,
    refreshToken: `refresh-${randomUUID()}`,
    tokenType: "bearer",
    expiresInSeconds: 3600,
    refreshTokenExpiresInSeconds: 8726400,
    refreshTokenHardExpiresInSeconds: null,
    ...overrides,
  };
}

async function seedConnector(opts: { businessId?: string; status?: string; tokenExpiresAt?: Date } = {}) {
  const workspaceId = randomUUID();
  const connector = await db.ownerConnector.create({
    data: {
      workspaceId,
      provider: QBO_PROVIDER,
      status: opts.status ?? "ACTIVE",
      registeredBy: actorId,
      externalAccountId: "9999999999",
      environment: "sandbox",
      businessId: opts.businessId ?? null,
      tokenExpiresAt: opts.tokenExpiresAt ?? null,
    },
  });
  return { workspaceId, connectorId: connector.id };
}

async function seedToken(workspaceId: string, connectorId: string, tokenResult: QboTokenResult, now: Date) {
  return storeQboTokens({ workspaceId, connectorId, tokens: tokenResult, now });
}

async function teardownConnector(connectorId: string) {
  await db.ownerConnectorToken.deleteMany({ where: { connectorId } });
  await db.auditEvent.deleteMany({ where: { entityId: connectorId } });
  await db.ownerConnector.delete({ where: { id: connectorId } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] qbo-token.service", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `qbo-token-test-${actorId}@example.com`, name: "QBO Token Test", isActive: true, updatedAt: new Date() },
    });
  });

  it("storeQboTokens persists an encrypted, decryptable token pair and bumps version on update", async () => {
    const { workspaceId, connectorId } = await seedConnector();
    const now = new Date();

    const first = await seedToken(workspaceId, connectorId, tokens({ accessToken: "access-v0" }), now);
    expect(first.version).toBe(0);

    const second = await seedToken(workspaceId, connectorId, tokens({ accessToken: "access-v1" }), now);
    expect(second.version).toBe(1);

    const provider = createQboTokenProvider({ workspaceId, connectorId, env: testEnv, now: () => new Date(now.getTime() + 1000) });
    const creds = await provider.getCredentials();
    expect(creds.accessToken).toBe("access-v1");
    expect(creds.realmId).toBe("9999999999");
    expect(creds.environment).toBe("sandbox");

    await teardownConnector(connectorId);
  });

  it("getCredentials returns the stored access token without refreshing when it is still fresh", async () => {
    const now = new Date();
    const { workspaceId, connectorId } = await seedConnector();
    await seedToken(workspaceId, connectorId, tokens({ accessToken: "fresh-access" }), now);

    const fetchImpl = vi.fn();
    const provider = createQboTokenProvider({
      workspaceId,
      connectorId,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date(now.getTime() + 5_000), // access token still has ~3595s left, well beyond the skew
    });

    const creds = await provider.getCredentials();
    expect(creds.accessToken).toBe("fresh-access");
    expect(fetchImpl).not.toHaveBeenCalled();

    await teardownConnector(connectorId);
  });

  it("concurrent getCredentials calls on an expiring token refresh exactly once and all callers get the same new token", async () => {
    const now = new Date();
    const { workspaceId, connectorId } = await seedConnector();
    // Access token expires in 60s (inside the 300s skew) so every concurrent call must refresh.
    await seedToken(workspaceId, connectorId, tokens({ accessToken: "about-to-expire" }), new Date(now.getTime() - 3540_000));

    let fetchCalls = 0;
    const fetchImpl = vi.fn(async () => {
      fetchCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(
        JSON.stringify({
          access_token: "rotated-access-token",
          refresh_token: "rotated-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          x_refresh_token_expires_in: 8726400,
        }),
        { status: 200 },
      );
    });

    const makeProvider = () =>
      createQboTokenProvider({
        workspaceId,
        connectorId,
        env: testEnv,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => new Date(),
      });

    const results = await Promise.all(Array.from({ length: 5 }, () => makeProvider().getCredentials()));

    expect(fetchCalls).toBe(1);
    for (const r of results) {
      expect(r.accessToken).toBe("rotated-access-token");
    }

    const stored = await db.ownerConnectorToken.findUnique({ where: { connectorId } });
    expect(stored?.version).toBe(1);
    expect(stored?.refreshLockedUntil).toBeNull();

    await teardownConnector(connectorId);
  }, 20_000);

  it("persists a rotated refresh token, decryptable on the next refresh", async () => {
    const now = new Date();
    const { workspaceId, connectorId } = await seedConnector();
    await seedToken(workspaceId, connectorId, tokens({ accessToken: "old-access", refreshToken: "refresh-gen-0" }), new Date(now.getTime() - 3540_000));

    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      expect(body.get("refresh_token")).toBe("refresh-gen-0"); // proves the OLD refresh token was used
      return new Response(
        JSON.stringify({
          access_token: "access-gen-1",
          refresh_token: "refresh-gen-1",
          token_type: "bearer",
          expires_in: 3600,
          x_refresh_token_expires_in: 8726400,
        }),
        { status: 200 },
      );
    });

    const provider = createQboTokenProvider({ workspaceId, connectorId, env: testEnv, fetchImpl: fetchImpl as unknown as typeof fetch });
    const creds = await provider.getCredentials();
    expect(creds.accessToken).toBe("access-gen-1");

    // A second refresh must use the ROTATED (gen-1) refresh token, proving gen-1 was persisted & is decryptable.
    const fetchImpl2 = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(init.body as string);
      expect(body.get("refresh_token")).toBe("refresh-gen-1");
      return new Response(
        JSON.stringify({
          access_token: "access-gen-2",
          refresh_token: "refresh-gen-2",
          token_type: "bearer",
          expires_in: 3600,
          x_refresh_token_expires_in: 8726400,
        }),
        { status: 200 },
      );
    });
    const provider2 = createQboTokenProvider({
      workspaceId,
      connectorId,
      env: testEnv,
      fetchImpl: fetchImpl2 as unknown as typeof fetch,
      now: () => new Date(now.getTime() + 60_000),
    });
    const creds2 = await provider2.forceRefresh("access-gen-1");
    expect(creds2.accessToken).toBe("access-gen-2");

    await teardownConnector(connectorId);
  });

  it("invalid_grant on refresh transitions the connector to REFRESH_FAILED and throws AUTH", async () => {
    const now = new Date();
    const { workspaceId, connectorId } = await seedConnector();
    await seedToken(workspaceId, connectorId, tokens(), new Date(now.getTime() - 3540_000));

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const provider = createQboTokenProvider({ workspaceId, connectorId, env: testEnv, fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(provider.getCredentials()).rejects.toMatchObject({ kind: "AUTH" });

    const connector = await db.ownerConnector.findUnique({ where: { id: connectorId } });
    expect(connector?.status).toBe("REFRESH_FAILED");
    expect(connector?.syncFailureMessage).toMatch(/reconnect/i);

    const auditRow = await db.auditEvent.findFirst({
      where: { entityId: connectorId, eventName: "quickbooks.token_refresh_failed" },
    });
    expect(auditRow).not.toBeNull();
    expect(JSON.stringify(auditRow?.payload ?? {})).not.toMatch(/refresh-|access-/);

    await teardownConnector(connectorId);
  });

  it("forceRefresh is a no-op (returns the current token) when it no longer matches the rejected token", async () => {
    const now = new Date();
    const { workspaceId, connectorId } = await seedConnector();
    await seedToken(workspaceId, connectorId, tokens({ accessToken: "current-access" }), now);

    const fetchImpl = vi.fn();
    const provider = createQboTokenProvider({ workspaceId, connectorId, env: testEnv, fetchImpl: fetchImpl as unknown as typeof fetch });
    const creds = await provider.forceRefresh("some-other-stale-access-token");

    expect(creds.accessToken).toBe("current-access");
    expect(fetchImpl).not.toHaveBeenCalled();

    await teardownConnector(connectorId);
  });
});
