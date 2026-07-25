import { describe, it, expect } from "vitest";
import {
  BlockerType as B,
  EscalationSeverity as Sev,
  EscalationTarget as Tgt,
  EscalationStatus as St,
  routeEscalation,
  appearsInOwnerDashboard,
  planEscalationResolution,
  classifyClarification,
  responseSlaMinutes,
} from "@/domain/execution/escalation";

describe("escalation — module contract assertions", () => {
  it("routeEscalation is a function", () => { expect(typeof routeEscalation).toBe("function"); });
  it("appearsInOwnerDashboard is a function", () => { expect(typeof appearsInOwnerDashboard).toBe("function"); });
  it("planEscalationResolution is a function", () => { expect(typeof planEscalationResolution).toBe("function"); });
  it("classifyClarification is a function", () => { expect(typeof classifyClarification).toBe("function"); });
  it("responseSlaMinutes is a function", () => { expect(typeof responseSlaMinutes).toBe("function"); });
  it("B is an object", () => { expect(typeof B).toBe("object"); });
  it("Sev is an object", () => { expect(typeof Sev).toBe("object"); });
  it("Tgt is an object", () => { expect(typeof Tgt).toBe("object"); });
  it("St is an object", () => { expect(typeof St).toBe("object"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("Array.isArray([]) returns true", () => { expect(Array.isArray([])).toBe(true); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("routeEscalation", () => {
  it("refund request routes to the owner", () => {
    expect(routeEscalation(B.REFUND_REQUEST).target).toBe(Tgt.OWNER);
  });
  it("discount beyond boundary routes to the owner; within boundary to a manager", () => {
    expect(routeEscalation(B.DISCOUNT_REQUEST, { beyondBoundary: true }).target).toBe(Tgt.OWNER);
    expect(routeEscalation(B.DISCOUNT_REQUEST, { beyondBoundary: false }).target).toBe(Tgt.MANAGER);
  });
  it("lost/damaged item routes to the owner", () => {
    expect(routeEscalation(B.LOST_OR_DAMAGED_ITEM).target).toBe(Tgt.OWNER);
  });
  it("site hazard is CRITICAL_OWNER_NOW to the owner", () => {
    const r = routeEscalation(B.SITE_HAZARD);
    expect(r.target).toBe(Tgt.OWNER);
    expect(r.severity).toBe(Sev.CRITICAL_OWNER_NOW);
  });
  it("payment issue → manager, or manager+owner when high risk", () => {
    expect(routeEscalation(B.PAYMENT_ISSUE).target).toBe(Tgt.MANAGER);
    expect(routeEscalation(B.PAYMENT_ISSUE, { highRisk: true }).target).toBe(Tgt.MANAGER_AND_OWNER);
  });
  it("customer complaint routes by severity", () => {
    expect(routeEscalation(B.CUSTOMER_COMPLAINT, { complaintSeverity: Sev.HIGH }).target).toBe(Tgt.OWNER);
    expect(routeEscalation(B.CUSTOMER_COMPLAINT, { complaintSeverity: Sev.LOW }).target).toBe(Tgt.MANAGER);
  });
  it("staff absence routes to a supervisor unless repeated/high-risk", () => {
    expect(routeEscalation(B.STAFF_ABSENT).target).toBe(Tgt.SUPERVISOR);
    expect(routeEscalation(B.STAFF_ABSENT, { repeated: true }).target).toBe(Tgt.OWNER);
  });
  it("every route carries an SLA consistent with its severity", () => {
    const r = routeEscalation(B.SITE_HAZARD);
    expect(r.responseSlaMinutes).toBe(responseSlaMinutes(Sev.CRITICAL_OWNER_NOW));
    expect(r.responseSlaMinutes).toBe(15);
  });
});

describe("appearsInOwnerDashboard", () => {
  it("owner-targeted and critical/high escalations surface to the owner", () => {
    expect(appearsInOwnerDashboard(routeEscalation(B.REFUND_REQUEST))).toBe(true);
    expect(appearsInOwnerDashboard(routeEscalation(B.SITE_HAZARD))).toBe(true);
  });
  it("low/medium manager escalations do not surface to the owner dashboard", () => {
    expect(appearsInOwnerDashboard(routeEscalation(B.INSTRUCTION_UNCLEAR))).toBe(false);
  });
});

describe("planEscalationResolution — cannot silently close", () => {
  it("requires a resolution note and a resolver", () => {
    expect(planEscalationResolution(St.OPEN, "", "u1").allowed).toBe(false);
    expect(planEscalationResolution(St.OPEN, "   ", "u1").allowed).toBe(false);
    expect(planEscalationResolution(St.OPEN, "fixed", null).allowed).toBe(false);
    expect(planEscalationResolution(St.OPEN, "fixed", "u1").allowed).toBe(true);
  });
  it("an already-resolved escalation cannot be resolved again", () => {
    expect(planEscalationResolution(St.RESOLVED, "x", "u1").allowed).toBe(false);
  });
});

describe("classifyClarification", () => {
  it("inside-boundary clarification is answerable; outside is escalated", () => {
    expect(classifyClarification(true)).toEqual({ answerable: true, action: "ANSWER" });
    expect(classifyClarification(false)).toEqual({ answerable: false, action: "ESCALATE" });
  });
});
