/**
 * CSP for Microsoft Clarity: the two script origins are added ONLY to public pages, ONLY when Clarity is configured for
 * the production deployment; every other route keeps the base policy byte-for-byte. Evaluated against the REAL
 * next.config.ts headers() output using Next's own path matcher and its documented rule that, for one header key, the
 * LAST matching rule wins.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { match } from "next/dist/compiled/path-to-regexp";
import { isClarityEligiblePath } from "@/lib/analytics/clarity-policy";

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

async function loadRules(env: Record<string, string | undefined>): Promise<Rule[]> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  const mod = await import("../../../next.config");
  return (await mod.default.headers!()) as Rule[];
}

/** Effective response header value for a path: later matching rules override earlier ones. */
function effective(rules: Rule[], path: string, key: string): string | undefined {
  let value: string | undefined;
  for (const rule of rules) {
    if (!match(rule.source)(path)) continue;
    for (const h of rule.headers) if (h.key === key) value = h.value;
  }
  return value;
}
const scriptSrc = (csp: string) => (csp.split("; ").find((d) => d.startsWith("script-src ")) ?? "").split(" ").slice(1);

const PROD = { VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "ymoglnln74", NODE_ENV: "production" };
const PUBLIC = ["/", "/about", "/beta", "/privacy", "/terms", "/resources", "/resources/a-guide", "/resources/a/b", "/tools", "/tools/profit-margin-calculator"];
const PRIVATE = [
  "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/owner/cockpit", "/owner/finance", "/admin", "/admin/users",
  "/dashboard", "/dashboard/x", "/api/auth/signin", "/api/owner/home", "/auth/callback", "/onboarding", "/pricing", "/aboutx", "/resourcesx",
  "/toolsx", "/about/team", "/_next/static/chunks/a.js",
];

afterEach(() => vi.unstubAllEnvs());

describe("CSP when Clarity is configured (production + valid project id)", () => {
  it.each(PUBLIC)("public page %s allows exactly the two Clarity script origins on top of the base policy", async (path) => {
    const rules = await loadRules(PROD);
    const csp = effective(rules, path, "Content-Security-Policy")!;
    expect(scriptSrc(csp)).toEqual(["'self'", "'unsafe-inline'", "https://www.clarity.ms", "https://scripts.clarity.ms"]);
  });

  it.each(PRIVATE)("%s keeps the base policy with no Clarity origin", async (path) => {
    const rules = await loadRules(PROD);
    const csp = effective(rules, path, "Content-Security-Policy")!;
    expect(csp).toBeTruthy();
    expect(csp).not.toMatch(/clarity/i);
    expect(scriptSrc(csp)).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("only script-src differs between the public and base policy; nothing else is loosened", async () => {
    const rules = await loadRules(PROD);
    const base = effective(rules, "/login", "Content-Security-Policy")!;
    const pub = effective(rules, "/", "Content-Security-Policy")!;
    const strip = (c: string) => c.split("; ").filter((d) => !d.startsWith("script-src ")).join("; ");
    expect(strip(pub)).toBe(strip(base));
    for (const csp of [base, pub]) {
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("connect-src 'self' https:");
      expect(csp).not.toMatch(/\*/); // no wildcard origin is introduced anywhere
      expect(csp).not.toContain("unsafe-eval"); // production
    }
  });

  it("the other security headers are identical on every path", async () => {
    const rules = await loadRules(PROD);
    for (const key of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
      const values = new Set([...PUBLIC, ...PRIVATE].map((p) => effective(rules, p, key)));
      expect(values.size).toBe(1);
      expect([...values][0]).toBeTruthy();
    }
  });

  it("every Clarity-eligible path (from the app policy) is covered by a CSP that allows the script", async () => {
    const rules = await loadRules(PROD);
    for (const path of ["/", "/about", "/resources", "/resources/x", "/tools/profit-margin-calculator", "/tools/y", "/privacy", "/terms", "/beta"]) {
      expect(isClarityEligiblePath(path)).toBe(true);
      expect(scriptSrc(effective(rules, path, "Content-Security-Policy")!)).toContain("https://www.clarity.ms");
    }
  });

  it("no private/auth/forbidden path is ever granted the Clarity origins", async () => {
    const rules = await loadRules(PROD);
    for (const path of PRIVATE) expect(isClarityEligiblePath(path)).toBe(false);
    for (const rule of rules) {
      if (rule.headers.some((h) => /clarity/i.test(h.value))) {
        for (const bad of ["/login", "/signup", "/owner/cockpit", "/admin/x", "/dashboard/x", "/api/x"]) expect(match(rule.source)(bad)).toBe(false);
      }
    }
  });
});

describe("CSP when Clarity is NOT configured (fail closed)", () => {
  it.each([
    ["preview deployment", { VERCEL_ENV: "preview", NEXT_PUBLIC_CLARITY_PROJECT_ID: "ymoglnln74", NODE_ENV: "production" }],
    ["development", { VERCEL_ENV: "development", NEXT_PUBLIC_CLARITY_PROJECT_ID: "ymoglnln74", NODE_ENV: "production" }],
    ["no VERCEL_ENV (local)", { VERCEL_ENV: undefined, NEXT_PUBLIC_CLARITY_PROJECT_ID: "ymoglnln74", NODE_ENV: "production" }],
    ["missing project id", { VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: undefined, NODE_ENV: "production" }],
    ["empty project id", { VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "   ", NODE_ENV: "production" }],
    ["malformed project id", { VERCEL_ENV: "production", NEXT_PUBLIC_CLARITY_PROJECT_ID: "bad id;x", NODE_ENV: "production" }],
  ])("%s: no Clarity origin anywhere and a single header rule, exactly as before", async (_label, env) => {
    const allRules = await loadRules(env);
    // `/pay` carries its own Paddle checkout CSP (commercial billing, unrelated to Clarity). Everything else must be
    // exactly the single global rule, and the /pay rule must never mention Clarity.
    const payRules = allRules.filter((r) => r.source === "/pay");
    expect(payRules).toHaveLength(1);
    expect(JSON.stringify(payRules[0].headers)).not.toMatch(/clarity/i);
    const rules = allRules.filter((r) => r.source !== "/pay");
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/(.*)");
    for (const path of [...PUBLIC, ...PRIVATE]) {
      expect(effective(rules, path, "Content-Security-Policy")).not.toMatch(/clarity/i);
    }
  });
});
