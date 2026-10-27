/**
 * Fail-closed recurrence guard for Production run #17 (FIXTURE_ISOLATION_DEFECT).
 *
 * What went wrong: the domain specs created a hidden fixture business and then drove the ordinary owner UI at
 * `/owner/<domain>?businessId=<fixture>`. No page reads that query parameter; every page takes its business from
 * ActiveBusinessContext (GET /api/owner/businesses, which excludes fixtures), so the UI saved snapshots and ran
 * diagnoses against an ordinary business. The governance suite stayed green because it only proved:
 *   - the spec calls resolveOrCreateDomainBusiness,
 *   - the helper creates through the fixture route,
 *   - no page.request mutation mentions trinityBusinessId,
 *   - the spec does not read the shared Startup handoff file.
 * None of those relate the thing that MUTATES to the fixture that was CREATED.
 *
 * The invariant added here: in the safe lane, every mutation is a fixtureMutate() call bound to a fixture id
 * proven by bindFixtureTarget(); no spec mutates through the ordinary UI; a query parameter is never selection
 * proof; and login happens once. Detectors are self-tested against the run #17 pattern so they cannot silently
 * stop detecting. Runtime refusal is proven in src/__tests__/production/fixture-target-binding.test.ts.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolver = require("../../../scripts/production-safe-specs.cjs") as { resolveSafeSpecs: () => string[] };

const ROOT = process.cwd();
const PROD_DIR = join(ROOT, "tests/production");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const SAFE_SPECS = resolver.resolveSafeSpecs();
const STARTUP_SPEC = "10-startup-mode-acceptance.spec.ts";
const DOMAIN_SPECS = SAFE_SPECS.filter((f) => f !== STARTUP_SPEC);

/**
 * The only UI controls a safe-lane spec may click that cause a server mutation. Each is bound by something the
 * page really consumes. Everything else must go through fixtureMutate().
 */
const ALLOWED_UI_MUTATION_CLICKS: Record<string, string[]> = {
  // /owner/startup/[sessionId] reads the session id from its route segment, so this click can only act on the
  // fixture session the spec created through the fixture route.
  [STARTUP_SPEC]: ["activate-business-btn"],
};

const MUTATION_BUTTON = /^\s*(\+\s*add|add\b|save|run\b|assign|start|complete|verify|create|submit|activate|archive|delete|dismiss|approve|accept|record|update|reassess)/i;

