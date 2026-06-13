/**
 * Owner SOP (Module 7 Slice 5) — route enforcement wiring proof (no server).
 *
 * Proves every sop route is canonically enforced: uses
 * `withCanonicalEnforcement`, requires a workspace, and gates on the correct
 * OWNER_VIEW (read) / OWNER_MANAGE (write) capability — mirroring the proven
 * Module 2/3/4/5 route wiring. The deployed runtime proof confirms live behavior.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const base = path.resolve(__dirname, "../../app/api/owner/sop");
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

describe("Owner SOP route enforcement", () => {
  it("every sop route uses canonical enforcement + requires workspace", () => {
    for (const f of ALL_ROUTES) {
      const src = read(f);
      expect(src, `${f} must use withCanonicalEnforcement`).toContain("withCanonicalEnforcement");
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} must reference OWNER_ capabilities`).toMatch(/CAPABILITIES\.OWNER_(VIEW|MANAGE)/);
    }
  });

  it("write routes gate on OWNER_MANAGE", () => {
    for (const f of WRITE_ROUTES) {
      expect(read(f)).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    }
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

  it("does not import or modify any other domain's route/table", () => {
    for (const f of ALL_ROUTES) {
      const src = read(f);
      expect(src).not.toContain("/api/owner/finance");
      expect(src).not.toContain("/api/owner/cashflow");
      expect(src).not.toContain("/api/owner/sales");
      expect(src).not.toContain("/api/owner/operations");
      expect(src).not.toContain("owner-finance");
      expect(src).not.toContain("owner-cashflow");
      expect(src).not.toContain("owner-sales");
      expect(src).not.toContain("owner-operations");
    }
  });
});
