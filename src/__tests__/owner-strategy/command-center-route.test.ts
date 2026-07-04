/**
 * Phase 24-25 runtime surface — wealth command-center route enforcement (no server).
 * The composition itself is proven by wealth-loop-simulation.test.ts; the DB path
 * by command-center.db.test.ts. This proves the route is canonically enforced.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/api/owner/wealth-command-center/route.ts"),
  "utf8",
);

describe("wealth-command-center route enforcement", () => {
  it("uses canonical enforcement + requires workspace + OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
  it("does not import auth libraries directly", () => {
    expect(src).not.toMatch(/from ["']@\/lib\/auth-guard["']/);
    expect(src).not.toMatch(/requireAuth\b/);
  });
});
