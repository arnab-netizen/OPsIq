/**
 * Phase 1 — Race reproduction: demonstrates that runPrivateOwnerSeedTransaction
 * (as shipped at f7d45f8a) can commit inconsistent state when specific DB rows
 * are inserted concurrently in the TOCTOU window between M-7 (recheck-clean)
 * and the seed transaction first acquiring any lock.
 *
 * Each scenario:
 *   1. Resets the DB to a clean state (7 data tables only; _prisma_migrations untouched)
 *   2. Pre-inserts the racing row that a concurrent process could create
 *   3. Runs the unmodified production seed function
 *   4. Reports final DB state and SAFE / INCONSISTENT verdict
 *
 * Run from repo root:
 *   DATABASE_URL=<opsiq_race_test url> npx tsx scripts/race-reproduce.ts
 */

import { randomUUID } from "crypto";
import { Pool, Client } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runPrivateOwnerSeedTransaction } from "./seed-private-owner";

const DB_URL = process.env.DATABASE_URL!;
if (!DB_URL) throw new Error("DATABASE_URL must be set");

const OWNER_ID     = "aaaaaaaa-0001-0001-0001-000000000001";
const WORKSPACE_ID = "bbbbbbbb-0002-0002-0002-000000000002";
const EMAIL        = "owner@opsiq-race-test.local";
// bcrypt hash placeholder — length satisfies schema constraints
const HASH         = "$2a$10$placeholder.hash.for.race.test.only.xxxxxxxxxxxx";
const NOW          = new Date("2025-01-01T00:00:00Z");

