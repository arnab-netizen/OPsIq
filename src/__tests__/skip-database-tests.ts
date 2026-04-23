/**
 * Skip database-dependent tests when DATABASE_URL is not accessible.
 * This allows the test suite to run in environments without a database.
 *
 * Set SKIP_DB_TESTS=1 to skip all database integration tests.
 * Or they'll auto-skip if database connection fails.
 */

import { describe, it } from "vitest";

const shouldSkipDbTests = () => {
  // Explicit skip via environment variable
  if (process.env.SKIP_DB_TESTS === "1") {
    return true;
  }

  // Skip if DATABASE_URL is not set or points to unreachable database
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost")) {
    // Only skip if we're not in a CI environment with actual database
    if (!process.env.CI) {
      return true;
    }
  }

  return false;
};

/**
 * Wraps describe() - skips all tests in the block if database is not available
 */
export function describeDatabase(name: string, fn: () => void) {
  if (shouldSkipDbTests()) {
    describe.skip(name, fn);
  } else {
    describe(name, fn);
  }
}

/**
 * Wraps it() - skips individual test if database is not available
 */
export function itDatabase(name: string, fn: any) {
  if (shouldSkipDbTests()) {
    it.skip(name, fn);
  } else {
    it(name, fn);
  }
}

export const skipDatabaseTests = shouldSkipDbTests();
