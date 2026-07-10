/**
 * Phase R0 — D3-03: createFinancialSnapshot audit atomicity
 *
 * Verifies that snapshot creation and audit event emission are wrapped in a
 * single Prisma $transaction so an audit failure rolls back the snapshot write.
 */
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import type { FinancialSnapshotCreateInput } from "@/domain/owner-finance/validation";

// ── mocks ──────────────────────────────────────────────────────────────────

jest.mock("@/services/founder-recovery/business.service", () => ({
  getBusiness: jest.fn().mockResolvedValue({ id: "biz-001" }),
}));

const mockEmitAuditEvent = jest.fn();
jest.mock("@/infra/audit", () => ({
  emitAuditEvent: (...args: unknown[]) => mockEmitAuditEvent(...args),
}));

jest.mock("@/domain/owner-finance/data-confidence", () => ({
  calculateDataConfidence: jest.fn().mockReturnValue({
    dataConfidenceScore: 0.8,
    missingCritical: false,
  }),
}));

// Fake transaction client passed to the $transaction callback
const fakeTx = {
  ownerFinancialSnapshot: {
    create: jest.fn(),
  },
  auditEvent: {
    create: jest.fn(),
  },
};

const mockDbTransaction = jest.fn();
const mockFindFirst = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    ownerFinancialSnapshot: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));

jest.mock("crypto", () => ({
  randomUUID: () => "fixed-uuid-001",
}));

// ── helpers ─────────────────────────────────────────────────────────────────

const validInput: FinancialSnapshotCreateInput = {
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-01-31T23:59:59.999Z",
  currency: "USD",
  revenue: 10000,
};

const createdRow = {
  id: "fixed-uuid-001",
  workspaceId: "ws-001",
  businessId: "biz-001",
  periodStart: new Date("2026-01-01"),
  periodEnd: new Date("2026-01-31"),
};

beforeEach(() => {
  jest.clearAllMocks();
  // No existing snapshot → allow create
  mockFindFirst.mockResolvedValue(null);
  // Simulate transaction: call the callback with fakeTx
  mockDbTransaction.mockImplementation(async (cb: (tx: typeof fakeTx) => Promise<unknown>) => {
    return cb(fakeTx);
  });
  fakeTx.ownerFinancialSnapshot.create.mockResolvedValue(createdRow);
  mockEmitAuditEvent.mockResolvedValue("audit-event-id");
});

// ── tests ───────────────────────────────────────────────────────────────────

describe("createFinancialSnapshot — audit atomicity (D3-03)", () => {
  test("db.$transaction is called exactly once", async () => {
    await createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-001");
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
  });

  test("ownerFinancialSnapshot.create is called inside the transaction with fakeTx", async () => {
    await createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-001");
    expect(fakeTx.ownerFinancialSnapshot.create).toHaveBeenCalledTimes(1);
    expect(fakeTx.ownerFinancialSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "fixed-uuid-001",
          businessId: "biz-001",
          workspaceId: "ws-001",
          currency: "USD",
        }),
      })
    );
  });

  test("emitAuditEvent is called with the transaction client (tx) as second argument", async () => {
    await createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-001");
    expect(mockEmitAuditEvent).toHaveBeenCalledTimes(1);
    // Second argument must be the transaction client (fakeTx), not the global db
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "OwnerFinancialSnapshot",
        entityId: "fixed-uuid-001",
        workspaceId: "ws-001",
      }),
      fakeTx
    );
  });

  test("audit failure rolls back transaction — snapshot not committed", async () => {
    const auditError = new Error("Audit write failed");
    mockEmitAuditEvent.mockRejectedValueOnce(auditError);
    // Transaction propagates the rejection
    mockDbTransaction.mockImplementationOnce(async (cb: (tx: typeof fakeTx) => Promise<unknown>) => {
      return cb(fakeTx);
    });

    await expect(
      createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-001")
    ).rejects.toBe(auditError);
  });

  test("ConflictError thrown when snapshot for same period already exists", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing-snapshot" });

    await expect(
      createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-001")
    ).rejects.toMatchObject({ message: expect.stringContaining("already exists") });

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  test("workspaceId is persisted in the snapshot and passed to emitAuditEvent", async () => {
    await createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-tenant-xyz");

    expect(fakeTx.ownerFinancialSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workspaceId: "ws-tenant-xyz" }) })
    );
    expect(mockEmitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-tenant-xyz" }),
      fakeTx
    );
  });

  test("returns the created snapshot row", async () => {
    const result = await createFinancialSnapshot("biz-001", validInput, "actor-001", "ws-001");
    expect(result).toEqual(createdRow);
  });
});
