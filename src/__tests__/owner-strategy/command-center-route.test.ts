/**
 * Phase 24-25 runtime surface — wealth command-center route enforcement (no server).
 * The composition itself is proven by wealth-loop-simulation.test.ts; the DB path
 * by command-center.db.test.ts. This proves the route is canonically enforced.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/api/owner/wealth-command-center/route.ts"),
  "utf8",
);

describe("wealth-command-center route — source content assertions (no server)", () => {
  it("imports getWealthCommandCenter from a command-center service", () => {
    expect(src).toContain("getWealthCommandCenter");
    expect(src).toMatch(/from ["'].*command-center.*["']/);
  });
  it("imports CAPABILITIES from constants", () => {
    expect(src).toContain("CAPABILITIES");
    expect(src).toMatch(/from ["'].*capabilities["']/);
  });
  it("exports a GET handler", () => {
    expect(src).toContain("export const GET");
  });
  it("declares dynamic = 'force-dynamic' (not static)", () => {
    expect(src).toContain('force-dynamic');
  });
  it("declares runtime = 'nodejs'", () => {
    expect(src).toContain("nodejs");
  });
  it("reads businessId from URL search params", () => {
    expect(src).toContain("businessId");
    expect(src).toContain("searchParams");
  });
  it("uses verifiedWorkspaceId from the canonical context", () => {
    expect(src).toContain("verifiedWorkspaceId");
  });
  it("does not import from '@/lib/db' directly (no raw DB access in route)", () => {
    expect(src).not.toMatch(/from ["']@\/lib\/db["']/);
  });
  it("imports withCanonicalEnforcement from canonical-route-enforcement", () => {
    expect(src).toMatch(/from ["'].*canonical-route-enforcement["']/);
  });
  it("uses OWNER_VIEW capability (not ADMIN or other)", () => {
    expect(src).toContain("OWNER_VIEW");
  });
  it("imports CanonicalAuthContext type", () => {
    expect(src).toContain("CanonicalAuthContext");
  });
  it("requireWorkspace is set to true (not false or missing)", () => {
    expect(src).toContain("requireWorkspace: true");
    expect(src).not.toContain("requireWorkspace: false");
  });
  it("route file is non-empty", () => {
    expect(src.length).toBeGreaterThan(0);
  });
  it("route file does not contain hard-coded workspaceId literals", () => {
    expect(src).not.toMatch(/workspaceId:\s*["'][a-z0-9-]+["']/);
  });
  it("does not use deprecated withAuth pattern", () => {
    expect(src).not.toMatch(/withAuth\s*\(/);
  });
  it("does not use Session or getServerSession directly", () => {
    expect(src).not.toContain("getServerSession");
  });
  it("uses requireCapabilities array format", () => {
    expect(src).toMatch(/requireCapabilities:\s*\[/);
  });
  it("does not reference any hardcoded user IDs", () => {
    expect(src).not.toMatch(/userId:\s*["'][a-z0-9-]+["']/);
  });
  it("route comment or JSDoc describes the route path and purpose", () => {
    expect(src).toContain("GET /api/owner/wealth-command-center");
  });
});

describe("wealth-command-center route enforcement", () => {
  it("uses canonical enforcement + requires workspace + OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });
  it("does not import auth libraries directly", () => {
    expect(src).not.toMatch(/from ["']@\/lib\/auth-guard["']/);
    expect(src).not.toMatch(/requireAuth\b/);
  });
});
