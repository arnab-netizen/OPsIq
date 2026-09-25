/**
 * DB-backed tests for qbo-connection.service.ts.
 *
 * `[db]`-gated — run with:
 *   TEST_WITH_DB=true DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   OAUTH_TOKEN_ENCRYPTION_KEY=<64 hex chars> \
 *   npx vitest run src/__tests__/services/quickbooks/qbo-connection.service.db.test.ts
 *
 * Never run against the Neon DATABASE_URL — local disposable DB only.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  startQuickBooksConnect,
  completeQuickBooksConnect,
  disconnectQuickBooks,
  getQuickBooksStatus,
} from "@/services/quickbooks/qbo-connection.service";
import { QBO_PROVIDER } from "@/domain/quickbooks/qbo-config";
import { ValidationError, UnauthorizedError } from "@/infra/errors";

const actorId = randomUUID();
const otherActorId = randomUUID();

const testEnv: Record<string, string | undefined> = {
  QUICKBOOKS_CLIENT_ID: "test-client-id",
  QUICKBOOKS_CLIENT_SECRET: "test-client-secret",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  OAUTH_TOKEN_ENCRYPTION_KEY: process.env.OAUTH_TOKEN_ENCRYPTION_KEY,
};

function tokenFetch(realm = "1234567890") {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        access_token: `access-${realm}`,
        refresh_token: `refresh-${realm}`,
        token_type: "bearer",
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
      }),
      { status: 200 },
    ),
  );
}

async function seedBusiness(workspaceId: string): Promise<string> {
  const id = randomUUID();
  await db.ownerBusiness.create({
    data: {
      id,
      workspaceId,
      name: "QBO Connection Test Business",
      businessType: "generic_local_service",
      currency: "INR",
      b2cSupported: true,
      b2bSupported: false,
      isActive: true,
      createdBy: actorId,
    },
  });
  return id;
}

async function teardown(workspaceId: string, businessId?: string) {
  const connector = await db.ownerConnector.findFirst({ where: { workspaceId, provider: QBO_PROVIDER } });
  if (connector) {
    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnectorToken.deleteMany({ where: { connectorId: connector.id } });
    await db.auditEvent.deleteMany({ where: { entityId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }
  if (businessId) {
    await db.ownerBusiness.delete({ where: { id: businessId } }).catch(() => undefined);
  }
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] qbo-connection.service", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `qbo-conn-test-${actorId}@example.com`, name: "QBO Connection Test", isActive: true, updatedAt: new Date() },
    });
    await db.user.upsert({
      where: { id: otherActorId },
      update: {},
      create: { id: otherActorId, email: `qbo-conn-test-other-${otherActorId}@example.com`, name: "QBO Connection Test Other", isActive: true, updatedAt: new Date() },
    });
  });

  it("startQuickBooksConnect rejects a business from another workspace", async () => {
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const businessId = await seedBusiness(otherWorkspaceId);

    await expect(
      startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv }),
    ).rejects.toMatchObject({ name: "ValidationError" });

    await db.ownerBusiness.delete({ where: { id: businessId } });
  });

  it("completeQuickBooksConnect consumes the state via CAS: a replay of the same state is rejected and the connector is unchanged", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;

    const fetchImpl = tokenFetch("1111111111");
    const first = await completeQuickBooksConnect({
      workspaceId,
      actorId,
      code: "auth-code",
      state,
      realmId: "1111111111",
      env: testEnv,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.connectorId).toBe(started.connectorId);

    const beforeReplay = await db.ownerConnector.findUnique({ where: { id: started.connectorId } });

    await expect(
      completeQuickBooksConnect({
        workspaceId,
        actorId,
        code: "auth-code-2",
        state,
        realmId: "1111111111",
        env: testEnv,
        fetchImpl: tokenFetch() as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const afterReplay = await db.ownerConnector.findUnique({ where: { id: started.connectorId } });
    expect(afterReplay?.externalAccountId).toBe(beforeReplay?.externalAccountId);
    expect(afterReplay?.status).toBe(beforeReplay?.status);
    expect(afterReplay?.updatedAt.getTime()).toBe(beforeReplay?.updatedAt.getTime());

    await teardown(workspaceId, businessId);
  });

  it("a state minted for workspace A is rejected when presented against workspace B", async () => {
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const businessA = await seedBusiness(workspaceA);
    const businessB = await seedBusiness(workspaceB);

    const started = await startQuickBooksConnect({ workspaceId: workspaceA, actorId, businessId: businessA, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;

    // Workspace B must itself have a QUICKBOOKS connector row for provider match to even be
    // reachable; without one there is nothing to CAS against, which is itself correct rejection.
    await expect(
      completeQuickBooksConnect({
        workspaceId: workspaceB,
        actorId,
        code: "auth-code",
        state,
        realmId: "2222222222",
        env: testEnv,
        fetchImpl: tokenFetch() as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const connectorA = await db.ownerConnector.findFirst({ where: { workspaceId: workspaceA, provider: QBO_PROVIDER } });
    expect(connectorA?.status).toBe("PENDING_AUTH");
    expect(connectorA?.oauthStateHash).not.toBeNull();

    await teardown(workspaceA, businessA);
    await db.ownerBusiness.delete({ where: { id: businessB } });
  });

  it("a state minted for one actor is rejected when presented by a different actor", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;

    await expect(
      completeQuickBooksConnect({
        workspaceId,
        actorId: otherActorId,
        code: "auth-code",
        state,
        realmId: "3333333333",
        env: testEnv,
        fetchImpl: tokenFetch() as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    const connector = await db.ownerConnector.findUnique({ where: { id: started.connectorId } });
    expect(connector?.status).toBe("PENDING_AUTH");

    await teardown(workspaceId, businessId);
  });

  it("an expired state is rejected", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;

    // Force the stored state to look expired.
    await db.ownerConnector.update({
      where: { id: started.connectorId },
      data: { oauthStateExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      completeQuickBooksConnect({
        workspaceId,
        actorId,
        code: "auth-code",
        state,
        realmId: "4444444444",
        env: testEnv,
        fetchImpl: tokenFetch() as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await teardown(workspaceId, businessId);
  });

  it("disconnectQuickBooks deletes the token row and is idempotent", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    await completeQuickBooksConnect({
      workspaceId,
      actorId,
      code: "auth-code",
      state,
      realmId: "5555555555",
      env: testEnv,
      fetchImpl: tokenFetch("5555555555") as unknown as typeof fetch,
    });

    const tokenBefore = await db.ownerConnectorToken.findUnique({ where: { connectorId: started.connectorId } });
    expect(tokenBefore).not.toBeNull();

    const revokeFetch = vi.fn(async () => new Response(null, { status: 200 }));
    const first = await disconnectQuickBooks({ workspaceId, actorId, env: testEnv, fetchImpl: revokeFetch as unknown as typeof fetch });
    expect(first.alreadyDisconnected).toBe(false);

    const tokenAfter = await db.ownerConnectorToken.findUnique({ where: { connectorId: started.connectorId } });
    expect(tokenAfter).toBeNull();
    const connectorAfter = await db.ownerConnector.findUnique({ where: { id: started.connectorId } });
    expect(connectorAfter?.status).toBe("DISCONNECTED");

    // Post-disconnect DTO: allowedActions.disconnect false, .reconnect true, .sync false.
    const statusAfterDisconnect = await getQuickBooksStatus({ workspaceId, env: testEnv });
    expect(statusAfterDisconnect.connector?.status).toBe("DISCONNECTED");
    expect(statusAfterDisconnect.connector?.allowedActions).toEqual({ sync: false, disconnect: false, reconnect: true });
    expect(statusAfterDisconnect.connector?.needsReconnect).toBe(true);

    const second = await disconnectQuickBooks({ workspaceId, actorId, env: testEnv, fetchImpl: revokeFetch as unknown as typeof fetch });
    expect(second.alreadyDisconnected).toBe(true);

    await teardown(workspaceId, businessId);
  });

  it("validates malformed input before touching the database", async () => {
    await expect(
      startQuickBooksConnect({ workspaceId: "not-a-uuid", actorId, businessId: randomUUID(), env: testEnv }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("getQuickBooksStatus.allowedActions: ACTIVE allows sync+disconnect, forbids reconnect", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    await completeQuickBooksConnect({
      workspaceId,
      actorId,
      code: "auth-code",
      state,
      realmId: "6666666666",
      env: testEnv,
      fetchImpl: tokenFetch("6666666666") as unknown as typeof fetch,
    });

    const status = await getQuickBooksStatus({ workspaceId, env: testEnv });
    expect(status.connector?.status).toBe("ACTIVE");
    expect(status.connector?.allowedActions).toEqual({ sync: true, disconnect: true, reconnect: false });
    expect(status.connector?.needsReconnect).toBe(false);

    await teardown(workspaceId, businessId);
  });

  it("getQuickBooksStatus.allowedActions: REFRESH_FAILED forbids sync, allows disconnect+reconnect", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    await completeQuickBooksConnect({
      workspaceId,
      actorId,
      code: "auth-code",
      state,
      realmId: "7777777777",
      env: testEnv,
      fetchImpl: tokenFetch("7777777777") as unknown as typeof fetch,
    });

    await db.ownerConnector.update({
      where: { id: started.connectorId },
      data: { status: "REFRESH_FAILED", syncFailureMessage: "QuickBooks authorization expired or was revoked. Reconnect QuickBooks." },
    });

    const status = await getQuickBooksStatus({ workspaceId, env: testEnv });
    expect(status.connector?.status).toBe("REFRESH_FAILED");
    expect(status.connector?.allowedActions).toEqual({ sync: false, disconnect: true, reconnect: true });
    expect(status.connector?.needsReconnect).toBe(true);

    await teardown(workspaceId, businessId);
  });

  it("getQuickBooksStatus.allowedActions: an ACTIVE connector with an expired refresh token forbids sync and forces reconnect", async () => {
    const workspaceId = randomUUID();
    const businessId = await seedBusiness(workspaceId);

    const started = await startQuickBooksConnect({ workspaceId, actorId, businessId, env: testEnv });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;
    await completeQuickBooksConnect({
      workspaceId,
      actorId,
      code: "auth-code",
      state,
      realmId: "8888888888",
      env: testEnv,
      fetchImpl: tokenFetch("8888888888") as unknown as typeof fetch,
    });

    // Connector stays ACTIVE (no refresh attempted yet) but its stored refresh token has expired.
    await db.ownerConnectorToken.update({
      where: { connectorId: started.connectorId },
      data: { refreshTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    const status = await getQuickBooksStatus({ workspaceId, env: testEnv });
    expect(status.connector?.status).toBe("ACTIVE");
    expect(status.connector?.allowedActions).toEqual({ sync: false, disconnect: true, reconnect: true });
    expect(status.connector?.needsReconnect).toBe(true);

    await teardown(workspaceId, businessId);
  });
});
