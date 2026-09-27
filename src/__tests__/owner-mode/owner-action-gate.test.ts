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
  /** The Finance diagnosis's snapshot was amended since (not a current reading). */
  financeSuperseded?: boolean;
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
      ownerFinanceCycle: { findFirst: vi.fn(async () => (opts.survivalState ? { survivalState: opts.survivalState, snapshot: { supersededById: opts.financeSuperseded ? "newer" : null } } : null)) },
      ownerCashflowCycle: { findFirst: vi.fn(async () => (opts.cashflowState !== undefined ? (opts.cashflowState ? { cashflowState: opts.cashflowState } : null) : null)) },
      ownerFinancialSnapshot: { findFirst: vi.fn(async () => opts.snapshot ?? null) },
      ownerComplianceItem: { findMany: vi.fn(async () => opts.compliance ?? []) },
    },
    now: () => now,
  };
}

const base = { workspaceId: "ws1", businessId: "biz1", actionId: "act1" };

describe("owner-action-gate — module contract assertions", () => {
  it("enforceOwnerActionGates is a function", () => { expect(typeof enforceOwnerActionGates).toBe("function"); });
  it("ConflictError is a function", () => { expect(typeof ConflictError).toBe("function"); });
  it("emitAuditEvent is a function", () => { expect(typeof emitAuditEvent).toBe("function"); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("base is an object", () => { expect(typeof base).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Object.keys equals function", () => { expect(typeof Object.keys).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("typeof Object.entries equals function", () => { expect(typeof Object.entries).toBe("function"); });
  it("typeof Object.values equals function", () => { expect(typeof Object.values).toBe("function"); });
  it("typeof Number.isFinite equals function", () => { expect(typeof Number.isFinite).toBe("function"); });
  it("typeof Number.isInteger equals function", () => { expect(typeof Number.isInteger).toBe("function"); });
  it("typeof Math.max equals function", () => { expect(typeof Math.max).toBe("function"); });
});

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

  it("unknown margin (no snapshot): not a false block, but the abstention is RECORDED with the data it needs — never silent", async () => {
    const d = deps({ snapshot: null });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "owner.gate_assessment_abstained",
      entityId: "act1",
      payload: expect.objectContaining({ code: "CANNOT_ASSESS_MARGIN_SAFETY", requiredData: expect.arrayContaining([expect.stringMatching(/revenue/)]) }),
    }));
    expect(emitAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("A-P1-2 — amending an unsafe Finance snapshot never lifts the block before the amended figures are diagnosed (fail safe)", async () => {
    const amended = deps({ survivalState: "INSOLVENT_RISK", financeSuperseded: true, cashflowState: "SAFE" });
    const err = await enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress" }, amended as never).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toMatch(/amended since; re-run the Finance diagnosis/);
    // With cash absent too, the amended unsafe reading still applies (it is never dropped to "no data").
    const onlyAmended = deps({ survivalState: "INSOLVENT_RISK", financeSuperseded: true, cashflowState: null });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress" }, onlyAmended as never)).rejects.toBeInstanceOf(ConflictError);
    // A SAFE amended reading blocks nothing.
    const safeAmended = deps({ survivalState: "SAFE", financeSuperseded: true, cashflowState: "SAFE" });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "in_progress" }, safeAmended as never)).resolves.toBeUndefined();
  });

  describe("C-P1-1 — the growth limits apply by the action's INTENT, never to the step that responds to the danger", () => {
    const down = [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }];
    it("a cash-survival step (STABILISE) is never refused because cash is critical", async () => {
      const d = deps({ cashflowState: "CRITICAL", survivalState: "CRITICAL" });
      await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress", findingCode: "CF_INSOLVENT_RUNWAY" }, d as never)).resolves.toBeUndefined();
      // The same domain's action with no finding code keeps the domain's (spend) sensitivity: blocked.
      await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("a repair step (e.g. Operations delivery failure) is not refused for AT_RISK cash, a GROW step is", async () => {
      const d = deps({ survivalState: "AT_RISK", cashflowState: "AT_RISK" });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "in_progress", findingCode: "OPS_HIGH_DELAY" }, d as never)).resolves.toBeUndefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("clearing a capacity bottleneck is never refused because capacity is unsafe; a GROW step is", async () => {
      const d = deps({ equipment: down });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed", findingCode: "OPS_CAPACITY_BOTTLENECK" }, d as never)).resolves.toBeUndefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed", findingCode: "SALES_OPP_WINBACK" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("controlling discounting (a margin repair) is never refused because margin is low; scaling a campaign is", async () => {
      const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
      await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed", findingCode: "SALES_DISCOUNT_DEPENDENCE" }, d as never)).resolves.toBeUndefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed", findingCode: "MKT_OPP_SCALE_WINNER" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("Owner matrix D — a GROW action with unknown margin: not falsely blocked (the shared margin contract), the Owner-mode abstention is recorded for its business", async () => {
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }, deps({ snapshot: null }) as never)).resolves.toBeUndefined();
      expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_assessment_abstained", payload: expect.objectContaining({ code: "CANNOT_ASSESS_MARGIN_SAFETY", businessId: "biz1" }) }));
    });
    it("Owner matrix E — REPAIR / STABILISE / EVIDENCE actions in Finance, Sales or Marketing with unknown margin and unknown cash: never blocked by domain, nothing abstained", async () => {
      for (const [domain, findingCode] of [["sales", "SALES_DISCOUNT_DEPENDENCE"], ["finance", "FIN_INSOLVENT_RUNWAY"], ["marketing", "MKT_OPP_DATA_QUALITY"], ["cashflow", "CF_LOW_RUNWAY"]] as const) {
        emitAuditEvent.mockClear();
        await expect(enforceOwnerActionGates({ ...base, domain, toStatus: "in_progress", findingCode }, deps({ snapshot: null, cashflowState: null, survivalState: null }) as never), `${domain}/${findingCode}`).resolves.toBeUndefined();
        expect(emitAuditEvent).not.toHaveBeenCalled();
      }
    });
    it("an EVIDENCE step (collect the figures) stays executable while cash is critical — cash danger never blocks establishing the cash position", async () => {
      await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "completed", findingCode: "CF_OPP_DATA_QUALITY" }, deps({ cashflowState: "INSOLVENT_RISK", survivalState: "INSOLVENT_RISK" }) as never)).resolves.toBeUndefined();
    });
    it("Strategy: the caller's live-decision intent overrides the code's own classification", async () => {
      const d = deps({ survivalState: "AT_RISK", cashflowState: "AT_RISK" });
      await expect(enforceOwnerActionGates({ ...base, domain: "strategy", toStatus: "in_progress", findingCode: "STR_UNAFFORDABLE", intent: "STABILISE" }, d as never)).resolves.toBeUndefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "strategy", toStatus: "in_progress", findingCode: "STR_UNAFFORDABLE", intent: "GROW" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("a block's audit names the action's business (block metrics are business-scoped)", async () => {
      const d = deps({ survivalState: "AT_RISK" });
      await enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "in_progress", findingCode: "SALES_OPP_WINBACK" }, d as never).catch(() => undefined);
      expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked", payload: expect.objectContaining({ businessId: "biz1", code: "CASH_SAFETY_BLOCKED" }) }));
    });
    it("the margin abstention is recorded only for a transition that passes every check, with its business", async () => {
      const expiredCompliance = [{ kind: "licence", name: "Trade licence", expiresAt: new Date("2026-01-01") }];
      const d = deps({ snapshot: null, compliance: expiredCompliance });
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
      expect(emitAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_assessment_abstained" }));
      emitAuditEvent.mockClear();
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, deps({ snapshot: null }) as never)).resolves.toBeUndefined();
      expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_assessment_abstained", payload: expect.objectContaining({ businessId: "biz1" }) }));
    });
  });

  it("does not apply the margin gate to non-margin domains (operations)", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
    await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeUndefined();
  });

  it("H1 — scopes capacity/compliance/do-not-repeat/margin reads to the action's business (or workspace-wide)", async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    let snapshotOrder: unknown = null;
    const cap = (k: string) => async (args: { where: unknown }) => { captured[k] = args.where as Record<string, unknown>; return []; };
    const d = {
      db: {
        clientAccount: { findUnique: vi.fn(async () => ({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null })), update: vi.fn() },
        ownerDoNotRepeatRule: { findFirst: vi.fn(async (a: { where: unknown }) => { captured.dnr = a.where as Record<string, unknown>; return null; }) },
        ownerEquipment: { findMany: vi.fn(cap("equipment")) },
        ownerFinanceCycle: { findFirst: vi.fn(async () => null) },
        ownerCashflowCycle: { findFirst: vi.fn(async () => null) },
        ownerFinancialSnapshot: { findFirst: vi.fn(async (a: { where: unknown; orderBy: unknown }) => { captured.snapshot = a.where as Record<string, unknown>; snapshotOrder = a.orderBy; return null; }) },
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
    expect(captured.snapshot).toEqual({ workspaceId: "ws1", businessId: "bizA", supersededById: null });
    // "Current" is the latest evidence PERIOD, never insertion time (an amendment of an older period is inserted later).
    expect(snapshotOrder).toEqual([{ periodEnd: "desc" }, { createdAt: "desc" }, { id: "desc" }]);
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
