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
const ROUTES = ["explanations/route.ts", "audit-trail/route.ts"];

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
