/**
 * auth-governance-scanner.ts — proves the PUBLIC_ADMISSION_CALL rule added
 * for publicAdmissionRefusal() (@/lib/public-admission-response) is a real,
 * checked, registry-validated exception to the "no raw Response.json(...,
 * {status:401|403})" rule, NOT a general regex escape hatch:
 *
 * 1. An ordinary Response.json(..., {status:401|403}) literal still fails,
 *    on any route, exempted or not — the general prohibition is untouched.
 * 2. publicAdmissionRefusal() called from a route registered in
 *    PUBLIC_ROUTE_EXEMPTIONS, with its own real derived path, passes clean.
 * 3. publicAdmissionRefusal() called from a route NOT registered in
 *    PUBLIC_ROUTE_EXEMPTIONS still fails (using the primitive doesn't grant
 *    exemption by itself — the route must actually be registered).
 * 4. publicAdmissionRefusal() called with a route string that doesn't match
 *    the calling file's own derived path still fails (can't borrow another
 *    route's exemption).
 * 5. The two real production call sites (signup/route.ts, beta-requests/
 *    route.ts) are re-verified against the actual scanner logic, not just
 *    trusted by inspection.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { scanRouteFileContent } from "../../../scripts/auth-governance-scanner";

const RAW_401_LITERAL = `
export const POST = async () => {
  return Response.json({ error: "nope" }, { status: 401 });
};
`;

const RAW_403_LITERAL = `
export const POST = async () => {
  return Response.json({ error: "nope" }, { status: 403 });
};
`;

describe("auth-governance-scanner: general Response.json(...401|403) prohibition", () => {
  it("flags a raw 401 literal on a route NOT in PUBLIC_ROUTE_EXEMPTIONS", () => {
    const violations = scanRouteFileContent(RAW_401_LITERAL, "/api/admin/definitely-not-exempted");
    expect(violations.some((v) => v.pattern === "Response.json(...401)")).toBe(true);
  });

  it("flags a raw 403 literal even on a route that IS in PUBLIC_ROUTE_EXEMPTIONS — being exempted from auth does not exempt a route from the response-construction rule", () => {
    const violations = scanRouteFileContent(RAW_403_LITERAL, "/api/auth/signup");
    expect(violations.some((v) => v.pattern === "Response.json(...401)")).toBe(true);
  });

  it("flags a raw 403 literal wrapped inside an unrelated helper function name — renaming/relocating the literal itself is not the sanctioned path", () => {
    const disguised = `
export function someOtherHelper() {
  return Response.json({ error: "nope" }, { status: 403 });
}
export const POST = async () => someOtherHelper();
`;
    const violations = scanRouteFileContent(disguised, "/api/admin/whatever");
    expect(violations.some((v) => v.pattern === "Response.json(...401)")).toBe(true);
  });
});

describe("auth-governance-scanner: publicAdmissionRefusal() recognition", () => {
  it("passes clean when called from its own route, and that route is registered in PUBLIC_ROUTE_EXEMPTIONS", () => {
    const content = `
export const POST = async () => {
  return publicAdmissionRefusal("/api/auth/signup", BODY, 403);
};
`;
    const violations = scanRouteFileContent(content, "/api/auth/signup");
    expect(violations).toEqual([]);
  });

  it("fails when the route argument is a variable reference rather than a literal string — an unverifiable argument is treated as a violation, not silently passed through (the general escape-hatch risk this whole rule exists to prevent)", () => {
    const content = `
const ROUTE = "/api/auth/signup";
export const POST = async () => {
  return publicAdmissionRefusal(ROUTE, BODY, 403);
};
`;
    const violations = scanRouteFileContent(content, "/api/auth/signup");
    expect(violations.some((v) => v.pattern === "publicAdmissionRefusal() non-literal route argument")).toBe(true);
    // This is why signup/route.ts and beta-requests/route.ts inline their
    // route string literally at each call site instead of through a named
    // constant — see the "real production call sites" tests below, which
    // assert this directly against the actual files.
  });

  it("fails when publicAdmissionRefusal() is called from a route NOT registered in PUBLIC_ROUTE_EXEMPTIONS — the primitive alone does not grant exemption", () => {
    const content = `
export const POST = async () => {
  return publicAdmissionRefusal("/api/admin/not-registered-anywhere", BODY, 403);
};
`;
    const violations = scanRouteFileContent(content, "/api/admin/not-registered-anywhere");
    expect(violations.some((v) => v.pattern === "publicAdmissionRefusal() from non-exempted route")).toBe(true);
  });

  it("fails when the route string argument doesn't match the calling file's own derived path — can't borrow another route's exemption", () => {
    const content = `
export const POST = async () => {
  return publicAdmissionRefusal("/api/beta-requests", BODY, 403);
};
`;
    // This file is physically /api/auth/signup, but claims to be /api/beta-requests.
    const violations = scanRouteFileContent(content, "/api/auth/signup");
    expect(violations.some((v) => v.pattern === "publicAdmissionRefusal() route mismatch")).toBe(true);
  });

  it("fails when a mismatched route argument ALSO happens to not be registered — both problems are still real, only the mismatch is reported (mismatch takes precedence, no silent pass)", () => {
    const content = `
export const POST = async () => {
  return publicAdmissionRefusal("/api/totally/made/up", BODY, 403);
};
`;
    const violations = scanRouteFileContent(content, "/api/auth/signup");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.severity === "critical")).toBe(true);
  });
});

describe("auth-governance-scanner: real production call sites", () => {
  const apiDir = path.join(process.cwd(), "src/app/api");

  it("src/app/api/auth/signup/route.ts is clean under the real scanner logic", () => {
    const filepath = path.join(apiDir, "auth/signup/route.ts");
    const content = fs.readFileSync(filepath, "utf8");
    const violations = scanRouteFileContent(content, "/api/auth/signup", filepath);
    expect(violations).toEqual([]);
  });

  it("src/app/api/beta-requests/route.ts is clean under the real scanner logic", () => {
    const filepath = path.join(apiDir, "beta-requests/route.ts");
    const content = fs.readFileSync(filepath, "utf8");
    const violations = scanRouteFileContent(content, "/api/beta-requests", filepath);
    expect(violations).toEqual([]);
  });

  it("both real files actually call publicAdmissionRefusal() with their own path inlined as a literal — proves the passing tests above aren't vacuous (e.g. the route having no 403 refusal at all, or refusing via an unverifiable variable)", () => {
    const signupContent = fs.readFileSync(path.join(apiDir, "auth/signup/route.ts"), "utf8");
    const betaRequestsContent = fs.readFileSync(path.join(apiDir, "beta-requests/route.ts"), "utf8");
    expect(signupContent).toMatch(/publicAdmissionRefusal\(\s*"\/api\/auth\/signup"/);
    expect(betaRequestsContent).toMatch(/publicAdmissionRefusal\(\s*"\/api\/beta-requests"/);
  });
});
