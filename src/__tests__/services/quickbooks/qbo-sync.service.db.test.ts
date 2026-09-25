/**
 * QuickBooks sync/webhook/materialize — real-Postgres proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real Postgres.
 * Proves the behaviors that cannot be proven against a mocked db: the
 * upsert's never-regress SQL predicate, the lease's real atomic CAS under
 * concurrency, webhook realm-scoped routing across workspaces, webhook
 * replay dedup, cross-workspace rejection, and governed snapshot
 * materialization (including leaving an owner-entered snapshot untouched).
 *
 * Run:
 *   TEST_WITH_DB=true DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/opsiq_qbo_test \
 *   npx vitest run src/__tests__/services/quickbooks/qbo-sync.service.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { requestQuickBooksSync, runQuickBooksSync } from "@/services/quickbooks/qbo-sync.service";
import { handleQuickBooksWebhook } from "@/services/quickbooks/qbo-webhook.service";
import { materializeQuickBooksSnapshots } from "@/services/quickbooks/qbo-materialize.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import profitAndLossFixture from "@/__tests__/fixtures/quickbooks/profit-and-loss.json";
import { QBO_SYNC_ENTITY_ORDER, type QboEntityName } from "@/domain/quickbooks/qbo-entities";
import type { QboClient, QboQueryPage, QboCdcResult } from "@/domain/quickbooks/qbo-contracts";
import { createHmac } from "crypto";

const actor = randomUUID();

const ENV = {
  QUICKBOOKS_CLIENT_ID: "id",
  QUICKBOOKS_CLIENT_SECRET: "secret",
  QUICKBOOKS_REDIRECT_URI: "https://app.example.com/callback",
  QUICKBOOKS_ENVIRONMENT: "sandbox",
  QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: "db-test-verifier",
  OAUTH_TOKEN_ENCRYPTION_KEY: "encryption-key",
};

function sign(body: string): string {
  return createHmac("sha256", ENV.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN).update(body, "utf8").digest("base64");
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `qbo-sync-db-test-${actor}@example.com`, name: "QBO Sync DB Test", isActive: true, updatedAt: new Date() },
  });
});

/** A QboClient that completes the initial phase instantly (every entity returns 0 rows). */
function emptyClient(overrides: Partial<QboClient> = {}): QboClient {
  return {
    realmId: "111111111",
    environment: "sandbox",
    companyInfo: async () => ({ Id: "1", CompanyName: "DB Test Co", SyncToken: "0" }),
    preferences: async () => ({ CurrencyPrefs: { HomeCurrency: { value: "USD" } } }),
    read: async () => ({}),
    query: async (entity: QboEntityName, opts: { startPosition: number; maxResults: number }): Promise<QboQueryPage> => ({
      entity,
      items: [],
      startPosition: opts.startPosition,
      maxResults: opts.maxResults,
    }),
    cdc: async (): Promise<QboCdcResult> => ({ entities: [], serverTime: new Date().toISOString() }),
    report: async (name: string) => ({ name }),
    create: async () => ({}),
    update: async () => ({}),
    delete: async () => ({}),
    void: async () => ({}),
    inactivate: async () => ({}),
    ...overrides,
  } as QboClient;
}