/** Removes // and block comments (not inside strings that look like URLs) so prose never trips a detector. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

/** Mutation-control clicks: getByRole("button", { name }).click() with a mutating name, or page.click on a mutating testid. */
export function findUiMutationClicks(src: string): string[] {
  const code = stripComments(src);
  const found: string[] = [];
  const role = /getByRole\(\s*["']button["']\s*,\s*\{[^}]*?name:\s*(?:["']([^"']+)["']|\/([^/]+)\/[a-z]*)[^}]*\}\s*\)\s*\.click\(/g;
  for (const m of code.matchAll(role)) {
    const name = m[1] ?? m[2] ?? "";
    if (MUTATION_BUTTON.test(name)) found.push(`button "${name}"`);
  }
  for (const m of code.matchAll(/page\.click\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    if (/btn|button|submit|save|activate|create/i.test(m[1]) && !/tab-/.test(m[1])) found.push(`click ${m[1]}`);
  }
  return found;
}

/** Any interaction that can change server state through the page. Domain specs are READ-ONLY in the browser. */
export function findUiInteractions(src: string): string[] {
  return [...stripComments(src).matchAll(/\.(click|dblclick|fill|check|uncheck|press|dispatchEvent|setInputFiles|tap|insertText)\(/g)].map((m) => m[1]);
}

/** page.goto to an owner page carrying ?businessId= -- never selection proof; no page consumes it. */
export function findQueryParamSelection(src: string): string[] {
  const code = stripComments(src);
  return [...code.matchAll(/page\.goto\(\s*[`"']([^`"']*\/owner\/[^`"']*\?businessId=[^`"']*)[`"']/g)].map((m) => m[1]);
}

/** Raw mutating HTTP from a spec. Only fixture-creation endpoints may bypass fixtureMutate. */
export function findRawMutatingRequests(src: string): string[] {
  const code = stripComments(src);
  const found: string[] = [];
  for (const m of code.matchAll(/\.request\.(post|patch|put|delete|fetch)\(\s*([^,)]*)/g)) {
    const firstArg = m[2].trim();
    if (!/^ACCEPTANCE_FIXTURE_ENDPOINTS\./.test(firstArg)) found.push(`${m[1]}(${firstArg})`);
  }
  return found;
}

/** Interpolations used inside fixtureMutate/fixtureRead paths. */
export function fixtureCallInterpolations(src: string): string[] {
  const code = stripComments(src);
  const exprs: string[] = [];
  for (const m of code.matchAll(/fixture(?:Mutate|Read)\(/g)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    const start = i;
    for (; i < code.length; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")" && --depth === 0) break;
    }
    const call = code.slice(start, i + 1);
    // Only the PATH argument (the first /api/ literal) selects a target; request bodies may interpolate anything.
    const path = call.match(/[`"'](\/api\/[^`"']*)[`"']/);
    if (path) for (const e of path[1].matchAll(/\$\{([^}]+)\}/g)) exprs.push(e[1].trim());
  }
  return exprs;
}

const ALLOWED_PATH_INTERPOLATIONS = new Set(["fx.businessId", "actionId", "action.id", "fx.sessionId", "startup.sessionId", "sessionId"]);

describe("detector self-tests -- the run #17 pattern is detected (they cannot silently stop detecting)", () => {
  const RUN17 = [
    'await page.goto(`/owner/sales?businessId=${acceptanceBusinessId}`, { waitUntil: "networkidle" });',
    'await page.getByRole("button", { name: "+ Add sales snapshot" }).click();',
    'await page.getByRole("button", { name: /Save snapshot/ }).click();',
    'await card.getByRole("button", { name: "Assign" }).click();',
    'await page.request.post(`/api/owner/sales/businesses/${selectedBusinessId}/snapshots`, { data });',
  ].join("\n");

  it("flags the query-parameter 'selection' navigation", () => {
    expect(findQueryParamSelection(RUN17)).toEqual(["/owner/sales?businessId=${acceptanceBusinessId}"]);
  });
  it("flags every ordinary-UI mutation click", () => {
    expect(findUiMutationClicks(RUN17)).toEqual(['button "+ Add sales snapshot"', 'button "Save snapshot"', 'button "Assign"']);
  });
  it("flags a raw mutating page.request that bypasses fixtureMutate", () => {
    expect(findRawMutatingRequests(RUN17)).toHaveLength(1);
  });
  it("does not flag the sanctioned patterns", () => {
    const ok = [
      "const fx = await bindFixtureTarget(context, page, 'sales', acceptanceBusinessId);",
      "await fixtureMutate(context, page, fx, 'POST', `/api/owner/sales/businesses/${fx.businessId}/snapshots`, body);",
      "await page.request.post(ACCEPTANCE_FIXTURE_ENDPOINTS.business, { data });",
      "await page.click(\"[data-testid='tab-blueprint']\");",
      "await expect(page.getByRole('button', { name: 'Business' })).toBeVisible();",
    ].join("\n");
    expect(findUiMutationClicks(ok)).toEqual([]);
    expect(findQueryParamSelection(ok)).toEqual([]);
    expect(findRawMutatingRequests(ok)).toEqual([]);
    expect(fixtureCallInterpolations(ok)).toEqual(["fx.businessId"]);
  });
  it("only the PATH argument is inspected, not request bodies", () => {
    const withBody = "await fixtureMutate(context, page, fx, 'POST', `/api/owner/sales/businesses/${fx.businessId}/snapshots`, { note: `${anything} here` });";
    expect(fixtureCallInterpolations(withBody)).toEqual(["fx.businessId"]);
    const badPath = "await fixtureMutate(context, page, fx, 'POST', `/api/owner/sales/businesses/${selectedBusinessId}/snapshots`, {});";
    expect(fixtureCallInterpolations(badPath)).toEqual(["selectedBusinessId"]);
  });
  it("ignores code that only appears in comments", () => {
    const commented = '// await page.getByRole("button", { name: "Save snapshot" }).click();\n/* page.request.post(`/api/x`) */';
    expect(findUiMutationClicks(commented)).toEqual([]);
    expect(findRawMutatingRequests(commented)).toEqual([]);
  });
});

describe("safe-lane specs: every mutation is bound to a verified fixture", () => {
  it("there are safe-lane specs to check", () => {
    expect(SAFE_SPECS.length).toBeGreaterThan(0);
  });

  it.each(SAFE_SPECS)("%s never mutates through the ordinary owner UI", (file) => {
    const allowed = ALLOWED_UI_MUTATION_CLICKS[file] ?? [];
    const violations = findUiMutationClicks(read(`tests/production/${file}`)).filter((v) => !allowed.some((a) => v.includes(a)));
    expect(violations, `${file} clicks ordinary-UI mutation controls; the page's business comes from the fixture-free list, not from this spec`).toEqual([]);
  });

  it.each(DOMAIN_SPECS)("%s performs no click/fill/press at all: a domain spec is read-only in the browser", (file) => {
    expect(findUiInteractions(read(`tests/production/${file}`)), `${file}: every domain mutation must go through fixtureMutate()`).toEqual([]);
  });

  it("the interaction detector flags a click on any text, role or selector, and ignores comments", () => {
    expect(findUiInteractions('await page.click("text=Run diagnosis");')).toEqual(["click"]);
    expect(findUiInteractions('await page.locator("#x").fill("1");')).toEqual(["fill"]);
    expect(findUiInteractions('// await page.click("x");\n/* x.press("Enter") */')).toEqual([]);
    expect(findUiInteractions('await page.locator("select").selectOption("a");')).toEqual([]);
  });

  it.each(SAFE_SPECS)("%s never treats ?businessId= navigation as selection proof", (file) => {
    expect(findQueryParamSelection(read(`tests/production/${file}`)), `${file}: no owner page consumes ?businessId=`).toEqual([]);
  });

  it.each(SAFE_SPECS)("%s has no raw mutating HTTP outside the fixture-creation endpoints", (file) => {
    expect(findRawMutatingRequests(read(`tests/production/${file}`)), `${file}: use fixtureMutate`).toEqual([]);
  });

  it.each(SAFE_SPECS)("%s builds fixtureMutate/fixtureRead paths only from the bound fixture id or an adopted action id", (file) => {
    const bad = fixtureCallInterpolations(read(`tests/production/${file}`)).filter((e) => !ALLOWED_PATH_INTERPOLATIONS.has(e));
    expect(bad, `${file}: path interpolations must be the bound fixture or an adopted action`).toEqual([]);
  });

  it.each(DOMAIN_SPECS)("%s binds the id it created: bindFixtureTarget(context, page, <same domain>, <resolved id>)", (file) => {
    const code = stripComments(read(`tests/production/${file}`));
    const created = code.match(/(\w+)\s*=\s*await\s+resolveOrCreateDomainBusiness\(\s*context\s*,\s*page\s*,\s*"([a-z]+)"/);
    expect(created, `${file} must resolve its fixture with resolveOrCreateDomainBusiness`).toBeTruthy();
    const [, idVar, domain] = created!;
    const bound = new RegExp(`bindFixtureTarget\\(\\s*context\\s*,\\s*page\\s*,\\s*"${domain}"\\s*,\\s*${idVar}\\s*\\)`);
    expect(code, `${file} must bind ${idVar} as the "${domain}" fixture before mutating`).toMatch(bound);
    // fixtureMutate is only ever given the bound target.
    for (const m of code.matchAll(/fixtureMutate\(\s*context\s*,\s*page\s*,\s*(\w+)\s*,/g)) {
      expect(m[1], `${file}: fixtureMutate must be given the bound fixture target`).toBe("fx");
    }
  });

  it.each(DOMAIN_SPECS)("%s reads and mutates ONLY through the bound target (a spec cannot call a domain API with the resolved id directly)", (file) => {
    const code = stripComments(read(`tests/production/${file}`));
    const created = code.match(/(\w+)\s*=\s*await\s+resolveOrCreateDomainBusiness/);
    const idVar = created![1];
    // The resolved id may be passed to bindFixtureTarget and to nothing that navigates or builds a mutating URL.
    expect(code).not.toMatch(new RegExp(`page\\.goto\\([^)]*${idVar}`));
    expect(code).not.toMatch(new RegExp(`\\.request\\.(post|patch|put|delete|fetch)\\([^)]*${idVar}`));
  });
});

describe("safe-lane specs cannot reach a UI mutation through a helper", () => {
  const helperDir = join(PROD_DIR, "helpers");
  const clickingHelpers = readdirSync(helperDir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /getByRole\(\s*["']button["'][\s\S]{0,160}?\)\s*\.click\(/.test(stripComments(readFileSync(join(helperDir, f), "utf-8"))))
    .map((f) => f.replace(/\.ts$/, ""));

  it("the helpers that click buttons are the known legacy UI-diagnosis helpers only", () => {
    expect(clickingHelpers.sort()).toEqual(["domain-diagnosis", "finance-diagnosis"]);
  });

  it.each(SAFE_SPECS)("%s imports none of them", (file) => {
    const src = read(`tests/production/${file}`);
    for (const h of clickingHelpers) {
      expect(src, `${file} must not import the UI-clicking helper ${h}`).not.toContain(`./helpers/${h}"`);
    }
  });

  it("the typed fixture helpers contain no UI interaction at all", () => {
    for (const f of ["fixture-target.ts", "fixture-domain-loop.ts"]) {
      const code = stripComments(readFileSync(join(helperDir, f), "utf-8"));
      expect(code, f).not.toMatch(/\.click\(|\.fill\(|getByRole\(|page\.goto\(/);
    }
  });
});

describe("login happens once: N spec files must not cost N logins", () => {
  const callSites = (file: string) => (stripComments(readFileSync(file, "utf-8")).match(/authenticateProductionOwner\(/g) ?? []).length;

  it("the only authenticateProductionOwner call sites are the helper definition, the shared login and the startup spec's own session", () => {
    const sites: Record<string, number> = {};
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts")) {
          const n = callSites(p);
          if (n > 0) sites[p.slice(PROD_DIR.length + 1)] = n;
        }
      }
    };
    walk(PROD_DIR);
    // The excluded Growth Pricing spec (not in the safe lane, never run by the live workflow) has its own legacy login.
    // It is outside this guarantee by construction; the manifest + resolver keep it from ever running.
    const SAFE = new Set(SAFE_SPECS);
    for (const k of Object.keys(sites)) {
      if (/^\d+-.*\.spec\.ts$/.test(k) && !SAFE.has(k)) delete sites[k];
    }
    expect(sites).toEqual({
      "helpers/production-auth.ts": 1, // the definition
      "helpers/shared-auth.ts": 1, // the single shared login
      [STARTUP_SPEC]: 2, // beforeAll + AUTH-05 re-login, on its own session (AUTH-04 revokes it)
    });
  });

  it.each(DOMAIN_SPECS)("%s opens its context from the shared login and never logs in or opens an unauthenticated context", (file) => {
    const code = stripComments(read(`tests/production/${file}`));
    expect(code).toContain("newSharedAuthenticatedContext(");
    expect(code).not.toMatch(/authenticateProductionOwner/);
    expect(code).not.toMatch(/browser\.newContext\(/);
  });

  it("global-setup performs the single login", () => {
    const gs = stripComments(read("tests/production/global-setup.ts"));
    expect(gs).toContain("performSingleProductionLogin(");
  });

  it("the shared helper never falls back to logging in", () => {
    const shared = stripComments(read("tests/production/helpers/shared-auth.ts"));
    const outsideSingle = shared.slice(shared.indexOf("export async function newSharedAuthenticatedContext"));
    expect(outsideSingle).not.toMatch(/authenticateProductionOwner|page\.fill|\/login/);
  });
});

describe("shared auth state is credential-safe", () => {
  const sharedAuth = read("tests/production/helpers/shared-auth.ts");
  const workflow = read(".github/workflows/production-owner-acceptance.yml");
  const wf = yaml.load(workflow) as { jobs: Record<string, { steps: Array<{ name?: string; run?: string; with?: { path?: string } }> }> };
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
  const statePath = sharedAuth.match(/AUTH_STATE_PATH\s*=\s*"([^"]+)"/)?.[1] ?? "";

  it("lives outside the uploaded artifact directory, in a dot-file under /tmp, with owner-only permissions", () => {
    expect(statePath).toMatch(/^\/tmp\/\./);
    expect(statePath).not.toContain("production-test-results");
    expect(sharedAuth).toMatch(/chmodSync\(AUTH_STATE_PATH,\s*0o600\)/);
  });

  it("is removed by the workflow BEFORE the evidence upload step, and the upload path excludes it", () => {
    const upload = steps.findIndex((s) => s.with?.path === "production-test-results");
    const cleanup = steps.findIndex((s) => typeof s.run === "string" && s.run.includes(statePath) && /\brm\b/.test(s.run));
    expect(upload).toBeGreaterThan(-1);
    expect(cleanup).toBeGreaterThan(-1);
    expect(cleanup).toBeLessThan(upload);
    expect(steps[upload].with!.path).not.toContain(statePath);
  });

  it("is never written into the artifact directory or committed", () => {
    expect(readFileSync(join(ROOT, ".gitignore"), "utf-8")).toMatch(/opsiq-acceptance|production-test-results/);
    expect(statePath.startsWith("/tmp/"), "the shared login state lives in ephemeral runner storage, outside the repo and the artifact directory").toBe(true);
    expect(stripComments(sharedAuth)).not.toMatch(/production-test-results/);
  });

  it("the leak scan still runs before cleanup and covers the session cookie values", () => {
    const leak = steps.findIndex((s) => typeof s.run === "string" && s.run.includes("verify-no-secret-leak.sh"));
    const cleanup = steps.findIndex((s) => typeof s.run === "string" && s.run.includes(statePath) && /\brm\b/.test(s.run));
    expect(leak).toBeGreaterThan(-1);
    expect(leak).toBeLessThan(cleanup);
    // authenticateProductionOwner appends the cookie value to the token log the scanner reads.
    expect(read("tests/production/helpers/production-auth.ts")).toContain("appendFileSync(SESSION_TOKEN_LOG");
  });
});
