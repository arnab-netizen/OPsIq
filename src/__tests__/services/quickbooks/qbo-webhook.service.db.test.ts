/**
 * F20 — qbo-webhook.service — real-Postgres realm-routing proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real Postgres.
 * The unit suite (qbo-webhook.service.test.ts) mocks db.ownerConnector; this
 * file proves the ACTUAL Prisma query against real rows: a realm shared by
 * an ACTIVE connector (workspace A) and a DISCONNECTED/REFRESH_FAILED
 * connector (workspace B) routes ONLY to A; a different realm (workspace C)
 * never receives anything from a delivery naming the first realm; and a
 * replayed delivery (same dedupKey) enqueues no second task.
 *
 * Run:
 *   TEST_WITH_DB=true DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   npx vitest run src/__tests__/services/quickbooks/qbo-webhook.service.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID, createHmac } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { handleQuickBooksWebhook } from "@/services/quickbooks/qbo-webhook.service";

const actor = randomUUID();

const ENV = {
  QUICKBOOKS_CLIENT_ID: "id",
  QUICKBOOKS_CLIENT_SECRET: "secret",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: "db-webhook-realm-verifier",
  OAUTH_TOKEN_ENCRYPTION_KEY: "encryption-key",
};

function sign(body: string): string {
  return createHmac("sha256", ENV.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN).update(body, "utf8").digest("base64");
}

function cloudEventBody(realmId: string, id: string): string {
  return JSON.stringify([
    { specversion: "1.0", id, type: "qbo.customer.created.v1", time: new Date().toISOString(), intuitentityid: "1", intuitaccountid: realmId },
  ]);
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `qbo-webhook-db-test-${actor}@example.com`, name: "QBO Webhook DB Test", isActive: true, updatedAt: new Date() },
  });
});

async function createConnector(workspaceId: string, realmId: string, status: string) {
  return db.ownerConnector.create({
    data: { workspaceId, provider: "QUICKBOOKS", status, externalAccountId: realmId, environment: "sandbox", registeredBy: actor },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] handleQuickBooksWebhook — realm routing across real connector rows", () => {
  it("routes a shared realm ONLY to its ACTIVE connector, never to a DISCONNECTED/REFRESH_FAILED one on the same realm, and never to an unrelated realm", async () => {
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const workspaceC = randomUUID();
    const realmX = String(Math.floor(100000000 + Math.random() * 800000000));
    const realmY = String(Math.floor(100000000 + Math.random() * 800000000));

    const connectorA = await createConnector(workspaceA, realmX, "ACTIVE");
    const connectorBDisconnected = await createConnector(workspaceB, realmX, "DISCONNECTED");
    const connectorC = await createConnector(workspaceC, realmY, "ACTIVE");

    const body = cloudEventBody(realmX, randomUUID());
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });

    expect(result.status).toBe(200);
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]).toMatchObject({ workspaceId: workspaceA, connectorId: connectorA.id });
    expect(result.dispatched.some((d) => d.workspaceId === workspaceB)).toBe(false);
    expect(result.dispatched.some((d) => d.workspaceId === workspaceC)).toBe(false);

    // Also verify at the ScheduledTask level: workspace B and C never got a task from this delivery.
    const tasksB = await db.scheduledTask.count({ where: { workspaceId: workspaceB } });
    const tasksC = await db.scheduledTask.count({ where: { workspaceId: workspaceC } });
    expect(tasksB).toBe(0);
    expect(tasksC).toBe(0);

    await db.scheduledTask.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB, workspaceC] } } });
    await db.ownerConnector.deleteMany({ where: { id: { in: [connectorA.id, connectorBDisconnected.id, connectorC.id] } } });
  }, 30_000);

  it("REFRESH_FAILED connectors on the same realm are also excluded from routing", async () => {
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const realmX = String(Math.floor(100000000 + Math.random() * 800000000));

    const connectorA = await createConnector(workspaceA, realmX, "ACTIVE");
    const connectorBRefreshFailed = await createConnector(workspaceB, realmX, "REFRESH_FAILED");

    const body = cloudEventBody(realmX, randomUUID());
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });

    expect(result.status).toBe(200);
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0].workspaceId).toBe(workspaceA);

    await db.scheduledTask.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.ownerConnector.deleteMany({ where: { id: { in: [connectorA.id, connectorBRefreshFailed.id] } } });
  }, 30_000);

  it("a replayed delivery (same dedupKey) against real connector rows enqueues no second task", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId, "ACTIVE");

    const id = randomUUID();
    const body = cloudEventBody(realmId, id);

    const first = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    const second = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });

    expect(first.dispatched[0].taskId).toBe(second.dispatched[0].taskId);
    const count = await db.scheduledTask.count({ where: { workspaceId, idempotencyKey: `quickbooks-sync:${connector.id}:webhook:${id}` } });
    expect(count).toBe(1);

    await db.scheduledTask.deleteMany({ where: { workspaceId } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);
});
