/**
 * Privilege-boundary proofs for ACCEPTANCE_FIXTURE_WRITE / ROLES.ACCEPTANCE_FIXTURE_OPERATOR.
 * No database: pure policy + static route-declaration checks.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES, ROLE_HIERARCHY, INTERNAL_ROLES, isClientRole } from "@/domain/constants/roles";
import { getCapabilitiesForRole, hasCapability, type PolicyContext } from "@/policies/capability-check";

const ctx = (roles: PolicyContext["roles"], workspaceRole?: string): PolicyContext => ({ userId: "u", roles, workspaceRole });
const W = { scope: "workspace", scopeId: "ws-1" };

describe("ACCEPTANCE_FIXTURE_OPERATOR bundle", () => {
  it("carries EXACTLY ACCEPTANCE_FIXTURE_WRITE", () => {
    expect([...getCapabilitiesForRole(ROLES.ACCEPTANCE_FIXTURE_OPERATOR)]).toEqual([CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE]);
  });

  it("grants no SYSTEM_ADMIN, no user/role/audit/admin, no owner or billing authority", () => {
    const only = ctx([{ role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, ...W }]);
    for (const cap of Object.values(CAPABILITIES)) {
      expect(hasCapability(only, cap)).toBe(cap === CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE);
    }
    for (const cap of [
      CAPABILITIES.SYSTEM_ADMIN, CAPABILITIES.USER_ASSIGN_ROLE, CAPABILITIES.USER_CREATE, CAPABILITIES.SYSTEM_VIEW_AUDIT,
      CAPABILITIES.OWNER_MANAGE, CAPABILITIES.OWNER_VIEW, CAPABILITIES.CUSTOMER_ACCESS_MANAGE, CAPABILITIES.BETA_PROGRAM_MANAGE,
    ]) {
      expect(hasCapability(only, cap)).toBe(false);
    }
  });

  it("is held by no other role except SYSTEM_ADMIN (whose bundle is every capability)", () => {
    const holders = Object.values(ROLES).filter((r) => getCapabilitiesForRole(r).includes(CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE));
    expect(holders.sort()).toEqual([ROLES.ACCEPTANCE_FIXTURE_OPERATOR, ROLES.SYSTEM_ADMIN].sort());
  });

  it("is not inherited by a self-serve owner or a full ADMIN_OR_PORTFOLIO_MANAGER", () => {
    expect(hasCapability(ctx([{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ...W }], "owner"), CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(false);
    expect(hasCapability(ctx([{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ...W }], "admin"), CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(false);
    expect(hasCapability(ctx([{ role: ROLES.BETA_REQUEST_OPERATOR, ...W }, { role: ROLES.ADMINISTRATION_OPERATOR, ...W }]), CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(false);
  });

  it("is additive to a real owner identity and adds nothing but the one capability", () => {
    const owner = ctx([{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ...W }], "owner");
    const acceptance = ctx([{ role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, ...W }, { role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, ...W }], "owner");
    for (const cap of Object.values(CAPABILITIES)) {
      const expected = hasCapability(owner, cap) || cap === CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE;
      expect(hasCapability(acceptance, cap)).toBe(expected);
    }
    expect(hasCapability(acceptance, CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
  });

  it("SYSTEM_ADMIN still passes (no second code path)", () => {
    expect(hasCapability(ctx([{ role: ROLES.SYSTEM_ADMIN, ...W }]), CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(true);
  });

  it("is an internal, low-hierarchy role and never a client role", () => {
    expect(INTERNAL_ROLES).toContain(ROLES.ACCEPTANCE_FIXTURE_OPERATOR);
    expect(isClientRole(ROLES.ACCEPTANCE_FIXTURE_OPERATOR)).toBe(false);
    expect(ROLE_HIERARCHY[ROLES.ACCEPTANCE_FIXTURE_OPERATOR]).toBe(5);
    // A client role can never exercise it even if it were somehow listed.
    expect(hasCapability(ctx([{ role: ROLES.CLIENT_OWNER, ...W }]), CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(false);
  });
});

describe("/api/admin/acceptance-fixtures/* declare one identical gate (preflight cannot drift from writes)", () => {
  const root = join(process.cwd(), "src/app/api/admin/acceptance-fixtures");
  const routes: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === "route.ts") routes.push(p);
    }
  })(root);

  it("finds the capability probe and all three write routes", () => {
    expect(routes.map((r) => r.slice(root.length)).sort()).toEqual([
      "/businesses/route.ts",
      "/capability/route.ts",
      "/startup-sessions/[sessionId]/blueprint/route.ts",
      "/startup-sessions/route.ts",
    ]);
  });

  it("each declares exactly requireCapabilities:[ACCEPTANCE_FIXTURE_WRITE] and requireWorkspace:true, with no other capability or workspace parameter", () => {
    for (const r of routes) {
      const src = readFileSync(r, "utf8");
      expect(src, r).toContain("requireCapabilities: [CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE], requireWorkspace: true");
      expect((src.match(/CAPABILITIES\.[A-Z_]+/g) ?? []).every((c) => c === "CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE"), r).toBe(true);
      expect(src, r).not.toMatch(/searchParams|workspaceId\s*[:=]\s*(body|input|url)/);
      expect(src, r).not.toContain("SYSTEM_ADMIN");
    }
  });

  it("write routes hard-wire the fixture flag and never read it from the request", () => {
    for (const r of routes.filter((x) => !x.endsWith("capability/route.ts"))) {
      const src = readFileSync(r, "utf8");
      expect(src, r).toMatch(/isFixture(Business|Record): true/);
      expect(src, r).not.toMatch(/body\.isFixture|input\.isFixture/);
    }
  });
});
