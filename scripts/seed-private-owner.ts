/**
 * Private deployment owner seed script.
 *
 * Creates the single private-mode owner account in a clean, idempotent way.
 * Wraps all creates/upserts in a single $transaction — any failure rolls back
 * the entire seed so the DB is never left in a partial state.
 *
 * Required env vars (exits 1 if any are absent):
 *   PRIVATE_OWNER_EMAIL          — email for the owner account
 *   PRIVATE_OWNER_PASSWORD       — plaintext password (min 12 chars); hashed here
 *   OPSIQ_PRIVATE_OWNER_USER_ID  — stable UUID for the User record
 *   OPSIQ_PRIVATE_WORKSPACE_ID   — stable UUID used for BOTH Workspace.id AND ClientAccount.id
 *   DATABASE_URL                 — Postgres connection string
 *
 * Set SEED_CONFIRM=true to skip the interactive confirmation prompt (for CI).
 */

import { randomUUID, createHash } from "crypto";
import * as bcrypt from "bcryptjs";
import * as readline from "readline";
import { ROLES } from "../src/domain/constants/roles";
import { AUDIT_EVENTS } from "../src/domain/constants/audit-events";
import type { PrismaClient } from "../src/generated/prisma/client";

// ---------------------------------------------------------------------------
// Env var validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: ${name} is required but not set.`);
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Seed transaction — exported so tests can exercise the exact production path.
// ---------------------------------------------------------------------------

export interface PrivateOwnerSeedParams {
  ownerId: string;
  workspaceId: string;
  email: string;
  hashedPassword: string;
  now: Date;
}

export async function runPrivateOwnerSeedTransaction(
  prisma: PrismaClient,
  params: PrivateOwnerSeedParams
): Promise<void> {
  const { ownerId, workspaceId, email, hashedPassword, now } = params;

  await prisma.$transaction(async (tx) => {
    // 1. User — upsert by stable UUID; returned ID is used as the audit actor below.
    const owner = await tx.user.upsert({
      where: { id: ownerId },
      update: {
        // Re-hash on each seed run so password changes are applied idempotently
        hashedPassword,
        isActive: true,
        updatedAt: now,
      },
      create: {
        id: ownerId,
        email,
        hashedPassword,
        isActive: true,
        updatedAt: now,
      },
    });
    console.log("  ✓ User upserted");

    // 2. Workspace — upsert by stable UUID
    await tx.workspace.upsert({
      where: { id: workspaceId },
      update: { isActive: true },
      create: {
        id: workspaceId,
        name: "Private Owner Workspace",
        slug: `private-owner-${workspaceId.slice(0, 8)}`,
        isActive: true,
        createdBy: ownerId,
      },
    });
    console.log("  ✓ Workspace upserted");

    // 3. WorkspaceMembership
    await tx.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: ownerId,
        },
      },
      update: { role: "owner", isActive: true, removedAt: null },
      create: {
        workspaceId,
        userId: ownerId,
        role: "owner",
        addedBy: ownerId,
        isActive: true,
      },
    });
    console.log("  ✓ Workspace membership upserted");

    // 4. UserRoleAssignment
    await tx.userRoleAssignment.upsert({
      where: {
        userId_role_scope_scopeId: {
          userId: ownerId,
          role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
          scope: "workspace",
          scopeId: workspaceId,
        },
      },
      update: { isActive: true, revokedAt: null },
      create: {
        id: randomUUID(),
        userId: ownerId,
        role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
        scope: "workspace",
        scopeId: workspaceId,
        grantedAt: now,
        isActive: true,
      },
    });
    console.log("  ✓ User role assignment upserted");

    // 5. ClientAccount — SAME UUID as Workspace (private deployment convention).
    //    PrivateModeAccess.workspaceId is a FK to ClientAccount.id, so this record
    //    is required before PrivateModeAccess can be created.
    await tx.clientAccount.upsert({
      where: { id: workspaceId },
      update: { status: "active", updatedAt: now },
      create: {
        id: workspaceId,
        workspaceId, // FK to Workspace.id (same UUID)
        name: "Private Owner Account",
        status: "active",
        visibility: "internal",
        updatedAt: now,
      },
    });
    console.log("  ✓ Client account upserted");

    // 6. PrivateModeAccess — upsert by unique (workspaceId, userId).
    //    workspaceId here = ClientAccount.id = workspaceId.
    await tx.privateModeAccess.upsert({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: ownerId,
        },
      },
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
        workspaceId,
        userId: ownerId,
        role: "OWNER",
        grantedBy: owner.id,
        grantedAt: now,
        approvalStatus: "approved",
        approvedBy: owner.id,
        approvedAt: now,
        updatedAt: now,
      },
    });
    console.log("  ✓ Private mode access upserted (role=OWNER, status=approved)");

    // 7. Audit event — transactionally atomic with all mutations above.
    //    AuditEvent fields: id, eventName, actorId, actorType, entityType,
    //    entityId, payload, correlationId, visibility, workspaceId, occurredAt,
    //    previousHash (chain hash — omitted here as this is the seed origin event).
    const eventId = randomUUID();
    const hashInput = `${eventId}|${workspaceId}|${AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED}|${now.toISOString()}`;
    const previousHash = createHash("sha256").update(hashInput).digest("hex");

    await tx.auditEvent.create({
      data: {
        id: eventId,
        eventName: AUDIT_EVENTS.PRIVATE_OWNER_SEED_EXECUTED,
        workspaceId,
        actorId: owner.id,
        actorType: "user",
        entityType: "workspace",
        entityId: workspaceId,
        payload: {
          userId: ownerId,
          email,
          role: "OWNER",
          action: "seed",
        },
        previousHash,
        visibility: "internal",
        occurredAt: now,
      },
    });
    console.log("  ✓ Audit event emitted (PRIVATE_OWNER_SEED_EXECUTED)");
  });
}

