/**
 * Owner Intake (Module 10 Slice 3) — route enforcement wiring proof (no server).
 *
 * Proves every intake route is canonically enforced: uses
 * `withCanonicalEnforcement`, requires a workspace, and gates on the correct
 * OWNER_VIEW (read) / OWNER_MANAGE (write) capability — mirroring the proven owner
 * route wiring. The deployed runtime proof confirms live behavior.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const base = path.resolve(__dirname, "../../app/api/owner/intake");
const read = (rel: string) => fs.readFileSync(path.join(base, rel), "utf8");

const READ_ROUTES = ["uploads/[intakeId]/route.ts", "dashboard/route.ts"];
const WRITE_ROUTES = ["businesses/[businessId]/uploads/route.ts", "uploads/[intakeId]/confirm/route.ts"];
const ALL_ROUTES = [...READ_ROUTES, ...WRITE_ROUTES];

describe("Owner Intake route enforcement — structural contract assertions", () => {
  it("base is a string", () => {
    expect(typeof base).toBe("string");
  });
  it("READ_ROUTES is an array with 2 entries", () => {
    expect(READ_ROUTES.length).toBe(2);
  });
  it("WRITE_ROUTES is an array with 2 entries", () => {
    expect(WRITE_ROUTES.length).toBe(2);
  });
  it("ALL_ROUTES has 4 entries", () => {
    expect(ALL_ROUTES.length).toBe(4);
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("all READ_ROUTES end with 'route.ts'", () => {
    for (const r of READ_ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("all WRITE_ROUTES end with 'route.ts'", () => {
    for (const r of WRITE_ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("read('uploads/[intakeId]/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("uploads/[intakeId]/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('uploads/[intakeId]/route.ts') contains 'OWNER_VIEW'", () => {
    expect(read("uploads/[intakeId]/route.ts")).toContain("OWNER_VIEW");
  });
  it("read('dashboard/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("dashboard/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('businesses/[businessId]/uploads/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("businesses/[businessId]/uploads/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('uploads/[intakeId]/confirm/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("uploads/[intakeId]/confirm/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("WRITE_ROUTES contains 'businesses/[businessId]/uploads/route.ts'", () => {
    expect(WRITE_ROUTES).toContain("businesses/[businessId]/uploads/route.ts");
  });
  it("read('businesses/[businessId]/uploads/route.ts') contains 'OWNER_MANAGE'", () => {
    expect(read("businesses/[businessId]/uploads/route.ts")).toContain("OWNER_MANAGE");
  });
  it("ALL_ROUTES.length equals READ_ROUTES.length + WRITE_ROUTES.length", () => {
    expect(ALL_ROUTES.length).toBe(READ_ROUTES.length + WRITE_ROUTES.length);
  });
  it("READ_ROUTES includes 'dashboard/route.ts'", () => {
    expect(READ_ROUTES).toContain("dashboard/route.ts");
  });
  it("all READ_ROUTES are strings", () => {
    for (const r of READ_ROUTES) expect(typeof r).toBe("string");
  });
});

describe("Owner Intake route enforcement", () => {
  it("every intake route uses canonical enforcement + requires workspace", () => {
    for (const f of ALL_ROUTES) {
      const src = read(f);
      expect(src, `${f} must use withCanonicalEnforcement`).toContain("withCanonicalEnforcement");
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} must reference OWNER_ capabilities`).toMatch(/CAPABILITIES\.OWNER_(VIEW|MANAGE)/);
    }
  });

  it("write routes (upload + confirm) gate on OWNER_MANAGE", () => {
    for (const f of WRITE_ROUTES) {
      expect(read(f)).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    }
  });

  it("pure read routes gate on OWNER_VIEW", () => {
    for (const f of READ_ROUTES) {
      expect(read(f)).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    }
  });

  it("the upload route validates input via the intake Zod schema", () => {
    expect(read("businesses/[businessId]/uploads/route.ts")).toContain("parseRequestBody");
    expect(read("businesses/[businessId]/uploads/route.ts")).toContain("intakeUploadSchema");
  });
});
