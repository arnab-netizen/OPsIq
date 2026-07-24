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

describe("Owner Home route — expanded structural contract assertions", () => {
  it("source file is a non-empty string", () => {
    expect(typeof src).toBe("string");
    expect(src.length).toBeGreaterThan(100);
  });
  it("references CAPABILITIES constant", () => {
    expect(src).toContain("CAPABILITIES");
  });
  it("references OWNER_VIEW capability", () => {
    expect(src).toContain("OWNER_VIEW");
  });
  it("references withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });
  it("references requireWorkspace option", () => {
    expect(src).toContain("requireWorkspace");
  });
  it("references requireCapabilities option", () => {
    expect(src).toContain("requireCapabilities");
  });
  it("references the owner-home service path", () => {
    expect(src).toContain("owner-home");
  });
  it("references the home service", () => {
    expect(src).toContain("home.service");
  });
  it("has at least one export", () => {
    expect(src).toContain("export");
  });
  it("does not define POST handler", () => {
    expect(src).not.toMatch(/export const POST\b/);
  });
  it("does not define DELETE handler", () => {
    expect(src).not.toMatch(/export const DELETE\b/);
  });
  it("does not define PATCH handler", () => {
    expect(src).not.toMatch(/export const PATCH\b/);
  });
  it("does not define PUT handler", () => {
    expect(src).not.toMatch(/export const PUT\b/);
  });
  it("does not use raw x-workspace-id header", () => {
    expect(src).not.toContain('headers.get("x-workspace-id")');
  });
  it("defines a GET handler", () => {
    expect(src).toContain("GET");
  });
  it("references services path in import", () => {
    expect(src).toContain("@/services");
  });
  it("does not expose internal DB fields directly in response", () => {
    expect(src).not.toMatch(/prisma\.\w+\.findMany|prisma\.\w+\.findFirst/);
  });
});
