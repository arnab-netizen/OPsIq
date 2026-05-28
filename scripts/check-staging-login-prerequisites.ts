// Check DB prerequisites for staging demo login
// Uses same Prisma + pg adapter pattern as seed.ts
// Must be run in environment with STAGING_DATABASE_URL access

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as bcrypt from "bcryptjs";

const { Pool } = pg;
const DEMO_EMAIL = "operator@demo.local";
const DEMO_PASSWORD = "demo-password-123";

async function checkLoginPrerequisites() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  if (/REPLACE_|PLACEHOLDER|your_neon_url|example\.com/.test(databaseUrl)) {
    console.error("DATABASE_URL contains placeholder value");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Check 1: User exists and has required auth fields
    const user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: {
        id: true,
        email: true,
        hashedPassword: true,
        isActive: true,
        name: true,
      },
    });

    if (!user) {
      console.log("USER_FOUND=false");
      process.exit(1);
    }

    console.log("USER_FOUND=true");
    console.log(`USER_EMAIL=${user.email}`);
    console.log(`USER_IS_ACTIVE=${user.isActive}`);
    console.log(`USER_HAS_PASSWORD=${!!user.hashedPassword}`);

    // Check 2: Password matches
    const passwordMatch = user.hashedPassword
      ? await bcrypt.compare(DEMO_PASSWORD, user.hashedPassword)
      : false;

    console.log(`PASSWORD_MATCH=${passwordMatch}`);

    if (!passwordMatch) {
      console.error("Password hash mismatch - demo user has wrong password");
      process.exit(1);
    }

    // Check 3: Workspace membership exists
    const membership = await prisma.workspaceMembership.findFirst({
      where: { userId: user.id, isActive: true },
      select: { id: true, workspaceId: true, role: true, isActive: true },
    });

    if (!membership) {
      console.log("MEMBERSHIP_FOUND=false");
      process.exit(1);
    }

    console.log("MEMBERSHIP_FOUND=true");
    console.log(`MEMBERSHIP_ROLE=${membership.role}`);
    console.log(`MEMBERSHIP_IS_ACTIVE=${membership.isActive}`);

    // Check 4: Workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: membership.workspaceId },
      select: { id: true, name: true },
    });

    if (!workspace) {
      console.log("WORKSPACE_FOUND=false");
      process.exit(1);
    }

    console.log("WORKSPACE_FOUND=true");
    console.log(`WORKSPACE_NAME=${workspace.name}`);

    // All prerequisites met
    console.log("\nLogin prerequisites verified successfully");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DB_CHECK_FAILED] ${errorMsg}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkLoginPrerequisites().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
