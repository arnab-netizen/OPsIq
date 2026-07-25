import { describe, it, expect } from "vitest";
import {
  committedHours,
  availableHours,
  computeUtilization,
  classifyUtilizationBand,
  assessEmployeeWorkload,
  wouldOverburden,
  WorkloadBand,
} from "@/domain/execution/employee-workload";

describe("[module8] employee workload — module contract assertions", () => {
  it("committedHours is a function", () => { expect(typeof committedHours).toBe("function"); });
  it("availableHours is a function", () => { expect(typeof availableHours).toBe("function"); });
  it("computeUtilization is a function", () => { expect(typeof computeUtilization).toBe("function"); });
  it("classifyUtilizationBand is a function", () => { expect(typeof classifyUtilizationBand).toBe("function"); });
  it("assessEmployeeWorkload is a function", () => { expect(typeof assessEmployeeWorkload).toBe("function"); });
  it("wouldOverburden is a function", () => { expect(typeof wouldOverburden).toBe("function"); });
  it("WorkloadBand is an object", () => { expect(typeof WorkloadBand).toBe("object"); });
  it("WorkloadBand.HEALTHY_UTILIZATION is defined", () => { expect(WorkloadBand.HEALTHY_UTILIZATION).toBeDefined(); });
  it("WorkloadBand.UNSUSTAINABLE is defined", () => { expect(WorkloadBand.UNSUSTAINABLE).toBeDefined(); });
  it("WorkloadBand.OVERBURDEN_RISK is defined", () => { expect(WorkloadBand.OVERBURDEN_RISK).toBeDefined(); });
  it("availableHours({ shiftHours: 8, breakHours: 0 }) is 8", () => { expect(availableHours({ shiftHours: 8, breakHours: 0 })).toBe(8); });
  it("computeUtilization({ shiftHours: 0 }) is 0", () => { expect(computeUtilization({ shiftHours: 0 })).toBe(0); });
  it("classifyUtilizationBand(0.6) is HEALTHY_UTILIZATION", () => { expect(classifyUtilizationBand(0.6)).toBe(WorkloadBand.HEALTHY_UTILIZATION); });
  it("assessEmployeeWorkload({ shiftHours: 8, taskHours: 4 }) returns an object", () => { expect(typeof assessEmployeeWorkload({ shiftHours: 8, taskHours: 4 })).toBe("object"); });
});

describe("[module8] employee workload model", () => {
  it("committed hours count task + travel + rework + overtime", () => {
    expect(committedHours({ shiftHours: 8, taskHours: 4, travelHours: 1, reworkHours: 0.5, overtimeHours: 1 })).toBe(6.5);
  });

  it("available hours = shift minus breaks (never negative)", () => {
    expect(availableHours({ shiftHours: 8, breakHours: 1 })).toBe(7);
    expect(availableHours({ shiftHours: 1, breakHours: 5 })).toBe(0);
  });

  it("utilization includes travel + rework; 0 when no availability", () => {
    expect(computeUtilization({ shiftHours: 8, breakHours: 0, taskHours: 4 })).toBeCloseTo(0.5, 5);
    // travel + rework push utilization up
    expect(computeUtilization({ shiftHours: 8, taskHours: 4, travelHours: 2, reworkHours: 1 })).toBeCloseTo(0.875, 5);
    expect(computeUtilization({ shiftHours: 0 })).toBe(0);
  });

  it("classifies utilization bands at the spec thresholds", () => {
    expect(classifyUtilizationBand(0.4)).toBe(WorkloadBand.UNDERUTILIZED);
    expect(classifyUtilizationBand(0.6)).toBe(WorkloadBand.HEALTHY_UTILIZATION);
    expect(classifyUtilizationBand(0.8)).toBe(WorkloadBand.HIGH_UTILIZATION);
    expect(classifyUtilizationBand(0.92)).toBe(WorkloadBand.OVERBURDEN_RISK);
    expect(classifyUtilizationBand(0.98)).toBe(WorkloadBand.UNSUSTAINABLE);
    expect(classifyUtilizationBand(1.2)).toBe(WorkloadBand.UNSUSTAINABLE);
  });

  it("assessment flags overburden + fatigue risk", () => {
    const healthy = assessEmployeeWorkload({ shiftHours: 8, taskHours: 4 });
    expect(healthy.band).toBe(WorkloadBand.HEALTHY_UTILIZATION);
    expect(healthy.overburdened).toBe(false);
    expect(healthy.utilizationPct).toBe(50);

    const unsustainable = assessEmployeeWorkload({ shiftHours: 8, taskHours: 8, overtimeHours: 2 });
    expect(unsustainable.band).toBe(WorkloadBand.UNSUSTAINABLE);
    expect(unsustainable.overburdened).toBe(true);
    expect(unsustainable.fatigueRisk).toBe(true);
  });

  it("fatigue risk triggers on high overtime ratio even below unsustainable", () => {
    // 8h avail, 4h task + 2h overtime => util 0.75 (HIGH), overtime ratio 0.25 => fatigue
    const a = assessEmployeeWorkload({ shiftHours: 8, taskHours: 4, overtimeHours: 2 });
    expect(a.fatigueRisk).toBe(true);
  });

  it("wouldOverburden guards capacity for added work", () => {
    const base = { shiftHours: 8, taskHours: 6 }; // util 0.75
    expect(wouldOverburden(base, 1)).toBe(false); // 7/8 = 0.875 -> HIGH (not overburden)
    expect(wouldOverburden(base, 1.5)).toBe(true); // 7.5/8 = 0.9375 -> OVERBURDEN_RISK
    expect(wouldOverburden(base, 2)).toBe(true);   // 8/8 = 1.0 -> UNSUSTAINABLE
    expect(wouldOverburden({ shiftHours: 8, taskHours: 2 }, 1)).toBe(false); // 3/8 underutilized
  });
});
