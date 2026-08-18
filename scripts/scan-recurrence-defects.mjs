#!/usr/bin/env node
/**
 * Completion Factory — Recurrence Defect Scanners
 *
 * Scans for 8 defect classes that have historically caused regressions.
 * Run by CI on every PR; must exit 0 for the PR to pass.
 *
 * Defect classes:
 *  D1 — Unsafe spread order: {...userInput, server_field} where user fields can overwrite
 *  D2 — Missing canonical enforcement: route handlers without withCanonicalEnforcement
 *  D3 — Raw workspaceId from request body (not from ctx.verifiedWorkspaceId)
 *  D4 — Raw actorId from request body or query (not from ctx.verifiedActorId)
 *  D5 — Missing audit event on material mutation (create/update/delete without emitAuditEvent)
 *  D6 — DTO leakage pattern: returning Prisma result directly without DTO transform
 *  D7 — Idempotency gap: upsert/create on governed records without idempotency key check
 *  D8 — Disabled TypeScript strict checks (ts-ignore on auth/workspace enforcement paths)
 *  D9 — Sentinel/hardcoded actorId at an emitAuditEvent call site (F-AUDIT-CRON-ACTOR class):
 *       AuditEvent.actorId has a real FK to users.id; a string literal (e.g. "system",
 *       "webhook-system", a hardcoded UUID) can never be a real users row and always
 *       raises audit_events_actor_id_fkey. The canonical contract is: human -> a real
 *       actorId variable + actorType "user"; system -> actorId omitted (NULL) + actorType
 *       "system" (see src/domain/owner-budget/system-actor.ts's toAuditActor()).
 *
 * Exit codes:
 *   0 — all scans pass (or only warnings)
 *   1 — one or more blocking violations
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Directories to scan (TypeScript source only)
const SCAN_DIRS = [
  join(root, 'src', 'app', 'api'),
  join(root, 'src', 'services'),
  join(root, 'src', 'infra'),
  join(root, 'src', 'domain'),
];

// Directories to exclude
const EXCLUDE_DIRS = new Set([
  '__tests__',
  'node_modules',
  '.next',
  'generated',
]);

let violations = 0;
let warnings = 0;
let filesScanned = 0;

function fail(file, line, defect, message) {
  const rel = relative(root, file);
  console.error(`D${defect} VIOLATION: ${rel}:${line}`);
  console.error(`  ${message}`);
  violations++;
}

function warn(file, line, defect, message) {
  const rel = relative(root, file);
  console.warn(`D${defect} WARN: ${rel}:${line}`);
  console.warn(`  ${message}`);
  warnings++;
}

function walkDir(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(full, files);
    } else if (stat.isFile() && (extname(full) === '.ts' || extname(full) === '.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function readLines(file) {
  try {
    return readFileSync(file, 'utf8').split('\n');
  } catch {
    return [];
  }
}

// ─── D1: Unsafe spread order ──────────────────────────────────────────────────
// Pattern: ...body spread before server-controlled fields (workspaceId, actorId, userId)
// False positive suppressed if the spread is inside a "PublicDTO" or "toPublic" function.

function scanD1(file, lines) {
  // Pattern: server-controlled field set BEFORE ...spread of user-controlled variable
  // Only flag direct variable spreads (not property access like ...input.extraSignals)
  // ...input.anything is a property spread and likely safe — excluded by (?!\.)
  const unsafeSpread = /\.\.\.\b(body|input|data|payload)\b(?!\.)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!unsafeSpread.test(line)) continue;

    if (/\{\s*workspaceId\s*:/.test(line)) {
      // workspaceId set before spread — spread can override it
      fail(file, i + 1, 1, `Unsafe spread order: workspaceId set before ...${line.match(unsafeSpread)?.[0]} spread — use { ...input, workspaceId: server } to guarantee server value wins`);
    }
    if (/\{\s*actorId\s*:/.test(line)) {
      fail(file, i + 1, 1, `Unsafe spread order: actorId set before ...${line.match(unsafeSpread)?.[0]} spread`);
    }
    if (/\{\s*userId\s*:/.test(line)) {
      fail(file, i + 1, 1, `Unsafe spread order: userId set before ...${line.match(unsafeSpread)?.[0]} spread`);
    }
  }
}

// ─── D2: Missing canonical enforcement in route handlers ─────────────────────
// Route files (src/app/api/**) must use withCanonicalEnforcement or withAuth
// if they write to the DB (POST/PUT/PATCH/DELETE handlers).

function scanD2(file, lines) {
  if (!file.includes(join('src', 'app', 'api'))) return;

  const content = lines.join('\n');
  const hasMutation = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(content);
  if (!hasMutation) return;

  const hasCanonical = /withCanonicalEnforcement|withAuth|enforceWorkspaceScoping/.test(content);
  if (!hasCanonical) {
    warn(file, 1, 2, `Route has mutation handler (POST/PUT/PATCH/DELETE) but no withCanonicalEnforcement/withAuth found — verify workspace+auth enforcement manually`);
  }
}

// ─── D3: Raw workspaceId from request body ────────────────────────────────────
// Pattern: body.workspaceId or params.workspaceId used directly without ctx.verifiedWorkspaceId
// In service files, params.workspaceId is a typed function-parameter object (not HTTP route params);
// only body.workspaceId is a genuine violation there. Route handlers must not use either.

function scanD3(file, lines) {
  const isApiRoute = file.includes(join('src', 'app', 'api'));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasBody = /body\.workspaceId\b/.test(line);
    const hasParams = /params\.workspaceId\b/.test(line);
    if (!hasBody && !hasParams) continue;
    // In service files, params.workspaceId is a validated function argument — not a violation
    if (!isApiRoute && hasParams && !hasBody) continue;
    // Allow in DTO validation / Zod schema definitions
    if (/z\.|schema|zodiac|Schema|interface|type\s+\w/.test(line)) continue;
    // Allow in test files
    if (file.includes('__tests__') || file.includes('.test.')) continue;
    fail(file, i + 1, 3, `body.workspaceId or params.workspaceId used directly — use ctx.verifiedWorkspaceId instead`);
  }
}

// ─── D4: Raw actorId from request body ───────────────────────────────────────

function scanD4(file, lines) {
  const isApiRoute = file.includes(join('src', 'app', 'api'));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasBody = /body\.actorId\b|body\.userId\b/.test(line);
    const hasParams = /params\.actorId\b/.test(line);
    if (!hasBody && !hasParams) continue;
    // In service files, params.actorId is a validated function argument — not a violation
    if (!isApiRoute && hasParams && !hasBody) continue;
    if (/z\.|schema|Schema|interface|type\s+\w/.test(line)) continue;
    if (file.includes('__tests__') || file.includes('.test.')) continue;
    fail(file, i + 1, 4, `body.actorId/userId used directly — use ctx.verifiedActorId instead`);
  }
}

// ─── D5: Missing audit event on material mutation ────────────────────────────
// Service files with create/update/delete operations should call emitAuditEvent.
// This is a heuristic — only flags if NO emitAuditEvent appears in the entire file.

function scanD5(file, lines) {
  if (!file.includes(join('src', 'services'))) return;

  const content = lines.join('\n');
  const hasMutation = /prisma\.\w+\.(create|update|delete|upsert|deleteMany|updateMany)\(/.test(content);
  if (!hasMutation) return;

  const hasAudit = /emitAuditEvent|auditEvent\.create|AUDIT_EVENTS/.test(content);
  if (!hasAudit) {
    warn(file, 1, 5, `Service file has Prisma mutations but no emitAuditEvent call found — verify audit coverage`);
  }
}

// ─── D6: DTO leakage — direct Prisma result return ───────────────────────────
// Pattern: `return await prisma.xyz.findMany(...)` directly from a route handler
// without going through a DTO transform function.

function scanD6(file, lines) {
  if (!file.includes(join('src', 'app', 'api'))) return;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/return\s+await\s+(?:prisma|db)\.\w+\.(findMany|findFirst|findUnique)\(/.test(line)) {
      fail(file, i + 1, 6, `Direct Prisma result returned from route handler — must pass through DTO transform (toPublicXxxDTO)`);
    }
  }
}

// ─── D7: Idempotency gap on governed records ──────────────────────────────────
// Pattern: prisma.alert.create / prisma.risk.create without idempotencyRecord check nearby
// Heuristic: if file has alert/risk create without idempotencyRecord or upsert nearby.

function scanD7(file, lines) {
  const content = lines.join('\n');

  const governedModels = ['alert', 'risk', 'approvalRequest', 'businessConditionProfile'];
  for (const model of governedModels) {
    const createPattern = new RegExp(`prisma\\.${model}\\.create\\(`, 'i');
    if (!createPattern.test(content)) continue;

    const hasIdempotency = /idempotencyRecord|idempotency_key|findFirst.*idempotency|upsert/.test(content);
    if (!hasIdempotency) {
      warn(file, 1, 7, `Prisma.${model}.create used without visible idempotency check (idempotencyRecord or upsert) — verify idempotency`);
      break;
    }
  }
}

// ─── D8: Disabled TypeScript strict checks on auth/workspace paths ────────────

function scanD8(file, lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/@ts-ignore|@ts-nocheck/.test(line)) {
      const nextLine = lines[i + 1] || '';
      if (/workspaceId|actorId|auth|capability|verified/.test(nextLine)) {
        fail(file, i + 1, 8, `@ts-ignore/@ts-nocheck suppressing type check on auth/workspace enforcement line — remove or justify`);
      }
    }
  }
}

// ─── D9: Sentinel/hardcoded actorId at an emitAuditEvent call site ───────────
// A string-literal actorId (e.g. "system", "webhook-system", a hardcoded
// UUID) can never satisfy AuditEvent.actorId's real FK to users.id — every
// occurrence of this defect class found in this codebase (CRON_ACTOR_ID,
// "system", "webhook-system") was a literal string, not a variable. Scans a
// bounded window of lines following each emitAuditEvent( call for a
// literal-string actorId field. The canonical fix is a real actorId variable
// with actorType "user", or actorId omitted entirely with actorType
// "system" — see toAuditActor() in src/domain/owner-budget/system-actor.ts.

function scanD9(file, lines) {
  const literalActorId = /actorId\s*:\s*["'`]/;
  for (let i = 0; i < lines.length; i++) {
    if (!/emitAuditEvent\s*\(/.test(lines[i])) continue;
    const windowEnd = Math.min(lines.length, i + 20);
    for (let j = i; j < windowEnd; j++) {
      if (literalActorId.test(lines[j])) {
        fail(
          file, j + 1, 9,
          `String-literal actorId passed to emitAuditEvent (${lines[j].trim()}) — AuditEvent.actorId has a real FK to users.id and a literal can never satisfy it. Use a real actorId variable with actorType "user", or omit actorId entirely with actorType "system" (see toAuditActor() in src/domain/owner-budget/system-actor.ts).`
        );
        break; // one violation per call site is enough signal
      }
      if (j > i && /^\s*\}\)/.test(lines[j])) break; // end of this emitAuditEvent(...) call
    }
  }
}

// ─── Run all scanners ─────────────────────────────────────────────────────────

const allFiles = SCAN_DIRS.flatMap(dir => walkDir(dir));
console.log(`Scanning ${allFiles.length} files for recurrence defects...\n`);

for (const file of allFiles) {
  const lines = readLines(file);
  if (lines.length === 0) continue;
  filesScanned++;

  scanD1(file, lines);
  scanD2(file, lines);
  scanD3(file, lines);
  scanD4(file, lines);
  scanD5(file, lines);
  scanD6(file, lines);
  scanD7(file, lines);
  scanD8(file, lines);
  scanD9(file, lines);
}

console.log(`\nScanned: ${filesScanned} files`);
console.log(`Violations (blocking): ${violations}`);
console.log(`Warnings (non-blocking): ${warnings}`);

if (violations > 0) {
  console.error(`\n❌ Recurrence scan FAILED: ${violations} violation(s) — fix before merge`);
  process.exit(1);
} else {
  console.log(`\n✅ Recurrence scan passed (${warnings} warning(s))`);
  process.exit(0);
}
