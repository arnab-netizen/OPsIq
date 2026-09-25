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
// vi.mock is hoisted above every top-level statement in this file, so
// everything the factory (and getDbInstance) reference must be created
// inside vi.hoisted() — a plain top-level `const dbMock = {...}` declared
// after the vi.mock call would still be in the temporal dead zone when the
// hoisted factory runs.

const { scheduledTaskFindUnique, scheduledTaskCreate, ownerConnectorFindFirst, ownerConnectorUpdateMany, txExecuteRaw, txOwnerConnectorUpdate, dbTransaction, dbMock } =
  vi.hoisted(() => {
    const scheduledTaskFindUnique = vi.fn(async () => null as { id: string } | null);
    const scheduledTaskCreate = vi.fn(async (args: { data: { id: string } }) => ({ id: args.data.id }));
    const ownerConnectorFindFirst = vi.fn();
    const ownerConnectorUpdateMany = vi.fn(async () => ({ count: 1 }));
    const ownerConnectorUpdate = vi.fn(async () => ({}));
    const txExecuteRaw = vi.fn(async () => 1);
    const txOwnerConnectorUpdate = vi.fn(async () => ({}));
    const makeTx = () => ({ $executeRaw: txExecuteRaw, ownerConnector: { update: txOwnerConnectorUpdate } });
    const dbTransaction = vi.fn(async (fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx()));
    const dbMock = {
      scheduledTask: { findUnique: (...a: unknown[]) => scheduledTaskFindUnique(...(a as [])), create: (...a: unknown[]) => scheduledTaskCreate(...(a as [{ data: { id: string } }])) },
      ownerConnector: {
        findFirst: (...a: unknown[]) => ownerConnectorFindFirst(...a),
        updateMany: (...a: unknown[]) => ownerConnectorUpdateMany(...a),
        update: (...a: unknown[]) => ownerConnectorUpdate(...a),
      },
      $transaction: (...a: unknown[]) => dbTransaction(...(a as [(tx: ReturnType<typeof makeTx>) => unknown])),
    };
    return { scheduledTaskFindUnique, scheduledTaskCreate, ownerConnectorFindFirst, ownerConnectorUpdateMany, txExecuteRaw, txOwnerConnectorUpdate, dbTransaction, dbMock };
  });

// DC-20 (vitest.setup.ts contract): every "@/lib/db" mock factory must also export getDbInstance.
vi.mock("@/lib/db", () => ({ db: dbMock, getDbInstance: vi.fn().mockResolvedValue(dbMock) }));

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
  buildQuickBooksSyncTaskHandler,
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
  dbTransaction.mockImplementation(async (fn: (tx: { $executeRaw: typeof txExecuteRaw; ownerConnector: { update: typeof txOwnerConnectorUpdate } }) => unknown) =>
    fn({ $executeRaw: txExecuteRaw, ownerConnector: { update: txOwnerConnectorUpdate } })
  );
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

  // F19
  it("a truncated entity that never finishes paging (still full pages at the cap) leaves the cursor unchanged and schedules a continuation", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(incrementalConnectorRow("2026-09-25T09:00:00.000Z"));
    const fullPage = () => Array.from({ length: 1000 }, (_, i) => emptyEntityBody(String(i)));
    const queryMock = vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number }) => ({
      entity,
      items: fullPage(),
      startPosition: opts.startPosition,
      maxResults: opts.maxResults,
    }));
    const client = fakeClient({
      query: queryMock as unknown as QboClient["query"],
      cdc: vi.fn(async () => ({
        entities: [{ entity: "Invoice", changed: [], deleted: [], truncated: true }],
        serverTime: "2026-09-25T10:00:00.000Z",
      })) as unknown as QboClient["cdc"],
    });

    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-cap-1",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });

    expect(result.status).toBe("PARTIAL_FAILURE");
    expect(queryMock.mock.calls.length).toBe(100); // MAX_FALLBACK_PAGES

    // Cursor must NOT have advanced past the un-fetched remainder: the persisted
    // syncState.cdcCursor is still the OLD cursor, not client.cdc's serverTime.
    const syncStateUpdate = txOwnerConnectorUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { syncState?: { cdcCursor?: string } } }).data?.syncState?.cdcCursor
    );
    expect(syncStateUpdate).toBeDefined();
    expect((syncStateUpdate![0] as { data: { syncState: { cdcCursor: string } } }).data.syncState.cdcCursor).toBe("2026-09-25T09:00:00.000Z");

    // A continuation task must have been scheduled for the same connector/run.
    const continuationCall = scheduledTaskCreate.mock.calls.find(
      (c) => (c[0] as { data: { idempotencyKey: string } }).data.idempotencyKey === buildSyncContinuationIdempotencyKey(CONNECTOR, "run-cap-1")
    );
    expect(continuationCall).toBeDefined();
  });

  it("never calls the QBO client while a db transaction is open (no network call inside a DB transaction)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(incrementalConnectorRow("2026-09-25T09:00:00.000Z"));
    let txOpen = false;
    dbTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      txOpen = true;
      try {
        return await fn({ $executeRaw: txExecuteRaw, ownerConnector: { update: txOwnerConnectorUpdate } });
      } finally {
        txOpen = false;
      }
    });
    let violation = false;
    const client = fakeClient({
      query: vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number }) => {
        if (txOpen) violation = true;
        return { entity, items: [], startPosition: opts.startPosition, maxResults: opts.maxResults };
      }) as unknown as QboClient["query"],
      cdc: vi.fn(async () => {
        if (txOpen) violation = true;
        return {
          entities: [{ entity: "Invoice", changed: [emptyEntityBody("1")], deleted: [], truncated: true }],
          serverTime: "2026-09-25T10:00:00.000Z",
        };
      }) as unknown as QboClient["cdc"],
    });

    await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-no-net-in-tx",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });

    expect(violation).toBe(false);
  });
});

