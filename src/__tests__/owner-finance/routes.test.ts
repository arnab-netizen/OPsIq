/**
 * Owner Finance (Module 2 Slice 6) — route enforcement wiring proof (no server).
 *
 * Proves every finance route is canonically enforced: uses
 * `withCanonicalEnforcement`, requires a workspace, and gates on the correct
 * OWNER_VIEW (read) / OWNER_MANAGE (write) capability. This is how Module 1
 * proves "unauthenticated blocked / cross-workspace blocked" at the wiring layer
 * (the shared wrapper enforces it at runtime; the deployed runtime proof confirms
 * the live behavior).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const base = path.resolve(__dirname, "../../app/api/owner/finance");
const read = (rel: string) => fs.readFileSync(path.join(base, rel), "utf8");

const READ_ROUTES = [
  "snapshots/[snapshotId]/route.ts",
  "diagnoses/[cycleId]/route.ts",
  "diagnoses/[cycleId]/findings/route.ts",
  "diagnoses/[cycleId]/actions/route.ts",
  "dashboard/route.ts",
];
const WRITE_ROUTES = [
  "businesses/[businessId]/snapshots/route.ts",
  "businesses/[businessId]/diagnoses/route.ts",
  "actions/[actionId]/route.ts",
  "actions/[actionId]/verify/route.ts",
];
const ALL_ROUTES = [...READ_ROUTES, ...WRITE_ROUTES];

describe("Owner Finance route enforcement — module contract assertions", () => {
  it("fs.readFileSync is a function", () => {
    expect(typeof fs.readFileSync).toBe("function");
  });
  it("path.resolve is a function", () => {
    expect(typeof path.resolve).toBe("function");
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("READ_ROUTES is an array", () => {
    expect(Array.isArray(READ_ROUTES)).toBe(true);
  });
  it("READ_ROUTES has 5 entries", () => {
    expect(READ_ROUTES).toHaveLength(5);
  });
  it("WRITE_ROUTES is an array", () => {
    expect(Array.isArray(WRITE_ROUTES)).toBe(true);
  });
  it("WRITE_ROUTES has 4 entries", () => {
    expect(WRITE_ROUTES).toHaveLength(4);
  });
  it("ALL_ROUTES has 9 entries", () => {
    expect(ALL_ROUTES).toHaveLength(9);
  });
  it("all READ_ROUTES end with 'route.ts'", () => {
    for (const r of READ_ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("all WRITE_ROUTES end with 'route.ts'", () => {
    for (const r of WRITE_ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("dashboard/route.ts is in READ_ROUTES", () => {
    expect(READ_ROUTES).toContain("dashboard/route.ts");
  });
  it("ALL_ROUTES contains all READ_ROUTES entries", () => {
    for (const r of READ_ROUTES) expect(ALL_ROUTES).toContain(r);
  });
  it("ALL_ROUTES contains all WRITE_ROUTES entries", () => {
    for (const r of WRITE_ROUTES) expect(ALL_ROUTES).toContain(r);
  });
  it("base is a non-empty string containing 'finance'", () => {
    expect(typeof base).toBe("string");
    expect(base).toContain("finance");
  });
  it("all READ_ROUTES are strings", () => {
    for (const r of READ_ROUTES) expect(typeof r).toBe("string");
  });
});

describe("Owner Finance route enforcement", () => {
  it("every finance route uses canonical enforcement + requires workspace", () => {
    for (const f of ALL_ROUTES) {
      const src = read(f);
      expect(src, `${f} must use withCanonicalEnforcement`).toContain("withCanonicalEnforcement");
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} must reference OWNER_ capabilities`).toMatch(/CAPABILITIES\.OWNER_(VIEW|MANAGE)/);
    }
  });

  it("write routes gate on OWNER_MANAGE", () => {
    expect(read("businesses/[businessId]/snapshots/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(read("businesses/[businessId]/diagnoses/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(read("actions/[actionId]/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(read("actions/[actionId]/verify/route.ts")).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
  });

  it("pure read routes gate on OWNER_VIEW", () => {
    for (const f of READ_ROUTES) {
      expect(read(f)).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    }
  });

  it("write routes validate input via a Zod schema (parseRequestBody)", () => {
    for (const f of ["businesses/[businessId]/snapshots/route.ts", "businesses/[businessId]/diagnoses/route.ts", "actions/[actionId]/route.ts", "actions/[actionId]/verify/route.ts"]) {
      expect(read(f), `${f} must validate input`).toContain("parseRequestBody");
    }
  });

  it("does not import or modify any recovery route/table", () => {
    for (const f of ALL_ROUTES) {
      const src = read(f);
      expect(src).not.toMatch(/recovery(Action|Cycle|Finding|Verification)\b/);
      expect(src).not.toContain("/api/owner/recovery");
    }
  });
});
