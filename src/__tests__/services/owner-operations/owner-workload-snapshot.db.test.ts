/**
 * Module 9 — owner workload snapshot persistence proof (DB-backed).
 * `[db]`-gated → runs only under TEST_WITH_DB=true with the migration applied.
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-operations/owner-workload-snapshot.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { saveOwnerWorkloadSnapshot, listOwnerWorkloadSnapshots } from "@/services/owner-operations/owner-workload-snapshot.service";
import { OwnerLoadBand } from "@/domain/execution/owner-workload";

const wsA = randomUUID();
const wsB = randomUUID();

afterAll(async () => {
  await db.ownerWorkloadSnapshot.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module9] owner workload snapshot persistence", () => {
  it("persists + reads back a computed snapshot (round-trip)", async () => {
    await saveOwnerWorkloadSnapshot({ workspaceId: wsA, ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 });
    const rows = await listOwnerWorkloadSnapshots(wsA);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].band).toBe(OwnerLoadBand.SUSTAINABLE);
  });

  it("persists overload + relief path", async () => {
    await saveOwnerWorkloadSnapshot({ workspaceId: wsA, ownerMinutesPerDay: 520, sustainableMinutesPerDay: 480, hasDelegatableTasks: true });
    const rows = await listOwnerWorkloadSnapshots(wsA);
    expect(rows.some((r) => r.overloaded && r.recommendedPath === "DELEGATE")).toBe(true);
  });

  it("enforces workspace isolation", async () => {
    await saveOwnerWorkloadSnapshot({ workspaceId: wsA, ownerMinutesPerDay: 300, sustainableMinutesPerDay: 480 });
    expect((await listOwnerWorkloadSnapshots(wsB)).length).toBe(0);
  });
});
