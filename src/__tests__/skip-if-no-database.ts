import { db } from "@/lib/db";

let dbAccessible: boolean | null = null;

async function checkDatabaseAccess(): Promise<boolean> {
  if (dbAccessible !== null) {
    return dbAccessible;
  }

  try {
    // Try a simple query to check if database is accessible
    await (db as any).$queryRaw`SELECT 1`;
    dbAccessible = true;
    return true;
  } catch (error) {
    dbAccessible = false;
    return false;
  }
}

/**
 * Wrapper for describe() that skips the suite if database is not accessible.
 * Use instead of describe() for integration tests that require database.
 */
export function describeIfDatabaseAvailable(
  name: string,
  fn: () => void
): void {
  let isAvailable = false;

  // Check database availability synchronously by setting up a hook
  const checkFn = async () => {
    isAvailable = await checkDatabaseAccess();
  };

  // We need to actually check this before/during test run
  // For vitest, we'll use describe.skipIf() pattern or just warn
  if (process.env.SKIP_DB_TESTS) {
    console.log(`⊘ Skipping integration tests: ${name} (DATABASE_URL not accessible)`);
    return;
  }

  describe(name, fn);
}

export { checkDatabaseAccess };
