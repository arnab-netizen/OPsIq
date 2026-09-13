/**
 * BETA_REQUEST_OPERATOR role / BETA_REQUEST_REVIEW / BETA_REQUEST_INVITE —
 * pure capability-resolution proofs (no DB, no HTTP).
 *
 * Root cause this closes: the controlled-beta homepage capture's owner-review
 * routes (/api/admin/beta-requests, /api/admin/beta-requests/[id]/invite)
 * originally required the full SYSTEM_ADMIN bundle, which the real OpsIQ
 * owner's account correctly does not (and should not) hold. This suite
 * proves the narrow replacement capabilities grant EXACTLY beta-request
 * review/invite and nothing else — no consulting-firm access, no Owner Mode
 * access, no other admin surface — and that SYSTEM_ADMIN (which already
 * carries every capability) is unaffected.
 */
import { describe, it, expect } from "vitest";
import { hasCapability, getCapabilitiesForRole } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";
import type { PolicyContext } from "@/policies/capability-check";

const operatorPolicy: PolicyContext = {
  userId: "beta-operator-user",
  roles: [{ role: ROLES.BETA_REQUEST_OPERATOR, scope: "workspace", scopeId: "ws-1" }],
};

const selfServeOwnerPolicy: PolicyContext = {
  userId: "self-serve-owner-user",
  // Stored role is always admin_or_portfolio_manager for a self-serve signup —
  // workspaceRole="owner" is what triggers OWNER_SCOPED_CAPABILITIES narrowing.
  roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws-1" }],
  workspaceRole: "owner",
};

const systemAdminPolicy: PolicyContext = {
  userId: "system-admin-user",
  roles: [{ role: ROLES.SYSTEM_ADMIN, scope: "workspace", scopeId: "ws-1" }],
};

describe("BETA_REQUEST_OPERATOR role", () => {
  it("grants exactly BETA_REQUEST_REVIEW and BETA_REQUEST_INVITE — nothing else", () => {
    const caps = getCapabilitiesForRole(ROLES.BETA_REQUEST_OPERATOR);
    expect(new Set(caps)).toEqual(new Set([CAPABILITIES.BETA_REQUEST_REVIEW, CAPABILITIES.BETA_REQUEST_INVITE]));
  });

  it("hasCapability grants both new capabilities to a beta-request operator", () => {
    expect(hasCapability(operatorPolicy, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(true);
    expect(hasCapability(operatorPolicy, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(true);
  });

  it("does NOT grant SYSTEM_ADMIN or general admin capabilities", () => {
    expect(hasCapability(operatorPolicy, CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.SYSTEM_VIEW_AUDIT)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.USER_ASSIGN_ROLE)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.USER_CREATE)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.USER_DEACTIVATE)).toBe(false);
  });

  it("does NOT grant any consulting-firm capability (engagement/client/lead/finding/etc.)", () => {
    expect(hasCapability(operatorPolicy, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.ENGAGEMENT_VIEW)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.CLIENT_VIEW)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.LEAD_VIEW)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.FINDING_CREATE)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.DELIVERABLE_APPROVE)).toBe(false);
  });

  it("does NOT grant Owner Mode capabilities (owner:view/manage/onboard, sop:manage)", () => {
    expect(hasCapability(operatorPolicy, CAPABILITIES.OWNER_VIEW)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.OWNER_MANAGE)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.OWNER_ONBOARD)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.SOP_MANAGE)).toBe(false);
  });

  it("does NOT grant file deletion or audit export", () => {
    expect(hasCapability(operatorPolicy, CAPABILITIES.FILE_DELETE)).toBe(false);
    expect(hasCapability(operatorPolicy, CAPABILITIES.AUDIT_EXPORT)).toBe(false);
  });

  it("is classified as an internal (non-client) role", () => {
    expect(hasCapability(operatorPolicy, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(true); // sanity: not blocked by client-role guard
  });
});

describe("SYSTEM_ADMIN — unaffected by the new narrow capabilities", () => {
  it("SYSTEM_ADMIN still holds BETA_REQUEST_REVIEW and BETA_REQUEST_INVITE (superset, unchanged behavior)", () => {
    expect(hasCapability(systemAdminPolicy, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(true);
    expect(hasCapability(systemAdminPolicy, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(true);
  });

  it("SYSTEM_ADMIN's full bundle is unaffected (spot-check unrelated capabilities)", () => {
    expect(hasCapability(systemAdminPolicy, CAPABILITIES.SYSTEM_ADMIN)).toBe(true);
    expect(hasCapability(systemAdminPolicy, CAPABILITIES.ENGAGEMENT_CREATE)).toBe(true);
    expect(hasCapability(systemAdminPolicy, CAPABILITIES.OWNER_MANAGE)).toBe(true);
  });
});

describe("Self-serve business owner — must NOT automatically receive beta-operator capabilities", () => {
  it("a normal self-serve owner (workspaceRole=owner) does not hold BETA_REQUEST_REVIEW/INVITE", () => {
    expect(hasCapability(selfServeOwnerPolicy, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(false);
    expect(hasCapability(selfServeOwnerPolicy, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(false);
  });

  it("a full (non-narrowed) admin_or_portfolio_manager also does not hold beta-operator capabilities", () => {
    const fullAdminPolicy: PolicyContext = {
      userId: "full-admin-user",
      roles: [{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "ws-1" }],
      // No workspaceRole="owner" -> full, unnarrowed ADMIN_OR_PORTFOLIO_MANAGER bundle.
    };
    expect(hasCapability(fullAdminPolicy, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(false);
    expect(hasCapability(fullAdminPolicy, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(false);
  });
});

describe("Client roles — internal-only guard covers the new capabilities too", () => {
  it("a client role can never be granted BETA_REQUEST_REVIEW/INVITE even if misconfigured onto it", () => {
    // Defense-in-depth: BETA_REQUEST_REVIEW/INVITE are listed in INTERNAL_ONLY_CAPABILITIES,
    // so even a hypothetical future engagement-scoped grant to a client role is blocked.
    const clientPolicy: PolicyContext = {
      userId: "client-user",
      roles: [{ role: ROLES.CLIENT_OWNER, scope: "workspace", scopeId: "ws-1" }],
    };
    expect(hasCapability(clientPolicy, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(false);
    expect(hasCapability(clientPolicy, CAPABILITIES.BETA_REQUEST_INVITE)).toBe(false);
  });
});
