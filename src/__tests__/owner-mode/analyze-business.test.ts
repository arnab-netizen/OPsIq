/**
 * analyze-business.service.ts — "Analyze my business" orchestration (unit, mocked deps).
 *
 * Covers:
 *  - all three domains eligible -> all analyzed
 *  - a domain with no snapshot -> skipped, not an error
 *  - Finance refused by the in-memory rate limit -> rateLimited, other domains unaffected
 *  - Finance refused by the PG rate limit (in-memory allowed) -> rateLimited
 *  - one domain's diagnosis throws -> failed (with a safe reason, never the raw message),
 *    other domains still run and succeed
 *  - business ownership guard: getBusiness is awaited before any domain is touched
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getBusinessMock = vi.fn(async () => ({ id: "biz1" }));
vi.mock("@/services/founder-recovery/business.service", () => ({
  getBusiness: (...a: unknown[]) => getBusinessMock(...a),
}));

const listFinancialSnapshotsMock = vi.fn();
const runFinanceDiagnosisMock = vi.fn(async () => ({ id: "cycle-finance" }));
vi.mock("@/services/owner-finance/snapshot.service", () => ({
  listFinancialSnapshots: (...a: unknown[]) => listFinancialSnapshotsMock(...a),
}));
vi.mock("@/services/owner-finance/diagnosis.service", () => ({
  runFinanceDiagnosis: (...a: unknown[]) => runFinanceDiagnosisMock(...a),
}));

const listSalesSnapshotsMock = vi.fn();
const runSalesDiagnosisMock = vi.fn(async () => ({ id: "cycle-sales" }));
vi.mock("@/services/owner-sales/snapshot.service", () => ({
  listSalesSnapshots: (...a: unknown[]) => listSalesSnapshotsMock(...a),
}));
vi.mock("@/services/owner-sales/diagnosis.service", () => ({
  runSalesDiagnosis: (...a: unknown[]) => runSalesDiagnosisMock(...a),
}));

const listOperationsSnapshotsMock = vi.fn();
const runOperationsDiagnosisMock = vi.fn(async () => ({ id: "cycle-ops" }));
vi.mock("@/services/owner-operations/snapshot.service", () => ({
  listOperationsSnapshots: (...a: unknown[]) => listOperationsSnapshotsMock(...a),
}));
vi.mock("@/services/owner-operations/diagnosis.service", () => ({
  runOperationsDiagnosis: (...a: unknown[]) => runOperationsDiagnosisMock(...a),
}));

const checkDiagnosisRateLimitMock = vi.fn(() => ({ allowed: true, remaining: 9 }));
vi.mock("@/middleware/rate-limit", () => ({
  checkDiagnosisRateLimit: (...a: unknown[]) => checkDiagnosisRateLimitMock(...a),
}));
const checkPgRateLimitMock = vi.fn(async () => ({ allowed: true }));
vi.mock("@/infra/rate-limiter-pg", () => ({
  checkPgRateLimit: (...a: unknown[]) => checkPgRateLimitMock(...a),
}));

import { analyzeBusiness } from "@/services/owner-mode/analyze-business.service";

const ONE_SNAPSHOT = [{ id: "snap1" }];
const NO_SNAPSHOTS: Array<{ id: string }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  getBusinessMock.mockResolvedValue({ id: "biz1" });
  checkDiagnosisRateLimitMock.mockReturnValue({ allowed: true, remaining: 9 });
  checkPgRateLimitMock.mockResolvedValue({ allowed: true });
});

describe("analyzeBusiness", () => {
  it("analyzes all three domains when each has a snapshot", async () => {
    listFinancialSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listSalesSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listOperationsSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);

    const result = await analyzeBusiness("biz1", "ws1", "actor1");

    expect(result.analyzed.sort()).toEqual(["finance", "operations", "sales"]);
    expect(result.skipped).toEqual([]);
    expect(result.rateLimited).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(runFinanceDiagnosisMock).toHaveBeenCalledWith("biz1", "snap1", "actor1", "ws1");
    expect(runSalesDiagnosisMock).toHaveBeenCalledWith("biz1", "snap1", "actor1", "ws1");
    expect(runOperationsDiagnosisMock).toHaveBeenCalledWith("biz1", "snap1", "actor1", "ws1");
  });

  it("skips a domain with no snapshot -- not an error, others still run", async () => {
    listFinancialSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listSalesSnapshotsMock.mockResolvedValue(NO_SNAPSHOTS);
    listOperationsSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);

    const result = await analyzeBusiness("biz1", "ws1", "actor1");

    expect(result.analyzed.sort()).toEqual(["finance", "operations"]);
    expect(result.skipped).toEqual(["sales"]);
    expect(runSalesDiagnosisMock).not.toHaveBeenCalled();
  });

  it("all three domains with no data -> all skipped, no domain calls made, no error", async () => {
    listFinancialSnapshotsMock.mockResolvedValue(NO_SNAPSHOTS);
    listSalesSnapshotsMock.mockResolvedValue(NO_SNAPSHOTS);
    listOperationsSnapshotsMock.mockResolvedValue(NO_SNAPSHOTS);

    const result = await analyzeBusiness("biz1", "ws1", "actor1");

    expect(result.analyzed).toEqual([]);
    expect(result.skipped.sort()).toEqual(["finance", "operations", "sales"]);
    expect(runFinanceDiagnosisMock).not.toHaveBeenCalled();
    expect(runSalesDiagnosisMock).not.toHaveBeenCalled();
    expect(runOperationsDiagnosisMock).not.toHaveBeenCalled();
  });

  it("Finance refused by the in-memory rate limit -> rateLimited, Sales/Operations unaffected", async () => {
    listFinancialSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listSalesSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listOperationsSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    checkDiagnosisRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 60000 });

    const result = await analyzeBusiness("biz1", "ws1", "actor1");

    expect(result.rateLimited).toEqual(["finance"]);
    expect(runFinanceDiagnosisMock).not.toHaveBeenCalled();
    expect(result.analyzed.sort()).toEqual(["operations", "sales"]);
  });

  it("Finance refused by the PG-backed rate limit (in-memory allowed) -> rateLimited", async () => {
    listFinancialSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listSalesSnapshotsMock.mockResolvedValue(NO_SNAPSHOTS);
    listOperationsSnapshotsMock.mockResolvedValue(NO_SNAPSHOTS);
    checkPgRateLimitMock.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

    const result = await analyzeBusiness("biz1", "ws1", "actor1");

    expect(result.rateLimited).toEqual(["finance"]);
    expect(runFinanceDiagnosisMock).not.toHaveBeenCalled();
  });

  it("one domain's diagnosis throws -> reported in failed with a safe reason, other domains still run", async () => {
    listFinancialSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listSalesSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    listOperationsSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);
    runSalesDiagnosisMock.mockRejectedValueOnce(new Error("some internal detail that must never leak"));

    const result = await analyzeBusiness("biz1", "ws1", "actor1");

    expect(result.failed).toEqual([{ domain: "sales", reason: "Error" }]);
    expect(result.failed[0].reason).not.toContain("internal detail");
    expect(result.analyzed.sort()).toEqual(["finance", "operations"]);
  });

  it("verifies business ownership before touching any domain", async () => {
    getBusinessMock.mockRejectedValueOnce(new Error("NotFoundError"));
    listFinancialSnapshotsMock.mockResolvedValue(ONE_SNAPSHOT);

    await expect(analyzeBusiness("biz1", "ws1", "actor1")).rejects.toThrow();
    expect(listFinancialSnapshotsMock).not.toHaveBeenCalled();
  });
});
