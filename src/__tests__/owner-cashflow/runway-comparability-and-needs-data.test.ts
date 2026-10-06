/**
 * P1-4 second amendment (pure): runway comparability transitions, the owner-dashboard `needs_data` contract, and the
 * source-level rule that the Now View flag answers "does CURRENT Cashflow evidence support the runway proxy".
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { detectChanges, type BusinessStateSnapshot } from "@/domain/owner-guidance/change-detection";
import { calculateWorkspaceHealth } from "@/services/owner-mode/dashboard.service";
import { HealthStatus, validateWorkspaceHealth } from "@/domain/owner-mode/owner-dashboard";

const snap = (over: Partial<BusinessStateSnapshot> = {}): BusinessStateSnapshot => ({ cashRunwayDays: 120, netMarginPct: 10, complaintsCount: 0, reworkCount: 0, capacityUtilizationPct: 0, staffOverloadPct: 0, ownerLoadPct: 0, churnRiskScore: 0, supplierInventoryRiskScore: 0, overdueProofCount: 0, outcomeChecksDue: 0, growthReadinessTier: "STABILIZE_FIRST", ...over });
const runway = (a: BusinessStateSnapshot, b: BusinessStateSnapshot) => detectChanges(a, b).map((c) => c.reason).filter((r) => /runway/i.test(r));

describe("runway change messages need BOTH sides measured", () => {
  const measured = (d: number) => snap({ cashRunwayDays: d, cashRunwayMeasured: true });
  const unmeasured = (d: number) => snap({ cashRunwayDays: d, cashRunwayMeasured: false });
  it("measured → unmeasured: no 'fell' message (stale/absent/incomplete Cashflow)", () => {
    expect(runway(measured(120), unmeasured(0))).toEqual([]);
  });
  it("unmeasured → measured: no 'rose' message", () => {
    expect(runway(unmeasured(0), measured(120))).toEqual([]);
  });
  it("unmeasured → unmeasured: no runway message", () => {
    expect(runway(unmeasured(120), unmeasured(0))).toEqual([]);
  });
  it("measured → measured: existing behaviour preserved (fell and rose)", () => {
    expect(runway(measured(120), measured(45))).toEqual(["Cash runway fell from 120 to 45 days."]);
    expect(runway(measured(45), measured(120))).toEqual(["Cash runway rose from 45 to 120 days."]);
  });
  it("legacy history without the flag is treated as measured (compatibility)", () => {
    expect(runway(snap(), measured(45))).toEqual(["Cash runway fell from 120 to 45 days."]);
    expect(runway(snap(), snap({ cashRunwayDays: 45 }))).toEqual(["Cash runway fell from 120 to 45 days."]);
    expect(runway(snap(), unmeasured(0))).toEqual([]);
  });
});

describe("Now View comparable-runway flag (source rule)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../services/owner-guidance/owner-now-view.service.ts"), "utf8");
  it("is true only for a CURRENT cash state with a complete position — not merely 'not incomplete'", () => {
    const m = src.match(/cashRunwayMeasured: ([^\n]+),\n/);
    expect(m?.[1]).toBe("!!cashState && !(cash?.cashPosition.judged && !cash.cashPosition.complete)");
    // cashState is the CURRENT-only cash state (stale / absent / future-dated / superseded → undefined)
    expect(src).toMatch(/const cashState: string \| undefined = cashFinanceResolution\.cashCurrent \?/);
  });
});

const WS = "11111111-1111-4111-8111-111111111111";
const ctx = { workspaceId: WS, userId: "22222222-2222-4222-8222-222222222222" };
const e = (id: string, status: "critical" | "at_risk" | "healthy" | "improving" | "needs_data", needsDataReason?: string) => ({ engagementId: id, status, needsDataReason, kpiOnTrackCount: 1, kpiTotalCount: 1 });

describe("owner dashboard: an evidence gap is NEEDS_DATA — never healthy / at-risk / critical / improving", () => {
  const REASON = "Cash position not confirmed: enter the missing bank balance (enter 0 if there is none).";
  it("a lone evidence-gap business is counted only as needs-data and the workspace needs data", async () => {
    const h = await calculateWorkspaceHealth(ctx, [e("a", "needs_data", REASON)]);
    expect(h.overallStatus).toBe(HealthStatus.NEEDS_DATA);
    expect([h.healthyEngagements, h.atRiskEngagements, h.criticalEngagements, h.needsDataEngagements]).toEqual([0, 0, 0, 1]);
    expect(h.needsDataItems).toEqual([REASON]);
    expect(h.engagementHealthSnapshots[0].status).toBe(HealthStatus.NEEDS_DATA);
    const words = JSON.stringify([h.topRisks, h.recommendedActions, h.engagementHealthSnapshots[0].recommendation, h.engagementHealthSnapshots[0].riskFactors]);
    expect(words).not.toMatch(/at.risk|critical|unsafe|deteriorat|on track|healthy/i);
    expect(words).toMatch(/bank balance|cash in hand|missing figure/i);
    expect(validateWorkspaceHealth(h)).toEqual([]);
  });
  it("unknown + healthy is needs-data, not healthy/improving", async () => {
    expect((await calculateWorkspaceHealth(ctx, [e("a", "needs_data"), e("b", "healthy")])).overallStatus).toBe(HealthStatus.NEEDS_DATA);
  });
  it("unknown A + genuine at-risk B: B drives AT_RISK; A is not counted as measured risk and does not dilute it", async () => {
    const h = await calculateWorkspaceHealth(ctx, [e("a", "needs_data"), e("b", "at_risk"), e("c", "healthy"), e("d", "healthy"), e("f", "needs_data"), e("g", "needs_data")]);
    expect(h.atRiskEngagements).toBe(1);
    expect(h.overallStatus).toBe(HealthStatus.AT_RISK);
  });
  it("unknown A + genuine critical B: B drives CRITICAL", async () => {
    const h = await calculateWorkspaceHealth(ctx, [e("a", "needs_data"), e("b", "critical")]);
    expect(h.overallStatus).toBe(HealthStatus.CRITICAL);
    expect(h.criticalEngagements).toBe(1);
    expect(h.atRiskEngagements).toBe(0);
  });
  it("without any needs-data business the measured behaviour is unchanged", async () => {
    expect((await calculateWorkspaceHealth(ctx, [e("a", "healthy")])).overallStatus).toBe(HealthStatus.IMPROVING);
    expect((await calculateWorkspaceHealth(ctx, [e("a", "at_risk")])).overallStatus).toBe(HealthStatus.AT_RISK);
    expect((await calculateWorkspaceHealth(ctx, [e("a", "healthy"), e("b", "healthy"), e("c", "at_risk")])).needsDataEngagements).toBe(0);
  });
  it("the route classifies through the shared helper, which maps an evidence gap to needs_data, never to at_risk", () => {
    const route = fs.readFileSync(path.resolve(__dirname, "../../app/api/owner/dashboard/route.ts"), "utf8");
    expect(route).toMatch(/classifyDashboardHealth\(/);
    const src = fs.readFileSync(path.resolve(__dirname, "../../services/owner-spine/dashboard-health-classification.ts"), "utf8");
    expect(src).not.toMatch(/!reading\.gateEvidenceSufficient \? "at_risk"/);
    expect(src).toMatch(/!reading\.gateEvidenceSufficient \? "needs_data"/);
  });
});
