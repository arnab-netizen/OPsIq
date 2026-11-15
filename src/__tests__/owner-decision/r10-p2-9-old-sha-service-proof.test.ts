/**
 * R10 P2-9 — real-service (observable Now View) before-fix proof, NOT dependent on the new
 * cashFinanceOwnerNarrative helper. Exercises assembleGuidanceContext (the actual Now View
 * assembly/API contract) directly, so the SAME test file can be copied onto an old worktree
 * (62a971372bfef559e76ce205a43b5caa321f7b39) and run against the pre-P2-9 implementation.
 *
 * Case B: Cash current SAFE + Finance stale CRITICAL. Required observable behavior:
 *   - does NOT claim current Finance CRITICAL (no issue asserts Finance is presently CRITICAL);
 *   - does NOT say cash itself is currently dangerous (no CASH_DANGER issue for "cash");
 *   - explicitly says Cash is currently safe;
 *   - explicitly says Finance is out of date;
 *   - overall financial safety cannot be confirmed;
 *   - growth is not ready (ctx.growthGatePassed === false, ctx.cashSafe === false) and the
 *     missing/refresh-evidence contract points at Finance.
 *
 * Also includes current-unsafe Cash + stale SAFE Finance (Case A) as a cheap second case.
 */
import { describe, it, expect } from "vitest";
import { assembleGuidanceContext, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";

interface Rows {
  cash?: { cashflowState: string; dataConfidenceScore: number; createdAt?: Date; snapshot?: { periodEnd: Date } } | null;
  fin?: { survivalState: string; dataConfidenceScore: number; createdAt?: Date; snapshot?: { periodEnd: Date; supersededById?: string | null } } | null;
}

const NOW = 1_900_000_000_000;
const daysBefore = (n: number) => new Date(NOW - n * 86_400_000);

function fakeDeps(rows: Rows): GuidanceDeps {
  return {
    uuid: () => "00000000-0000-0000-0000-000000000001",
    now: () => NOW,
    db: {
      ownerCashflowCycle: { findFirst: async () => rows.cash ?? null },
      ownerFinanceCycle: { findFirst: async () => rows.fin ?? null },
      ownerEmployeeWorkloadSnapshot: { findFirst: async () => null },
      ownerWorkloadSnapshot: { findFirst: async () => null },
      ownerCapacitySnapshot: { findFirst: async () => null },
      ownerMetricSnapshot: { findFirst: async () => null },
      ownerSupplierInventorySnapshot: { findFirst: async () => null },
      ownerBusiness: { findFirst: async () => ({ businessType: "laundry_local_service" }) },
      proof: { count: async () => 0 },
      ownerActionOutcome: { count: async () => 0 },
      ownerReassessmentEvent: { count: async () => 0 },
      ownerGuidanceSnapshot: { findFirst: async () => null, create: async (args: { data: Record<string, unknown> }) => args.data },
    },
  } as unknown as GuidanceDeps;
}

describe("[R10 P2-9 old-SHA proof] Now View — Case B: current SAFE cash + stale CRITICAL finance", () => {
  it("names Cash as currently safe, Finance as out of date, and never asserts current Finance CRITICAL or a cash danger", async () => {
    const deps = fakeDeps({
      cash: { cashflowState: "SAFE", dataConfidenceScore: 90, snapshot: { periodEnd: daysBefore(5) } },
      fin: { survivalState: "CRITICAL", dataConfidenceScore: 90, snapshot: { periodEnd: daysBefore(60) } }, // outside the freshness window
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    const allText = JSON.stringify(ctx.issues);

    // Does NOT claim current Finance CRITICAL:
    expect(allText).not.toMatch(/Financial survival[^"]*is CRITICAL\b/);
    expect(allText).not.toMatch(/financial survival CRITICAL(?!,? but)/);
    // Does NOT say cash itself is currently dangerous:
    expect(ctx.issues.some((i) => i.id === "cash")).toBe(false);
    // Explicitly says Cash is currently safe, Finance is out of date, overall safety unconfirmed:
    expect(allText).toMatch(/Cash is currently safe/i);
    expect(allText).toMatch(/Finance figures are out of date/i);
    expect(allText).toMatch(/cannot confirm overall financial safety/i);
    // Growth not ready / evidence refresh required per the existing DTO:
    expect(ctx.growthGatePassed).toBe(false);
    expect(ctx.cashSafe).toBe(false);
    expect(ctx.missingCriticalData.some((m) => /current cash and Finance figures|out of date/i.test(m))).toBe(true);
  });
});

describe("[R10 P2-9 old-SHA proof] Now View — Case A: current CRITICAL cash + stale SAFE finance", () => {
  it("names the cash danger as current, never downgrades it because of a stale SAFE finance reading", async () => {
    const deps = fakeDeps({
      cash: { cashflowState: "CRITICAL", dataConfidenceScore: 90, snapshot: { periodEnd: daysBefore(5) } },
      fin: { survivalState: "SAFE", dataConfidenceScore: 90, snapshot: { periodEnd: daysBefore(60) } },
    });
    const { ctx } = await assembleGuidanceContext("ws1", "biz1", deps);
    const cash = ctx.issues.find((i) => i.id === "cash");
    expect(cash).toBeDefined();
    expect(cash?.severity).toBe("CRITICAL");
    expect(cash?.headline).toMatch(/CRITICAL/);
    expect(cash?.headline).not.toMatch(/conflicting information/i);
    expect(cash?.headline).not.toMatch(/missing/i);
    expect(ctx.growthGatePassed).toBe(false);
  });
});
