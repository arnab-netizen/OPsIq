#!/usr/bin/env node

/**
 * LINT RATCHET: Prevent lint debt increase and require changed files to be clean
 *
 * Fail if:
 * - ESLint crashes
 * - Error count increases
 * - Warning count increases
 * - Changed files have lint errors
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function runCommand(cmd) {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { output, exitCode: 0 };
  } catch (error) {
    return { output: error.stdout || '', stderr: error.stderr || '', exitCode: error.status };
  }
}

// Load baseline
const baselineFile = '.claude/lint-baseline.json';
if (!fs.existsSync(baselineFile)) {
  console.error(`LINT_RATCHET_FAIL: Baseline file not found: ${baselineFile}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf-8'));
console.log(`Loaded baseline: ${baseline.baseline_error_count} errors, ${baseline.baseline_warning_count} warnings`);

// Run lint
console.log('Running npm run lint...');
const lintResult = runCommand('npm run lint');

if (lintResult.exitCode > 1) {
  console.error('LINT_RATCHET_FAIL: ESLint crashed or failed to execute');
  console.error(lintResult.stderr);
  process.exit(1);
}

// Parse current state
const fullLog = lintResult.output + (lintResult.stderr || '');
const summaryMatch = fullLog.match(/✖\s+(\d+)\s+problems\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);

if (!summaryMatch) {
  console.error('LINT_RATCHET_FAIL: Could not parse lint summary from output');
  console.error(fullLog.slice(-500));
  process.exit(1);
}

const [, totalProblems, currentErrors, currentWarnings] = summaryMatch.map(Number);

console.log(`Current state: ${currentErrors} errors, ${currentWarnings} warnings`);
console.log(`Baseline state: ${baseline.baseline_error_count} errors, ${baseline.baseline_warning_count} warnings`);

// Check ratchet
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

// Get changed files
const changedFilesResult = runCommand('git diff --name-only origin/main...HEAD');
const changedFiles = changedFilesResult.output
  .trim()
  .split('\n')
  .filter(f => f && (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')));

console.log(`Changed files: ${changedFiles.length}`);

// Check if changed files have lint errors
if (changedFiles.length > 0) {
  const lines = fullLog.split('\n');
  let currentFile = null;
  const errorsByFile = {};

  for (const line of lines) {
    const fileMatch = line.match(/^(.+\.(ts|tsx|js|jsx|mjs|cjs))$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    const m = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([@a-zA-Z0-9_\-\/]+)\s*$/);
    if (m && m[3] === 'error' && currentFile) {
      if (!errorsByFile[currentFile]) errorsByFile[currentFile] = [];
      errorsByFile[currentFile].push({ line: m[1], col: m[2], rule: m[5] });
    }
  }

  const changedFilesWithErrors = changedFiles.filter(f => f in errorsByFile);
  if (changedFilesWithErrors.length > 0) {
    failures.push(`Changed files have lint errors: ${changedFilesWithErrors.join(', ')}`);
    changedFilesWithErrors.forEach(f => {
      console.log(`  ${f}: ${errorsByFile[f].length} error(s)`);
    });
    ratchetPass = false;
  } else {
    console.log('✓ All changed files are lint-clean');
  }
}

// Output ratchet status
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
  failures.forEach(f => console.log(`    - ${f}`));
  process.exit(1);
}