// ---------------------------------------------------------------------------
// DB confirmation
// ---------------------------------------------------------------------------

async function confirm(
  databaseUrl: string,
  email: string,
  ownerId: string,
  workspaceId: string
): Promise<void> {
  if (process.env.SEED_CONFIRM === "true") return;

  // Print sanitized host (strip credentials from URL)
  let sanitizedHost = "(unknown)";
  try {
    const url = new URL(databaseUrl);
    sanitizedHost = `${url.hostname}:${url.port || 5432}${url.pathname}`;
  } catch {
    sanitizedHost = "(invalid DATABASE_URL)";
  }

  console.log("");
  console.log("=== Private Owner Seed ===");
  console.log(`  Database host : ${sanitizedHost}`);
  console.log(`  Owner email   : ${email}`);
  console.log(`  User ID       : ${ownerId}`);
  console.log(`  Workspace ID  : ${workspaceId}`);
  console.log("");
  console.log("This will create (or upsert) the private owner account.");
  console.log("Set SEED_CONFIRM=true to skip this prompt.");
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question("Proceed? [yes/no]: ", (answer: string) => {
      rl.close();
      if (answer.trim().toLowerCase() === "yes") {
        resolve();
      } else {
        console.log("Aborted.");
        process.exit(0);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  // Dynamic imports match the established pattern in other seed scripts
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");

  const DATABASE_URL = requireEnv("DATABASE_URL");
  const PRIVATE_OWNER_EMAIL = requireEnv("PRIVATE_OWNER_EMAIL");
  const PRIVATE_OWNER_PASSWORD = requireEnv("PRIVATE_OWNER_PASSWORD");
  const OPSIQ_PRIVATE_OWNER_USER_ID = requireEnv("OPSIQ_PRIVATE_OWNER_USER_ID");
  const OPSIQ_PRIVATE_WORKSPACE_ID = requireEnv("OPSIQ_PRIVATE_WORKSPACE_ID");

  if (PRIVATE_OWNER_PASSWORD.length < 12) {
    console.error("ERROR: PRIVATE_OWNER_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  await confirm(DATABASE_URL, PRIVATE_OWNER_EMAIL, OPSIQ_PRIVATE_OWNER_USER_ID, OPSIQ_PRIVATE_WORKSPACE_ID);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;

  try {
    const now = new Date();
    const hashedPassword = await bcrypt.hash(PRIVATE_OWNER_PASSWORD, 10);

    await runPrivateOwnerSeedTransaction(prisma, {
      ownerId: OPSIQ_PRIVATE_OWNER_USER_ID,
      workspaceId: OPSIQ_PRIVATE_WORKSPACE_ID,
      email: PRIVATE_OWNER_EMAIL,
      hashedPassword,
      now,
    });

    console.log("");
    console.log("=== Seed Complete ===");
    console.log(`  Email        : ${PRIVATE_OWNER_EMAIL}`);
    console.log(`  User ID      : ${OPSIQ_PRIVATE_OWNER_USER_ID}`);
    console.log(`  Workspace ID : ${OPSIQ_PRIVATE_WORKSPACE_ID}`);
    console.log("");
    console.log("Next steps:");
    console.log("  1. Set the following in your deployment environment:");
    console.log(`       OPSIQ_PRIVATE_WORKSPACE_ID=${OPSIQ_PRIVATE_WORKSPACE_ID}`);
    console.log(`       OPSIQ_PRIVATE_OWNER_USER_ID=${OPSIQ_PRIVATE_OWNER_USER_ID}`);
    console.log("  2. Start the server: npm run dev (or production equivalent)");
    console.log("  3. Log in with the email and password configured above.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// Only run the seeder when executed directly (e.g. `npx tsx scripts/seed-private-owner.ts`).
// Importing this module for `runPrivateOwnerSeedTransaction` must NOT trigger the
// interactive confirmation prompt or env-var validation as a side effect.
if (process.argv[1] && process.argv[1].includes("seed-private-owner")) {
  (async () => {
    try {
      await seed();
    } catch (err) {
      console.error("Seed failed:", err);
      process.exit(1);
    }
  })();
}
