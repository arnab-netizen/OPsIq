import { describe, it, expect } from "vitest";
import {
  DashboardScope,
  DashboardViewer,
  OWNER_ONLY_FIELDS,
  MANAGER_PLUS_FIELDS,
  canAccessDashboard,
  entitledScope,
  redactForScope,
  payloadLeaksForbiddenField,
} from "@/domain/workspace/dashboard-access";
import { EmployeeAccessStatus } from "@/domain/workspace/employee-lifecycle";

const owner: DashboardViewer = {
  status: EmployeeAccessStatus.ACTIVE,
  isOwner: true,
  isManager: false,
};
const manager: DashboardViewer = {
  status: EmployeeAccessStatus.ACTIVE,
  isOwner: false,
  isManager: true,
};
const employee: DashboardViewer = {
  status: EmployeeAccessStatus.ACTIVE,
  isOwner: false,
  isManager: false,
};
const suspended: DashboardViewer = {
  status: EmployeeAccessStatus.SUSPENDED,
  isOwner: false,
  isManager: false,
};
const offboarded: DashboardViewer = {
  status: EmployeeAccessStatus.OFFBOARDED,
  isOwner: true, // even an owner role, once offboarded, has no access
  isManager: true,
};

describe("entitledScope", () => {
  it("maps active viewers to their highest scope", () => {
    expect(entitledScope(owner)).toBe(DashboardScope.OWNER);
    expect(entitledScope(manager)).toBe(DashboardScope.MANAGER);
    expect(entitledScope(employee)).toBe(DashboardScope.EMPLOYEE);
  });
  it("non-active viewers have no scope (fail closed)", () => {
    expect(entitledScope(suspended)).toBeNull();
    expect(entitledScope(offboarded)).toBeNull();
  });
});

describe("canAccessDashboard", () => {
  it("employee cannot access manager or owner dashboards", () => {
    expect(canAccessDashboard(employee, DashboardScope.EMPLOYEE)).toBe(true);
    expect(canAccessDashboard(employee, DashboardScope.MANAGER)).toBe(false);
    expect(canAccessDashboard(employee, DashboardScope.OWNER)).toBe(false);
  });
  it("manager can access manager + employee, not owner", () => {
    expect(canAccessDashboard(manager, DashboardScope.MANAGER)).toBe(true);
    expect(canAccessDashboard(manager, DashboardScope.EMPLOYEE)).toBe(true);
    expect(canAccessDashboard(manager, DashboardScope.OWNER)).toBe(false);
  });
  it("owner can access every scope", () => {
    expect(canAccessDashboard(owner, DashboardScope.OWNER)).toBe(true);
    expect(canAccessDashboard(owner, DashboardScope.MANAGER)).toBe(true);
    expect(canAccessDashboard(owner, DashboardScope.EMPLOYEE)).toBe(true);
  });
  it("suspended/offboarded cannot access any dashboard", () => {
    for (const scope of Object.values(DashboardScope)) {
      expect(canAccessDashboard(suspended, scope)).toBe(false);
      expect(canAccessDashboard(offboarded, scope)).toBe(false);
    }
  });
});

describe("redactForScope", () => {
  const payload = {
    myTasks: [{ id: "t1", title: "Call customer" }],
    ownerDiagnosis: "cash crisis",
    cashRunway: 14,
    teamTasks: [{ id: "t2" }],
    nested: {
      profitWeakness: "low margin",
      employeeBlockers: ["x"],
      safeField: "ok",
    },
  };

  it("owner sees everything (no redaction)", () => {
    const r = redactForScope(payload, DashboardScope.OWNER);
    expect(r).toEqual(payload);
  });

  it("manager loses owner-only fields but keeps manager fields", () => {
    const r = redactForScope(payload, DashboardScope.MANAGER) as Record<string, unknown>;
    expect(r.ownerDiagnosis).toBeUndefined();
    expect(r.cashRunway).toBeUndefined();
    expect((r.nested as Record<string, unknown>).profitWeakness).toBeUndefined();
    expect(r.teamTasks).toBeDefined(); // manager field retained
    expect((r.nested as Record<string, unknown>).employeeBlockers).toBeDefined();
    expect((r.nested as Record<string, unknown>).safeField).toBe("ok");
    expect(payloadLeaksForbiddenField(r, DashboardScope.MANAGER)).toBe(false);
  });

  it("employee loses owner-only AND manager-only fields, nested included", () => {
    const r = redactForScope(payload, DashboardScope.EMPLOYEE) as Record<string, unknown>;
    expect(r.ownerDiagnosis).toBeUndefined();
    expect(r.cashRunway).toBeUndefined();
    expect(r.teamTasks).toBeUndefined();
    expect((r.nested as Record<string, unknown>).profitWeakness).toBeUndefined();
    expect((r.nested as Record<string, unknown>).employeeBlockers).toBeUndefined();
    expect((r.nested as Record<string, unknown>).safeField).toBe("ok");
    expect(r.myTasks).toBeDefined();
    expect(payloadLeaksForbiddenField(r, DashboardScope.EMPLOYEE)).toBe(false);
  });

  it("does not mutate the original payload", () => {
    redactForScope(payload, DashboardScope.EMPLOYEE);
    expect(payload.ownerDiagnosis).toBe("cash crisis");
    expect(payload.teamTasks).toBeDefined();
  });

  it("owner-only and manager-only field sets are disjoint", () => {
    for (const f of OWNER_ONLY_FIELDS) {
      expect(MANAGER_PLUS_FIELDS.has(f)).toBe(false);
    }
  });

  it("detects a leak inside a nested array of objects", () => {
    const leaky = { rows: [{ ok: 1 }, { cashOnHand: 999 }] };
    expect(payloadLeaksForbiddenField(leaky, DashboardScope.EMPLOYEE)).toBe(true);
    const cleaned = redactForScope(leaky, DashboardScope.EMPLOYEE);
    expect(payloadLeaksForbiddenField(cleaned, DashboardScope.EMPLOYEE)).toBe(false);
  });
});
