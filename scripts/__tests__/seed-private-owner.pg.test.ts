/**
 * Phase 5 — Real-schema PostgreSQL invariant tests for seed-private-owner.ts
 *
 * Tests 13 scenarios against the actual migrated schema (160 migrations applied).
 *
 * Invariant check order in assertBootstrapInvariants (all 12 run in parallel;
 * the checks array determines which fires first when multiple are non-zero):
 *   1.  MEMBERSHIP_EXISTS             — (workspaceId, ownerId) membership pre-exists
 *   2.  CONFLICTING_OWNER_MEMBERSHIP  — different user holds 'owner' in workspace
 *   3.  ROLE_ASSIGNMENT_EXISTS        — (ownerId, role, workspace, workspaceId) pre-exists
 *   4.  CONFLICTING_ROLE_ASSIGNMENT   — different user holds same role in workspace
 *   5.  PRIVATE_MODE_ACCESS_EXISTS    — (workspaceId, ownerId) PMA pre-exists
 *   6.  CLIENT_ACCOUNT_ID_EXISTS      — client_accounts.id=workspaceId pre-exists
 *   7.  CONFLICTING_CLIENT_ACCOUNT    — different CA references workspace_id
 *   8.  AUDIT_EVENT_EXISTS            — seed audit event pre-exists for workspace
 *   9.  USER_ID_EXISTS                — users.id=ownerId pre-exists
 *  10.  USER_EMAIL_EXISTS             — users.email=email pre-exists (different UUID)
 *  11.  WORKSPACE_ID_EXISTS           — workspaces.id=workspaceId pre-exists
 *  12.  WORKSPACE_SLUG_EXISTS         — intended slug claimed by different workspace
 *
 * Each negative test proves:
 *   - PrivateOwnerBootstrapInvariantError thrown (correct violation name)
 *   - Entire transaction rolled back atomically (total row count unchanged)
 *
 * T13 is the clean-state success path.
 *
 * Run from repo root:
 *   DATABASE_URL=<url> npx tsx scripts/__tests__/seed-private-owner.pg.test.ts
 */

import { randomUUID } from "crypto";
import { Pool, Client } from "pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  runPrivateOwnerSeedTransaction,
  PrivateOwnerBootstrapInvariantError,
} from "../seed-private-owner";

const DB_URL = process.env.DATABASE_URL!;
if (!DB_URL) throw new Error("DATABASE_URL must be set");

const OWNER_ID     = "cccccccc-0003-0003-0003-000000000003";
const WORKSPACE_ID = "dddddddd-0004-0004-0004-000000000004";
const EMAIL        = "phase5-owner@opsiq-invariant-test.local";
// Bcrypt hash placeholder — long enough not to fail schema length checks
const HASH         = "$2a$10$phase5test.hash.placeholder.xxxxxxxxxxxxxxxx";
const NOW          = new Date("2025-06-01T00:00:00Z");
const ROLE         = "admin_or_portfolio_manager";
const SLUG         = `private-owner-${WORKSPACE_ID.slice(0, 8)}`;

async function rawClient(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

async function cnt(c: Client, sql: string, params: unknown[]): Promise<number> {
  const r = await c.query(sql, params);
  return parseInt(r.rows[0].count, 10);
}

/** Total rows across the 7 seed tables — used to verify atomic rollback. */
async function totalRows(c: Client): Promise<number> {
  const tables = [
    "audit_events", "private_mode_access", "client_accounts",
    "user_role_assignments", "workspace_memberships", "workspaces", "users",
  ];
  let total = 0;
  for (const t of tables) {
    total += await cnt(c, `SELECT COUNT(*) FROM ${t}`, []);
  }
  return total;
}

async function resetData(c: Client): Promise<void> {
  await c.query("DELETE FROM audit_events");
  await c.query("DELETE FROM private_mode_access");
  await c.query("DELETE FROM client_accounts");
  await c.query("DELETE FROM user_role_assignments");
  await c.query("DELETE FROM workspace_memberships");
  await c.query("DELETE FROM workspaces");
  await c.query("DELETE FROM users");
}

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];
let idCounter = 1;

