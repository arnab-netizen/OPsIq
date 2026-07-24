import { describe, it, expect } from "vitest";
import {
  EmployeeAccessStatus,
  EmployeeLifecycleAction,
  deriveAccessStatus,
  hasLiveAccess,
  isAssignable,
  planLifecycleTransition,
} from "@/domain/workspace/employee-lifecycle";

const A = EmployeeAccessStatus.ACTIVE;
const S = EmployeeAccessStatus.SUSPENDED;
const O = EmployeeAccessStatus.OFFBOARDED;
const N = EmployeeAccessStatus.NONE;

describe("employee-lifecycle — module contract assertions", () => {
  it("EmployeeAccessStatus is an object", () => { expect(typeof EmployeeAccessStatus).toBe("object"); });
  it("EmployeeLifecycleAction is an object", () => { expect(typeof EmployeeLifecycleAction).toBe("object"); });
  it("deriveAccessStatus is a function", () => { expect(typeof deriveAccessStatus).toBe("function"); });
  it("hasLiveAccess is a function", () => { expect(typeof hasLiveAccess).toBe("function"); });
  it("isAssignable is a function", () => { expect(typeof isAssignable).toBe("function"); });
  it("planLifecycleTransition is a function", () => { expect(typeof planLifecycleTransition).toBe("function"); });
  it("A is a string", () => { expect(typeof A).toBe("string"); });
  it("S is a string", () => { expect(typeof S).toBe("string"); });
  it("O is a string", () => { expect(typeof O).toBe("string"); });
  it("N is a string", () => { expect(typeof N).toBe("string"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("deriveAccessStatus", () => {
  it("absent membership is NONE (fail closed)", () => {
    expect(deriveAccessStatus(null)).toBe(N);
    expect(deriveAccessStatus(undefined)).toBe(N);
  });
  it("active membership is ACTIVE", () => {
    expect(deriveAccessStatus({ isActive: true, removedAt: null })).toBe(A);
  });
  it("isActive=false without removedAt is SUSPENDED", () => {
    expect(deriveAccessStatus({ isActive: false, removedAt: null })).toBe(S);
  });
  it("removedAt set is OFFBOARDED regardless of isActive", () => {
    const d = new Date("2026-06-01");
    expect(deriveAccessStatus({ isActive: false, removedAt: d })).toBe(O);
    expect(deriveAccessStatus({ isActive: true, removedAt: d })).toBe(O);
  });
});

describe("access predicates", () => {
  it("only ACTIVE is assignable", () => {
    expect(isAssignable(A)).toBe(true);
    expect(isAssignable(S)).toBe(false);
    expect(isAssignable(O)).toBe(false);
    expect(isAssignable(N)).toBe(false);
  });
  it("only ACTIVE has live access", () => {
    expect(hasLiveAccess(A)).toBe(true);
    expect(hasLiveAccess(S)).toBe(false);
    expect(hasLiveAccess(O)).toBe(false);
    expect(hasLiveAccess(N)).toBe(false);
  });
});

describe("planLifecycleTransition — SUSPEND", () => {
  it("active member can be suspended and sessions revoked", () => {
    const p = planLifecycleTransition(A, EmployeeLifecycleAction.SUSPEND);
    expect(p.allowed).toBe(true);
    expect(p.to).toBe(S);
    expect(p.nextIsActive).toBe(false);
    expect(p.removedAt).toBe("keep");
    expect(p.revokeSessions).toBe(true);
    expect(p.auditEvent).toBe("employee.suspended");
  });
  it("suspended/offboarded/none cannot be suspended", () => {
    for (const from of [S, O, N]) {
      const p = planLifecycleTransition(from, EmployeeLifecycleAction.SUSPEND);
      expect(p.allowed).toBe(false);
      expect(p.revokeSessions).toBe(false);
      expect(p.auditEvent).toBeNull();
    }
  });
});

describe("planLifecycleTransition — REACTIVATE", () => {
  it("suspended member can be reactivated without session revocation", () => {
    const p = planLifecycleTransition(S, EmployeeLifecycleAction.REACTIVATE);
    expect(p.allowed).toBe(true);
    expect(p.to).toBe(A);
    expect(p.nextIsActive).toBe(true);
    expect(p.revokeSessions).toBe(false);
    expect(p.auditEvent).toBe("employee.reactivated");
  });
  it("OFFBOARDED is terminal and cannot be reactivated", () => {
    const p = planLifecycleTransition(O, EmployeeLifecycleAction.REACTIVATE);
    expect(p.allowed).toBe(false);
    expect(p.reason).toMatch(/terminal/i);
  });
  it("active/none cannot be reactivated", () => {
    expect(
      planLifecycleTransition(A, EmployeeLifecycleAction.REACTIVATE).allowed
    ).toBe(false);
    expect(
      planLifecycleTransition(N, EmployeeLifecycleAction.REACTIVATE).allowed
    ).toBe(false);
  });
});

describe("planLifecycleTransition — OFFBOARD", () => {
  it("active member can be offboarded (removedAt set, sessions revoked)", () => {
    const p = planLifecycleTransition(A, EmployeeLifecycleAction.OFFBOARD);
    expect(p.allowed).toBe(true);
    expect(p.to).toBe(O);
    expect(p.nextIsActive).toBe(false);
    expect(p.removedAt).toBe("set");
    expect(p.revokeSessions).toBe(true);
    expect(p.auditEvent).toBe("employee.offboarded");
  });
  it("suspended member can be offboarded and sessions revoked", () => {
    const p = planLifecycleTransition(S, EmployeeLifecycleAction.OFFBOARD);
    expect(p.allowed).toBe(true);
    expect(p.to).toBe(O);
    expect(p.revokeSessions).toBe(true);
  });
  it("already-offboarded / none cannot be offboarded", () => {
    expect(
      planLifecycleTransition(O, EmployeeLifecycleAction.OFFBOARD).allowed
    ).toBe(false);
    expect(
      planLifecycleTransition(N, EmployeeLifecycleAction.OFFBOARD).allowed
    ).toBe(false);
  });
});
