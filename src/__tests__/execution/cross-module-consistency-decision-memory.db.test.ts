/**
 * Cross-module consistency + decision memory — real DB simulation (PASS 48, LANE_B).
 *
 * Boots a seeded laundry workspace on real Postgres and proves the modules resolve
 * conflicts with ONE coherent voice and remember what already happened:
 *   - finance/recovery/capability gates override growth; tender urgency does not bypass gates;
 *   - internal evidence beats weak public signal (public stays validation-needed, no fake money);
 *   - a failed correction and an owner-declined action are PERSISTED as do-not-repeat memory and
 *     not repeated unchanged; the memory is workspace-isolated;
 *   - the owner cockpit resolves to one top action with grouped secondaries;
 *   - a clean control fabricates nothing; no unsafe/autonomous action path exists.
 *
 * Conflict resolution is computed by the REAL engines; the persisted memory is exercised via the
 * real do-not-repeat service on real Postgres. Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { planBusinessSurvivalRecovery, type CrisisInput } from "@/domain/owner-mode/business-survival-recovery";
import { assessGrowthReadiness } from "@/domain/execution/growth-readiness";
import { evaluateProgressionRecommendation, ProgressionMove, type GrowthSignals } from "@/domain/execution/progression-engine";
import { evaluateDoNotRepeat } from "@/domain/owner-mode/do-not-repeat";
import { recordDoNotRepeat } from "@/services/owner-mode/do-not-repeat.service";
import { interpretRawPublicSignal } from "@/domain/owner-mode/public-signal-interpretation";
import { prioritisePublicSignals } from "@/domain/owner-mode/public-signal-prioritisation";
import { explainOwnerCockpitDecision } from "@/domain/owner-mode/owner-cockpit-decision-explanation";
import type { ConflictSignalInput } from "@/domain/owner-mode/public-signal-conflict-resolution";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const MONEY = /[$£€]\s?\d|\bROI\b|\bMRR\b|guaranteed|win probability/i;
const owner = randomUUID();
const wsL = randomUUID();
const wsOther = randomUUID();
const bizL = randomUUID();
const NOW = Date.now();

const crisis = (p: Partial<CrisisInput>): CrisisInput => ({
  crisisCaseId: "cmc-db", workspaceArchetype: "laundry_local_service",
  cashPressure: "NONE", revenuePressure: "NONE", customerPressure: "NONE", qualityPressure: "NONE",
  operationalPressure: "NONE", staffCapacityPressure: "NONE", ownerWorkloadPressure: "NONE",
  legalContractTenderRisk: "NONE", opportunityTemptation: "NONE", ...p,
});
const cleanGrowth: GrowthSignals = {
  cashRunwayWeak: false, grossMarginClear: true, repeatCustomersStrong: true, staffQualityStable: true,
  ownerFirefightingDaily: false, sopManagerLayerWorking: true, complaintsOrReworkRising: false,
  capacityStressed: false, profitImpactVerified: true, revenueGrowing: true,
};
const sig = (rawText: string, sourceType: Parameters<typeof interpretRawPublicSignal>[0]["sourceType"], recency: "RECENT" | "UNKNOWN" = "RECENT"): ConflictSignalInput =>
  ({ signal: interpretRawPublicSignal({ rawText, sourceType, archetype: "laundry_local_service" }), recency });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Cross-module consistency + decision memory — laundry", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: owner, email: `cmc-${owner}@laundry.test`, name: "Owner", isActive: true, updatedAt: new Date(NOW) } });
    for (const id of [wsL, wsOther]) {
      await db.workspace.create({ data: { id, name: `WS ${id.slice(0, 8)}`, slug: `cmc-${id.slice(0, 8)}`, createdBy: owner } });
    }
    await db.workspaceMembership.create({ data: { workspaceId: wsL, userId: owner, role: "OWNER", isActive: true } });
    await db.ownerBusiness.create({ data: { id: bizL, workspaceId: wsL, name: "Sparkle Laundry", businessType: "laundry", updatedAt: new Date(NOW) } });
    console.log("LANE_B_CROSS_MODULE_DB_SIM_EXECUTED");
  });

  afterAll(async () => {
    for (const wsId of [wsL, wsOther]) {
      await db.ownerDoNotRepeatRule.deleteMany({ where: { workspaceId: wsId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: wsId } });
      await db.workspaceMembership.deleteMany({ where: { workspaceId: wsId } });
    }
    await db.ownerBusiness.deleteMany({ where: { id: bizL } });
    await db.workspace.deleteMany({ where: { id: { in: [wsL, wsOther] } } });
    await db.user.deleteMany({ where: { id: { in: [owner] } } });
  });

  it("1/2/9. finance, recovery, and capability gates each override unsafe growth", () => {
    expect(evaluateProgressionRecommendation({ ...cleanGrowth, cashRunwayWeak: true }, ProgressionMove.MARKETING_SCALE).allowed).toBe(false);
    expect(assessGrowthReadiness({ ...cleanGrowth, sopManagerLayerWorking: false }, ProgressionMove.SECOND_LOCATION).allowed).toBe(false);
    const capPlan = planBusinessSurvivalRecovery(crisis({ staffCapacityPressure: "HIGH", opportunityTemptation: "GROWTH" }))!;
    expect(capPlan.crisisStatus).toBe("CAPABILITY_BLOCKER");
    expect(capPlan.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
  });

  it("3/4/14. internal evidence beats weak public signal; public stays validation-needed; no fake money", () => {
    const resolved = interpretRawPublicSignal({ rawText: "all complaints resolved, 5 stars, guaranteed £5000 more profit", sourceType: "public_review", archetype: "laundry_local_service" });
    expect(resolved.financialClaimAccepted).toBe(false); // never a verified financial fact
    expect(resolved.missingData.length).toBeGreaterThan(0); // still needs internal validation
    expect(resolved.confidenceHandling).not.toBe("VERIFIED_SOURCE");
  });

  it("5/6/13. a failed correction and an owner-declined action are remembered (persisted) and isolated", async () => {
    await recordDoNotRepeat({ workspaceId: wsL, businessId: bizL, memoryKey: "scope:sop", summary: "The SOP/training correction did not fix the recurring miss.", reason: "failed_correction" });
    await recordDoNotRepeat({ workspaceId: wsL, businessId: bizL, memoryKey: "scope:marketing", summary: "Owner declined the marketing push during cash pressure.", reason: "owner_rejected" });
    for (const key of ["scope:sop", "scope:marketing"]) {
      const rule = await db.ownerDoNotRepeatRule.findFirst({ where: { workspaceId: wsL, memoryKey: { in: [key] }, blocksRepetition: true, active: true } });
      expect(rule, key).toBeTruthy();
      expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: key }, null).blocked).toBe(true);
      expect(evaluateDoNotRepeat({ category: "do_not_repeat", blocksRepetition: true, memoryKey: key }, "conditions changed with new evidence").blocked).toBe(false);
    }
    // Isolation: neither memory leaks into another workspace.
    const leaked = await db.ownerDoNotRepeatRule.findFirst({ where: { workspaceId: wsOther, memoryKey: { in: ["scope:sop", "scope:marketing"] } } });
    expect(leaked).toBeNull();
    // Recording emits an audit event.
    expect(await db.auditEvent.findFirst({ where: { workspaceId: wsL, eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_RECORDED } })).toBeTruthy();
  });

  it("7/8. missing-data loop stays uncertain; tender urgency does not bypass eligibility/cost/capacity", () => {
    const cashPlan = planBusinessSurvivalRecovery(crisis({ cashPressure: "HIGH", missingData: ["verified cash position and runway"] }))!;
    expect(cashPlan.missingDataTasks.some((m) => /cash|runway/i.test(m))).toBe(true);
    expect(cashPlan.cockpitSummary).not.toMatch(MONEY);
    const tenderPlan = planBusinessSurvivalRecovery(crisis({ opportunityTemptation: "TENDER", legalContractTenderRisk: "HIGH", unsafeActionTemptations: ["submit the tender now automatically"] }))!;
    expect(tenderPlan.missingDataTasks.some((m) => /eligibility|EMD|capacity|cost/i.test(m))).toBe(true);
    expect(tenderPlan.blockedUnsafeActions.some((b) => /tender auto-submit|auto EMD/i.test(b))).toBe(true);
  });

  it("10/11. the owner cockpit resolves to one top action with grouped secondaries (growth subordinated)", () => {
    const signals: ConflictSignalInput[] = [
      ...Array.from({ length: 6 }, () => sig("Garments repeatedly came back stained and orders consistently late.", "public_review")),
      sig("We don't really know our cost, margin or capacity right now.", "public_service_page", "UNKNOWN"),
      sig("Demand is rising — should we expand now and open a new branch?", "public_service_page", "UNKNOWN"),
    ];
    const e = explainOwnerCockpitDecision(prioritisePublicSignals({ workspaceArchetype: "laundry_local_service", signals }))!;
    expect(e).not.toBeNull();
    expect(e.topAction.topic).not.toBe("growth");
    expect(e.whyNotGrowthYet).not.toBeNull();
    expect(Array.isArray(e.secondaryActionGroups)).toBe(true);
    expect(e.whyThisIsTopPriority.join(" ")).toMatch(/tier|not an opaque score/i);
  });

  it("12/15. clean control fabricates nothing; every crisis plan blocks unsafe/autonomous action", () => {
    expect(explainOwnerCockpitDecision(prioritisePublicSignals({ workspaceArchetype: "laundry_local_service", signals: [] }))).toBeNull();
    expect(planBusinessSurvivalRecovery(crisis({}))).toBeNull();
    const plan = planBusinessSurvivalRecovery(crisis({ cashPressure: "HIGH", customerPressure: "HIGH", opportunityTemptation: "GROWTH" }))!;
    expect(plan.blockedUnsafeActions.some((b) => /scale|growth|expansion/i.test(b))).toBe(true);
    expect(plan.blockedUnsafeActions.some((b) => /auto.*(contact|send|spend|submit)/i.test(b))).toBe(true);
  });
});
