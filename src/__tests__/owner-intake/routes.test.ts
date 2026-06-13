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
