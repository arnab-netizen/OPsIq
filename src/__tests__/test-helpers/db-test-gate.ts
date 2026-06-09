/**
 * Database test gating helper
 *
 * When TEST_WITH_DB=false (CI environment without live database),
 * all tests that directly access the database via Prisma will fail
 * with "Can't reach database server" errors.
 *
 * This helper skips such tests unless explicitly run with TEST_WITH_DB=true.
 *
 * Usage:
 *   describe.skipIf(!SHOULD_RUN_DB_TESTS)("My DB test", () => {
 *     ...
 *   });
 */

export const SHOULD_RUN_DB_TESTS = process.env.TEST_WITH_DB === "true";
