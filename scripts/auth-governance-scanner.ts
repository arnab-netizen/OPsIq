#!/usr/bin/env node

/**
 * AUTH GOVERNANCE SCANNER
 * Enforces canonical auth patterns across all API routes.
 * FAILS CI on violations.
 *
 * ONE sanctioned exception to the "no raw Response.json(...,
 * {status:401|403})" rule: a call to publicAdmissionRefusal()
 * (@/lib/public-admission-response) from a route whose own derived API path
 * is registered in PUBLIC_ROUTE_EXEMPTIONS
 * (@/domain/constants/public-route-exemptions.ts) — see PUBLIC_ADMISSION
 * rule below and src/__tests__/security/auth-governance-scanner.test.ts's
 * fixture tests, which prove both that this is not a general regex escape
 * (an unregistered route calling the same function still fails) and that an
 * ordinary Response.json(...401|403) literal anywhere still fails exactly as
 * before. This does not apply to UnauthorizedError/ForbiddenError-shaped
 * decisions (identity/workspace/capability) — those remain governed by
 * withCanonicalEnforcement exactly as this scanner already requires.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PUBLIC_ROUTE_EXEMPTIONS } from '../src/domain/constants/public-route-exemptions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Violation {
  file: string;
  line: number;
  pattern: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
}

const apiDir = path.join(__dirname, '../src/app/api');

const EXEMPTED_ROUTES = new Set<string>(Object.values(PUBLIC_ROUTE_EXEMPTIONS).flat() as string[]);

// Rules that need only the current line to evaluate.
const LINE_RULES = [
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
    // NOTE: deliberately unconditional — this rule does not special-case
    // publicAdmissionRefusal() because that function's own implementation
    // does not live in a route.ts file (it lives in
    // @/lib/public-admission-response.ts, outside apiDir, so this scanner
    // never sees its body at all). A route.ts that inlines its own
    // Response.json(...,{status:401|403}) instead of calling the sanctioned
    // primitive is still a violation, full stop.
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

// Any call to publicAdmissionRefusal(...), regardless of what its first argument looks like.
const PUBLIC_ADMISSION_ANY_CALL_PATTERN = /publicAdmissionRefusal\s*\(/;
// publicAdmissionRefusal("<route>", ...) — captures the literal first-arg string, when there is one.
const PUBLIC_ADMISSION_CALL_PATTERN = /publicAdmissionRefusal\(\s*["'`]([^"'`]+)["'`]/;

/**
 * Pure, filesystem-free scan of one route.ts file's content.
 *
 * @param content the file's source text
 * @param apiRoutePath the route's own derived API path, e.g. "/api/auth/signup"
 *   (no trailing "/route.ts", matches PUBLIC_ROUTE_EXEMPTIONS entries exactly)
 * @param displayPath the path to report in violations (kept separate from
 *   apiRoutePath so callers can pass whatever relative path they like)
 */
export function scanRouteFileContent(
  content: string,
  apiRoutePath: string,
  displayPath: string = apiRoutePath
): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split('\n');
  const routeIsExempted = EXEMPTED_ROUTES.has(apiRoutePath);

  lines.forEach((line, idx) => {
    for (const rule of LINE_RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: displayPath,
          line: idx + 1,
          pattern: rule.name,
          severity: rule.severity,
          message: rule.message,
        });
      }
    }

    if (PUBLIC_ADMISSION_ANY_CALL_PATTERN.test(line)) {
      const callMatch = line.match(PUBLIC_ADMISSION_CALL_PATTERN);
      if (!callMatch) {
        // A call whose first argument isn't a literal string cannot be
        // statically verified at all — silently letting it through would be
        // exactly the "generic escape hatch" this rule exists to prevent, so
        // it fails the same as an unregistered route rather than being
        // ignored. Production call sites must always pass their route as an
        // inline literal (see signup/route.ts, beta-requests/route.ts).
        violations.push({
          file: displayPath,
          line: idx + 1,
          pattern: 'publicAdmissionRefusal() non-literal route argument',
          severity: 'critical',
          message: 'publicAdmissionRefusal()\'s first argument must be an inline string literal (e.g. "/api/auth/signup"), not a variable or expression, so this scanner can statically verify it against PUBLIC_ROUTE_EXEMPTIONS.',
        });
      } else {
        const claimedRoute = callMatch[1];
        if (claimedRoute !== apiRoutePath) {
          violations.push({
            file: displayPath,
            line: idx + 1,
            pattern: 'publicAdmissionRefusal() route mismatch',
            severity: 'critical',
            message: `publicAdmissionRefusal() called with route="${claimedRoute}", but this file's own derived API path is "${apiRoutePath}". The argument must be this file's own route.`,
          });
        } else if (!routeIsExempted) {
          violations.push({
            file: displayPath,
            line: idx + 1,
            pattern: 'publicAdmissionRefusal() from non-exempted route',
            severity: 'critical',
            message: `publicAdmissionRefusal() called from "${apiRoutePath}", which is not registered in PUBLIC_ROUTE_EXEMPTIONS (src/domain/constants/public-route-exemptions.ts). Register it there with a documented reason, or use UnauthorizedError/ForbiddenError via withCanonicalEnforcement if this is actually an identity/workspace/capability decision.`,
          });
        }
      }
    }
  });

  return violations;
}

/** filepath under apiDir -> its derived API route path, e.g. "/api/auth/signup". Mirrors route-scanner.test.ts's derivation exactly. */
function deriveApiRoutePath(filepath: string): string {
  const relFromApiDir = path.relative(apiDir, filepath).split(path.sep).join('/');
  return `/api/${relFromApiDir.replace(/\/route\.ts$/, '')}`;
}

function scanFile(filepath: string): Violation[] {
  const displayPath = filepath.replace(apiDir, '');
  const content = fs.readFileSync(filepath, 'utf8');
  return scanRouteFileContent(content, deriveApiRoutePath(filepath), displayPath);
}

function scanDirectory(dir: string): Violation[] {
  const found: Violation[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullpath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...scanDirectory(fullpath));
    } else if (entry.name === 'route.ts') {
      found.push(...scanFile(fullpath));
    }
  }
  return found;
}

function runCli(): void {
  console.log('=== AUTH GOVERNANCE SCANNER ===\n');
  const violations = scanDirectory(apiDir);

  if (violations.length === 0) {
    console.log('✅ All routes comply with auth governance\n');
    process.exit(0);
  }

  console.log(`❌ Found ${violations.length} governance violations:\n`);

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
3. Replace Response.json(401/403) with thrown errors (or, for a route registered in
   PUBLIC_ROUTE_EXEMPTIONS refusing on public product/admission state rather than an
   identity/workspace/capability decision, publicAdmissionRefusal() from
   @/lib/public-admission-response)
4. Replace direct getSession() with withCanonicalEnforcement

CI WILL FAIL until all critical violations are resolved.
`);

  process.exit(critical.length > 0 ? 1 : 0);
}

// Only run the CLI when this file is executed directly (tsx scripts/auth-governance-scanner.ts),
// never when scanRouteFileContent is imported for testing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
