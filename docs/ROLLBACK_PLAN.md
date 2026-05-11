# ROLLBACK PLAN — OpsIQ Phase 13+ Deployments

**Purpose:** Procedures for safely rolling back OpsIQ deployments  
**Scope:** Applicable to all production and staging deployments (Phase 13+)  
**Last Updated:** 2026-05-11  
**Frequency:** Test rollback procedure quarterly

---

## Triggering a Rollback

### Automatic Rollback Triggers
Automatically rollback if ANY of the following occur:

1. **Critical Error Rate:** Error rate exceeds 5% for >5 minutes
2. **Database Connection Failure:** Cannot connect to database for >2 minutes
3. **Application Crash:** Application restarts unexpectedly >3 times in 15 minutes
4. **Health Check Failure:** `GET /health` returns non-200 status for >2 minutes
5. **Data Loss Detected:** Audit trail shows unexpected data modifications
6. **Security Breach:** Unauthorized access or suspicious activity detected

### Manual Rollback Triggers
Manually trigger rollback if:

1. **Deployment Introduces Bugs:** Critical functionality broken (e.g., login fails, data export corrupted)
2. **Performance Degradation:** API response time >2 seconds (p95) or throughput drops >20%
3. **Stakeholder Request:** Product, security, or operations team requests rollback
4. **Unforeseen Infrastructure Issue:** Network, storage, or resource exhaustion occurs

---

## Rollback Procedures

### Scenario 1: Code Rollback (Most Common)

**Applies to:** Application code changes, configuration changes, non-schema changes  
**Estimated Duration:** 10-15 minutes  
**Data Impact:** None (code-only rollback is safe)

**Prerequisites:**
- Previous known-good commit SHA (from deployment log)
- SSH access to production environment
- Git permissions to revert/reset commits

**Steps:**

1. **Alert & Freeze**
   ```bash
   # Notify stakeholders
   # Post to status page: "Investigating deployment issue, may require rollback"
   # Pause any ongoing customer operations if possible
   ```

2. **Identify Rollback Point**
   ```bash
   # Find the last known-good commit
   git log --oneline -10
   # Example: abc1234 "STAGE 17 Slice 1: CI/CD Foundations"
   LAST_GOOD_COMMIT="abc1234"
   ```

3. **Stop Application**
   ```bash
   # Stop the application gracefully
   systemctl stop opsiq-api  # or: docker stop opsiq-api
   # Or: kill the process, then wait 10 seconds for connections to close
   ```

4. **Revert Code**
   ```bash
   # Option A: Reset to last known-good commit
   git reset --hard $LAST_GOOD_COMMIT
   git clean -fd
   
   # Option B: Revert the bad commit(s)
   git revert --no-edit abc1234..HEAD
   ```

5. **Rebuild Application**
   ```bash
   npm ci
   npm run build
   ```

6. **Verify Build**
   ```bash
   npm run test:quick  # Run fast tests only
   # OR: npx tsc --noEmit && npx prisma validate
   ```

7. **Start Application**
   ```bash
   npm run start  # or: systemctl start opsiq-api
   ```

8. **Health Check**
   ```bash
   # Wait 30 seconds for startup
   sleep 30
   
   # Verify health
   curl -s http://localhost:3000/health | jq .
   # Expected: { "status": "healthy", "checks": { "database": { "status": "healthy" } } }
   ```

9. **Verify Functionality**
   ```bash
   # Test critical paths (manually or via smoke tests)
   # - Can login
   # - Can create workspace
   # - Can access audit trail
   # - Can export decision
   ```

10. **Post-Rollback**
    ```bash
    # Monitor logs
    tail -f logs/opsiq.log
    
    # Alert stakeholders
    # Post to status page: "Rollback complete, system restored to <commit>"
    # Create incident report with root cause analysis
    ```

### Scenario 2: Database Rollback

**Applies to:** Schema migrations, data mutations, corrupted data  
**Estimated Duration:** 30+ minutes (depends on backup size)  
**Data Impact:** Any data written between backup and rollback is lost  
**Risk:** HIGH — only if data integrity is compromised

**Prerequisites:**
- Recent database backup verified and tested
- Database restore procedure documented and practiced
- Backup retention >= 7 days (to allow time for discovery of issues)

**Steps:**

1. **Stop Application Immediately**
   ```bash
   systemctl stop opsiq-api
   # Kill all application processes to prevent writes during restore
   pkill -9 node || true
   ```

2. **Determine Rollback Point**
   ```bash
   # Find the latest backup BEFORE the bad migration/mutation
   # Example: backup from 2026-05-11T14:00:00Z (before 15:30 deployment)
   ROLLBACK_BACKUP="opsiq-db-2026-05-11-14-00-00.sql.gz"
   ```

3. **Create Safeguard Backup**
   ```bash
   # Backup the current (corrupted) database for forensics
   pg_dump opsiq > /backups/opsiq-corrupted-2026-05-11-15-45-00.sql
   gzip /backups/opsiq-corrupted-2026-05-11-15-45-00.sql
   ```

4. **Restore Database**
   ```bash
   # Drop and recreate database
   psql -U postgres -d postgres -c "DROP DATABASE opsiq;"
   psql -U postgres -d postgres -c "CREATE DATABASE opsiq;"
   
   # Restore from backup
   gunzip < /backups/$ROLLBACK_BACKUP | psql -U postgres -d opsiq
   
   # Verify schema
   psql -U postgres -d opsiq -c "\dt"  # List tables
   ```

