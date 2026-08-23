/**
 * Governance/static proof for the acceptance-business isolation fix (see
 * tests/production/helpers/domain-business.ts's header for the root cause).
 *
 * Unlike the per-domain governance files (production-acceptance-sales-
 * domain.test.ts, production-acceptance-batch2-domains.test.ts), this file
 * scans tests/production/ DYNAMICALLY rather than a hardcoded file list --
 * item #10 of the required hostile-recurrence proof is that a FUTURE new
 * mutating domain spec that reintroduces the shared/global business fixture
 * must fail a static test without anyone updating this file first.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const PROD_DIR = join(process.cwd(), "tests/production");

// The one legitimate owner of the shared handoff mechanism: it CREATES the
// Startup handoff business via the real onboarding flow and writes the
// handoff file other tests used to read. Every other *-acceptance.spec.ts
// file must resolve its OWN dedicated business instead.
const STARTUP_SPEC = "10-startup-mode-acceptance.spec.ts";

function isAcceptanceSpec(filename: string): boolean {
  return /^\d+-.*-acceptance\.spec\.ts$/.test(filename);
}

function mutatingDomainSpecFiles(): string[] {
  return readdirSync(PROD_DIR)
    .filter((f) => isAcceptanceSpec(f) && f !== STARTUP_SPEC)
    .sort();
}

const DOMAIN_BUSINESS_SRC = readFileSync(join(PROD_DIR, "helpers/domain-business.ts"), "utf-8");

describe("domain-business.ts helper -- correctness and evidence-safety", () => {
  it("writes only businessId/name/domain/runId to its per-domain cache file (no headers/cookies/bodies)", () => {
    expect(DOMAIN_BUSINESS_SRC).toMatch(
      /writeFileSync\(cacheFile, JSON\.stringify\(record, null, 2\)\)/
    );
    expect(DOMAIN_BUSINESS_SRC).not.toMatch(/\.headers\(\)/);
    expect(DOMAIN_BUSINESS_SRC).not.toMatch(/cookies\(\)/);
    expect(DOMAIN_BUSINESS_SRC).not.toMatch(/req(uest)?\.headers/i);
  });

  it("creates the business via the real, capability-gated POST /api/owner/recovery/businesses endpoint", () => {
    expect(DOMAIN_BUSINESS_SRC).toContain('page.request.post("/api/owner/recovery/businesses"');
    expect(DOMAIN_BUSINESS_SRC).toContain("timedApiCall(");
  });

  it("never deletes or archives a business it creates (no deletion unless separately authorized)", () => {
    expect(DOMAIN_BUSINESS_SRC).not.toMatch(/\.delete\(|DELETE\s+\/api\/owner/);
  });
});

describe("every existing mutating-domain acceptance spec -- resolves its own isolated business", () => {
  const files = mutatingDomainSpecFiles();

  it("found at least the 5 already-migrated domain spec files (sanity check the glob itself works)", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it.each(files)("%s imports and calls resolveOrCreateDomainBusiness (does not read the shared Startup handoff file)", (file) => {
    const src = readFileSync(join(PROD_DIR, file), "utf-8");
    expect(src, `${file} must import resolveOrCreateDomainBusiness from ./helpers/domain-business`).toContain(
      'from "./helpers/domain-business"'
    );
    expect(src, `${file} must call resolveOrCreateDomainBusiness(...)`).toMatch(
      /resolveOrCreateDomainBusiness\(/
    );
    // Item #4 + #10: no acceptance spec other than Startup's own may read
    // the shared handoff file or reference its variable name -- a future
    // domain spec that copies the old (unsafe) pattern fails HERE.
    expect(src, `${file} must not read the shared Startup handoff file`).not.toContain(
      "phase13-startup-mode-ids.json"
    );
    expect(src, `${file} must not reference the shared handoff business id variable`).not.toMatch(
      /handoffBusinessId/
    );
  });

  it("every file resolves a domain string that appears nowhere else (no two specs share a domain)", () => {
    const usedDomains: string[] = [];
    for (const file of files) {
      const src = readFileSync(join(PROD_DIR, file), "utf-8");
      const match = src.match(/resolveOrCreateDomainBusiness\(\s*context\s*,\s*page\s*,\s*"([a-z]+)"/);
      expect(match, `${file} must call resolveOrCreateDomainBusiness with a literal domain string`).toBeTruthy();
      usedDomains.push(match![1]);
    }
    expect(new Set(usedDomains).size, `duplicate domain strings across: ${usedDomains.join(", ")}`).toBe(
      usedDomains.length
    );
  });

  it.each(files)("%s never sends a mutating request (POST/PATCH/DELETE) carrying trinityBusinessId", (file) => {
    const src = readFileSync(join(PROD_DIR, file), "utf-8");
    const mutatingCalls = [...src.matchAll(/page\.request\.(post|patch|delete)\([^)]*\)/gs)];
    for (const m of mutatingCalls) {
      expect(m[0]).not.toContain("trinityBusinessId");
    }
  });

  it.each(files)("%s does not read another domain's cached business-id evidence file", (file) => {
    const src = readFileSync(join(PROD_DIR, file), "utf-8");
    expect(src).not.toMatch(/domain-business-(?!\$\{)/);
  });
});
