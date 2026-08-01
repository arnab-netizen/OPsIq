import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';
import {
  formatTargetLine,
  resolvePrismaDatasource,
  PrismaDatasourceError,
} from './src/infra/prisma-datasource';

// Load local env (developer machine only). In CI, GitHub Actions env vars take precedence.
// Never required for the app to build, and must never contain committed real secrets.
if (!process.env.CI) {
  config({ path: '.env.local', override: false });
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
//   - Mutation-capable commands (migrate, db push, db execute, db seed, studio)
//     fail closed when nothing was intentionally selected.
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
} catch (error) {
  if (error instanceof PrismaDatasourceError) {
    // Sanitized by construction: PrismaDatasourceError messages and notices
    // never carry a URL, host, username or password.
    for (const notice of error.notices) {
      console.error(`[prisma-datasource] ${notice}`);
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
