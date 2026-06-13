/**
 * Owner Portfolio (Module 9 Slice 2) — route enforcement wiring proof (no server).
 *
 * Proves every portfolio route is canonically enforced: uses
 * `withCanonicalEnforcement`, requires a workspace, and gates on OWNER_VIEW (the
 * module is read-only — no write routes). Mirrors the proven command-center wiring.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const base = path.resolve(__dirname, "../../app/api/owner/portfolio");
const read = (rel: string) => fs.readFileSync(path.join(base, rel), "utf8");

const READ_ROUTES = [
  "dashboard/route.ts",
  "ranking/route.ts",
  "actions/route.ts",
  "risks/route.ts",
];

describe("Owner Portfolio route enforcement", () => {
  it("every portfolio route uses canonical enforcement + requires workspace + OWNER_VIEW", () => {
    for (const f of READ_ROUTES) {
      const src = read(f);
      expect(src, `${f} must use withCanonicalEnforcement`).toContain("withCanonicalEnforcement");
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} must gate on OWNER_VIEW`).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    }
  });

  it("is read-only: no route defines a POST/PATCH/PUT/DELETE handler", () => {
    for (const f of READ_ROUTES) {
      const src = read(f);
      expect(src).not.toMatch(/export const (POST|PATCH|PUT|DELETE)\b/);
      expect(src).toMatch(/export const GET\b/);
    }
  });

  it("reads through the shared portfolio service (single source of truth)", () => {
    for (const f of READ_ROUTES) {
      expect(read(f)).toContain("@/services/owner-portfolio/portfolio.service");
    }
  });
});
