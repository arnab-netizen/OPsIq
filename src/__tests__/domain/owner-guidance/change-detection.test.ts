import { describe, it, expect } from "vitest";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";
import {
  ChangeCategory,
  BusinessStateSnapshot,
  DetectedChange,
  detectChanges,
  ownerAlerts,
  worseningChanges,
} from "@/domain/owner-guidance/change-detection";

function snap(overrides: Partial<BusinessStateSnapshot> = {}): BusinessStateSnapshot {
  return {
    cashRunwayDays: 60,
    netMarginPct: 12,
    complaintsCount: 3,
    reworkCount: 2,
    capacityUtilizationPct: 70,
    staffOverloadPct: 40,
    ownerLoadPct: 50,
    churnRiskScore: 0.2,
    supplierInventoryRiskScore: 0.1,
    overdueProofCount: 0,
    outcomeChecksDue: 0,
    growthReadinessTier: "GROWTH_READY",
    ...overrides,
  };
}

function find(changes: DetectedChange[], category: ChangeCategory): DetectedChange | undefined {
  return changes.find((c) => c.category === category);
}

describe("change detection engine — module contract assertions", () => {
  it("BusinessFunction is an object", () => { expect(typeof BusinessFunction).toBe("object"); });
  it("BusinessFunction.CASH_FLOW is defined", () => { expect(BusinessFunction.CASH_FLOW).toBeDefined(); });
  it("ChangeCategory is an object", () => { expect(typeof ChangeCategory).toBe("object"); });
  it("ChangeCategory.CASH_WORSENED is defined", () => { expect(ChangeCategory.CASH_WORSENED).toBeDefined(); });
  it("ChangeCategory.COMPLAINTS_INCREASED is defined", () => { expect(ChangeCategory.COMPLAINTS_INCREASED).toBeDefined(); });
  it("detectChanges is a function", () => { expect(typeof detectChanges).toBe("function"); });
  it("ownerAlerts is a function", () => { expect(typeof ownerAlerts).toBe("function"); });
  it("worseningChanges is a function", () => { expect(typeof worseningChanges).toBe("function"); });
  it("snap is a function", () => { expect(typeof snap).toBe("function"); });
  it("find is a function", () => { expect(typeof find).toBe("function"); });
  it("snap() returns an object", () => { expect(typeof snap()).toBe("object"); });
  it("snap() has cashRunwayDays field", () => { expect(snap()).toHaveProperty("cashRunwayDays"); });
  it("snap().cashRunwayDays equals 60", () => { expect(snap().cashRunwayDays).toBe(60); });
  it("detectChanges(snap(), { ...snap() }) returns an array", () => { expect(Array.isArray(detectChanges(snap(), { ...snap() }))).toBe(true); });
});

describe("Module 41 — real-time change detection engine", () => {
  it("[module41] cash worsening creates an owner alert", () => {
    const changes = detectChanges(snap(), snap({ cashRunwayDays: 30 }));
    const c = find(changes, ChangeCategory.CASH_WORSENED);
    expect(c).toBeDefined();
    expect(c!.direction).toBe("WORSENED");
    expect(c!.ownerAlert).toBe(true);
    expect(c!.businessFunction).toBe(BusinessFunction.CASH_FLOW);
    expect(c!.reason).toContain("60");
    expect(c!.reason).toContain("30");
    expect(ownerAlerts(changes)).toContainEqual(c!);
  });

  it("[module41] complaints increase emits COMPLAINTS_INCREASED with ownerAlert", () => {
    const changes = detectChanges(snap(), snap({ complaintsCount: 9 }));
    const c = find(changes, ChangeCategory.COMPLAINTS_INCREASED);
    expect(c).toBeDefined();
    expect(c!.ownerAlert).toBe(true);
    expect(c!.direction).toBe("WORSENED");
    expect(c!.businessFunction).toBe(BusinessFunction.CUSTOMER_COMPLAINTS);
    expect(c!.reason).toContain("9");
  });

  it("[module41] staff overload increase is detected as STAFF_OVERLOAD_WORSENED ownerAlert", () => {
    const changes = detectChanges(snap(), snap({ staffOverloadPct: 85 }));
    const c = find(changes, ChangeCategory.STAFF_OVERLOAD_WORSENED);
    expect(c).toBeDefined();
    expect(c!.ownerAlert).toBe(true);
    expect(c!.direction).toBe("WORSENED");
    expect(c!.businessFunction).toBe(BusinessFunction.EMPLOYEE_WORKLOAD);
    expect(c!.reason).toContain("85");
  });

  it("[module41] outcome check due appears as OUTCOME_CHECK_DUE", () => {
    const changes = detectChanges(snap(), snap({ outcomeChecksDue: 2 }));
    const c = find(changes, ChangeCategory.OUTCOME_CHECK_DUE);
    expect(c).toBeDefined();
    expect(c!.businessFunction).toBe(BusinessFunction.OUTCOME_LEARNING);
    expect(c!.reason).toContain("2");
  });

  it("[module41] growth readiness downgrade shown with a reason naming old→new tier", () => {
    const changes = detectChanges(
      snap({ growthReadinessTier: "GROWTH_READY" }),
      snap({ growthReadinessTier: "STABILIZE_FIRST" })
    );
    const c = find(changes, ChangeCategory.GROWTH_READINESS_CHANGED);
    expect(c).toBeDefined();
    expect(c!.direction).toBe("WORSENED");
    expect(c!.ownerAlert).toBe(true);
    expect(c!.businessFunction).toBe(BusinessFunction.GROWTH_READINESS);
    expect(c!.reason).toContain("GROWTH_READY");
    expect(c!.reason).toContain("STABILIZE_FIRST");
  });

  it("[module41] no-change snapshots produce no spurious changes", () => {
    const s = snap();
    expect(detectChanges(s, { ...s })).toEqual([]);
  });

  it("[module41] improvements are reported with IMPROVED direction and not as owner alerts", () => {
    const changes = detectChanges(
      snap({ cashRunwayDays: 30, netMarginPct: 8, complaintsCount: 9 }),
      snap({ cashRunwayDays: 90, netMarginPct: 18, complaintsCount: 1 })
    );

    const cash = find(changes, ChangeCategory.CASH_IMPROVED);
    const profit = find(changes, ChangeCategory.PROFIT_IMPROVED);
    const complaints = find(changes, ChangeCategory.COMPLAINTS_DECREASED);

    for (const c of [cash, profit, complaints]) {
      expect(c).toBeDefined();
      expect(c!.direction).toBe("IMPROVED");
      expect(c!.ownerAlert).toBe(false);
    }

    expect(ownerAlerts(changes)).toEqual([]);
    expect(worseningChanges(changes)).toEqual([]);
  });

  it("[module41] worseningChanges filters to WORSENED and ownerAlerts to flagged", () => {
    const changes = detectChanges(
      snap(),
      snap({ cashRunwayDays: 20, reworkCount: 9, overdueProofCount: 3 })
    );
    const worse = worseningChanges(changes);
    expect(worse.length).toBeGreaterThan(0);
    expect(worse.every((c) => c.direction === "WORSENED")).toBe(true);

    const alerts = ownerAlerts(changes);
    expect(alerts.every((c) => c.ownerAlert === true)).toBe(true);
    // rework worsened but is not an owner alert; proof overdue is.
    expect(find(changes, ChangeCategory.REWORK_INCREASED)!.ownerAlert).toBe(false);
    expect(find(changes, ChangeCategory.PROOF_OVERDUE)!.ownerAlert).toBe(true);
  });
});
