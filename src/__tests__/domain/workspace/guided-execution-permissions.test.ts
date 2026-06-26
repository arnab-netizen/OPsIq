import { describe, it, expect } from "vitest";
import {
  GuidedExecutionPermission as P,
  OWNER_ONLY_PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  isOwnerOnly,
  isGrantable,
  parsePermission,
  hasPermission,
  canGrantPermission,
  type PermissionContext,
} from "@/domain/workspace/guided-execution-permissions";

const owner: PermissionContext = { isOwner: true, grants: new Set() };
const nonOwner = (grants: string[] = []): PermissionContext => ({
  isOwner: false,
  grants: new Set(grants),
});

describe("permission taxonomy", () => {
  it("owner-only and grantable sets are disjoint and cover all permissions", () => {
    for (const p of Object.values(P)) {
      expect(isOwnerOnly(p) !== isGrantable(p)).toBe(true);
    }
    expect(OWNER_ONLY_PERMISSIONS.size).toBe(9);
    expect(GRANTABLE_PERMISSIONS.size).toBe(11);
  });
  it("the documented owner-only permissions are owner-only", () => {
    for (const p of [
      P.APPROVE_RECOMMENDATION,
      P.CHANGE_EXECUTION_BOUNDARY,
      P.APPROVE_HIGH_RISK_DISCOUNT,
      P.APPROVE_REFUND,
      P.VERIFY_FINAL_OUTCOME,
      P.APPROVE_LEARNING,
      P.VIEW_OWNER_DIAGNOSIS,
      P.VIEW_CASH_RUNWAY,
      P.VIEW_STRATEGIC_FINANCIALS,
    ]) {
      expect(isOwnerOnly(p)).toBe(true);
    }
  });
  it("parsePermission is fail-closed on unknown input", () => {
    expect(parsePermission(P.APPROVE_REFUND)).toBe(P.APPROVE_REFUND);
    expect(parsePermission("gep:nonexistent")).toBeNull();
    expect(parsePermission("OWNER")).toBeNull();
  });
});

describe("hasPermission", () => {
  it("owner implicitly holds every permission (grantable + owner-only)", () => {
    expect(hasPermission(owner, P.PROOF_REVIEW_PAYMENT)).toBe(true);
    expect(hasPermission(owner, P.APPROVE_REFUND)).toBe(true);
    expect(hasPermission(owner, P.APPROVE_LEARNING)).toBe(true);
  });

  it("non-owner needs an explicit grant for grantable permissions", () => {
    expect(hasPermission(nonOwner(), P.PROOF_REVIEW_PAYMENT)).toBe(false);
    expect(
      hasPermission(nonOwner([P.PROOF_REVIEW_PAYMENT]), P.PROOF_REVIEW_PAYMENT)
    ).toBe(true);
  });

  it("non-owner can NEVER hold owner-only permissions, even with a grant row", () => {
    // simulate a corrupted/forged grant row for an owner-only permission
    expect(
      hasPermission(nonOwner([P.APPROVE_REFUND]), P.APPROVE_REFUND)
    ).toBe(false);
    expect(
      hasPermission(nonOwner([P.VERIFY_FINAL_OUTCOME]), P.VERIFY_FINAL_OUTCOME)
    ).toBe(false);
    expect(
      hasPermission(nonOwner([P.APPROVE_LEARNING]), P.APPROVE_LEARNING)
    ).toBe(false);
  });

  it("a grant for one permission does not confer another", () => {
    const ctx = nonOwner([P.PROOF_REVIEW_LOW_RISK]);
    expect(hasPermission(ctx, P.PROOF_REVIEW_LOW_RISK)).toBe(true);
    expect(hasPermission(ctx, P.PROOF_REVIEW_PAYMENT)).toBe(false);
    expect(hasPermission(ctx, P.APPROVE_ROUTINE_COMPLETION)).toBe(false);
  });
});

describe("canGrantPermission", () => {
  it("only the owner may grant", () => {
    expect(canGrantPermission(true, P.PROOF_REVIEW_PAYMENT).allowed).toBe(true);
    expect(canGrantPermission(false, P.PROOF_REVIEW_PAYMENT).allowed).toBe(false);
  });
  it("owner-only permissions can never be delegated", () => {
    for (const p of OWNER_ONLY_PERMISSIONS) {
      expect(canGrantPermission(true, p).allowed).toBe(false);
    }
  });
});
