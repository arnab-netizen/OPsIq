/**
 * Owner Strategy — explicit scenario evaluation through the real services (production polish).
 *
 * Production acceptance: "Evaluate" silently used the saved scenario with the latest assessment
 * period, so a new scenario for an earlier period was ignored. Proves, against a real database:
 *  - the dashboard lists every saved scenario and marks the one the current decision came from;
 *  - evaluating the OLDER scenario while a NEWER one exists yields the older scenario's decision
 *    (Home and business condition follow it), and vice versa;
 *  - missing-input reporting follows the evaluated scenario, not the latest period;
 *  - history rows name the scenario each evaluation used and keep the stored legacy rating;
 *  - completing an action or verifying one successfully re-evaluates the scenario behind the
 *    current decision, never silently switching to the latest-period scenario;
 *  - a duplicate assessment period is refused (409 ConflictError);
 *  - the payload does not cross workspaces.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/scenario-selection.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createStrategySnapshot } from "@/services/owner-strategy/snapshot.service";
import { runStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";
import { getStrategyDashboard } from "@/services/owner-strategy/dashboard.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { updateStrategyAction } from "@/services/owner-strategy/action.service";
import { recordStrategyVerification } from "@/services/owner-strategy/verification.service";
import { ConflictError } from "@/infra/errors";

const actor = randomUUID();

beforeAll(async () => {
  if (!process.env["TEST_WITH_DB"]) return;
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `strategy-scenario-${actor}@example.com`, name: "Strategy Scenario", isActive: true, updatedAt: new Date() },
  });
});

const common = { currency: "INR", currentRevenue: 500000, timeToImpactMonths: 2, capacityImpactPct: 10, staffImpact: 1 };

describe("[db] Strategy — the owner's chosen scenario drives the decision", () => {
  it("[db] older vs newer period: decision, Home and condition follow the explicitly evaluated scenario", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const workspaceId = randomUUID();
    const b = await createBusiness(
      { name: "Scenario Select QA", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actor,
      workspaceId
    );
    const businessId = b.id;
    try {
      // Newer period (Go) saved first; the older period (Not yet, ₹50,000 short) is entered later.
      const newer = await createStrategySnapshot(
        businessId,
        { ...common, periodStart: "2026-09-01", periodEnd: "2026-09-30", optionName: "Price rise", expectedRevenueChange: 60000, costChange: 12000, investmentRequired: 150000, cashAvailable: 400000, riskLevel: "low" },
        actor,
        workspaceId
      );
      const older = await createStrategySnapshot(
        businessId,
        { ...common, capacityImpactPct: undefined, periodStart: "2026-07-01", periodEnd: "2026-07-31", optionName: "Second van", expectedRevenueChange: 30000, costChange: 12000, investmentRequired: 150000, cashAvailable: 100000, riskLevel: "medium" },
        actor,
        workspaceId
      );

      const before = await getStrategyDashboard(workspaceId, businessId);
      expect(before.hasData).toBe(false);
      expect(before.scenarios.map((s) => s.id)).toEqual([newer.id, older.id]); // newest period first
      expect(before.scenarios.every((s) => s.lastEvaluationSequence === null && !s.isCurrentDecision)).toBe(true);

      // Evaluate the OLDER scenario explicitly — the newer period must not be used.
      const c1 = await runStrategyDiagnosis(businessId, older.id, actor, workspaceId);
      const d1 = await getStrategyDashboard(workspaceId, businessId);
      expect(d1.latestCycle.snapshotId).toBe(older.id);
      expect(d1.decision?.code).toBe("NOT_YET");
      expect(d1.decision?.headlineDetail).toBe("You're ₹50,000 short.");
      expect(d1.scenarios.find((s) => s.id === older.id)).toMatchObject({ isCurrentDecision: true, lastEvaluationSequence: c1.sequenceNumber });
      expect(d1.scenarios.find((s) => s.id === newer.id)).toMatchObject({ isCurrentDecision: false, lastEvaluationSequence: null });
      // Missing inputs are the evaluated scenario's, not the latest period's.
      const olderRow = await db.ownerStrategySnapshot.findUniqueOrThrow({ where: { id: older.id } });
      expect(d1.missingCriticalData).toEqual(olderRow.missingCriticalData);
      const home1 = await getOwnerHome(workspaceId, businessId);
      expect((home1.summary?.requiredActions ?? []).filter((a) => a.domain === "strategy").map((a) => a.title)).toEqual(["Close the ₹50,000 funding gap"]);
      const cond1 = await getBusinessCondition(workspaceId, businessId);
      expect(cond1.profile?.recommendedNextAction?.title).not.toMatch(/pursue|size up|go ahead/i);

      // Now the NEWER scenario explicitly.
      const c2 = await runStrategyDiagnosis(businessId, newer.id, actor, workspaceId);
      const d2 = await getStrategyDashboard(workspaceId, businessId);
      expect(d2.latestCycle.snapshotId).toBe(newer.id);
      expect(d2.decision?.code).toBe("GO");
      expect(d2.scenarios.find((s) => s.id === newer.id)).toMatchObject({ isCurrentDecision: true, lastEvaluationSequence: c2.sequenceNumber });
      expect(d2.scenarios.find((s) => s.id === older.id)).toMatchObject({ isCurrentDecision: false, lastEvaluationSequence: c1.sequenceNumber });
      // History names the scenario each evaluation used and keeps the stored legacy rating.
      expect(d2.cycleHistory.map((h) => h.scenario?.optionName)).toEqual(["Price rise", "Second van"]);
      expect(d2.cycleHistory[1]).toMatchObject({ verdictSource: "stored_legacy_state", strategyState: c1.strategyState });
      expect(d2.cycleHistory[1].scenario).toMatchObject({ id: older.id, periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-07-31T00:00:00.000Z" });

      // Back to the older one: evaluation follows the choice, not the period.
      await runStrategyDiagnosis(businessId, older.id, actor, workspaceId);
      const d3 = await getStrategyDashboard(workspaceId, businessId);
      expect(d3.decision?.code).toBe("NOT_YET");
      expect(d3.scenarios.find((s) => s.id === older.id)?.isCurrentDecision).toBe(true);

      // Completing the current step re-evaluates the CURRENT scenario (older), not the latest period.
      const step = d3.recommendedNextAction;
      expect(step?.title).toBe("Close the ₹50,000 funding gap");
      await updateStrategyAction(step.id, { status: "assigned" }, actor, workspaceId);
      await updateStrategyAction(step.id, { status: "in_progress" }, actor, workspaceId);
      await updateStrategyAction(step.id, { status: "completed", completionNotes: "Loan agreed", completionEvidence: ["bank letter"] }, actor, workspaceId);
      const d4 = await getStrategyDashboard(workspaceId, businessId);
      expect(d4.latestCycle.sequenceNumber).toBeGreaterThan(d3.latestCycle.sequenceNumber); // a re-evaluation happened
      expect(d4.latestCycle.snapshotId).toBe(older.id);
      expect(d4.decision?.code).toBe("NOT_YET");
      expect(d4.scenarios.find((s) => s.id === older.id)?.isCurrentDecision).toBe(true);

      // A successful verification also re-evaluates the current scenario.
      const d4step = (d4.latestCycle.actions as Array<{ id: string }>).find((a) => a.id === step.id) ?? step;
      await recordStrategyVerification(d4step.id, { beforeValue: 100000, afterValue: 150000, targetDirection: "up", targetValue: 150000 }, actor, workspaceId);
      const d5 = await getStrategyDashboard(workspaceId, businessId);
      expect(d5.latestCycle.sequenceNumber).toBeGreaterThan(d4.latestCycle.sequenceNumber);
      expect(d5.latestCycle.snapshotId).toBe(older.id);
      expect(d5.decision?.code).toBe("NOT_YET");

      // Duplicate period is refused.
      await expect(
        createStrategySnapshot(businessId, { ...common, periodStart: "2026-07-01", periodEnd: "2026-07-31", optionName: "Again" }, actor, workspaceId)
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await db.ownerStrategySnapshot.count({ where: { businessId } })).toBe(2);

      // Another workspace cannot see the scenarios.
      const other = await getStrategyDashboard(randomUUID(), businessId);
      expect(other.scenarios).toEqual([]);
      expect(other.selectedBusinessId).toBeNull();
    } finally {
      await teardownOwnerBusiness(businessId);
    }
  });
});