function freshIncrementalConnectorRow(cdcCursorIso: string) {
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

/** Wraps every function-valued property of a fake QboClient so a call while `txActive.value` is true increments `counter`. */
function instrumentClientAgainstTx(client: QboClient, txActive: { value: boolean }, counter: { value: number }): QboClient {
  const wrapped: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(client as unknown as Record<string, unknown>)) {
    if (typeof val === "function") {
      wrapped[key] = async (...args: unknown[]) => {
        if (txActive.value) counter.value++;
        return (val as (...a: unknown[]) => unknown)(...args);
      };
    } else {
      wrapped[key] = val;
    }
  }
  return wrapped as unknown as QboClient;
}

// F18 — strict, instrumented proof: zero QBO client calls while a db transaction
// is active, and the fetched rows ARE persisted inside a transaction.
describe("[unit] runQuickBooksSync — F18 no network call during a db transaction (instrumented)", () => {
  it("wraps every QboClient method; the truncated-CDC fallback fetch happens with zero calls during an active tx, and the fetched rows are upserted inside that tx", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(freshIncrementalConnectorRow("2026-09-25T09:00:00.000Z"));

    const txActive = { value: false };
    const networkCallsDuringTx = { value: 0 };
    let upsertCallsObservedDuringTx = 0;

    dbTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      txActive.value = true;
      try {
        return await fn({
          $executeRaw: (...args: unknown[]) => {
            if (txActive.value) upsertCallsObservedDuringTx++;
            return (txExecuteRaw as unknown as (...a: unknown[]) => unknown)(...args);
          },
          ownerConnector: { update: txOwnerConnectorUpdate },
        });
      } finally {
        txActive.value = false;
      }
    });

    const fallbackItems = Array.from({ length: 5 }, (_, i) => emptyEntityBody(`fallback-${i}`));
    const rawClient = fakeClient({
      query: vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number }) => ({
        entity,
        items: opts.startPosition === 1 ? fallbackItems : [],
        startPosition: opts.startPosition,
        maxResults: opts.maxResults,
      })) as unknown as QboClient["query"],
      cdc: vi.fn(async () => ({
        entities: [{ entity: "Invoice", changed: [], deleted: [], truncated: true }],
        serverTime: "2026-09-25T10:00:00.000Z",
      })) as unknown as QboClient["cdc"],
    });
    const client = instrumentClientAgainstTx(rawClient, txActive, networkCallsDuringTx);

    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f18",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });

    expect(result.status).toBe("SUCCESS");
    expect(networkCallsDuringTx.value).toBe(0);
    expect(upsertCallsObservedDuringTx).toBeGreaterThan(0);

    // The fetched fallback rows were actually persisted (not silently dropped).
    const persistedIds = new Set(
      txExecuteRaw.mock.calls.filter((c) => c.includes("Invoice")).map((c) => c.find((v) => typeof v === "string" && v.startsWith("fallback-")))
    );
    for (const item of fallbackItems) {
      expect(persistedIds.has(item.Id)).toBe(true);
    }
  });
});

