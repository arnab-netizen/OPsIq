/**
 * Phase 2 Slice 2 — Wealth Path read service persistence proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL.
 * Proves getWealthPath reads a real metric snapshot, derives the wealth-path
 * verdict, and enforces workspace isolation through the actual service path.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/wealth-path.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSnapshot } from "@/services/founder-recovery/snapshot.service";
import type { MetricSnapshotZodInput } from "@/domain/founder-recovery/validation";
import { getWealthPath } from "@/services/owner-strategy/wealth-path.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `wealth-path-test-${actor}@example.com`,
      name: "Wealth Path Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Wealth Path Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function snapshotInput(): MetricSnapshotZodInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    revenue: 200000,
    grossProfit: 120000, // 60% gross
    netProfit: 30000, // 15% net
    newCustomers: 20,
    repeatCustomers: 30, // 60% repeat
  };
}

describe("[db] Owner Strategy — getWealthPath", () => {
  it("[db] derives a wealth-path verdict from a persisted snapshot", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createSnapshot(businessId, snapshotInput(), actor, workspaceId);

    const out = await getWealthPath(workspaceId, businessId);
    expect(out.hasData).toBe(true);
    expect(out.selectedBusinessId).toBe(businessId);
    expect(out.input.grossMarginPct).toBe(60);
    expect(out.input.netMarginPct).toBe(15);
    expect(out.input.repeatCustomerPct).toBe(60);
    // Structural signals are absent from snapshot data → provisional, high-risk-blocked.
    expect(out.result.provisionalLowConfidence).toBe(true);
    expect(out.result.blocksHighRiskExecution).toBe(true);
    expect(out.result.pathType).toBeTruthy();
    expect(out.result.strategicOptions).toContain("validate");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] returns hasData=false when the business has no snapshot", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    const out = await getWealthPath(workspaceId, businessId);
    expect(out.selectedBusinessId).toBe(businessId);
    expect(out.hasData).toBe(false);
    expect(out.result.provisionalLowConfidence).toBe(true);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (other workspace sees no businesses)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createSnapshot(businessId, snapshotInput(), actor, workspaceId);

    const foreign = await getWealthPath(ws(), businessId);
    expect(foreign.businesses).toHaveLength(0);
    expect(foreign.selectedBusinessId).toBeNull();
    expect(foreign.hasData).toBe(false);

    await teardownOwnerBusiness(businessId);
  });
});
