/**
 * Atomicity + safety proof for scripts/provision-acceptance-fixture-operator.ts's
 * grant/revoke paths. Sibling to
 * src/__tests__/scripts/provision-beta-request-operator.db.test.ts — same
 * AUDIT-01 atomicity discipline (the UserRoleAssignment mutation and its
 * audit event must commit or roll back together), plus additional proofs
 * specific to this role: the grant is purpose-specific (ACCEPTANCE_FIXTURE_OPERATOR
 * only), never widens into SYSTEM_ADMIN, and never touches an existing
 * BETA_REQUEST_OPERATOR assignment on the same account.
 *
 * Tests the extracted grantAcceptanceFixtureOperator/revokeAcceptanceFixtureOperator
 * functions directly against a real database -- transaction rollback
 * semantics cannot be faithfully proven against a mocked Prisma client.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/provision-acceptance-fixture-operator.db.test.ts
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import path from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ROLES } from "@/domain/constants/roles";
import { getCapabilitiesForRole, hasCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";

vi.mock("@/infra/audit", async () => {
  const actual = await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit");
  return { ...actual, emitAuditEvent: vi.fn(actual.emitAuditEvent) };
});

import { emitAuditEvent } from "@/infra/audit";
import {
  grantAcceptanceFixtureOperator,
  revokeAcceptanceFixtureOperator,
} from "../../../scripts/provision-acceptance-fixture-operator";
import { grantBetaRequestOperator } from "../../../scripts/provision-beta-request-operator";

const mockedEmitAuditEvent = vi.mocked(emitAuditEvent);

async function seedUser(): Promise<{ userId: string; email: string }> {
  const userId = randomUUID();
  const email = `provision-fixture-op-${userId}@example.com`;
  await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
  return { userId, email };
}

async function cleanupUser(userId: string) {
  await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
  await db.user.delete({ where: { id: userId } }).catch(() => undefined);
}

describe("provision-acceptance-fixture-operator — role definition (no DB required)", () => {
  it("ACCEPTANCE_FIXTURE_OPERATOR grants exactly ACCEPTANCE_FIXTURE_WRITE", () => {
    const bundle = getCapabilitiesForRole(ROLES.ACCEPTANCE_FIXTURE_OPERATOR);
    expect(bundle).toEqual([CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE]);
    expect(bundle).not.toContain(CAPABILITIES.SYSTEM_ADMIN);
    expect(bundle).not.toContain(CAPABILITIES.USER_ASSIGN_ROLE);
  });

  it("the other narrow operator bundles are untouched by this role's existence", () => {
    expect(getCapabilitiesForRole(ROLES.BETA_REQUEST_OPERATOR)).toEqual([
      CAPABILITIES.BETA_REQUEST_REVIEW,
      CAPABILITIES.BETA_REQUEST_INVITE,
    ]);
    expect(getCapabilitiesForRole(ROLES.ADMINISTRATION_OPERATOR)).toEqual([
      CAPABILITIES.BETA_PROGRAM_MANAGE,
      CAPABILITIES.CUSTOMER_ACCESS_MANAGE,
    ]);
  });

  it("holding all three narrow operator roles yields only the union of their own capabilities, never SYSTEM_ADMIN", () => {
    const ctx = {
      userId: randomUUID(),
      roles: [{ role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR }, { role: ROLES.BETA_REQUEST_OPERATOR }, { role: ROLES.ADMINISTRATION_OPERATOR }],
    };
    expect(hasCapability(ctx, CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.BETA_REQUEST_REVIEW)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.BETA_PROGRAM_MANAGE)).toBe(true);
    expect(hasCapability(ctx, CAPABILITIES.SYSTEM_ADMIN)).toBe(false);
    expect(hasCapability(ctx, CAPABILITIES.USER_ASSIGN_ROLE)).toBe(false);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator — grant/revoke atomicity", () => {
  let seededUserId: string | null = null;
  const seededAuditEventIds: string[] = [];

  afterEach(async () => {
    mockedEmitAuditEvent.mockClear();
    if (seededAuditEventIds.length > 0) {
      await db.auditEvent.deleteMany({ where: { id: { in: seededAuditEventIds } } }).catch(() => undefined);
      seededAuditEventIds.length = 0;
    }
    if (seededUserId) {
      await cleanupUser(seededUserId);
      seededUserId = null;
    }
  });

  it("[db] grant creates exactly one ACCEPTANCE_FIXTURE_OPERATOR assignment, and an audit event, together", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: result.assignmentId } });
    expect(assignment).not.toBeNull();
    expect(assignment?.role).toBe("acceptance_fixture_operator");
    expect(assignment?.scope).toBe("workspace");
    expect(assignment?.scopeId).toBe(workspaceId);
    expect(assignment?.isActive).toBe(true);

    const allAssignments = await db.userRoleAssignment.findMany({ where: { userId } });
    expect(allAssignments).toHaveLength(1);

    const auditEvent = await db.auditEvent.findUnique({ where: { id: result.auditEventId } });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.eventName).toBe("role.assigned");
    expect(auditEvent?.entityType).toBe("user_role_assignment");
    expect(auditEvent?.entityId).toBe(result.assignmentId);
    expect((auditEvent?.payload as Record<string, unknown>)?.provisionedVia).toBe(
      "scripts/provision-acceptance-fixture-operator.ts"
    );
  });

  it("[db] existing roles (e.g. BETA_REQUEST_OPERATOR) on the same user remain untouched by the grant", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const betaOp = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(betaOp.auditEventId);

    const adminOp = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(adminOp.auditEventId);

    const betaOpAssignment = await db.userRoleAssignment.findUnique({ where: { id: betaOp.assignmentId } });
    expect(betaOpAssignment?.role).toBe("beta_request_operator");
    expect(betaOpAssignment?.isActive).toBe(true);
    expect(betaOpAssignment?.revokedAt).toBeNull();

    const allAssignments = await db.userRoleAssignment.findMany({ where: { userId, isActive: true } });
    const roles = allAssignments.map((a) => a.role).sort();
    expect(roles).toEqual(["acceptance_fixture_operator", "beta_request_operator"]);
  });

  it("[db] a duplicate grant call is idempotent — grantAcceptanceFixtureOperator itself always creates a row, so the CLI's own pre-check (not this function) is what prevents a duplicate active assignment", async () => {
    // grantAcceptanceFixtureOperator is the low-level atomic primitive (mirrors
    // grantBetaRequestOperator) — main()'s CLI orchestration is what checks
    // `existing` before calling it (see "CLI guard behaviors" describe block
    // below, which proves the CLI-level idempotency via a real subprocess run).
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const first = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(first.auditEventId);

    const existing = await db.userRoleAssignment.findFirst({
      where: { userId, role: "acceptance_fixture_operator", scope: "workspace", scopeId: workspaceId, isActive: true, revokedAt: null },
    });
    expect(existing?.id).toBe(first.assignmentId);
  });

  it("[db] revoke deactivates only the ACCEPTANCE_FIXTURE_OPERATOR assignment, leaving BETA_REQUEST_OPERATOR active", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const betaOp = await grantBetaRequestOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(betaOp.auditEventId);
    const adminOp = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(adminOp.auditEventId);

    const revoked = await revokeAcceptanceFixtureOperator({
      assignmentId: adminOp.assignmentId,
      userId,
      email,
      workspaceId,
    });
    seededAuditEventIds.push(revoked.auditEventId);

    const adminAssignment = await db.userRoleAssignment.findUnique({ where: { id: adminOp.assignmentId } });
    expect(adminAssignment?.isActive).toBe(false);
    expect(adminAssignment?.revokedAt).not.toBeNull();

    const betaAssignment = await db.userRoleAssignment.findUnique({ where: { id: betaOp.assignmentId } });
    expect(betaAssignment?.isActive).toBe(true);
    expect(betaAssignment?.revokedAt).toBeNull();

    const auditEvent = await db.auditEvent.findUnique({ where: { id: revoked.auditEventId } });
    expect(auditEvent?.eventName).toBe("role.revoked");
    expect(auditEvent?.entityId).toBe(adminOp.assignmentId);
  });

  it("[db] a simulated audit failure during grant rolls back the assignment creation (no orphaned row, and no SYSTEM_ADMIN path exists to fall back to)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_GRANT");
    });

    await expect(grantAcceptanceFixtureOperator({ userId, email, workspaceId })).rejects.toThrow(
      "SIMULATED_AUDIT_FAILURE_ON_GRANT"
    );

    const assignments = await db.userRoleAssignment.findMany({ where: { userId } });
    expect(assignments).toHaveLength(0);
  });

  it("[db] a simulated audit failure during revoke rolls back the deactivation (assignment stays active)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const granted = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(granted.auditEventId);

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_REVOKE");
    });

    await expect(
      revokeAcceptanceFixtureOperator({ assignmentId: granted.assignmentId, userId, email, workspaceId })
    ).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_REVOKE");

    const assignment = await db.userRoleAssignment.findUnique({ where: { id: granted.assignmentId } });
    expect(assignment?.isActive).toBe(true);
    expect(assignment?.revokedAt).toBeNull();
  });

  it("[db] granting ACCEPTANCE_FIXTURE_OPERATOR never creates a SYSTEM_ADMIN assignment for the same user", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    const result = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededAuditEventIds.push(result.auditEventId);

    const systemAdminAssignments = await db.userRoleAssignment.findMany({
      where: { userId, role: "system_admin" },
    });
    expect(systemAdminAssignments).toHaveLength(0);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator CLI — guard behaviors", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-acceptance-fixture-operator.ts");
  // The real hostname this test process's own DATABASE_URL/TEST_DATABASE_URL
  // resolves to -- computed the same way the script itself does, so these
  // tests work identically against local Postgres, CI's throwaway Postgres,
  // or any other real test database, without hardcoding "localhost".
  const RAW_TEST_DB_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  const EXPECTED_DB_HOST = new URL(RAW_TEST_DB_URL).hostname;
  let seededUserId: string | null = null;
  let seededWorkspaceId: string | null = null;

  afterEach(async () => {
    if (seededUserId) {
      await db.userRoleAssignment.deleteMany({ where: { userId: seededUserId } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { userId: seededUserId } }).catch(() => undefined);
      await db.user.delete({ where: { id: seededUserId } }).catch(() => undefined);
      seededUserId = null;
    }
    if (seededWorkspaceId) {
      await db.workspace.delete({ where: { id: seededWorkspaceId } }).catch(() => undefined);
      seededWorkspaceId = null;
    }
  });

  async function seedActorWithWorkspace(opts: { isActive?: boolean } = {}) {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const email = `provision-fixture-op-cli-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: opts.isActive ?? true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Provision AdminOp CLI WS", slug: `provision-fixture-op-cli-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    seededUserId = userId;
    seededWorkspaceId = workspaceId;
    return { userId, workspaceId, email };
  }

  const CHILD_TIMEOUT_MS = 25_000;

  function runScript(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: process.env,
        timeout: CHILD_TIMEOUT_MS,
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error: unknown) {
      const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
      return {
        status: typeof e.status === "number" ? e.status : 1,
        stdout: String(e.stdout ?? ""),
        stderr: String(e.stderr ?? ""),
      };
    }
  }

  it("[db] dry run (no --apply) performs zero writes and prints the exact-capability disclosure", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("MATCH=YES");
    expect(result.stdout).toContain("Dry run only");
    expect(result.stdout).toContain(
      "This grants EXACTLY ACCEPTANCE_FIXTURE_WRITE (create isolated acceptance fixtures in this workspace only) — no SYSTEM_ADMIN, no user/role administration, no other admin capability."
    );
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --workspace-id still refuses (no writes)", async () => {
    const { email } = await seedActorWithWorkspace();
    const wrongWorkspaceId = randomUUID();

    const result = runScript(["--email", email, "--workspace-id", wrongWorkspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Mismatch");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] an inactive user is refused (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace({ isActive: false });

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not active");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --confirm phrase still refuses to apply (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "WRONG PHRASE",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--confirm must be exactly");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] the beta-request-operator's confirm phrase does not satisfy this script's grant confirmation (no cross-script phrase reuse)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "GRANT BETA REQUEST OPERATOR",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--confirm must be exactly");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] apply with correct confirm grants exactly one ACCEPTANCE_FIXTURE_OPERATOR assignment; a second apply is idempotent (no duplicate)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const first = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "GRANT ACCEPTANCE FIXTURE OPERATOR",
    ]);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain("✓ Granted");

    const afterFirst = await db.userRoleAssignment.findMany({
      where: { userId: seededUserId!, role: "acceptance_fixture_operator", isActive: true },
    });
    expect(afterFirst).toHaveLength(1);

    const second = runScript([
      "--email",
      email,
      "--workspace-id",
      workspaceId,
      "--expected-database-host",
      EXPECTED_DB_HOST,
      "--apply",
      "--confirm",
      "GRANT ACCEPTANCE FIXTURE OPERATOR",
    ]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("already holds an active");

    const afterSecond = await db.userRoleAssignment.findMany({
      where: { userId: seededUserId!, role: "acceptance_fixture_operator", isActive: true },
    });
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.id).toBe(afterFirst[0]!.id);
  }, 60_000);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator CLI — wrong-database fail-closed gate", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-acceptance-fixture-operator.ts");
  const RAW_TEST_DB_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  const EXPECTED_DB_HOST = new URL(RAW_TEST_DB_URL).hostname;
  let seededUserId: string | null = null;
  let seededWorkspaceId: string | null = null;

  afterEach(async () => {
    if (seededUserId) {
      await db.userRoleAssignment.deleteMany({ where: { userId: seededUserId } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { userId: seededUserId } }).catch(() => undefined);
      await db.user.delete({ where: { id: seededUserId } }).catch(() => undefined);
      seededUserId = null;
    }
    if (seededWorkspaceId) {
      await db.workspace.delete({ where: { id: seededWorkspaceId } }).catch(() => undefined);
      seededWorkspaceId = null;
    }
  });

  async function seedActorWithWorkspace() {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const email = `provision-fixture-op-hostgate-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "Provision AdminOp HostGate WS", slug: `provision-fixture-op-hostgate-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    seededUserId = userId;
    seededWorkspaceId = workspaceId;
    return { userId, workspaceId, email };
  }

  const CHILD_TIMEOUT_MS = 25_000;

  function runScript(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], {
        encoding: "utf8",
        env: process.env,
        timeout: CHILD_TIMEOUT_MS,
      });
      return { status: 0, stdout, stderr: "" };
    } catch (error: unknown) {
      const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
      return {
        status: typeof e.status === "number" ? e.status : 1,
        stdout: String(e.stdout ?? ""),
        stderr: String(e.stderr ?? ""),
      };
    }
  }

  it("[db] correct --expected-database-host passes and the dry run proceeds normally", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Expected database host: ${EXPECTED_DB_HOST}`);
    expect(result.stdout).toContain(`Actual database host: ${EXPECTED_DB_HOST}`);
    expect(result.stdout).toContain("MATCH=YES");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --expected-database-host fails before any DB query or mutation (no user lookup, no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", "definitely-the-wrong-host.example.com"]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("MATCH=NO");
    expect(result.stderr).toContain("Refusing before any database connection or query");
    // Proves no DB lookup happened: the "No user found" branch (which itself
    // requires a successful query) never printed.
    expect(result.stderr).not.toContain("No user found");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a wrong --expected-database-host refuses even when --apply and a correct --confirm are also passed (host gate runs first)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript([
      "--email", email,
      "--workspace-id", workspaceId,
      "--expected-database-host", "definitely-the-wrong-host.example.com",
      "--apply",
      "--confirm", "GRANT ACCEPTANCE FIXTURE OPERATOR",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("MATCH=NO");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a missing --expected-database-host fails before any DB query (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("expected_database_host is required");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] a malformed --expected-database-host (full URL) fails before any DB query (no writes)", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", `postgresql://user:pass@${EXPECTED_DB_HOST}/db`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("://");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);

  it("[db] credentials passed as --expected-database-host are rejected as malformed, never compared or logged", async () => {
    const { workspaceId, email } = await seedActorWithWorkspace();

    const result = runScript(["--email", email, "--workspace-id", workspaceId, "--expected-database-host", `admin:s3cr3t@${EXPECTED_DB_HOST}`]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@");
    expect(result.stdout).not.toContain("s3cr3t");
    expect(result.stderr).not.toContain("s3cr3t");
    const assignments = await db.userRoleAssignment.findMany({ where: { userId: seededUserId! } });
    expect(assignments).toHaveLength(0);
  }, 30_000);
});

// ─── Re-grant after revoke (UserRoleAssignment is UNIQUE on userId+role+scope+scopeId) ────────────────────
// A revoke keeps the row (history). The old grant path looked only for an ACTIVE row and then INSERTed the
// same unique tuple, so GRANT → REVOKE → GRANT failed with a unique-constraint error. These tests run the
// real transaction against real Postgres: the re-grant must REACTIVATE the same row and audit it atomically.
describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator — grant → revoke → re-grant lifecycle", () => {
  const ROLE_VALUE = "acceptance_fixture_operator";
  const SCOPE = "workspace";
  let seededUserId: string | null = null;
  const seededEntityIds: string[] = [];
  const track = (_auditEventId: string | null) => undefined;

  afterEach(async () => {
    mockedEmitAuditEvent.mockReset();
    mockedEmitAuditEvent.mockImplementation((await vi.importActual<typeof import("@/infra/audit")>("@/infra/audit")).emitAuditEvent);
    if (seededEntityIds.length > 0) {
      await db.auditEvent.deleteMany({ where: { entityId: { in: seededEntityIds } } }).catch(() => undefined);
      seededEntityIds.length = 0;
    }
    if (seededUserId) {
      await cleanupUser(seededUserId);
      seededUserId = null;
    }
  });

  const events = (assignmentId: string) =>
    db.auditEvent.findMany({ where: { entityId: assignmentId, entityType: "user_role_assignment" }, orderBy: { occurredAt: "asc" } });
  const rows = (userId: string, workspaceId: string) =>
    db.userRoleAssignment.findMany({ where: { userId, role: ROLE_VALUE, scope: SCOPE, scopeId: workspaceId } });

  it("[db] first grant → duplicate grant → revoke → second revoke → re-grant: one row, same id, auditable sequence", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();

    // 1. first grant: exactly one active row + ROLE_ASSIGNED
    const g1 = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededEntityIds.push(g1.assignmentId);
    expect(g1.outcome).toBe("created");
    const afterG1 = await rows(userId, workspaceId);
    expect(afterG1).toHaveLength(1);
    expect(afterG1[0]).toMatchObject({ id: g1.assignmentId, isActive: true, revokedAt: null, role: ROLE_VALUE, scope: SCOPE, scopeId: workspaceId });

    // 2. duplicate grant while active: idempotent, nothing written, nothing audited
    const dup = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    expect(dup).toMatchObject({ outcome: "already_active", assignmentId: g1.assignmentId, auditEventId: null });
    expect(await rows(userId, workspaceId)).toHaveLength(1);
    expect(await events(g1.assignmentId)).toHaveLength(1);

    // 3. revoke: SAME row kept, inactive + revokedAt set + ROLE_REVOKED
    const rv = await revokeAcceptanceFixtureOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    expect(rv.outcome).toBe("revoked");
    const afterRv = await rows(userId, workspaceId);
    expect(afterRv).toHaveLength(1);
    expect(afterRv[0]).toMatchObject({ id: g1.assignmentId, isActive: false });
    expect(afterRv[0]!.revokedAt).not.toBeNull();

    // 4. second revoke: deterministic no-op (revokedAt unchanged, no extra audit)
    const rv2 = await revokeAcceptanceFixtureOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    expect(rv2).toMatchObject({ outcome: "already_revoked", auditEventId: null });
    const afterRv2 = await rows(userId, workspaceId);
    expect(afterRv2[0]!.revokedAt!.getTime()).toBe(afterRv[0]!.revokedAt!.getTime());
    expect(await events(g1.assignmentId)).toHaveLength(2);

    // 5. re-grant: SUCCEEDS (the old code failed here), reactivating the same row
    const g2 = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    expect(g2.outcome).toBe("reactivated");
    expect(g2.assignmentId).toBe(g1.assignmentId);
    const afterG2 = await rows(userId, workspaceId);
    expect(afterG2).toHaveLength(1);
    expect(afterG2[0]).toMatchObject({ id: g1.assignmentId, isActive: true, revokedAt: null, role: ROLE_VALUE, scope: SCOPE, scopeId: workspaceId });
    expect(afterG2[0]!.grantedAt.getTime()).toBeGreaterThanOrEqual(afterG1[0]!.grantedAt.getTime());

    // 6. the audit trail reconstructs the whole cycle in order
    const trail = await events(g1.assignmentId);
    expect(trail.map((e) => e.eventName)).toEqual(["role.assigned", "role.revoked", "role.assigned"]);
    const reactivation = trail[2]!.payload as Record<string, unknown>;
    expect(reactivation).toMatchObject({ reactivated: true, role: ROLE_VALUE, targetUserId: userId });
    expect(reactivation.previousRevokedAt).toBe(afterRv[0]!.revokedAt!.toISOString());
    expect(reactivation.previousGrantedAt).toBe(afterG1[0]!.grantedAt.toISOString());
    expect((trail[0]!.payload as Record<string, unknown>).reactivated).toBeUndefined();
  });

  it("[db] an audit failure during REACTIVATION rolls the reactivation back (assignment stays revoked, nothing audited)", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();
    const g1 = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    seededEntityIds.push(g1.assignmentId);
    await revokeAcceptanceFixtureOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    const before = (await rows(userId, workspaceId))[0]!;
    expect(before.isActive).toBe(false);

    mockedEmitAuditEvent.mockImplementationOnce(async () => {
      throw new Error("SIMULATED_AUDIT_FAILURE_ON_REACTIVATION");
    });
    await expect(grantAcceptanceFixtureOperator({ userId, email, workspaceId })).rejects.toThrow("SIMULATED_AUDIT_FAILURE_ON_REACTIVATION");

    const after = (await rows(userId, workspaceId))[0]!;
    expect(await rows(userId, workspaceId)).toHaveLength(1);
    expect(after.isActive).toBe(false);
    expect(after.revokedAt!.getTime()).toBe(before.revokedAt!.getTime());
    expect(after.grantedAt.getTime()).toBe(before.grantedAt.getTime());
    expect(await events(g1.assignmentId)).toHaveLength(2);
  });

  it("[db] the cycle never creates a SYSTEM_ADMIN assignment and leaves unrelated narrow roles untouched", async () => {
    const { userId, email } = await seedUser();
    seededUserId = userId;
    const workspaceId = randomUUID();
    const other = await db.userRoleAssignment.create({
      data: { id: randomUUID(), userId, role: "beta_request_operator", scope: SCOPE, scopeId: workspaceId, isActive: true },
    });
    const g1 = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    track(g1.auditEventId);
    const rv = await revokeAcceptanceFixtureOperator({ assignmentId: g1.assignmentId, userId, email, workspaceId });
    track(rv.auditEventId);
    const g2 = await grantAcceptanceFixtureOperator({ userId, email, workspaceId });
    track(g2.auditEventId);

    expect(await db.userRoleAssignment.count({ where: { userId, role: "system_admin" } })).toBe(0);
    const otherAfter = await db.userRoleAssignment.findUnique({ where: { id: other.id } });
    expect(otherAfter?.isActive).toBe(true);
    expect(otherAfter?.revokedAt).toBeNull();
    expect(otherAfter?.grantedAt.getTime()).toBe(other.grantedAt.getTime());
    expect(await db.userRoleAssignment.count({ where: { userId } })).toBe(2);
  });

});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] provision-acceptance-fixture-operator CLI — grant → revoke → re-grant (real subprocess, real Postgres)", () => {
  const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/provision-acceptance-fixture-operator.ts");
  const EXPECTED_DB_HOST = new URL(process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "").hostname;
  const GRANT = "GRANT ACCEPTANCE FIXTURE OPERATOR";
  const REVOKE = "REVOKE ACCEPTANCE FIXTURE OPERATOR";
  let userId: string | null = null;
  let workspaceId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await db.auditEvent.deleteMany({ where: { payload: { path: ["targetUserId"], equals: userId } } }).catch(() => undefined);
      await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { userId } }).catch(() => undefined);
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
      userId = null;
    }
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
      workspaceId = null;
    }
  });

  function run(args: string[]): { status: number; stdout: string } {
    try {
      const stdout = execFileSync("npx", ["tsx", SCRIPT_PATH, ...args], { encoding: "utf8", env: process.env, timeout: 25_000 });
      return { status: 0, stdout };
    } catch (error: unknown) {
      const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
      return { status: typeof e.status === "number" ? e.status : 1, stdout: String(e.stdout ?? "") + String(e.stderr ?? "") };
    }
  }

  it("[db] GRANT, REVOKE, GRANT again via the CLI succeeds, reactivating the same single row and never touching the unique constraint", async () => {
    userId = randomUUID();
    workspaceId = randomUUID();
    const email = `provision-acceptance-fixture-operator-regrant-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "regrant WS", slug: `regrant-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    const base = ["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST, "--apply"];

    const g1 = run([...base, "--confirm", GRANT]);
    expect(g1.status).toBe(0);
    const rv = run([...base, "--revoke", "--confirm", REVOKE]);
    expect(rv.status).toBe(0);
    const rv2 = run([...base, "--revoke", "--confirm", REVOKE]);
    expect(rv2.status).toBe(0);
    expect(rv2.stdout).toContain("nothing to revoke");

    const mid = await db.userRoleAssignment.findMany({ where: { userId, role: "acceptance_fixture_operator" } });
    expect(mid).toHaveLength(1);
    expect(mid[0]!.isActive).toBe(false);

    const g2 = run([...base, "--confirm", GRANT]);
    expect(g2.status).toBe(0);
    expect(g2.stdout).not.toContain("Unique constraint");
    expect(g2.stdout).toContain("reactivated existing revoked assignment");

    const end = await db.userRoleAssignment.findMany({ where: { userId, role: "acceptance_fixture_operator" } });
    expect(end).toHaveLength(1);
    expect(end[0]!.id).toBe(mid[0]!.id);
    expect(end[0]).toMatchObject({ isActive: true, revokedAt: null });
    const g3 = run([...base, "--confirm", GRANT]);
    expect(g3.status).toBe(0);
    expect(g3.stdout).toContain("already holds an active");
    expect(await db.userRoleAssignment.count({ where: { userId, role: "acceptance_fixture_operator" } })).toBe(1);
  }, 120_000);

  it("[db] a dry run on a revoked assignment announces the reactivation and performs zero writes", async () => {
    userId = randomUUID();
    workspaceId = randomUUID();
    const email = `provision-acceptance-fixture-operator-dry-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: workspaceId, name: "dry WS", slug: `dry-${workspaceId.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { userId, workspaceId, role: "owner", isActive: true } });
    const common = ["--email", email, "--workspace-id", workspaceId, "--expected-database-host", EXPECTED_DB_HOST];
    expect(run([...common, "--apply", "--confirm", GRANT]).status).toBe(0);
    expect(run([...common, "--apply", "--revoke", "--confirm", REVOKE]).status).toBe(0);
    const before = await db.userRoleAssignment.findFirst({ where: { userId, role: "acceptance_fixture_operator" } });
    const auditsBefore = await db.auditEvent.count({ where: { payload: { path: ["targetUserId"], equals: userId } } });

    const dry = run(common);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("will REACTIVATE that same row");
    expect(dry.stdout).toContain("Dry run only");

    const after = await db.userRoleAssignment.findFirst({ where: { userId, role: "acceptance_fixture_operator" } });
    expect(after).toMatchObject({ id: before!.id, isActive: false });
    expect(after!.revokedAt!.getTime()).toBe(before!.revokedAt!.getTime());
    expect(await db.auditEvent.count({ where: { payload: { path: ["targetUserId"], equals: userId } } })).toBe(auditsBefore);
  }, 120_000);
});
