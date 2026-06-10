/**
 * Authorization wiring proof for Owner Recovery Mode (deterministic, no server).
 *
 * Proves (a) the capability policy grants OWNER_VIEW/OWNER_MANAGE to the owner
 * persona and denies them to client/viewer roles, and (b) every recovery route
 * declares the correct capability + workspace requirement in source.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { getCapabilitiesForRole } from "@/policies/capability-check";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";

describe("Owner Recovery authorization policy", () => {
  it("grants OWNER_VIEW and OWNER_MANAGE to the owner/portfolio persona", () => {
    const caps = getCapabilitiesForRole(ROLES.ADMIN_OR_PORTFOLIO_MANAGER);
    expect(caps).toContain(CAPABILITIES.OWNER_VIEW);
    expect(caps).toContain(CAPABILITIES.OWNER_MANAGE);
  });

  it("system admin has both owner capabilities", () => {
    const caps = getCapabilitiesForRole(ROLES.SYSTEM_ADMIN);
    expect(caps).toContain(CAPABILITIES.OWNER_VIEW);
    expect(caps).toContain(CAPABILITIES.OWNER_MANAGE);
  });

  it("denies owner capabilities to client and viewer roles", () => {
    for (const role of [ROLES.CLIENT_OWNER, ROLES.CLIENT_TEAM_MEMBER, ROLES.VIEWER, ROLES.ANALYST]) {
      const caps = getCapabilitiesForRole(role);
      expect(caps).not.toContain(CAPABILITIES.OWNER_VIEW);
      expect(caps).not.toContain(CAPABILITIES.OWNER_MANAGE);
    }
  });
});

describe("Owner Recovery route capability declarations", () => {
  const base = path.resolve(__dirname, "../../app/api/owner/recovery");

  function read(rel: string): string {
    return fs.readFileSync(path.join(base, rel), "utf8");
  }

  it("every recovery route enforces workspace + a capability", () => {
    const routeFiles = [
      "businesses/route.ts",
      "businesses/[businessId]/route.ts",
      "businesses/[businessId]/snapshots/route.ts",
      "businesses/[businessId]/cycles/route.ts",
      "cycles/[cycleId]/route.ts",
      "actions/[actionId]/route.ts",
      "actions/[actionId]/verify/route.ts",
      "dashboard/route.ts",
    ];
    for (const f of routeFiles) {
      const src = read(f);
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} must reference OWNER_ capabilities`).toMatch(/CAPABILITIES\.OWNER_(VIEW|MANAGE)/);
    }
  });

  it("write handlers require OWNER_MANAGE and read handlers require OWNER_VIEW", () => {
    // Writes (POST/PATCH) must gate on OWNER_MANAGE.
    expect(read("businesses/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(read("businesses/[businessId]/snapshots/route.ts")).toMatch(/CAPABILITIES\.OWNER_MANAGE/);
    expect(read("businesses/[businessId]/cycles/route.ts")).toMatch(/CAPABILITIES\.OWNER_MANAGE/);
    expect(read("actions/[actionId]/verify/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    // Pure reads gate on OWNER_VIEW.
    expect(read("dashboard/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    expect(read("cycles/[cycleId]/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
});
