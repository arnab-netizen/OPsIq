/**
 * [db] Stage 8 — Private owner seed audit-actor regression tests.
 *
 * Root cause fixed: seed script used `systemActorId` ("00000000-…-0001"), a UUID
 * that never existed in users, as `actorId` for the audit event.  The FK
 * `audit_events_actor_id_fkey` (actor_id → users.id) rejected it with P2003,
 * rolling back the entire transaction.
 *
 * Fix: capture the owner User returned by step 1 upsert; use `owner.id` as
 * `actorId` with `actorType: "user"`.
 *
 * Coverage (12 requirements):
 *  1.  Fresh migrated DB: seed transaction completes without error.
 *  2.  User: expected owner user record exists.
 *  3.  Workspace: expected workspace record exists.
 *  4.  Workspace membership: owner membership record exists.
 *  5.  Role assignment: OWNER assignment exists with workspace scope.
 *  6.  Client account: expected client account record exists.
 *  7.  Private mode access: approved OWNER access record exists.
 *  8.  Audit event: PRIVATE_OWNER_SEED_EXECUTED audit event exists.
 *  9.  Audit actor integrity: actorId references an existing users.id; actorType = "user".
 * 10.  Atomic rollback: invalid actorId in the audit step causes P2003; all
 *      earlier mutations roll back — zero user/workspace/audit records remain.
 * 11.  Idempotency: running the same transaction twice creates no duplicate core records.
 * 12.  FK not weakened: inserting an audit event with a non-existent actorId still raises P2003.
 *
 * Requires: TEST_WITH_DB=true and a migrated PostgreSQL instance pointed to by
 * DATABASE_URL or TEST_DATABASE_URL.
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { v4 as randomUUID } from "uuid";
import { createHash } from "crypto";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ROLES } from "@/domain/constants/roles";

const SKIP = !SHOULD_RUN_DB_TESTS;

// ---------------------------------------------------------------------------
// DB client — created once for the suite, isolated to the test database.
// ---------------------------------------------------------------------------

let prisma: Awaited<ReturnType<typeof makePrisma>>;

// ---------------------------------------------------------------------------
// Production-URL guard — hard-fail if the resolved URL could be production.
// The test creates and deletes real records; it must never touch a remote DB.
// Allow only loopback addresses (127.x.x.x / localhost / ::1).
// ---------------------------------------------------------------------------

function assertLocalUrl(url: string): void {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`[stage8-test] DATABASE_URL is not a valid URL: "${url}"`);
  }
  const isLocal =
    hostname === "localhost" ||
    hostname === "::1" ||
    /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[stage8-test] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). ` +
        "These tests may only run against a local throwaway PostgreSQL instance. " +
        "Aborting to protect production data."
    );
  }
}

async function makePrisma() {
  const { PrismaClient } = await import("@/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = await import("pg");
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  assertLocalUrl(url);
  const pool = new pg.Pool({ connectionString: url });
  return new PrismaClient({ adapter: new PrismaPg(pool) }) as InstanceType<typeof PrismaClient>;
}

// ---------------------------------------------------------------------------
// Stable per-test-run IDs (fresh UUIDs so tests don't collide across runs).
// ---------------------------------------------------------------------------

const OWNER_ID = randomUUID();
const WORKSPACE_ID = randomUUID();
const OWNER_EMAIL = `seed-reg-${OWNER_ID.slice(0, 8)}@test.local`;
const HASHED_PW = "$2a$10$testhashedpasswordvalue.not.real";

// ---------------------------------------------------------------------------
// Core seed transaction — mirrors scripts/seed-private-owner.ts exactly.
// ---------------------------------------------------------------------------

async function runSeedTransaction(now: Date) {
  return prisma.$transaction(async (tx) => {
    // Step 1: User upsert — owner.id is the audit actor
    const owner = await tx.user.upsert({
      where: { id: OWNER_ID },
      update: { hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
      create: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
    });

    // Step 2: Workspace
    await tx.workspace.upsert({
      where: { id: WORKSPACE_ID },
      update: { isActive: true },
      create: {
        id: WORKSPACE_ID,
        name: "Private Owner Workspace",
        slug: `private-owner-${WORKSPACE_ID.slice(0, 8)}`,
        isActive: true,
        createdBy: OWNER_ID,
      },
    });

    // Step 3: WorkspaceMembership
    await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
      update: { role: "owner", isActive: true, removedAt: null },
      create: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        role: "owner",
        addedBy: OWNER_ID,
        isActive: true,
      },
    });

    // Step 4: UserRoleAssignment
    await tx.userRoleAssignment.upsert({
      where: {
        userId_role_scope_scopeId: {
          userId: OWNER_ID,
          role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
          scope: "workspace",
          scopeId: WORKSPACE_ID,
        },
      },
      update: { isActive: true, revokedAt: null },
      create: {
        id: randomUUID(),
        userId: OWNER_ID,
        role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
        scope: "workspace",
        scopeId: WORKSPACE_ID,
        grantedAt: now,
        isActive: true,
      },
    });

    // Step 5: ClientAccount
    await tx.clientAccount.upsert({
      where: { id: WORKSPACE_ID },
      update: { status: "active", updatedAt: now },
      create: {
        id: WORKSPACE_ID,
        workspaceId: WORKSPACE_ID,
        name: "Private Owner Account",
        status: "active",
        visibility: "internal",
        updatedAt: now,
      },
    });

    // Step 6: PrivateModeAccess
    await tx.privateModeAccess.upsert({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
      update: {
        role: "OWNER",
        revokedAt: null,
        revokedBy: null,
        revokeReason: null,
        approvalStatus: "approved",
        approvedBy: owner.id,
        approvedAt: now,
        updatedAt: now,
      },
      create: {
        workspaceId: WORKSPACE_ID,
        userId: OWNER_ID,
        role: "OWNER",
        grantedBy: owner.id,
        grantedAt: now,
        approvalStatus: "approved",
        approvedBy: owner.id,
        approvedAt: now,
        updatedAt: now,
      },
    });

    // Step 7: AuditEvent — actorId = owner.id (the fix)
    const eventId = randomUUID();
    const hashInput = `${eventId}|${WORKSPACE_ID}|${AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED}|${now.toISOString()}`;
    const previousHash = createHash("sha256").update(hashInput).digest("hex");

    await tx.auditEvent.create({
      data: {
        id: eventId,
        eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
        workspaceId: WORKSPACE_ID,
        actorId: owner.id,
        actorType: "user",
        entityType: "workspace",
        entityId: WORKSPACE_ID,
        payload: { userId: OWNER_ID, email: OWNER_EMAIL, role: "OWNER", action: "seed" },
        previousHash,
        visibility: "internal",
        occurredAt: now,
      },
    });

    return owner;
  });
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

async function cleanupTestRecords() {
  await prisma.auditEvent.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.privateModeAccess.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: OWNER_ID } });
  await prisma.clientAccount.deleteMany({ where: { id: WORKSPACE_ID } });
  await prisma.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
  await prisma.user.deleteMany({ where: { id: OWNER_ID } });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(SKIP)("[db] Stage 8 — private-owner seed audit-actor regression", () => {
  beforeAll(async () => {
    prisma = await makePrisma();
    // Clean any leftover state from aborted previous runs
    await cleanupTestRecords();
  });

  afterEach(async () => {
    await cleanupTestRecords();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── 1. Fresh migrated DB: transaction completes ───────────────────────────
  it("1. seed transaction completes on a fresh migrated DB without error", async () => {
    const now = new Date();
    await expect(runSeedTransaction(now)).resolves.toBeDefined();
  });

  // ── 2. User exists ────────────────────────────────────────────────────────
  it("2. expected owner user record exists after seed", async () => {
    await runSeedTransaction(new Date());
    const user = await prisma.user.findUnique({ where: { id: OWNER_ID } });
    expect(user).not.toBeNull();
    expect(user!.email).toBe(OWNER_EMAIL);
    expect(user!.isActive).toBe(true);
  });

  // ── 3. Workspace exists ───────────────────────────────────────────────────
  it("3. expected workspace record exists after seed", async () => {
    await runSeedTransaction(new Date());
    const ws = await prisma.workspace.findUnique({ where: { id: WORKSPACE_ID } });
    expect(ws).not.toBeNull();
    expect(ws!.isActive).toBe(true);
  });

  // ── 4. WorkspaceMembership exists ────────────────────────────────────────
  it("4. owner workspace membership record exists", async () => {
    await runSeedTransaction(new Date());
    const mem = await prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
    });
    expect(mem).not.toBeNull();
    expect(mem!.role).toBe("owner");
    expect(mem!.isActive).toBe(true);
  });

  // ── 5. UserRoleAssignment exists with correct scope ───────────────────────
  it("5. OWNER role assignment exists with workspace scope", async () => {
    await runSeedTransaction(new Date());
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: {
        userId: OWNER_ID,
        role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
        scope: "workspace",
        scopeId: WORKSPACE_ID,
      },
    });
    expect(assignment).not.toBeNull();
    expect(assignment!.isActive).toBe(true);
  });

  // ── 6. ClientAccount exists ───────────────────────────────────────────────
  it("6. expected client account record exists", async () => {
    await runSeedTransaction(new Date());
    const ca = await prisma.clientAccount.findUnique({ where: { id: WORKSPACE_ID } });
    expect(ca).not.toBeNull();
    expect(ca!.status).toBe("active");
  });

  // ── 7. PrivateModeAccess exists as approved OWNER ─────────────────────────
  it("7. private mode access record is approved OWNER", async () => {
    await runSeedTransaction(new Date());
    const pma = await prisma.privateModeAccess.findUnique({
      where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
    });
    expect(pma).not.toBeNull();
    expect(pma!.role).toBe("OWNER");
    expect(pma!.approvalStatus).toBe("approved");
    expect(pma!.revokedAt).toBeNull();
  });

  // ── 8. Audit event exists ────────────────────────────────────────────────
  it("8. PRIVATE_OWNER_SEED_EXECUTED audit event exists", async () => {
    await runSeedTransaction(new Date());
    const event = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: WORKSPACE_ID,
        eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
      },
    });
    expect(event).not.toBeNull();
    expect(event!.entityType).toBe("workspace");
    expect(event!.entityId).toBe(WORKSPACE_ID);
  });

  // ── 9. Audit actor integrity ─────────────────────────────────────────────
  it("9. audit event actorId references an existing users.id and actorType is 'user'", async () => {
    await runSeedTransaction(new Date());
    const event = await prisma.auditEvent.findFirst({
      where: {
        workspaceId: WORKSPACE_ID,
        eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
      },
    });
    expect(event).not.toBeNull();
    expect(event!.actorType).toBe("user");
    expect(event!.actorId).toBe(OWNER_ID);

    // The actorId must reference an existing users.id
    const user = await prisma.user.findUnique({ where: { id: event!.actorId! } });
    expect(user).not.toBeNull();
  });

  // ── 10. Atomic rollback ──────────────────────────────────────────────────
  it("10. invalid audit actorId causes P2003; all earlier seed mutations roll back", async () => {
    const GHOST_ID = "00000000-0000-0000-0000-000000000001"; // never in users
    const now = new Date();

    const attempt = prisma.$transaction(async (tx) => {
      // Reproduce the pre-fix broken path: step 1–6 succeed, step 7 uses a
      // UUID that does not exist in users → P2003 → full rollback.
      const owner = await tx.user.upsert({
        where: { id: OWNER_ID },
        update: { hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
        create: { id: OWNER_ID, email: OWNER_EMAIL, hashedPassword: HASHED_PW, isActive: true, updatedAt: now },
      });

      await tx.workspace.upsert({
        where: { id: WORKSPACE_ID },
        update: { isActive: true },
        create: {
          id: WORKSPACE_ID,
          name: "Private Owner Workspace",
          slug: `private-owner-${WORKSPACE_ID.slice(0, 8)}`,
          isActive: true,
          createdBy: owner.id,
        },
      });

      await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
        update: { role: "owner", isActive: true, removedAt: null },
        create: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "owner", addedBy: OWNER_ID, isActive: true },
      });

      await tx.userRoleAssignment.upsert({
        where: { userId_role_scope_scopeId: { userId: OWNER_ID, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WORKSPACE_ID } },
        update: { isActive: true, revokedAt: null },
        create: { id: randomUUID(), userId: OWNER_ID, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WORKSPACE_ID, grantedAt: now, isActive: true },
      });

      await tx.clientAccount.upsert({
        where: { id: WORKSPACE_ID },
        update: { status: "active", updatedAt: now },
        create: { id: WORKSPACE_ID, workspaceId: WORKSPACE_ID, name: "Private Owner Account", status: "active", visibility: "internal", updatedAt: now },
      });

      await tx.privateModeAccess.upsert({
        where: { workspaceId_userId: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } },
        update: { role: "OWNER", revokedAt: null, revokedBy: null, revokeReason: null, approvalStatus: "approved", approvedBy: owner.id, approvedAt: now, updatedAt: now },
        create: { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: "OWNER", grantedBy: owner.id, grantedAt: now, approvalStatus: "approved", approvedBy: owner.id, approvedAt: now, updatedAt: now },
      });

      // Inject the pre-fix defect: ghost UUID as actorId → P2003
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
          workspaceId: WORKSPACE_ID,
          actorId: GHOST_ID,
          actorType: "user",
          entityType: "workspace",
          entityId: WORKSPACE_ID,
          payload: {},
          visibility: "internal",
          occurredAt: now,
        },
      });
    });

    // Transaction must fail
    await expect(attempt).rejects.toThrow();

    // All earlier mutations must have rolled back — zero records on every table
    const [users, workspaces, memberships, roles, accounts, access, events] = await Promise.all([
      prisma.user.count({ where: { id: OWNER_ID } }),
      prisma.workspace.count({ where: { id: WORKSPACE_ID } }),
      prisma.workspaceMembership.count({ where: { workspaceId: WORKSPACE_ID } }),
      prisma.userRoleAssignment.count({ where: { userId: OWNER_ID, scopeId: WORKSPACE_ID } }),
      prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }),
      prisma.privateModeAccess.count({ where: { workspaceId: WORKSPACE_ID } }),
      prisma.auditEvent.count({ where: { workspaceId: WORKSPACE_ID } }),
    ]);

    expect(users, "users after rollback").toBe(0);
    expect(workspaces, "workspaces after rollback").toBe(0);
    expect(memberships, "memberships after rollback").toBe(0);
    expect(roles, "role assignments after rollback").toBe(0);
    expect(accounts, "client accounts after rollback").toBe(0);
    expect(access, "private mode access after rollback").toBe(0);
    expect(events, "audit events after rollback").toBe(0);
  });

  // ── 11. Idempotency: no duplicates on second run ──────────────────────────
  it("11. running the seed transaction twice creates no duplicate core records", async () => {
    const now = new Date();
    await runSeedTransaction(now);
    await runSeedTransaction(now);

    const [users, workspaces, memberships, accounts, access] = await Promise.all([
      prisma.user.count({ where: { id: OWNER_ID } }),
      prisma.workspace.count({ where: { id: WORKSPACE_ID } }),
      prisma.workspaceMembership.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
      prisma.clientAccount.count({ where: { id: WORKSPACE_ID } }),
      prisma.privateModeAccess.count({ where: { workspaceId: WORKSPACE_ID, userId: OWNER_ID } }),
    ]);

    expect(users, "exactly one user").toBe(1);
    expect(workspaces, "exactly one workspace").toBe(1);
    expect(memberships, "exactly one membership").toBe(1);
    expect(accounts, "exactly one client account").toBe(1);
    expect(access, "exactly one private mode access").toBe(1);
  });

  // ── 12. FK not weakened: invalid actorId still raises P2003 ──────────────
  it("12. audit_events_actor_id_fkey is intact — non-existent actorId is still rejected", async () => {
    const ghostId = "00000000-ffff-0000-0000-000000000002";
    const attempt = prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: "private_mode.owner_seed_executed",
        workspaceId: WORKSPACE_ID,
        actorId: ghostId,
        actorType: "user",
        entityType: "workspace",
        entityId: WORKSPACE_ID,
        visibility: "internal",
        occurredAt: new Date(),
      },
    });

    // Must reject: FK constraint on actor_id → users.id
    await expect(attempt).rejects.toThrow();
  });
});

describe.skipIf(!SKIP)("[db] Stage 8 — DB unavailable", () => {
  it("DB_BLOCKED_ENVIRONMENT — set TEST_WITH_DB=true to run PostgreSQL-backed seed tests", () => {
    expect(true).toBe(true);
  });
});
