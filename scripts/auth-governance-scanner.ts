#!/usr/bin/env node

/**
 * AUTH GOVERNANCE SCANNER
 * Enforces canonical auth patterns across all API routes.
 * FAILS CI on violations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Violation {
  file: string;
  line: number;
  pattern: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
}

const violations: Violation[] = [];

const apiDir = path.join(__dirname, '../src/app/api');

// Rules
const rules = [
  {
    name: 'withRequestContext',
    severity: 'critical' as const,
    pattern: /export const.*= withRequestContext/,
    message: 'withRequestContext is forbidden. Use withCanonicalEnforcement from @/lib/canonical-route-enforcement.',
  },
  {
    name: 'withEnforcementFull in routes',
    severity: 'high' as const,
    pattern: /export const.*= withEnforcementFull/,
    message: 'withEnforcementFull is legacy. Use withCanonicalEnforcement from @/lib/canonical-route-enforcement.',
  },
  {
    name: 'Error("Unauthorized")',
    severity: 'critical' as const,
    pattern: /throw new Error\s*\(\s*['"].*[Uu]nauthorized/,
    message: 'throw UnauthorizedError (import from @/infra/errors)',
  },
  {
    name: 'Response.json(...401)',
    severity: 'critical' as const,
    pattern: /return Response\.json.*status.*40[13]/,
    message: 'throw UnauthorizedError/ForbiddenError, never Response.json with 401/403',
  },
  {
    name: 'direct getSession()',
    severity: 'high' as const,
    pattern: /getSession\(\)/,
    message: 'Use withCanonicalEnforcement instead of calling getSession() directly in routes.',
  },
];

function scanFile(filepath: string): void {
  const relpath = filepath.replace(apiDir, '');
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    rules.forEach((rule) => {
      if (rule.pattern.test(line)) {
        violations.push({
          file: relpath,
          line: idx + 1,
          pattern: rule.name,
          severity: rule.severity,
          message: rule.message,
        });
      }
    });
  });
}

function scanDirectory(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullpath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullpath);
    } else if (entry.name === 'route.ts') {
      scanFile(fullpath);
    }
  }
}

// Run scan
console.log('=== AUTH GOVERNANCE SCANNER ===\n');
scanDirectory(apiDir);

if (violations.length === 0) {
  console.log('✅ All routes comply with auth governance\n');
  process.exit(0);
} else {
  console.log(`❌ Found ${violations.length} governance violations:\n`);

  // Group by severity
  const critical = violations.filter((v) => v.severity === 'critical');
  const high = violations.filter((v) => v.severity === 'high');
  const medium = violations.filter((v) => v.severity === 'medium');

  if (critical.length > 0) {
    console.log(`CRITICAL (${critical.length}):`);
    critical.forEach((v) => {
      console.log(`  ${v.file}:${v.line} - ${v.message}`);
    });
    console.log();
  }

  if (high.length > 0) {
    console.log(`HIGH (${high.length}):`);
    high.forEach((v) => {
      console.log(`  ${v.file}:${v.line} - ${v.message}`);
    });
    console.log();
  }

  if (medium.length > 0) {
    console.log(`MEDIUM (${medium.length}):`);
    medium.forEach((v) => {
      console.log(`  ${v.file}:${v.line} - ${v.message}`);
    });
    console.log();
  }

  console.log(`\n📊 SUMMARY:
- Critical violations: ${critical.length}
- High violations: ${high.length}
- Medium violations: ${medium.length}
- Total violations: ${violations.length}

REMEDIATION:
1. Replace withRequestContext/withEnforcementFull with withCanonicalEnforcement (from @/lib/canonical-route-enforcement)
2. Replace Error() with UnauthorizedError/ForbiddenError
3. Replace Response.json(401/403) with thrown errors
4. Replace direct getSession() with withCanonicalEnforcement

CI WILL FAIL until all critical violations are resolved.
`);

  process.exit(critical.length > 0 ? 1 : 0);
}
