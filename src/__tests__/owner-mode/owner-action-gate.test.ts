/**
 * Jarvis 360 owner-flow closure (EH-01,EH-02,EH-09,EH-18) — owner-mode action gate (DI).
 * Proves the default-on gate enforces on the owner's own runtime flow (not the consulting
 * Recommendation path): opt-out aware, do-not-repeat by domain scope, capacity for growth.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));
vi.mock("@/lib/db", () => ({ db: {}, getDbInstance: vi.fn().mockResolvedValue({}) }));

import { enforceOwnerActionGates, recordOwnerGateAssessment } from "@/services/owner-mode/owner-action-gate.service";
import { ConflictError } from "@/infra/errors";

beforeEach(() => emitAuditEvent.mockClear());

function deps(opts: {
  optOut?: boolean;
  dnrRule?: { changedContextExplanation: string | null; memoryKey?: string } | null;
  /** Real active businesses of the workspace (default: the action's business alone). */
  businesses?: Array<{ id: string }>;
  equipment?: Array<{ name: string; utilization: number | null; downtimeState: string; maintenanceDueAt: Date | null; status: string }>;
  survivalState?: string | null;
  /** The Finance diagnosis's snapshot was amended since (not a current reading). */
  financeSuperseded?: boolean;
  cashflowState?: string | null;
  snapshot?: { revenue: number | null; costOfGoods: number | null } | null;
  compliance?: Array<{ kind: string; name: string; expiresAt: Date | null; businessId?: string | null }>;
}) {
  const now = new Date("2026-06-28T00:00:00.000Z");
  const periodEnd = new Date("2026-06-18T00:00:00.000Z");
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
      ownerDoNotRepeatRule: {
        findMany: vi.fn(async () => (opts.dnrRule ? [{ id: "rule1", businessId: null, memoryKey: opts.dnrRule.memoryKey ?? "scope:marketing", changedContextExplanation: opts.dnrRule.changedContextExplanation }] : [])),
      },
      ownerBusiness: { findMany: vi.fn(async () => opts.businesses ?? [{ id: "biz1" }]) },
      ownerEquipment: { findMany: vi.fn(async () => (opts.equipment ?? []).map((e) => ({ businessId: null, ...e }))) },
      // Current readings: a period that ended ten days before `now` (inside the freshness window).
      ownerFinanceCycle: { findFirst: vi.fn(async () => (opts.survivalState ? { survivalState: opts.survivalState, snapshot: { periodEnd: periodEnd, supersededById: opts.financeSuperseded ? "newer" : null }, findings: [] } : null)) },
      ownerCashflowCycle: { findFirst: vi.fn(async () => (opts.cashflowState !== undefined ? (opts.cashflowState ? { cashflowState: opts.cashflowState, snapshot: { periodEnd } } : null) : null)) },
      ownerFinancialSnapshot: { findFirst: vi.fn(async () => opts.snapshot ?? null) },
      ownerComplianceItem: { findMany: vi.fn(async () => (opts.compliance ?? []).map((c) => ({ businessId: null, ...c }))) },
    },
    now: () => now,
  };
}

const base = { workspaceId: "ws1", businessId: "biz1", actionId: "act1" };

