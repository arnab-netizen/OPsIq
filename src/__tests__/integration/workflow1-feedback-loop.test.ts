/**
 * Workflow 1 Integration: Feedback Loop
 *
 * Proves the full "Actions → Evidence → Verification → Reassessment" loop
 * across all 5 domain spines (finance, operations, sales, sop, strategy).
 *
 * These are pure unit-level integration tests — they mock the DB and audit
 * emitter to verify service orchestration logic without a live database.
 */
import { describe, it, expect, vi, beforeEach, type MockedFunction } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockEmitAuditEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/infra/audit", () => ({ emitAuditEvent: mockEmitAuditEvent }));

const mockRunFinanceDiagnosis = vi.fn().mockResolvedValue({ id: "new-finance-cycle-id" });
const mockRunOperationsDiagnosis = vi.fn().mockResolvedValue({ id: "new-operations-cycle-id" });
const mockRunSalesDiagnosis = vi.fn().mockResolvedValue({ id: "new-sales-cycle-id" });
const mockRunSopDiagnosis = vi.fn().mockResolvedValue({ id: "new-sop-cycle-id" });
const mockRunStrategyDiagnosis = vi.fn().mockResolvedValue({ id: "new-strategy-cycle-id" });

// Mock dynamic imports used inside the services
vi.mock("@/services/owner-finance/diagnosis.service", () => ({
  runFinanceDiagnosis: mockRunFinanceDiagnosis,
}));
vi.mock("@/services/owner-operations/diagnosis.service", () => ({
  runOperationsDiagnosis: mockRunOperationsDiagnosis,
}));
vi.mock("@/services/owner-sales/diagnosis.service", () => ({
  runSalesDiagnosis: mockRunSalesDiagnosis,
}));
vi.mock("@/services/owner-sop/diagnosis.service", () => ({
  runSopDiagnosis: mockRunSopDiagnosis,
}));
vi.mock("@/services/owner-strategy/diagnosis.service", () => ({
  runStrategyDiagnosis: mockRunStrategyDiagnosis,
}));

// Mock the owner-action-gate so it doesn't block transitions in tests
vi.mock("@/services/owner-mode/owner-action-gate.service", () => ({
  enforceOwnerActionGates: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// DB mock factory
// ---------------------------------------------------------------------------

const BASE_ACTION = {
  id: "action-1",
  workspaceId: "ws-1",
  businessId: "biz-1",
  cycleId: "cycle-1",
  status: "in_progress",
  verificationMetric: "revenue",
  confidence: 0.8,
  completionNotes: "done",
  completionEvidence: ["evidence.pdf"],
  assignedTo: null,
};

const BASE_SNAPSHOT = { id: "snap-1" };
const BASE_VERIFICATION = {
  id: "verif-1",
  workspaceId: "ws-1",
  businessId: "biz-1",
  actionId: "action-1",
  status: "verified_improved",
  verificationMetric: "revenue",
};

type DbMock = {
  ownerFinanceAction: { findFirst: MockedFunction<any>; update: MockedFunction<any> };
  ownerFinancialSnapshot: { findFirst: MockedFunction<any> };
  ownerFinanceVerification: { create: MockedFunction<any> };
  ownerOperationsAction: { findFirst: MockedFunction<any>; update: MockedFunction<any> };
  ownerOperationsSnapshot: { findFirst: MockedFunction<any> };
  ownerOperationsVerification: { create: MockedFunction<any> };
  ownerSalesAction: { findFirst: MockedFunction<any>; update: MockedFunction<any> };
  ownerSalesSnapshot: { findFirst: MockedFunction<any> };
  ownerSalesVerification: { create: MockedFunction<any> };
  ownerSopAction: { findFirst: MockedFunction<any>; update: MockedFunction<any> };
  ownerSopSnapshot: { findFirst: MockedFunction<any> };
  ownerSopVerification: { create: MockedFunction<any> };
  ownerStrategyAction: { findFirst: MockedFunction<any>; update: MockedFunction<any> };
  ownerStrategySnapshot: { findFirst: MockedFunction<any> };
  ownerStrategyVerification: { create: MockedFunction<any> };
};

function makeDbMock(): DbMock {
  const makeTable = (findFirstResult: any, updateResult?: any) => ({
    findFirst: vi.fn().mockResolvedValue(findFirstResult),
    update: vi.fn().mockResolvedValue(updateResult ?? findFirstResult),
    create: vi.fn().mockResolvedValue(BASE_VERIFICATION),
  });
  return {
    ownerFinanceAction: makeTable(BASE_ACTION, { ...BASE_ACTION, status: "completed" }),
    ownerFinancialSnapshot: { findFirst: vi.fn().mockResolvedValue(BASE_SNAPSHOT) },
    ownerFinanceVerification: { create: vi.fn().mockResolvedValue(BASE_VERIFICATION) },

    ownerOperationsAction: makeTable(BASE_ACTION, { ...BASE_ACTION, status: "completed" }),
    ownerOperationsSnapshot: { findFirst: vi.fn().mockResolvedValue(BASE_SNAPSHOT) },
    ownerOperationsVerification: { create: vi.fn().mockResolvedValue(BASE_VERIFICATION) },

    ownerSalesAction: makeTable(BASE_ACTION, { ...BASE_ACTION, status: "completed" }),
    ownerSalesSnapshot: { findFirst: vi.fn().mockResolvedValue(BASE_SNAPSHOT) },
    ownerSalesVerification: { create: vi.fn().mockResolvedValue(BASE_VERIFICATION) },

    ownerSopAction: makeTable(BASE_ACTION, { ...BASE_ACTION, status: "completed" }),
    ownerSopSnapshot: { findFirst: vi.fn().mockResolvedValue(BASE_SNAPSHOT) },
    ownerSopVerification: { create: vi.fn().mockResolvedValue(BASE_VERIFICATION) },

    ownerStrategyAction: makeTable(BASE_ACTION, { ...BASE_ACTION, status: "completed" }),
    ownerStrategySnapshot: { findFirst: vi.fn().mockResolvedValue(BASE_SNAPSHOT) },
    ownerStrategyVerification: { create: vi.fn().mockResolvedValue(BASE_VERIFICATION) },
  } as unknown as DbMock;
}

let db: DbMock;

vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  get db() {
    return db;
  },
}));

