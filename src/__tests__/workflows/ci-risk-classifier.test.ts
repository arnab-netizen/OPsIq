import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  classifyChangeSet,
  classifyPackageJsonDiffText,
  classifyPackageLockDiffText,
  classifyPath,
  classifyPushEvent,
  DB_PACKAGE_RE,
  resolvePackageDiffText,
  resolvePushDiffFiles,
  splitUnifiedDiffByFile,
  SUITE_MODES,
  TIERS,
} from "../../../scripts/ci-risk-classifier.mjs";

// Shared package.json/package-lock.json diff fixtures, used by both the
// "Content-aware package.json / package-lock.json classification" describe
// block and the "dbRequired" required-test-matrix describe block below.
const scriptsOnlyDiff = [
  "diff --git a/package.json b/package.json",
  "index 1111111..2222222 100644",
  "--- a/package.json",
  "+++ b/package.json",
  "@@ -10,7 +10,7 @@",
  '   "scripts": {',
  '     "dev": "next dev",',
  '-    "lint": "eslint .",',
  '+    "lint": "eslint",',
  '     "build": "next build"',
  "   },",
].join("\n");

const nonDbDependencyDiff = [
  "diff --git a/package.json b/package.json",
  "index 1111111..2222222 100644",
  "--- a/package.json",
  "+++ b/package.json",
  "@@ -20,6 +20,7 @@",
  '   "dependencies": {',
  '     "next": "14.0.0",',
  '+    "lodash": "^4.17.21",',
  '     "react": "18.2.0"',
  "   },",
].join("\n");

const dbDependencyDiff = [
  "diff --git a/package.json b/package.json",
  "index 1111111..2222222 100644",
  "--- a/package.json",
  "+++ b/package.json",
  "@@ -20,6 +20,7 @@",
  '   "dependencies": {',
  '     "next": "14.0.0",',
  '+    "prisma": "^5.10.0",',
  '     "react": "18.2.0"',
  "   },",
].join("\n");

