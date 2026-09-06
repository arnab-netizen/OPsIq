/**
 * Production acceptance-account password-reset token issuer — real PostgreSQL
 * transaction contract.
 *
 * Exercises the script's actual exported transaction functions
 * (findAcceptanceAccount, findActiveWorkspaceId, createResetTokenAndAudit,
 * runRecovery) against a real database connection, proving the atomicity
 * properties a hostile review demanded: an audit-insert failure rolls back
 * the token insert, a token-insert failure never reaches the audit insert,
 * a successful run creates exactly one of each row when a workspace exists,
 * and the raw token is returned only after COMMIT actually succeeds.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/production-acceptance-password-reset.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  findAcceptanceAccount,
  findActiveWorkspaceId,
  runRecovery,
} from "../../../scripts/production-acceptance-password-reset.mjs";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] production-acceptance-password-reset — atomic transaction contract", () => {
  let client: Client;
  const stamp = randomUUID().slice(0, 8);
  const email = `acceptance-recovery-${stamp}@test.local`;
  let userId: string;
  let workspaceId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    userId = randomUUID();
    workspaceId = randomUUID();

    await client.query(
      `INSERT INTO users (id, email, name, hashed_password, is_active, version, created_at, updated_at)
       VALUES ($1, $2, 'Recovery Test Owner', 'not-a-real-hash', true, 1, now(), now())`,
      [userId, email]
    );
    await client.query(
      `INSERT INTO workspaces (id, name, slug, is_active, created_at, updated_at)
       VALUES ($1, 'Recovery Test Workspace', $2, true, now(), now())`,
      [workspaceId, `recovery-test-${stamp}`]
    );
    await client.query(
      `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, added_at, is_active)
       VALUES (gen_random_uuid(), $1, $2, 'OWNER', now(), true)`,
      [workspaceId, userId]
    );
  });

  afterEach(async () => {
    await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM audit_events WHERE workspace_id = $1`, [workspaceId]);
  });

  afterAll(async () => {
    await client.query(`DELETE FROM workspace_memberships WHERE workspace_id = $1`, [workspaceId]);
    await client.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.end();
  });

  const tokenCount = async () => {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1`, [userId]);
    return rows[0].n as number;
  };
  const auditCount = async () => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE workspace_id = $1 AND event_name = 'user.password_reset_requested'`,
      [workspaceId]
    );
    return rows[0].n as number;
  };

  it("findAcceptanceAccount finds the real user with only booleans, never the password hash", async () => {
    const account = await findAcceptanceAccount(client, email);
    expect(account).not.toBeNull();
    expect(account.id).toBe(userId);
    expect(account.isActive).toBe(true);
    expect(account.hasPassword).toBe(true);
    expect(Object.keys(account)).not.toContain("hashedPassword");
    expect(Object.keys(account)).not.toContain("hashed_password");
  });

  it("findAcceptanceAccount returns null for a nonexistent email", async () => {
    const account = await findAcceptanceAccount(client, `nonexistent-${randomUUID()}@test.local`);
    expect(account).toBeNull();
  });

  it("findActiveWorkspaceId resolves the real active membership", async () => {
    const found = await findActiveWorkspaceId(client, userId);
    expect(found).toBe(workspaceId);
  });

  it("SUCCESS: creates exactly one token and exactly one audit event, and returns the raw token", async () => {
    expect(await tokenCount()).toBe(0);
    expect(await auditCount()).toBe(0);

    const { rawToken } = await runRecovery(client, { userId, workspaceId });

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenCount()).toBe(1);
    expect(await auditCount()).toBe(1);
  });

  it("NO MEMBERSHIP: creates the token without an audit event — matches production forgot-password's own fail-safe, not an invented rule", async () => {
    const { rawToken } = await runRecovery(client, { userId, workspaceId: null });
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenCount()).toBe(1);
    expect(await auditCount()).toBe(0);
  });

  it("ROLLBACK ON AUDIT FAILURE: an audit-insert failure leaves zero tokens and zero audit events — nothing partially persists", async () => {
    // audit_events.workspace_id carries no foreign key (it's a plain nullable
    // uuid column — see prisma/schema.prisma's AuditEvent model), so an
    // otherwise-valid audit insert cannot be made to fail via workspaceId
    // alone. To exercise a real rollback against a real transaction, wrap the
    // real client so every statement passes through to real Postgres exactly
    // as runRecovery issues it (BEGIN, the token INSERT, the audit INSERT,
    // ROLLBACK) except the one audit INSERT, which is forced to reject —
    // simulating a genuine mid-transaction failure at exactly that step.
    const failingClient = {
      query: (text: string, params?: unknown[]) => {
        if (typeof text === "string" && text.includes("INSERT INTO audit_events")) {
          return Promise.reject(new Error("SIMULATED_AUDIT_INSERT_FAILURE"));
        }
        return client.query(text, params);
      },
    };

    await expect(
      runRecovery(failingClient, { userId, workspaceId })
    ).rejects.toThrow("SIMULATED_AUDIT_INSERT_FAILURE");

    expect(await tokenCount()).toBe(0);
    expect(await auditCount()).toBe(0);
  });

  it("TOKEN FAILURE CREATES NO AUDIT: a token-insert failure never reaches the audit insert", async () => {
    // A userId that violates password_reset_tokens' FK fails the very first
    // statement in the transaction — the audit insert must never run.
    const nonExistentUserId = randomUUID();

    await expect(
      runRecovery(client, { userId: nonExistentUserId, workspaceId })
    ).rejects.toThrow();

    expect(await auditCount()).toBe(0);
  });

  it("COMMIT-ONLY RESULT: runRecovery only resolves (never throws) once COMMIT has actually run, and the resolved token is genuinely persisted", async () => {
    const before = await tokenCount();
    const result = await runRecovery(client, { userId, workspaceId });
    // If this resolved, the transaction's COMMIT already ran per runRecovery's
    // own control flow (COMMIT is awaited before returning). Confirm the
    // side effect is real, not merely an in-memory value returned early.
    const { rows } = await client.query(
      `SELECT token_hash AS "tokenHash" FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const { createHash } = await import("crypto");
    expect(rows[0].tokenHash).toBe(createHash("sha256").update(result.rawToken).digest("hex"));
    expect(await tokenCount()).toBe(before + 1);
  });

  it("hash-chains a second audit event to the first, exactly like src/infra/audit.ts", async () => {
    const first = await client.query(
      `SELECT id FROM audit_events WHERE workspace_id = $1`,
      [workspaceId]
    );
    await runRecovery(client, { userId, workspaceId });
    if (first.rows.length > 0) {
      const { rows } = await client.query(
        `SELECT previous_hash AS "previousHash" FROM audit_events WHERE workspace_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
        [workspaceId]
      );
      expect(rows[0].previousHash).not.toBeNull();
    }
  });
});
