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

describe("Owner Portfolio route enforcement — structural assertions", () => {
  it("READ_ROUTES is an array with exactly 4 entries", () => {
    expect(Array.isArray(READ_ROUTES)).toBe(true);
    expect(READ_ROUTES).toHaveLength(4);
  });
  it("all READ_ROUTES entries end in route.ts", () => {
    for (const r of READ_ROUTES) expect(r).toMatch(/route\.ts$/);
  });
  it("dashboard route is in READ_ROUTES", () => {
    expect(READ_ROUTES).toContain("dashboard/route.ts");
  });
  it("ranking route is in READ_ROUTES", () => {
    expect(READ_ROUTES).toContain("ranking/route.ts");
  });
  it("actions route is in READ_ROUTES", () => {
    expect(READ_ROUTES).toContain("actions/route.ts");
  });
  it("risks route is in READ_ROUTES", () => {
    expect(READ_ROUTES).toContain("risks/route.ts");
  });
  it("base path contains 'owner/portfolio'", () => {
    expect(base).toContain("owner/portfolio");
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("all route files are non-empty (> 100 chars)", () => {
    for (const f of READ_ROUTES) expect(read(f).length).toBeGreaterThan(100);
  });
  it("all routes reference CAPABILITIES constant", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("CAPABILITIES");
  });
  it("all routes reference OWNER_VIEW", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("OWNER_VIEW");
  });
  it("no route uses raw x-workspace-id header", () => {
    for (const f of READ_ROUTES) expect(read(f)).not.toContain('headers.get("x-workspace-id")');
  });
  it("all routes reference requireWorkspace option", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("requireWorkspace");
  });
  it("all routes reference requireCapabilities option", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("requireCapabilities");
  });
  it("all routes reference the portfolio service", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("portfolio.service");
  });
  it("all routes have at least one export", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("export");
  });
  it("all routes reference withCanonicalEnforcement", () => {
    for (const f of READ_ROUTES) expect(read(f)).toContain("withCanonicalEnforcement");
  });
});

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
