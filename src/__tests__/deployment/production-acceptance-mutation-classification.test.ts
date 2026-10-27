/**
 * Governance validator for the LIVE Production acceptance lane's mutation safety.
 *
 * Every tests/production/*.spec.ts must be classified in tests/production/production-spec-manifest.json, and
 * ONLY specs classified safe run in production-owner-acceptance.yml. The workflow passes an explicit file list
 * resolved from the manifest; Playwright auto-discovery of the directory must never reappear.
 *
 * Why: 27-growth-pricing-acceptance.spec.ts creates, approves and supersedes REAL workspace price tiers that
 * ordinary owners can see, with no fixture semantics and no rollback. It must not run in the live lane until
 * a real isolation or rollback exists (GROWTH_PRICING_LIVE_MUTATION_SAFETY=OPEN).
 *
 * All checks are static (filesystem + YAML + source) - nothing here touches a database or Production.
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import yaml from "js-yaml";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const resolver = require("../../../scripts/production-safe-specs.cjs") as {
  CLASSIFICATIONS: string[];
  PRODUCTION_TESTS_DIR: string;
  MANIFEST_PATH: string;
  listSpecFiles: (dir?: string) => string[];
  loadManifest: (p?: string) => Manifest;
  validateManifest: (m: Manifest, onDisk: string[]) => string[];
  resolveSafeSpecs: (o?: { manifestPath?: string; dir?: string }) => string[];
};

interface ManifestSpec {
  file: string;
  classification: string;
  scope: string;
  mutations: string[];
  fixtureMechanism: string | null;
  rollback: string | null;
  ownerVisible: boolean;
  survivesRun: boolean;
  safeLane: boolean;
  safeReason: string | null;
  exclusionReason: string | null;
}
interface Manifest {
  specs: ManifestSpec[];
}

const ROOT = process.cwd();
const PROD_DIR = join(ROOT, "tests/production");
const WORKFLOW_PATH = join(ROOT, ".github/workflows/production-owner-acceptance.yml");
const CONFIG_PATH = join(ROOT, "playwright.production.config.ts");
const DOC_PATH = join(ROOT, "docs/opsiq-governance/PRODUCTION_ACCEPTANCE_SAFE_LANE.md");

const GROWTH_PRICING_SPEC = "27-growth-pricing-acceptance.spec.ts";

/**
 * The exact set allowed in the live lane. Adding a spec to the lane is therefore a TWO-key change: the manifest
 * AND this list, both reviewed. Growth Pricing must not be added without a real isolation or rollback.
 */
const EXPECTED_SAFE_SPECS = [
  "10-startup-mode-acceptance.spec.ts",
  "20-existing-business-acceptance.spec.ts",
  "21-sales-acceptance.spec.ts",
  "22-operations-acceptance.spec.ts",
  "23-strategy-acceptance.spec.ts",
  "24-cashflow-acceptance.spec.ts",
  "25-marketing-acceptance.spec.ts",
  "26-recovery-acceptance.spec.ts",
];

const manifest = resolver.loadManifest();
const onDisk = resolver.listSpecFiles();
const read = (file: string) => readFileSync(join(PROD_DIR, file), "utf-8");
const byFile = (file: string) => manifest.specs.find((s) => s.file === file);

