/**
 * C-P2-1 / C-P2-2 — Now View names a Finance survival danger by its OWN provenance and never manufactures
 * a cash danger from a single SAFE reading.
 *   - Finance's survival state reads overall financial survival; when its findings are profit/margin losses
 *     only, the issue is a profit problem ("driven by profit and margin rather than cash"), never "cash danger";
 *   - when its findings include a cash-survival danger it stays a cash issue;
 *   - one SAFE (or WATCH) reading with the other missing raises NO cash issue (the missing reading is asked
 *     for under missing data).
 */
import { describe, it, expect } from "vitest";
import { assembleGuidanceContext, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";

interface Rows {
  cash?: { cashflowState: string; dataConfidenceScore: number; createdAt?: Date; snapshot?: { periodEnd: Date } } | null;
  fin?: { survivalState: string; dataConfidenceScore: number; createdAt?: Date; snapshot?: { periodEnd: Date; supersededById?: string | null }; findings?: Array<{ code: string }> } | null;
  emp?: { overburdened: boolean; utilizationPct: number } | null;
  own?: { overloaded: boolean; bottleneckRisk: boolean; dailyLoadPct: number } | null;
  cap?: { growthSafe: boolean; expansionTriggered: boolean; bottleneckUtilization: number } | null;
  metric?: { complaintCount: number | null; rewashCount: number | null; refundAmount: number | null; newCustomers: number | null; repeatCustomers: number | null; revenue: number | null } | null;
  supplier?: { worstStockoutRisk: string; riskScore: number; supplyCutoffRisk: boolean; belowReorderCount: number } | null;
  business?: { businessType: string } | null;
  overdueProofCount?: number;
  outcomeOpen?: number;
  reassessOpen?: number;
  prevSnapshot?: Record<string, unknown> | null;
}

function fakeDeps(rows: Rows): { deps: GuidanceDeps; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  const deps: GuidanceDeps = {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => 1_900_000_000_000,
    db: {
      ownerCashflowCycle: { findFirst: async () => rows.cash ?? null },
      ownerFinanceCycle: { findFirst: async () => rows.fin ?? null },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => rows.emp ?? null },
      ownerWorkloadSnapshot: { findFirst: async () => rows.own ?? null },
      ownerCapacitySnapshot: { findFirst: async () => rows.cap ?? null },
      ownerMetricSnapshot: { findFirst: async () => rows.metric ?? null },
      ownerSupplierInventorySnapshot: { findFirst: async () => rows.supplier ?? null },
      ownerBusiness: { findFirst: async () => rows.business ?? null },
      proof: { count: async () => rows.overdueProofCount ?? 0 },
      ownerActionOutcome: { count: async () => rows.outcomeOpen ?? 0 },
      ownerReassessmentEvent: { count: async () => rows.reassessOpen ?? 0 },
      ownerGuidanceSnapshot: {
        findFirst: async () => (rows.prevSnapshot ?? null) as never,
        create: async (args: { data: Record<string, unknown> }) => { created.push(args.data); return args.data; },
      },
    },
  };
  return { deps, created };
}


const NOW = 1_900_000_000_000;
const recent = new Date(NOW - 5 * 86_400_000);

describe("Now View — a Finance survival danger is described by its own provenance", () => {
  it("profit-driven Finance AT_RISK (margin findings only), no cash check: a profit issue, never cash danger", async () => {
    const { deps } = fakeDeps({ fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent }, findings: [{ code: "FIN_NEGATIVE_GROSS_MARGIN" }] } });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.some((i) => i.category === IssueCategory.CASH_DANGER)).toBe(false);
    const profit = ctx.issues.find((i) => i.id === "margin")!;
    expect(profit.category).toBe(IssueCategory.PROFIT_LEAK);
    expect(profit.headline).toMatch(/driven by profit and margin rather than cash/);
    expect(ctx.issues.filter((i) => i.id === "margin")).toHaveLength(1);
  });

  it("cash-driven Finance AT_RISK (a runway finding): a cash issue", async () => {
    const { deps } = fakeDeps({ fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent }, findings: [{ code: "FIN_LOW_RUNWAY" }, { code: "FIN_NEGATIVE_GROSS_MARGIN" }] } });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.find((i) => i.id === "cash")?.category).toBe(IssueCategory.CASH_DANGER);
  });

  it("SAFE cash check vs profit-driven Finance AT_RISK on the same period: not 'conflicting information about cash health'", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent } },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent }, findings: [{ code: "FIN_NEGATIVE_NET_MARGIN" }] },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(JSON.stringify(ctx.issues)).not.toMatch(/conflicting information about cash health/);
    expect(ctx.issues.some((i) => i.category === IssueCategory.CASH_DANGER)).toBe(false);
    expect(ctx.issues.find((i) => i.id === "margin")?.category).toBe(IssueCategory.PROFIT_LEAK);
    // The safety gate still treats the pair conservatively (cash is not proven safe for growth).
    expect(ctx.cashSafe).toBe(false);
  });

  it("CRITICAL cash vs profit-driven Finance: the cash danger is the cash check's own, the profit issue is separate", async () => {
    const { deps } = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent } },
      fin: { survivalState: "AT_RISK", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent }, findings: [{ code: "FIN_NEGATIVE_GROSS_MARGIN" }] },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.find((i) => i.id === "cash")).toMatchObject({ category: IssueCategory.CASH_DANGER, headline: "Cash survival (cash check) is CRITICAL." });
    expect(ctx.issues.find((i) => i.id === "margin")?.category).toBe(IssueCategory.PROFIT_LEAK);
  });
});

describe("Now View — a single SAFE reading never manufactures a cash danger", () => {
  it.each([
    ["only a SAFE cash check", { cash: { cashflowState: "SAFE", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent } } }],
    ["only a WATCH cash check", { cash: { cashflowState: "WATCH", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent } } }],
    ["only a SAFE Finance diagnosis", { fin: { survivalState: "SAFE", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent } } }],
  ] as const)("%s: no cash issue; the missing reading is requested", async (_label, rows) => {
    const { deps } = fakeDeps(rows as Rows);
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.some((i) => i.id === "cash" || i.category === IssueCategory.CASH_DANGER)).toBe(false);
    expect(ctx.cashSafe).toBe(false); // unmeasured half: growth stays gated (fail closed), but no danger is claimed
    expect(ctx.missingCriticalData.length).toBeGreaterThan(0);
  });

  it("a single UNSAFE reading still raises its issue", async () => {
    const { deps } = fakeDeps({ cash: { cashflowState: "AT_RISK", dataConfidenceScore: 0.9, snapshot: { periodEnd: recent } } });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    expect(ctx.issues.find((i) => i.id === "cash")?.headline).toMatch(/Cash survival \(cash check\) is AT_RISK/);
  });
});
