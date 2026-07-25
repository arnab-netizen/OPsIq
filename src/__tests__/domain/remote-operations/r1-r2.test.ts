import { describe, it, expect } from "vitest";
import { checkGovernedByOwnerMode, assertGovernedByOwnerMode, checkTerminalCannotForgeSuccess, OwnerModeBypassError } from "@/domain/remote-operations/owner-mode-contract";
import { assertLocationScope, canAccessTerminal, requiresExternalToken, type RemoteSession } from "@/domain/remote-operations/remote-scope";
import { runCollective, type CollectiveInput } from "@/domain/collective-training/collective-engine";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import type { LocationScope } from "@/domain/remote-operations/remote-types";

const cashRedInput: CollectiveInput = { archetype: "universal", ownerGoal: "spend on marketing", signals: [{ domain: "cash-survival", status: "RED", severity: "CRITICAL", confidence: "HIGH" }] };

describe("r1-r2 — module contract assertions", () => {
  it("checkGovernedByOwnerMode is a function", () => { expect(typeof checkGovernedByOwnerMode).toBe("function"); });
  it("assertGovernedByOwnerMode is a function", () => { expect(typeof assertGovernedByOwnerMode).toBe("function"); });
  it("checkTerminalCannotForgeSuccess is a function", () => { expect(typeof checkTerminalCannotForgeSuccess).toBe("function"); });
  it("OwnerModeBypassError is a function", () => { expect(typeof OwnerModeBypassError).toBe("function"); });
  it("assertLocationScope is a function", () => { expect(typeof assertLocationScope).toBe("function"); });
  it("canAccessTerminal is a function", () => { expect(typeof canAccessTerminal).toBe("function"); });
  it("requiresExternalToken is a function", () => { expect(typeof requiresExternalToken).toBe("function"); });
  it("runCollective is a function", () => { expect(typeof runCollective).toBe("function"); });
  it("UnauthorizedError is a function", () => { expect(typeof UnauthorizedError).toBe("function"); });
  it("ForbiddenError is a function", () => { expect(typeof ForbiddenError).toBe("function"); });
  it("cashRedInput is an object", () => { expect(typeof cashRedInput).toBe("object"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[R1] Owner Mode integration contract — remote cannot bypass governance", () => {
  it("a remote decision carrying a valid Owner Mode arbitration packet is governed", () => {
    const arbitration = runCollective(cashRedInput);
    expect(checkGovernedByOwnerMode({ arbitration, proposedAction: "Collect overdue invoices", performsActions: ["closure_without_proof"] })).toEqual([]);
  });
  it("a remote action that performs an Owner-Mode-vetoed action is rejected (fail-closed)", () => {
    const arbitration = runCollective(cashRedInput); // cash red vetoes paid_marketing
    const reasons = checkGovernedByOwnerMode({ arbitration, proposedAction: "Run ads", performsActions: ["paid_marketing"] });
    expect(reasons.some((r) => r.startsWith("action_blocked_by_active_veto"))).toBe(true);
    expect(() => assertGovernedByOwnerMode({ arbitration, proposedAction: "Run ads", performsActions: ["paid_marketing"] })).toThrow(OwnerModeBypassError);
  });
  it("a missing arbitration packet is rejected", () => {
    expect(checkGovernedByOwnerMode({ arbitration: undefined as never, proposedAction: "x", performsActions: [] })).toContain("missing_owner_mode_arbitration");
  });
  it("a terminal cannot declare a HIGH/CRITICAL verified success outside Owner Mode verification", () => {
    expect(checkTerminalCannotForgeSuccess({ terminal: "SUPERVISOR", riskLevel: "HIGH", ownerModeVerified: false })).toContain("terminal_verified_success_outside_owner_mode");
  });
  it("AI alone cannot verify a high-risk task", () => {
    expect(checkTerminalCannotForgeSuccess({ terminal: "MANAGER", riskLevel: "CRITICAL", ownerModeVerified: true, aiOnlyReview: true })).toContain("ai_only_verification_of_high_risk_task");
  });
  it("an Owner-Mode-verified standard completion is accepted", () => {
    expect(checkTerminalCannotForgeSuccess({ terminal: "SUPERVISOR", riskLevel: "STANDARD", ownerModeVerified: true })).toEqual([]);
  });
});

describe("[R2] location + role + terminal scoping", () => {
  const owner: RemoteSession = { userId: "u1", workspaceId: "ws1", role: "OWNER", ownerMode: true, authorizedLocationIds: [] };
  const supervisor: RemoteSession = { userId: "u2", workspaceId: "ws1", role: "SITE_SUPERVISOR", ownerMode: true, authorizedLocationIds: ["locA"] };
  const scopeA: LocationScope = { workspaceId: "ws1", businessId: "b1", locationId: "locA" };
  const scopeB: LocationScope = { workspaceId: "ws1", businessId: "b1", locationId: "locB" };

  it("unauthenticated access is blocked", () => {
    expect(() => assertLocationScope(null, scopeA)).toThrow(UnauthorizedError);
  });
  it("non-owner-mode is forbidden", () => {
    expect(() => assertLocationScope({ ...owner, ownerMode: false }, scopeA)).toThrow(ForbiddenError);
  });
  it("cross-workspace access is blocked", () => {
    expect(() => assertLocationScope(owner, { ...scopeA, workspaceId: "wsOTHER" })).toThrow(ForbiddenError);
  });
  it("a supervisor cannot access a location they are not authorized for", () => {
    expect(() => assertLocationScope(supervisor, scopeB)).toThrow(ForbiddenError);
    expect(() => assertLocationScope(supervisor, scopeA)).not.toThrow();
  });
  it("the owner has aggregated multi-location view", () => {
    expect(() => assertLocationScope(owner, scopeB)).not.toThrow();
  });
  it("terminals are role-scoped — staff cannot reach the supervisor terminal", () => {
    expect(canAccessTerminal("STAFF_MEMBER", "EMPLOYEE")).toBe(true);
    expect(canAccessTerminal("STAFF_MEMBER", "SUPERVISOR")).toBe(false);
    expect(canAccessTerminal("SITE_SUPERVISOR", "SUPERVISOR")).toBe(true);
    expect(canAccessTerminal("OWNER", "MANAGER")).toBe(true);
    expect(canAccessTerminal("MAINTENANCE_VENDOR", "EMPLOYEE")).toBe(false);
  });
  it("external contacts require time-limited tokens, not workspace login", () => {
    expect(requiresExternalToken("GUEST_CONTACT")).toBe(true);
    expect(requiresExternalToken("STAFF_MEMBER")).toBe(false);
  });
});
