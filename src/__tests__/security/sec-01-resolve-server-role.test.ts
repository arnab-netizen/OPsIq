/**
 * SEC-01 regression: the legacy role (admin | operator | viewer) must be derived from the REAL workspace PolicyContext
 * via the real capability layer and fail closed — never hardcoded "admin" for every authenticated user.
 *
 * deriveServerRole(policy) is the only derivation: it takes the policy the canonical wrapper already verified
 * (ctx.policy). The former resolveServerRole() fetched the policy itself via getPolicyContext(); inside a
 * withCanonicalEnforcement handler that is a post-snapshot auth read, which the shadow-read enforcer refuses
 * (SHADOW_AUTH_READ_DETECTED → 500 on every authenticated request). It is deleted, and the guard below proves, from
 * the TypeScript AST of every production module, that nothing declares, imports or re-exports it (an alias such as
 * `export { x as resolveServerRole }` included) and that server-role exports only deriveServerRole.
 *
 * The capability→role mapping runs against the real @/policies/capability-check + @/domain/constants maps.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { ROLES } from "@/domain/constants/roles";
import * as serverRole from "@/services/auth/server-role";
import { deriveServerRole } from "@/services/auth/server-role";

function ctx(roles: string[]) {
  return {
    userId: "user-1",
    roles: roles.map((role) => ({ role, scope: "workspace", scopeId: "ws-1" })),
    engagementMemberships: [] as { engagementId: string; role: string }[],
  } as Parameters<typeof deriveServerRole>[0];
}

describe("SEC-01 deriveServerRole — real role derivation, fail-closed", () => {
  it("returns null when there is no verified policy (unauthenticated / non-member)", () => {
    expect(deriveServerRole(null)).toBeNull();
    expect(deriveServerRole(undefined)).toBeNull();
  });

  it("returns 'viewer' (least privilege) for a member with NO role assignment — never admin", () => {
    expect(deriveServerRole(ctx([]))).toBe("viewer");
  });

  it("returns 'viewer' for an explicit viewer role", () => {
    expect(deriveServerRole(ctx([ROLES.VIEWER]))).toBe("viewer");
  });

  it("returns 'admin' for a role holding approval/override authority", () => {
    expect(deriveServerRole(ctx([ROLES.ADMIN_OR_PORTFOLIO_MANAGER]))).toBe("admin");
    expect(deriveServerRole(ctx([ROLES.SYSTEM_ADMIN]))).toBe("admin");
  });

  it("returns 'operator' for a consultant holding edit authority but no approval authority", () => {
    expect(deriveServerRole(ctx([ROLES.BEGINNER_CONSULTANT]))).toBe("operator");
    expect(deriveServerRole(ctx([ROLES.EXPERIENCED_CONSULTANT]))).toBe("operator");
  });

  it("does NOT grant admin to an analyst or a client_team_member", () => {
    expect(deriveServerRole(ctx([ROLES.ANALYST]))).not.toBe("admin");
    expect(deriveServerRole(ctx([ROLES.CLIENT_TEAM_MEMBER]))).not.toBe("admin");
  });
});

/** Every production .ts/.tsx module under src/ (tests, ignored tests and generated code excluded). */
function productionModules(): string[] {
  const root = path.resolve(__dirname, "../..");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (["__tests__", "__ignored_tests__", "generated", "node_modules"].includes(name)) continue;
        walk(full);
      } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

const FORBIDDEN = "resolveServerRole";

/** Declarations, import specifiers and export specifiers (local or exported name) named FORBIDDEN. */
function forbiddenBindings(file: string, text: string = readFileSync(file, "utf8")): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const named = (n: ts.Node | undefined) => !!n && ts.isIdentifier(n) && n.text === FORBIDDEN;
  const visit = (node: ts.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node) || ts.isClassDeclaration(node)) && named(node.name)) {
      hits.push(`declares ${FORBIDDEN}`);
    }
    if (ts.isImportSpecifier(node) && (named(node.name) || named(node.propertyName))) hits.push(`imports ${FORBIDDEN}`);
    if (ts.isExportSpecifier(node) && (named(node.name) || named(node.propertyName))) hits.push(`exports ${FORBIDDEN}`);
    if (ts.isPropertyAccessExpression(node) && node.name.text === FORBIDDEN) hits.push(`accesses .${FORBIDDEN}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe("SEC-01 guard — no auth-re-reading role resolver exists", () => {
  it("server-role exports only deriveServerRole", () => {
    expect(Object.keys(serverRole).sort()).toEqual(["deriveServerRole"]);
  });

  it("no production module declares, imports, re-exports (incl. aliases) or accesses resolveServerRole", () => {
    const files = productionModules();
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((f) => forbiddenBindings(f).map((hit) => `${path.relative(process.cwd(), f)}: ${hit}`));
    expect(offenders).toEqual([]);
  });

  it("the AST guard detects an aliased re-export, an aliased import and a namespace access (self-check)", () => {
    expect(forbiddenBindings("a.ts", 'export { deriveServerRole as resolveServerRole } from "@/services/auth/server-role";')).toEqual([`exports ${FORBIDDEN}`]);
    expect(forbiddenBindings("b.ts", 'import { resolveServerRole as r } from "x";')).toEqual([`imports ${FORBIDDEN}`]);
    expect(forbiddenBindings("c.ts", 'import * as m from "x"; void m.resolveServerRole;')).toEqual([`accesses .${FORBIDDEN}`]);
    expect(forbiddenBindings("d.ts", "export async function resolveServerRole() { return null; }")).toEqual([`declares ${FORBIDDEN}`]);
  });
});
