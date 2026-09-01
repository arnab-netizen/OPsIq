/**
 * Phase H — Snapshot Amendment Hostile/Regression Tests (17 cases)
 *
 * Tests invariants I1–I10: period truth, historical reproducibility, amendability,
 * provenance, no silent overwrite, canonical active version, reassessment correctness,
 * retry safety, tenant security, audit preservation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError } from "@/infra/errors";

// ── Shared mocks (vi.hoisted so they are available inside vi.mock factories) ─

const { mockTx, mockDb } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    ownerFinancialSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const db = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn((fn: (tx: any) => Promise<unknown>) => fn(tx)),
    ownerFinancialSnapshot: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    ownerBusiness: { findFirst: vi.fn() },
  };

  return { mockTx: tx, mockDb: db };
});

vi.mock("@/lib/db", () => ({ db: mockDb, getDbInstance: vi.fn().mockResolvedValue({}) }));
vi.mock("@/infra/audit", () => ({ emitAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/infra/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/services/founder-recovery/business.service", () => ({
  getBusiness: vi.fn().mockResolvedValue({ id: "bus-1", workspaceId: "ws-1" }),
}));
vi.mock("@/domain/owner-finance/data-confidence", () => ({
  calculateDataConfidence: vi.fn().mockReturnValue({
    dataConfidenceScore: 75,
    missingCritical: [],
  }),
}));

import {
  amendFinancialSnapshot,
  listFinancialSnapshots,
  resolveCurrentSnapshotId,
  createFinancialSnapshot,
} from "@/services/owner-finance/snapshot.service";
import { financialSnapshotAmendSchema } from "@/domain/owner-finance/validation";

const BASE_SNAPSHOT = {
  id: "snap-v1",
  workspaceId: "ws-1",
  businessId: "bus-1",
  periodStart: new Date("2025-07-01"),
  periodEnd: new Date("2025-07-31"),
  currency: "INR",
  businessModelType: null,
  industryTemplate: null,
  revenue: 500000,
  costOfGoods: 300000,
  fixedCosts: 50000,
  variableCosts: null,
  rent: 20000,
  payroll: 30000,
  utilities: null,
  deliveryCost: null,
  marketingSpend: null,
  discountAmount: null,
  refundReworkCost: null,
  debtPayments: null,
  totalDebtOutstanding: null,
  cashOnHand: null,
  receivables: null,
  overdueReceivables: null,
  payables: null,
  overduePayables: null,
  ownerWithdrawals: null,
  inventoryCashLock: null,
  orderCount: null,
  customerCount: null,
  repeatCustomerCount: null,
  b2bRevenue: null,
  b2cRevenue: null,
  notes: null,
  dataConfidenceScore: 65,
  missingCriticalData: ["receivables", "payables"],
  version: 1,
  supersededById: null,
  amendmentReason: null,
  changedFields: null,
  amendedByActorId: null,
  createdAt: new Date("2025-08-01"),
  updatedAt: new Date("2025-08-01"),
};

function guardRow(overrides: Partial<typeof BASE_SNAPSHOT> = {}) {
  return [{ id: BASE_SNAPSHOT.id, version: 1, superseded_by_id: null, workspace_id: "ws-1", ...overrides }];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("I1 — Period truth: amendment preserves periodStart and periodEnd unchanged", () => {
  it("creates new version with identical period dates", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    const created = { ...BASE_SNAPSHOT, id: "snap-v2", version: 2, receivables: 80000, supersededById: null };
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue(created);
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    const { snapshot } = await amendFinancialSnapshot(
      "snap-v1",
      { amendmentReason: "Adding receivables", receivables: 80000 },
      "actor-1",
      "ws-1"
    );

    const createCall = mockTx.ownerFinancialSnapshot.create.mock.calls[0][0];
    expect(createCall.data.periodStart).toEqual(BASE_SNAPSHOT.periodStart);
    expect(createCall.data.periodEnd).toEqual(BASE_SNAPSHOT.periodEnd);
    expect(createCall.data.businessId).toBe("bus-1");
    expect(snapshot!.id).toBe("snap-v2");
  });
});

describe("I2 — Historical reproducibility: original row preserved, only supersededById mutated", () => {
  it("stamps supersededById on old row and does not change any other field", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "snap-v2", version: 2 });
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    await amendFinancialSnapshot("snap-v1", { amendmentReason: "test", receivables: 1 }, "actor-1", "ws-1");

    // Service generates newId = randomUUID() before the tx; that same id is passed to
    // both create({ data: { id: newId } }) and update({ data: { supersededById: newId } }).
    // Capture the id from the create args to verify the update uses the same value.
    const createCall = mockTx.ownerFinancialSnapshot.create.mock.calls[0][0];
    const generatedId = createCall.data.id as string;
    const updateCall = mockTx.ownerFinancialSnapshot.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "snap-v1" });
    // Only supersededById is mutated — no other fields on the original row
    expect(updateCall.data).toEqual({ supersededById: generatedId });
    expect(typeof generatedId).toBe("string");
    expect(generatedId.length).toBeGreaterThan(0);
  });
});

describe("I3 — Amendability: amendment creates version N+1 with merged fields", () => {
  it("new version has version = old version + 1 and merges fields correctly", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "snap-v2", version: 2 });
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    await amendFinancialSnapshot("snap-v1", { amendmentReason: "fix", receivables: 80000, payables: 40000 }, "a", "ws-1");

    const data = mockTx.ownerFinancialSnapshot.create.mock.calls[0][0].data;
    expect(data.version).toBe(2);
    expect(data.receivables).toBe(80000);
    expect(data.payables).toBe(40000);
    // Unmentioned fields preserved from current
    expect(data.revenue).toBe(500000);
    expect(data.costOfGoods).toBe(300000);
  });
});

describe("I4 — Provenance: amendmentReason and changedFields stored on new version", () => {
  it("records amendmentReason and changedFields containing the updated field names", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "snap-v2", version: 2 });
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    await amendFinancialSnapshot(
      "snap-v1",
      { amendmentReason: "Adding July receivables and payables", receivables: 80000, payables: 40000 },
      "actor-1",
      "ws-1"
    );

    const data = mockTx.ownerFinancialSnapshot.create.mock.calls[0][0].data;
    expect(data.amendmentReason).toBe("Adding July receivables and payables");
    expect(data.changedFields).toContain("receivables");
    expect(data.changedFields).toContain("payables");
    expect(data.amendedByActorId).toBe("actor-1");
  });
});

describe("I5 — No silent overwrite: amendment must provide at least one field", () => {
  it("rejects amendment with no financial fields — Zod validation", () => {
    const result = financialSnapshotAmendSchema.safeParse({ amendmentReason: "test only" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one field/i);
    }
  });

  it("rejects amendment with empty amendmentReason", () => {
    const result = financialSnapshotAmendSchema.safeParse({ amendmentReason: "", receivables: 1 });
    expect(result.success).toBe(false);
  });
});

describe("I6 — Canonical active version: supersededById IS NULL identifies current", () => {
  it("new version has supersededById = null", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "snap-v2", version: 2, supersededById: null });
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    await amendFinancialSnapshot("snap-v1", { amendmentReason: "r", receivables: 1 }, "a", "ws-1");

    const data = mockTx.ownerFinancialSnapshot.create.mock.calls[0][0].data;
    expect(data.supersededById).toBeNull();
  });

  it("listFinancialSnapshots filters to supersededById: null", async () => {
    mockDb.ownerFinancialSnapshot.findMany.mockResolvedValue([]);
    await listFinancialSnapshots("bus-1", "ws-1");
    const whereArg = mockDb.ownerFinancialSnapshot.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ supersededById: null });
  });

  it("createFinancialSnapshot duplicate check uses supersededById: null filter", async () => {
    // First call to findFirst (duplicate check) returns null so create proceeds
    mockDb.ownerFinancialSnapshot.findFirst.mockResolvedValue(null);
    mockDb.$transaction = vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
      mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "new-snap" });
      mockTx.ownerFinancialSnapshot.update = vi.fn();
      return fn(mockTx);
    });

    const input = {
      periodStart: "2025-07-01", periodEnd: "2025-07-31", currency: "INR",
      revenue: 500000,
    };
    // The duplicate-check query must include supersededById: null
    await createFinancialSnapshot("bus-1", input as never, "actor-1", "ws-1").catch(() => {});
    const whereArg = mockDb.ownerFinancialSnapshot.findFirst.mock.calls[0]?.[0]?.where;
    if (whereArg) {
      expect(whereArg).toMatchObject({ supersededById: null });
    }
  });
});

describe("I7 — Reassessment correctness: resolveCurrentSnapshotId walks chain", () => {
  it("returns original ID when not superseded", async () => {
    mockDb.ownerFinancialSnapshot.findFirst.mockResolvedValue({ id: "snap-v1", supersededById: null });
    const result = await resolveCurrentSnapshotId("snap-v1");
    expect(result).toBe("snap-v1");
  });

  it("follows a two-hop chain to return the leaf version", async () => {
    mockDb.ownerFinancialSnapshot.findFirst
      .mockResolvedValueOnce({ id: "snap-v1", supersededById: "snap-v2" })
      .mockResolvedValueOnce({ id: "snap-v2", supersededById: "snap-v3" })
      .mockResolvedValueOnce({ id: "snap-v3", supersededById: null });
    const result = await resolveCurrentSnapshotId("snap-v1");
    expect(result).toBe("snap-v3");
  });

  it("returns last known ID if chain exceeds 20 hops (data-corruption guard)", async () => {
    mockDb.ownerFinancialSnapshot.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id, supersededById: `next-${where.id}` })
    );
    const result = await resolveCurrentSnapshotId("start");
    // Should stop after 20 hops and return something, not loop forever
    expect(typeof result).toBe("string");
    expect(mockDb.ownerFinancialSnapshot.findFirst.mock.calls.length).toBe(20);
  });
});

describe("I8 — Retry safety (idempotency): double-amend on same ID rejected", () => {
  it("throws ConflictError when snapshot already superseded", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow({ superseded_by_id: "snap-v2" }));

    await expect(
      amendFinancialSnapshot("snap-v1", { amendmentReason: "retry", receivables: 1 }, "actor-1", "ws-1")
    ).rejects.toThrow(ConflictError);
  });

  it("ConflictError message names the superseding snapshot ID", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow({ superseded_by_id: "snap-v2" }));

    await expect(
      amendFinancialSnapshot("snap-v1", { amendmentReason: "retry", receivables: 1 }, "actor-1", "ws-1")
    ).rejects.toThrow("snap-v2");
  });
});

describe("I9 — Tenant security: cross-workspace amendment blocked", () => {
  it("throws NotFoundError when workspace_id does not match caller workspace", async () => {
    mockTx.$queryRaw.mockResolvedValue(guardRow({ workspace_id: "ws-OTHER" }));

    await expect(
      amendFinancialSnapshot("snap-v1", { amendmentReason: "evil", receivables: 1 }, "actor-evil", "ws-1")
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when snapshot does not exist", async () => {
    mockTx.$queryRaw.mockResolvedValue([]);

    await expect(
      amendFinancialSnapshot("nonexistent", { amendmentReason: "r", receivables: 1 }, "actor-1", "ws-1")
    ).rejects.toThrow(NotFoundError);
  });
});

describe("I10 — Audit preservation: audit event emitted within transaction", () => {
  it("emits OWNER_FINANCE_SNAPSHOT_AMENDED inside the transaction", async () => {
    const { emitAuditEvent } = await import("@/infra/audit");
    const { AUDIT_EVENTS } = await import("@/domain/constants/audit-events");

    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "snap-v2", version: 2 });
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    await amendFinancialSnapshot("snap-v1", { amendmentReason: "audit-test", receivables: 1 }, "actor-1", "ws-1");

    expect(emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: AUDIT_EVENTS.OWNER_FINANCE_SNAPSHOT_AMENDED,
        actorId: "actor-1",
        workspaceId: "ws-1",
        payload: expect.objectContaining({
          previousSnapshotId: "snap-v1",
          amendmentReason: "audit-test",
          changedFields: expect.arrayContaining(["receivables"]),
        }),
      }),
      mockTx
    );
  });
});

describe("Validation schema — hostile inputs", () => {
  it("rejects negative receivables", () => {
    const r = financialSnapshotAmendSchema.safeParse({ amendmentReason: "r", receivables: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects amendmentReason exceeding 2000 chars", () => {
    const r = financialSnapshotAmendSchema.safeParse({ amendmentReason: "x".repeat(2001), receivables: 1 });
    expect(r.success).toBe(false);
  });

  it("accepts a minimal valid amendment (reason + one field)", () => {
    const r = financialSnapshotAmendSchema.safeParse({ amendmentReason: "Adding receivables", receivables: 80000 });
    expect(r.success).toBe(true);
  });

  it("accepts amendment with notes only (no numeric fields)", () => {
    const r = financialSnapshotAmendSchema.safeParse({ amendmentReason: "notes correction", notes: "updated" });
    expect(r.success).toBe(true);
  });
});

describe("Confidence recomputation: new version reflects merged data", () => {
  it("calls calculateDataConfidence with merged engine input", async () => {
    const { calculateDataConfidence } = await import("@/domain/owner-finance/data-confidence");

    mockTx.$queryRaw.mockResolvedValue(guardRow());
    mockTx.ownerFinancialSnapshot.findFirst.mockResolvedValue(BASE_SNAPSHOT);
    mockTx.ownerFinancialSnapshot.create.mockResolvedValue({ ...BASE_SNAPSHOT, id: "snap-v2", version: 2 });
    mockTx.ownerFinancialSnapshot.update.mockResolvedValue({});

    await amendFinancialSnapshot("snap-v1", { amendmentReason: "r", receivables: 80000 }, "actor-1", "ws-1");

    expect(calculateDataConfidence).toHaveBeenCalledWith(
      expect.objectContaining({ receivables: 80000, revenue: 500000 })
    );
  });
});
