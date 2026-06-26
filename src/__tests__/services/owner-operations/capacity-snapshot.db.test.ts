/**
 * Module 10 — capacity snapshot persistence proof (DB-backed).
 * `[db]`-gated → runs only under TEST_WITH_DB=true with the migration applied.
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-operations/capacity-snapshot.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { saveCapacitySnapshot, listCapacitySnapshots } from "@/services/owner-operations/capacity-snapshot.service";

const wsA = randomUUID();
const wsB = randomUUID();

afterAll(async () => {
  await db.ownerCapacitySnapshot.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module10] capacity snapshot persistence", () => {
  it("persists + reads back a computed snapshot (round-trip, JSON resources)", async () => {
    await saveCapacitySnapshot({ workspaceId: wsA, resources: [{ type: "machine", utilization: 0.7 }, { type: "staff", utilization: 0.6 }], currentRevenue: 700000 });
    const rows = await listCapacitySnapshots(wsA);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].bottleneckResource).toBe("machine");
    expect(rows[0].growthSafe).toBe(true);
  });

  it("persists expansion trigger at the cap", async () => {
    await saveCapacitySnapshot({ workspaceId: wsA, resources: [{ type: "machine", utilization: 0.95 }], currentRevenue: 700000 });
    const rows = await listCapacitySnapshots(wsA);
    expect(rows.some((r) => r.expansionTriggered && !r.growthSafe)).toBe(true);
  });

  it("enforces workspace isolation", async () => {
    await saveCapacitySnapshot({ workspaceId: wsA, resources: [{ type: "staff", utilization: 0.5 }], currentRevenue: 100 });
    expect((await listCapacitySnapshots(wsB)).length).toBe(0);
  });
});
