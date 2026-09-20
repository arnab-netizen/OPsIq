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

  // ---- Tier 5: DB runtime (checked before the generic src/** rule below,
  //      order doesn't matter since we take the max, but grouped here for
  //      readability) ----
  { tier: TIERS.DB_RUNTIME, test: (p) => /^prisma\//.test(p) },
  { tier: TIERS.DB_RUNTIME, test: (p) => /\.db\.test\.ts$/.test(p) },
  { tier: TIERS.DB_RUNTIME, test: (p) =>
      /^scripts\/(seed-|reset-|migrate).*\.(ts|mjs|sh)$/.test(p) || (/migrate/i.test(p) && /^scripts\//.test(p)) },

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
      /^src\//.test(p) && p !== 'src/__tests__/scripts/backup-restore.test.ts' },
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
// UNKNOWN (max tier) by PATH ALONE, which forces runMainIntegrationFullSuite
// for ANY edit to either file -- including a pure `scripts` alias rename with
// zero dependency or runtime impact. Path alone cannot distinguish a
// scripts-only edit from a dependency change from a DB-package dependency
// change, so this needs the actual diff text. These two functions classify
// each file from its own unified diff hunk; classifyChangeSet uses them
// INSTEAD OF the blind path rule only when diff text was actually supplied
// (see resolvePackageDiffText / splitUnifiedDiffByFile below) -- callers that
// don't supply diff text keep the prior conservative UNKNOWN behavior
// unchanged, preserving "ambiguous -> FULL" whenever the diff can't be read.
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

/**
 * Classify package.json's own unified diff text. Tracks which top-level JSON
 * section (scripts / dependencies / devDependencies / ...) each added or
 * removed line falls inside via simple brace-depth tracking over the diff's
 * content lines (context ' ', added '+', removed '-'). A scripts-only change
 * classifies at APPLICATION_NON_DB (same as any other non-DB app change,
 * never the inflated UNKNOWN tier); a dependency change classifies
 * APPLICATION_NON_DB unless it touches a DB-related package, in which case it
 * classifies DB_RUNTIME. If no recognized section could be identified at all
 * (e.g. a diff format this parser doesn't understand), stays UNKNOWN --
 * ambiguous is never treated as cheap.
 */
export function classifyPackageJsonDiffText(diffText) {
  if (!diffText) return TIERS.UNKNOWN;
  let currentSection = null;
  let sectionDepth = 0;
  let touchedAnySection = false;
  let touchedDbPackage = false;

  for (const rawLine of diffText.split('\n')) {
    if (rawLine.startsWith('+++') || rawLine.startsWith('---')) continue;
    const marker = rawLine[0];
    if (marker !== ' ' && marker !== '+' && marker !== '-') continue;
    const line = rawLine.slice(1);

    if (sectionDepth === 0) {
      const sectionOpen = line.match(
        /^\s*"(scripts|dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:\s*\{/,
      );
      if (sectionOpen) {
        currentSection = sectionOpen[1];
        sectionDepth = 1;
      }
      continue;
    }

    // Inside a tracked section: naive brace counting on this content line to
    // detect the section's closing brace (package.json's own values never
    // contain literal unescaped braces at this nesting depth).
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    sectionDepth += opens - closes;

    if (marker === '+' || marker === '-') {
      touchedAnySection = true;
      if (currentSection !== 'scripts' && DB_PACKAGE_RE.test(line)) {
        touchedDbPackage = true;
      }
    }

    if (sectionDepth <= 0) {
      currentSection = null;
      sectionDepth = 0;
    }
  }

  if (!touchedAnySection) return TIERS.UNKNOWN;
  if (touchedDbPackage) return TIERS.DB_RUNTIME;
  return TIERS.APPLICATION_NON_DB;
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

/**
 * Classify a full changed-file list for a PR/push. Returns:
 *   - tier: the numeric max tier across all paths (empty list -> DOCS_ONLY,
 *     i.e. a genuinely empty diff, which should not occur in practice)
 *   - tierName: its string name
 *   - perPath: map of path -> its own tier (for audit/debugging)
 *   - suiteMode: 'NONE' | 'TARGETED_RECOVERY' | 'BROAD_NON_DB' -- what the
 *     PR-side non-DB validation should run (see SUITE_MODES above)
 *   - runNonDbSuite: true whenever suiteMode is not 'NONE' (kept for
 *     backward-compatible callers that only care about "was anything run")
 *   - runMainIntegrationFullSuite: true for SECURITY/DB_RUNTIME/UNKNOWN tiers
 */
export function classifyChangeSet(paths, options = {}) {
  if (paths.length === 0) {
    return {
      tier: TIERS.DOCS_ONLY,
      tierName: 'DOCS_ONLY',
      perPath: {},
      suiteMode: SUITE_MODES.NONE,
      runNonDbSuite: false,
      runMainIntegrationFullSuite: false,
    };
  }
  // CI-MIN-01: package.json/package-lock.json use content-aware
  // classification INSTEAD OF the blind path rule, but only when their own
  // diff text was actually supplied by the caller -- absent that, behavior
  // is unchanged from before (blind UNKNOWN via classifyPath).
  const packageSegments = splitUnifiedDiffByFile(options.packageDiffText);
  const perPath = {};
  let maxTier = TIERS.DOCS_ONLY;
  for (const p of paths) {
    let t;
    if (p === 'package.json' && packageSegments['package.json']) {
      t = classifyPackageJsonDiffText(packageSegments['package.json']);
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
    runMainIntegrationFullSuite: maxTier >= TIERS.SECURITY_AUTH_TENANCY_ENTITLEMENT,
  };
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

/**
 * Resolve the unified diff text for package.json/package-lock.json in a
 * before/after range, but only when at least one of them is actually in the
 * changed-file list -- avoids a wasted git invocation on every classify run.
 * Returns null (never throws) on any git failure or an unusable range;
 * callers already treat null/missing diff text as "fall back to the
 * conservative path-only rule", which preserves "ambiguous -> FULL".
 */
export function resolvePackageDiffText({ before, after, cwd, paths }) {
  const targets = ['package.json', 'package-lock.json'].filter((p) => paths.includes(p));
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
      runMainIntegrationFullSuite: true,
      pushDiffUnresolvable: true,
    };
  }
  const packageDiffText = resolvePackageDiffText({ before, after, cwd, paths: files });
  return classifyChangeSet(files, { packageDiffText });
}

// CLI entry point.
//   Non-push mode (PR): node scripts/ci-risk-classifier.mjs [--base <sha> --head <sha>] < changed-files.txt
//   Push mode:          node scripts/ci-risk-classifier.mjs --push <before> <after>
// Used by ci.yml (non-push mode) and main-integration.yml (push mode).
// --base/--head (PR mode only) let the CLI compute package.json/
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
    result = classifyChangeSet(paths, { packageDiffText });
  }
  console.error(JSON.stringify(result, null, 2));
  console.log(`risk_class=${result.tierName}`);
  console.log(`suite_mode=${result.suiteMode}`);
  console.log(`run_non_db_suite=${result.runNonDbSuite}`);
  console.log(`run_main_integration_full_suite=${result.runMainIntegrationFullSuite}`);
}
