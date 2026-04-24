export default async function globalSetup() {
  const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "Cannot run tests: DATABASE_URL or TEST_DATABASE_URL environment variable is not set.\n" +
      "Tests require a PostgreSQL database connection.\n" +
      "Set the connection string and try again:\n" +
      "  export DATABASE_URL='postgresql://user:password@localhost/dbname'\n" +
      "or\n" +
      "  export TEST_DATABASE_URL='postgresql://user:password@localhost/dbname'"
    );
  }

  // Apply test database schema
  try {
    const { execSync } = require("child_process");
    console.log("Global: Applying test database schema...");
    execSync("npx prisma db push --force-reset", {
      stdio: "inherit",
    });
    console.log("Global: Test database ready");
  } catch (error) {
    console.warn("Global: Database setup warning (may be expected):", error instanceof Error ? error.message : String(error));
  }
}

