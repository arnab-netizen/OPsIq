import { describe, it, expect } from "vitest";
import {
  computeOwnerDailyLoad,
  classifyOwnerLoad,
  ownerBottleneckRisk,
  recommendReliefPath,
  assessOwnerWorkload,
  wouldDeepenOwnerDependency,
  OwnerLoadBand,
  OwnerReliefPath,
} from "@/domain/execution/owner-workload";

describe("[module9] owner workload protection — module contract assertions", () => {
  it("computeOwnerDailyLoad is a function", () => { expect(typeof computeOwnerDailyLoad).toBe("function"); });
  it("classifyOwnerLoad is a function", () => { expect(typeof classifyOwnerLoad).toBe("function"); });
  it("ownerBottleneckRisk is a function", () => { expect(typeof ownerBottleneckRisk).toBe("function"); });
  it("recommendReliefPath is a function", () => { expect(typeof recommendReliefPath).toBe("function"); });
  it("assessOwnerWorkload is a function", () => { expect(typeof assessOwnerWorkload).toBe("function"); });
  it("wouldDeepenOwnerDependency is a function", () => { expect(typeof wouldDeepenOwnerDependency).toBe("function"); });
  it("OwnerLoadBand.SUSTAINABLE is defined", () => { expect(OwnerLoadBand.SUSTAINABLE).toBeDefined(); });
  it("OwnerLoadBand.BOTTLENECK_RISK is defined", () => { expect(OwnerLoadBand.BOTTLENECK_RISK).toBeDefined(); });
  it("OwnerReliefPath.DELEGATE is defined", () => { expect(OwnerReliefPath.DELEGATE).toBeDefined(); });
  it("OwnerReliefPath.NONE is defined", () => { expect(OwnerReliefPath.NONE).toBeDefined(); });
  it("computeOwnerDailyLoad returns a number", () => {
    expect(typeof computeOwnerDailyLoad({ ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 })).toBe("number");
  });
  it("classifyOwnerLoad(0.5) returns SUSTAINABLE", () => { expect(classifyOwnerLoad(0.5)).toBe(OwnerLoadBand.SUSTAINABLE); });
  it("assessOwnerWorkload returns object with band field", () => {
    expect(assessOwnerWorkload({ ownerMinutesPerDay: 120, sustainableMinutesPerDay: 480 })).toHaveProperty("band");
  });
  it("ownerBottleneckRisk is false for light load", () => {
    expect(ownerBottleneckRisk({ ownerMinutesPerDay: 100, sustainableMinutesPerDay: 480 })).toBe(false);
  });
});

describe("[module9] owner workload protection", () => {
  it("computes owner daily load (0 when no capacity)", () => {
    expect(computeOwnerDailyLoad({ ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480 })).toBeCloseTo(0.5, 5);
    expect(computeOwnerDailyLoad({ ownerMinutesPerDay: 240, sustainableMinutesPerDay: 0 })).toBe(0);
  });

  it("classifies owner load bands", () => {
    expect(classifyOwnerLoad(0.4)).toBe(OwnerLoadBand.UNDERUSED);
    expect(classifyOwnerLoad(0.6)).toBe(OwnerLoadBand.SUSTAINABLE);
    expect(classifyOwnerLoad(0.9)).toBe(OwnerLoadBand.HIGH);
    expect(classifyOwnerLoad(0.97)).toBe(OwnerLoadBand.BOTTLENECK_RISK);
    expect(classifyOwnerLoad(1.1)).toBe(OwnerLoadBand.UNSUSTAINABLE);
  });

  it("flags bottleneck on overload OR heavy owner-only dependency", () => {
    expect(ownerBottleneckRisk({ ownerMinutesPerDay: 520, sustainableMinutesPerDay: 480 })).toBe(true); // overloaded
    expect(ownerBottleneckRisk({ ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480, ownerTasks: 10, ownerOnlyCriticalTasks: 6 })).toBe(true); // dependency
    expect(ownerBottleneckRisk({ ownerMinutesPerDay: 240, sustainableMinutesPerDay: 480, ownerTasks: 10, ownerOnlyCriticalTasks: 1 })).toBe(false);
  });

  it("prefers delegation > SOP > automation > hire over firefighting", () => {
    const overloaded = { ownerMinutesPerDay: 520, sustainableMinutesPerDay: 480 };
    expect(recommendReliefPath({ ...overloaded, hasDelegatableTasks: true })).toBe(OwnerReliefPath.DELEGATE);
    expect(recommendReliefPath({ ...overloaded, processStandardizable: true })).toBe(OwnerReliefPath.SOP_TRANSFER);
    expect(recommendReliefPath({ ...overloaded, automatable: true })).toBe(OwnerReliefPath.AUTOMATE);
    expect(recommendReliefPath(overloaded)).toBe(OwnerReliefPath.HIRE);
    expect(recommendReliefPath({ ownerMinutesPerDay: 120, sustainableMinutesPerDay: 480 })).toBe(OwnerReliefPath.NONE);
  });

  it("assessment summarizes load, bottleneck, overload, and path", () => {
    const a = assessOwnerWorkload({ ownerMinutesPerDay: 500, sustainableMinutesPerDay: 480, hasDelegatableTasks: true });
    expect(a.band).toBe(OwnerLoadBand.UNSUSTAINABLE);
    expect(a.overloaded).toBe(true);
    expect(a.bottleneckRisk).toBe(true);
    expect(a.recommendedPath).toBe(OwnerReliefPath.DELEGATE);
    expect(a.dailyLoadPct).toBe(104);
  });

  it("detects when an action would deepen owner dependency", () => {
    const base = { ownerMinutesPerDay: 400, sustainableMinutesPerDay: 480, ownerTasks: 4, ownerOnlyCriticalTasks: 1 };
    expect(wouldDeepenOwnerDependency(base, 120)).toBe(true); // 520/480 -> unsustainable
    expect(wouldDeepenOwnerDependency(base, 10)).toBe(false); // 410/480 sustainable, low dependency
    expect(wouldDeepenOwnerDependency({ ...base, ownerTasks: 2, ownerOnlyCriticalTasks: 1 }, 10, true)).toBe(true); // 2/3 owner-only -> dependency heavy
  });
});
