/**
 * Owner Home (Module 12 Slice 2) — route enforcement wiring proof (no server).
 * The owner-home route is read-only, canonically enforced, workspace-required,
 * OWNER_VIEW, and reads through the shared owner-home service.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/api/owner/home/route.ts"),
  "utf8"
);

describe("Owner Home route enforcement", () => {
  it("is canonical, workspace-required, OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });

  it("is read-only: GET only, no POST/PATCH/PUT/DELETE handlers", () => {
    expect(src).not.toMatch(/export const (POST|PATCH|PUT|DELETE)\b/);
    expect(src).toMatch(/export const GET\b/);
  });

  it("reads through the shared owner-home service", () => {
    expect(src).toContain("@/services/owner-home/home.service");
  });
});