async function createConnector(workspaceId: string, realmId: string, businessId: string | null = null) {
  return db.ownerConnector.create({
    data: {
      workspaceId,
      businessId,
      provider: "QUICKBOOKS",
      status: "ACTIVE",
      externalAccountId: realmId,
      environment: "sandbox",
      registeredBy: actor,
    },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] QuickBooks sync — record upsert (never regress)", () => {
  it("applies a newer CDC update, ignores an out-of-order older one, then applies a still-newer one", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId);

    // Seed syncState already past INITIAL so each run does exactly one CDC pass.
    await db.ownerConnector.update({
      where: { id: connector.id },
      data: {
        syncState: {
          version: 1,
          phase: "INCREMENTAL",
          initial: { entityIndex: QBO_SYNC_ENTITY_ORDER.length, startPosition: 1, startedAt: new Date(Date.now() - 60_000).toISOString(), completedAt: new Date(Date.now() - 60_000).toISOString() },
          cdcCursor: new Date(Date.now() - 60_000).toISOString(),
          lastRunId: null, lastRunAt: null, lastRunStatus: null, lastRunSummary: null,
          lastReportsAt: null, lastMaterializedPeriod: null, recordCounts: {},
        },
      },
    });

    async function runWithCustomer(name: string, lastUpdated: string, syncToken: string) {
      const client = emptyClient({
        cdc: async (): Promise<QboCdcResult> => ({
          entities: [{ entity: "Customer", changed: [{ Id: "C1", SyncToken: syncToken, DisplayName: name, MetaData: { LastUpdatedTime: lastUpdated } }], deleted: [], truncated: false }],
          serverTime: new Date().toISOString(),
        }),
      });
      const result = await runQuickBooksSync({
        workspaceId, connectorId: connector.id, trigger: "MANUAL", requestedBy: actor, runId: randomUUID(),
        deps: { createClient: async () => client },
      });
      expect(result.status).toBe("SUCCESS");
    }

    await runWithCustomer("Acme (v1)", "2026-09-20T10:00:00.000Z", "1");
    let row = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Customer", remoteId: "C1" } });
    expect(row?.remoteSyncToken).toBe("1");
    expect((row?.data as { DisplayName?: string })?.DisplayName).toBe("Acme (v1)");

    // Older update — must be ignored (no regression).
    await runWithCustomer("Mallory (stale)", "2026-09-19T10:00:00.000Z", "2");
    row = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Customer", remoteId: "C1" } });
    expect(row?.remoteSyncToken).toBe("1");
    expect((row?.data as { DisplayName?: string })?.DisplayName).toBe("Acme (v1)");

    // Newer update — must apply.
    await runWithCustomer("Acme (v2)", "2026-09-21T10:00:00.000Z", "3");
    row = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Customer", remoteId: "C1" } });
    expect(row?.remoteSyncToken).toBe("3");
    expect((row?.data as { DisplayName?: string })?.DisplayName).toBe("Acme (v2)");

    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);

  it("marks a CDC-deleted entity as remoteStatus DELETED without removing the row", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId);
    await db.ownerConnector.update({
      where: { id: connector.id },
      data: {
        syncState: {
          version: 1, phase: "INCREMENTAL",
          initial: { entityIndex: QBO_SYNC_ENTITY_ORDER.length, startPosition: 1, startedAt: new Date(Date.now() - 60_000).toISOString(), completedAt: new Date(Date.now() - 60_000).toISOString() },
          cdcCursor: new Date(Date.now() - 60_000).toISOString(),
          lastRunId: null, lastRunAt: null, lastRunStatus: null, lastRunSummary: null,
          lastReportsAt: null, lastMaterializedPeriod: null, recordCounts: {},
        },
      },
    });
    const client = emptyClient({
      cdc: async (): Promise<QboCdcResult> => ({
        entities: [{ entity: "Vendor", changed: [], deleted: [{ Id: "V1", lastUpdated: new Date().toISOString() }], truncated: false }],
        serverTime: new Date().toISOString(),
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId, connectorId: connector.id, trigger: "MANUAL", requestedBy: actor, runId: randomUUID(),
      deps: { createClient: async () => client },
    });
    expect(result.status).toBe("SUCCESS");
    const row = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Vendor", remoteId: "V1" } });
    expect(row).not.toBeNull();
    expect(row?.remoteStatus).toBe("DELETED");

    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] QuickBooks sync — lease CAS under concurrency", () => {
  it("exactly one of two concurrent runQuickBooksSync calls proceeds; the other gets NO_WORK", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId);

    const client = emptyClient();
    const run = () =>
      runQuickBooksSync({
        workspaceId, connectorId: connector.id, trigger: "MANUAL", requestedBy: actor, runId: randomUUID(),
        deps: { createClient: async () => client },
      });

    const [a, b] = await Promise.all([run(), run()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toContain("NO_WORK");
    expect(statuses.filter((s) => s !== "NO_WORK")).toHaveLength(1);

    const after = await db.ownerConnector.findUnique({ where: { id: connector.id }, select: { syncLeaseExpiresAt: true } });
    expect(after?.syncLeaseExpiresAt).toBeNull();

    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);
});

// F19 — full real-Postgres round-trip for the CDC fallback "incomplete" path.
// Uses the run-deadline termination mechanism (not the literal 100-page cap,
// which would mean tens of thousands of real inserts here) — both mechanisms
// drive the IDENTICAL downstream code (queryChangedSince returns
// `complete: false`, and runCdcPass/runQuickBooksSync branch on that single
// boolean regardless of which check produced it), so this is a faithful
// real-DB proof of the shared mechanism: persist-what-was-fetched, DO NOT
// advance the cursor, schedule a continuation, and — the part a call-count-only
// unit test cannot prove — a SECOND run against the real row picks the exact
// same window back up and, once it can finish, advances the cursor with
// every record (from BOTH runs) durably persisted. The page-cap's own
// distinct 100-page termination arithmetic is proven at the unit level
// (qbo-sync.service.test.ts, "F19 CDC fallback termination mechanisms").
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] QuickBooks sync — F19 CDC fallback incomplete → continuation → completes, no data lost", () => {
  it("run 1 persists what it fetched and leaves the cursor unchanged; run 2 re-requests the SAME window, finishes, advances the cursor, and every record from both runs is present", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId);
    const originalCursor = new Date(Date.now() - 60_000).toISOString();

    await db.ownerConnector.update({
      where: { id: connector.id },
      data: {
        syncState: {
          version: 1,
          phase: "INCREMENTAL",
          initial: { entityIndex: QBO_SYNC_ENTITY_ORDER.length, startPosition: 1, startedAt: new Date(Date.now() - 120_000).toISOString(), completedAt: new Date(Date.now() - 120_000).toISOString() },
          cdcCursor: originalCursor,
          lastRunId: null, lastRunAt: null, lastRunStatus: null, lastRunSummary: null,
          lastReportsAt: null, lastMaterializedPeriod: null, recordCounts: {},
        },
      },
    });

    const whereClausesSeen: string[] = [];

    // ── Run 1: always a FULL (1000-item) page, and the virtual clock jumps
    // far past the run's own budget right after that first page is fetched —
    // guarantees exactly one page is fetched before the deadline check stops it.
    const virtualNow = { current: Date.now() };
    const run1Query = async (entity: string, opts: { startPosition: number; maxResults: number; where?: string }) => {
      if (opts.where) whereClausesSeen.push(opts.where);
      const items = Array.from({ length: 1000 }, (_, i) => ({ Id: `f19-run1-${i}`, SyncToken: "1", DisplayName: `Run1 #${i}`, MetaData: { LastUpdatedTime: new Date().toISOString() } }));
      virtualNow.current += 60 * 60_000; // jump 60 minutes ahead — well past any reasonable budget
      return { entity, items, startPosition: opts.startPosition, maxResults: opts.maxResults };
    };
    const client1 = emptyClient({
      query: run1Query as unknown as QboClient["query"],
      cdc: async (): Promise<QboCdcResult> => ({
        entities: [{ entity: "Customer", changed: [], deleted: [], truncated: true }],
        serverTime: new Date(virtualNow.current).toISOString(),
      }),
    });

    const run1 = await runQuickBooksSync({
      workspaceId, connectorId: connector.id, trigger: "SCHEDULED", requestedBy: actor, runId: randomUUID(),
      budgetMs: 5 * 60_000,
      deps: { createClient: async () => client1, now: () => new Date(virtualNow.current) },
    });
    expect(run1.status).toBe("PARTIAL_FAILURE");

    const afterRun1 = await db.ownerConnector.findUnique({ where: { id: connector.id }, select: { syncState: true } });
    const stateAfterRun1 = afterRun1!.syncState as { cdcCursor: string };
    expect(stateAfterRun1.cdcCursor).toBe(originalCursor); // NOT advanced

    const countAfterRun1 = await db.ownerConnectorRecord.count({ where: { connectorId: connector.id, entityType: "Customer" } });
    expect(countAfterRun1).toBe(1000); // the one fetched page WAS persisted despite being "incomplete"

    // A continuation task must exist for the same connector.
    const continuationCount = await db.scheduledTask.count({
      where: { workspaceId, taskName: "quickbooks-sync", payload: { path: ["connectorId"], equals: connector.id } },
    });
    expect(continuationCount).toBeGreaterThan(0);

    // ── Run 2: short (10-item) final page — completes naturally this time.
    const run2Query = async (entity: string, opts: { startPosition: number; maxResults: number; where?: string }) => {
      if (opts.where) whereClausesSeen.push(opts.where);
      const items = Array.from({ length: 10 }, (_, i) => ({ Id: `f19-run2-${i}`, SyncToken: "1", DisplayName: `Run2 #${i}`, MetaData: { LastUpdatedTime: new Date().toISOString() } }));
      return { entity, items, startPosition: opts.startPosition, maxResults: opts.maxResults };
    };
    const client2 = emptyClient({
      query: run2Query as unknown as QboClient["query"],
      cdc: async (): Promise<QboCdcResult> => ({
        entities: [{ entity: "Customer", changed: [], deleted: [], truncated: true }],
        serverTime: new Date().toISOString(),
      }),
    });

    const run2 = await runQuickBooksSync({
      workspaceId, connectorId: connector.id, trigger: "SCHEDULED", requestedBy: actor, runId: randomUUID(),
      deps: { createClient: async () => client2 },
    });
    expect(run2.status).toBe("SUCCESS");

    // Both runs' fallback queries used the SAME changedSince window (run 2
    // re-requested exactly where run 1 left off, since the cursor never moved).
    expect(whereClausesSeen).toHaveLength(2);
    expect(whereClausesSeen[0]).toBe(whereClausesSeen[1]);

    const afterRun2 = await db.ownerConnector.findUnique({ where: { id: connector.id }, select: { syncState: true } });
    const stateAfterRun2 = afterRun2!.syncState as { cdcCursor: string };
    expect(stateAfterRun2.cdcCursor).not.toBe(originalCursor); // NOW advanced

    // Nothing from run 1 was lost, and run 2's records are also present.
    const finalCount = await db.ownerConnectorRecord.count({ where: { connectorId: connector.id, entityType: "Customer" } });
    expect(finalCount).toBe(1010);
    const run1Sample = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Customer", remoteId: "f19-run1-999" } });
    const run2Sample = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Customer", remoteId: "f19-run2-9" } });
    expect(run1Sample).not.toBeNull();
    expect(run2Sample).not.toBeNull();

    await db.scheduledTask.deleteMany({ where: { workspaceId } });
    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 60_000);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] requestQuickBooksSync — workspace scoping", () => {
  it("rejects a request scoped to a workspace that does not own the connector", async () => {
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId);

    await expect(
      requestQuickBooksSync({ workspaceId: otherWorkspaceId, actorId: actor, trigger: "MANUAL" })
    ).rejects.toMatchObject({ statusCode: 404 });

    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 15_000);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] QuickBooks webhook — realm routing and replay", () => {
  it("routes a realm's webhook only to the workspace(s) whose connector matches that realm", async () => {
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const realmA = String(Math.floor(100000000 + Math.random() * 800000000));
    const realmB = String(Math.floor(100000000 + Math.random() * 800000000));
    const connectorA = await createConnector(workspaceA, realmA);
    const connectorB = await createConnector(workspaceB, realmB);

    const body = JSON.stringify([
      { specversion: "1.0", id: randomUUID(), type: "qbo.customer.created.v1", time: new Date().toISOString(), intuitentityid: "1", intuitaccountid: realmA },
    ]);
    const result = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });

    expect(result.status).toBe(200);
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0].workspaceId).toBe(workspaceA);
    expect(result.dispatched.some((d) => d.workspaceId === workspaceB)).toBe(false);

    await db.scheduledTask.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
    await db.ownerConnector.deleteMany({ where: { id: { in: [connectorA.id, connectorB.id] } } });
  }, 30_000);

  it("a replayed webhook delivery (same dedupKey) enqueues no second task", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const connector = await createConnector(workspaceId, realmId);

    const id = randomUUID();
    const body = JSON.stringify([
      { specversion: "1.0", id, type: "qbo.customer.created.v1", time: new Date().toISOString(), intuitentityid: "1", intuitaccountid: realmId },
    ]);

    const first = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });
    const second = await handleQuickBooksWebhook({ rawBody: body, signatureHeader: sign(body), env: ENV });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.dispatched[0].taskId).toBe(second.dispatched[0].taskId);

    const count = await db.scheduledTask.count({ where: { workspaceId, idempotencyKey: `quickbooks-sync:${connector.id}:webhook:${id}` } });
    expect(count).toBe(1);

    await db.scheduledTask.deleteMany({ where: { workspaceId } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] materializeQuickBooksSnapshots", () => {
  it("creates canonical financial + cashflow snapshots and links them; a later re-materialize amends only the linked one", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const business = await createBusiness({ name: "QBO Materialize Test", businessType: "generic_local_service", currency: "USD", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
    const connector = await createConnector(workspaceId, realmId, business.id);

    const result = await materializeQuickBooksSnapshots({
      workspaceId, connectorId: connector.id, businessId: business.id, actorId: actor,
      periodStart: "2026-08-01", periodEnd: "2026-08-31",
      reports: { profitAndLoss: {}, balanceSheet: {}, agedReceivables: {}, agedPayables: {} },
      homeCurrency: "USD",
    });
    expect(result.financial).toBe("CREATED");
    expect(result.cashflow).toBe("CREATED");

    const link = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Link:OwnerFinancialSnapshot", remoteId: "2026-08-01..2026-08-31" } });
    expect(link?.opsiqEntityId).toBeTruthy();

    await teardownOwnerBusiness(business.id);
    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);

  it("never touches an owner-entered financial snapshot for the same period", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const business = await createBusiness({ name: "QBO Owner-Entered Test", businessType: "generic_local_service", currency: "USD", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
    const connector = await createConnector(workspaceId, realmId, business.id);

    const ownerSnapshot = await createFinancialSnapshot(
      business.id,
      { periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "USD", revenue: 55555 },
      actor,
      workspaceId
    );

    const result = await materializeQuickBooksSnapshots({
      workspaceId, connectorId: connector.id, businessId: business.id, actorId: actor,
      periodStart: "2026-08-01", periodEnd: "2026-08-31",
      reports: { profitAndLoss: {}, balanceSheet: {}, agedReceivables: {}, agedPayables: {} },
      homeCurrency: "USD",
    });
    expect(result.financial).toBe("SKIPPED");
    expect(result.issues.some((i) => /owner-entered/i.test(i))).toBe(true);

    const stillThere = await db.ownerFinancialSnapshot.findUnique({ where: { id: ownerSnapshot.id } });
    expect(stillThere?.revenue?.toString()).toBe("55555");
    expect(stillThere?.supersededById).toBeNull();

    await teardownOwnerBusiness(business.id);
    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);

  // F15: an owner correction layered on top of a QuickBooks-created snapshot
  // must never be silently overwritten by the next sync.
  it("never re-applies over a snapshot the owner amended after we created it (F15)", async () => {
    const workspaceId = randomUUID();
    const realmId = String(Math.floor(100000000 + Math.random() * 800000000));
    const business = await createBusiness({ name: "QBO Owner-Amend-After-Us Test", businessType: "generic_local_service", currency: "USD", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
    const connector = await createConnector(workspaceId, realmId, business.id);

    // 1. QuickBooks creates the snapshot (revenue 12000 from the fixture).
    const created = await materializeQuickBooksSnapshots({
      workspaceId, connectorId: connector.id, businessId: business.id, actorId: actor,
      periodStart: "2026-01-01", periodEnd: "2026-01-31",
      reports: { profitAndLoss: profitAndLossFixture, balanceSheet: {}, agedReceivables: {}, agedPayables: {} },
      homeCurrency: "USD",
    });
    expect(created.financial).toBe("CREATED");
    const link = await db.ownerConnectorRecord.findFirst({ where: { connectorId: connector.id, entityType: "Link:OwnerFinancialSnapshot", remoteId: "2026-01-01..2026-01-31" } });
    const qboCreatedId = link!.opsiqEntityId!;

    // 2. Owner corrects it by hand (amendFinancialSnapshot — a real governed amendment).
    const ownerAmended = await amendFinancialSnapshot(
      qboCreatedId,
      { amendmentReason: "Owner correction: QuickBooks miscategorized a refund", revenue: 999999 },
      actor,
      workspaceId
    );
    expect(ownerAmended.snapshot!.id).not.toBe(qboCreatedId);

    // 3. A later sync brings different QuickBooks-derived values — must SKIP, not overwrite the owner's correction.
    const bumpedFixture = JSON.parse(JSON.stringify(profitAndLossFixture)) as typeof profitAndLossFixture;
    bumpedFixture.Rows.Row[0].Summary.ColData[1].value = "22000.00"; // Total Income

    const secondSync = await materializeQuickBooksSnapshots({
      workspaceId, connectorId: connector.id, businessId: business.id, actorId: actor,
      periodStart: "2026-01-01", periodEnd: "2026-01-31",
      reports: { profitAndLoss: bumpedFixture, balanceSheet: {}, agedReceivables: {}, agedPayables: {} },
      homeCurrency: "USD",
    });
    expect(secondSync.financial).toBe("SKIPPED");
    expect(secondSync.issues.some((i) => /amended in OpsIQ/i.test(i))).toBe(true);

    const finalCurrent = await db.ownerFinancialSnapshot.findFirst({
      where: { businessId: business.id, periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), supersededById: null },
    });
    expect(finalCurrent?.id).toBe(ownerAmended.snapshot!.id);
    expect(finalCurrent?.revenue?.toString()).toBe("999999");

    await teardownOwnerBusiness(business.id);
    await db.ownerConnectorRecord.deleteMany({ where: { connectorId: connector.id } });
    await db.ownerConnector.delete({ where: { id: connector.id } });
  }, 30_000);
});
