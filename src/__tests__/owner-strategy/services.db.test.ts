/**
 * Owner Strategy (Module 8 Slice 5) — service-layer persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with
 * the Module 8 strategy migration applied. Proves snapshot/diagnosis/findings/
 * actions/verification persistence, workspace isolation, duplicate-period
 * rejection, and invalid-transition rejection through the actual services.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createStrategySnapshot,
  getStrategySnapshot,
} from "@/services/owner-strategy/snapshot.service";
import {
  runStrategyDiagnosis,
  listStrategyCycleFindings,
  listStrategyCycleActions,
} from "@/services/owner-strategy/diagnosis.service";
import { updateStrategyAction } from "@/services/owner-strategy/action.service";
import { recordStrategyVerification } from "@/services/owner-strategy/verification.service";
import { getStrategyDashboard } from "@/services/owner-strategy/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `strategy-test-${actor}@example.com`,
      name: "Strategy Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Strategy Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function avoidScenario() {
  // Negative base case + unaffordable + high risk → guarantees findings + actions.
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    optionName: "Open a second branch",
    currentRevenue: 500000,
    expectedRevenueChange: 20000,
    costChange: 60000,
    investmentRequired: 800000,
    timeToImpactMonths: 12,
    riskLevel: "high" as const,
    cashAvailable: 100000,
    capacityImpactPct: 80,
    staffImpact: 4,
  };
}

describe("[db] Owner Strategy services", () => {
  it("[db] persists snapshot -> diagnosis -> findings -> actions and a dashboard reads them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const snap = await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);
    expect(snap.id).toBeTruthy();
    expect(snap.workspaceId).toBe(workspaceId);

    const cycle = await runStrategyDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.id).toBeTruthy();
    expect(cycle.findings.length).toBeGreaterThan(0);
    expect(cycle.actions.length).toBeGreaterThan(0);
    expect(cycle.strategyState).toBeTruthy();

    const findings = await listStrategyCycleFindings(cycle.id, workspaceId);
    const actions = await listStrategyCycleActions(cycle.id, workspaceId);
    expect(findings.length).toBe(cycle.findings.length);
    expect(actions.length).toBe(cycle.actions.length);

    const dash = await getStrategyDashboard(workspaceId, businessId);
    expect(dash.hasData).toBe(true);
    expect(dash.domainScore?.domain).toBe("strategy");
    expect(dash.recommendedNextAction).not.toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] executes an action transition and rejects an invalid one", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);
    const cycle = await runStrategyDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    const assigned = await updateStrategyAction(action.id, { status: "assigned" }, actor, workspaceId);
    expect(assigned.status).toBe("assigned");

    await expect(
      updateStrategyAction(action.id, { status: "completed" }, actor, workspaceId)
    ).rejects.toThrow(/transition/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] records a before/after verification with a real status", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);
    const cycle = await runStrategyDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    // Outcomes are recordable only once work has started (verification-evidence.ts).

    await updateStrategyAction(action.id, { status: "assigned" }, actor, workspaceId);

    await updateStrategyAction(action.id, { status: "in_progress" }, actor, workspaceId);

    const { verification, result } = await recordStrategyVerification(
      action.id,
      { beforeValue: -40000, afterValue: 10000, targetDirection: "up", targetValue: 0 },
      actor,
      workspaceId
    );
    expect(verification.id).toBeTruthy();
    expect(["verified_improved", "verified_not_improved", "inconclusive", "disputed"]).toContain(result.status);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects recording an outcome for an action whose work has not started (BIV-09)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);
    const cycle = await runStrategyDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await expect(
      recordStrategyVerification(action.id, { beforeValue: 1, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
    ).rejects.toThrow(/Start this action before recording its outcome/);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] records baseline provenance: blank before uses the measured value; a different owner value is kept as OWNER_REPORTED (BIV-10)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);
    const cycle = await runStrategyDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];
    await updateStrategyAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateStrategyAction(action.id, { status: "in_progress" }, actor, workspaceId);
    const row = await db.ownerStrategyAction.findFirst({ where: { id: action.id }, include: { finding: true } });
    const measured =
      row?.finding && row.finding.sourceMetric === row.verificationMetric && row.finding.sourceValue !== null
        ? row.finding.sourceValue
        : null;
    if (measured === null) {
      await expect(
        recordStrategyVerification(action.id, { beforeValue: null, afterValue: 2, targetDirection: "up" }, actor, workspaceId)
      ).rejects.toThrow(/before \(baseline\) value/);
    } else {
      const measuredRun = await recordStrategyVerification(action.id, { beforeValue: null, afterValue: measured, targetDirection: "up" }, actor, workspaceId);
      expect(measuredRun.verification.beforeValue).toBe(measured);
      expect(measuredRun.verification.baselineSource).toBe("MEASURED");
    }
    const reported = (measured ?? 0) + 50;
    const ownerRun = await recordStrategyVerification(action.id, { beforeValue: reported, afterValue: 1, targetDirection: "up" }, actor, workspaceId);
    expect(ownerRun.verification.beforeValue).toBe(reported);
    expect(ownerRun.verification.baselineSource).toBe("OWNER_REPORTED");
    expect(ownerRun.verification.measuredBeforeValue).toBe(measured);
    await teardownOwnerBusiness(businessId);
  });

  it("[db] rejects a duplicate snapshot for the same business + period", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);
    await expect(
      createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId)
    ).rejects.toThrow(/already exists/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace snapshot read is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createStrategySnapshot(businessId, avoidScenario(), actor, workspaceId);

    await expect(getStrategySnapshot(snap.id, ws())).rejects.toThrow();

    await teardownOwnerBusiness(businessId);
  });
});
