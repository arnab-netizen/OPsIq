import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  classifyChangeSet,
  classifyPackageJsonChange,
  classifyPackageLockDiffText,
  classifyPath,
  classifyPushEvent,
  comparePackageJson,
  DB_PACKAGE_RE,
  resolvePackageDiffText,
  resolvePushDiffFiles,
  splitUnifiedDiffByFile,
  SUITE_MODES,
  TIERS,
} from "../../../scripts/ci-risk-classifier.mjs";

// Shared package.json base/head object fixtures (CI-MIN-01 owner correction:
// package.json is classified via a base-vs-head JSON comparison now, not
// diff-hunk text -- see comparePackageJson/classifyPackageJsonChange), used
// by both the "Content-aware package.json / package-lock.json
// classification" describe block and the "dbRequired" required-test-matrix
// describe block below.
const scriptsOnlyChange = {
  base: { scripts: { dev: "next dev", lint: "eslint .", build: "next build" }, dependencies: { next: "14.0.0" } },
  head: { scripts: { dev: "next dev", lint: "eslint", build: "next build" }, dependencies: { next: "14.0.0" } },
};

const nonDbDependencyChange = {
  base: { dependencies: { next: "14.0.0", react: "18.2.0" } },
  head: { dependencies: { next: "14.0.0", react: "18.2.0", lodash: "^4.17.21" } },
};

const dbDependencyChange = {
  base: { dependencies: { next: "14.0.0", react: "18.2.0" } },
  head: { dependencies: { next: "14.0.0", react: "18.2.0", prisma: "^5.10.0" } },
};

const scopedDbDependencyChange = {
  base: { dependencies: { next: "14.0.0", react: "18.2.0" } },
  head: { dependencies: { next: "14.0.0", react: "18.2.0", "@neondatabase/serverless": "^0.9.0" } },
};

// package-lock.json fixtures stay as real unified-diff text -- that side of
// the classifier is unchanged by this correction (kept fail-closed exactly
// as before; a lockfile has no "scripts" section to distinguish, so the
// diff-hunk-visibility problem that motivated the package.json rewrite does
// not apply to it).
const lockDbDiff = [
  "diff --git a/package-lock.json b/package-lock.json",
  "index 1111111..2222222 100644",
  "--- a/package-lock.json",
  "+++ b/package-lock.json",
  "@@ -100,6 +100,9 @@",
  '+    "node_modules/prisma": {',
  '+      "version": "5.10.0"',
  "+    },",
].join("\n");

const lockNonDbDiff = [
  "diff --git a/package-lock.json b/package-lock.json",
  "index 1111111..2222222 100644",
  "--- a/package-lock.json",
  "+++ b/package-lock.json",
  "@@ -100,6 +100,9 @@",
  '+    "node_modules/lodash": {',
  '+      "version": "4.17.21"',
  "+    },",
].join("\n");

