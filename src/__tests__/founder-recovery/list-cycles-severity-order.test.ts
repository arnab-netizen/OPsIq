/**
 * Regression: the recovery cycle list (GET /api/owner/recovery/businesses/[id]/cycles)
 * returns each cycle's findings in canonical severity order, the same order getCycle
 * and the recovery dashboard use. Mocked db returns findings least severe first.
 */
import { describe, it, expect, vi } from "vitest";

const cycleFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { recoveryCycle: { findMany: (...a: unknown[]) => cycleFindMany(...a) } },
  getDbInstance: vi.fn(),
}));
vi.mock("@/services/founder-recovery/business.service", () => ({
  getBusiness: vi.fn(async () => ({ id: "b-1" })),
}));

import { listCycles } from "@/services/founder-recovery/cycle.service";

describe("recovery listCycles — findings in canonical severity order", () => {
  it("ranks critical → high → medium (confidence tie-break) → low and loads every ranking column", async () => {
    cycleFindMany.mockResolvedValue([
      {
        id: "c-1",
        cycleNumber: 1,
        actions: [],
        findings: [
          { id: "1", code: "R_LOW", severity: "low", confidence: 0.9 },
          { id: "2", code: "R_MED_A", severity: "medium", confidence: 0.3 },
          { id: "3", code: "R_MED_B", severity: "medium", confidence: 0.8 },
          { id: "4", code: "R_HIGH", severity: "high", confidence: 0.5 },
          { id: "5", code: "R_CRIT", severity: "critical", confidence: 0.1 },
        ],
      },
    ]);
    const cycles = await listCycles("b-1", "ws-1");
    expect(cycles[0].findings.map((f: { code: string }) => f.code)).toEqual(["R_CRIT", "R_HIGH", "R_MED_B", "R_MED_A", "R_LOW"]);
    const args = JSON.stringify(cycleFindMany.mock.calls[0][0]);
    expect(args).not.toMatch(/"severity":"(asc|desc)"/);
    expect(cycleFindMany.mock.calls[0][0].include.findings.select).toMatchObject({ code: true, severity: true, confidence: true });
  });
});
