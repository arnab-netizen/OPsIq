# Daily Operations Report — Evidence

**What this is:** the output of the modular autonomous daily reporting system
(`src/lib/daily-report/`, orchestrated by `scripts/daily-report/run-daily-report.ts`).
Each run writes a JSON + Markdown pair here, mirroring the existing
`docs/opsiq/evidence/stage-7/artifacts/` convention.

## Design

- Every data source (Vercel, Neon, Metricool, GitHub Actions, internal DB records,
  Google Search Console, backup freshness) is an independent module implementing the
  same `SourceModule` interface (`src/lib/daily-report/types.ts`). A source that is
  blocked, misconfigured or errors out never prevents any other source from reporting —
  enforced twice: each module catches its own failure modes internally, and the
  orchestrator (`src/lib/daily-report/orchestrator.ts`) wraps every module in
  `Promise.allSettled` plus a per-module timeout as an independent safety net.
- Exactly six verification states exist for every metric: `VERIFIED`, `CONFIRMED_ZERO`,
  `UNAVAILABLE`, `STALE`, `BLOCKED`, `FAILED`. `CONFIRMED_ZERO` is reserved for a source
  that was successfully queried and genuinely returned zero — it is never used for
  "we have no data" or "we couldn't reach it."
- Every metric carries its source id, the reporting window it describes, the retrieval
  timestamp, and its status (`src/lib/daily-report/types.ts#Metric`).

## What's real vs. pending a credential in this sandbox

| # | Source | Status here | Why |
|---|---|---|---|
| 1 | Vercel runtime health | BLOCKED | No `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` in this sandbox. Fixture-tested for every other state. |
| 2 | Vercel Web Analytics | BLOCKED (would be UNAVAILABLE with a credential, per the known 404) | Same credential gap. Built against the documented endpoint contract so it activates the moment the 404 is fixed server-side. |
| 3 | Neon expenditure/usage | BLOCKED | No `NEON_API_KEY`/`NEON_PROJECT_ID`. |
| 4 | Metricool scheduled-post status | BLOCKED | No `METRICOOL_API_TOKEN`/`METRICOOL_BLOG_ID`/`METRICOOL_USER_ID`; no prior Metricool integration existed in this repo. |
| 5 | GitHub Actions schedule health | **Live** | Uses the already-authenticated `gh` CLI against this real repo. |
| 6 | Internal signup/activation/revenue records | BLOCKED | No `DATABASE_URL` in this sandbox; the real-query path mirrors `src/app/api/admin/overview/route.ts`'s own Prisma queries. |
| 7 | Google Search Console | BLOCKED (always, by design) | Deliberate stub — a real GSC integration is being built in a separate PR this session. |
| 8 | Backup freshness | **Live** | Same `gh` CLI transport as #5, against `scheduled-backup-r2.yml`'s real run history. |

`latest.json` / `latest.md` always reflect the most recent run; each run is also kept
under its own timestamped subdirectory for history.

## Running it

```
npm run daily-report
```

This is **not** wired into any cron/cloud routine yet — that is a deliberate follow-up
once this system has been reviewed.