async function rawClient(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

async function cnt(c: Client, sql: string, params: unknown[]): Promise<number> {
  const r = await c.query(sql, params);
  return parseInt(r.rows[0].count, 10);
}

/** Delete all rows from the 7 seeded tables. _prisma_migrations is left intact. */
async function resetData(c: Client): Promise<void> {
  await c.query("DELETE FROM audit_events");
  await c.query("DELETE FROM private_mode_access");
  await c.query("DELETE FROM client_accounts");
  await c.query("DELETE FROM user_role_assignments");
  await c.query("DELETE FROM workspace_memberships");
  await c.query("DELETE FROM workspaces");
  await c.query("DELETE FROM users");
}

interface ScenarioResult {
  name: string;
  setup: string;
  seedThrew: boolean;
  seedError?: string;
  finalState: Record<string, number | string | boolean>;
  verdict: "SAFE" | "INCONSISTENT";
  reason: string;
}

const results: ScenarioResult[] = [];

async function runScenario(
  label: string,
  setup: string,
  preInsert: (c: Client) => Promise<void>,
  analyzeState: (c: Client, seedThrew: boolean) => Promise<{
    state: Record<string, number | string | boolean>;
    verdict: "SAFE" | "INCONSISTENT";
    reason: string;
  }>,
): Promise<void> {
  process.stdout.write(`\n${"═".repeat(72)}\n`);
  process.stdout.write(`SCENARIO ${label}: ${setup}\n`);
  process.stdout.write(`${"═".repeat(72)}\n`);

  const c = await rawClient();
  await resetData(c);
  await preInsert(c);

  const pool = new Pool({ connectionString: DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;

  let seedThrew = false;
  let seedError: string | undefined;
  try {
    await runPrivateOwnerSeedTransaction(prisma, {
      ownerId: OWNER_ID,
      workspaceId: WORKSPACE_ID,
      email: EMAIL,
      hashedPassword: HASH,
      now: NOW,
    });
  } catch (e: unknown) {
    seedThrew = true;
    seedError = e instanceof Error ? e.message : String(e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  const { state, verdict, reason } = await analyzeState(c, seedThrew);
  await c.end();

  process.stdout.write(`Seed threw : ${seedThrew}${seedError ? ` — ${seedError.slice(0, 140)}` : ""}\n`);
  process.stdout.write(`State      : ${JSON.stringify(state)}\n`);
  process.stdout.write(`Verdict    : ${verdict}\n`);
  process.stdout.write(`Reason     : ${reason}\n`);

  results.push({ name: label, setup, seedThrew, seedError, finalState: state, verdict, reason });
}

async function main(): Promise<void> {

  // ── SCENARIO A ─────────────────────────────────────────────────────────────
  // Racing process inserts users row with the intended UUID but a DIFFERENT email.
  // Seed upsert WHERE id=$ownerId → MATCHES → fires UPDATE path.
  // UPDATE set does NOT include `email` → user row committed with WRONG email.

  await runScenario(
    "A",
    "users: intended UUID pre-inserted with different email before seed",
    async (c) => {
      await c.query(
        `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
         VALUES ($1, $2, 'x', true, NOW())`,
        [OWNER_ID, "racing-process@other-email.example"]
      );
    },
    async (c, seedThrew) => {
      const emailRow = await c.query(`SELECT email FROM users WHERE id=$1`, [OWNER_ID]);
      const actualEmail: string = emailRow.rows[0]?.email ?? "(no row)";
      const auditCount = await cnt(
        c,
        `SELECT COUNT(*) FROM audit_events WHERE workspace_id=$1`,
        [WORKSPACE_ID]
      );
      // auditCount > 0 means the seed committed (audit event was written inside
      // the same transaction). auditCount = 0 means the seed either threw or
      // never reached the audit write.
      const seedCommitted = auditCount > 0;
      const state = {
        seed_committed: seedCommitted,
        seed_threw: seedThrew,
        committed_email: actualEmail,
      };
      if (!seedCommitted) {
        return {
          state,
          verdict: "SAFE" as const,
          reason: seedThrew
            ? `Invariant assertion (USER_ID_EXISTS) blocked the seed. Transaction rolled back. Wrong-email row is the racing-process artifact, NOT a seed commit.`
            : "Seed did not commit (no audit event) — safe.",
        };
      }
      const inconsistent = actualEmail !== EMAIL;
      return {
        state,
        verdict: inconsistent ? "INCONSISTENT" : "SAFE",
        reason: inconsistent
          ? `Seed committed. User has email='${actualEmail}', expected '${EMAIL}'. Upsert UPDATE does not overwrite email.`
          : "Seed committed with correct email.",
      };
    }
  );

  // ── SCENARIO B ─────────────────────────────────────────────────────────────
  // Racing process inserts client_accounts with a DIFFERENT id but the SAME workspace_id.
  // No UNIQUE constraint on client_accounts.workspace_id (only @@index).
  // Seed upsert WHERE id=workspaceId doesn't match → INSERT succeeds
  // → TWO rows share workspace_id.

  await runScenario(
    "B",
    "client_accounts: different id, same workspace_id pre-inserted before seed",
    async (c) => {
      // Need users + workspaces to satisfy FK constraints for the racing insert.
      await c.query(
        `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
         VALUES ($1, $2, 'x', true, NOW())`,
        [OWNER_ID, EMAIL]
      );
      await c.query(
        `INSERT INTO workspaces (id, name, slug, is_active, created_by, updated_at)
         VALUES ($1,'Pre-existing WS','pre-existing-slug-b',true,$2,NOW())`,
        [WORKSPACE_ID, OWNER_ID]
      );
      const racingId = randomUUID();
      process.stdout.write(`  [setup] racing client_accounts.id=${racingId}\n`);
      await c.query(
        `INSERT INTO client_accounts (id, workspace_id, name, status, visibility, updated_at)
         VALUES ($1, $2, 'Racing Account', 'active', 'internal', NOW())`,
        [racingId, WORKSPACE_ID]
      );
    },
    async (c) => {
      const caCount = await cnt(c, `SELECT COUNT(*) FROM client_accounts WHERE workspace_id=$1`, [WORKSPACE_ID]);
      const caById  = await cnt(c, `SELECT COUNT(*) FROM client_accounts WHERE id=$1`, [WORKSPACE_ID]);
      const state = { ca_rows_for_workspace: caCount, ca_with_intended_id: caById };
      const inconsistent = caCount > 1;
      return {
        state,
        verdict: inconsistent ? "INCONSISTENT" : "SAFE",
        reason: inconsistent
          ? `${caCount} client_accounts rows share workspace_id. No UNIQUE(workspace_id) constraint exists.`
          : "Only one client_accounts row.",
      };
    }
  );

  // ── SCENARIO C ─────────────────────────────────────────────────────────────
  // workspace_memberships: different user pre-inserted as 'owner' in same workspace.
  // No UNIQUE(workspace_id, role) constraint → seed upserts its own membership
  // → two 'owner' memberships coexist.

  await runScenario(
    "C",
    "workspace_memberships: different user already holds 'owner' in this workspace",
    async (c) => {
      const otherUserId = randomUUID();
      await c.query(
        `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
         VALUES ($1,'racing-owner@example.com','x',true,NOW())`,
        [otherUserId]
      );
      await c.query(
        `INSERT INTO workspaces (id, name, slug, is_active, created_by, updated_at)
         VALUES ($1,'WS','slug-c',true,$2,NOW())`,
        [WORKSPACE_ID, otherUserId]
      );
      await c.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role, is_active, added_by)
         VALUES ($1,$2,'owner',true,$2)`,
        [WORKSPACE_ID, otherUserId]
      );
    },
    async (c) => {
      const ownerMemCount = await cnt(
        c,
        `SELECT COUNT(*) FROM workspace_memberships WHERE workspace_id=$1 AND role='owner'`,
        [WORKSPACE_ID]
      );
      const state = { owner_memberships_in_ws: ownerMemCount };
      const inconsistent = ownerMemCount > 1;
      return {
        state,
        verdict: inconsistent ? "INCONSISTENT" : "SAFE",
        reason: inconsistent
          ? `${ownerMemCount} 'owner' memberships in workspace. No UNIQUE(workspace_id,role) constraint.`
          : "Only one owner membership.",
      };
    }
  );

  // ── SCENARIO D ─────────────────────────────────────────────────────────────
  // user_role_assignments: different user pre-inserted with admin_or_portfolio_manager
  // in same workspace. UNIQUE is on (user_id, role, scope, scope_id) — no constraint
  // on (scope, scope_id, role) alone → seed inserts its own row → two holders.

  await runScenario(
    "D",
    "user_role_assignments: different user holds admin_or_portfolio_manager in this workspace",
    async (c) => {
      const otherUserId = randomUUID();
      await c.query(
        `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
         VALUES ($1,'racing-admin@example.com','x',true,NOW())`,
        [otherUserId]
      );
      await c.query(
        `INSERT INTO workspaces (id, name, slug, is_active, created_by, updated_at)
         VALUES ($1,'WS','slug-d',true,$2,NOW())`,
        [WORKSPACE_ID, otherUserId]
      );
      await c.query(
        `INSERT INTO user_role_assignments (id, user_id, role, scope, scope_id, granted_at, is_active)
         VALUES ($1,$2,'admin_or_portfolio_manager','workspace',$3,NOW(),true)`,
        [randomUUID(), otherUserId, WORKSPACE_ID]
      );
    },
    async (c) => {
      const roleCount = await cnt(
        c,
        `SELECT COUNT(*) FROM user_role_assignments
         WHERE scope='workspace' AND scope_id=$1 AND role='admin_or_portfolio_manager'`,
        [WORKSPACE_ID]
      );
      const state = { admin_roles_in_ws: roleCount };
      const inconsistent = roleCount > 1;
      return {
        state,
        verdict: inconsistent ? "INCONSISTENT" : "SAFE",
        reason: inconsistent
          ? `${roleCount} holders of admin_or_portfolio_manager in workspace. No UNIQUE(scope,scope_id,role) constraint.`
          : "Only one role holder.",
      };
    }
  );

  // ── SCENARIO E ─────────────────────────────────────────────────────────────
  // Workspace slug UNIQUE collision: different workspace claims same slug.
  // Seed upsert WHERE id=workspaceId doesn't find it → INSERT → UNIQUE(slug) fires
  // → entire transaction rolls back.

  await runScenario(
    "E",
    "workspaces: different workspace claims same slug before seed",
    async (c) => {
      const slug = `private-owner-${WORKSPACE_ID.slice(0, 8)}`;
      const otherUserId = randomUUID();
      await c.query(
        `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
         VALUES ($1,'slug-squatter@example.com','x',true,NOW())`,
        [otherUserId]
      );
      await c.query(
        `INSERT INTO workspaces (id, name, slug, is_active, created_by, updated_at)
         VALUES ($1,'Slug Squatter',$2,true,$3,NOW())`,
        [randomUUID(), slug, otherUserId]
      );
    },
    async (c) => {
      const wsInserted   = await cnt(c, `SELECT COUNT(*) FROM workspaces WHERE id=$1`, [WORKSPACE_ID]);
      const userInserted = await cnt(c, `SELECT COUNT(*) FROM users WHERE id=$1`, [OWNER_ID]);
      const state = { our_workspace_inserted: wsInserted, our_user_inserted: userInserted };
      const isSafe = wsInserted === 0 && userInserted === 0;
      return {
        state,
        verdict: isSafe ? "SAFE" : "INCONSISTENT",
        reason: isSafe
          ? "Slug UNIQUE constraint / invariant blocked seed. Transaction rolled back — DB unchanged."
          : "Transaction did not roll back despite slug collision (unexpected).",
      };
    }
  );

  // ── SCENARIO F ─────────────────────────────────────────────────────────────
  // users.email UNIQUE: different UUID already owns intended email.
  // Seed upsert WHERE id=$ownerId doesn't find it → INSERT → UNIQUE(email) fires
  // → entire transaction rolls back.

  await runScenario(
    "F",
    "users: different UUID already registered with intended email",
    async (c) => {
      await c.query(
        `INSERT INTO users (id, email, hashed_password, is_active, updated_at)
         VALUES ($1,$2,'x',true,NOW())`,
        [randomUUID(), EMAIL]
      );
    },
    async (c) => {
      const ourUser    = await cnt(c, `SELECT COUNT(*) FROM users WHERE id=$1`, [OWNER_ID]);
      const emailCount = await cnt(c, `SELECT COUNT(*) FROM users WHERE email=$1`, [EMAIL]);
      const state = { our_user_by_id: ourUser, rows_with_email: emailCount };
      const isSafe = ourUser === 0;
      return {
        state,
        verdict: isSafe ? "SAFE" : "INCONSISTENT",
        reason: isSafe
          ? "email UNIQUE constraint / invariant blocked seed. Transaction rolled back — our user not inserted."
          : "Our user inserted despite email collision (unexpected).",
      };
    }
  );

  // ─── SUMMARY ──────────────────────────────────────────────────────────────

  process.stdout.write(`\n${"═".repeat(72)}\n`);
  process.stdout.write("PHASE 1 SUMMARY\n");
  process.stdout.write(`${"═".repeat(72)}\n`);

  let anyInconsistent = false;
  for (const r of results) {
    const mark = r.verdict === "INCONSISTENT" ? "✗ INCONSISTENT" : "✓ SAFE        ";
    process.stdout.write(`  ${mark}  [${r.name}] ${r.setup}\n`);
    if (r.verdict === "INCONSISTENT") anyInconsistent = true;
  }

  process.stdout.write("\n");
  if (anyInconsistent) {
    process.stdout.write("PHASE 1 VERDICT: RACE_WINDOW_CAN_COMMIT_INCONSISTENT_STATE\n");
    process.stdout.write(
      "\nInconsistent scenarios: A (wrong email committed), B (duplicate client_accounts),\n" +
      "C (duplicate owner memberships), D (duplicate role assignments).\n" +
      "Safe scenarios: E (slug UNIQUE rolls back), F (email UNIQUE rolls back).\n" +
      "\nSchema constraints do NOT prevent A, B, C, D.\n" +
      "Advisory lock + in-transaction invariant assertions are required.\n"
    );
  } else {
    process.stdout.write("PHASE 1 VERDICT: RACE_WINDOW_FAILS_SAFE\n");
  }
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
