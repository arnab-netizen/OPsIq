/**
 * Preview-only QA owner seed script.
 *
 * Creates ONE self-serve-owner test identity for exercising the real Preview
 * deployment without depending on public signup + a real mailbox. This is
 * NOT a signup replacement and NOT a backdoor role: it inserts exactly the
 * same account-graph shape POST /api/auth/signup writes (User, Workspace,
 * WorkspaceMembership.role="owner", UserRoleAssignment.role=
 * ADMIN_OR_PORTFOLIO_MANAGER scoped to that one workspace, three
 * PolicyAcceptance rows, one EmailVerificationToken, three AuditEvent rows)
 * -- see src/app/api/auth/signup/route.ts, the single source of truth this
 * script mirrors. The only deliberate deviation is marking the email
 * verified immediately (User.emailVerifiedAt/requiresEmailVerification and
 * the verification token's usedAt), since this script exists specifically to
 * bypass the "no mailbox in this environment" limitation -- never do this for
 * a real user account.
 *
 * getCapabilitiesForRole (src/policies/capability-check.ts) narrows
 * ADMIN_OR_PORTFOLIO_MANAGER to the small self-serve OWNER_SCOPED_CAPABILITIES
 * bundle whenever WorkspaceMembership.role === "owner" -- exactly what this
 * script writes -- so the resulting account is a genuine self-serve owner,
 * never SYSTEM_ADMIN, Internal, or a full-bundle Portfolio Manager.
 *
 * Fails closed: refuses to run against any DATABASE_URL whose host is not
 * on the explicit Preview allowlist below (PREVIEW_HOST_ALLOWLIST). There is
 * no "block production" denylist -- only an allowlist -- so an unrecognized
 * or misconfigured host is refused by default, not merely a known-production
 * host.
 *
 * Usage:
 *   DATABASE_URL=<preview-branch-connection-string> npx tsx scripts/seed-preview-qa-owner.ts
 *
 * The generated password is printed once to this script's own stdout and
 * nowhere else -- callers are responsible for not pasting it into a shared
 * or logged channel.
 */

import { randomUUID, randomBytes, createHash } from "crypto";
import type { PrismaClient, Prisma } from "../src/generated/prisma/client";

/**
 * Exact hostnames this script is allowed to write to. Update only when the
 * Preview branch's compute endpoint changes (e.g. after a Neon branch
 * reset) -- never widen this to a pattern match, and never add a production
 * host.
 */
const PREVIEW_HOST_ALLOWLIST = [
  "ep-twilight-feather-ay3l6dox-pooler.c-5.us-east-2.aws.neon.tech",
  "ep-twilight-feather-ay3l6dox.c-5.us-east-2.aws.neon.tech",
];

function assertPreviewTarget(databaseUrl: string): void {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    console.error("ERROR: DATABASE_URL is not a valid connection string.");
    process.exit(1);
  }
  if (!PREVIEW_HOST_ALLOWLIST.includes(host)) {
    console.error(
      `REFUSED: host "${host}" is not on the Preview allowlist. ` +
      `This script only ever writes to a known Preview branch endpoint. ` +
      `Update PREVIEW_HOST_ALLOWLIST in this file if the Preview branch's ` +
      `endpoint has legitimately changed -- never point this at production.`
    );
    process.exit(1);
  }
}

async function seed(): Promise<void> {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is required.");
    process.exit(1);
  }
  assertPreviewTarget(DATABASE_URL);

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const bcrypt = await import("bcryptjs");

  const pool = new Pool({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClient;

  try {
    const timestamp = Date.now();
    const email = `preview-owner-qa-${timestamp}@example.invalid`;
    const password = randomBytes(18).toString("base64url");
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const workspaceName = "Preview QA Owner Workspace";
    const baseSlug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
    const slug = `${baseSlug}-${workspaceId.slice(0, 8)}`;
    const rawVerificationToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawVerificationToken).digest("hex");

    const { ROLES } = await import("../src/domain/constants/roles");
    const { AUDIT_EVENTS } = await import("../src/domain/constants/audit-events");

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          email,
          hashedPassword,
          isActive: true,
          requiresEmailVerification: false,
          emailVerifiedAt: now,
          updatedAt: now,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          id: workspaceId,
          name: workspaceName,
          slug,
          createdBy: user.id,
          isActive: true,
          signupSource: "PUBLIC_BETA",
        },
      });

      await tx.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, role: "owner", addedBy: user.id, isActive: true },
      });

      await tx.userRoleAssignment.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER,
          scope: "workspace",
          scopeId: workspace.id,
          grantedAt: now,
          isActive: true,
        },
      });

      for (const [policyType, version] of [
        ["TERMS", "2026-09-05"],
        ["PRIVACY", "2026-09-05"],
        ["BETA_NOTICE", "2026-09-05"],
      ]) {
        await tx.policyAcceptance.create({
          data: { id: randomUUID(), userId: user.id, policyType, version },
        });
      }

      await tx.emailVerificationToken.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          usedAt: now,
        },
      });

      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          eventName: AUDIT_EVENTS.USER_CREATED,
          actorId: user.id,
          workspaceId: workspace.id,
          payload: { email, workspaceName, signupSource: "PUBLIC_BETA", seedMechanism: "preview-qa-owner-seed" },
          visibility: "internal",
          occurredAt: now,
        },
      });
    });

    console.log("=== Preview QA Owner Created ===");
    console.log(`  Email    : ${email}`);
    console.log(`  Password : ${password}`);
    console.log(`  UserId   : ${userId}`);
    console.log(`  WorkspaceId : ${workspaceId}`);
    console.log("Store this password securely -- it is never logged anywhere else.");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (process.argv[1] && /[/\\]seed-preview-qa-owner\.[cm]?[jt]s$/.test(process.argv[1])) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

export { assertPreviewTarget, PREVIEW_HOST_ALLOWLIST };
