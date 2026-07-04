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
