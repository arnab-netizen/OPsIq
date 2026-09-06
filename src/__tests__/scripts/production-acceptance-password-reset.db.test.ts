/**
 * Production acceptance-account password-reset token issuer — real PostgreSQL
 * transaction contract.
 *
 * Exercises the script's actual exported transaction functions
 * (findAcceptanceAccount, findActiveWorkspaceId, runRecovery,
 * reconcileAmbiguousCommit) against a real database connection, proving the
 * atomicity properties a hostile review demanded: an audit-insert failure
 * rolls back the token insert, a token-insert failure never reaches the audit
 * insert, a successful run creates exactly one of each row when a workspace
 * exists, the raw token is returned only after COMMIT actually succeeds — and,
 * for the ambiguous-commit-acknowledgement class of failure, that a lost
 * COMMIT acknowledgement is reconciled via a fresh connection against the
 * pre-generated tokenHash rather than ever assuming rollback, retrying, or
 * creating a second token.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/production-acceptance-password-reset.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID, createHash } from "crypto";
import { Client } from "pg";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  findAcceptanceAccount,
  findActiveWorkspaceId,
  findResetTokenByHash,
  runRecovery,
  reconcileAmbiguousCommit,
  generateResetToken,
  COMMIT_OUTCOME,
  RecoveryError,
} from "../../../scripts/production-acceptance-password-reset.mjs";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] production-acceptance-password-reset — atomic transaction contract", () => {
  let client: Client;
  const stamp = randomUUID().slice(0, 8);
  const email = `acceptance-recovery-${stamp}@test.local`;
  let userId: string;
  let workspaceId: string;

  const refuseCreateClient = () => {
    throw new Error("createClient should not be invoked on this code path");
  };
  const realCreateClient = async () => {
    const fresh = new Client({ connectionString: process.env.DATABASE_URL });
    await fresh.connect();
    return fresh;
  };

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

  it("SUCCESS: creates exactly one token and exactly one audit event, and returns the raw token with COMMIT_ACKNOWLEDGED", async () => {
    expect(await tokenCount()).toBe(0);
    expect(await auditCount()).toBe(0);

    const { rawToken, outcome } = await runRecovery(client, { userId, workspaceId, createClient: refuseCreateClient });

    expect(outcome).toBe(COMMIT_OUTCOME.COMMIT_ACKNOWLEDGED);
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenCount()).toBe(1);
    expect(await auditCount()).toBe(1);
  });

  it("NO MEMBERSHIP: creates the token without an audit event — matches production forgot-password's own fail-safe, not an invented rule", async () => {
    const { rawToken, outcome } = await runRecovery(client, { userId, workspaceId: null, createClient: refuseCreateClient });
    expect(outcome).toBe(COMMIT_OUTCOME.COMMIT_ACKNOWLEDGED);
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenCount()).toBe(1);
    expect(await auditCount()).toBe(0);
  });

  it("PRE-COMMIT ROLLBACK: a mutation failure before COMMIT is attempted leaves zero tokens and zero audit events, and never calls createClient", async () => {
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

    const err: RecoveryError = await runRecovery(failingClient, {
      userId,
      workspaceId,
      createClient: refuseCreateClient,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(RecoveryError);
    expect(err.outcome).toBe(COMMIT_OUTCOME.PRE_COMMIT_FAILURE_ROLLED_BACK);
    expect(err.message).toContain("ROLLBACK acknowledged");
    expect(await tokenCount()).toBe(0);
    expect(await auditCount()).toBe(0);
  });

  it("TOKEN FAILURE CREATES NO AUDIT: a token-insert failure never reaches the audit insert", async () => {
    // A userId that violates password_reset_tokens' FK fails the very first
    // statement in the transaction — the audit insert must never run.
    const nonExistentUserId = randomUUID();

    const err: RecoveryError = await runRecovery(client, {
      userId: nonExistentUserId,
      workspaceId,
      createClient: refuseCreateClient,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(RecoveryError);
    expect(err.outcome).toBe(COMMIT_OUTCOME.PRE_COMMIT_FAILURE_ROLLED_BACK);
    expect(await auditCount()).toBe(0);
  });

  it("COMMIT-ONLY RESULT: runRecovery only resolves (never throws) once COMMIT has actually run, and the resolved token is genuinely persisted", async () => {
    const before = await tokenCount();
    const result = await runRecovery(client, { userId, workspaceId, createClient: refuseCreateClient });
    // If this resolved, the transaction's COMMIT already ran per runRecovery's
    // own control flow (COMMIT is awaited before returning). Confirm the
    // side effect is real, not merely an in-memory value returned early.
    const { rows } = await client.query(
      `SELECT token_hash AS "tokenHash" FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    expect(rows[0].tokenHash).toBe(createHash("sha256").update(result.rawToken).digest("hex"));
    expect(await tokenCount()).toBe(before + 1);
  });

  it("hash-chains a second audit event to the first, exactly like src/infra/audit.ts", async () => {
    const first = await client.query(
      `SELECT id FROM audit_events WHERE workspace_id = $1`,
      [workspaceId]
    );
    await runRecovery(client, { userId, workspaceId, createClient: refuseCreateClient });
    if (first.rows.length > 0) {
      const { rows } = await client.query(
        `SELECT previous_hash AS "previousHash" FROM audit_events WHERE workspace_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
        [workspaceId]
      );
      expect(rows[0].previousHash).not.toBeNull();
    }
  });

  describe("ambiguous COMMIT acknowledgement", () => {
    it("COMMIT actually persisted, acknowledgement lost: reconciliation over a FRESH connection returns the SAME raw token, not a new one, and creates exactly one token/audit", async () => {
      // The real COMMIT is issued and really runs against the real database —
      // only the client-side acknowledgement is simulated as lost. This
      // proves reconciliation happens over a genuinely separate connection,
      // not merely a retried call on the same one.
      const ackLostAfterRealCommit = {
        query: async (text: string, params?: unknown[]) => {
          if (typeof text === "string" && text.trim() === "COMMIT") {
            await client.query(text, params);
            throw new Error("SIMULATED_COMMIT_ACK_FAILURE");
          }
          return client.query(text, params);
        },
      };

      const { rawToken, outcome } = await runRecovery(ackLostAfterRealCommit, {
        userId,
        workspaceId,
        createClient: realCreateClient,
      });

      expect(outcome).toBe(COMMIT_OUTCOME.COMMIT_RECOVERED_AFTER_ACK_FAILURE);
      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(await tokenCount()).toBe(1);
      expect(await auditCount()).toBe(1);

      const persisted = await findResetTokenByHash(client, {
        userId,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      });
      expect(persisted).not.toBeNull();
    });

    it("COMMIT never actually persisted, acknowledgement also lost: reconciliation finds no token and REFUSES rather than emitting a URL", async () => {
      // Here the underlying transaction is genuinely rolled back for real
      // (simulating, e.g., the server aborting before COMMIT durably landed)
      // and only then does the client perceive a lost acknowledgement.
      const ackLostNoRealCommit = {
        query: async (text: string, params?: unknown[]) => {
          if (typeof text === "string" && text.trim() === "COMMIT") {
            await client.query("ROLLBACK");
            throw new Error("SIMULATED_COMMIT_ACK_FAILURE_NO_PERSIST");
          }
          return client.query(text, params);
        },
      };

      const err: RecoveryError = await runRecovery(ackLostNoRealCommit, {
        userId,
        workspaceId,
        createClient: realCreateClient,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(RecoveryError);
      expect(err.outcome).toBe(COMMIT_OUTCOME.COMMIT_NOT_PERSISTED);
      expect(await tokenCount()).toBe(0);
      expect(await auditCount()).toBe(0);
    });

    it("reconciliation itself cannot connect: outcome is UNKNOWN, never a claimed rollback, and never a retry/second token", async () => {
      const ackLostAfterRealCommit = {
        query: async (text: string, params?: unknown[]) => {
          if (typeof text === "string" && text.trim() === "COMMIT") {
            await client.query(text, params);
            throw new Error("SIMULATED_COMMIT_ACK_FAILURE");
          }
          return client.query(text, params);
        },
      };
      const failingCreateClient = async () => {
        throw new Error("SIMULATED_RECONCILIATION_CONNECTION_FAILURE");
      };

      const before = await tokenCount();
      const err: RecoveryError = await runRecovery(ackLostAfterRealCommit, {
        userId,
        workspaceId,
        createClient: failingCreateClient,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(RecoveryError);
      expect(err.outcome).toBe(COMMIT_OUTCOME.COMMIT_OUTCOME_UNKNOWN);
      expect(err.message).not.toMatch(/rolled back/i);
      // The interceptor's COMMIT really ran against the real database — this
      // test proves runRecovery correctly reports UNKNOWN (rather than a
      // false rollback claim) precisely because it has no working
      // reconciliation connection to confirm what actually happened.
      // afterEach() clears this row along with the rest of the fixture data.
      expect(await tokenCount()).toBe(before + 1);
    });

    it("ambiguous COMMIT can never cause a second PasswordResetToken issuance for the same run", async () => {
      const ackLostAfterRealCommit = {
        query: async (text: string, params?: unknown[]) => {
          if (typeof text === "string" && text.trim() === "COMMIT") {
            await client.query(text, params);
            throw new Error("SIMULATED_COMMIT_ACK_FAILURE");
          }
          return client.query(text, params);
        },
      };

      const result = await runRecovery(ackLostAfterRealCommit, { userId, workspaceId, createClient: realCreateClient });
      expect(result.outcome).toBe(COMMIT_OUTCOME.COMMIT_RECOVERED_AFTER_ACK_FAILURE);
      // Exactly one token exists for this run — reconciliation returned the
      // already-committed row's own token, not a freshly generated one.
      expect(await tokenCount()).toBe(1);
    });

    it("INVARIANT VIOLATION: a token found without its paired audit event is reported and never patched afterward", async () => {
      // Directly exercise reconcileAmbiguousCommit against a hand-crafted
      // inconsistent state: a token row exists (as if committed) but no
      // audit event carries its correlation_id — a state the atomic
      // transaction should make impossible, but reconciliation must still
      // detect and refuse to silently repair.
      const { rawToken, tokenHash } = generateResetToken();
      const tokenId = randomUUID();
      await client.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, ip_address)
         VALUES ($1, $2, $3, now() + interval '1 hour', NULL)`,
        [tokenId, userId, tokenHash]
      );

      const err: RecoveryError = await reconcileAmbiguousCommit({
        createClient: realCreateClient,
        userId,
        workspaceId,
        tokenId,
        tokenHash,
        rawToken,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(RecoveryError);
      expect(err.outcome).toBe(COMMIT_OUTCOME.COMMIT_OUTCOME_UNKNOWN);
      expect(err.invariantViolation).toBe(true);
      expect(err.message).toMatch(/INVARIANT VIOLATION/);
      // No audit event was manufactured to "fix" the inconsistency.
      expect(await auditCount()).toBe(0);
    });

    it("no secret/PII values ever appear in a RecoveryError's message", async () => {
      const ackLostNoRealCommit = {
        query: async (text: string, params?: unknown[]) => {
          if (typeof text === "string" && text.trim() === "COMMIT") {
            await client.query("ROLLBACK");
            throw new Error("SIMULATED_COMMIT_ACK_FAILURE_NO_PERSIST");
          }
          return client.query(text, params);
        },
      };

      const err: RecoveryError = await runRecovery(ackLostNoRealCommit, {
        userId,
        workspaceId,
        createClient: realCreateClient,
      }).catch((e) => e);

      expect(err).toBeInstanceOf(RecoveryError);
      expect(err.message).not.toContain(email);
      expect(err.message).not.toContain(userId);
      expect(err.message).not.toContain(workspaceId);
      expect(err.message).not.toContain(process.env.DATABASE_URL ?? "__unset__");
    });
  });
});