async function runTest(
  name: string,
  preInsert: (c: Client) => Promise<void>,
  expectation: "INVARIANT_VIOLATION" | "SUCCESS",
  expectedViolation?: string,
): Promise<void> {
  const id = idCounter++;
  const c = await rawClient();
  await resetData(c);
  await preInsert(c);

  const rowsBefore = await totalRows(c);

  const pool = new Pool({ connectionString: DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;

  let threw = false;
  let violationName: string | undefined;
  let seedError: Error | undefined;

  try {
    await runPrivateOwnerSeedTransaction(prisma, {
      ownerId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      email: EMAIL,
      hashedPassword: HASH,
      now: NOW,
    });
  } catch (e: unknown) {
    threw = true;
    seedError = e instanceof Error ? e : new Error(String(e));
    if (e instanceof PrivateOwnerBootstrapInvariantError) {
      violationName = e.violation;
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  const rowsAfter = await totalRows(c);
  await c.end();

  let passed = false;
  let detail: string;

  if (expectation === "INVARIANT_VIOLATION") {
    const isInvariantError = seedError instanceof PrivateOwnerBootstrapInvariantError;
    const correctViolation = !expectedViolation || violationName === expectedViolation;
    const atomicRollback   = rowsAfter === rowsBefore;

    passed = threw && isInvariantError && correctViolation && atomicRollback;

    if (!threw) {
      detail = `FAIL: expected throw but seed completed without error`;
    } else if (!isInvariantError) {
      detail = `FAIL: wrong error type — ${seedError?.constructor?.name}: ${seedError?.message?.slice(0, 80)}`;
    } else if (!correctViolation) {
      detail = `FAIL: wrong violation — got '${violationName}', expected '${expectedViolation}'`;
    } else if (!atomicRollback) {
      detail = `FAIL: NOT atomic — rows before=${rowsBefore} after=${rowsAfter}`;
    } else {
      detail = `PASS: threw ${violationName}, atomic rollback confirmed (rows unchanged at ${rowsAfter})`;
    }
  } else {
    const seedSucceeded  = !threw;
    const rowsCommitted  = rowsAfter - rowsBefore;
    passed = seedSucceeded && rowsCommitted === 7;

    if (threw) {
      detail = `FAIL: expected success but threw — ${seedError?.message?.slice(0, 80)}`;
    } else if (rowsCommitted !== 7) {
      detail = `FAIL: expected 7 rows committed, got ${rowsCommitted}`;
    } else {
      detail = `PASS: seed completed, 7 rows committed atomically (rows=${rowsAfter})`;
    }
  }

  const prefix = passed ? "✓" : "✗";
  process.stdout.write(`  ${prefix} [T${id.toString().padStart(2, "0")}] ${name}\n`);
  process.stdout.write(`         ${detail}\n`);

  results.push({ id, name, passed, detail });
}

// ── Shared setup helpers ─────────────────────────────────────────────────────

async function insertUser(c: Client, id: string, email: string): Promise<void> {
  await c.query(
    `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
     VALUES ($1, $2, 'x', true, NOW())`,
    [id, email]
  );
}

async function insertWorkspace(c: Client, id: string, slug: string, createdBy: string): Promise<void> {
  await c.query(
    `INSERT INTO workspaces (id, name, slug, is_active, created_by, updated_at)
     VALUES ($1, 'WS', $2, true, $3, NOW())`,
    [id, slug, createdBy]
  );
}

async function insertClientAccount(c: Client, id: string, workspaceId: string): Promise<void> {
  await c.query(
    `INSERT INTO client_accounts (id, workspace_id, name, status, visibility, updated_at)
     VALUES ($1, $2, 'Account', 'active', 'internal', NOW())`,
    [id, workspaceId]
  );
}

async function main(): Promise<void> {
  process.stdout.write("Phase 5 — Real-schema PostgreSQL invariant tests\n");
  process.stdout.write(`DB: ${DB_URL.replace(/:\/\/[^@]+@/, "://<credentials>@")}\n\n`);

  // ── T01: MEMBERSHIP_EXISTS ────────────────────────────────────────────────
  // Setup: ownerId user + workspaceId workspace + (workspaceId, ownerId) membership.
  // Check order: MEMBERSHIP_EXISTS is check 1 → fires before USER_ID_EXISTS (check 9).
  await runTest(
    "MEMBERSHIP_EXISTS: (workspaceId, ownerId) membership already exists",
    async (c) => {
      await insertUser(c, OWNER_ID, EMAIL);
      await insertWorkspace(c, WORKSPACE_ID, SLUG, OWNER_ID);
      await c.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role, is_active, added_by)
         VALUES ($1, $2, 'owner', true, $2)`,
        [WORKSPACE_ID, OWNER_ID]
      );
    },
    "INVARIANT_VIOLATION",
    "MEMBERSHIP_EXISTS"
  );

  // ── T02: CONFLICTING_OWNER_MEMBERSHIP ─────────────────────────────────────
  // Setup: workspaceId workspace + different user has 'owner' membership.
  // OWNER_ID does NOT exist → MEMBERSHIP_EXISTS (check 1) = 0.
  // CONFLICTING_OWNER_MEMBERSHIP (check 2) = 1 → fires.
  await runTest(
    "CONFLICTING_OWNER_MEMBERSHIP: different user already holds 'owner' in workspace",
    async (c) => {
      const otherId = randomUUID();
      await insertUser(c, otherId, "other-owner@example.com");
      await insertWorkspace(c, WORKSPACE_ID, SLUG, otherId);
      await c.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role, is_active, added_by)
         VALUES ($1, $2, 'owner', true, $2)`,
        [WORKSPACE_ID, otherId]
      );
    },
    "INVARIANT_VIOLATION",
    "CONFLICTING_OWNER_MEMBERSHIP"
  );

  // ── T03: ROLE_ASSIGNMENT_EXISTS ───────────────────────────────────────────
  // Setup: ownerId user + role assignment (ownerId, ROLE, workspace, workspaceId).
  // user_role_assignments.scope_id has NO FK → workspace need not exist.
  // MEMBERSHIP_EXISTS (check 1) = 0 (no membership).
  // CONFLICTING_OWNER_MEMBERSHIP (check 2) = 0 (no membership at all).
  // ROLE_ASSIGNMENT_EXISTS (check 3) = 1 → fires before USER_ID_EXISTS (check 9).
  await runTest(
    "ROLE_ASSIGNMENT_EXISTS: (ownerId, role, workspace, workspaceId) already exists",
    async (c) => {
      await insertUser(c, OWNER_ID, EMAIL);
      await c.query(
        `INSERT INTO user_role_assignments (id, user_id, role, scope, scope_id, granted_at, is_active)
         VALUES ($1, $2, $3, 'workspace', $4, NOW(), true)`,
        [randomUUID(), OWNER_ID, ROLE, WORKSPACE_ID]
      );
    },
    "INVARIANT_VIOLATION",
    "ROLE_ASSIGNMENT_EXISTS"
  );

  // ── T04: CONFLICTING_ROLE_ASSIGNMENT ──────────────────────────────────────
  // Setup: different user has same role in workspaceId scope.
  // user_role_assignments.scope_id has NO FK → workspace need not exist.
  // MEMBERSHIP_EXISTS = 0, CONFLICTING_OWNER_MEMBERSHIP = 0, ROLE_ASSIGNMENT_EXISTS = 0.
  // CONFLICTING_ROLE_ASSIGNMENT (check 4) = 1 → fires.
  await runTest(
    "CONFLICTING_ROLE_ASSIGNMENT: different user holds admin_or_portfolio_manager in workspace",
    async (c) => {
      const otherId = randomUUID();
      await insertUser(c, otherId, "other-admin@example.com");
      await c.query(
        `INSERT INTO user_role_assignments (id, user_id, role, scope, scope_id, granted_at, is_active)
         VALUES ($1, $2, $3, 'workspace', $4, NOW(), true)`,
        [randomUUID(), otherId, ROLE, WORKSPACE_ID]
      );
    },
    "INVARIANT_VIOLATION",
    "CONFLICTING_ROLE_ASSIGNMENT"
  );

  // ── T05: PRIVATE_MODE_ACCESS_EXISTS ───────────────────────────────────────
  // Setup: full prerequisite chain (user + workspace + CA) + PMA for (workspaceId, ownerId).
  // Checks 1-4 = 0 (no membership, no conflicting owner, no role assignment, no conflicting role).
  // PRIVATE_MODE_ACCESS_EXISTS (check 5) = 1 → fires before CLIENT_ACCOUNT_ID_EXISTS (check 6).
  await runTest(
    "PRIVATE_MODE_ACCESS_EXISTS: (workspaceId, ownerId) access already exists",
    async (c) => {
      await insertUser(c, OWNER_ID, EMAIL);
      await insertWorkspace(c, WORKSPACE_ID, SLUG, OWNER_ID);
      await insertClientAccount(c, WORKSPACE_ID, WORKSPACE_ID);
      await c.query(
        `INSERT INTO private_mode_access
         (workspace_id, user_id, role, granted_at, granted_by, approval_status, approved_at, approved_by, updated_at)
         VALUES ($1, $2, 'OWNER', NOW(), $2, 'approved', NOW(), $2, NOW())`,
        [WORKSPACE_ID, OWNER_ID]
      );
    },
    "INVARIANT_VIOLATION",
    "PRIVATE_MODE_ACCESS_EXISTS"
  );

  // ── T06: CLIENT_ACCOUNT_ID_EXISTS ─────────────────────────────────────────
  // Setup: user + workspace + CA(id=workspaceId). No membership, no role, no PMA.
  // Checks 1-5 = 0. CLIENT_ACCOUNT_ID_EXISTS (check 6) = 1 → fires
  // before USER_ID_EXISTS (check 9) and WORKSPACE_ID_EXISTS (check 11).
  await runTest(
    "CLIENT_ACCOUNT_ID_EXISTS: client_accounts.id=workspaceId already exists",
    async (c) => {
      await insertUser(c, OWNER_ID, EMAIL);
      await insertWorkspace(c, WORKSPACE_ID, SLUG, OWNER_ID);
      await insertClientAccount(c, WORKSPACE_ID, WORKSPACE_ID);
    },
    "INVARIANT_VIOLATION",
    "CLIENT_ACCOUNT_ID_EXISTS"
  );

  // ── T07: CONFLICTING_CLIENT_ACCOUNT ───────────────────────────────────────
  // Setup: workspace + another CA (different id, same workspace_id).
  // No membership, no role, no PMA, no CA with id=workspaceId.
  // CONFLICTING_CLIENT_ACCOUNT (check 7) = 1 → fires before WORKSPACE_ID_EXISTS (check 11).
  await runTest(
    "CONFLICTING_CLIENT_ACCOUNT: different CA already references workspace_id",
    async (c) => {
      const otherId = randomUUID();
      await insertUser(c, otherId, "ca-creator@example.com");
      await insertWorkspace(c, WORKSPACE_ID, SLUG, otherId);
      await insertClientAccount(c, randomUUID(), WORKSPACE_ID);
    },
    "INVARIANT_VIOLATION",
    "CONFLICTING_CLIENT_ACCOUNT"
  );

  // ── T08: AUDIT_EVENT_EXISTS ───────────────────────────────────────────────
  // Setup: another user + audit event with workspace_id=workspaceId.
  // audit_events.workspace_id has NO FK → workspace need not exist.
  // Checks 1-7 = 0 (no memberships, no role assignments, no PMA, no CA rows).
  // AUDIT_EVENT_EXISTS (check 8) = 1 → fires.
  await runTest(
    "AUDIT_EVENT_EXISTS: seed audit event already present for workspace",
    async (c) => {
      const otherId = randomUUID();
      await insertUser(c, otherId, "auditor@example.com");
      await c.query(
        `INSERT INTO audit_events
         (id, event_name, workspace_id, actor_id, actor_type, entity_type, entity_id, visibility, occurred_at)
         VALUES ($1, 'private_mode.owner_seed_executed', $2, $3, 'system', 'workspace', $4, 'internal', NOW())`,
        [randomUUID(), WORKSPACE_ID, otherId, WORKSPACE_ID]
      );
    },
    "INVARIANT_VIOLATION",
    "AUDIT_EVENT_EXISTS"
  );

  // ── T09: USER_ID_EXISTS ───────────────────────────────────────────────────
  // Setup: only user(OWNER_ID). No workspace, no memberships, no roles, no PMA, no CA.
  // Checks 1-8 = 0. USER_ID_EXISTS (check 9) = 1 → fires.
  await runTest(
    "USER_ID_EXISTS: user with intended UUID already exists",
    async (c) => {
      await insertUser(c, OWNER_ID, "different-email@example.com");
    },
    "INVARIANT_VIOLATION",
    "USER_ID_EXISTS"
  );

  // ── T10: USER_EMAIL_EXISTS ────────────────────────────────────────────────
  // Setup: different user with intended email. No workspace, no memberships, no roles.
  // Checks 1-9 = 0. USER_EMAIL_EXISTS (check 10) = 1 → fires.
  await runTest(
    "USER_EMAIL_EXISTS: intended email already registered to different UUID",
    async (c) => {
      await insertUser(c, randomUUID(), EMAIL);
    },
    "INVARIANT_VIOLATION",
    "USER_EMAIL_EXISTS"
  );

  // ── T11: WORKSPACE_ID_EXISTS ──────────────────────────────────────────────
  // Setup: workspace(WORKSPACE_ID) with no memberships, no roles, no CA.
  // Checks 1-10 = 0. WORKSPACE_ID_EXISTS (check 11) = 1 → fires.
  await runTest(
    "WORKSPACE_ID_EXISTS: workspace with intended UUID already exists",
    async (c) => {
      const uid = randomUUID();
      await insertUser(c, uid, "ws-creator@example.com");
      await insertWorkspace(c, WORKSPACE_ID, "some-other-slug", uid);
    },
    "INVARIANT_VIOLATION",
    "WORKSPACE_ID_EXISTS"
  );

  // ── T12: WORKSPACE_SLUG_EXISTS ────────────────────────────────────────────
  // Setup: workspace with different id but same slug. No memberships, no CA.
  // Checks 1-11 = 0. WORKSPACE_SLUG_EXISTS (check 12) = 1 → fires.
  await runTest(
    "WORKSPACE_SLUG_EXISTS: intended slug claimed by different workspace",
    async (c) => {
      const uid = randomUUID();
      await insertUser(c, uid, "slug-squatter@example.com");
      await insertWorkspace(c, randomUUID(), SLUG, uid);
    },
    "INVARIANT_VIOLATION",
    "WORKSPACE_SLUG_EXISTS"
  );

  // ── T13: CLEAN_FIRST_SEED SUCCESS ─────────────────────────────────────────
  // Clean database — seed should succeed and commit exactly 7 rows atomically.
  await runTest(
    "CLEAN_FIRST_SEED: clean database accepts seed, 7 rows committed atomically",
    async () => {
      // nothing — DB is already clean after resetData()
    },
    "SUCCESS"
  );

  // ─── SUMMARY ─────────────────────────────────────────────────────────────

  const passed = results.filter((r) => r.passed).length;
  const total  = results.length;
  const failed = results.filter((r) => !r.passed);

  process.stdout.write(`\n${"─".repeat(72)}\n`);
  process.stdout.write(`Phase 5 Results: ${passed}/${total} passed\n`);
  process.stdout.write(`${"─".repeat(72)}\n`);

  if (failed.length > 0) {
    process.stdout.write("\nFailed tests:\n");
    for (const f of failed) {
      process.stdout.write(`  ✗ [T${f.id.toString().padStart(2, "0")}] ${f.name}\n`);
      process.stdout.write(`         ${f.detail}\n`);
    }
    process.stdout.write("\nPHASE 5 VERDICT: INVARIANT_TESTS_FAILED\n");
    process.exit(1);
  } else {
    process.stdout.write(`\nAll ${total} invariant tests passed on real migrated schema.\n`);
    process.stdout.write("PHASE 5 VERDICT: INVARIANT_TESTS_PASS\n");
    process.exit(0);
  }
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
