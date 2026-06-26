/**
 * Module 8 — employee workload snapshot persistence proof (DB-backed).
 * `[db]`-gated → runs only under TEST_WITH_DB=true with the migration applied.
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-operations/employee-workload-snapshot.db.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { saveEmployeeWorkloadSnapshot, listEmployeeWorkloadSnapshots } from "@/services/owner-operations/employee-workload-snapshot.service";
import { WorkloadBand } from "@/domain/execution/employee-workload";

const wsA = randomUUID();
const wsB = randomUUID();

afterAll(async () => {
  await db.ownerEmployeeWorkloadSnapshot.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
});

describe("[db][module8] employee workload snapshot persistence", () => {
  it("persists + reads back a computed snapshot (round-trip)", async () => {
    await saveEmployeeWorkloadSnapshot({ workspaceId: wsA, employeeLabel: "R", shiftHours: 8, taskHours: 4, travelHours: 1 });
    const rows = await listEmployeeWorkloadSnapshots(wsA);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].band).toBeDefined();
  });

  it("persists an unsustainable band + overburden flag", async () => {
    await saveEmployeeWorkloadSnapshot({ workspaceId: wsA, employeeLabel: "S", shiftHours: 8, taskHours: 8, overtimeHours: 2 });
    const rows = await listEmployeeWorkloadSnapshots(wsA);
    expect(rows.some((r) => r.band === WorkloadBand.UNSUSTAINABLE && r.overburdened)).toBe(true);
  });

  it("enforces workspace isolation", async () => {
    await saveEmployeeWorkloadSnapshot({ workspaceId: wsA, employeeLabel: "only-A", shiftHours: 8, taskHours: 4 });
    const wsBRows = await listEmployeeWorkloadSnapshots(wsB);
    expect(wsBRows.every((r) => r.employeeLabel !== "only-A")).toBe(true);
  });
});