const scopedDbDependencyDiff = [
  "diff --git a/package.json b/package.json",
  "index 1111111..2222222 100644",
  "--- a/package.json",
  "+++ b/package.json",
  "@@ -20,6 +20,7 @@",
  '   "dependencies": {',
  '     "next": "14.0.0",',
  '+    "@neondatabase/serverless": "^0.9.0",',
  '     "react": "18.2.0"',
  "   },",
].join("\n");

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
  // either file, including a pure `scripts` alias rename. These tests prove
  // the content-aware replacement against real unified diff text -- not a
  // reimplementation of git's diff format, actual `diff --git` hunks built
  // by hand the way `git diff` itself would produce them.
  describe("Content-aware package.json / package-lock.json classification (CI-MIN-01)", () => {
    it("classifyPackageJsonDiffText: a scripts-only diff classifies APPLICATION_NON_DB, never UNKNOWN", () => {
      expect(classifyPackageJsonDiffText(scriptsOnlyDiff)).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("classifyPackageJsonDiffText: a non-DB dependency diff classifies APPLICATION_NON_DB", () => {
      expect(classifyPackageJsonDiffText(nonDbDependencyDiff)).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("classifyPackageJsonDiffText: a DB-package dependency diff classifies DB_RUNTIME", () => {
      expect(classifyPackageJsonDiffText(dbDependencyDiff)).toBe(TIERS.DB_RUNTIME);
    });

    it("classifyPackageJsonDiffText: a scoped DB-package (@neondatabase/serverless) diff classifies DB_RUNTIME", () => {
      expect(classifyPackageJsonDiffText(scopedDbDependencyDiff)).toBe(TIERS.DB_RUNTIME);
    });

    it("classifyPackageJsonDiffText: empty/unparseable diff text stays UNKNOWN (ambiguous -> FULL)", () => {
      expect(classifyPackageJsonDiffText("")).toBe(TIERS.UNKNOWN);
      expect(classifyPackageJsonDiffText("not a real diff at all")).toBe(TIERS.UNKNOWN);
    });

    it("classifyPackageLockDiffText: a DB-package lockfile entry classifies DB_RUNTIME", () => {
      expect(classifyPackageLockDiffText(lockDbDiff)).toBe(TIERS.DB_RUNTIME);
    });

    it("classifyPackageLockDiffText: a non-DB lockfile entry classifies APPLICATION_NON_DB", () => {
      expect(classifyPackageLockDiffText(lockNonDbDiff)).toBe(TIERS.APPLICATION_NON_DB);
    });

    it("classifyPackageLockDiffText: empty diff text stays UNKNOWN", () => {
      expect(classifyPackageLockDiffText("")).toBe(TIERS.UNKNOWN);
    });

    it("DB_PACKAGE_RE matches exact package names and node_modules paths, never a mere prefix of an unrelated package", () => {
      expect(DB_PACKAGE_RE.test('"pg": "^8.0.0"')).toBe(true);
      expect(DB_PACKAGE_RE.test('"node_modules/prisma": {')).toBe(true);
      expect(DB_PACKAGE_RE.test('"node_modules/@prisma/client": {')).toBe(true);
      expect(DB_PACKAGE_RE.test('"pg-connection-string-unrelated": "^1.0.0"')).toBe(false);
      expect(DB_PACKAGE_RE.test('"some-postgres-adjacent-blog-post": "^1.0.0"')).toBe(false);
    });

    it("splitUnifiedDiffByFile separates a combined package.json + package-lock.json diff by file", () => {
      const combined = `${scriptsOnlyDiff}\n${lockNonDbDiff}`;
      const segments = splitUnifiedDiffByFile(combined);
      expect(Object.keys(segments)).toEqual(["package.json", "package-lock.json"]);
      expect(segments["package.json"]).toContain('"lint": "eslint",');
      expect(segments["package-lock.json"]).toContain("node_modules/lodash");
    });

    it("REQUIRED OUTCOME: classifyChangeSet given a scripts-only package.json diff (and no lockfile change) never forces the DB suite", () => {
      const result = classifyChangeSet(["package.json"], { packageDiffText: scriptsOnlyDiff });
      expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("REQUIRED OUTCOME: a scripts-only change to BOTH package.json and package-lock.json never forces the DB suite", () => {
      const combined = [scriptsOnlyDiff, lockNonDbDiff].join("\n");
      const result = classifyChangeSet(["package.json", "package-lock.json"], { packageDiffText: combined });
      expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
      expect(result.runMainIntegrationFullSuite).toBe(false);
    });

    it("a DB-package dependency change to package.json forces the DB suite", () => {
      const result = classifyChangeSet(["package.json"], { packageDiffText: dbDependencyDiff });
      expect(result.tier).toBe(TIERS.DB_RUNTIME);
      expect(result.runMainIntegrationFullSuite).toBe(true);
    });

    it("BACKWARD COMPATIBILITY: classifyChangeSet without packageDiffText keeps the prior conservative UNKNOWN behavior for package.json", () => {
      const result = classifyChangeSet(["package.json"]);
      expect(result.tier).toBe(TIERS.UNKNOWN);
      expect(result.runMainIntegrationFullSuite).toBe(true);
    });

    describe("resolvePackageDiffText -- real git repo", () => {
      const tempDirs: string[] = [];

      afterEach(() => {
        while (tempDirs.length > 0) {
          const dir = tempDirs.pop();
          if (dir) fs.rmSync(dir, { recursive: true, force: true });
        }
      });

      function makeRepo(): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-risk-classifier-pkgdiff-test-"));
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

      it("END-TO-END: a real scripts-only package.json commit, diffed and classified via classifyPushEvent, never forces the DB suite", () => {
        const dir = makeRepo();
        const before = commitFiles(
          dir,
          { "package.json": JSON.stringify({ name: "x", scripts: { lint: "eslint ." }, dependencies: { next: "14.0.0" } }, null, 2) + "\n" },
          "baseline",
        );
        const after = commitFiles(
          dir,
          { "package.json": JSON.stringify({ name: "x", scripts: { lint: "eslint" }, dependencies: { next: "14.0.0" } }, null, 2) + "\n" },
          "scripts-only change",
        );
        const result = classifyPushEvent({ before, after, cwd: dir });
        expect(result.tier).toBe(TIERS.APPLICATION_NON_DB);
        expect(result.runMainIntegrationFullSuite).toBe(false);
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
          { "package.json": JSON.stringify({ name: "x", dependencies: { next: "14.0.0", prisma: "^5.10.0" } }, null, 2) + "\n" },
          "add prisma dependency",
        );
        const result = classifyPushEvent({ before, after, cwd: dir });
        expect(result.tier).toBe(TIERS.DB_RUNTIME);
        expect(result.runMainIntegrationFullSuite).toBe(true);
      });

      it("resolvePackageDiffText returns null when neither package.json nor package-lock.json changed (no wasted git call)", () => {
        const dir = makeRepo();
        const before = commitFiles(dir, { "README.md": "a\n" }, "c1");
        const after = commitFiles(dir, { "README.md": "b\n" }, "c2");
        expect(resolvePackageDiffText({ before, after, cwd: dir, paths: ["README.md"] })).toBeNull();
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
      const result = classifyChangeSet(["package.json"], { packageDiffText: scriptsOnlyDiff });
      expect(result.dbRequired).toBe(false);
    });

    it("normal (non-DB) package.json dependency change: dbRequired=false", () => {
      const result = classifyChangeSet(["package.json"], { packageDiffText: nonDbDependencyDiff });
      expect(result.dbRequired).toBe(false);
    });

    it("Prisma/Neon/Postgres package.json dependency change: dbRequired=true", () => {
      expect(classifyChangeSet(["package.json"], { packageDiffText: dbDependencyDiff }).dbRequired).toBe(true);
      expect(
        classifyChangeSet(["package.json"], { packageDiffText: scopedDbDependencyDiff }).dbRequired,
      ).toBe(true);
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
