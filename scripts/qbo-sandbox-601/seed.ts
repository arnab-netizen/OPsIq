/**
 * Seeds the MINIMUM tenancy for the PR #601 real Intuit Sandbox OAuth test into the isolated, empty database
 * `qbo_sandbox_601`: one verified test owner (same account-graph shape as POST /api/auth/signup and
 * scripts/seed-preview-qa-owner.ts), one workspace, one owner membership, and ONE active, non-fixture OwnerBusiness.
 *
 * Refuses unless DATABASE_URL names database qbo_sandbox_601 as role qbo_sandbox_601_app AND the database is empty
 * (no existing workspace). The generated password is printed once to this script's own stdout and nowhere else.
 *
 *   DATABASE_URL=<qbo_sandbox_601 direct url> npx tsx scripts/qbo-sandbox-601/seed.ts
 */
import { randomUUID, randomBytes, createHash } from "crypto";
import { assertSandboxDatabase } from "./guard";

async function main(): Promise<void> {
  const databaseUrl = assertSandboxDatabase(process.env.DATABASE_URL);
  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const bcrypt = await import("bcryptjs");
  const { ROLES } = await import("../../src/domain/constants/roles");
  const { AUDIT_EVENTS } = await import("../../src/domain/constants/audit-events");

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    if ((await prisma.workspace.count()) > 0 || (await prisma.user.count()) > 0) {
      console.error("REFUSED: the sandbox database is not empty. This seed runs once, on an empty database.");
      process.exit(1);
    }
    const now = new Date();
    const email = `qbo-sandbox-owner-${Date.now()}@example.invalid`;
    const password = randomBytes(18).toString("base64url");
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const businessId = randomUUID();
    const workspaceName = "QBO Sandbox 601 Workspace";
    const slug = `qbo-sandbox-601-${workspaceId.slice(0, 8)}`;
    const tokenHash = createHash("sha256").update(randomBytes(32).toString("hex")).digest("hex");

    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: { id: userId, email, hashedPassword, isActive: true, requiresEmailVerification: false, emailVerifiedAt: now, updatedAt: now },
      });
      await tx.workspace.create({
        data: { id: workspaceId, name: workspaceName, slug, createdBy: userId, isActive: true, signupSource: "PUBLIC_BETA" },
      });
      await tx.workspaceMembership.create({
        data: { workspaceId, userId, role: "owner", addedBy: userId, isActive: true },
      });
      await tx.userRoleAssignment.create({
        data: { id: randomUUID(), userId, role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: workspaceId, grantedAt: now, isActive: true },
      });
      for (const [policyType, version] of [["TERMS", "2026-09-05"], ["PRIVACY", "2026-09-05"], ["BETA_NOTICE", "2026-09-05"]]) {
        await tx.policyAcceptance.create({ data: { id: randomUUID(), userId, policyType, version } });
      }
      await tx.emailVerificationToken.create({
        data: { id: randomUUID(), userId, tokenHash, expiresAt: new Date(now.getTime() + 7 * 86_400_000), usedAt: now },
      });
      await tx.ownerBusiness.create({
        data: {
          id: businessId, workspaceId, name: "QBO Sandbox Test Business", businessType: "generic_local_service",
          currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: userId,
        },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(), eventName: AUDIT_EVENTS.USER_CREATED, actorId: userId, workspaceId,
          payload: { email, workspaceName, seedMechanism: "qbo-sandbox-601-seed" }, visibility: "internal", occurredAt: now,
        },
      });
    });

    console.log("=== QBO Sandbox 601 owner created ===");
    console.log(`  Email       : ${email}`);
    console.log(`  Password    : ${password}`);
    console.log(`  WorkspaceId : ${workspaceId}`);
    console.log(`  BusinessId  : ${businessId}`);
    console.log("Keep the password private: it is printed here once and stored nowhere else.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.name : "error");
  process.exit(1);
});
