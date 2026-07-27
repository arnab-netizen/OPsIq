# Prisma Migration Deployment Runbook

**Document:** Migration Deployment Procedure  
**Last Updated:** 2026-05-21  
**Owner:** DevOps Team  
**Severity:** P0 Blocker

---

## Overview

This runbook documents the safe deployment of Prisma database migrations to production. OpsIQ currently has 158 migrations that must be deployed in order before the application can start.

---

## Quick Reference

```bash
# Verify migrations are ready
npx prisma migrate status

# Deploy migrations (run once during deployment)
npx prisma migrate deploy

# Verify deployment was successful
npx prisma validate
```

---

## Step-by-Step Deployment Procedure

### Phase 1: Pre-Deployment Validation (on developer machine)

```bash
# 1. Verify all migrations compile
npx prisma migrate status

# Expected output:
# > Migrations to apply:
# None. All migrations have been applied.

# 2. Verify schema is valid
npx prisma validate

# Expected output:
# Prisma schema loaded from prisma/schema.prisma.
# The schema at prisma/schema.prisma is valid 🚀
```

### Phase 2: Backup Production Database (10 min before deployment)

```bash
# On production database server
./scripts/backup-database.sh /backups/opsiq verify

# Expected output:
# Backup file created: opsiq_backup_2026-05-21_14-30-45.sql.gz
# Backup size: 245MB
# Checksum verified

# Verify backup exists and is >1MB
ls -lh /backups/opsiq/opsiq_backup_*.sql.gz | head -1
# Expected: opsiq_backup_2026-05-21_14-30-45.sql.gz 245M
```

### Phase 3: Deploy Migrations to Staging (1 hour before production)

```bash
# Set environment variables for staging
export DATABASE_URL="postgresql://user:password@staging.rds.example.com:5432/opsiq_staging?sslmode=require"

# Deploy migrations
npx prisma migrate deploy

# Expected output:
# Applying migration(s) 20260415_000000_init
# Applying migration(s) 20260415_add_finding_recommendation_stage
# ... (all 158 migrations)
# All migrations have been successfully applied.

# Verify all migrations applied
npx prisma migrate status
# Expected: No migrations pending
```

### Phase 4: Verify Staging Migration Success (5 min after staging deploy)

```bash
# Run smoke tests
npm run test:db

# Check database schema
psql "postgresql://user:password@staging.rds.example.com/opsiq_staging?sslmode=require" -c "\dt"

# Verify key tables exist
psql "postgresql://user:password@staging.rds.example.com/opsiq_staging?sslmode=require" -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' 
ORDER BY table_name;"

# Expected: All tables from schema.prisma present (User, Workspace, Engagement, etc.)
```

### Phase 5: Deploy to Production (during maintenance window)

```bash
# Set environment variables for production
export DATABASE_URL="postgresql://user:password@prod.rds.example.com:5432/opsiq_prod?sslmode=require"
export NODE_ENV=production

# Verify connection before deploying migrations
psql $DATABASE_URL -c "SELECT version();"
# Expected: PostgreSQL version output

# DEPLOY MIGRATIONS (this is the critical step)
npx prisma migrate deploy

# Expected output:
# Applying migration(s) 20260415_000000_init
# ... (should be quick if already applied)
# All migrations have been successfully applied.

# If already applied (second deployment):
# No pending migrations to apply.
```

### Phase 6: Verify Production Migration Success (immediately after)

```bash
# Verify schema is valid
npx prisma validate

# Expected: Schema valid ✓

# Check database schema
psql "postgresql://user:password@prod.rds.example.com/opsiq_prod?sslmode=require" -c "\dt"

# Verify migration history
psql "postgresql://user:password@prod.rds.example.com/opsiq_prod?sslmode=require" -c "
SELECT migration_name, rolled_back_at FROM _prisma_migrations 
ORDER BY finished_at DESC LIMIT 10;"

# Expected: All 158 migrations listed with rolled_back_at = NULL
```

### Phase 7: Start Application and Verify Health

```bash
# Start application (with DATABASE_URL set)
npm run start

# Verify health check
curl http://localhost:3000/api/health
# Expected: {"status": "healthy", "checks": {...}}

# Check application logs for errors
tail -f /var/log/opsiq/app.log
# Expected: No ERROR or CRITICAL logs about database schema
```

---

## Rollback Procedure (If migration fails)

### Scenario: Migration deployment failed or caused errors