/** A spec can write if it issues a mutating HTTP call or creates a fixture. UI-only clicks are covered by the fixture helpers. */
const MUTATION_SIGNAL = /\.(post|put|patch|delete)\(|method:\s*["'](POST|PUT|PATCH|DELETE)["']|resolveOrCreateDomainBusiness\(|timedApiCall\(\s*context,\s*["'](POST|PUT|PATCH|DELETE)["']/;

/** Endpoints known to persist non-fixture, owner-visible state. A safe spec must never reference them. */
const KNOWN_PERSISTENT_NON_FIXTURE_ENDPOINTS = ["/api/growth/pricing-tiers"];

function validSpec(over: Partial<ManifestSpec> = {}): ManifestSpec {
  return {
    file: "99-example-acceptance.spec.ts",
    classification: "FIXTURE_ISOLATED_MUTATION",
    scope: "fixture-business",
    mutations: ["x"],
    fixtureMechanism: "resolveOrCreateDomainBusiness",
    rollback: null,
    ownerVisible: false,
    survivesRun: true,
    safeLane: true,
    safeReason: "r",
    exclusionReason: null,
    ...over,
  };
}

describe("every Production spec is classified (fail closed)", () => {
  it("there are specs on disk and the manifest is valid and complete", () => {
    expect(onDisk.length).toBeGreaterThan(0);
    expect(resolver.validateManifest(manifest, onDisk)).toEqual([]);
  });

  it("every *.spec.ts under tests/production is in the manifest, and every manifest entry exists on disk", () => {
    const listed = manifest.specs.map((s) => s.file).sort();
    expect(listed).toEqual([...onDisk].sort());
  });

  it("every classification is one of the five allowed values and none is UNKNOWN", () => {
    for (const spec of manifest.specs) {
      expect(resolver.CLASSIFICATIONS, spec.file).toContain(spec.classification);
      expect(spec.classification, `${spec.file} is UNKNOWN (unsafe)`).not.toBe("UNKNOWN");
    }
  });

  it("every spec records scope, mutations, owner visibility and whether state survives the run", () => {
    for (const spec of manifest.specs) {
      expect(typeof spec.scope, spec.file).toBe("string");
      expect(Array.isArray(spec.mutations), spec.file).toBe(true);
      expect(typeof spec.ownerVisible, spec.file).toBe("boolean");
      expect(typeof spec.survivesRun, spec.file).toBe("boolean");
    }
  });

  it("a spec whose source can mutate is never classified READ_ONLY_REAL_DATA", () => {
    for (const spec of manifest.specs) {
      if (MUTATION_SIGNAL.test(read(spec.file))) {
        expect(spec.classification, `${spec.file} issues mutating calls`).not.toBe("READ_ONLY_REAL_DATA");
      }
    }
  });

  it("every mutating spec is accounted for with a non-empty mutation list", () => {
    for (const spec of manifest.specs) {
      if (MUTATION_SIGNAL.test(read(spec.file))) expect(spec.mutations.length, spec.file).toBeGreaterThan(0);
    }
  });

  it("a new unclassified spec makes the resolver throw (it cannot silently join the lane)", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-specs-"));
    for (const f of onDisk) writeFileSync(join(dir, f), "// copy\n");
    writeFileSync(join(dir, "99-new-acceptance.spec.ts"), "// brand new, unclassified\n");
    expect(() => resolver.resolveSafeSpecs({ dir })).toThrow(/NOT classified/);
  });

  it("a manifest entry with no file on disk makes the resolver throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "prod-specs-"));
    for (const f of onDisk.filter((x) => x !== "26-recovery-acceptance.spec.ts")) writeFileSync(join(dir, f), "// copy\n");
    expect(() => resolver.resolveSafeSpecs({ dir })).toThrow(/not present/);
  });
});

