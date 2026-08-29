import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  classifyChangeSet,
  classifyPath,
  classifyPushEvent,
  resolvePushDiffFiles,
  SUITE_MODES,
  TIERS,
} from "../../../scripts/ci-risk-classifier.mjs";

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

    it("every tier above RECOVERY_INFRA_ONLY gets suiteMode BROAD_NON_DB", () => {
      const cases: [string, number][] = [
        [".github/workflows/some-new-thing.yml", TIERS.CI_GOVERNANCE],
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
});