// ROOT CAUSE this classifier closes: main-integration.yml ran its full DB
// suite unconditionally on every push to main regardless of what changed --
// confirmed directly on a real merge (PR #373, a 1-line whitespace fix to
// one workflow file) costing 2595s (~43 min) of full-DB-suite runtime for a
// change with zero DB/schema/runtime impact. ci.yml's build-and-test job
// and bundle-validate job (calling reusable-pr-validation.yml) also ran the
// exact same broad non-DB vitest suite twice per PR.
//
// This test suite mirrors the hostile-audit matrix used to design the
// classifier (2026-08-29), including the two real bugs it found and fixed:
// a naive "max across all matching rules" model let a generic, more
// expensive bucket (.github/workflows/**, generic scripts/**) override a
// more specific, cheaper rule (the two named recovery workflow files, the
// named CI-governance scripts) for the same path. Both cases are asserted
// below as recurrence guards.
describe("CI risk classifier (scripts/ci-risk-classifier.mjs)", () => {
  describe("Section 19 hostile-audit cases", () => {
    it("classifies a mixed docs + runtime change at the runtime tier", () => {
      const result = classifyChangeSet(["README.md", "src/services/foo.service.ts"]);
      expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("classifies a mixed recovery + Prisma change at the DB_RUNTIME tier", () => {
      const result = classifyChangeSet([
        ".github/workflows/restore-rehearsal.yml",
        "prisma/schema.prisma",
      ]);
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
    });

    it("classifies a new, previously unknown top-level directory as UNKNOWN", () => {
      const result = classifyChangeSet(["newfeature/index.ts"]);
      expect(result.tier).toBe(TIERS.UNKNOWN);
    });

    it("classifies both sides of a rename (old and new path both present in the diff)", () => {
      const result = classifyChangeSet([
        "src/services/old-name.service.ts",
        "src/services/new-name.service.ts",
      ]);
      expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("classifies a rename that crosses into prisma at the DB_RUNTIME tier", () => {
      const result = classifyChangeSet([
        "scripts/old-seed.ts",
        "prisma/migrations/20260101_x/migration.sql",
      ]);
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
    });

    it("classifies a deleted prisma migration path at the DB_RUNTIME tier (path-pattern only, not existence-checked)", () => {
      const result = classifyChangeSet(["prisma/migrations/20250101_old/migration.sql"]);
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
    });

    it("classifies a generic new workflow file at CI_GOVERNANCE", () => {
      const result = classifyChangeSet([".github/workflows/some-new-thing.yml"]);
      expect(result.tier).toBe(TIERS.CI_GOVERNANCE);
    });

    it("RECURRENCE GUARD: a named recovery workflow file classifies at RECOVERY_INFRA_ONLY, not CI_GOVERNANCE (bug found by hostile audit 2026-08-29)", () => {
      expect(classifyPath(".github/workflows/scheduled-backup.yml")).toBe(TIERS.RECOVERY_INFRA_ONLY);
      expect(classifyPath(".github/workflows/restore-rehearsal.yml")).toBe(TIERS.RECOVERY_INFRA_ONLY);
    });

    it("classifies package.json / package-lock.json / tsconfig / env-config as UNKNOWN (always conservative)", () => {
      expect(classifyPath("package.json")).toBe(TIERS.UNKNOWN);
      expect(classifyPath("package-lock.json")).toBe(TIERS.UNKNOWN);
      expect(classifyPath("tsconfig.json")).toBe(TIERS.UNKNOWN);
      expect(classifyPath(".env.example")).toBe(TIERS.UNKNOWN);
      expect(classifyPath("next.config.mjs")).toBe(TIERS.UNKNOWN);
    });

    it("classifies a new prisma migration at DB_RUNTIME", () => {
      expect(classifyPath("prisma/migrations/20260830_new/migration.sql")).toBe(TIERS.DB_RUNTIME);
    });

    it("classifies auth, workspace isolation, entitlement, and billing paths at SECURITY_AUTH_TENANCY_ENTITLEMENT", () => {
      expect(classifyPath("src/lib/auth/session.ts")).toBe(TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT);
      expect(classifyPath("src/app/api/auth/callback/route.ts")).toBe(TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT);
      expect(classifyPath("src/services/workspace-resolution.service.ts")).toBe(
        TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT,
      );
      expect(classifyPath("src/services/entitlement-gate.service.ts")).toBe(
        TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT,
      );
      expect(classifyPath("src/services/billing-webhook.service.ts")).toBe(
        TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT,
      );
    });

    it("classifies a generic ops script (not on the CI-governance allowlist) at APPLICATION_NON_DB", () => {
      expect(classifyPath("scripts/some-random-ops-script.ts")).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("RECURRENCE GUARD: a named CI-governance script classifies at CI_GOVERNANCE, not APPLICATION_NON_DB (bug found by hostile audit 2026-08-29)", () => {
      expect(classifyPath("scripts/ci-governance-check.mjs")).toBe(TIERS.CI_GOVERNANCE);
      expect(classifyPath("scripts/ci-risk-classifier.mjs")).toBe(TIERS.CI_GOVERNANCE);
    });

    it("classifies DB-interacting scripts (seed/reset/migrate by name) at DB_RUNTIME", () => {
      expect(classifyPath("scripts/seed-test-db.ts")).toBe(TIERS.DB_RUNTIME);
      expect(classifyPath("scripts/reset-staging.ts")).toBe(TIERS.DB_RUNTIME);
    });

    it("classifies the DB-backed outcome-verification write path at DB_RUNTIME (PR #585: it must not skip DB verification)", () => {
      for (const f of [
        "src/services/owner-mode/owner-outcome-verification.service.ts",
        "src/services/owner-mode/owner-action-outcome.service.ts",
        "src/services/owner-mode/process-execution-bridge.service.ts",
        "src/services/owner-mode/reassessment-event.service.ts",
      ]) {
        expect(classifyPath(f)).toBe(TIERS.DB_RUNTIME);
      }
      // Not a directory rule: unrelated owner-mode files keep their tier.
      expect(classifyPath("src/services/owner-mode/owner-progress.service.ts")).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("classifies a non-DB test file change at APPLICATION_NON_DB, and a .db.test.ts change at DB_RUNTIME", () => {
      expect(classifyPath("src/__tests__/services/foo.test.ts")).toBe(TIERS.APPLICATION_NON_DB);
      expect(classifyPath("src/__tests__/services/foo.db.test.ts")).toBe(TIERS.DB_RUNTIME);
    });

    it("a large mixed PR touching docs + CI + app + security classifies at the highest touched tier (security)", () => {
      const result = classifyChangeSet([
        "README.md",
        ".github/workflows/foo.yml",
        "src/services/bar.service.ts",
        "src/lib/auth/session.ts",
      ]);
      expect(result.tier).toBe(TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT);
    });
  });

  describe("Suite/Main-Integration execution flags", () => {
    it("a pure docs change skips both the non-DB suite and Main Integration's full suite", () => {
      const result = classifyChangeSet(["README.md"]);
      expect(result.runNonDbSuite).toBe(false);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("a recovery-only change runs the non-DB suite once but skips Main Integration's full suite", () => {
      const result = classifyChangeSet([".github/workflows/restore-rehearsal.yml"]);
      expect(result.runNonDbSuite).toBe(true);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("an application-non-DB change skips Main Integration's full suite", () => {
      const result = classifyChangeSet(["src/services/foo.service.ts"]);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("DB_RUNTIME, SECURITY, and UNKNOWN tiers all force Main Integration's full suite and the non-DB suite", () => {
      for (const paths of [["prisma/schema.prisma"], ["src/lib/auth/session.ts"], ["newfeature/index.ts"]]) {
        const result = classifyChangeSet(paths);
        expect(result.runMainIntegrationFullSuite).toBe(true);
        expect(result.runNonDbSuite).toBe(true);
      }
    });
  });

  describe("Empty diff", () => {
    it("an empty changed-file list classifies as DOCS_ONLY and skips both expensive lanes", () => {
      const result = classifyChangeSet([]);
      expect(result.tier).toBe(TIERS.DOCS_ONLY);
      expect(result.runNonDbSuite).toBe(false);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });
  });

  // Owner correction pass (2026-08-29), Issue 2: the first version of this
  // classifier gave RECOVERY_INFRA_ONLY the same broad ~28,000-test suite as
  // every other non-DOCS_ONLY tier, defeating the point of a recovery-only
  // tier existing at all. suiteMode is the fix -- proves each tier gets
  // exactly the validation depth the owner's directive specifies, never more.
  describe("suiteMode per tier", () => {
    it("DOCS_ONLY gets suiteMode NONE", () => {
      expect(classifyChangeSet(["README.md"]).suiteMode).toBe(SUITE_MODES.NONE);
    });

    it("RECOVERY_INFRA_ONLY gets suiteMode TARGETED_RECOVERY, never the broad suite", () => {
      const result = classifyChangeSet([
        "scripts/backup-database.sh",
        "src/__tests__/scripts/backup-restore.test.ts",
      ]);
      expect(result.tier).toBe(TIERS.RECOVERY_INFRA_ONLY);
      expect(result.suiteMode).toBe(SUITE_MODES.TARGETED_RECOVERY);
    });

    it("every tier above CI_GOVERNANCE gets suiteMode BROAD_NON_DB", () => {
      // CI-MIN-01: CI_GOVERNANCE now gets its own TARGETED_CI_GOVERNANCE mode
      // (see the dedicated describe block below), the same treatment already
      // proven for RECOVERY_INFRA_ONLY -- so it moved out of this generic
      // "gets the broad suite" list.
      const cases: [string, number][] = [
        ["src/services/foo.service.ts", TIERS.APPLICATION_NON_DB],
        ["src/lib/auth/session.ts", TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT],
        ["prisma/schema.prisma", TIERS.DB_RUNTIME],
        ["newfeature/index.ts", TIERS.UNKNOWN],
      ];
      for (const [p, expectedTier] of cases) {
        const result = classifyChangeSet([p]);
        expect(result.tier).toBe(expectedTier);
        expect(result.suiteMode).toBe(SUITE_MODES.BROAD_NON_DB);
      }
    });

    it("RECURRENCE GUARD: a recovery script plus its own test file stays RECOVERY_INFRA_ONLY (found while verifying push-diff mode, 2026-08-29) -- the generic src/** rule must not override the specific, cheaper recovery-test-file rule", () => {
      expect(classifyPath("src/__tests__/scripts/backup-restore.test.ts")).toBe(
        TIERS.RECOVERY_INFRA_ONLY,
      );
    });
  });

  // Owner correction pass (2026-08-29), Issue 3 ("a potential safety-critical
  // classifier defect"): main-integration.yml must classify a push using the
  // push event's own before/after commit identities, NEVER by diffing against
  // origin/main post-checkout (which can already equal the new HEAD in a job
  // triggered by that same push, producing a false-empty diff that silently
  // skips full validation on a risky change). These tests build a real,
  // throwaway git repository and drive classifyPushEvent/resolvePushDiffFiles
  // against real commit SHAs -- proving actual git behavior, not a simulated
  // path list, per the owner's explicit "this proof is mandatory before push"
  // requirement.
  describe("Push-diff safety (classifyPushEvent / resolvePushDiffFiles) -- real git repo", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
      while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    function makeRepo(): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-risk-classifier-push-test-"));
      tempDirs.push(dir);
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
      execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
      return dir;
    }

    function commitFiles(dir: string, files: Record<string, string>, message: string): string {
      for (const [relPath, contents] of Object.entries(files)) {
        const full = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, contents);
        execFileSync("git", ["add", relPath], { cwd: dir });
      }
      execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
      return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    }

    it("PUSH TEST 1: a push from a safe old main to a runtime-changing commit forces the full Main Integration suite", () => {
      const dir = makeRepo();
      const before = commitFiles(dir, { "README.md": "baseline\n" }, "baseline");
      const after = commitFiles(
        dir,
        { "prisma/schema.prisma": "model Foo { id String @id }\n" },
        "add prisma model",
      );
      const result = classifyPushEvent({ before, after, cwd: dir });
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
      expect(result.runMainIntegrationFullSuite).toBe(true);
      expect(result.pushDiffUnresolvable).toBeUndefined();
    });

    it("PUSH TEST 2: a push touching only recovery-infra files classifies RECOVERY_INFRA_ONLY and skips the full DB suite", () => {
      const dir = makeRepo();
      const before = commitFiles(dir, { "README.md": "baseline\n" }, "baseline");
      const after = commitFiles(
        dir,
        { ".github/workflows/scheduled-backup.yml": "name: scheduled-backup\n" },
        "touch recovery workflow",
      );
      const result = classifyPushEvent({ before, after, cwd: dir });
      expect(result.tier).toBe(TIERS.RECOVERY_INFRA_ONLY);
      expect(result.suiteMode).toBe(SUITE_MODES.TARGETED_RECOVERY);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("PUSH TEST 3: a push mixing docs and a Prisma change classifies DB_RUNTIME (highest touched tier wins)", () => {
      const dir = makeRepo();
      const before = commitFiles(dir, { "README.md": "baseline\n" }, "baseline");
      const after = commitFiles(
        dir,
        {
          "docs/NOTES.md": "some notes\n",
          "prisma/migrations/20260829_x/migration.sql": "-- migration\n",
        },
        "docs plus migration",
      );
      const result = classifyPushEvent({ before, after, cwd: dir });
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
      expect(result.runMainIntegrationFullSuite).toBe(true);
    });

    it("PUSH TEST 4: an empty/unusable before SHA (new-branch zero-SHA case) classifies UNKNOWN and forces full validation, never a false-empty diff", () => {
      const dir = makeRepo();
      const after = commitFiles(dir, { "README.md": "only commit\n" }, "only commit");
      const zeroSha = "0".repeat(40);

      expect(resolvePushDiffFiles({ before: zeroSha, after, cwd: dir })).toBeNull();
      expect(resolvePushDiffFiles({ before: "", after, cwd: dir })).toBeNull();

      const result = classifyPushEvent({ before: zeroSha, after, cwd: dir });
      expect(result.tier).toBe(TIERS.UNKNOWN);
      expect(result.runNonDbSuite).toBe(true);
      expect(result.runMainIntegrationFullSuite).toBe(true);
      expect(result.pushDiffUnresolvable).toBe(true);
    });

    it("PUSH TEST 5: a multi-commit push where an EARLIER commit touches Prisma and the FINAL commit touches only docs must still classify DB_RUNTIME -- the classifier inspects the entire pushed range, not just the last commit's own delta", () => {
      const dir = makeRepo();
      const before = commitFiles(dir, { "README.md": "baseline\n" }, "c1 baseline");
      commitFiles(
        dir,
        { "prisma/schema.prisma": "model Bar { id String @id }\n" },
        "c2 adds prisma model (the risky commit, buried in the middle)",
      );
      const after = commitFiles(
        dir,
        { "docs/CHANGE.md": "docs-only final commit\n" },
        "c3 docs-only (must not mask c2)",
      );
      const result = classifyPushEvent({ before, after, cwd: dir });
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
      expect(result.runMainIntegrationFullSuite).toBe(true);
      expect(Object.keys(result.perPath)).toContain("prisma/schema.prisma");
    });

    it("resolvePushDiffFiles returns null (never a false-empty array) on a git failure, e.g. a SHA that does not exist in the repo", () => {
      const dir = makeRepo();
      const after = commitFiles(dir, { "README.md": "only commit\n" }, "only commit");
      const bogusSha = "f".repeat(40);
      expect(resolvePushDiffFiles({ before: bogusSha, after, cwd: dir })).toBeNull();
    });
  });

  // CI-MIN-01: package.json/package-lock.json were classified UNKNOWN (max
  // tier) by PATH ALONE, forcing runMainIntegrationFullSuite for ANY edit to
  // either file, including a pure `scripts` alias rename.
  //
  // OWNER CORRECTION: the original fix here parsed package.json's own
  // unified diff hunk text for a `"scripts": {` / `"dependencies": {`
  // section header and tracked brace depth from there -- but git's default
  // 3-line context does not guarantee that header is visible in the hunk at
  // all. Confirmed directly on this repo's own PR (removing one line from a
  // `scripts` block many lines deep): the hunk never showed `"scripts": {`,
  // so the parser fell through to UNKNOWN, wrongly forcing the DB job. The
  // fix compares each side's FULL, parsed package.json instead
  // (comparePackageJson/classifyPackageJsonChange) -- section membership is
  // read from the real JSON structure, never guessed from limited diff-hunk
  // context. package-lock.json is unchanged: it still uses its own diff
  // text (classifyPackageLockDiffText), kept fail-closed as before, since a
  // lockfile has no "scripts" section to distinguish.
  describe("Content-aware package.json / package-lock.json classification (CI-MIN-01)", () => {
    describe("comparePackageJson (pure, base-vs-head JSON comparison)", () => {
      it("a scripts-only change classifies APPLICATION_NON_DB, never UNKNOWN", () => {
        expect(comparePackageJson(scriptsOnlyChange.base, scriptsOnlyChange.head)).toBe(TIERS.APPLICATION_NON_DB);
      });

      it("a non-DB dependency change classifies APPLICATION_NON_DB", () => {
        expect(comparePackageJson(nonDbDependencyChange.base, nonDbDependencyChange.head)).toBe(
          TIERS.APPLICATION_NON_DB,
        );
      });

      it("a DB-package dependency change classifies DB_RUNTIME", () => {
        expect(comparePackageJson(dbDependencyChange.base, dbDependencyChange.head)).toBe(TIERS.DB_RUNTIME);
      });

      it("a scoped DB-package (@neondatabase/serverless) dependency change classifies DB_RUNTIME", () => {
        expect(comparePackageJson(scopedDbDependencyChange.base, scopedDbDependencyChange.head)).toBe(
          TIERS.DB_RUNTIME,
        );
      });

      it("a DB-package added to devDependencies also classifies DB_RUNTIME", () => {
        const base = { devDependencies: {} };
        const head = { devDependencies: { "better-sqlite3": "^9.0.0" } };
        expect(comparePackageJson(base, head)).toBe(TIERS.DB_RUNTIME);
      });

      it("removing a DB package still classifies DB_RUNTIME (the dependency section changed either way)", () => {
        const base = { dependencies: { pg: "^8.0.0" } };
        const head = { dependencies: {} };
        expect(comparePackageJson(base, head)).toBe(TIERS.DB_RUNTIME);
      });

      it("a change to an unrelated top-level field (name/version) with no tracked section changes classifies APPLICATION_NON_DB", () => {
        const base = { name: "opsiq", version: "0.1.0" };
        const head = { name: "opsiq", version: "0.2.0" };
        expect(comparePackageJson(base, head)).toBe(TIERS.APPLICATION_NON_DB);
      });

      it("REGRESSION GUARD: the EXACT current-PR change -- removing one script from a scripts block many lines deep -- classifies APPLICATION_NON_DB (this is the bug the diff-hunk parser hit: it never saw the scripts section's opening brace)", () => {
        const scripts = {
          postinstall: "prisma generate",
          dev: "next dev",
          build: "next build",
          start: "next start",
          lint: "eslint",
          "lint:ratchet": "node scripts/lint-ratchet.mjs",
          "verify:owner-preservation": "node scripts/ux/verify-owner-feature-preservation.mjs",
          "validate:deployment": "tsx scripts/validate-deployment.ts",
          "db:generate": "prisma generate",
          "db:migrate:dev": "prisma migrate dev",
        };
        const scriptsAfter = { ...scripts };
        delete (scriptsAfter as Record<string, string>)["verify:owner-preservation"];
        const base = { name: "opsiq", version: "0.1.0", private: true, scripts, dependencies: { next: "14.0.0" } };
        const head = {
          name: "opsiq",
          version: "0.1.0",
          private: true,
          scripts: scriptsAfter,
          dependencies: { next: "14.0.0" },
        };
        expect(comparePackageJson(base, head)).toBe(TIERS.APPLICATION_NON_DB);
      });
    });

    describe("classifyPackageJsonChange -- real git repo (git show + JSON.parse)", () => {
      const tempDirs: string[] = [];

      afterEach(() => {
        while (tempDirs.length > 0) {
          const dir = tempDirs.pop();
          if (dir) fs.rmSync(dir, { recursive: true, force: true });
        }
      });

      function makeRepo(): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-risk-classifier-pkgjson-test-"));
        tempDirs.push(dir);
        execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
        execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
        execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
        execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
        return dir;
      }

      function commitFiles(dir: string, files: Record<string, string>, message: string): string {
        for (const [relPath, contents] of Object.entries(files)) {
          const full = path.join(dir, relPath);
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, contents);
          execFileSync("git", ["add", relPath], { cwd: dir });
        }
        execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir });
        return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
      }

      it("REQUIRED REGRESSION TEST: the EXACT current-PR package.json hunk (removing verify:owner-preservation, whose scripts-section opening brace is NOT within git's diff context) classifies APPLICATION_NON_DB via a real git repo, and dbRequired=false end-to-end", () => {
        const dir = makeRepo();
        const pkg = (scripts: Record<string, string>) =>
          JSON.stringify(
            { name: "opsiq", version: "0.1.0", private: true, scripts, dependencies: { next: "14.0.0" } },
            null,
            2,
          ) + "\n";
        const scriptsBefore = {
          postinstall: "prisma generate",
          dev: "next dev",
          build: "next build",
          start: "next start",
          lint: "eslint",
          "lint:ratchet": "node scripts/lint-ratchet.mjs",
          "verify:owner-preservation": "node scripts/ux/verify-owner-feature-preservation.mjs",
          "validate:deployment": "tsx scripts/validate-deployment.ts",
          "db:generate": "prisma generate",
          "db:migrate:dev": "prisma migrate dev",
        };
        const scriptsAfter = { ...scriptsBefore };
        delete (scriptsAfter as Record<string, string>)["verify:owner-preservation"];

        const before = commitFiles(dir, { "package.json": pkg(scriptsBefore) }, "baseline");
        const after = commitFiles(dir, { "package.json": pkg(scriptsAfter) }, "remove verify:owner-preservation script");

        // Prove the actual git diff hunk does NOT contain the scripts
        // section header -- the exact failure mode the old diff-text
        // parser hit, reproduced against real git output, not simulated.
        const diff = execFileSync("git", ["diff", before, after, "--", "package.json"], {
          cwd: dir,
          encoding: "utf8",
        });
        expect(diff).not.toContain('"scripts": {');

        expect(classifyPackageJsonChange({ before, after, cwd: dir })).toBe(TIERS.APPLICATION_NON_DB);

        const result = classifyPushEvent({ before, after, cwd: dir });
        expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
        expect(result.dbRequired).toBe(false);
      });

      it("END-TO-END: a real DB-dependency package.json commit, diffed and classified via classifyPushEvent, forces the DB suite", () => {
        const dir = makeRepo();
        const before = commitFiles(
          dir,
          { "package.json": JSON.stringify({ name: "x", dependencies: { next: "14.0.0" } }, null, 2) + "\n" },
          "baseline",
        );
        const after = commitFiles(
          dir,
          {
            "package.json":
              JSON.stringify({ name: "x", dependencies: { next: "14.0.0", prisma: "^5.10.0" } }, null, 2) + "\n",
          },
          "add prisma dependency",
        );
        const result = classifyPushEvent({ before, after, cwd: dir });
        expect(result.tier).toBe(TIERS.DB_RUNTIME);
        expect(result.dbRequired).toBe(true);
      });

      it("classifyPackageJsonChange returns UNKNOWN when package.json cannot be read at one ref (e.g. it did not exist yet)", () => {
        const dir = makeRepo();
        const before = commitFiles(dir, { "README.md": "x\n" }, "no package.json yet");
        const after = commitFiles(dir, { "package.json": '{"name":"x"}\n' }, "add package.json");
        expect(classifyPackageJsonChange({ before, after, cwd: dir })).toBe(TIERS.UNKNOWN);
      });

      it("classifyPackageJsonChange returns UNKNOWN when package.json contents are not valid JSON at either ref", () => {
        const dir = makeRepo();
        const before = commitFiles(dir, { "package.json": '{"name":"x"}\n' }, "baseline");
        const after = commitFiles(dir, { "package.json": "{ not valid json\n" }, "corrupt package.json");
        expect(classifyPackageJsonChange({ before, after, cwd: dir })).toBe(TIERS.UNKNOWN);
      });

      it("resolvePackageDiffText returns null when neither package.json nor package-lock.json changed (no wasted git call)", () => {
        const dir = makeRepo();
        const before = commitFiles(dir, { "README.md": "a\n" }, "c1");
        const after = commitFiles(dir, { "README.md": "b\n" }, "c2");
        expect(resolvePackageDiffText({ before, after, cwd: dir, paths: ["README.md"] })).toBeNull();
      });

      it("resolvePackageDiffText returns null for package.json alone -- it is no longer a diff-text target (owner correction: package.json uses git show, not diff text)", () => {
        const dir = makeRepo();
        const before = commitFiles(dir, { "package.json": '{"name":"x"}\n' }, "c1");
        const after = commitFiles(dir, { "package.json": '{"name":"y"}\n' }, "c2");
        expect(resolvePackageDiffText({ before, after, cwd: dir, paths: ["package.json"] })).toBeNull();
      });
    });

    describe("classifyPackageLockDiffText (unchanged by this correction -- still diff-text based, kept fail-closed)", () => {
      it("a DB-package lockfile entry classifies DB_RUNTIME", () => {
        expect(classifyPackageLockDiffText(lockDbDiff)).toBe(TIERS.DB_RUNTIME);
      });

      it("a non-DB lockfile entry classifies APPLICATION_NON_DB", () => {
        expect(classifyPackageLockDiffText(lockNonDbDiff)).toBe(TIERS.APPLICATION_NON_DB);
      });

      it("empty diff text stays UNKNOWN", () => {
        expect(classifyPackageLockDiffText("")).toBe(TIERS.UNKNOWN);
      });
    });

    it("DB_PACKAGE_RE matches exact package names and node_modules paths, never a mere prefix of an unrelated package", () => {
      expect(DB_PACKAGE_RE.test('"pg": "^8.0.0"')).toBe(true);
      expect(DB_PACKAGE_RE.test('"node_modules/prisma": {')).toBe(true);
      expect(DB_PACKAGE_RE.test('"node_modules/@prisma/client": {')).toBe(true);
      expect(DB_PACKAGE_RE.test('"pg-connection-string-unrelated": "^1.0.0"')).toBe(false);
      expect(DB_PACKAGE_RE.test('"some-postgres-adjacent-blog-post": "^1.0.0"')).toBe(false);
    });

    it("splitUnifiedDiffByFile separates a combined multi-file diff by file (generic utility, still used for package-lock.json)", () => {
      const otherFileDiff = [
        "diff --git a/some-other-file.json b/some-other-file.json",
        "index 3333333..4444444 100644",
        "--- a/some-other-file.json",
        "+++ b/some-other-file.json",
        "@@ -1,1 +1,1 @@",
        '-{"a":1}',
        '+{"a":2}',
      ].join("\n");
      const combined = `${lockDbDiff}\n${otherFileDiff}`;
      const segments = splitUnifiedDiffByFile(combined);
      expect(Object.keys(segments)).toEqual(["package-lock.json", "some-other-file.json"]);
      expect(segments["package-lock.json"]).toContain("node_modules/prisma");
      expect(segments["some-other-file.json"]).toContain('{"a":2}');
    });

    describe("classifyChangeSet wiring: packageJsonTier option", () => {
      it("REQUIRED OUTCOME: a scripts-only packageJsonTier (and no lockfile change) never forces the DB suite", () => {
        const result = classifyChangeSet(["package.json"], {
          packageJsonTier: comparePackageJson(scriptsOnlyChange.base, scriptsOnlyChange.head),
        });
        expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
        expect(result.dbRequired).toBe(false);
      });

      it("REQUIRED OUTCOME: a scripts-only change to BOTH package.json (via packageJsonTier) and package-lock.json (via diff text) never forces the DB suite", () => {
        const result = classifyChangeSet(["package.json", "package-lock.json"], {
          packageJsonTier: comparePackageJson(scriptsOnlyChange.base, scriptsOnlyChange.head),
          packageDiffText: lockNonDbDiff,
        });
        expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
        expect(result.dbRequired).toBe(false);
      });

      it("a DB-package dependency packageJsonTier forces the DB suite", () => {
        const result = classifyChangeSet(["package.json"], {
          packageJsonTier: comparePackageJson(dbDependencyChange.base, dbDependencyChange.head),
        });
        expect(result.tier).toBe(TIERS.DB_RUNTIME);
        expect(result.dbRequired).toBe(true);
      });

      it("BACKWARD COMPATIBILITY: classifyChangeSet without packageJsonTier keeps the prior conservative UNKNOWN behavior for package.json", () => {
        const result = classifyChangeSet(["package.json"]);
        expect(result.tier).toBe(TIERS.UNKNOWN);
        expect(result.dbRequired).toBe(true);
      });
    });
  });

  // CI-MIN-01: a workflow-only / named-CI-script-only PR (CI_GOVERNANCE
  // tier) must not run the ~28,000-test broad application suite -- it gets
  // its own narrow TARGETED_CI_GOVERNANCE mode instead, the same pattern
  // already proven for RECOVERY_INFRA_ONLY above.
  describe("TARGETED_CI_GOVERNANCE suite mode (CI-MIN-01)", () => {
    it("a pure CI_GOVERNANCE-tier change gets suiteMode TARGETED_CI_GOVERNANCE, never the broad suite", () => {
      const result = classifyChangeSet([".github/workflows/ci.yml"]);
      expect(result.tier).toBe(TIERS.CI_GOVERNANCE);
      expect(result.suiteMode).toBe(SUITE_MODES.TARGETED_CI_GOVERNANCE);
    });

    it("a named CI-governance script change gets suiteMode TARGETED_CI_GOVERNANCE", () => {
      const result = classifyChangeSet(["scripts/ci-governance-check.mjs"]);
      expect(result.tier).toBe(TIERS.CI_GOVERNANCE);
      expect(result.suiteMode).toBe(SUITE_MODES.TARGETED_CI_GOVERNANCE);
    });

    it("CI_GOVERNANCE tier still skips Main Integration's full DB suite", () => {
      const result = classifyChangeSet([".github/workflows/ci.yml"]);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("a workflow change mixed with an application source change is pulled up to APPLICATION_NON_DB, not TARGETED_CI_GOVERNANCE", () => {
      const result = classifyChangeSet([".github/workflows/ci.yml", "src/services/foo.service.ts"]);
      expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
      expect(result.suiteMode).toBe(SUITE_MODES.BROAD_NON_DB);
    });
  });

  // CI-MIN-01 owner correction: dbRequired is the SINGLE authoritative
  // signal driving ci.yml's own pre-merge db-verify job. This is the
  // required test matrix from the correction directive, proven directly
  // against the classifier -- no separate path-filter system is consulted
  // anywhere in this file.
  describe("dbRequired — required test matrix (CI-MIN-01 owner correction)", () => {
    it("docs only: dbRequired=false", () => {
      expect(classifyChangeSet(["README.md"]).dbRequired).toBe(false);
    });

    it("workflow only: dbRequired=false", () => {
      expect(classifyChangeSet([".github/workflows/ci.yml"]).dbRequired).toBe(false);
    });

    it("normal src change: dbRequired=false", () => {
      expect(classifyChangeSet(["src/services/foo.service.ts"]).dbRequired).toBe(false);
    });

    it("package.json scripts-only change: dbRequired=false", () => {
      const result = classifyChangeSet(["package.json"], {
        packageJsonTier: comparePackageJson(scriptsOnlyChange.base, scriptsOnlyChange.head),
      });
      expect(result.dbRequired).toBe(false);
    });

    it("normal (non-DB) package.json dependency change: dbRequired=false", () => {
      const result = classifyChangeSet(["package.json"], {
        packageJsonTier: comparePackageJson(nonDbDependencyChange.base, nonDbDependencyChange.head),
      });
      expect(result.dbRequired).toBe(false);
    });

    it("Prisma/Neon/Postgres package.json dependency change: dbRequired=true", () => {
      expect(
        classifyChangeSet(["package.json"], {
          packageJsonTier: comparePackageJson(dbDependencyChange.base, dbDependencyChange.head),
        }).dbRequired,
      ).toBe(true);
      expect(
        classifyChangeSet(["package.json"], {
          packageJsonTier: comparePackageJson(scopedDbDependencyChange.base, scopedDbDependencyChange.head),
        }).dbRequired,
      ).toBe(true);
    });

    it("named DB-adjacent service files classify DB_RUNTIME and dbRequired=true (restored from the old db-verification.yml path list)", () => {
      const paths = [
        "src/services/owner-mode/owner-bcp.service.ts",
        "src/services/consulting/consulting-engagement.service.ts",
        "src/services/integration-fabric/connector-registry.service.ts",
        "src/services/integration-fabric/integration-event.service.ts",
      ];
      for (const p of paths) {
        const result = classifyChangeSet([p]);
        expect(result.tier).toBe(TIERS.DB_RUNTIME);
        expect(result.dbRequired).toBe(true);
      }
    });

    it("CI infrastructure test files classify CI_GOVERNANCE, never APPLICATION_NON_DB or DOCS_ONLY, and never require the DB job", () => {
      const paths = [
        "src/__tests__/ci-cd/ci-trigger-governance.test.ts",
        "src/__tests__/ci-cd/non-db-suite-capacity.test.ts",
        "src/__tests__/workflows/ci-risk-classifier.test.ts",
      ];
      for (const p of paths) {
        const result = classifyChangeSet([p]);
        expect(result.tier).toBe(TIERS.CI_GOVERNANCE);
        expect(result.suiteMode).toBe(SUITE_MODES.TARGETED_CI_GOVERNANCE);
        expect(result.dbRequired).toBe(false);
      }
    });

    it("Prisma/Neon/Postgres package-lock.json dependency change: dbRequired=true", () => {
      expect(classifyChangeSet(["package-lock.json"], { packageDiffText: lockDbDiff }).dbRequired).toBe(true);
    });

    it("prisma schema change: dbRequired=true", () => {
      expect(classifyChangeSet(["prisma/schema.prisma"]).dbRequired).toBe(true);
    });

    it("prisma migration change: dbRequired=true", () => {
      expect(
        classifyChangeSet(["prisma/migrations/20260101_x/migration.sql"]).dbRequired,
      ).toBe(true);
    });

    it("*.db.test.ts change anywhere in the repo: dbRequired=true", () => {
      expect(classifyChangeSet(["src/services/foo.db.test.ts"]).dbRequired).toBe(true);
      expect(classifyChangeSet(["src/__tests__/scripts/foo.db.test.ts"]).dbRequired).toBe(true);
    });

    it("a genuinely unrecognized path stays dbRequired=true (ambiguous -> FULL applies to the DB dimension too)", () => {
      expect(classifyChangeSet(["newfeature/index.ts"]).dbRequired).toBe(true);
    });

    it("SECURITY_AUTH_TENANCY_ENTITLEMENT alone (no DB_RUNTIME path) does not by itself require the DB job", () => {
      expect(classifyChangeSet(["src/lib/auth/session.ts"]).dbRequired).toBe(false);
    });

    it("a DB-tier path in the same PR pulls dbRequired to true even when mixed with lower tiers", () => {
      const result = classifyChangeSet(["README.md", "src/services/foo.service.ts", "prisma/schema.prisma"]);
      expect(result.dbRequired).toBe(true);
    });
  });
});
