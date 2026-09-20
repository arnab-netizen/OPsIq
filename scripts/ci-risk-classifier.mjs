#!/usr/bin/env node
/**
 * CI risk classifier. Classifies a PR/push's changed-file list into a risk
 * tier that determines whether the expensive non-DB test suite and/or the
 * Main Integration full-DB-suite job are required.
 *
 * ROOT CAUSE this closes: `main-integration.yml` ran its full DB suite
 * unconditionally on every push to main regardless of what changed --
 * confirmed directly on a real merge (PR #373, a 1-line whitespace fix to
 * one workflow file) costing 2595s (~43 min) of full-DB-suite runtime for a
 * change with zero DB/schema/runtime impact. Separately, `ci.yml`'s
 * `build-and-test` job and `bundle-validate` job (which calls
 * `reusable-pr-validation.yml`) both ran the exact same broad non-DB vitest
 * suite on every PR -- a drift from this repo's own documented target
 * architecture (docs/audits/2026-07-12/FINAL_CI_ARCHITECTURE.md: "the
 * suite running once"), not an intentional design.
 *
 * Design principle: highest-risk touched class wins. Any path matching
 * nothing recognized -> UNKNOWN, which is the same maximum tier as the
 * explicit conservative-by-default file list below. Ambiguous is never
 * cheap.
 */

import { execFileSync } from 'node:child_process';

export const TIERS = {
  DOCS_ONLY: 0,
  RECOVERY_INFRA_ONLY: 1,
  CI_GOVERNANCE: 2,
  APPLICATION_NON_DB: 3,
  SECURITY_AUTH_TENANCY_ENTITLEMENT: 4,
  DB_RUNTIME: 5,
  UNKNOWN: 6,
};

const TIER_NAMES = Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [v, k]));