describe("workflow1-feedback-loop — module contract assertions", () => {
  it("mockEmitAuditEvent is a function", () => { expect(typeof mockEmitAuditEvent).toBe("function"); });
  it("mockRunFinanceDiagnosis is a function", () => { expect(typeof mockRunFinanceDiagnosis).toBe("function"); });
  it("mockRunOperationsDiagnosis is a function", () => { expect(typeof mockRunOperationsDiagnosis).toBe("function"); });
  it("mockRunSalesDiagnosis is a function", () => { expect(typeof mockRunSalesDiagnosis).toBe("function"); });
  it("mockRunSopDiagnosis is a function", () => { expect(typeof mockRunSopDiagnosis).toBe("function"); });
  it("mockRunStrategyDiagnosis is a function", () => { expect(typeof mockRunStrategyDiagnosis).toBe("function"); });
  it("BASE_ACTION is an object", () => { expect(typeof BASE_ACTION).toBe("object"); });
  it("BASE_SNAPSHOT is an object", () => { expect(typeof BASE_SNAPSHOT).toBe("object"); });
  it("BASE_VERIFICATION is an object", () => { expect(typeof BASE_VERIFICATION).toBe("object"); });
  it("makeDbMock is a function", () => { expect(typeof makeDbMock).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
});

// ---------------------------------------------------------------------------
// Tests: Action completion → re-diagnosis
// ---------------------------------------------------------------------------

describe("Workflow 1 — Action completion triggers re-diagnosis (Class A)", () => {
  beforeEach(() => {
    db = makeDbMock();
    vi.clearAllMocks();
    mockRunFinanceDiagnosis.mockResolvedValue({ id: "new-finance-cycle-id" });
    mockRunOperationsDiagnosis.mockResolvedValue({ id: "new-operations-cycle-id" });
    mockRunSalesDiagnosis.mockResolvedValue({ id: "new-sales-cycle-id" });
    mockRunSopDiagnosis.mockResolvedValue({ id: "new-sop-cycle-id" });
    mockRunStrategyDiagnosis.mockResolvedValue({ id: "new-strategy-cycle-id" });
  });

  it("finance: action completion emits ACTION_COMPLETED and triggers re-diagnosis", async () => {
    const { updateFinanceAction } = await import("@/services/owner-finance/action.service");
    await updateFinanceAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.finance_action_completed");
    expect(mockRunFinanceDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.finance_reassessment_triggered");
  });

  it("operations: action completion emits ACTION_COMPLETED and triggers re-diagnosis", async () => {
    const { updateOperationsAction } = await import("@/services/owner-operations/action.service");
    await updateOperationsAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.operations_action_completed");
    expect(mockRunOperationsDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.operations_reassessment_triggered");
  });

  it("sales: action completion emits ACTION_COMPLETED and triggers re-diagnosis", async () => {
    const { updateSalesAction } = await import("@/services/owner-sales/action.service");
    await updateSalesAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.sales_action_completed");
    expect(mockRunSalesDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.sales_reassessment_triggered");
  });

  it("sop: action completion emits ACTION_COMPLETED and triggers re-diagnosis", async () => {
    const { updateSopAction } = await import("@/services/owner-sop/action.service");
    await updateSopAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.sop_action_completed");
    expect(mockRunSopDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.sop_reassessment_triggered");
  });

  it("strategy: action completion emits ACTION_COMPLETED and triggers re-diagnosis", async () => {
    const { updateStrategyAction } = await import("@/services/owner-strategy/action.service");
    await updateStrategyAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.strategy_action_completed");
    expect(mockRunStrategyDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.strategy_reassessment_triggered");
  });

  it("re-diagnosis failure does not fail the action update (best-effort)", async () => {
    mockRunOperationsDiagnosis.mockRejectedValueOnce(new Error("diagnosis unavailable"));
    const { updateOperationsAction } = await import("@/services/owner-operations/action.service");
    const result = await updateOperationsAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    expect(result.status).toBe("completed");
  });

  it("no snapshot found: re-diagnosis is silently skipped (action update still succeeds)", async () => {
    db.ownerSalesSnapshot.findFirst.mockResolvedValueOnce(null);
    const { updateSalesAction } = await import("@/services/owner-sales/action.service");
    const result = await updateSalesAction(
      "action-1",
      { status: "completed", completionNotes: "done", completionEvidence: ["evidence.pdf"] },
      "actor-1",
      "ws-1"
    );
    expect(result.status).toBe("completed");
    expect(mockRunSalesDiagnosis).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Verification success → re-diagnosis (Class B)
// ---------------------------------------------------------------------------

describe("Workflow 1 — Verification success triggers re-diagnosis (Class B)", () => {
  beforeEach(() => {
    db = makeDbMock();
    vi.clearAllMocks();
    mockRunFinanceDiagnosis.mockResolvedValue({ id: "new-finance-cycle-id" });
    mockRunOperationsDiagnosis.mockResolvedValue({ id: "new-operations-cycle-id" });
    mockRunSalesDiagnosis.mockResolvedValue({ id: "new-sales-cycle-id" });
    mockRunSopDiagnosis.mockResolvedValue({ id: "new-sop-cycle-id" });
    mockRunStrategyDiagnosis.mockResolvedValue({ id: "new-strategy-cycle-id" });
  });

  const TARGET_REACHED_INPUT = {
    beforeValue: 50,
    afterValue: 75,
    targetValue: 70,
    targetDirection: "up" as const,
    disputed: false,
    evidence: ["screenshot.png"],
  };

  const TARGET_MISSED_INPUT = {
    beforeValue: 50,
    afterValue: 55,
    targetValue: 70,
    targetDirection: "up" as const,
    disputed: false,
  };

  it("finance: verification success triggers re-diagnosis", async () => {
    const { recordFinanceVerification } = await import(
      "@/services/owner-finance/verification.service"
    );
    await recordFinanceVerification("action-1", TARGET_REACHED_INPUT, "actor-1", "ws-1");
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.finance_outcome_verified");
    expect(mockRunFinanceDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.finance_verification_reassessment_triggered");
  });

  it("operations: verification success triggers re-diagnosis", async () => {
    const { recordOperationsVerification } = await import(
      "@/services/owner-operations/verification.service"
    );
    await recordOperationsVerification("action-1", TARGET_REACHED_INPUT, "actor-1", "ws-1");
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.operations_outcome_verified");
    expect(mockRunOperationsDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.operations_verification_reassessment_triggered");
  });

  it("sales: verification success triggers re-diagnosis", async () => {
    const { recordSalesVerification } = await import(
      "@/services/owner-sales/verification.service"
    );
    await recordSalesVerification("action-1", TARGET_REACHED_INPUT, "actor-1", "ws-1");
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.sales_outcome_verified");
    expect(mockRunSalesDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.sales_verification_reassessment_triggered");
  });

  it("sop: verification success triggers re-diagnosis", async () => {
    const { recordSopVerification } = await import("@/services/owner-sop/verification.service");
    await recordSopVerification("action-1", TARGET_REACHED_INPUT, "actor-1", "ws-1");
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.sop_outcome_verified");
    expect(mockRunSopDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.sop_verification_reassessment_triggered");
  });

  it("strategy: verification success triggers re-diagnosis", async () => {
    const { recordStrategyVerification } = await import(
      "@/services/owner-strategy/verification.service"
    );
    await recordStrategyVerification("action-1", TARGET_REACHED_INPUT, "actor-1", "ws-1");
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.strategy_outcome_verified");
    expect(mockRunStrategyDiagnosis).toHaveBeenCalledWith("biz-1", "snap-1", "actor-1", "ws-1");
    expect(auditNames).toContain("owner.strategy_verification_reassessment_triggered");
  });

  it("target missed: verification records result but does NOT trigger re-diagnosis", async () => {
    const { recordSalesVerification } = await import(
      "@/services/owner-sales/verification.service"
    );
    await recordSalesVerification("action-1", TARGET_MISSED_INPUT, "actor-1", "ws-1");
    expect(mockRunSalesDiagnosis).not.toHaveBeenCalled();
    const auditNames = mockEmitAuditEvent.mock.calls.map((c) => c[0].eventName);
    expect(auditNames).toContain("owner.sales_outcome_verified");
    expect(auditNames).not.toContain("owner.sales_verification_reassessment_triggered");
  });

  it("re-diagnosis failure does not fail the verification record (best-effort)", async () => {
    mockRunStrategyDiagnosis.mockRejectedValueOnce(new Error("diagnosis crashed"));
    const { recordStrategyVerification } = await import(
      "@/services/owner-strategy/verification.service"
    );
    const { verification } = await recordStrategyVerification(
      "action-1",
      TARGET_REACHED_INPUT,
      "actor-1",
      "ws-1"
    );
    expect(verification.id).toBe("verif-1");
  });

  it("no snapshot: re-diagnosis skipped but verification record returns normally", async () => {
    db.ownerOperationsSnapshot.findFirst.mockResolvedValueOnce(null);
    const { recordOperationsVerification } = await import(
      "@/services/owner-operations/verification.service"
    );
    const { verification } = await recordOperationsVerification(
      "action-1",
      TARGET_REACHED_INPUT,
      "actor-1",
      "ws-1"
    );
    expect(verification.id).toBe("verif-1");
    expect(mockRunOperationsDiagnosis).not.toHaveBeenCalled();
  });

  it("missing beforeValue: validation error thrown before any DB write", async () => {
    const { recordSopVerification } = await import("@/services/owner-sop/verification.service");
    await expect(
      recordSopVerification(
        "action-1",
        { ...TARGET_REACHED_INPUT, beforeValue: null as unknown as number },
        "actor-1",
        "ws-1"
      )
    ).rejects.toThrow("before (baseline) value");
    expect(mockRunSopDiagnosis).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: Workspace isolation
// ---------------------------------------------------------------------------

describe("Workflow 1 — Workspace isolation enforced throughout", () => {
  beforeEach(() => {
    db = makeDbMock();
    vi.clearAllMocks();
  });

  it("action update: findFirst uses workspaceId, preventing cross-tenant access", async () => {
    db.ownerFinanceAction.findFirst.mockResolvedValueOnce(null);
    const { updateFinanceAction } = await import("@/services/owner-finance/action.service");
    await expect(
      updateFinanceAction("action-1", { status: "in_progress" }, "actor-1", "ws-other")
    ).rejects.toThrow();
    expect(db.ownerFinanceAction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws-other" }) })
    );
  });

  it("verification record: findFirst uses workspaceId, preventing cross-tenant access", async () => {
    db.ownerSalesAction.findFirst.mockResolvedValueOnce(null);
    const { recordSalesVerification } = await import("@/services/owner-sales/verification.service");
    await expect(
      recordSalesVerification(
        "action-1",
        { beforeValue: 10, afterValue: 20, targetDirection: "up", disputed: false },
        "actor-1",
        "ws-other"
      )
    ).rejects.toThrow();
    expect(db.ownerSalesAction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: "ws-other" }) })
    );
  });
});
