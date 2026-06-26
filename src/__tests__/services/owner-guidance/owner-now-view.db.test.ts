/**
 * Module 41 — Owner Now View snapshot persistence proof (DB-backed).
 * `[db]`-gated → runs only under TEST_WITH_DB=true with the migration applied.
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-guidance/owner-now-view.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";

const wsA = randomUUID();
const wsB = randomUUID();
const bizA = randomUUID();

afterAll(async () => {
  await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module41] owner now view snapshot persistence", () => {
  it("persists a guidance snapshot from live (empty) state and returns a payload", async () => {
    const out = await getOwnerNowView(wsA, bizA);
    expect(out.generatedFromLiveData).toBe(true);
    expect(out.view.workspaceId).toBe(wsA);

    const rows = await db.ownerGuidanceSnapshot.findMany({ where: { workspaceId: wsA }, orderBy: { createdAt: "desc" } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].businessId).toBe(bizA);
    expect(rows[0].classification).toBeTruthy();
    expect(rows[0].payload).toBeTruthy();
  });

  it("a second run detects no spurious change on an unchanged empty state", async () => {
    await getOwnerNowView(wsA, bizA);
    const out2 = await getOwnerNowView(wsA, bizA);
    // identical empty-state snapshots → no fabricated 'changed since last check'
    expect(out2.whatChanged).toHaveLength(0);
  });

  it("enforces workspace isolation (no cross-workspace snapshot leakage)", async () => {
    await getOwnerNowView(wsA, bizA);
    const rowsB = await db.ownerGuidanceSnapshot.findMany({ where: { workspaceId: wsB } });
    expect(rowsB.length).toBe(0);
  });
});