describe("enforceOwnerActionGates", () => {
  it("no-ops on a non-material transition (assigned)", async () => {
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "assigned" }, deps({}) as never)).resolves.toBeDefined();
  });

  it("no-ops when the owner has an active audited opt-out", async () => {
    const d = deps({ optOut: true, equipment: [{ name: "down", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  it("blocks a material transition when a do-not-repeat rule exists for the domain scope", async () => {
    const d = deps({ dnrRule: { changedContextExplanation: null } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("allows when the do-not-repeat rule carries a changed-context override", async () => {
    const d = deps({ dnrRule: { changedContextExplanation: "market shifted" } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress" }, d as never)).resolves.toBeDefined();
  });

  it("blocks a growth-domain action when capacity is unsafe (equipment down)", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not apply the capacity gate to a non-capacity domain (finance)", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  it("allows a growth-domain action when capacity is safe", async () => {
    const d = deps({ equipment: [{ name: "Washer", utilization: 0.4, downtimeState: "up", maintenanceDueAt: new Date("2026-12-01"), status: "operational" }] });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).resolves.toBeDefined();
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
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  it("does not block on absent cash data (no finance/cashflow cycle yet)", async () => {
    const d = deps({ survivalState: null, cashflowState: null });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  it("blocks a sales/marketing action when gross margin is known below the floor", async () => {
    // revenue 100, COGS 95 → 5% gross margin < 15% floor
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
    await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("allows when gross margin clears the floor", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 50 } }); // 50% margin
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  it("unknown margin (no snapshot): not a false block; the abstention is returned with the data it needs and recorded by the caller AFTER its write — never before, never silent", async () => {
    const d = deps({ snapshot: null });
    const assessment = await enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, d as never);
    expect(assessment.marginAbstention).toEqual(expect.arrayContaining([expect.stringMatching(/revenue/)]));
    // The gate itself writes nothing for an allowed transition (a rejected or retried caller update leaves no row).
    expect(emitAuditEvent).not.toHaveBeenCalled();
    await recordOwnerGateAssessment(assessment);
    expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "owner.gate_assessment_abstained",
      entityId: "act1",
      payload: expect.objectContaining({ code: "CANNOT_ASSESS_MARGIN_SAFETY", requiredData: expect.arrayContaining([expect.stringMatching(/revenue/)]) }),
    }), undefined);
    expect(emitAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_promotion_blocked" }));
  });

  it("A-P1-2 — amending an unsafe Finance snapshot never lifts the block before the amended figures are diagnosed (fail safe)", async () => {
    const amended = deps({ survivalState: "INSOLVENT_RISK", financeSuperseded: true, cashflowState: "SAFE" });
    const err = await enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress" }, amended as never).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toMatch(/amended and not yet re-diagnosed/);
    // With cash absent too, the amended unsafe reading still applies (it is never dropped to "no data").
    const onlyAmended = deps({ survivalState: "INSOLVENT_RISK", financeSuperseded: true, cashflowState: null });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress" }, onlyAmended as never)).rejects.toBeInstanceOf(ConflictError);
    // A SAFE amended reading blocks nothing.
    const safeAmended = deps({ survivalState: "SAFE", financeSuperseded: true, cashflowState: "SAFE" });
    await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "in_progress" }, safeAmended as never)).resolves.toBeDefined();
  });

  describe("C-P1-1 — the growth limits apply by the action's INTENT, never to the step that responds to the danger", () => {
    const down = [{ name: "Washer", utilization: 0.5, downtimeState: "down", maintenanceDueAt: null, status: "operational" }];
    it("a cash-survival step (STABILISE) is never refused because cash is critical", async () => {
      const d = deps({ cashflowState: "CRITICAL", survivalState: "CRITICAL" });
      await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress", findingCode: "CF_INSOLVENT_RUNWAY" }, d as never)).resolves.toBeDefined();
      // The same domain's action with no finding code keeps the domain's (spend) sensitivity: blocked.
      await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("a repair step (e.g. Operations delivery failure) is not refused for AT_RISK cash, a GROW step is", async () => {
      const d = deps({ survivalState: "AT_RISK", cashflowState: "AT_RISK" });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "in_progress", findingCode: "OPS_HIGH_DELAY" }, d as never)).resolves.toBeDefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("clearing a capacity bottleneck is never refused because capacity is unsafe; a GROW step is", async () => {
      const d = deps({ equipment: down });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed", findingCode: "OPS_CAPACITY_BOTTLENECK" }, d as never)).resolves.toBeDefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed", findingCode: "SALES_OPP_WINBACK" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("controlling discounting (a margin repair) is never refused because margin is low; scaling a campaign is", async () => {
      const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
      await expect(enforceOwnerActionGates({ ...base, domain: "sales", toStatus: "completed", findingCode: "SALES_DISCOUNT_DEPENDENCE" }, d as never)).resolves.toBeDefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed", findingCode: "MKT_OPP_SCALE_WINNER" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("Owner matrix D — a GROW action with unknown margin: not falsely blocked (the shared margin contract), the Owner-mode abstention is recorded for its business", async () => {
      const assessment = await enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }, deps({ snapshot: null }) as never);
      await recordOwnerGateAssessment(assessment);
      expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_assessment_abstained", payload: expect.objectContaining({ code: "CANNOT_ASSESS_MARGIN_SAFETY", businessId: "biz1" }) }), undefined);
    });
    it("Owner matrix E — REPAIR / STABILISE / EVIDENCE actions in Finance, Sales or Marketing with unknown margin and unknown cash: never blocked by domain, nothing abstained", async () => {
      for (const [domain, findingCode] of [["sales", "SALES_DISCOUNT_DEPENDENCE"], ["finance", "FIN_INSOLVENT_RUNWAY"], ["marketing", "MKT_OPP_DATA_QUALITY"], ["cashflow", "CF_LOW_RUNWAY"]] as const) {
        emitAuditEvent.mockClear();
        const assessment = await enforceOwnerActionGates({ ...base, domain, toStatus: "in_progress", findingCode }, deps({ snapshot: null, cashflowState: null, survivalState: null }) as never);
        expect(assessment.marginAbstention, `${domain}/${findingCode}`).toBeNull();
        await recordOwnerGateAssessment(assessment);
        expect(emitAuditEvent).not.toHaveBeenCalled();
      }
    });
    it("an EVIDENCE step (collect the figures) stays executable while cash is critical — cash danger never blocks establishing the cash position", async () => {
      await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "completed", findingCode: "CF_OPP_DATA_QUALITY" }, deps({ cashflowState: "INSOLVENT_RISK", survivalState: "INSOLVENT_RISK" }) as never)).resolves.toBeDefined();
    });
    it("Strategy: the caller's live-decision intent overrides the code's own classification", async () => {
      const d = deps({ survivalState: "AT_RISK", cashflowState: "AT_RISK" });
      await expect(enforceOwnerActionGates({ ...base, domain: "strategy", toStatus: "in_progress", findingCode: "STR_UNAFFORDABLE", intent: "STABILISE" }, d as never)).resolves.toBeDefined();
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
      expect(emitAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_assessment_abstained" }), undefined);
      emitAuditEvent.mockClear();
      const assessment = await enforceOwnerActionGates({ ...base, domain: "marketing", toStatus: "completed" }, deps({ snapshot: null }) as never);
      await recordOwnerGateAssessment(assessment);
      expect(emitAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "owner.gate_assessment_abstained", payload: expect.objectContaining({ businessId: "biz1" }) }), undefined);
    });
  });

  it("does not apply the margin gate to non-margin domains (operations)", async () => {
    const d = deps({ snapshot: { revenue: 100, costOfGoods: 95 } });
    await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  it("H1 — scopes capacity/compliance/do-not-repeat/margin reads to the action's business (or workspace-wide)", async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    let snapshotOrder: unknown = null;
    const cap = (k: string) => async (args: { where: unknown }) => { captured[k] = args.where as Record<string, unknown>; return []; };
    const d = {
      db: {
        clientAccount: { findUnique: vi.fn(async () => ({ requireBusinessImpactAssessment: false, ownerGateOptOutAt: null, ownerGateOptOutExpiresAt: null })), update: vi.fn() },
        ownerDoNotRepeatRule: { findMany: vi.fn(async (a: { where: unknown }) => { captured.dnr = a.where as Record<string, unknown>; return []; }) },
        ownerBusiness: { findMany: vi.fn(async () => [{ id: "bizA" }, { id: "bizB" }]) },
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
    expect(captured.snapshot).toEqual({ workspaceId: "ws1", businessId: "bizA", supersededById: null, periodEnd: { lte: new Date("2026-06-28T00:00:00.000Z") } });
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
    await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeDefined();
  });

  describe("Policy 2 — a broad do-not-repeat area rule never blocks protective work; an exact memory still applies", () => {
    it("scope:cash / scope:cashflow (one scope): holds back an unknown-intent cash action, never collecting receivables or refreshing cash data", async () => {
      for (const memoryKey of ["scope:cash", "scope:cashflow"]) {
        const d = deps({ dnrRule: { changedContextExplanation: null, memoryKey } });
        await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress" }, d as never), memoryKey).rejects.toBeInstanceOf(ConflictError);
        await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress", findingCode: "CF_OPP_COLLECT_OVERDUE" }, d as never), memoryKey).resolves.toBeDefined();
        await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress", findingCode: "CF_OPP_DATA_QUALITY" }, d as never), memoryKey).resolves.toBeDefined();
        await expect(enforceOwnerActionGates({ ...base, domain: "cashflow", toStatus: "in_progress", findingCode: "CF_LOW_RUNWAY" }, d as never), memoryKey).resolves.toBeDefined();
      }
    });
    it("scope:finance never stops stopping a live leak or stabilising runway; it holds back a GROW step", async () => {
      const d = deps({ dnrRule: { changedContextExplanation: null, memoryKey: "scope:finance" } });
      await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", findingCode: "FIN_DISCOUNT_LEAKAGE" }, d as never)).resolves.toBeDefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", findingCode: "FIN_LOW_RUNWAY" }, d as never)).resolves.toBeDefined();
      await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", findingCode: "FIN_OPP_REVENUE_QUALITY" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("an EXECUTE step is not held back by a broad area rule (it is not proven to repeat the failed lever)", async () => {
      const d = deps({ dnrRule: { changedContextExplanation: null, memoryKey: "scope:sop" } });
      await expect(enforceOwnerActionGates({ ...base, domain: "sop", toStatus: "in_progress", findingCode: "SOP_HIGH_OVERDUE" }, d as never)).resolves.toBeDefined();
    });
    it("an EXACT finding memory holds back even a protective step of that finding (a proven repeat)", async () => {
      const d = deps({ dnrRule: { changedContextExplanation: null, memoryKey: "scope:finance:finding:f-leak" } });
      await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", findingCode: "FIN_DISCOUNT_LEAKAGE", findingId: "f-leak" }, d as never)).rejects.toBeInstanceOf(ConflictError);
      await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", findingCode: "FIN_DISCOUNT_LEAKAGE", findingId: "f-other" }, d as never)).resolves.toBeDefined();
    });
  });

  describe("Policy 3 — a business-less compliance item is not automatically every business's", () => {
    const expired = { kind: "licence", name: "Trade licence", expiresAt: new Date("2026-01-01T00:00:00.000Z") };
    it("business-specific: restricts that business", async () => {
      const d = deps({ compliance: [{ ...expired, businessId: "biz1" }], businesses: [{ id: "biz1" }, { id: "biz2" }] });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("null business, exactly one real business: restricts that sole business", async () => {
      const d = deps({ compliance: [{ ...expired, businessId: null }], businesses: [{ id: "biz1" }] });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).rejects.toBeInstanceOf(ConflictError);
    });
    it("null business, several real businesses: unattributed — restricts neither business A nor B", async () => {
      const d = deps({ compliance: [{ ...expired, businessId: null }], businesses: [{ id: "biz1" }, { id: "biz2" }] });
      await expect(enforceOwnerActionGates({ ...base, domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeDefined();
      await expect(enforceOwnerActionGates({ ...base, businessId: "biz2", domain: "operations", toStatus: "completed" }, d as never)).resolves.toBeDefined();
    });
  });

  it("Budget — intents by PURPOSE: protect-cash (BLOCK → STABILISE) and evidence pass at CRITICAL cash; releasing spend (INCREASE → GROW) does not; a margin-repair reprice (INCREASE) is REPAIR", async () => {
    const { budgetActionIntent, BUDGET_MARGIN_REPAIR_TITLES } = await import("@/domain/owner-budget");
    const d = deps({ cashflowState: "CRITICAL", survivalState: "CRITICAL" });
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", intent: budgetActionIntent({ decisionType: "BLOCK" }) }, d as never)).resolves.toBeDefined();
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", intent: budgetActionIntent({ decisionType: "COLLECT_EVIDENCE" }) }, d as never)).resolves.toBeDefined();
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", intent: budgetActionIntent({ decisionType: "INCREASE" }) }, d as never)).rejects.toBeInstanceOf(ConflictError);
    const reprice = Object.values(BUDGET_MARGIN_REPAIR_TITLES)[0];
    expect(budgetActionIntent({ decisionType: "INCREASE", title: reprice })).toBe("REPAIR");
    await expect(enforceOwnerActionGates({ ...base, domain: "finance", toStatus: "in_progress", intent: budgetActionIntent({ decisionType: "INCREASE", title: reprice }) }, d as never)).resolves.toBeDefined();
  });
});
