/**
 * Regression guard for GAP-WIRE-01 (full-repo commercial audit).
 *
 * The Owner wealth-loop / command-center feature shipped with a complete
 * engine→service→API chain but NO UI reaching it — no owner could use it. This
 * test locks the wiring: the owner Wealth page exists and calls the endpoint,
 * the owner command-center nav links to it, and the API route is capability-
 * gated + workspace-scoped.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

describe("owner wealth command center wiring — structural assertions", () => {
  it("ROOT path is a non-empty string", () => {
    expect(typeof ROOT).toBe("string");
    expect(ROOT.length).toBeGreaterThan(0);
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("wealth page is non-empty (> 100 chars)", () => {
    expect(read("app/(authenticated)/owner/wealth/page.tsx").length).toBeGreaterThan(100);
  });
  it("owner hub page is non-empty (> 100 chars)", () => {
    expect(read("app/(authenticated)/owner/page.tsx").length).toBeGreaterThan(100);
  });
  it("wealth route file is non-empty (> 100 chars)", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts").length).toBeGreaterThan(100);
  });
  it("wealth page references nextBestMove", () => {
    expect(read("app/(authenticated)/owner/wealth/page.tsx")).toContain("nextBestMove");
  });
  it("wealth page references the API endpoint path", () => {
    expect(read("app/(authenticated)/owner/wealth/page.tsx")).toContain("wealth-command-center");
  });
  it("wealth page has at least one export", () => {
    expect(read("app/(authenticated)/owner/wealth/page.tsx")).toContain("export");
  });
  it("owner hub page does not use raw x-workspace-id header", () => {
    expect(read("app/(authenticated)/owner/page.tsx")).not.toContain('headers.get("x-workspace-id")');
  });
  it("wealth route uses verifiedWorkspaceId", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).toContain("verifiedWorkspaceId");
  });
  it("wealth route references requireWorkspace", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).toContain("requireWorkspace");
  });
  it("wealth route references requireCapabilities", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).toContain("requireCapabilities");
  });
  it("wealth route does not define a POST handler", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).not.toMatch(/export const POST\b/);
  });
  it("wealth route does not define a DELETE handler", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).not.toMatch(/export const DELETE\b/);
  });
  it("wealth route does not define a PATCH handler", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).not.toMatch(/export const PATCH\b/);
  });
  it("wealth route does not use raw x-workspace-id header", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).not.toContain('headers.get("x-workspace-id")');
  });
  it("wealth route has at least one export", () => {
    expect(read("app/api/owner/wealth-command-center/route.ts")).toContain("export");
  });
});

describe("owner wealth command center wiring (GAP-WIRE-01)", () => {
  it("the owner Wealth page exists and fetches the wealth-command-center endpoint", () => {
    const page = read("app/(authenticated)/owner/wealth/page.tsx");
    expect(page).toContain("/api/owner/wealth-command-center");
    expect(page).toContain("nextBestMove");
  });

  it("the owner command center nav links to /owner/wealth", () => {
    const ownerHub = read("app/(authenticated)/owner/page.tsx");
    expect(ownerHub).toContain("/owner/wealth");
  });

  it("the wealth-command-center API route is capability-gated and workspace-scoped", () => {
    const route = read("app/api/owner/wealth-command-center/route.ts");
    expect(route).toContain("withCanonicalEnforcement");
    expect(route).toContain("OWNER_VIEW");
    expect(route).toContain("requireWorkspace: true");
    // Uses the verified workspace, never a client-supplied header.
    expect(route).toContain("verifiedWorkspaceId");
    expect(route).not.toContain('headers.get("x-workspace-id")');
  });
});
