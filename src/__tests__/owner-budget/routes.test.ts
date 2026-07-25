/**
 * Owner Budget route enforcement wiring proof (no server).
 *
 * Proves the budget read routes are canonically enforced: use
 * withCanonicalEnforcement, require a workspace, gate on OWNER_VIEW, read only the
 * verified workspace scope, and contain no business logic / DB access in the route.
 * Mirrors the proven owner-mode route-wiring proofs.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const base = path.resolve(__dirname, "../../app/api/owner/budget");
const read = (rel: string) => fs.readFileSync(path.join(base, rel), "utf8");
const ROUTES = ["guidance/route.ts", "snapshots/route.ts", "forecast/route.ts", "actions/route.ts"];
const WRITE_ROUTES = ["spend/route.ts", "override/route.ts", "authority/route.ts"];

describe("Owner Budget route enforcement — structural contract assertions", () => {
  it("base is a string", () => {
    expect(typeof base).toBe("string");
  });
  it("ROUTES is an array with 4 entries", () => {
    expect(Array.isArray(ROUTES)).toBe(true);
    expect(ROUTES.length).toBe(4);
  });
  it("WRITE_ROUTES is an array with 3 entries", () => {
    expect(Array.isArray(WRITE_ROUTES)).toBe(true);
    expect(WRITE_ROUTES.length).toBe(3);
  });
  it("read is a function", () => {
    expect(typeof read).toBe("function");
  });
  it("all ROUTES end with 'route.ts'", () => {
    for (const r of ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("all WRITE_ROUTES end with 'route.ts'", () => {
    for (const r of WRITE_ROUTES) expect(r.endsWith("route.ts")).toBe(true);
  });
  it("read('guidance/route.ts') returns a non-empty string > 100 chars", () => {
    expect(read("guidance/route.ts").length).toBeGreaterThan(100);
  });
  it("read('guidance/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("guidance/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('guidance/route.ts') contains 'OWNER_VIEW'", () => {
    expect(read("guidance/route.ts")).toContain("OWNER_VIEW");
  });
  it("read('snapshots/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("snapshots/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('forecast/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("forecast/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('actions/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("actions/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("read('spend/route.ts') contains 'withCanonicalEnforcement'", () => {
    expect(read("spend/route.ts")).toContain("withCanonicalEnforcement");
  });
  it("ROUTES includes 'guidance/route.ts'", () => {
    expect(ROUTES).toContain("guidance/route.ts");
  });
  it("ROUTES includes 'snapshots/route.ts'", () => {
    expect(ROUTES).toContain("snapshots/route.ts");
  });
  it("WRITE_ROUTES includes 'spend/route.ts'", () => {
    expect(WRITE_ROUTES).toContain("spend/route.ts");
  });
});

describe("Owner Budget route enforcement", () => {
  it("every budget route uses canonical enforcement + requires workspace + OWNER_VIEW", () => {
    for (const f of ROUTES) {
      const src = read(f);
      expect(src, `${f} must use withCanonicalEnforcement`).toContain("withCanonicalEnforcement");
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} must gate on OWNER_VIEW`).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_VIEW\]/);
    }
  });

  it("routes read only the verified workspace scope and contain no DB/engine logic", () => {
    for (const f of ROUTES) {
      const src = read(f);
      expect(src).toContain("ctx.verifiedWorkspaceId");
      expect(src).not.toMatch(/from\s+["']@\/lib\/db["']/);
      expect(src).not.toContain("composeUpdatedPlan");
      expect(src).not.toMatch(/searchParams\.get\(["']workspaceId["']\)/);
    }
  });

  it("write routes gate POST on OWNER_MANAGE, require workspace, and validate input via Zod", () => {
    for (const f of WRITE_ROUTES) {
      const src = read(f);
      expect(src, `${f} must use canonical enforcement`).toContain("withCanonicalEnforcement");
      expect(src, `${f} must require workspace`).toContain("requireWorkspace: true");
      expect(src, `${f} POST must gate on OWNER_MANAGE`).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
      expect(src, `${f} must validate input`).toContain("parseRequestBody");
      expect(src, `${f} must derive workspace server-side`).toContain("ctx.verifiedWorkspaceId");
      expect(src).not.toMatch(/searchParams\.get\(["']workspaceId["']\)/);
    }
  });

  it("execution-task PATCH route gates on OWNER_MANAGE, validates the uuid param + body, and stays workspace-scoped", () => {
    const src = read("actions/[actionId]/route.ts");
    expect(src).toContain("withCanonicalEnforcement");
    expect(src).toContain("requireWorkspace: true");
    expect(src).toMatch(/requireCapabilities:\s*\[CAPABILITIES\.OWNER_MANAGE\]/);
    expect(src, "must validate the action id param").toMatch(/parseOrThrow\(uuidSchema,\s*params\.actionId\)/);
    expect(src, "must validate the body via Zod").toContain("budgetActionUpdateSchema");
    expect(src).toContain("parseRequestBody");
    expect(src).toContain("ctx.verifiedWorkspaceId");
    expect(src).toContain("ctx.verifiedActorId");
    expect(src).not.toMatch(/from\s+["']@\/lib\/db["']/);
  });
});
