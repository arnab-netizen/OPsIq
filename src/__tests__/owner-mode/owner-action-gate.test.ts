/**
 * Jarvis 360 owner-flow closure (EH-01,EH-02,EH-09,EH-18) — owner-mode action gate (DI).
 * Proves the default-on gate enforces on the owner's own runtime flow (not the consulting
 * Recommendation path): opt-out aware, do-not-repeat by domain scope, capacity for growth.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { ConflictError } from "@/infra/errors";

beforeEach(() => emitAuditEvent.mockClear());

function deps(opts: {
  optOut?: boolean;
  dnrRule?: { changedContextExplanation: string | null } | null;
  equipment?: Array<{ name: string; utilization: number | null; downtimeState: string; maintenanceDueAt: Date | null; status: string }>;
  survivalState?: string | null;
  cashflowState?: string | null;
  snapshot?: { revenue: number | null; costOfGoods: number | null } | null;
  compliance?: Array<{ kind: string; name: string; expiresAt: Date | null }>;
}) {
  const now = new Date("2026-06-28T00:00:00.000Z");
  return {
    db: {
      clientAccount: {
        findUnique: vi.fn(async () =>
          opts.optOut
            ? { requireBusinessImpactAssessment: false, ownerGateOptOutAt: new Date("2026-06-01"), ownerGateOptOutExpiresAt: null }
            : { requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null }
        ),
        update: vi.fn(),
      },
      ownerDoNotRepeatRule: { findFirst: vi.fn(async () => opts.dnrRule ?? null) },
      ownerEquipment: { findMany: vi.fn(async () => opts.equipment ?? []) },
      ownerFinanceCycle: { findFirst: vi.fn(async () => (opts.survivalState !== undefined ? (opts.survivalState ? { survivalState: opts.survivalState } : null) : null)) },
      ownerCashflowCycle: { findFirst: vi.fn(async () => (opts.cashflowState !== undefined ? (opts.cashflowState ? { cashflowState: opts.cashflowState } : null) : null)) },
      ownerFinancialSnapshot: { findFirst: vi.fn(async () => opts.snapshot ?? null) },
      ownerComplianceItem: { findMany: vi.fn(async () => opts.compliance ?? []) },
    },
    now: () => now,
  };
}

const base = { workspaceId: "ws1", businessId: "biz1", actionId: "act1" };

describe("enforceOwnerActionGates", () => {
  it("no-ops on a non-material transition (assigned)", async () => {
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "assigned" }, deps({}) as never)).resolves.toBeUndefined();
  });

  it("no-ops when the owner has an active audited opt-out", async () => {
    const d = deps({ optOut: true, equipment: [{ name: "down", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("blocks a material transition when a do-not-repeat rule exists for the domain scope", async () => {
    const d = deps({ dnrRule: { changedContextExplanation: null } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("allows when the do-not-repeat rule carries a changed-context override", async () => {
    const d = deps({ dnrRule: { changedContextExplanation: "market shifted" } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress" }, d as never)).resolves.toBeUndefined();
  });

  it("blocks a growth-domain action when capacity is unsafe (equipment down)", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not apply the capacity gate to a non-capacity domain (finance)", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("allows a growth-domain action when capacity is safe", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.4, downtimeState: "up", maintenanceDueAt: new Date("2026-12-01"), status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("blocks a growth action when cash survival is AT_RISK (cash safety)", async () => {
    const d = deps({ survivalState: "AT_RISK" });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "in_progress" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("blocks a finance/spend action when cashflow is CRITICAL", async () => {
    const d = deps({ cashflowState: "CRITICAL" });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a growth action when cash is SAFE", async () => {
    const d = deps({ survivalState: "SAFE", cashflowState: "SAFE" });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("does not block on absent cash data (no finance/cashflow cycle yet)", async () => {
    const d = deps({ survivalState: null, cashflowState: null });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("blocks a sales/marketing action when gross margin is known below the floor", async () => {
    // revenue 100, COGS 95 → 5% gross margin < 15% floor
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("allows when gross margin clears the floor", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 50 } }); // 50% margin
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("does not block on unknown margin (no snapshot) — deferred, not a false block", async () => {
    const d = deps({ snapshot: null });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("does not apply the margin gate to non-margin domains (operations)", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
    await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("H1 — scopes capacity/compliance/do-not-repeat/margin reads to the action's business (or workspace-wide)", async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    const cap = (k: string) => async (args: { where: unknown }) => { captured[k] = args.where as Record<string, unknown>; return []; };
    const d = {
      db: {
        clientAccount: { findUnique: vi.fn(async () => ({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null })), update: vi.fn() },
        ownerDoNotRepeatRule: { findFirst: vi.fn(async (a: { where: unknown }) => { captured.dnr = a.where as Record<string, unknown>; return null; }) },
        ownerEquipment: { findMany: vi.fn(cap("equipment")) },
        ownerFinanceCycle: { findFirst: vi.fn(async () => null) },
        ownerCashflowCycle: { findFirst: vi.fn(async () => null) },
        ownerFinancialSnapshot: { findFirst: vi.fn(async (a: { where: unknown }) => { captured.snapshot = a.where; return null; }) },
        ownerComplianceItem: { findMany: vi.fn(cap("compliance")) },
      },
      now: () => new Date("2026-06-28T00:00:00.000Z"),
    };
    await enforceOwnerActionGates({ workspaceId: "ws1", businessId: "bizA", actionId: "a1", domain: "marketing", toStatus: "completed" }, d as never);
    // business-or-workspace-wide for the nullable-business models
    expect(captured.equipment).toEqual({ workspaceId: "ws1", OR: [{ businessId: "bizA" }, { businessId: null }] });
    expect(captured.compliance).toEqual({ workspaceId: "ws1", OR: [{ businessId: "bizA" }, { businessId: null }], status: "active" });
    expect(captured.dnr.OR).toEqual([{ businessId: "bizA" }, { businessId: null }]);
    // snapshot business is required → scoped directly to the business
    expect(captured.snapshot).toEqual({ workspaceId: "ws1", businessId: "bizA" });
  });

  it("blocks any material action when a compliance item is expired (professional review)", async () => {
    const d = deps({ compliance: [{ kind: "insurance", name: "Liability policy", expiresAt: new Date("2026-01-01T00:00:00.000Z") }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked", payload: expect.objectContaining({ code: "COMPLIANCE_BLOCKED" }) }));
  });

  it("allows when compliance items are present but not expired", async () => {
    const d = deps({ compliance: [{ kind: "licence", name: "Trade licence", expiresAt: new Date("2027-01-01T00:00:00.000Z") }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });
});
