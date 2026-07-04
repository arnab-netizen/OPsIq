import { describe, it, expect } from "vitest";
import { canApprove, resolveApprovalGrant } from "@/services/auth/access";
import { evaluateGuardrails, HIGH_IMPACT_APPROVAL_THRESHOLD } from "@/services/control/guardrails";
import type { UserRole } from "@/domain/auth/types";

/**
 * Regression guard for GAP-FIN-01 (full-repo commercial audit): a client-supplied
 * `approvalFlag` must NOT let an unauthorized caller bypass the HIGH_IMPACT_APPROVAL
 * financial guardrail. The route now derives the effective flag from
 * `resolveApprovalGrant(role, body.approvalFlag)` instead of trusting the body.
 */
describe("resolveApprovalGrant — high-impact approval authorization", () => {
  const ROLES: UserRole[] = ["admin", "operator", "viewer"];

  it("only an authorized (admin) role can approve", () => {
    expect(canApprove("admin")).toBe(true);
    expect(canApprove("operator")).toBe(false);
    expect(canApprove("viewer")).toBe(false);
  });

  it("honors approvalFlag=true ONLY for an authorized approver", () => {
    expect(resolveApprovalGrant("admin", true)).toBe(true);
    expect(resolveApprovalGrant("operator", true)).toBe(false);
    expect(resolveApprovalGrant("viewer", true)).toBe(false);
  });

  it("is fail-closed for any non-`true` / spoofed flag value", () => {
    for (const role of ROLES) {
      expect(resolveApprovalGrant(role, false)).toBe(false);
      expect(resolveApprovalGrant(role, undefined)).toBe(false);
      expect(resolveApprovalGrant(role, "true")).toBe(false); // string, not boolean
      expect(resolveApprovalGrant(role, 1)).toBe(false);
      expect(resolveApprovalGrant(role, {})).toBe(false);
    }
  });

  it("an operator cannot bypass the high-impact block by self-granting the flag", () => {
    const impact = HIGH_IMPACT_APPROVAL_THRESHOLD + 1;
    // What the route now feeds to the guardrail for an operator sending approvalFlag:true
    const effectiveFlag = resolveApprovalGrant("operator", true); // false
    const result = evaluateGuardrails({
      expectedImpact: impact,
      confidence: 0.9,
      approvalFlag: effectiveFlag,
    });
    expect(result.blocked).toBe(true);
    expect(result.violations.some((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toBe(true);
  });

  it("an admin can approve the same high-impact decision", () => {
    const impact = HIGH_IMPACT_APPROVAL_THRESHOLD + 1;
    const effectiveFlag = resolveApprovalGrant("admin", true); // true
    const result = evaluateGuardrails({
      expectedImpact: impact,
      confidence: 0.9,
      approvalFlag: effectiveFlag,
    });
    expect(result.violations.some((v) => v.ruleId === "HIGH_IMPACT_APPROVAL")).toBe(false);
  });
});
