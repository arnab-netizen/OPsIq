// Verify demo user exists in staging database after seed
// Uses Prisma model verification (not raw SQL)
// Matches pg adapter pattern from src/infra/seed.ts

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

async function verifyDemoUser() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing for seed verification");
  }

  if (/REPLACE_|PLACEHOLDER|your_neon_url|example\.com/.test(databaseUrl)) {
    throw new Error("DATABASE_URL contains placeholder value");
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
    const user = await prisma.user.findUnique({
      where: { email: "operator@demo.local" },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new Error("Demo user not found after seed");
    }

    console.log("Demo user verified");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

verifyDemoUser().catch((error) => {
  console.error("[SEED_VERIFICATION_FAILED]", error.message);
  process.exit(1);
});
