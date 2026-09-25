/**
 * qbo-materialize.service — unit proof (mocked db + governed snapshot services).
 *
 * Proves: create when no snapshot exists; amend when the current snapshot is
 * OUR linked snapshot and values differ; leave an owner-entered snapshot
 * alone; skip everything (never convert) on a currency mismatch; cashflow is
 * create-only (skip with an issue when one already exists, whether ours or
 * the owner's).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "crypto";

const getBusiness = vi.fn();
vi.mock("@/services/founder-recovery/business.service", () => ({ getBusiness: (...a: unknown[]) => getBusiness(...a) }));

const deriveSnapshotInputsFromReports = vi.fn();
vi.mock("@/domain/quickbooks/qbo-derivation", () => ({
  deriveSnapshotInputsFromReports: (...a: unknown[]) => deriveSnapshotInputsFromReports(...a),
}));

const createFinancialSnapshot = vi.fn();
const amendFinancialSnapshot = vi.fn();
const resolveCurrentSnapshotId = vi.fn();
const rowToFinanceInput = vi.fn();
vi.mock("@/services/owner-finance/snapshot.service", () => ({
  createFinancialSnapshot: (...a: unknown[]) => createFinancialSnapshot(...a),
  amendFinancialSnapshot: (...a: unknown[]) => amendFinancialSnapshot(...a),
  resolveCurrentSnapshotId: (...a: unknown[]) => resolveCurrentSnapshotId(...a),
  rowToFinanceInput: (...a: unknown[]) => rowToFinanceInput(...a),
}));

const createCashflowSnapshot = vi.fn();
vi.mock("@/services/owner-cashflow/snapshot.service", () => ({
  createCashflowSnapshot: (...a: unknown[]) => createCashflowSnapshot(...a),
}));

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

const ingestIntegrationEvent = vi.fn(async () => ({}));
vi.mock("@/services/integration-fabric/integration-event.service", () => ({
  ingestIntegrationEvent: (...a: unknown[]) => ingestIntegrationEvent(...a),
}));

const ownerFinancialSnapshotFindFirst = vi.fn();
const ownerCashflowSnapshotFindFirst = vi.fn();
const ownerConnectorRecordFindFirst = vi.fn();
const ownerConnectorRecordUpsert = vi.fn(async () => ({}));
const ownerConnectorFindFirst = vi.fn(async () => ({ externalAccountId: "789012345" }));

const dbMock = {
  ownerFinancialSnapshot: { findFirst: (...a: unknown[]) => ownerFinancialSnapshotFindFirst(...a) },
  ownerCashflowSnapshot: { findFirst: (...a: unknown[]) => ownerCashflowSnapshotFindFirst(...a) },
  ownerConnectorRecord: {
    findFirst: (...a: unknown[]) => ownerConnectorRecordFindFirst(...a),
    upsert: (...a: unknown[]) => ownerConnectorRecordUpsert(...a),
  },
  ownerConnector: { findFirst: (...a: unknown[]) => ownerConnectorFindFirst(...a) },
};

// DC-20 (vitest.setup.ts contract): every "@/lib/db" mock factory must also export getDbInstance.
vi.mock("@/lib/db", () => ({ db: dbMock, getDbInstance: vi.fn().mockResolvedValue(dbMock) }));

import { materializeQuickBooksSnapshots } from "@/services/quickbooks/qbo-materialize.service";

const WORKSPACE = randomUUID();
const CONNECTOR = randomUUID();
const BUSINESS = randomUUID();
const ACTOR = randomUUID();

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE,
    connectorId: CONNECTOR,
    businessId: BUSINESS,
    actorId: ACTOR,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    reports: { profitAndLoss: {}, balanceSheet: {}, agedReceivables: {}, agedPayables: {} },
    homeCurrency: "USD",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getBusiness.mockResolvedValue({ id: BUSINESS, currency: "USD" });
  deriveSnapshotInputsFromReports.mockReturnValue({
    financial: { periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "USD", revenue: 10000, cashOnHand: 5000 },
    cashflow: { periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "USD", bankBalance: 5000 },
    issues: [],
    sourceReports: ["ProfitAndLoss"],
  });
  ownerFinancialSnapshotFindFirst.mockResolvedValue(null);
  ownerCashflowSnapshotFindFirst.mockResolvedValue(null);
  ownerConnectorRecordFindFirst.mockResolvedValue(null);
  ownerConnectorFindFirst.mockResolvedValue({ externalAccountId: "789012345" });
  createFinancialSnapshot.mockResolvedValue({ id: "fin-new" });
  createCashflowSnapshot.mockResolvedValue({ id: "cf-new" });
});

describe("[unit] materializeQuickBooksSnapshots", () => {
  it("skips both financial and cashflow on a currency mismatch — never converts", async () => {
    getBusiness.mockResolvedValueOnce({ id: BUSINESS, currency: "INR" });
    const result = await materializeQuickBooksSnapshots(baseInput({ homeCurrency: "USD" }));
    expect(result.financial).toBe("SKIPPED");
    expect(result.cashflow).toBe("SKIPPED");
    expect(result.issues[0]).toMatch(/currency/i);
    expect(createFinancialSnapshot).not.toHaveBeenCalled();
    expect(createCashflowSnapshot).not.toHaveBeenCalled();
  });

  it("creates a new financial and cashflow snapshot and links both when none exist", async () => {
    const result = await materializeQuickBooksSnapshots(baseInput());
    expect(result.financial).toBe("CREATED");
    expect(result.cashflow).toBe("CREATED");
    expect(createFinancialSnapshot).toHaveBeenCalledWith(
      BUSINESS,
      expect.objectContaining({ periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "USD", revenue: 10000 }),
      ACTOR,
      WORKSPACE
    );
    expect(createCashflowSnapshot).toHaveBeenCalledTimes(1);
    // Two links written: financial + cashflow.
    expect(ownerConnectorRecordUpsert).toHaveBeenCalledTimes(2);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "quickbooks.snapshot_materialized" }));
    expect(ingestIntegrationEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "ACCOUNTING_PL_SYNCED" }), ACTOR);
  });

  it("amends the existing snapshot when it is OUR linked snapshot and values differ", async () => {
    ownerFinancialSnapshotFindFirst.mockResolvedValue({ id: "fin-current" });
    ownerConnectorRecordFindFirst.mockResolvedValue({ opsiqEntityId: "fin-current" });
    resolveCurrentSnapshotId.mockResolvedValue("fin-current");
    rowToFinanceInput.mockReturnValue({ revenue: 9000, cashOnHand: 5000 }); // revenue differs (10000 vs 9000), cashOnHand same
    amendFinancialSnapshot.mockResolvedValue({ snapshot: { id: "fin-amended" }, previousSnapshotId: "fin-current" });

    const result = await materializeQuickBooksSnapshots(baseInput());
    expect(result.financial).toBe("AMENDED");
    expect(amendFinancialSnapshot).toHaveBeenCalledWith(
      "fin-current",
      expect.objectContaining({ amendmentReason: expect.stringContaining("QuickBooks sync"), revenue: 10000 }),
      ACTOR,
      WORKSPACE
    );
    // cashOnHand unchanged, so it must NOT be in the amend payload.
    expect(amendFinancialSnapshot.mock.calls[0][1]).not.toHaveProperty("cashOnHand");
  });

  it("reports UNCHANGED (no amend call) when the derived values match the current linked snapshot", async () => {
    ownerFinancialSnapshotFindFirst.mockResolvedValue({ id: "fin-current" });
    ownerConnectorRecordFindFirst.mockResolvedValue({ opsiqEntityId: "fin-current" });
    resolveCurrentSnapshotId.mockResolvedValue("fin-current");
    rowToFinanceInput.mockReturnValue({ revenue: 10000, cashOnHand: 5000 }); // identical to derived
    const result = await materializeQuickBooksSnapshots(baseInput());
    expect(result.financial).toBe("UNCHANGED");
    expect(amendFinancialSnapshot).not.toHaveBeenCalled();
  });

  it("never touches an owner-entered financial snapshot (no link, or link points elsewhere)", async () => {
    ownerFinancialSnapshotFindFirst.mockResolvedValue({ id: "fin-owner-entered" });
    ownerConnectorRecordFindFirst.mockResolvedValue(null); // no link at all → owner-entered
    const result = await materializeQuickBooksSnapshots(baseInput());
    expect(result.financial).toBe("SKIPPED");
    expect(result.issues.some((i) => /owner-entered/i.test(i))).toBe(true);
    expect(amendFinancialSnapshot).not.toHaveBeenCalled();
    expect(createFinancialSnapshot).not.toHaveBeenCalled();
  });

  it("skips cashflow (with an issue) when a cashflow snapshot for the period already exists — no amendment path", async () => {
    ownerCashflowSnapshotFindFirst.mockResolvedValue({ id: "cf-existing" });
    const result = await materializeQuickBooksSnapshots(baseInput());
    expect(result.cashflow).toBe("SKIPPED");
    expect(result.issues.some((i) => /cashflow snapshot for/i.test(i))).toBe(true);
    expect(createCashflowSnapshot).not.toHaveBeenCalled();
  });

  it("carries derivation issues through even when a snapshot is created", async () => {
    deriveSnapshotInputsFromReports.mockReturnValue({
      financial: { periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "USD", revenue: 10000 },
      cashflow: { periodStart: "2026-08-01", periodEnd: "2026-08-31", currency: "USD" },
      issues: ["BalanceSheet report not supplied — cashOnHand/bankBalance not derived"],
      sourceReports: ["ProfitAndLoss"],
    });
    const result = await materializeQuickBooksSnapshots(baseInput());
    expect(result.issues).toContain("BalanceSheet report not supplied — cashOnHand/bankBalance not derived");
  });
});
