/**
 * `isSelfServeOwnerContext` — the F2/F4 centralized policy check.
 *
 * Proves it is the correct single-source-of-truth substitute for hand-rolling "is this owner
 * self-serve" logic in a page or component (which CLAUDE.md forbids): true for a self-serve owner
 * (signup-narrowed OWNER_SCOPED_CAPABILITIES — holds OWNER_VIEW, never ENGAGEMENT_CREATE), false for
 * a consultant/admin who ALSO happens to hold OWNER_VIEW (the full bundle always carries
 * ENGAGEMENT_CREATE too), false for a client-only role, and false for an empty/anonymous context. No
 * DB required — pure PolicyContext fixtures.
 */
import { describe, it, expect } from "vitest";
import { isSelfServeOwnerContext, type PolicyContext } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES } from "@/domain/constants/roles";

function ctx(role: PolicyContext["roles"][number]["role"], workspaceRole?: string | null): PolicyContext {
  return { userId: "u1", roles: [{ role }], workspaceRole };
}

describe("isSelfServeOwnerContext", () => {
  it("is a function", () => {
    expect(typeof isSelfServeOwnerContext).toBe("function");
  });

  it("true for a self-serve signup owner (ADMIN_OR_PORTFOLIO_MANAGER narrowed by workspaceRole='owner')", () => {
    expect(isSelfServeOwnerContext(ctx(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner"))).toBe(true);
  });

  it("false for the SAME role with no workspaceRole narrowing (full consultant/admin bundle, holds ENGAGEMENT_CREATE)", () => {
    expect(isSelfServeOwnerContext(ctx(ROLES.ADMIN_OR_PORTFOLIO_MANAGER))).toBe(false);
  });

  it("false for a role that never holds OWNER_VIEW at all", () => {
    expect(isSelfServeOwnerContext(ctx(ROLES.EXPERIENCED_CONSULTANT))).toBe(false);
  });

  it("false for an empty/anonymous context", () => {
    expect(isSelfServeOwnerContext({ userId: "u1", roles: [] })).toBe(false);
  });

  it("agrees with the raw capability contract: OWNER_VIEW present, ENGAGEMENT_CREATE absent", async () => {
    const { getCapabilitiesForRole } = await import("@/policies/capability-check");
    const ownerCaps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER, "owner");
    expect(ownerCaps).toContain(CAPABILITIES.OWNER_VIEW);
    expect(ownerCaps).not.toContain(CAPABILITIES.ENGAGEMENT_CREATE);
    const fullCaps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    expect(fullCaps).toContain(CAPABILITIES.ENGAGEMENT_CREATE);
  });
});
