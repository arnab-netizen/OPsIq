/**
 * Sales Pipeline → Owner Now View cross-domain wiring (DB-backed).
 *
 * Proves: salesDealRecord rows recorded in a workspace surface in
 * OwnerNowViewPayload.salesPipelineSummary with correct open-deal count
 * and weighted pipeline value (sum of value × probability), and that
 * closed deals (CLOSED_WON / CLOSED_LOST) are excluded from the summary.
 * Also proves workspace isolation: deal data from workspaceA does not
 * appear in workspaceB's salesPipelineSummary.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/sales-pipeline-now-view.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const actor = randomUUID();
const wsA = randomUUID(); // workspace with deals
const wsB = randomUUID(); // workspace with no deals — proves isolation

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Sales Pipeline → OwnerNowView cross-domain wiring", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `pipeline-now-${actor}@test.local`,
        name: "PipelineNowTest",
        isActive: true,
        updatedAt: new Date(),
      },
    });

    // Seed 3 open deals in wsA with known values and probabilities.
    // Weighted values: 100000×0.25=25000 (QUALIFIED), 200000×0.65=130000 (PROPOSAL), 50000×0.05=2500 (PROSPECT).
    // Total expected weighted pipeline = 157500.
    await db.salesDealRecord.createMany({
      data: [
        {
          id: randomUUID(), workspaceId: wsA, companyName: "Alpha Inc",
          stage: "QUALIFIED", value: 100000, probability: 0.25, currency: "USD",
          expectedCloseDate: new Date("2026-12-31"), updatedAt: new Date(),
        },
        {
          id: randomUUID(), workspaceId: wsA, companyName: "Beta Ltd",
          stage: "PROPOSAL", value: 200000, probability: 0.65, currency: "USD",
          expectedCloseDate: new Date("2026-12-31"), updatedAt: new Date(),
        },
        {
          id: randomUUID(), workspaceId: wsA, companyName: "Gamma Co",
          stage: "PROSPECT", value: 50000, probability: 0.05, currency: "USD",
          expectedCloseDate: new Date("2026-12-31"), updatedAt: new Date(),
        },
        // One closed deal — must be excluded from pipeline summary.
        {
          id: randomUUID(), workspaceId: wsA, companyName: "Delta Corp",
          stage: "CLOSED_WON", value: 999000, probability: 1.0, currency: "USD",
          expectedCloseDate: new Date("2026-06-30"), updatedAt: new Date(),
        },
        {
          id: randomUUID(), workspaceId: wsA, companyName: "Epsilon LLC",
          stage: "CLOSED_LOST", value: 999000, probability: 0.0, currency: "USD",
          expectedCloseDate: new Date("2026-06-30"), updatedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.salesDealRecord.deleteMany({ where: { workspaceId: wsA } });
    await db.user.delete({ where: { id: actor } });
  });

  it("salesPipelineSummary reflects only open deals and correct weighted value", async () => {
    const out = await getOwnerNowView(wsA, null);

    expect(out.salesPipelineSummary).not.toBeNull();
    const summary = out.salesPipelineSummary!;

    // 3 open deals (QUALIFIED, PROPOSAL, PROSPECT); 2 closed deals excluded.
    expect(summary.openDealsCount).toBe(3);

    // 100000×0.25 + 200000×0.65 + 50000×0.05 = 25000 + 130000 + 2500 = 157500
    expect(summary.weightedPipelineValue).toBeCloseTo(157500, 2);
  });

  it("workspace isolation: wsB has no deals so salesPipelineSummary shows empty pipeline", async () => {
    const out = await getOwnerNowView(wsB, null);

    // The live path always populates salesPipelineSummary (salesDealRecord is present in the live db).
    expect(out.salesPipelineSummary).not.toBeNull();
    const summary = out.salesPipelineSummary!;

    // wsB was never seeded — must see zero open deals, zero weighted value.
    expect(summary.openDealsCount).toBe(0);
    expect(summary.weightedPipelineValue).toBe(0);
  });

  it("closed deals (CLOSED_WON / CLOSED_LOST) are excluded from weightedPipelineValue", async () => {
    // Seeded CLOSED_WON at 999000×1.0 and CLOSED_LOST at 999000×0.0.
    // If closed stages leaked in, weightedPipelineValue would be 157500 + 999000 = 1156500.
    const out = await getOwnerNowView(wsA, null);
    expect(out.salesPipelineSummary!.weightedPipelineValue).toBeCloseTo(157500, 2);
    expect(out.salesPipelineSummary!.openDealsCount).toBe(3);
  });
});
