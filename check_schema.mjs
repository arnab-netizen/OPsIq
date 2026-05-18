import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const requiredTables = ["workspace", "user", "decision", "action", "auditEvent", "webhookEvent"];

try {
  for (const table of requiredTables) {
    const result = await db.$queryRawUnsafe(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}')`
    );
    console.log(`${table}: ${result[0]?.exists ? '✓' : '✗'}`);
  }
} catch (error) {
  console.error("Error checking schema:", error.message);
} finally {
  await db.$disconnect();
}