```bash
# 1. Stop the application
systemctl stop opsiq

# 2. Restore database from backup
./scripts/restore-database.sh /backups/opsiq/opsiq_backup_2026-05-21_14-30-45.sql.gz

# Expected output:
# Restoring from backup: opsiq_backup_2026-05-21_14-30-45.sql.gz
# Restore completed successfully
# Database ready for use

# 3. Verify database restored
psql $DATABASE_URL -c "SELECT COUNT(*) FROM _prisma_migrations;"
# Should show migration count matching the previous working state

# 4. Redeploy previous application version
git checkout <previous-working-commit>
npm ci
npm run build

# 5. Start application with restored database
npm run start

# 6. Verify health
curl http://localhost:3000/api/health
```

---

## Important Notes

### Migration Safety Guarantees

- **Order Matters:** Migrations must apply in order (1, 2, 3, ...). Prisma enforces this.
- **Idempotent:** Running migrations twice is safe. Prisma tracks applied migrations in `_prisma_migrations` table.
- **No Downtime (usually):** Most OpsIQ migrations are safe to apply with live traffic:
  - Adding columns with defaults: safe
  - Adding tables: safe
  - Adding NOT NULL with backfill: safe (migration handles backfill)
  - Index creation: might cause brief locks

### When to Use Maintenance Mode

Enable maintenance mode (`systemctl start opsiq-maintenance`) if:
- Migration takes >30 seconds
- Modifying columns that are actively read/written
- High traffic period expected during deployment

### Migration Timeout

Default Prisma migration timeout is 5 minutes. If a migration takes longer:
- Check database lock status: `SELECT * FROM pg_locks;`
- Kill blocking queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%migration%';`
- Retry migration deployment

---

## Monitoring During Migration

Open a second terminal to monitor database activity:

```bash
# Watch database connections and locks
watch -n 1 'psql $DATABASE_URL -c "SELECT datname, usename, state FROM pg_stat_activity;"'

# Monitor slow queries
watch -n 1 'psql $DATABASE_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements WHERE query LIKE '%migration%' ORDER BY mean_exec_time DESC LIMIT 5;"'
```

---

## Common Issues and Solutions

### Issue: "Prisma schema warning: Preview feature 'driverAdapters' is deprecated"

**Solution:** This is a warning only. The schema still validates and migrations work fine. Can be ignored or removed from `prisma.schema` `previewFeatures`.

```prisma
// Currently in schema:
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["driverAdapters"]  // ← Can be removed
}
```

### Issue: Migration locks the database

**Solution:** Check for long-running queries blocking the migration:

```bash
psql $DATABASE_URL -c "
SELECT pid, usename, query, query_start FROM pg_stat_activity 
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%' 
ORDER BY query_start;"

# Kill blocking query (carefully!)
psql $DATABASE_URL -c "SELECT pg_terminate_backend(12345);"
```

### Issue: "relation already exists" error

**Solution:** Migrations were partially applied. Run `npx prisma migrate resolve --rolled-back <migration-name>` to mark as resolved, then retry.

```bash
npx prisma migrate resolve --rolled-back 20260415_000000_init
npx prisma migrate deploy
```

### Issue: Schema mismatch after migration

**Solution:** Regenerate Prisma client:

```bash
npm run db:generate
npx prisma validate
```

---

## Migration Timeline Example

```
2026-05-21 14:00 - Create backup
2026-05-21 14:10 - Verify backup
2026-05-21 14:15 - Deploy to staging
2026-05-21 14:20 - Verify staging (5 min test)
2026-05-21 18:00 - Start production maintenance window
2026-05-21 18:05 - Deploy migrations to production
2026-05-21 18:06 - Verify production schema
2026-05-21 18:07 - Start application
2026-05-21 18:08 - Verify health check
2026-05-21 18:10 - End maintenance window
2026-05-21 19:00 - Monitor logs for any issues
```

---

## Verification Checklist

- [ ] Pre-deployment: `npx prisma migrate status` shows no pending migrations
- [ ] Backup created and verified >1MB
- [ ] Staging deployment successful
- [ ] Staging migration verified (all tables exist)
- [ ] Production backup created
- [ ] Production migration deployed successfully
- [ ] `npx prisma validate` passes
- [ ] Health check endpoint returns 200
- [ ] Application logs show no database-related errors
- [ ] Customer-facing features work (test in browser)
- [ ] Database backups still exist (don't delete them yet!)

---

## Post-Deployment

### Keep these for at least 30 days:
- Database backup file
- Git commit hash of deployed version
- Migration deployment log output

### Cleanup (after 30 days):
```bash
# Clean old backups
./scripts/cleanup-old-backups.sh /backups/opsiq --keep-days=30
```

---

**Questions?** Contact DevOps team or refer to docs/DEPLOYMENT_RUNBOOK.md for full deployment context.
