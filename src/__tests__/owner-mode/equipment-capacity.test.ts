/**
 * Jarvis 360 Slice 7 — equipment capacity (pure) + growth gate (DI). No DB.
 */
import { describe, it, expect, vi } from "vitest";
import {
  assessEquipmentCapacity,
  assessFleetCapacity,
  capacityBlocksGrowth,
} from "@/domain/owner-mode/equipment-capacity";
import {
  enforceCapacitySafetyForPromotion,
  CapacitySafetyGateError,
  type CapacityDeps,
} from "@/services/owner-mode/recommendation-capacity-safety.service";

const NOW = new Date("2026-06-28T00:00:00Z");

describe("equipment-capacity — module contract assertions", () => {
  it("assessEquipmentCapacity is a function", () => { expect(typeof assessEquipmentCapacity).toBe("function"); });
  it("assessFleetCapacity is a function", () => { expect(typeof assessFleetCapacity).toBe("function"); });
  it("capacityBlocksGrowth is a function", () => { expect(typeof capacityBlocksGrowth).toBe("function"); });
  it("enforceCapacitySafetyForPromotion is a function", () => { expect(typeof enforceCapacitySafetyForPromotion).toBe("function"); });
  it("CapacitySafetyGateError is a function", () => { expect(typeof CapacitySafetyGateError).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("assessEquipmentCapacity with safe input returns an object", () => { expect(typeof assessEquipmentCapacity({ utilization: 0.5, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW)).toBe("object"); });
  it("assessEquipmentCapacity result has status field", () => { expect(assessEquipmentCapacity({ utilization: 0.5, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW)).toHaveProperty("status"); });
  it("assessEquipmentCapacity safe input status is 'safe'", () => { expect(assessEquipmentCapacity({ utilization: 0.5, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW).status).toBe("safe"); });
  it("assessFleetCapacity([]) returns an object", () => { expect(typeof assessFleetCapacity([], NOW)).toBe("object"); });
  it("assessFleetCapacity([]).status is 'safe'", () => { expect(assessFleetCapacity([], NOW).status).toBe("safe"); });
  it("capacityBlocksGrowth('safe') is false", () => { expect(capacityBlocksGrowth("safe")).toBe(false); });
  it("capacityBlocksGrowth('blocked') is true", () => { expect(capacityBlocksGrowth("blocked")).toBe(true); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
});

describe("assessEquipmentCapacity", () => {
  it("blocks when down or maintenance overdue", () => {
    expect(assessEquipmentCapacity({ utilization: 0.1, downtimeState: "down", maintenanceDueAt: null, status: "operational" }, NOW).status).toBe("blocked");
    expect(assessEquipmentCapacity({ utilization: 0.1, downtimeState: "up", maintenanceDueAt: new Date("2026-06-01Z"), status: "operational" }, NOW).status).toBe("blocked");
  });
  it("grades utilization bands", () => {
    expect(assessEquipmentCapacity({ utilization: 0.97, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW).status).toBe("high_risk");
    expect(assessEquipmentCapacity({ utilization: 0.88, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW).status).toBe("caution");
    expect(assessEquipmentCapacity({ utilization: 0.5, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW).status).toBe("safe");
  });
  it("cautions on unknown utilization", () => {
    expect(assessEquipmentCapacity({ utilization: null, downtimeState: "up", maintenanceDueAt: null, status: "operational" }, NOW).status).toBe("caution");
  });
});

describe("assessFleetCapacity", () => {
  it("is safe with no equipment (non-equipment business not gated)", () => {
    expect(assessFleetCapacity([], NOW).status).toBe("safe");
  });
  it("takes the worst machine and lists bottlenecks", () => {
    const r = assessFleetCapacity(
      [
        { name: "washer", utilization: 0.5, downtimeState: "up", maintenanceDueAt: null, status: "operational" },
        { name: "dryer", utilization: 0.97, downtimeState: "up", maintenanceDueAt: null, status: "operational" },
      ],
      NOW
    );
    expect(r.status).toBe("high_risk");
    expect(r.bottlenecks).toContain("dryer");
  });
});

it("capacityBlocksGrowth at high_risk and blocked only", () => {
  expect(capacityBlocksGrowth("caution")).toBe(false);
  expect(capacityBlocksGrowth("high_risk")).toBe(true);
  expect(capacityBlocksGrowth("blocked")).toBe(true);
});

function deps(impactArea: string, fleet: Array<{ name: string; utilization: number | null; downtimeState: string; maintenanceDueAt: Date | null; status: string }>): CapacityDeps {
  return {
    now: () => NOW,
    db: {
      recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
      finding: { findFirst: vi.fn(async () => ({ impactArea })) },
      ownerEquipment: { findMany: vi.fn(async () => fleet) },
    },
  };
}

describe("enforceCapacitySafetyForPromotion (DI)", () => {
  it("blocks a growth rec when a machine is down", async () => {
    const d = deps("growth expansion", [{ name: "press", utilization: 0.2, downtimeState: "down", maintenanceDueAt: null, status: "operational" }]);
    await expect(enforceCapacitySafetyForPromotion("rec1", "ws1", d)).rejects.toBeInstanceOf(CapacitySafetyGateError);
  });
  it("allows a growth rec when capacity is safe", async () => {
    const d = deps("growth expansion", [{ name: "press", utilization: 0.4, downtimeState: "up", maintenanceDueAt: null, status: "operational" }]);
    await expect(enforceCapacitySafetyForPromotion("rec1", "ws1", d)).resolves.toBeUndefined();
  });
  it("skips non-growth recommendations (no equipment read needed)", async () => {
    const d = deps("finance cash", [{ name: "press", utilization: 0.99, downtimeState: "down", maintenanceDueAt: null, status: "operational" }]);
    await expect(enforceCapacitySafetyForPromotion("rec1", "ws1", d)).resolves.toBeUndefined();
    expect(d.db.ownerEquipment.findMany).not.toHaveBeenCalled();
  });
});
