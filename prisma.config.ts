import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';
import {
  loadDotenvWithoutAuthorization,
  formatTargetLine,
  resolvePrismaDatasource,
  PrismaDatasourceError,
} from './src/infra/prisma-datasource';
import { TestDatabaseGuardError, verifyRemoteTestDatabaseIdentity } from './src/infra/test-database-guard';
import { readDatabaseIdentity } from './src/infra/pg-database-identity-reader';

// Load local env (developer machine only). In CI, GitHub Actions env vars take precedence.
// Never required for the app to build, and must never contain committed real secrets.
//
// A dotenv file may supply connection strings but NEVER database-mutation AUTHORIZATION: a copied or stale
// .env.local that carries OPSIQ_DB_TARGET / OPSIQ_ALLOW_PRODUCTION_DB_COMMAND would otherwise authorize a
// mutation the operator never intended. Authorization must come from the invoking environment.
if (!process.env.CI) {
  loadDotenvWithoutAuthorization(process.env, () => {
    config({ path: '.env.local', override: false });
  });
}

// Datasource selection is explicit and fails closed. The full contract and the
// incident it prevents are documented in src/infra/prisma-datasource.ts:
//
//   - MIGRATION_DATABASE_URL is NEVER used implicitly. Selecting a production
//     datasource requires OPSIQ_DB_TARGET=production together with
//     OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true.
//   - Ordinary resolution is DATABASE_URL -> DATABASE_URL_TEST -> built-in
//     local default, so `prisma validate` and `prisma generate` keep working
//     with no configuration (postinstall, Vercel build, ci.yml).
//   - Mutation-capable commands (migrate dev/deploy/reset/resolve, db push,
//     db execute, db seed, studio) have NO implicit datasource: they refuse
//     without an explicit OPSIQ_DB_TARGET, and the target is proven against the
//     datasource (loopback for local/ci, approved test branch identity for a
//     remote test database, approved endpoint for staging). --url is refused.
//
// For Neon, migrations must still use the DIRECT (non-pooler) endpoint. Do NOT
// point MIGRATION_DATABASE_URL at a "-pooler" host. See DB_MIGRATION_ENVIRONMENT_GUIDE.md.
//
// Only the sanitized logical target is printed — never the URL, host, username,
// password or database name.
let datasourceUrl: string;
try {
  const resolved = resolvePrismaDatasource({ env: process.env, argv: process.argv });
  datasourceUrl = resolved.url;
  for (const notice of resolved.notices) {
    console.error(`[prisma-datasource] ${notice}`);
  }
  console.error(`[prisma-datasource] ${formatTargetLine(resolved)}`);
  if (resolved.requiresApprovedTestIdentity) {
    // A remote TEST datasource is mutated only after its in-database identity positively matches the approved
    // OpsIQ test branch (the same primitives the DB test guard uses). Read-only; production, unknown, unrelated
    // or unreadable identity fails closed. Messages carry variable names and refusal codes only.
    await verifyRemoteTestDatabaseIdentity(
      [{ name: 'TEST_DATABASE_URL', url: resolved.url }],
      process.env,
      readDatabaseIdentity
    );
    console.error('[prisma-datasource] remote test database identity verified');
  }
} catch (error) {
  if (error instanceof PrismaDatasourceError || error instanceof TestDatabaseGuardError) {
    // Sanitized by construction: these messages and notices never carry a URL,
    // host, username, password or database name.
    if (error instanceof PrismaDatasourceError) {
      for (const notice of error.notices) {
        console.error(`[prisma-datasource] ${notice}`);
      }
    }
    console.error(`[prisma-datasource] REFUSED: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

export default defineConfig({
  datasource: {
    url: datasourceUrl,
  },
});
