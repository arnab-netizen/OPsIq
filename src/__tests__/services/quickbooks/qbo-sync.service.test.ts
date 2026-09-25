/**
 * qbo-sync.service — unit proof (fake QboClient + mocked db).
 *
 * Exercises requestQuickBooksSync's dedup/scoping rules and runQuickBooksSync's
 * lease CAS, resumable initial pagination, budget-exceeded continuation,
 * CDC pass (truncation fallback, stale-cursor full resync), and failure
 * classification (AUTH → FAILED, retryable → rethrow after lease release).
 *
 * The upsert's actual "never regress an older update" SQL predicate and the
 * lease's real cross-process concurrency guarantee can only be proven
 * against a real Postgres — see qbo-sync.service.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QboClient, QboEntityBody } from "@/domain/quickbooks/qbo-contracts";
import { QboApiError } from "@/domain/quickbooks/qbo-contracts";
import { QBO_SYNC_ENTITY_ORDER } from "@/domain/quickbooks/qbo-entities";

// ─── db mock ──────────────────────────────────────────────────────────────

const scheduledTaskFindUnique = vi.fn(async () => null as { id: string } | null);
const scheduledTaskCreate = vi.fn(async (args: { data: { id: string } }) => ({ id: args.data.id }));
const ownerConnectorFindFirst = vi.fn();
const ownerConnectorUpdateMany = vi.fn(async () => ({ count: 1 }));
const ownerConnectorUpdate = vi.fn(async () => ({}));
const txExecuteRaw = vi.fn(async () => 1);
const txOwnerConnectorUpdate = vi.fn(async () => ({}));

function makeTx() {
  return {
    $executeRaw: txExecuteRaw,
    ownerConnector: { update: txOwnerConnectorUpdate },
  };
}

const dbTransaction = vi.fn(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()));

vi.mock("@/lib/db", () => ({
  db: {
    scheduledTask: { findUnique: (...a: unknown[]) => scheduledTaskFindUnique(...(a as [])), create: (...a: unknown[]) => scheduledTaskCreate(...(a as [{ data: { id: string } }])) },
    ownerConnector: {
      findFirst: (...a: unknown[]) => ownerConnectorFindFirst(...a),
      updateMany: (...a: unknown[]) => ownerConnectorUpdateMany(...a),
      update: (...a: unknown[]) => ownerConnectorUpdate(...a),
    },
    $transaction: (...a: unknown[]) => dbTransaction(...(a as [(tx: ReturnType<typeof makeTx>) => unknown])),
  },
}));

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

const materializeQuickBooksSnapshots = vi.fn(async () => ({ financial: "CREATED", cashflow: "CREATED", issues: [] as string[] }));
vi.mock("@/services/quickbooks/qbo-materialize.service", () => ({
  materializeQuickBooksSnapshots: (...a: unknown[]) => materializeQuickBooksSnapshots(...a),
}));

const ingestIntegrationEvent = vi.fn(async () => ({}));
vi.mock("@/services/integration-fabric/integration-event.service", () => ({
  ingestIntegrationEvent: (...a: unknown[]) => ingestIntegrationEvent(...a),
}));

// qbo-client / qbo-token.service are never invoked when deps.createClient is supplied,
// but the module still statically imports them — stub minimally so the import resolves
// even if either module is mid-flight elsewhere in this workspace.
vi.mock("@/services/quickbooks/qbo-client", () => ({ createQboClient: vi.fn() }));
vi.mock("@/services/quickbooks/qbo-token.service", () => ({ createQboTokenProvider: vi.fn() }));

import {
  requestQuickBooksSync,
  runQuickBooksSync,
  quickBooksSyncTaskHandler,
  buildSyncContinuationIdempotencyKey,
} from "@/services/quickbooks/qbo-sync.service";
import { NotFoundError, ConflictError, ValidationError } from "@/infra/errors";
import { randomUUID } from "crypto";

const WORKSPACE = randomUUID();
const CONNECTOR = randomUUID();
const ACTOR = randomUUID();
const REGISTERED_BY = randomUUID();

beforeEach(() => {
  vi.clearAllMocks();
  scheduledTaskFindUnique.mockResolvedValue(null);
  scheduledTaskCreate.mockImplementation(async (args: { data: { id: string } }) => ({ id: args.data.id }));
  ownerConnectorUpdateMany.mockResolvedValue({ count: 1 });
  dbTransaction.mockImplementation(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()));
});

// ─── requestQuickBooksSync ────────────────────────────────────────────────

describe("[unit] requestQuickBooksSync", () => {
  it("throws NotFoundError when the workspace has no QuickBooks connector", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(null);
    await expect(
      requestQuickBooksSync({ workspaceId: WORKSPACE, actorId: ACTOR, trigger: "MANUAL" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ConflictError when the connector is not ACTIVE", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce({ id: CONNECTOR, status: "DISCONNECTED", registeredBy: REGISTERED_BY });
    await expect(
      requestQuickBooksSync({ workspaceId: WORKSPACE, actorId: ACTOR, trigger: "MANUAL" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires a dedupKey for WEBHOOK triggers", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce({ id: CONNECTOR, status: "ACTIVE", registeredBy: REGISTERED_BY });
    await expect(
      requestQuickBooksSync({ workspaceId: WORKSPACE, actorId: ACTOR, trigger: "WEBHOOK" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("schedules a task with a minute-bucketed idempotency key for MANUAL and emits the requested audit event", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce({ id: CONNECTOR, status: "ACTIVE", registeredBy: REGISTERED_BY });
    const now = new Date("2026-09-25T10:15:30.000Z");
    const result = await requestQuickBooksSync({ workspaceId: WORKSPACE, actorId: ACTOR, trigger: "MANUAL", now });
    expect(result.deduplicated).toBe(false);
    expect(scheduledTaskCreate).toHaveBeenCalledTimes(1);
    const createArgs = scheduledTaskCreate.mock.calls[0][0] as { data: { idempotencyKey: string; payload: unknown } };
    expect(createArgs.data.idempotencyKey).toBe(`quickbooks-sync:${CONNECTOR}:manual:2026-09-25T10:15`);
    expect(createArgs.data.payload).toMatchObject({ connectorId: CONNECTOR, trigger: "MANUAL", requestedBy: ACTOR });
    // The scheduler's own DatabaseSchedulerProvider.schedule() also emits a
    // SCHEDULED_TASK_ENQUEUED audit event (same emitAuditEvent import) —
    // assert our own QUICKBOOKS_SYNC_REQUESTED event is among the calls.
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "quickbooks.sync_requested" }));
  });

  it("uses connector.registeredBy (not the caller's actorId) as requestedBy for SCHEDULED", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce({ id: CONNECTOR, status: "ACTIVE", registeredBy: REGISTERED_BY });
    await requestQuickBooksSync({ workspaceId: WORKSPACE, actorId: ACTOR, trigger: "SCHEDULED" });
    const createArgs = scheduledTaskCreate.mock.calls[0][0] as { data: { payload: unknown } };
    expect(createArgs.data.payload).toMatchObject({ requestedBy: REGISTERED_BY });
  });

  it("skips the audit event on an idempotent dedup hit (WEBHOOK replay)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce({ id: CONNECTOR, status: "ACTIVE", registeredBy: REGISTERED_BY });
    // Both requestQuickBooksSync's own dedup check AND the scheduler's own
    // idempotency check hit db.scheduledTask.findUnique — mock every call.
    scheduledTaskFindUnique.mockResolvedValue({ id: "existing-task" });
    const result = await requestQuickBooksSync({ workspaceId: WORKSPACE, actorId: ACTOR, trigger: "WEBHOOK", dedupKey: "evt-1" });
    expect(result.deduplicated).toBe(true);
    expect(result.taskId).toBe("existing-task");
    expect(scheduledTaskCreate).not.toHaveBeenCalled();
    expect(emitAuditEvent).not.toHaveBeenCalled();
  });

  it("a request scoped to a workspace that does not own this connector is rejected (NotFoundError)", async () => {
    // requestQuickBooksSync has no connectorId parameter — it always looks up
    // the CALLING workspace's own connector, so a caller in workspace B can
    // never reach workspace A's connector even indirectly.
    ownerConnectorFindFirst.mockResolvedValueOnce(null); // workspace B has no QUICKBOOKS connector
    await expect(
      requestQuickBooksSync({ workspaceId: "workspace-b", actorId: ACTOR, trigger: "MANUAL" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(ownerConnectorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "workspace-b" }) })
    );
  });
});

// ─── runQuickBooksSync ────────────────────────────────────────────────────

function emptyEntityBody(id: string): QboEntityBody {
  return { Id: id, SyncToken: "0", MetaData: { LastUpdatedTime: "2026-09-01T00:00:00.000Z" } };
}

function fakeClient(overrides: Partial<QboClient> = {}): QboClient {
  return {
    realmId: "789012345",
    environment: "sandbox",
    companyInfo: vi.fn(async () => ({ Id: "1", CompanyName: "Acme Co", SyncToken: "0" })),
    preferences: vi.fn(async () => ({ CurrencyPrefs: { HomeCurrency: { value: "USD" } } })),
    read: vi.fn(),
    query: vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number }) => ({
      entity,
      items: [],
      startPosition: opts.startPosition,
      maxResults: opts.maxResults,
    })),
    cdc: vi.fn(async () => ({ entities: [], serverTime: "2026-09-25T10:00:00.000Z" })),
    report: vi.fn(async (name: string) => ({ name })),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    void: vi.fn(),
    inactivate: vi.fn(),
    ...overrides,
  } as unknown as QboClient;
}

function connectorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTOR,
    workspaceId: WORKSPACE,
    businessId: null,
    externalAccountId: "789012345",
    environment: "sandbox",
    syncState: null,
    ...overrides,
  };
}

describe("[unit] runQuickBooksSync — lease CAS", () => {
  it("returns NO_WORK immediately when the lease is already held (no other DB work attempted)", async () => {
    ownerConnectorUpdateMany.mockResolvedValueOnce({ count: 0 });
    const client = fakeClient();
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-1",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("NO_WORK");
    expect(ownerConnectorFindFirst).not.toHaveBeenCalled();
  });

  it("releases the lease it set, in finally, on a clean SUCCESS run", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient();
    await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-1",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    const releaseCall = ownerConnectorUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { syncLeaseExpiresAt?: unknown } }).data?.syncLeaseExpiresAt === null
    );
    expect(releaseCall).toBeDefined();
  });
});

describe("[unit] runQuickBooksSync — happy path", () => {
  it("walks every synced entity through the initial phase, transitions to INCREMENTAL, pulls CDC, and materializes reports", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient();
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-1",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("SUCCESS");
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(QBO_SYNC_ENTITY_ORDER.length);
    expect(client.cdc).toHaveBeenCalledTimes(1);
    expect(client.report).toHaveBeenCalledTimes(6);
    expect(materializeQuickBooksSnapshots).not.toHaveBeenCalled(); // no businessId on this connector
  });

  it("calls materializeQuickBooksSnapshots when the connector is linked to a business", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow({ businessId: "biz-1" }));
    const client = fakeClient();
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-1",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("SUCCESS");
    expect(materializeQuickBooksSnapshots).toHaveBeenCalledTimes(1);
    expect(materializeQuickBooksSnapshots.mock.calls[0][0]).toMatchObject({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      businessId: "biz-1",
      homeCurrency: "USD",
    });
  });

  it("resumes initial pagination from the persisted cursor instead of restarting", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(
      connectorRow({
        syncState: {
          version: 1,
          phase: "INITIAL",
          initial: { entityIndex: 2, startPosition: 501, startedAt: "2026-09-25T09:00:00.000Z", completedAt: null },
          cdcCursor: null,
          lastRunId: null,
          lastRunAt: null,
          lastRunStatus: null,
          lastRunSummary: null,
          lastReportsAt: null,
          lastMaterializedPeriod: null,
          recordCounts: {},
        },
      })
    );
    const client = fakeClient();
    await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-1",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    const firstQueryCall = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstQueryCall[0]).toBe(QBO_SYNC_ENTITY_ORDER[2]);
    expect(firstQueryCall[1]).toMatchObject({ startPosition: 501 });
  });
});

describe("[unit] runQuickBooksSync — budget-exceeded continuation", () => {
  it("stops cleanly and schedules a continuation task using the run-id continuation key", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient();
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-budget-1",
      budgetMs: -1, // already exhausted before the first page
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("SUCCESS");
    expect(result.summary).toBe("Initial sync in progress");
    const continuationCall = scheduledTaskCreate.mock.calls.find(
      (c) => (c[0] as { data: { idempotencyKey: string } }).data.idempotencyKey === buildSyncContinuationIdempotencyKey(CONNECTOR, "run-budget-1")
    );
    expect(continuationCall).toBeDefined();
  });
});

describe("[unit] runQuickBooksSync — CDC", () => {
  function incrementalConnectorRow(cdcCursorIso: string) {
    return connectorRow({
      syncState: {
        version: 1,
        phase: "INCREMENTAL",
        initial: { entityIndex: QBO_SYNC_ENTITY_ORDER.length, startPosition: 1, startedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:05:00.000Z" },
        cdcCursor: cdcCursorIso,
        lastRunId: null,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunSummary: null,
        lastReportsAt: null,
        lastMaterializedPeriod: null,
        recordCounts: {},
      },
    });
  }

  it("marks CDC-deleted entities as remoteStatus DELETED without ever deleting the row", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(incrementalConnectorRow("2026-09-25T09:00:00.000Z"));
    const client = fakeClient({
      cdc: vi.fn(async () => ({
        entities: [{ entity: "Customer", changed: [], deleted: [{ Id: "9", lastUpdated: "2026-09-25T09:30:00.000Z" }], truncated: false }],
        serverTime: "2026-09-25T10:00:00.000Z",
      })) as unknown as QboClient["cdc"],
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-2",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("SUCCESS");
    const deletedCall = txExecuteRaw.mock.calls.find((c) => c.some((v) => v === "DELETED"));
    expect(deletedCall).toBeDefined();
    expect(deletedCall!.some((v) => v === "9")).toBe(true);
  });

  it("falls back to a paginated query for a truncated CDC entity", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(incrementalConnectorRow("2026-09-25T09:00:00.000Z"));
    const queryMock = vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number; where?: string }) => ({
      entity,
      items: [],
      startPosition: opts.startPosition,
      maxResults: opts.maxResults,
    }));
    const client = fakeClient({
      query: queryMock as unknown as QboClient["query"],
      cdc: vi.fn(async () => ({
        entities: [{ entity: "Invoice", changed: [emptyEntityBody("1")], deleted: [], truncated: true }],
        serverTime: "2026-09-25T10:00:00.000Z",
      })) as unknown as QboClient["cdc"],
    });
    await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-3",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(queryMock).toHaveBeenCalledWith("Invoice", expect.objectContaining({ where: expect.stringContaining("MetaData.LastUpdatedTime") }));
  });

  it("falls back to a full resync when the CDC cursor is stale (>29 days)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(incrementalConnectorRow("2026-01-01T00:00:00.000Z"));
    const client = fakeClient();
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-4",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("SUCCESS");
    // Stale cursor resets to phase INITIAL, so every synced entity is queried again.
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(QBO_SYNC_ENTITY_ORDER.length);
    expect(client.cdc).toHaveBeenCalledTimes(1); // the fresh initial pass then transitions back into one incremental pass
  });
});

describe("[unit] runQuickBooksSync — failure classification", () => {
  it("AUTH failure returns FAILED without throwing and releases the lease", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "AUTH", message: "invalid_grant" });
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-5",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("FAILED");
    expect(ownerConnectorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncFailureMessage: "Reconnect QuickBooks" }) })
    );
    const releaseCall = ownerConnectorUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { syncLeaseExpiresAt?: unknown } }).data?.syncLeaseExpiresAt === null
    );
    expect(releaseCall).toBeDefined();
  });

  it("a retryable TRANSIENT failure rethrows (after releasing the lease) so the scheduler governs the retry", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "TRANSIENT", message: "server error" });
      }),
    });
    await expect(
      runQuickBooksSync({
        workspaceId: WORKSPACE,
        connectorId: CONNECTOR,
        trigger: "MANUAL",
        requestedBy: ACTOR,
        runId: "run-6",
        deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
      })
    ).rejects.toThrow();
    const releaseCall = ownerConnectorUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { syncLeaseExpiresAt?: unknown } }).data?.syncLeaseExpiresAt === null
    );
    expect(releaseCall).toBeDefined();
  });

  it("a non-retryable VALIDATION failure returns FAILED without throwing", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "VALIDATION", message: "bad request" });
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "MANUAL",
      requestedBy: ACTOR,
      runId: "run-7",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("FAILED");
  });
});

// ─── Task handler ─────────────────────────────────────────────────────────

describe("[unit] quickBooksSyncTaskHandler", () => {
  it("throws when the claimed task has no workspaceId", async () => {
    await expect(
      quickBooksSyncTaskHandler({ connectorId: CONNECTOR, trigger: "MANUAL", requestedBy: ACTOR }, { taskId: "t1", taskName: "quickbooks-sync", workspaceId: null, attempt: 1 })
    ).rejects.toThrow(/workspaceId/);
  });

  it("rejects a payload missing required fields", async () => {
    await expect(
      quickBooksSyncTaskHandler({ trigger: "MANUAL" }, { taskId: "t1", taskName: "quickbooks-sync", workspaceId: WORKSPACE, attempt: 1 })
    ).rejects.toThrow();
  });

  it("uses context.workspaceId — never a workspaceId embedded in payload — to scope the sync (payload carries no workspaceId field at all)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow({ workspaceId: WORKSPACE }));
    vi.doMock("@/services/quickbooks/qbo-client", () => ({ createQboClient: vi.fn() }));
    const client = fakeClient();
    // deps injection isn't reachable through the handler by design (production
    // task payload has no deps channel); route via ownerConnector mocks instead
    // and assert the workspace used to acquire the sync lease.
    await quickBooksSyncTaskHandler(
      { connectorId: CONNECTOR, trigger: "MANUAL", requestedBy: ACTOR },
      { taskId: "t1", taskName: "quickbooks-sync", workspaceId: WORKSPACE, attempt: 1 }
    ).catch(() => {
      /* creating the real client will fail without full env/token wiring in this unit test — we only assert the lease-acquire call below */
    });
    void client;
    expect(ownerConnectorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WORKSPACE, id: CONNECTOR }) })
    );
  });
});
