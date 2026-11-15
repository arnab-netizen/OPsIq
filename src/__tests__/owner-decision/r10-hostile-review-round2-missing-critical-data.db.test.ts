/**
 * R10 hostile-review round 2 — the SAME root cause the Finance diagnosis-target fix (P1-1) closed
 * (`missingCriticalData` reading the last-DIAGNOSED cycle's own snapshot instead of the actual
 * diagnosis-target snapshot) was found unfixed in five other single-snapshot owner domains (Sales,
 * Cashflow, Operations, Marketing, SOP). Fixed by reading `latestSnapshot` (the real diagnosis target
 * for these domains — there is no separate "amended replacement" concept here, just the latest
 * snapshot, diagnosed or not) directly, instead of `latestCycle?.snapshot`.
 *
 * This test uses Sales as the representative domain (all five received the identical fix). Unlike a
 * bare `.toEqual` between two structurally-identical-by-default fixtures, this constructs the OLD
 * (diagnosed) snapshot and the NEW (undiagnosed) snapshot with genuinely DIFFERENT missing-data
 * profiles, so the assertion actually distinguishes fixed from broken behavior.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r10-hostile-review-round2-missing-critical-data.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";

const actor = randomUUID();
const ws = () => randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r10-round2-${actor}@example.com`, name: "R10 Round2 Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "R10 Round2 Missing Data Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id as string;
}

describe("[db] R10 hostile-review round 2: Sales missingCriticalData reflects the diagnosis TARGET, not the last-diagnosed snapshot", () => {
  it("[db] a newer, undiagnosed snapshot with a genuinely different missing-data profile is what missingCriticalData reports", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);

    // OLD snapshot: complete (revenue + customers present) -> missingCriticalData = []. Diagnosed.
    const oldSnap = await createSalesSnapshot(
      businessId,
      {
        periodStart: iso(new Date(Date.now() - 40 * DAY)), periodEnd: iso(new Date(Date.now() - 20 * DAY)),
        currency: "INR", revenue: 100000, newCustomers: 20, repeatCustomers: 30,
      },
      actor, workspaceId
    );
    await runSalesDiagnosis(businessId, oldSnap.id, actor, workspaceId);

    // NEW snapshot: a later, real period, deliberately missing BOTH customer counts (the "customers"
    // gap) — genuinely different missing-data than the old, complete, diagnosed one. Never diagnosed.
    const newSnap = await createSalesSnapshot(
      businessId,
      {
        periodStart: iso(new Date(Date.now() - 15 * DAY)), periodEnd: iso(new Date(Date.now() - 5 * DAY)),
        currency: "INR", revenue: 120000,
      },
      actor, workspaceId
    );

    const dash = await getSalesDashboard(workspaceId, businessId);
    expect(dash.latestSnapshot?.id).toBe(newSnap.id);
    // The two snapshots have genuinely DIFFERENT missing-data profiles (the assertion below only
    // proves the fix if this holds — a bug reading the wrong snapshot would otherwise pass vacuously).
    expect(newSnap.missingCriticalData).not.toEqual(oldSnap.missingCriticalData);
    // The NEW, undiagnosed snapshot is genuinely missing "customers" — the dashboard must report THIS,
    // proving it reads the actual diagnosis target, not the stale last-diagnosed (old) snapshot.
    expect(newSnap.missingCriticalData).toContain("customers");
    expect(oldSnap.missingCriticalData).not.toContain("customers");
    expect(dash.missingCriticalData).toEqual(newSnap.missingCriticalData);
    expect(dash.missingCriticalData).toContain("customers");

    await teardownOwnerBusiness(businessId);
  });
});
