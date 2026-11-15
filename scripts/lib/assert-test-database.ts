/**
 * Side-effect guard for fixture/seed scripts that write test data: refuses to run unless
 * DATABASE_URL is a guarded test database (the runner's loopback throwaway database, or a
 * remote TEST database explicitly declared with OPSIQ_ALLOW_REMOTE_TEST_DB=true). Import it
 * FIRST so it runs before any database client is created. See src/infra/test-database-guard.ts.
 */
import { resolveTestDatabase } from "../../src/infra/test-database-guard";

resolveTestDatabase({ ...process.env, TEST_WITH_DB: "true" });
