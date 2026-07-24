import { describe, it, expect } from "vitest";
import { assessWorkload, isEmployeeFault, stockoutRisk, canCloseMaintenanceVerified, compareLocations, aiOverrideHarm, assessLocationHandover, canContactExternalCustomer, LOCATION_HANDOVER_FIELDS, type WorkloadInput } from "@/domain/remote-operations/remaining-surfaces";

describe("R37 remaining surfaces — module contract assertions", () => {
  it("assessWorkload is a function", () => { expect(typeof assessWorkload).toBe("function"); });
  it("isEmployeeFault is a function", () => { expect(typeof isEmployeeFault).toBe("function"); });
  it("stockoutRisk is a function", () => { expect(typeof stockoutRisk).toBe("function"); });
  it("canCloseMaintenanceVerified is a function", () => { expect(typeof canCloseMaintenanceVerified).toBe("function"); });
  it("compareLocations is a function", () => { expect(typeof compareLocations).toBe("function"); });
  it("aiOverrideHarm is a function", () => { expect(typeof aiOverrideHarm).toBe("function"); });
  it("assessLocationHandover is a function", () => { expect(typeof assessLocationHandover).toBe("function"); });
  it("canContactExternalCustomer is a function", () => { expect(typeof canContactExternalCustomer).toBe("function"); });
  it("LOCATION_HANDOVER_FIELDS is an array", () => { expect(Array.isArray(LOCATION_HANDOVER_FIELDS)).toBe(true); });
  it("LOCATION_HANDOVER_FIELDS.length is greater than 0", () => { expect(LOCATION_HANDOVER_FIELDS.length).toBeGreaterThan(0); });
  it("isEmployeeFault('EMPLOYEE') is true", () => { expect(isEmployeeFault("EMPLOYEE")).toBe(true); });
  it("isEmployeeFault('BAD_SCHEDULING') is false", () => { expect(isEmployeeFault("BAD_SCHEDULING")).toBe(false); });
  it("canContactExternalCustomer('STAFF_MEMBER') is false", () => { expect(canContactExternalCustomer("STAFF_MEMBER")).toBe(false); });
  it("canContactExternalCustomer('OPERATIONS_MANAGER') is true", () => { expect(canContactExternalCustomer("OPERATIONS_MANAGER")).toBe(true); });
});

describe("[§37] workload fairness gate", () => {
  const w = (over: Partial<WorkloadInput> = {}): WorkloadInput => ({ dailyTaskCount: 3, maxDailyTasks: 5, travelTimeKnown: true, physicalIntensity: "MEDIUM", overtimeRisk: false, isHighOrCritical: false, ...over });
  it("flags overload and incomplete workload data", () => {
    expect(assessWorkload(w())).toBe("OK");
    expect(assessWorkload(w({ dailyTaskCount: 6 }))).toBe("ASSIGNMENT_RISK_STAFF_OVERLOAD");
    expect(assessWorkload(w({ travelTimeKnown: false, isHighOrCritical: true }))).toBe("WORKLOAD_DATA_INCOMPLETE");
  });
  it("distinguishes employee fault from system causes", () => {
    expect(isEmployeeFault("EMPLOYEE")).toBe(true);
    expect(isEmployeeFault("BAD_SCHEDULING")).toBe(false);
    expect(isEmployeeFault("MISSING_INVENTORY")).toBe(false);
  });
});

describe("[§41] inventory / consumables", () => {
  it("flags stockout risk when stock minus usage falls below minimum", () => {
    expect(stockoutRisk({ name: "bleach", currentStock: 10, minimumStock: 5, expectedUsage: 8 })).toBe(true);
    expect(stockoutRisk({ name: "bags", currentStock: 20, minimumStock: 5, expectedUsage: 8 })).toBe(false);
  });
});

describe("[§43] maintenance/vendor close gate", () => {
  it("vendor work cannot close verified without proof / confirmation / no dispute", () => {
    expect(canCloseMaintenanceVerified({ vendorPrequalifiedWhereRequired: true, completionProofPresent: true, costInvoiceRecordedWhereApplicable: true, confirmationPresentWhereRequired: true, openDispute: false, repeatIssueWithinWindow: false })).toEqual([]);
    expect(canCloseMaintenanceVerified({ vendorPrequalifiedWhereRequired: true, completionProofPresent: false, costInvoiceRecordedWhereApplicable: true, confirmationPresentWhereRequired: true, openDispute: false, repeatIssueWithinWindow: false })).toContain("VENDOR_WORK_CLOSED_WITHOUT_PROOF");
  });
});

describe("[§78] multi-location comparison", () => {
  it("downgrades ranking when data confidence is unequal or low", () => {
    expect(compareLocations([{ locationId: "a", verifiedCompletionRate: 0.9, dataConfidence: "HIGH" }, { locationId: "b", verifiedCompletionRate: 0.8, dataConfidence: "HIGH" }]).rankingDowngraded).toBe(false);
    expect(compareLocations([{ locationId: "a", verifiedCompletionRate: 0.9, dataConfidence: "HIGH" }, { locationId: "b", verifiedCompletionRate: 0.95, dataConfidence: "LOW" }]).rankingDowngraded).toBe(true);
  });
});

describe("[§69] AI quality / override", () => {
  it("an override that later caused harm raises the harm event", () => {
    expect(aiOverrideHarm({ overridden: true, harmOccurredAfter: true })).toBe("AI_FLAG_OVERRIDDEN_AND_HARM_OCCURRED");
    expect(aiOverrideHarm({ overridden: true, harmOccurredAfter: false })).toBeNull();
  });
});

describe("[§84/§46] location handover + external contact authority", () => {
  it("location handover is complete only with all fields + incoming manager acknowledgement", () => {
    const full = { fields: Object.fromEntries(LOCATION_HANDOVER_FIELDS.map((f) => [f, "x"])), incomingManagerAcknowledged: true };
    expect(assessLocationHandover(full).complete).toBe(true);
    expect(assessLocationHandover({ ...full, incomingManagerAcknowledged: false }).complete).toBe(false);
  });
  it("staff cannot contact external customers by default", () => {
    expect(canContactExternalCustomer("STAFF_MEMBER")).toBe(false);
    expect(canContactExternalCustomer("OPERATIONS_MANAGER")).toBe(true);
  });
});
