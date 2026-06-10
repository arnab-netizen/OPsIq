import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';

// Load local env (developer machine / CI). Never required for the app to build,
// and must never contain committed real secrets.
config({ path: '.env.local', override: true });

// Datasource URL used by the Prisma CLI (migrate, validate, studio, generate).
// Resolution priority:
//   1. MIGRATION_DATABASE_URL — DIRECT (non-pooler) Neon URL for migrations.
//                               Supply this in the network-enabled deploy/CI env.
//   2. DATABASE_URL           — pooled runtime URL (fallback for local/dev).
//   3. DATABASE_URL_TEST      — test database.
//   4. local default          — keeps local/test workflows working with no secrets.
// NOTE: For Neon, migrations must use the DIRECT (non-pooler) endpoint. Do NOT
// point MIGRATION_DATABASE_URL at a "-pooler" host. See DB_MIGRATION_ENVIRONMENT_GUIDE.md.
const migrationDatasourceUrl =
  process.env.MIGRATION_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_TEST ||
  'postgresql://postgres:postgres@localhost:5432/opsiq_dev?schema=public';

export default defineConfig({
  datasource: {
    url: migrationDatasourceUrl,
  },
});