5. **Restart Application**
   ```bash
   npm run start
   
   # Verify health
   sleep 30
   curl -s http://localhost:3000/health | jq .
   ```

6. **Verify Data Integrity**
   ```bash
   # Run integrity checks
   npx prisma validate
   
   # Count records to verify recovery
   psql -U postgres -d opsiq -c "SELECT COUNT(*) FROM audit_events;"
   ```

7. **Restore Code to Pre-Migration Version** (if needed)
   ```bash
   # Revert to code version compatible with restored schema
   git reset --hard <pre-migration-commit>
   npm ci
   npm run build
   npm run start
   ```

8. **Post-Rollback**
   ```bash
   # Monitor for data consistency
   # Notify affected users (data since backup time is lost)
   # Create incident report with forensic analysis
   ```

### Scenario 3: Full Environment Rollback

**Applies to:** Infrastructure changes, deployment platform issues  
**Estimated Duration:** 1+ hour  
**Data Impact:** Depends on backup strategy

**Steps:**

1. **Failover to Standby** (if available)
   ```bash
   # Switch DNS to standby environment
   # OR: Redirect traffic to read-only replica while primary recovers
   ```

2. **Revert Infrastructure Changes**
   ```bash
   # Rollback Terraform / CloudFormation / manual infrastructure changes
   # Verify all components (network, storage, database, application) operational
   ```

3. **Restore from Snapshot** (if available)
   ```bash
   # Restore VM snapshot from before deployment
   # Restore database snapshot from before deployment
   ```

4. **Health Check & Testing**
   ```bash
   # Full smoke test suite
   # Verify all customer-facing functionality
   ```

---

## Recovery Artifacts

### For Code-Only Rollback
- Git commit history allows instant rollback
- All commits remain in local history and git log
- Recovery artifacts (patch, bundle) available in `docs/opsiq-main-sync-latest.*`

### For Database Rollback
- Daily backup strategy: Retain 7+ days of backups
- Point-in-time recovery (PITR): Keep WAL logs for 72+ hours
- Backup verification: Test restore weekly to separate database

### For Catastrophic Failure
- Full VM snapshot: Daily snapshots retained for 30 days
- Database snapshot: Separate from transaction logs
- Manual recovery from recovery artifacts in `docs/` directory

---

## Testing & Validation

### Rollback Drills (Quarterly)

**Code rollback drill (30 minutes):**
1. Tag current commit as "drill-backup"
2. Deploy a test commit (or revert 1 commit)
3. Practice code rollback procedure
4. Verify application works
5. Reset to "drill-backup"

**Database rollback drill (1 hour):**
1. Create test database copy from production backup
2. Practice restore procedure on test copy
3. Verify data integrity and application functionality
4. Document any issues or improvements

### Post-Deployment Testing (Mandatory after every deployment)

1. Health check passes (200 OK)
2. Critical user journeys work (login, create, export)
3. No errors in logs (ERROR level or higher)
4. Performance baseline maintained (response time, throughput)
5. Audit trail records expected events

---

## Decision Matrix: Rollback vs. Hotfix

| Situation | Rollback | Hotfix | Decision |
|-----------|----------|--------|----------|
| Critical bug in new feature | ✓ Faster | X | Rollback if bug in <24 hours |
| Data corruption | ✓ Required | X | Always rollback, hotfix schema after |
| Performance degradation | ✓ Safe | ✓ If root cause known | Rollback if cause unclear |
| Security vulnerability | ✓ Immediate | ✓ If patch tested | Rollback immediately, hotfix later |
| Non-critical bug | X | ✓ Preferred | Hotfix on next release cycle |
| Infrastructure failure | ✓ Recovers fast | X | Rollback while debugging infra |

---

## Communication Template

### Rollback Announcement (Internal)
```
Subject: [INCIDENT] OpsIQ Production Rollback - <timestamp>

Team,

We've initiated a rollback of deployment <commit SHA> due to <reason>.

Timeline:
- <time> - Issue detected
- <time> - Rollback started
- <time> - Rollback complete
- <time> - System verified healthy

Impact:
- Duration: <X> minutes of degraded service
- Affected users: <who>
- Data loss: <if any>

Next steps:
1. Root cause analysis (post-mortem)
2. Fix and testing
3. Redeploy with improved testing

Updates: [status page link]
```

### Rollback Announcement (Customer-Facing)
```
We experienced a brief service disruption (<X minutes) while deploying updates to OpsIQ. 

The issue was detected and immediately rolled back. All systems are now operating normally.

If you experienced data loss or have questions, please contact support@opsiq.com.

We apologize for the inconvenience and are implementing additional safeguards.
```

---

## Rollback Runbook (Quick Reference)

**Code Rollback (Emergency)**
```bash
git log --oneline -5                                    # Find last good commit
git reset --hard <commit_sha>                           # Revert
npm ci && npm run build                                 # Rebuild
npm run start                                           # Restart
curl http://localhost:3000/health | jq .               # Verify
```

**Database Rollback (Emergency)**
```bash
systemctl stop opsiq-api                                # Stop app
pg_dump opsiq > /backups/opsiq-corrupted-$(date +%s).sql  # Safeguard
gunzip < /backups/opsiq-db-2026-05-11-14-00-00.sql.gz | psql -U postgres -d opsiq  # Restore
npm run start                                           # Restart
curl http://localhost:3000/health | jq .               # Verify
```

---

**Last Rollback:** Never (Phase 13 is first deployment)  
**Next Drill:** 2026-08-11 (quarterly)  
**Maintained By:** DevOps / Operations Team
