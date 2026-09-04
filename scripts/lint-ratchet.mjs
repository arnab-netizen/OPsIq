#!/usr/bin/env node

/**
 * LINT RATCHET: Prevent lint debt increase and require changed files to be clean
 *
 * Fail if:
 * - ESLint crashes
 * - Error count increases
 * - Warning count increases
 * - Changed files have lint errors
 * - The lint result is missing, malformed, or stale
 *
 * ── One traversal per run ────────────────────────────────────────────────────
 * ESLint over this repository takes ~90s locally and several minutes on a CI
 * runner. This script used to shell out to `npm run lint` unconditionally, while
 * the CI lint job ALSO ran `npm run lint` in a preceding step whose result was
 * discarded (`continue-on-error: true`). One job therefore paid for two complete
 * traversals inside a 10-minute cap, and overran it non-deterministically: jobs
 * 100920174479, 100939368880, 100945566301 and 100956290102 each ran 10m15s-10m18s
 * and were killed mid-ratchet. GitHub reports a timeout as `cancelled`, and
 * branch-protection fails closed on it, so a green lint result surfaced as a red
 * required check on four separate occasions.
 *
 * The fix is --from-result: CI runs ESLint once, writes its JSON report, and hands
 * that report here instead of paying for a second traversal. Run standalone with no
 * arguments this script still performs its own single traversal, so
 * `npm run lint:ratchet` keeps working with no intermediate file to stage by hand.
 *
 * Usage:
 *   node scripts/lint-ratchet.mjs                      # runs ESLint itself (once)
 *   node scripts/lint-ratchet.mjs --from-result <path> # consumes an existing report
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASELINE_FILE = '.claude/lint-baseline.json';
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function fail(message, detail) {
  console.error(`LINT_RATCHET_FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// ── Arguments ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const options = { fromResult: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--from-result') {
      options.fromResult = argv[i + 1] ?? null;
      if (!options.fromResult || options.fromResult.startsWith('--')) {
        fail('--from-result requires a path to an ESLint JSON report');
      }
      i += 1;
    } else if (token.startsWith('--from-result=')) {
      options.fromResult = token.slice('--from-result='.length);
      if (!options.fromResult) fail('--from-result requires a path to an ESLint JSON report');
    } else {
      fail(`unrecognized argument '${token}'`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

// ── ESLint JSON report ───────────────────────────────────────────────────────
// A single traversal, either performed here or handed in by the caller. Writing
// through -o rather than stdout keeps npm's own banner out of the JSON.
function runEslintToFile(outputPath) {
  try {
    execSync(`npm run lint -- -f json -o ${JSON.stringify(outputPath)}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // ESLint exits 1 when it reports errors, which is the normal state of this
    // repository while the baseline is non-zero. Anything above 1 is a crash, and
    // a crash must never be read as "no new lint debt".
    const status = error.status ?? 1;
    if (status > 1) {
      fail('ESLint crashed or failed to execute', (error.stderr || '') + (error.stdout || ''));
    }
  }
}

// Every rejection below is a refusal, never a pass. A report this script cannot
// read, cannot parse, or cannot trust says nothing about lint debt, and treating
// silence as "no regression" is exactly the hole the ratchet exists to close.
function loadReport(reportPath, { checkStaleness }) {
  if (!fs.existsSync(reportPath)) {
    fail(`lint result not found: ${reportPath}`);
  }

  const raw = fs.readFileSync(reportPath, 'utf-8');
  if (!raw.trim()) {
    fail(`lint result is empty: ${reportPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`lint result is not valid JSON: ${reportPath}`, error.message);
  }

  if (!Array.isArray(parsed)) {
    fail(`lint result is not an ESLint JSON array: ${reportPath}`);
  }
  if (parsed.length === 0) {
    fail(
      `lint result contains no linted files: ${reportPath}. A real traversal always `
      + 'reports at least one file, so an empty report means ESLint never ran or ran '
      + 'against the wrong tree.',
    );
  }

  for (const entry of parsed) {
    if (
      !entry || typeof entry !== 'object'
      || typeof entry.filePath !== 'string'
      || typeof entry.errorCount !== 'number'
      || typeof entry.warningCount !== 'number'
      || !Array.isArray(entry.messages)
    ) {
      fail(
        `lint result has a malformed entry: ${reportPath}. Expected ESLint JSON objects `
        + 'carrying filePath, errorCount, warningCount and messages.',
      );
    }
  }

  if (checkStaleness) assertReportIsFresh(reportPath, parsed);

  return parsed;
}

// A report produced before the current sources were last edited describes a tree
// that no longer exists. Accepting it would let a stale green result gate a commit
// that was never linted.
function assertReportIsFresh(reportPath, results) {
  const repoRoot = process.cwd();
  const outside = results.find((entry) => !path.resolve(entry.filePath).startsWith(repoRoot));
  if (outside) {
    fail(
      `lint result was produced against another checkout: ${reportPath} references `
      + `${outside.filePath}, which is outside ${repoRoot}.`,
    );
  }

  const reportMtimeMs = fs.statSync(reportPath).mtimeMs;
  let newestSource = null;
  let newestSourceMtimeMs = 0;

  for (const file of trackedSourceFiles()) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue; // Tracked but absent from the worktree; nothing to compare.
    }
    if (stat.mtimeMs > newestSourceMtimeMs) {
      newestSourceMtimeMs = stat.mtimeMs;
      newestSource = file;
    }
  }

  if (newestSource && newestSourceMtimeMs > reportMtimeMs) {
    fail(
      `lint result is stale: ${reportPath} predates ${newestSource}. Re-run ESLint `
      + 'against the current tree; a report older than the sources it describes cannot '
      + 'show whether those sources introduced lint debt.',
    );
  }
}

function trackedSourceFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--', '*.ts', '*.tsx', '*.js', '*.jsx'], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── Baseline ─────────────────────────────────────────────────────────────────
if (!fs.existsSync(BASELINE_FILE)) {
  fail(`Baseline file not found: ${BASELINE_FILE}`);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
console.log(
  `Loaded baseline: ${baseline.baseline_error_count} errors, `
  + `${baseline.baseline_warning_count} warnings`,
);

// ── Acquire the single lint traversal ────────────────────────────────────────
let results;
let temporaryReport = null;

if (options.fromResult) {
  console.log(`Reading lint result from ${options.fromResult} (no second ESLint run)...`);
  results = loadReport(options.fromResult, { checkStaleness: true });
} else {
  console.log('Running ESLint once...');
  temporaryReport = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'lint-ratchet-')),
    'eslint-report.json',
  );
  runEslintToFile(temporaryReport);
  // Freshly produced in this process, so staleness cannot apply.
  results = loadReport(temporaryReport, { checkStaleness: false });
}

try {
  // ── Current state ──────────────────────────────────────────────────────────
  const currentErrors = results.reduce((sum, entry) => sum + entry.errorCount, 0);
  const currentWarnings = results.reduce((sum, entry) => sum + entry.warningCount, 0);

  console.log(`Current state: ${currentErrors} errors, ${currentWarnings} warnings`);
  console.log(
    `Baseline state: ${baseline.baseline_error_count} errors, `
    + `${baseline.baseline_warning_count} warnings`,
  );

  let ratchetPass = true;
  const failures = [];

  if (currentErrors > baseline.baseline_error_count) {
    failures.push(`Error count increased: ${baseline.baseline_error_count} → ${currentErrors}`);
    ratchetPass = false;
  }

  if (currentWarnings > baseline.baseline_warning_count) {
    failures.push(`Warning count increased: ${baseline.baseline_warning_count} → ${currentWarnings}`);
    ratchetPass = false;
  }

  // ── Changed files must be clean ────────────────────────────────────────────
  const changedFilesResult = (() => {
    try {
      return execSync('git diff --name-only origin/main...HEAD', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      return '';
    }
  })();

  const changedFiles = changedFilesResult
    .trim()
    .split('\n')
    .filter((f) => f && SOURCE_EXTENSIONS.some((ext) => f.endsWith(ext)));

  console.log(`Changed files: ${changedFiles.length}`);

  if (changedFiles.length > 0) {
    // Structured messages, not scraped console text: severity 2 is an error, and the
    // file it belongs to is the record that carries it. The previous line-parsing
    // approach could silently attribute nothing when the formatter's layout shifted.
    const errorsByFile = new Map();
    for (const entry of results) {
      const errors = entry.messages.filter((m) => m.severity === 2);
      if (errors.length === 0) continue;
      errorsByFile.set(path.relative(process.cwd(), entry.filePath), errors);
    }

    const changedFilesWithErrors = changedFiles.filter((f) => errorsByFile.has(f));
    if (changedFilesWithErrors.length > 0) {
      failures.push(`Changed files have lint errors: ${changedFilesWithErrors.join(', ')}`);
      for (const file of changedFilesWithErrors) {
        const errors = errorsByFile.get(file);
        console.log(`  ${file}: ${errors.length} error(s)`);
        for (const error of errors.slice(0, 10)) {
          console.log(`    ${error.line}:${error.column}  ${error.ruleId ?? 'unknown'}  ${error.message}`);
        }
      }
      ratchetPass = false;
    } else {
      console.log('✓ All changed files are lint-clean');
    }
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  if (ratchetPass) {
    console.log('\nLINT_RATCHET_PASS');
    console.log(`  baseline_error_count: ${baseline.baseline_error_count}`);
    console.log(`  current_error_count: ${currentErrors}`);
    console.log(`  baseline_warning_count: ${baseline.baseline_warning_count}`);
    console.log(`  current_warning_count: ${currentWarnings}`);
    console.log(`  changed_files: ${changedFiles.length}`);
    console.log(`  changed_file_lint_errors: 0`);
    process.exit(0);
  } else {
    console.log('\nLINT_RATCHET_FAIL');
    console.log(`  Failures:`);
    failures.forEach((f) => console.log(`    - ${f}`));
    process.exit(1);
  }
} finally {
  if (temporaryReport) {
    fs.rmSync(path.dirname(temporaryReport), { recursive: true, force: true });
  }
}
