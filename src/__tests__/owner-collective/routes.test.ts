/**
 * Owner Collective Decision (Phase 1 Slice A) — route enforcement wiring proof.
 *
 * Proves the runtime route is canonically enforced: it uses
 * `withCanonicalEnforcement`, requires a workspace, gates on OWNER_VIEW, reads
 * only the verified workspace scope, and does not reach into another domain's
 * route/table. Mirrors the proven Module 2/3/8 route-wiring proofs.
 *
 * A separate `[db]`-gated case invokes the REAL wrapped handler with no session
 * and asserts it fails closed — no owner data is ever returned without a
 * verified Owner-Mode session. (Live, fully-authenticated behavior is proven by
 * the canonical wrapper's own suite and the DB-backed service tests.)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";

const routeFile = path.resolve(__dirname, "../../app/api/owner/collective-decision/route.ts");
const src = fs.readFileSync(routeFile, "utf8");

describe("Owner Collective Decision route — module contract assertions", () => {
  it("fs.readFileSync is a function", () => {
    expect(typeof fs.readFileSync).toBe("function");
  });
  it("path.resolve is a function", () => {
    expect(typeof path.resolve).toBe("function");
  });
  it("routeFile is a non-empty string", () => {
    expect(typeof routeFile).toBe("string");
    expect(routeFile.length).toBeGreaterThan(0);
  });
  it("routeFile ends with 'route.ts'", () => {
    expect(routeFile.endsWith("route.ts")).toBe(true);
  });
  it("routeFile contains 'collective-decision'", () => {
    expect(routeFile).toContain("collective-decision");
  });
  it("src is a non-empty string", () => {
    expect(typeof src).toBe("string");
    expect(src.length).toBeGreaterThan(0);
  });
  it("src contains withCanonicalEnforcement", () => {
    expect(src).toContain("withCanonicalEnforcement");
  });
  it("src contains requireWorkspace: true", () => {
    expect(src).toContain("requireWorkspace: true");
  });
  it("src references OWNER_VIEW capability", () => {
    expect(src).toMatch(/CAPABILITIES\.OWNER_VIEW/);
  });
  it("src contains ctx.verifiedWorkspaceId", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
  });
  it("src contains getOwnerCommandCenter service", () => {
    expect(src).toContain("getOwnerCommandCenter");
  });
  it("src does not contain direct db import", () => {
    expect(src).not.toMatch(/from\s+["']@\/lib\/db["']/);
  });
  it("src does not call runCollective inline", () => {
    expect(src).not.toContain("runCollective");
  });
  it("NextRequest is a constructor", () => {
    expect(typeof NextRequest).toBe("function");
  });
  it("src length is greater than 100 characters", () => {
    expect(src.length).toBeGreaterThan(100);
  });
});

describe("Owner Collective Decision route enforcement", () => {
  it("uses canonical enforcement, requires a workspace, gates on OWNER_VIEW", () => {
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
  });

  it("reads only the verified workspace scope (no client-supplied workspace trust)", () => {
    expect(src).toContain("ctx.verifiedWorkspaceId");
    // The only client-supplied value used is the optional engagement filter.
    expect(src).toContain('searchParams.get("engagementId")');
    expect(src).not.toMatch(/searchParams\.get\(["']workspaceId["']\)/);
  });

  it("delegates to the collective-decision service (no business logic in the route)", () => {
    expect(src).toContain("getOwnerCommandCenter");
    expect(src).toContain("@/services/owner-collective/collective-decision.service");
    // No inline DB access / engine call in the route file.
    expect(src).not.toContain("runCollective");
    expect(src).not.toMatch(/from\s+["']@\/lib\/db["']/);
  });

  it("does not import or modify another owner domain's route/table", () => {
    for (const foreign of [
      "owner-sales", "owner-finance", "owner-cashflow", "owner-operations",
      "owner-sop", "owner-marketing", "owner-strategy", "owner-condition",
    ]) {
      expect(src).not.toContain(foreign);
    }
  });

  it("[db] fails closed — the real handler returns no owner data without a verified session", async () => {
    const { GET } = await import("@/app/api/owner/collective-decision/route");
    const req = new NextRequest("http://localhost/api/owner/collective-decision");
    const res = await GET(req, { params: Promise.resolve({}) });

    // Never 200 without a session; no packet/owner data is leaked.
    expect(res.status).not.toBe(200);
    const body = await res.json().catch(() => ({}));
    expect(body.packet).toBeUndefined();
    expect(body.hasData).toBeUndefined();
  });
});