// F19 — deterministic proof for both termination mechanisms, unit-level (call-count
// and cursor-not-advanced assertions; see qbo-sync.service.db.test.ts for the full
// real-Postgres round-trip: second run resumes, eventually completes, no data lost).
describe("[unit] runQuickBooksSync — F19 CDC fallback termination mechanisms", () => {
  it("mechanism 1 — page-cap exhaustion: fallback stops at MAX_FALLBACK_PAGES, cursor unchanged, continuation scheduled", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(freshIncrementalConnectorRow("2026-09-25T09:00:00.000Z"));
    const fullPage = () => Array.from({ length: 1000 }, (_, i) => emptyEntityBody(`page-${i}`));
    const queryMock = vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number }) => ({
      entity,
      items: fullPage(), // ALWAYS a full page — never terminates on its own
      startPosition: opts.startPosition,
      maxResults: opts.maxResults,
    }));
    const client = fakeClient({
      query: queryMock as unknown as QboClient["query"],
      cdc: vi.fn(async () => ({
        entities: [{ entity: "Invoice", changed: [], deleted: [], truncated: true }],
        serverTime: "2026-09-25T10:00:00.000Z",
      })) as unknown as QboClient["cdc"],
    });

    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f19-cap",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });

    expect(result.status).toBe("PARTIAL_FAILURE");
    expect(queryMock).toHaveBeenCalledTimes(100); // MAX_FALLBACK_PAGES — proves the CAP terminated it, not a short page
    const cursorUpdate = txOwnerConnectorUpdate.mock.calls.find((c) => (c[0] as { data?: { syncState?: { cdcCursor?: string } } }).data?.syncState?.cdcCursor);
    expect((cursorUpdate![0] as { data: { syncState: { cdcCursor: string } } }).data.syncState.cdcCursor).toBe("2026-09-25T09:00:00.000Z");
    expect(scheduledTaskCreate.mock.calls.some((c) => (c[0] as { data: { idempotencyKey: string } }).data.idempotencyKey === buildSyncContinuationIdempotencyKey(CONNECTOR, "run-f19-cap"))).toBe(true);
  });

  it("mechanism 2 — run-deadline exhaustion mid-fallback: stops before the page cap, cursor unchanged, continuation scheduled", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(freshIncrementalConnectorRow("2026-09-25T09:00:00.000Z"));
    // A VIRTUAL clock that only advances when a page is actually fetched (2
    // minutes "cost" per page) — deliberately decoupled from how many
    // *other*, incidental now() calls the production code happens to make
    // elsewhere in the run (lease timestamps, ingestedAt, etc.), so this
    // test does not silently miscalibrate if unrelated code changes. The
    // deadline is blown a few pages in, well short of the 100-page cap.
    const virtualNow = { current: new Date("2026-09-25T10:00:00.000Z").getTime() };
    const clock = () => new Date(virtualNow.current);
    const fullPage = () => Array.from({ length: 1000 }, (_, i) => emptyEntityBody(`deadline-${i}`));
    const queryMock = vi.fn(async (entity: string, opts: { startPosition: number; maxResults: number }) => {
      virtualNow.current += 2 * 60_000; // each fetched page "costs" 2 minutes of wall-clock
      return { entity, items: fullPage(), startPosition: opts.startPosition, maxResults: opts.maxResults };
    });
    const client = fakeClient({
      query: queryMock as unknown as QboClient["query"],
      cdc: vi.fn(async () => ({
        entities: [{ entity: "Invoice", changed: [], deleted: [], truncated: true }],
        serverTime: "2026-09-25T10:00:00.000Z",
      })) as unknown as QboClient["cdc"],
    });

    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f19-deadline",
      budgetMs: 5 * 60_000, // 5 minutes — blown after ~3 pages (6 minutes of virtual cost), nowhere near the 100-page cap
      deps: { createClient: async () => client, now: clock },
    });

    expect(result.status).toBe("PARTIAL_FAILURE");
    expect(queryMock.mock.calls.length).toBeGreaterThan(0); // real progress was made before stopping
    expect(queryMock.mock.calls.length).toBeLessThan(100); // proves it did NOT run out via the page cap
    const cursorUpdate = txOwnerConnectorUpdate.mock.calls.find((c) => (c[0] as { data?: { syncState?: { cdcCursor?: string } } }).data?.syncState?.cdcCursor);
    expect((cursorUpdate![0] as { data: { syncState: { cdcCursor: string } } }).data.syncState.cdcCursor).toBe("2026-09-25T09:00:00.000Z");
    expect(scheduledTaskCreate.mock.calls.some((c) => (c[0] as { data: { idempotencyKey: string } }).data.idempotencyKey === buildSyncContinuationIdempotencyKey(CONNECTOR, "run-f19-deadline"))).toBe(true);
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
    // F25: persisted inside a transaction (atomically with syncState), not a bare db.ownerConnector.update.
    expect(txOwnerConnectorUpdate).toHaveBeenCalledWith(
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

  // F26 (diagnostic): a QboApiError with kind FORBIDDEN (the classification an
  // HTTP 403 response maps to — see classifyQboHttpFailure in qbo-errors.ts)
  // must be non-retryable and return FAILED, never rethrow. `retryable` on
  // QboApiError is true only for RATE_LIMITED/TRANSIENT/TIMEOUT, so this proves
  // the classification/rethrow branch in THIS file is correct for a 403.
  it("F26 — a FORBIDDEN (HTTP 403) failure returns FAILED without throwing — proves the retry path is NOT reached for a 403", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f26",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("FAILED");
    expect(scheduledTaskCreate).not.toHaveBeenCalled(); // no continuation/retry task was scheduled
  });

  // F26 root cause: client construction (deps.createClient / the real
  // createQboClient + its tokenProvider's own credential fetch) used to run
  // OUTSIDE the try/catch that classifies failures — any error there escaped
  // runQuickBooksSync as an UNCAUGHT throw, which the scheduler recorded as
  // a generic retryable failure even for a definite, non-retryable error.
  it("F26 root cause — a FORBIDDEN failure during CLIENT CONSTRUCTION (not a client method call) is also classified and returns FAILED, never an uncaught throw", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f26-construct",
      deps: {
        createClient: async () => {
          throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
        },
        now: () => new Date("2026-09-25T10:00:00.000Z"),
      },
    });
    expect(result.status).toBe("FAILED");
    expect(scheduledTaskCreate).not.toHaveBeenCalled();
    // The lease must still be released even though the failure happened before any client call.
    const releaseCall = ownerConnectorUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { syncLeaseExpiresAt?: unknown } }).data?.syncLeaseExpiresAt === null
    );
    expect(releaseCall).toBeDefined();
  });

  // F25 — a failed run must leave syncState.lastRunStatus/lastRunAt/lastRunSummary
  // consistent with (never contradicting) OwnerConnector.syncFailureMessage,
  // persisted in ONE transaction.
  it("F25 — a FAILED run persists syncState.lastRunStatus=FAILED and lastRunSummary atomically with syncFailureMessage", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f25",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("FAILED");

    // Both writes happen inside the SAME db.$transaction call (atomic) —
    // both txOwnerConnectorUpdate calls below only exist because dbTransaction
    // ran its callback against the shared tx mock exactly once for this failure.
    expect(dbTransaction).toHaveBeenCalledTimes(1);

    expect(txOwnerConnectorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncFailureMessage: expect.stringContaining("403") }) })
    );
    const syncStateCall = txOwnerConnectorUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { syncState?: { lastRunStatus?: string } } }).data?.syncState?.lastRunStatus === "FAILED"
    );
    expect(syncStateCall).toBeDefined();
    const data = (syncStateCall![0] as { data: { syncState: { lastRunStatus: string; lastRunSummary: string; lastRunId: string; lastRunAt: string } } }).data;
    expect(data.syncState.lastRunSummary).toContain("403");
    expect(data.syncState.lastRunId).toBe("run-f25");
    expect(data.syncState.lastRunAt).toBeTruthy();
  });

  // F27/F28 — non-retryable classifications return FAILED (never throw).
  it.each([
    ["FORBIDDEN", 403],
    ["VALIDATION", 400],
    ["NOT_FOUND", 404],
    ["DUPLICATE", 400],
    ["STALE_OBJECT", 400],
    ["MALFORMED", 200],
    ["CONFIG", null],
  ] as const)("a %s failure returns FAILED without throwing", async (kind, httpStatus) => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind, message: `classified as ${kind}`, httpStatus });
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: `run-${kind}`,
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("FAILED");
  });

  it("AUTH failure returns FAILED and never touches the connector's `status` column (the token layer alone governs REFRESH_FAILED)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "AUTH", message: "invalid_grant" });
      }),
    });
    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-auth-status",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });
    expect(result.status).toBe("FAILED");
    for (const call of txOwnerConnectorUpdate.mock.calls) {
      expect((call[0] as { data?: Record<string, unknown> }).data).not.toHaveProperty("status");
    }
  });

  // F27/F28 — retryable classifications still throw (unchanged).
  it.each(["TRANSIENT", "RATE_LIMITED", "TIMEOUT"] as const)("a %s failure still throws so the scheduler retries", async (kind) => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind, message: `classified as ${kind}` });
      }),
    });
    await expect(
      runQuickBooksSync({
        workspaceId: WORKSPACE,
        connectorId: CONNECTOR,
        trigger: "SCHEDULED",
        requestedBy: ACTOR,
        runId: `run-${kind}`,
        deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
      })
    ).rejects.toThrow();
  });

  // F28 — a local durability failure (the FAILED-state persistence tx itself
  // rejects) must THROW an owner-safe error, never return FAILED — a
  // classified-terminal outcome we could not even record must default to
  // "the scheduler retries", not "definitely, permanently failed".
  it("F28 — when persisting the FAILED outcome itself fails (transaction rejects), THROWS an owner-safe durability error instead of returning FAILED", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow());
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
      }),
    });
    dbTransaction.mockImplementationOnce(async () => {
      throw new Error("connection terminated unexpectedly"); // simulated Prisma failure — must never leak into the thrown message
    });

    await expect(
      runQuickBooksSync({
        workspaceId: WORKSPACE,
        connectorId: CONNECTOR,
        trigger: "SCHEDULED",
        requestedBy: ACTOR,
        runId: "run-f28",
        deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
      })
    ).rejects.toThrow(/could not be recorded/i);

    // The lease must still be released even on this path.
    const releaseCall = ownerConnectorUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { syncLeaseExpiresAt?: unknown } }).data?.syncLeaseExpiresAt === null
    );
    expect(releaseCall).toBeDefined();
  });

  // F16 — a governed re-evaluation trigger failure must never be silently
  // swallowed into just a log line: it must be durable (audit payload flag)
  // and owner-visible (a note in the persisted lastRunSummary).
  it("F16 — when the CONNECTOR_SYNC_FAILED re-evaluation trigger fails, it is folded into lastRunSummary and the audit payload (never silently dropped)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow({ businessId: "biz-1" }));
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
      }),
    });
    ingestIntegrationEvent.mockRejectedValueOnce(new Error("integration event ingestion unavailable"));

    const result = await runQuickBooksSync({
      workspaceId: WORKSPACE,
      connectorId: CONNECTOR,
      trigger: "SCHEDULED",
      requestedBy: ACTOR,
      runId: "run-f16",
      deps: { createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") },
    });

    expect(result.status).toBe("FAILED");
    expect(ingestIntegrationEvent).toHaveBeenCalledTimes(1); // attempted exactly once, never retried inline

    // Durable + visible: the audit payload carries the flag.
    const failedAudit = emitAuditEvent.mock.calls.find(
      (c) => (c[0] as { eventName?: string }).eventName === "quickbooks.sync_failed"
    );
    expect(failedAudit).toBeDefined();
    expect((failedAudit![0] as { payload?: { reevaluationTriggerFailed?: boolean } }).payload?.reevaluationTriggerFailed).toBe(true);

    // Owner-visible: the persisted lastRunSummary carries an explicit note.
    const syncStateCall = txOwnerConnectorUpdate.mock.calls.find(
      (c) => (c[0] as { data?: { syncState?: { lastRunSummary?: string } } }).data?.syncState?.lastRunSummary
    );
    expect(syncStateCall).toBeDefined();
    const summary = (syncStateCall![0] as { data: { syncState: { lastRunSummary: string } } }).data.syncState.lastRunSummary;
    expect(summary).toMatch(/re-evaluation could not be queued/i);
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
    // The PRODUCTION handler (no injected deps) exercises the real createQboClient
    // path, which fails fast in this unit environment — that's fine, we only
    // assert the workspace used to acquire the sync lease before that point.
    await quickBooksSyncTaskHandler(
      { connectorId: CONNECTOR, trigger: "MANUAL", requestedBy: ACTOR },
      { taskId: "t1", taskName: "quickbooks-sync", workspaceId: WORKSPACE, attempt: 1 }
    ).catch(() => {
      /* creating the real client will fail without full env/token wiring in this unit test — we only assert the lease-acquire call below */
    });
    expect(ownerConnectorUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WORKSPACE, id: CONNECTOR }) })
    );
  });

  // F27 — deterministic, via the buildQuickBooksSyncTaskHandler(deps) test seam
  // (a fake QboClient, no real QBO/token-service dependency).
  it("F27 — maps a FAILED runQuickBooksSync outcome to HandlerResult {status:'FAILED'} — does NOT throw", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow({ workspaceId: WORKSPACE }));
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
      }),
    });
    const handler = buildQuickBooksSyncTaskHandler({ createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") });

    const result = await handler(
      { connectorId: CONNECTOR, trigger: "SCHEDULED", requestedBy: ACTOR },
      { taskId: "t-f27", taskName: "quickbooks-sync", workspaceId: WORKSPACE, attempt: 1 }
    );

    expect(result).toMatchObject({ status: "FAILED" });
    expect((result as { summary?: string }).summary).toBeTruthy();
  });

  it("F27 — a retryable (TRANSIENT) runQuickBooksSync failure still propagates as a thrown error (scheduler retries)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow({ workspaceId: WORKSPACE }));
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "TRANSIENT", message: "server error" });
      }),
    });
    const handler = buildQuickBooksSyncTaskHandler({ createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") });

    await expect(
      handler(
        { connectorId: CONNECTOR, trigger: "SCHEDULED", requestedBy: ACTOR },
        { taskId: "t-f27-retry", taskName: "quickbooks-sync", workspaceId: WORKSPACE, attempt: 1 }
      )
    ).rejects.toThrow();
  });

  it("F28 — a durability failure while persisting FAILED state propagates as a thrown error through the handler too (scheduler retries)", async () => {
    ownerConnectorFindFirst.mockResolvedValueOnce(connectorRow({ workspaceId: WORKSPACE }));
    const client = fakeClient({
      companyInfo: vi.fn(async () => {
        throw new QboApiError({ kind: "FORBIDDEN", message: "QuickBooks request failed (HTTP 403)", httpStatus: 403 });
      }),
    });
    dbTransaction.mockImplementationOnce(async () => {
      throw new Error("connection terminated unexpectedly");
    });
    const handler = buildQuickBooksSyncTaskHandler({ createClient: async () => client, now: () => new Date("2026-09-25T10:00:00.000Z") });

    await expect(
      handler(
        { connectorId: CONNECTOR, trigger: "SCHEDULED", requestedBy: ACTOR },
        { taskId: "t-f28", taskName: "quickbooks-sync", workspaceId: WORKSPACE, attempt: 1 }
      )
    ).rejects.toThrow(/could not be recorded/i);
  });
});
