import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const testDbPath = path.join(process.cwd(), "prisma", "test.db");

export async function setupTestDatabase() {
  // Clean up old test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Run migrations on test database
  try {
    execSync("npx prisma migrate deploy --schema=./prisma/schema.prisma", {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_PROVIDER: "sqlite",
        DATABASE_URL: `file:./prisma/test.db`,
        NODE_ENV: "test",
      },
    });
    console.log("✓ Test database initialized");
  } catch (e) {
    console.error("Failed to initialize test database:", e);
    throw e;
  }
}

export async function teardownTestDatabase() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}
