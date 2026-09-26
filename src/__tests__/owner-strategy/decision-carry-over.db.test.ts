/* eslint-disable @typescript-eslint/no-explicit-any -- the dashboard payload rows are untyped (StrategyDashboardPayload uses any) */
/**
 * Owner Strategy — carried-action validity (Decision Overhaul, case N), DB-backed.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true. Proves, through the real services, that:
 *  - a "Pursue" action engaged under the previous model and carried into a cycle whose decision
 *    forbids it (Not yet) is shown on hold on Strategy, and never reaches Home or the business
 *    condition's recommended action;
 *  - the dashboard's recommended next action is the decision's single primary step;
 *  - an engaged step that is planned again is re-worded to the current numbers (audited);
 *  - the stored legacy verdict of earlier cycles is returned as stored (never re-derived);
 *  - the additive decision payload does not cross workspaces.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/decision-carry-over.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createStrategySnapshot } from "@/services/owner-strategy/snapshot.service";
import { runStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";
import { updateStrategyAction } from "@/services/owner-strategy/action.service";
import { getStrategyDashboard } from "@/services/owner-strategy/dashboard.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const actor = randomUUID();

beforeAll(async () => {
  if (!process.env["TEST_WITH_DB"]) return;
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `strategy-carry-${actor}@example.com`, name: "Strategy Carry", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Strategy Carry Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

const common = {
  currency: "INR",
  currentRevenue: 500000,
  timeToImpactMonths: 2,
  capacityImpactPct: 10,
  staffImpact: 1,
};

describe("[db] Strategy decision — carried actions and coherent recommendation", () => {
  it("[db] a carried Pursue is on hold under Not yet and never reaches Home/condition", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    try {
      // Cycle 1: a strong, affordable option (GO) evaluated earlier.
      const s1 = await createStrategySnapshot(
        businessId,
        { ...common, periodStart: "2026-07-01", periodEnd: "2026-07-31", optionName: "Second van", expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000, cashAvailable: 400000, riskLevel: "low" },
        actor,
        workspaceId
      );
      const c1 = await runStrategyDiagnosis(businessId, s1.id, actor, workspaceId);
      expect(c1.actions.map((a: any) => a.recommendationCode)).toEqual(["STRREC_PROCEED"]);
      // Simulate an engaged action planned by the PREVIOUS model (Pursue), as existing data has.
      await db.ownerStrategyAction.create({
        data: {
          id: randomUUID(), workspaceId, businessId, cycleId: c1.id, findingId: null,
          recommendationCode: "STRREC_PURSUE", findingCode: "STR_OPP_STRONG_RETURN",
          title: "Pursue this high-return option", description: "legacy", ownerRole: "owner", status: "assigned",
          priorityScore: 70, effortScore: 45, expectedImpactScore: 50, confidence: 0.9,
          verificationMetric: "roiAnnualPct", verificationMethod: "legacy", expectedTimeframeDays: 30,
        },
      });

      // Cycle 2: the known case — Not yet, ₹50,000 short.
      const s2 = await createStrategySnapshot(
        businessId,
        { ...common, periodStart: "2026-08-01", periodEnd: "2026-08-31", optionName: "Second van", expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 150000, cashAvailable: 100000, riskLevel: "medium" },
        actor,
        workspaceId
      );
      const c2 = await runStrategyDiagnosis(businessId, s2.id, actor, workspaceId);

      const dash = await getStrategyDashboard(workspaceId, businessId);
      expect(dash.decision?.code).toBe("NOT_YET");
      expect(dash.decision?.headlineDetail).toBe("You're ₹50,000 short.");
      expect(dash.recommendedNextAction?.title).toBe("Close the ₹50,000 funding gap");
      expect(dash.recommendedNextAction?.cycleId).toBe(c2.id);
      const actions = dash.latestCycle.actions;
      const pursue = actions.find((a: any) => a.recommendationCode === "STRREC_PURSUE");
      expect(pursue.carriedFromCycleSequence).toBe(1);
      expect(pursue.decisionFit).toBe("on_hold");
      expect(pursue.decisionFitNote).toBe("On hold — doesn't fit the current decision (Not yet).");
      expect(actions.filter((a: any) => a.decisionFit === "primary")).toHaveLength(1);
      // The never-touched "Go ahead" proposal of cycle 1 is superseded, not carried.
      expect(actions.some((a: any) => a.recommendationCode === "STRREC_PROCEED")).toBe(false);
      // History keeps each cycle's stored legacy verdict, labelled as such.
      expect(dash.cycleHistory.map((h) => h.verdictSource)).toEqual(["stored_legacy_state", "stored_legacy_state"]);
      expect(dash.cycleHistory[1].strategyState).toBe(c1.strategyState);

      const home = await getOwnerHome(workspaceId, businessId);
      const homeStrategy = (home.summary?.requiredActions ?? []).filter((a) => a.domain === "strategy").map((a) => a.title);
      expect(homeStrategy).toEqual(["Close the ₹50,000 funding gap"]);

      const condition = await getBusinessCondition(workspaceId, businessId);
      const topStrategy = (condition.profile?.topActions ?? []).filter((a) => a.domain === "strategy").map((a) => a.title);
      expect(topStrategy).toEqual(["Close the ₹50,000 funding gap"]);
      expect(condition.profile?.recommendedNextAction?.title).not.toMatch(/pursue|size up|go ahead/i);

      // The owner takes on the funding step; the next evaluation (₹30,000 short) re-words it.
      await updateStrategyAction(dash.recommendedNextAction.id, { status: "assigned" }, actor, workspaceId);
      const s3 = await createStrategySnapshot(
        businessId,
        { ...common, periodStart: "2026-09-01", periodEnd: "2026-09-30", optionName: "Second van", expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 150000, cashAvailable: 120000, riskLevel: "medium" },
        actor,
        workspaceId
      );
      const c3 = await runStrategyDiagnosis(businessId, s3.id, actor, workspaceId);
      const dash3 = await getStrategyDashboard(workspaceId, businessId);
      expect(dash3.recommendedNextAction?.id).toBe(dash.recommendedNextAction.id); // carried, not duplicated
      expect(dash3.recommendedNextAction?.cycleId).toBe(c3.id);
      expect(dash3.recommendedNextAction?.title).toBe("Close the ₹30,000 funding gap");
      const carriedEvents = await db.auditEvent.findMany({
        where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_STRATEGY_ACTION_UPDATED, entityId: dash.recommendedNextAction.id },
      });
      const carried = carriedEvents.map((e) => e.payload as any).find((p) => p.reason === "carried_forward_by_diagnosis");
      expect(carried.title).toEqual({ from: "Close the ₹50,000 funding gap", to: "Close the ₹30,000 funding gap" });

      // Cross-workspace: another workspace cannot read this business's decision.
      const other = await getStrategyDashboard(randomUUID(), businessId);
      expect(other.selectedBusinessId).toBeNull();
      expect(other.decision).toBeNull();
      expect(other.latestCycle).toBeNull();
    } finally {
      await teardownOwnerBusiness(businessId);
    }
  });
});