describe("the SAFE manifest", () => {
  const safe = manifest.specs.filter((s) => s.safeLane);

  it("has SAFE entries and they are exactly the reviewed expected set", () => {
    expect(safe.length).toBeGreaterThan(0);
    expect(safe.map((s) => s.file).sort()).toEqual([...EXPECTED_SAFE_SPECS].sort());
    expect(resolver.resolveSafeSpecs()).toEqual([...EXPECTED_SAFE_SPECS].sort());
  });

  it("the resolver CLI prints exactly the safe spec paths and nothing else", () => {
    const out = execFileSync("node", [join(ROOT, "scripts/production-safe-specs.cjs")], { encoding: "utf8" });
    expect(out.trim().split("\n")).toEqual([...EXPECTED_SAFE_SPECS].sort().map((f) => `tests/production/${f}`));
  });

  it("no SAFE entry is NON_FIXTURE_PERSISTENT_MUTATION or UNKNOWN", () => {
    for (const s of safe) {
      expect(["NON_FIXTURE_PERSISTENT_MUTATION", "UNKNOWN"], s.file).not.toContain(s.classification);
    }
  });

  it("every SAFE FIXTURE_ISOLATED_MUTATION entry documents its fixture mechanism and is hidden from owners", () => {
    for (const s of safe.filter((x) => x.classification === "FIXTURE_ISOLATED_MUTATION")) {
      expect(s.fixtureMechanism, s.file).toBeTruthy();
      expect(s.ownerVisible, s.file).toBe(false);
    }
  });

  it("no SAFE spec references a known persistent non-fixture endpoint", () => {
    for (const s of safe) {
      const src = read(s.file);
      for (const endpoint of KNOWN_PERSISTENT_NON_FIXTURE_ENDPOINTS) {
        expect(src.includes(endpoint), `${s.file} references ${endpoint}`).toBe(false);
      }
    }
  });

  it("every SAFE spec that mutates goes through the fixture helpers (no bypass of fixture creation)", () => {
    for (const s of safe) {
      const src = read(s.file);
      if (!MUTATION_SIGNAL.test(src)) continue;
      const viaBusinessFixture = /resolveOrCreateDomainBusiness\(/.test(src);
      // bindVerifiedFixtureStartupSession() calls assertStartupSessionIsFixture() and then binds every later mutation
      // to that one session (see helpers/fixture-target.ts).
      const viaStartupFixture =
        /assertFixtureCreationCapable\(/.test(src) &&
        /(assertStartupSessionIsFixture|bindVerifiedFixtureStartupSession)\(/.test(src) &&
        /ACCEPTANCE_FIXTURE_ENDPOINTS\.startupSession/.test(src);
      expect(viaBusinessFixture || viaStartupFixture, `${s.file} mutates without a fixture mechanism`).toBe(true);
    }
  });

  it("no SAFE spec creates a business or startup session through an ordinary (non-fixture) route", () => {
    for (const s of safe) {
      const src = read(s.file);
      // Creation through an ordinary (non-fixture) route. Reads of the owner list are legitimate (they prove isolation).
      expect(src, s.file).not.toMatch(/\.request\.(post|fetch)\(\s*["'`]\/api\/owner\/(recovery\/)?businesses["'`]/);
      expect(src, s.file).not.toMatch(/\.request\.(post|fetch)\(\s*["'`]\/api\/owner\/startup\/sessions["'`]/);
    }
  });

  it("no SAFE spec sends a mutating request carrying the real Trinity business id", () => {
    for (const s of safe) {
      for (const line of read(s.file).split("\n")) {
        if (/\.(post|put|patch|delete)\(/.test(line)) {
          expect(line, `${s.file}: ${line.trim()}`).not.toMatch(/trinityBusinessId/);
        }
      }
    }
  });

  it("the resolver rejects every unsafe manifest shape (mutation-proof of the fail-closed rules)", () => {
    const files = ["99-example-acceptance.spec.ts"];
    const problems = (spec: ManifestSpec) => resolver.validateManifest({ specs: [spec] }, files);
    expect(problems(validSpec())).toEqual([]);
    expect(problems(validSpec({ classification: "NON_FIXTURE_PERSISTENT_MUTATION" })).join()).toMatch(/can never be in the safe lane/);
    expect(problems(validSpec({ classification: "UNKNOWN" })).join()).toMatch(/can never be in the safe lane/);
    expect(problems(validSpec({ classification: "BOGUS" })).join()).toMatch(/not one of/);
    expect(problems(validSpec({ fixtureMechanism: null })).join()).toMatch(/requires a fixtureMechanism/);
    expect(problems(validSpec({ classification: "REVERSIBLE_REAL_DATA_MUTATION", rollback: null })).join()).toMatch(/requires a rollback/);
    expect(problems(validSpec({ safeLane: false, exclusionReason: null })).join()).toMatch(/exclusionReason/);
    expect(resolver.validateManifest({ specs: [] }, files).join()).toMatch(/NOT classified|no safe spec/);
  });
});

describe("Growth Pricing is excluded for the documented reason", () => {
  const gp = byFile(GROWTH_PRICING_SPEC);

  it("is present, classified NON_FIXTURE_PERSISTENT_MUTATION, owner-visible, persistent, not in the safe lane", () => {
    expect(gp).toBeDefined();
    expect(gp!.classification).toBe("NON_FIXTURE_PERSISTENT_MUTATION");
    expect(gp!.scope).toBe("workspace");
    expect(gp!.fixtureMechanism).toBeNull();
    expect(gp!.rollback).toBeNull();
    expect(gp!.ownerVisible).toBe(true);
    expect(gp!.survivesRun).toBe(true);
    expect(gp!.safeLane).toBe(false);
    expect(resolver.resolveSafeSpecs()).not.toContain(GROWTH_PRICING_SPEC);
  });

  it("its source still really mutates real price tiers (so the exclusion stays justified)", () => {
    expect(read(GROWTH_PRICING_SPEC)).toContain("/api/growth/pricing-tiers");
  });

  it("the exclusion reason and the gap document name GROWTH_PRICING_LIVE_MUTATION_SAFETY=OPEN", () => {
    expect(gp!.exclusionReason).toContain("GROWTH_PRICING_LIVE_MUTATION_SAFETY=OPEN");
    expect(existsSync(DOC_PATH)).toBe(true);
    const doc = readFileSync(DOC_PATH, "utf-8");
    expect(doc).toContain("GROWTH_PRICING_LIVE_MUTATION_SAFETY=OPEN");
    for (const option of ["Option A", "Option B", "Option C"]) expect(doc).toContain(option);
  });
});

describe("the LIVE workflow executes only the SAFE manifest", () => {
  const src = readFileSync(WORKFLOW_PATH, "utf-8");
  const workflow = yaml.load(src) as { jobs: Record<string, { steps: Array<{ name?: string; run?: string }> }> };
  const steps = Object.values(workflow.jobs).flatMap((j) => j.steps);
  const playwrightSteps = steps.filter((s) => typeof s.run === "string" && /playwright\s+test/.test(s.run));

  it("exactly one step runs Playwright and it receives the manifest-resolved explicit file list", () => {
    expect(playwrightSteps).toHaveLength(1);
    const run = playwrightSteps[0].run!;
    expect(run).toContain("node scripts/production-safe-specs.cjs");
    expect(run).toMatch(/playwright test --config=playwright\.production\.config\.ts "\$\{SAFE_SPECS\[@\]\}"/);
    expect(run).toContain("set -euo pipefail");
  });

  it("directory auto-discovery cannot reappear: no bare invocation, glob, testDir path or direct spec filename", () => {
    for (const step of steps) {
      const run = step.run ?? "";
      expect(run, step.name).not.toMatch(/playwright test --config=playwright\.production\.config\.ts\s*(\n|$)/);
      expect(run, step.name).not.toMatch(/playwright test[^\n]*tests\/production\/?(\s|$|\*)/);
      expect(run, step.name).not.toMatch(/\*\.spec\.ts/);
      expect(run, step.name).not.toContain(GROWTH_PRICING_SPEC);
    }
    expect(src).not.toMatch(/playwright test --config=playwright\.production\.config\.ts\s*$/m);
  });

  it("does not claim Playwright discovers every spec", () => {
    expect(src).not.toMatch(/discovers every \*\.spec\.ts/);
    expect(src).not.toMatch(/documentation, not a file-selection gate/);
  });

  it("the Playwright config matches only the manifest-resolved specs and keeps retries off", () => {
    const cfg = readFileSync(CONFIG_PATH, "utf-8");
    expect(cfg).toContain("scripts/production-safe-specs.cjs");
    expect(cfg).toMatch(/testMatch:\s*resolveSafeSpecs\(\)/);
    expect(cfg).not.toMatch(/testMatch:\s*(\/|\[?\s*["'`]\*\*\/\*)/);
    expect(cfg).toMatch(/retries:\s*0/);
  });

  it("the existing safety controls are all still present", () => {
    expect(src).toContain("workflow_dispatch:");
    expect(src).toContain("environment: production");
    expect(src).toContain("RUN PRODUCTION ACCEPTANCE");
    expect(src).toMatch(/ref:\s*main\b/);
    expect(src).toContain("verify-no-secret-leak.sh");
    expect(src).toContain("production-acceptance-evidence");
    expect(src).toMatch(/cancel-in-progress:\s*false/);
    expect(src).toContain("BLOCKED_STALE_PRODUCTION_TARGET");
  });

  it("no other workflow runs the Production Playwright config", () => {
    const dir = join(ROOT, ".github/workflows");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
      if (f === "production-owner-acceptance.yml") continue;
      expect(readFileSync(join(dir, f), "utf-8"), f).not.toContain("playwright.production.config.ts");
    }
  });
});
