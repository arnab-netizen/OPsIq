/**
 * Phase 27 — runtime-backed E2E owner journey through the command center.
 *
 * `[db]`-gated → runs under TEST_WITH_DB=true against real PostgreSQL. Proves the
 * full loop from persisted state to the composed command-center payload:
 *   business state (snapshot) → wealth path → BMQ → risk-adjusted → opportunity
 *   cost → next best move → Work Package → proof requirement → owner workload
 *   transfer → command-center reflection. Also proves workspace isolation.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/command-center.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSnapshot } from "@/services/founder-recovery/snapshot.service";
import type { MetricSnapshotZodInput } from "@/domain/founder-recovery/validation";
import { getWealthCommandCenter } from "@/services/owner-strategy/command-center.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `cc-test-${actor}@example.com`, name: "CC Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "CC Journey Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId,
  );
  return b.id;
}

function snapshotInput(): MetricSnapshotZodInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    revenue: 200000,
    grossProfit: 110000, // 55% gross
    netProfit: 24000, // 12% net
    newCustomers: 20,
    repeatCustomers: 30,
  };
}

describe("[db] Owner wealth command-center — full journey", () => {
  it("[db] composes the full loop from a persisted snapshot", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createSnapshot(businessId, snapshotInput(), actor, workspaceId);

    const out = await getWealthCommandCenter(workspaceId, businessId);
    const cc = out.commandCenter;

    expect(out.hasData).toBe(true);
    expect(out.selectedBusinessId).toBe(businessId);
    // business state → wealth path + BMQ from real snapshot
    expect(cc.wealthPath).not.toBeNull();
    expect(cc.wealthPath!.quality.inputsUsed).toContain("netMarginPct");
    expect(cc.businessModelQuality).not.toBeNull();
    // risk-adjusted + opportunity cost
    expect(cc.riskAdjustedScore).not.toBeNull();
    expect(cc.opportunityCost).not.toBeNull();
    // next best move → Work Package → proof → workload transfer
    expect(["DO_THIS", "VALIDATE_FIRST", "CHOOSE_ALTERNATIVE"]).toContain(cc.nextBestMove.decision);
    expect(cc.workPackage).not.toBeNull();
    expect(cc.proofRequirement).toBeTruthy();
    expect(cc.ownerWorkloadTransfer).not.toBeNull();
    expect(cc.ownerWorkloadTransfer!.minutesSaved).toBeGreaterThanOrEqual(0);
    expect(cc.workPackage!.learningUpdateRule).toMatch(/playbook|reliability/i);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] no business → startup-mode command center (validate first)", async () => {
    const out = await getWealthCommandCenter(ws());
    expect(out.hasData).toBe(false);
    expect(out.commandCenter.mode).toBe("startup");
    expect(out.commandCenter.nextBestMove.decision).toBe("VALIDATE_FIRST");
  });

  it("[db] enforces workspace isolation", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createSnapshot(businessId, snapshotInput(), actor, workspaceId);

    const foreign = await getWealthCommandCenter(ws(), businessId);
    expect(foreign.businesses).toHaveLength(0);
    expect(foreign.selectedBusinessId).toBeNull();

    await teardownOwnerBusiness(businessId);
  });
});
