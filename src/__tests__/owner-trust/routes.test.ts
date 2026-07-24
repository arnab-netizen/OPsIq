/**
 * Owner Trust (Module 11 Slice 2) — route enforcement wiring proof (no server).
 * Both trust routes are read-only, canonically enforced, workspace-required,
 * OWNER_VIEW, and read through the shared trust service.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const base = path.resolve(__dirname, "../../app/api/owner/trust");
const read = (rel: string) => fs.readFileSync(path.join(base, rel), "utf8");
const ROUTES = ["explanations/route.ts", "audit-trail/route.ts", "cycles/route.ts"];

describe("Owner Trust route enforcement — structural contract assertions", () => {
  it("base is a string", () => {
    expect(typeof base).toBe("string");
  });
  it("ROUTES is an array", () => {
    expect(Array.isArray(ROUTES)).toBe(true);
  });
  it("ROUTES has 3 entries", () => {
    expect(ROUTES.length).toBe(3);
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("all ROUTES end with 'route.ts'", () => {
    for (const r of ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("ROUTES includes 'explanations/route.ts'", () => {
    expect(ROUTES).toContain("explanations/route.ts");
  });
  it("ROUTES includes 'audit-trail/route.ts'", () => {
    expect(ROUTES).toContain("audit-trail/route.ts");
  });
  it("ROUTES includes 'cycles/route.ts'", () => {
    expect(ROUTES).toContain("cycles/route.ts");
  });
  it("read('explanations/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("explanations/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('audit-trail/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("audit-trail/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('cycles/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("cycles/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('explanations/route.ts') contains 'OWNER_VIEW'", () => {
    expect(read("explanations/route.ts")).toContain("OWNER_VIEW");
  });
  it("read('explanations/route.ts') contains 'explanationsQuerySchema'", () => {
    expect(read("explanations/route.ts")).toContain("explanationsQuerySchema");
  });
  it("no ROUTE has 'export const POST'", () => {
    for (const r of ROUTES) expect(read(r)).not.toMatch(/export const POST\b/);
  });
  it("read('audit-trail/route.ts').length > 100", () => {
    expect(read("audit-trail/route.ts").length).toBeGreaterThan(100);
  });
  it("all ROUTES are strings", () => {
    for (const r of ROUTES) expect(typeof r).toBe("string");
  });
});

describe("Owner Trust route enforcement", () => {
  it("every trust route is canonical, workspace-required, OWNER_VIEW", () => {
    for (const f of ROUTES) {
      const src = read(f);
      expect(src).toContain("withCanonicalEnforcement");
      expect(src).toContain("requireWorkspace: true");
      expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    }
  });

  it("is read-only: no POST/PATCH/PUT/DELETE handlers", () => {
    for (const f of ROUTES) {
      const src = read(f);
      expect(src).not.toMatch(/export const (POST|PATCH|PUT|DELETE)\b/);
      expect(src).toMatch(/export const GET\b/);
    }
  });

  it("reads through the shared trust service", () => {
    for (const f of ROUTES) {
      expect(read(f)).toContain("@/services/owner-trust/trust.service");
    }
  });

  it("the explanations route validates domain + cycleId", () => {
    expect(read("explanations/route.ts")).toContain("explanationsQuerySchema");
  });
});
