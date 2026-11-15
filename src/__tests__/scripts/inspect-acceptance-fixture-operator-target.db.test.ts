/**
 * Real-Postgres tests for scripts/inspect-acceptance-fixture-operator-target.ts, the strictly read-only
 * inspector behind the DISCOVER and DRY_RUN modes of provision-acceptance-fixture-operator.yml.
 *
 * Proves, against a real database: fail-closed handling of a missing/inactive user and of a user with no
 * active workspace; that workspace resolution is the provisioner's own (and the authorization loader's) "first
 * active membership, addedAt then workspaceId" contract; correct system_admin / acceptance_fixture_operator
 * detection; zero writes and zero audit events; that no credential, URL or email reaches the output; that a
 * read-only session is honoured and required; and a full local rehearsal of the workflow's DRY_RUN sequence
 * (inspect, provisioner dry run, inspect, identical state fingerprint).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/scripts/inspect-acceptance-fixture-operator-target.db.test.ts
 */
import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { execFileSync } from "child_process";
import path from "path";
import { Client } from "pg";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { ROLES } from "@/domain/constants/roles";
import { resolvePrimaryWorkspaceId } from "../../../scripts/provision-acceptance-fixture-operator";
import { inspectAcceptanceFixtureTarget, InspectionError, renderInspection } from "../../../scripts/inspect-acceptance-fixture-operator-target";

const INSPECTOR = path.resolve(process.cwd(), "scripts/inspect-acceptance-fixture-operator-target.ts");
const PROVISIONER = path.resolve(process.cwd(), "scripts/provision-acceptance-fixture-operator.ts");
const RAW_DB_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
const EXPECTED_HOST = RAW_DB_URL ? new URL(RAW_DB_URL).hostname : "";
const READ_ONLY = "-c default_transaction_read_only=on";