// Order independent: every rule that matches a path contributes its tier;
// the path's effective tier is the MAX of all matching rules (e.g. a file
// under src/lib/auth/** matches both the generic "src/**" rule (3) and the
// auth-specific rule (4) -- it gets 4).
const RULES = [
  // ---- Tier 0: docs / non-executable ----
  { tier: TIERS.DOCS_ONLY, test: (p) => /\.(md|txt)$/i.test(p) },
  { tier: TIERS.DOCS_ONLY, test: (p) => /^docs\//.test(p) },
  { tier: TIERS.DOCS_ONLY, test: (p) => /^(LICENSE|CHANGELOG|CODEOWNERS)$/.test(p) },

  // ---- Tier 1: recovery infrastructure (production backup/restore path only) ----
  { tier: TIERS.RECOVERY_INFRA_ONLY, test: (p) =>
      p === '.github/workflows/scheduled-backup.yml' ||
      p === '.github/workflows/restore-rehearsal.yml' },
  { tier: TIERS.RECOVERY_INFRA_ONLY, test: (p) =>
      /^scripts\/(backup-database|restore-database|cleanup-old-backups|setup-backup-schedule)\.sh$/.test(p) },
  { tier: TIERS.RECOVERY_INFRA_ONLY, test: (p) =>
      p === 'src/__tests__/scripts/backup-restore.test.ts' },
  { tier: TIERS.RECOVERY_INFRA_ONLY, test: (p) =>
      p === 'docs/DATABASE_BACKUP_RECOVERY_RUNBOOK.md' },

  // ---- Tier 2: CI governance / orchestration itself.
  //      BUG FOUND BY HOSTILE AUDIT (2026-08-29): a naive "max across all
  //      matching rules" model lets this GENERIC, more-expensive bucket
  //      override the more-SPECIFIC, cheaper recovery-workflow rule above,
  //      because scheduled-backup.yml/restore-rehearsal.yml also match this
  //      pattern and max(1,2)=2 -- the opposite of what "highest-risk wins"
  //      should mean (a more specific match should never be overridden by a
  //      broader, less-informed one at a HIGHER tier when the specific rule
  //      says LOWER). Explicitly exclude the two named recovery workflow
  //      files here so the more specific tier-1 classification is not lost.
  //      Confirmed via unit test before this fix existed: it failed. ----
  { tier: TIERS.CI_GOVERNANCE, test: (p) =>
      /^\.github\/workflows\/.*\.ya?ml$/.test(p) &&
      p !== '.github/workflows/scheduled-backup.yml' &&
      p !== '.github/workflows/restore-rehearsal.yml' },
  { tier: TIERS.CI_GOVERNANCE, test: (p) =>
      /^scripts\/(ci-governance-check|ci-risk-classifier|scan-recurrence-defects|validate-bundle-manifests|validate-evidence-artifacts|validate-stage-acceptance)\.mjs$/.test(p) },
  // CI-MIN-01 owner correction (item 2): these are tests OF the CI
  // infrastructure itself (the classifier, the branch-protection fail-closed
  // script, the non-DB suite capacity guards), not application tests -- a
  // change confined to them should get the same TARGETED_CI_GOVERNANCE
  // treatment as editing the classifier script itself, never the
  // ~28,000-test broad application suite. Excluded from the generic src/**
  // APPLICATION_NON_DB rule below the same way backup-restore.test.ts is.
  { tier: TIERS.CI_GOVERNANCE, test: (p) =>
      p === 'src/__tests__/ci-cd/ci-trigger-governance.test.ts' ||
      p === 'src/__tests__/ci-cd/non-db-suite-capacity.test.ts' ||
      p === 'src/__tests__/workflows/ci-risk-classifier.test.ts' },

  // ---- Tier 5: DB runtime (checked before the generic src/** rule below,
  //      order doesn't matter since we take the max, but grouped here for
  //      readability) ----
  { tier: TIERS.DB_RUNTIME, test: (p) => /^prisma\//.test(p) },
  { tier: TIERS.DB_RUNTIME, test: (p) => /\.db\.test\.ts$/.test(p) },
  { tier: TIERS.DB_RUNTIME, test: (p) =>
      /^scripts\/(seed-|reset-|migrate).*\.(ts|mjs|sh)$/.test(p) || (/migrate/i.test(p) && /^scripts\//.test(p)) },
  // CI-MIN-01 owner correction (item 3): restored from the old
  // db-verification.yml pull_request path list -- these four services were
  // explicitly treated as DB-sensitive there. Named exactly, not a broader
  // directory rule (the owner explicitly said not to invent one).
  { tier: TIERS.DB_RUNTIME, test: (p) =>
      p === 'src/services/owner-mode/owner-bcp.service.ts' ||
      p === 'src/services/consulting/consulting-engagement.service.ts' ||
      p === 'src/services/integration-fabric/connector-registry.service.ts' ||
      p === 'src/services/integration-fabric/integration-event.service.ts' },

  // ---- Tier 4: security / auth / tenancy / entitlement ----
  { tier: TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT, test: (p) =>
      /^src\/(lib\/)?auth\//.test(p) ||
      /^src\/middleware\.tsx?$/.test(p) ||
      /^src\/app\/api\/auth\//.test(p) ||
      /(^|\/)(auth|workspace|entitlement|billing)[^/]*\.tsx?$/i.test(p) ||
      /^src\/policies\//.test(p) },

  // ---- Tier 6 (UNKNOWN-equivalent): explicitly always-conservative files.
  //      These are recognized paths, not truly "unknown" -- but their blast
  //      radius is broad enough (dependency graph, build config, runtime
  //      env) that treating them as anything cheaper would violate
  //      "ambiguous -> FULL". ----
  { tier: TIERS.UNKNOWN, test: (p) =>
      p === 'package.json' || p === 'package-lock.json' ||
      /^tsconfig.*\.json$/.test(p) ||
      /^next\.config\.(js|mjs|ts)$/.test(p) ||
      p === 'vercel.json' ||
      /^\.env/.test(p) },

  // ---- Tier 3: everything else under src/ and generic scripts/ (baseline
  //      "this is application code, run the suite once, no automatic Main
  //      Integration"). Same exclusion-of-more-specific-cheap-matches fix
  //      as the workflow rule above: a named CI-governance script (tier 2)
  //      or a named recovery shell script (tier 1) must not be pulled UP to
  //      tier 3 just because it also happens to live under scripts/. ----
  // RECURRENCE of the same bug class (found while verifying push-diff mode,
  // owner correction pass 2026-08-29): backup-restore.test.ts lives under
  // src/__tests__/scripts/, so it also matched this generic src/** rule at
  // tier 3, overriding its own specific tier-1 rule above via max(1,3)=3.
  // A pure recovery PR (backup-database.sh + its own test file) would be
  // wrongly pulled up to APPLICATION_NON_DB instead of staying
  // RECOVERY_INFRA_ONLY -- exactly the defect class the workflow/scripts
  // exclusions above already guard against. Excluded here the same way.
  { tier: TIERS.APPLICATION_NON_DB, test: (p) =>
      /^src\//.test(p) &&
      p !== 'src/__tests__/scripts/backup-restore.test.ts' &&
      p !== 'src/__tests__/ci-cd/ci-trigger-governance.test.ts' &&
      p !== 'src/__tests__/ci-cd/non-db-suite-capacity.test.ts' &&
      p !== 'src/__tests__/workflows/ci-risk-classifier.test.ts' },
  { tier: TIERS.APPLICATION_NON_DB, test: (p) =>
      /^scripts\/.*\.(ts|mjs|sh)$/.test(p) &&
      !/^scripts\/(ci-governance-check|ci-risk-classifier|scan-recurrence-defects|validate-bundle-manifests|validate-evidence-artifacts|validate-stage-acceptance)\.mjs$/.test(p) &&
      !/^scripts\/(backup-database|restore-database|cleanup-old-backups|setup-backup-schedule)\.sh$/.test(p) },
];

/**
 * Classify a single changed path. Returns the max tier among all matching
 * rules, or TIERS.UNKNOWN if nothing matches at all.
 */
export function classifyPath(path) {
  let tier = -1;
  for (const rule of RULES) {
    if (rule.test(path)) tier = Math.max(tier, rule.tier);
  }
  return tier === -1 ? TIERS.UNKNOWN : tier;
}

// CI-MIN-01 ROOT-CAUSE FIX: package.json/package-lock.json were classified
// UNKNOWN (max tier) by PATH ALONE, which forces db_required/
// runMainIntegrationFullSuite for ANY edit to either file -- including a
// pure `scripts` alias rename with zero dependency or runtime impact. Path
// alone cannot distinguish a scripts-only edit from a dependency change
// from a DB-package dependency change, so this needs the actual content.
// package.json is classified via classifyPackageJsonChange (git show +
// JSON comparison, below); package-lock.json via classifyPackageLockDiffText
// (its own diff text, since a lockfile has no "scripts" section to
// distinguish). classifyChangeSet uses these INSTEAD OF the blind path rule
// only when the caller actually supplied what each needs -- callers that
// don't keep the prior conservative UNKNOWN behavior unchanged, preserving
// "ambiguous -> FULL" whenever the file can't be read/parsed.
export const DB_PACKAGE_NAMES = [
  'prisma', '@prisma/client', '@prisma/extension-accelerate', '@prisma/adapter-pg', '@prisma/adapter-neon',
  'pg', 'pg-native', 'pg-pool', 'pg-cursor', 'postgres',
  'mysql', 'mysql2',
  'mongodb', 'mongoose',
  'drizzle-orm', 'knex', 'sequelize', 'typeorm', 'kysely',
  'ioredis', 'redis',
  'sqlite3', 'better-sqlite3',
  '@planetscale/database', '@neondatabase/serverless', '@vercel/postgres',
  'mssql', 'tedious',
];
const DB_PACKAGE_ALTERNATION = DB_PACKAGE_NAMES
  .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
// A package name is only counted when it appears as a whole path segment
// bounded by a quote or a slash on both sides (e.g. `"prisma"`,
// `"node_modules/prisma"`, `"node_modules/@prisma/client"`) -- never as a
// prefix of an unrelated package name (e.g. "pg" must not match
// "pg-connection-string-unrelated-thing").
export const DB_PACKAGE_RE = new RegExp(`(^|["/])(${DB_PACKAGE_ALTERNATION})(["/]|$)`, 'i');

const DB_PACKAGE_NAME_SET = new Set(DB_PACKAGE_NAMES.map((n) => n.toLowerCase()));

function isDbPackageName(name) {
  return DB_PACKAGE_NAME_SET.has(String(name).toLowerCase());
}

const PACKAGE_JSON_DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * Compare two already-parsed package.json objects and classify the change.
 * Pure -- no I/O, no diff-text parsing. See classifyPackageJsonChange for the
 * git-backed wrapper actually used by the classifier.
 *
 * ROOT-CAUSE FIX (owner correction, CI-MIN-01): the prior implementation
 * (classifyPackageJsonDiffText, since removed) tracked JSON section
 * membership by scanning the unified diff hunk's own text for a
 * `"scripts": {` / `"dependencies": {` header line and counting braces from
 * there. That is unsound: git's default 3-line context does not guarantee
 * the section header is visible in the hunk at all. Confirmed directly on
 * this repo's own PR removing one line from a `scripts` block many lines
 * long -- the hunk's context started well after `"scripts": {`, the parser
 * never saw a section open, and fell through to UNKNOWN, wrongly forcing
 * the DB job for a scripts-only change. Comparing the two FULL, parsed
 * files by key membership makes this failure mode structurally impossible.
 */
export function comparePackageJson(baseJson, headJson) {
  let touchedDbPackage = false;

  for (const section of PACKAGE_JSON_DEPENDENCY_SECTIONS) {
    const baseSection = (baseJson && baseJson[section]) || {};
    const headSection = (headJson && headJson[section]) || {};
    const names = new Set([...Object.keys(baseSection), ...Object.keys(headSection)]);
    for (const name of names) {
      if (baseSection[name] !== headSection[name] && isDbPackageName(name)) {
        touchedDbPackage = true;
      }
    }
  }

  // A scripts-only change, a non-DB dependency change, or any other
  // top-level field (name/version/private/...) all classify the same: real
  // application-level metadata, never DB risk.
  return touchedDbPackage ? TIERS.DB_RUNTIME : TIERS.APPLICATION_NON_DB;
}

/**
 * Classify package.json's change via a robust base-vs-head JSON comparison
 * -- reads each side's FULL file with `git show <ref>:package.json` and
 * parses it, so section membership is never guessed from limited diff-hunk
 * context (see comparePackageJson above for why that mattered). Returns
 * TIERS.UNKNOWN on any failure to read or parse either side -- a
 * parse/read failure is exactly the kind of ambiguity this classifier never
 * treats as cheap.
 */
export function classifyPackageJsonChange({ before, after, cwd }) {
  if (!before || !after || before === ZERO_SHA || after === ZERO_SHA) return TIERS.UNKNOWN;
  const opts = { cwd: cwd || process.cwd(), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 };
  let baseRaw, headRaw;
  try {
    baseRaw = execFileSync('git', ['show', `${before}:package.json`], opts);
    headRaw = execFileSync('git', ['show', `${after}:package.json`], opts);
  } catch {
    return TIERS.UNKNOWN;
  }
  let baseJson, headJson;
  try {
    baseJson = JSON.parse(baseRaw);
    headJson = JSON.parse(headRaw);
  } catch {
    return TIERS.UNKNOWN;
  }
  return comparePackageJson(baseJson, headJson);
}

/**
 * Classify package-lock.json's own unified diff text. The lockfile has no
 * "scripts" section to distinguish -- every line it can change reflects a
 * dependency-graph change -- so this only asks whether any added/removed
 * line mentions a DB-related package name.
 */
export function classifyPackageLockDiffText(diffText) {
  if (!diffText) return TIERS.UNKNOWN;
  let touchedAny = false;
  let touchedDbPackage = false;
  for (const rawLine of diffText.split('\n')) {
    if (rawLine.startsWith('+++') || rawLine.startsWith('---')) continue;
    const marker = rawLine[0];
    if (marker !== '+' && marker !== '-') continue;
    touchedAny = true;
    if (DB_PACKAGE_RE.test(rawLine)) touchedDbPackage = true;
  }
  if (!touchedAny) return TIERS.UNKNOWN;
  return touchedDbPackage ? TIERS.DB_RUNTIME : TIERS.APPLICATION_NON_DB;
}

/**
 * Split a multi-file unified diff (as produced by `git diff -- fileA fileB`)
 * into per-file segments, keyed by the diff's "b/" (post-change) path.
 */
export function splitUnifiedDiffByFile(diffText) {
  const segments = {};
  if (!diffText) return segments;
  let currentFile = null;
  let buffer = [];
  const flush = () => {
    if (currentFile) segments[currentFile] = buffer.join('\n');
  };
  for (const line of diffText.split('\n')) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      flush();
      currentFile = m[2];
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return segments;
}

// SUITE_MODES: what the PR-side non-DB validation should actually run for a
// given tier. ROOT-CAUSE FIX (2026-08-29, owner correction pass): the first
// version of this classifier gave every tier above DOCS_ONLY the full
// ~28,000-test broad suite, including RECOVERY_INFRA_ONLY -- which defeats
// the entire point of a "recovery-only" tier existing at all, since that
// suite is not materially relevant to a workflow/shell-script-only change.
// A RECOVERY_INFRA_ONLY change instead gets TARGETED_RECOVERY: only the
// recovery-specific test files (backup-restore.test.ts,
// ci-risk-classifier.test.ts) plus bash -n on any changed shell scripts.
// CI-MIN-01: a pure CI_GOVERNANCE change (workflow YAML / named CI scripts,
// no application source touched -- if src/** were touched the path would
// already classify at a higher tier via max-wins) gets the same treatment
// for the same reason: TARGETED_CI_GOVERNANCE runs only the classifier's own
// test file and the CI-trigger-governance regression suite, never the broad
// ~28,000-test application suite a workflow-only change cannot affect.
// Every other non-DOCS_ONLY tier gets the broad suite, but -- per the
// existing run_test_suite: false wiring in ci.yml/reusable-pr-validation.yml
// -- EXACTLY ONCE per PR, never twice, regardless of tier.
export const SUITE_MODES = {
  NONE: 'NONE',
  TARGETED_RECOVERY: 'TARGETED_RECOVERY',
  TARGETED_CI_GOVERNANCE: 'TARGETED_CI_GOVERNANCE',
  BROAD_NON_DB: 'BROAD_NON_DB',
};

function suiteModeForTier(tier) {
  if (tier === TIERS.DOCS_ONLY) return SUITE_MODES.NONE;
  if (tier === TIERS.RECOVERY_INFRA_ONLY) return SUITE_MODES.TARGETED_RECOVERY;
  if (tier === TIERS.CI_GOVERNANCE) return SUITE_MODES.TARGETED_CI_GOVERNANCE;
  return SUITE_MODES.BROAD_NON_DB;
}

// CI-MIN-01 owner correction: dbRequired is the SINGLE authoritative signal
// that drives ci.yml's own pre-merge `db-verify` job (throwaway Postgres +
// migrate deploy + *.db.test.ts). There is no second, separate static
// path-filter system deciding DB risk -- db-verification.yml's own
// pull_request trigger was removed for exactly this reason (one classifier,
// one decision). True for DB_RUNTIME (prisma schema/migrations,
// `*.db.test.ts` files anywhere, DB-interacting scripts, a DB-related
// package.json/package-lock.json dependency change) and for UNKNOWN
// (unrecognized path -- "ambiguous -> FULL" applies to the DB dimension
// exactly as it already does to the non-DB suite dimension; this repo's
// classifier has never treated an unrecognized path as cheap on any other
// axis, and DB risk is not an exception). Deliberately narrower than the
// (now-unused-in-practice) runMainIntegrationFullSuite flag below: a
// SECURITY_AUTH_TENANCY_ENTITLEMENT-tier change (e.g. src/lib/auth/**) does
// NOT by itself require the throwaway-Postgres job -- only an actual
// DB_RUNTIME-tier path (which includes every *.db.test.ts file, so an auth
// change that also touches its own DB test still classifies DB_RUNTIME via
// max-wins).
function dbRequiredForTier(tier) {
  return tier === TIERS.DB_RUNTIME || tier === TIERS.UNKNOWN;
}

/**
 * Classify a full changed-file list for a PR/push. Returns:
 *   - tier: the numeric max tier across all paths (empty list -> DOCS_ONLY,
 *     i.e. a genuinely empty diff, which should not occur in practice)
 *   - tierName: its string name
 *   - perPath: map of path -> its own tier (for audit/debugging)
 *   - suiteMode: 'NONE' | 'TARGETED_RECOVERY' | 'TARGETED_CI_GOVERNANCE' |
 *     'BROAD_NON_DB' -- what the PR-side non-DB validation should run (see
 *     SUITE_MODES above)
 *   - runNonDbSuite: true whenever suiteMode is not 'NONE' (kept for
 *     backward-compatible callers that only care about "was anything run")
 *   - dbRequired: true iff ci.yml's own db-verify job must run pre-merge on
 *     this PR (see dbRequiredForTier above) -- the sole DB-risk signal
 *   - runMainIntegrationFullSuite: true for SECURITY/DB_RUNTIME/UNKNOWN tiers.
 *     Retained for backward compatibility and for main-integration.yml's own
 *     (now workflow_dispatch-only) push-diff classification path; no longer
 *     consulted by ci.yml, which uses dbRequired instead.
 */
export function classifyChangeSet(paths, options = {}) {
  if (paths.length === 0) {
    return {
      tier: TIERS.DOCS_ONLY,
      tierName: 'DOCS_ONLY',
      perPath: {},
      suiteMode: SUITE_MODES.NONE,
      runNonDbSuite: false,
      dbRequired: false,
      runMainIntegrationFullSuite: false,
    };
  }
  // CI-MIN-01: package.json/package-lock.json use content-aware
  // classification INSTEAD OF the blind path rule, but only when the caller
  // actually supplied it -- absent that, behavior is unchanged from before
  // (blind UNKNOWN via classifyPath). package.json's tier is precomputed by
  // the caller via classifyPackageJsonChange (a robust git-show + JSON
  // comparison, not diff-hunk text parsing -- see that function's own
  // comment for why). package-lock.json still uses its own diff text, kept
  // fail-closed exactly as before.
  const packageSegments = splitUnifiedDiffByFile(options.packageDiffText);
  const perPath = {};
  let maxTier = TIERS.DOCS_ONLY;
  for (const p of paths) {
    let t;
    if (p === 'package.json' && options.packageJsonTier != null) {
      t = options.packageJsonTier;
    } else if (p === 'package-lock.json' && packageSegments['package-lock.json']) {
      t = classifyPackageLockDiffText(packageSegments['package-lock.json']);
    } else {
      t = classifyPath(p);
    }
    perPath[p] = TIER_NAMES[t];
    maxTier = Math.max(maxTier, t);
  }
  const suiteMode = suiteModeForTier(maxTier);
  return {
    tier: maxTier,
    tierName: TIER_NAMES[maxTier],
    perPath,
    suiteMode,
    runNonDbSuite: suiteMode !== SUITE_MODES.NONE,
    dbRequired: dbRequiredForTier(maxTier),
    runMainIntegrationFullSuite: maxTier >= TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT,
  };
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

/**
 * Resolve the unified diff text for package-lock.json in a before/after
 * range, but only when it's actually in the changed-file list -- avoids a
 * wasted git invocation on every classify run. package.json is NOT included
 * here any more (owner correction, CI-MIN-01): it is classified via
 * classifyPackageJsonChange's git-show + JSON comparison instead, since
 * diff-hunk text cannot reliably reveal which JSON section a change falls
 * in (see that function's own comment). Returns null (never throws) on any
 * git failure or an unusable range; callers already treat null/missing diff
 * text as "fall back to the conservative path-only rule", which preserves
 * "ambiguous -> FULL".
 */
export function resolvePackageDiffText({ before, after, cwd, paths }) {
  const targets = ['package-lock.json'].filter((p) => paths.includes(p));
  if (targets.length === 0) return null;
  if (!before || !after || before === ZERO_SHA || after === ZERO_SHA) return null;
  try {
    return execFileSync('git', ['diff', before, after, '--', ...targets], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Resolve the changed-file list for a push event's before/after commit
 * range using git's plain two-commit diff form (`git diff <before> <after>`,
 * NOT the three-dot `before...after` merge-base form). The plain form
 * compares the two commits' trees directly, so it always covers every file
 * touched across the ENTIRE pushed range regardless of how many commits are
 * in it -- an earlier commit in a multi-commit push that touches
 * prisma/schema.prisma is not hidden by a later commit that only touches
 * docs, because the diff is against the tree, not against any individual
 * commit's own parent.
 *
 * ROOT-CAUSE FIX this closes (owner correction pass, 2026-08-29): the
 * classify job intentionally does NOT diff against `origin/main` (e.g.
 * `git diff origin/main...HEAD`), because after checkout in a job triggered
 * BY that same push, `origin/main` may already resolve to the new HEAD --
 * producing an empty diff and silently misclassifying a real
 * runtime/database/security change as cheap. Using the push event's own
 * `before`/`after` SHAs directly sidesteps that failure mode entirely.
 *
 * Returns null (never an empty array as a false "nothing changed" signal)
 * if the range cannot be reliably determined -- callers MUST treat null as
 * "classify UNKNOWN, force full validation", never as "no changes". This
 * covers: a missing/zero before-SHA (new branch, or a rewritten history
 * where the previous tip is unreachable) and any git failure resolving the
 * range (e.g. a shallow checkout that doesn't contain `before`).
 */
export function resolvePushDiffFiles({ before, after, cwd }) {
  if (!before || !after || before === ZERO_SHA || after === ZERO_SHA) {
    return null;
  }
  try {
    const output = execFileSync('git', ['diff', '--name-only', before, after], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Classify a push event end-to-end: resolves the before/after diff and
 * classifies the result. Falls back to UNKNOWN (forcing full validation on
 * both the non-DB suite and Main Integration's DB suite) if the range
 * cannot be resolved at all -- "ambiguous -> FULL" applies to the diff
 * computation itself, not just to individual file paths.
 */
export function classifyPushEvent({ before, after, cwd }) {
  const files = resolvePushDiffFiles({ before, after, cwd });
  if (files === null) {
    return {
      tier: TIERS.UNKNOWN,
      tierName: 'UNKNOWN',
      perPath: {},
      suiteMode: SUITE_MODES.BROAD_NON_DB,
      runNonDbSuite: true,
      dbRequired: true,
      runMainIntegrationFullSuite: true,
      pushDiffUnresolvable: true,
    };
  }
  const packageDiffText = resolvePackageDiffText({ before, after, cwd, paths: files });
  const packageJsonTier = files.includes('package.json')
    ? classifyPackageJsonChange({ before, after, cwd })
    : undefined;
  return classifyChangeSet(files, { packageDiffText, packageJsonTier });
}

// CLI entry point.
//   Non-push mode (PR): node scripts/ci-risk-classifier.mjs [--base <sha> --head <sha>] < changed-files.txt
//   Push mode:          node scripts/ci-risk-classifier.mjs --push <before> <after>
// Used by ci.yml (non-push mode) and main-integration.yml (push mode).
// --base/--head (PR mode only) let the CLI compute package.json's tier via
// classifyPackageJsonChange (git show + JSON comparison) and
// package-lock.json's own diff text for content-aware classification (see
// resolvePackageDiffText) -- optional and backward compatible: omitting them
// keeps the prior blind-UNKNOWN behavior for those two files.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  let result;
  if (args[0] === '--push') {
    result = classifyPushEvent({ before: args[1], after: args[2] });
  } else {
    let base, head;
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--base') base = args[++i];
      else if (args[i] === '--head') head = args[++i];
      else rest.push(args[i]);
    }
    let paths = rest;
    if (paths.length === 0) {
      const stdin = readFileSync(0, 'utf8');
      paths = stdin.split('\n').map((l) => l.trim()).filter(Boolean);
    }
    const packageDiffText =
      base && head ? resolvePackageDiffText({ before: base, after: head, cwd: process.cwd(), paths }) : null;
    const packageJsonTier =
      base && head && paths.includes('package.json')
        ? classifyPackageJsonChange({ before: base, after: head, cwd: process.cwd() })
        : undefined;
    result = classifyChangeSet(paths, { packageDiffText, packageJsonTier });
  }
  console.error(JSON.stringify(result, null, 2));
  console.log(`risk_class=${result.tierName}`);
  console.log(`suite_mode=${result.suiteMode}`);
  console.log(`run_non_db_suite=${result.runNonDbSuite}`);
  console.log(`db_required=${result.dbRequired}`);
  console.log(`run_main_integration_full_suite=${result.runMainIntegrationFullSuite}`);
}
