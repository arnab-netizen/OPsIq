# OpsIQ Daily Operations Report

Generated: 2026-11-17T17:19:51.185Z
Window: 2026-11-16T17:19:49.291Z -> 2026-11-17T17:19:49.291Z

## Summary

✅ VERIFIED: 1  ·  ➖ CONFIRMED_ZERO: 0  ·  ⚠️ UNAVAILABLE: 0  ·  ⏳ STALE: 2  ·  🔒 BLOCKED: 8  ·  ❌ FAILED: 2

## Sources

### Vercel runtime health (`vercel-runtime-health`)

- Ran 2026-11-17T17:19:49.293Z -> 2026-11-17T17:19:49.293Z (0ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| latest_deployment_state | 🔒 BLOCKED | - | VERCEL_TOKEN is not configured in this environment; no request was attempted. |

### Vercel Web Analytics (`vercel-web-analytics`)

- Ran 2026-11-17T17:19:49.293Z -> 2026-11-17T17:19:49.293Z (0ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| visits_count | 🔒 BLOCKED | - | VERCEL_TOKEN and VERCEL_PROJECT_ID not configured in this environment; no request was attempted. |

### Neon expenditure/usage (`neon-usage`)

- Ran 2026-11-17T17:19:49.293Z -> 2026-11-17T17:19:49.293Z (0ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| compute_time_seconds | 🔒 BLOCKED | - | NEON_API_KEY is not configured in this environment; no request was attempted. |

### Metricool scheduled-post status (`metricool-scheduled-posts`)

- Ran 2026-11-17T17:19:49.294Z -> 2026-11-17T17:19:49.294Z (0ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| scheduled_post_failures | 🔒 BLOCKED | - | METRICOOL_API_TOKEN and METRICOOL_BLOG_ID and METRICOOL_USER_ID not configured in this environment; no request was attempted. |

### GitHub Actions schedule health (`github-actions-schedule-health`)

- Ran 2026-11-17T17:19:49.294Z -> 2026-11-17T17:19:51.185Z (1891ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| restore-rehearsal.yml.last_run_status | ❌ FAILED | `{"runId":41283654309,"conclusion":"failure","createdAt":"2026-11-01T07:09:38Z"}` | restore-rehearsal.yml last run (#41283654309, created 2026-11-01T07:09:38Z) concluded "failure". |
| restore-rehearsal.yml.schedule_adherence | ✅ VERIFIED | `{"lastRunAt":"2026-11-01T07:09:38.000Z","crons":["0 7 1 * *"]}` | restore-rehearsal.yml's last run at 2026-11-01T07:09:38.000Z is within its own cron cadence (0 7 1 * *). |
| scheduled-backup.yml.last_run_status | ❌ FAILED | `{"runId":40644564258,"conclusion":"failure","createdAt":"2026-10-28T06:33:19Z"}` | scheduled-backup.yml last run (#40644564258, created 2026-10-28T06:33:19Z) concluded "failure". |
| scheduled-backup.yml.schedule_adherence | ⏳ STALE | `{"lastRunAt":"2026-10-28T06:33:19.000Z","crons":["17 6 * * *"]}` | scheduled-backup.yml's last run at 2026-10-28T06:33:19.000Z is overdue against its own cron cadence (17 6 * * *). |

### Internal signup/activation/revenue records (`internal-records`)

- Ran 2026-11-17T17:19:49.387Z -> 2026-11-17T17:19:49.387Z (0ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| signups | 🔒 BLOCKED | - | DATABASE_URL is not configured in this environment; no query was attempted. |
| activations | 🔒 BLOCKED | - | DATABASE_URL is not configured in this environment; no query was attempted. |
| revenue | 🔒 BLOCKED | - | DATABASE_URL is not configured in this environment; no query was attempted. |

### Google Search Console (`google-search-console`)

- Ran 2026-11-17T17:19:49.387Z -> 2026-11-17T17:19:49.387Z (0ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| search_console_status | 🔒 BLOCKED | - | no credential configured |

### Backup freshness (`backup-freshness`)

- Ran 2026-11-17T17:19:49.387Z -> 2026-11-17T17:19:50.273Z (886ms)

| Metric | Status | Value | Detail |
|---|---|---|---|
| last_successful_backup_age | ⏳ STALE | `{"latestRunId":44120603677,"latestConclusion":"failure","runsObserved":1}` | scheduled-backup-r2.yml has 1 run(s) but none succeeded (most recent concluded "failure"); no successful backup to measure freshness from. |