interface Seeded {
  userId: string;
  email: string;
  workspaces: string[];
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] inspect-acceptance-fixture-operator-target", () => {
  const seededUsers: string[] = [];
  const seededWorkspaces: string[] = [];

  afterEach(async () => {
    for (const userId of seededUsers.splice(0)) {
      await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
      await db.workspaceMembership.deleteMany({ where: { userId } }).catch(() => undefined);
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    for (const id of seededWorkspaces.splice(0)) await db.workspace.delete({ where: { id } }).catch(() => undefined);
  });

  async function seedUser(opts: { isActive?: boolean } = {}): Promise<{ userId: string; email: string }> {
    const userId = randomUUID();
    const email = `inspect-target-${userId}@example.com`;
    await db.user.create({ data: { id: userId, email, isActive: opts.isActive ?? true, updatedAt: new Date() } });
    seededUsers.push(userId);
    return { userId, email };
  }

  async function seedWorkspace(): Promise<string> {
    const id = randomUUID();
    await db.workspace.create({ data: { id, name: "Inspect target WS", slug: `inspect-target-${id.substring(0, 8)}` } });
    seededWorkspaces.push(id);
    return id;
  }

  async function seedWithWorkspace(): Promise<Seeded> {
    const { userId, email } = await seedUser();
    const ws = await seedWorkspace();
    await db.workspaceMembership.create({ data: { userId, workspaceId: ws, role: "owner", isActive: true } });
    return { userId, email, workspaces: [ws] };
  }

  const assign = (userId: string, role: string, scopeId: string | null, extra: Record<string, unknown> = {}) =>
    db.userRoleAssignment.create({
      data: { id: randomUUID(), userId, role, scope: scopeId ? "workspace" : null, scopeId, isActive: true, ...extra },
    });

  function runCli(args: string[], extra: Record<string, string>, script = INSPECTOR) {
    try {
      const stdout = execFileSync("npx", ["tsx", script, ...args], { encoding: "utf8", env: { ...process.env, ...extra }, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
      return { status: 0, stdout, stderr: "" };
    } catch (error: unknown) {
      const e = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
      return { status: typeof e.status === "number" ? e.status : 1, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
    }
  }
  const line = (stdout: string, key: string) => stdout.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);

  describe("fail-closed", () => {
    it("a missing user fails closed", async () => {
      await expect(inspectAcceptanceFixtureTarget(`nobody-${randomUUID()}@example.com`)).rejects.toThrow(InspectionError);
    });

    it("an empty email fails closed", async () => {
      await expect(inspectAcceptanceFixtureTarget("   ")).rejects.toThrow(/not set or is empty/);
    });

    it("an inactive user fails closed", async () => {
      const { userId, email } = await seedUser({ isActive: false });
      const ws = await seedWorkspace();
      await db.workspaceMembership.create({ data: { userId, workspaceId: ws, role: "owner", isActive: true } });
      await expect(inspectAcceptanceFixtureTarget(email)).rejects.toThrow(/not active/);
    });

    it("a user with no workspace membership at all fails closed", async () => {
      const { email } = await seedUser();
      await expect(inspectAcceptanceFixtureTarget(email)).rejects.toThrow(/no active workspace membership/);
    });

    it("a user whose only membership is inactive fails closed", async () => {
      const { userId, email } = await seedUser();
      const ws = await seedWorkspace();
      await db.workspaceMembership.create({ data: { userId, workspaceId: ws, role: "owner", isActive: false } });
      await expect(inspectAcceptanceFixtureTarget(email)).rejects.toThrow(/no active workspace membership/);
    });

    it("failure messages never contain the email", async () => {
      const email = `nobody-${randomUUID()}@example.com`;
      await expect(inspectAcceptanceFixtureTarget(email)).rejects.not.toThrow(email);
    });
  });

  describe("canonical workspace resolution matches the provisioner", () => {
    it("resolves the earliest ACTIVE membership by addedAt, skipping an earlier inactive one", async () => {
      const { userId, email } = await seedUser();
      const [inactiveEarliest, activeEarlier, activeLater] = [await seedWorkspace(), await seedWorkspace(), await seedWorkspace()];
      await db.workspaceMembership.create({ data: { userId, workspaceId: inactiveEarliest, role: "owner", isActive: false, addedAt: new Date("2026-01-01T00:00:00Z") } });
      await db.workspaceMembership.create({ data: { userId, workspaceId: activeLater, role: "owner", isActive: true, addedAt: new Date("2026-03-01T00:00:00Z") } });
      await db.workspaceMembership.create({ data: { userId, workspaceId: activeEarlier, role: "owner", isActive: true, addedAt: new Date("2026-02-01T00:00:00Z") } });

      const inspection = await inspectAcceptanceFixtureTarget(email);
      expect(inspection.primaryWorkspaceId).toBe(activeEarlier);
      expect(inspection.primaryWorkspaceId).toBe(await resolvePrimaryWorkspaceId(userId));
    });

    it("breaks an addedAt tie by the lower workspaceId, exactly like the provisioner", async () => {
      const { userId, email } = await seedUser();
      const [a, b] = [await seedWorkspace(), await seedWorkspace()];
      const sameInstant = new Date("2026-02-01T00:00:00Z");
      await db.workspaceMembership.create({ data: { userId, workspaceId: a, role: "owner", isActive: true, addedAt: sameInstant } });
      await db.workspaceMembership.create({ data: { userId, workspaceId: b, role: "owner", isActive: true, addedAt: sameInstant } });

      const inspection = await inspectAcceptanceFixtureTarget(email);
      expect(inspection.primaryWorkspaceId).toBe([a, b].sort()[0]);
      expect(inspection.primaryWorkspaceId).toBe(await resolvePrimaryWorkspaceId(userId));
    });
  });

  describe("role detection", () => {
    it("reports NO / NO for an ordinary owner with no operator roles", async () => {
      const { userId, email, workspaces } = await seedWithWorkspace();
      await assign(userId, ROLES.BETA_REQUEST_OPERATOR, workspaces[0]);
      const i = await inspectAcceptanceFixtureTarget(email);
      expect(i.systemAdmin).toBe(false);
      expect(i.acceptanceFixtureOperator).toBe(false);
      expect(i.activeRoles).toEqual([ROLES.BETA_REQUEST_OPERATOR]);
    });

    it("detects an active system_admin (YES), in the resolved workspace or any other scope", async () => {
      const inWorkspace = await seedWithWorkspace();
      await assign(inWorkspace.userId, ROLES.SYSTEM_ADMIN, inWorkspace.workspaces[0]);
      expect((await inspectAcceptanceFixtureTarget(inWorkspace.email)).systemAdmin).toBe(true);

      const unscoped = await seedWithWorkspace();
      await assign(unscoped.userId, ROLES.SYSTEM_ADMIN, null);
      expect((await inspectAcceptanceFixtureTarget(unscoped.email)).systemAdmin).toBe(true);
    });

    it("a revoked or deactivated system_admin is NOT reported as held", async () => {
      const revoked = await seedWithWorkspace();
      await assign(revoked.userId, ROLES.SYSTEM_ADMIN, revoked.workspaces[0], { isActive: false, revokedAt: new Date() });
      expect((await inspectAcceptanceFixtureTarget(revoked.email)).systemAdmin).toBe(false);

      const deactivated = await seedWithWorkspace();
      await assign(deactivated.userId, ROLES.SYSTEM_ADMIN, deactivated.workspaces[0], { isActive: false });
      expect((await inspectAcceptanceFixtureTarget(deactivated.email)).systemAdmin).toBe(false);
    });

    it("detects an active acceptance_fixture_operator in the resolved workspace", async () => {
      const s = await seedWithWorkspace();
      await assign(s.userId, ROLES.ACCEPTANCE_FIXTURE_OPERATOR, s.workspaces[0]);
      const i = await inspectAcceptanceFixtureTarget(s.email);
      expect(i.acceptanceFixtureOperator).toBe(true);
      expect(i.acceptanceFixtureOperatorInResolvedWorkspace).toBe(true);
      expect(i.acceptanceFixtureOperatorRevokedRow).toBe(false);
      expect(i.systemAdmin).toBe(false);
    });

    it("an acceptance_fixture_operator scoped to ANOTHER workspace is held, but not in the resolved workspace", async () => {
      const s = await seedWithWorkspace();
      const other = await seedWorkspace();
      await assign(s.userId, ROLES.ACCEPTANCE_FIXTURE_OPERATOR, other);
      const i = await inspectAcceptanceFixtureTarget(s.email);
      expect(i.acceptanceFixtureOperator).toBe(true);
      expect(i.acceptanceFixtureOperatorInResolvedWorkspace).toBe(false);
    });

    it("a revoked acceptance_fixture_operator row is reported as a revoked row, not as held (a grant would reactivate it)", async () => {
      const s = await seedWithWorkspace();
      await assign(s.userId, ROLES.ACCEPTANCE_FIXTURE_OPERATOR, s.workspaces[0], { isActive: false, revokedAt: new Date() });
      const i = await inspectAcceptanceFixtureTarget(s.email);
      expect(i.acceptanceFixtureOperator).toBe(false);
      expect(i.acceptanceFixtureOperatorRevokedRow).toBe(true);
      expect(i.acceptanceRoleAssignmentRows).toBe(1);
    });

    it("lists only live roles, sorted and de-duplicated", async () => {
      const s = await seedWithWorkspace();
      await assign(s.userId, ROLES.ADMINISTRATION_OPERATOR, s.workspaces[0]);
      await assign(s.userId, ROLES.BETA_REQUEST_OPERATOR, s.workspaces[0]);
      await assign(s.userId, ROLES.SYSTEM_ADMIN, s.workspaces[0], { isActive: false, revokedAt: new Date() });
      expect((await inspectAcceptanceFixtureTarget(s.email)).activeRoles).toEqual([ROLES.ADMINISTRATION_OPERATOR, ROLES.BETA_REQUEST_OPERATOR].sort());
    });
  });

  describe("read-only: no writes, no audit events", () => {
    // Everything is scoped to THIS user. A table-wide audit count would also see the role-audit events other DB test
    // files write while they run in parallel, and fail for reasons that have nothing to do with the inspector.
    const counts = async (userId: string) => ({
      roleRows: await db.userRoleAssignment.count({ where: { userId } }),
      memberships: await db.workspaceMembership.count({ where: { userId } }),
      users: await db.user.count({ where: { id: userId } }),
      audit: await db.auditEvent.count({ where: { payload: { path: ["targetUserId"], equals: userId } } }),
    });

    it("inspecting changes no row and emits no audit event, and the fingerprint is stable", async () => {
      const s = await seedWithWorkspace();
      await assign(s.userId, ROLES.ACCEPTANCE_FIXTURE_OPERATOR, s.workspaces[0], { isActive: false, revokedAt: new Date() });
      const before = await counts(s.userId);
      const first = renderInspection(await inspectAcceptanceFixtureTarget(s.email));
      const second = renderInspection(await inspectAcceptanceFixtureTarget(s.email));
      expect(await counts(s.userId)).toEqual(before);
      expect(second).toEqual(first);
    });

    it("the CLI changes no row, emits no audit event and prints no email, URL or password", () => {
      return (async () => {
        const s = await seedWithWorkspace();
        const before = await counts(s.userId);
        const r = runCli(["--expected-database-host", EXPECTED_HOST, "--require-read-only"], { PRODUCTION_ACCEPTANCE_EMAIL: s.email, PGOPTIONS: READ_ONLY });
        expect(r.status, r.stderr).toBe(0);
        expect(await counts(s.userId)).toEqual(before);
        const out = `${r.stdout}\n${r.stderr}`;
        expect(out).not.toContain(s.email);
        expect(out).not.toContain(s.userId);
        expect(out).not.toMatch(/postgres(ql)?:\/\//);
        expect(out).toContain(`PRIMARY_WORKSPACE_ID=${s.workspaces[0]}`);
        expect(line(r.stdout, "SYSTEM_ADMIN")).toBe("NO");
        expect(line(r.stdout, "ACCEPTANCE_FIXTURE_OPERATOR")).toBe("NO");
        expect(line(r.stdout, "TARGET_USER_ID")).toBe(`${s.userId.slice(0, 8)}…${s.userId.slice(-4)}`);
      })();
    });
  });

  describe("read-only session", () => {
    it("--require-read-only refuses to run on a session that can write", async () => {
      const s = await seedWithWorkspace();
      const env: Record<string, string> = { PRODUCTION_ACCEPTANCE_EMAIL: s.email };
      const r = runCli(["--expected-database-host", EXPECTED_HOST, "--require-read-only"], { ...env, PGOPTIONS: "" });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("DB_SESSION_READ_ONLY=NO");
      expect(`${r.stdout}${r.stderr}`).toContain("not read-only");
      expect(line(r.stdout, "SYSTEM_ADMIN")).toBeUndefined();
    });

    it("with PGOPTIONS the application's own database client opens a read-only session", async () => {
      const s = await seedWithWorkspace();
      const r = runCli(["--expected-database-host", EXPECTED_HOST, "--require-read-only"], { PRODUCTION_ACCEPTANCE_EMAIL: s.email, PGOPTIONS: READ_ONLY });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain("DB_SESSION_READ_ONLY=YES");
    });

    it("Postgres itself rejects a write on a session opened with the workflow's PGOPTIONS", async () => {
      const s = await seedWithWorkspace();
      const client = new Client({ connectionString: RAW_DB_URL.replace(/\?schema=public$/, ""), options: READ_ONLY });
      await client.connect();
      try {
        await expect(client.query("UPDATE users SET name = 'should-not-write' WHERE id = $1", [s.userId])).rejects.toThrow(/read-only transaction/);
      } finally {
        await client.end();
      }
      expect((await db.user.findUnique({ where: { id: s.userId } }))?.name ?? null).toBeNull();
    });
  });

  describe("rehearsal of the workflow's DRY_RUN sequence (read-only session throughout)", () => {
    it("inspect, provisioner dry run, inspect: zero writes and an identical fingerprint", async () => {
      const s = await seedWithWorkspace();
      const common = { PRODUCTION_ACCEPTANCE_EMAIL: s.email, PGOPTIONS: READ_ONLY };

      const before = runCli(["--expected-database-host", EXPECTED_HOST, "--require-read-only"], common);
      expect(before.status, before.stderr).toBe(0);
      expect(line(before.stdout, "PRIMARY_WORKSPACE_ID")).toBe(s.workspaces[0]);
      const rowsBefore = await db.userRoleAssignment.count({ where: { userId: s.userId } });

      const dry = runCli(["--email", s.email, "--workspace-id", s.workspaces[0], "--expected-database-host", EXPECTED_HOST], { PGOPTIONS: READ_ONLY }, PROVISIONER);
      expect(dry.status, dry.stderr).toBe(0);
      expect(dry.stdout).toContain("Dry run only");
      expect(dry.stdout).toContain('role="acceptance_fixture_operator"');

      const after = runCli(["--expected-database-host", EXPECTED_HOST, "--require-read-only"], common);
      expect(after.status, after.stderr).toBe(0);
      expect(line(after.stdout, "STATE_FINGERPRINT")).toBe(line(before.stdout, "STATE_FINGERPRINT"));
      expect(await db.userRoleAssignment.count({ where: { userId: s.userId } })).toBe(rowsBefore);
      expect(line(after.stdout, "ACCEPTANCE_FIXTURE_OPERATOR")).toBe("NO");
      expect(line(after.stdout, "SYSTEM_ADMIN")).toBe("NO");
    });

    it("the provisioner dry run refuses a pinned workspace that is not the resolved one", async () => {
      const s = await seedWithWorkspace();
      const wrong = randomUUID();
      const dry = runCli(["--email", s.email, "--workspace-id", wrong, "--expected-database-host", EXPECTED_HOST], { PGOPTIONS: READ_ONLY }, PROVISIONER);
      expect(dry.status).toBe(1);
      expect(`${dry.stdout}${dry.stderr}`).toContain("Mismatch");
      expect(await db.userRoleAssignment.count({ where: { userId: s.userId } })).toBe(0);
    });

    it("the inspector and the dry run refuse a wrong database host before touching the database", async () => {
      const s = await seedWithWorkspace();
      const inspect = runCli(["--expected-database-host", "wrong-project.us-east-2.aws.neon.tech", "--require-read-only"], { PRODUCTION_ACCEPTANCE_EMAIL: s.email, PGOPTIONS: READ_ONLY });
      const dry = runCli(["--email", s.email, "--workspace-id", s.workspaces[0], "--expected-database-host", "wrong-project.us-east-2.aws.neon.tech"], { PGOPTIONS: READ_ONLY }, PROVISIONER);
      for (const r of [inspect, dry]) {
        expect(r.status).toBe(1);
        expect(r.stdout).toContain("MATCH=NO");
      }
      expect(inspect.stdout).not.toContain("DB_SESSION_READ_ONLY");
    });
  });
});
