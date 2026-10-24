> **LEGACY — DO NOT USE FOR CURRENT OPSIQ LAUNCH.** This Rebilix-era material is stale. See `docs/opsiq/marketing/PRODUCT_DEMO_CAPTURE.md` for the current plan.

# Rebilix — Product Hunt Launch Checklist

Production baseline at time of writing: main `dad83b67` deployed; production migration succeeded;
all four production smoke workflows passed; public landing live; signup → diagnosis → dashboard
live-proven; free beta (no payment provider). Keep this file in sync with reality.

---

## Pre-launch (T‑minus 1–3 days)
- [ ] Confirm `main` is green in CI and the deployed commit matches: `GET /api/internal/build-info`
      returns the intended `commit` and `environment = production`.
- [ ] Re-run all four production smokes and confirm green:
      `smoke-production-login`, `smoke-production-signup-dashboard`,
      `smoke-production-diagnosis-dashboard`, `smoke-production-dashboard`.
      (If `smoke-production-dashboard` fails on the diagnostic-key proof endpoint, confirm the Vercel
      `OPSIQ_DIAGNOSTIC_KEY` exactly matches the GitHub Actions secret, redeploy, re-run — this does
      not block the public stranger flow.)
- [ ] Manually walk the stranger path on production: `/` (landing 200) → `/signup` → run a diagnosis →
      see findings/recommendations/actions on the dashboard.
- [ ] Verify `/api/health` 200 and `/api/readiness` 200 on production.
- [ ] Confirm `support@opsiq.solutions` inbox is monitored and auto-reply (optional) is set.
- [ ] Confirm landing copy, tagline, and screenshots all reflect "free beta / no payment / no AI key".
- [ ] Decide demo workspace: seed a demo (`npm run demo:seed` against prod) only if you want a
      ready-made example; otherwise rely on live signup.
- [ ] Stage Product Hunt assets: name, tagline, description, gallery images, demo video, first comment
      (all from `LAUNCH_COPY.md` and `SCREENSHOT_AND_DEMO_PLAN.md`).
- [ ] Brief anyone helping reply to comments; share the FAQ and the 5 prepared replies.
- [ ] Confirm rollback path is understood (see Rollback criteria below).

## Launch day (T‑0)
- [ ] Publish the Product Hunt listing at the planned time.
- [ ] Post the maker's first comment immediately.
- [ ] Pin the free-beta + "what it does / doesn't do" framing in the first comment.
- [ ] Watch production health: keep `/api/health` and `/api/readiness` open; spot-check signup.
- [ ] Respond to every comment within ~30–60 min using the prepared replies/FAQ as a base.
- [ ] Triage any "it broke for me" report immediately (see Bug triage).
- [ ] Track signups and completed diagnoses informally (count, not PII).

## First 24 hours
- [ ] Re-run the diagnosis smoke at least twice (e.g., morning/evening) to catch deploy/env drift.
- [ ] Skim logs (Vercel) and, if configured, Sentry for new error spikes.
- [ ] Collect every bug/confusion point into a single triage list with severity.
- [ ] Keep replying; convert recurring questions into new FAQ entries.
- [ ] Confirm no unexpected paid-provider errors (there should be none — billing is dormant).

## First 7 days
- [ ] Daily: one full stranger-path manual check + one diagnosis smoke run.
- [ ] Group feedback into themes (onboarding clarity, diagnosis accuracy, missing recovery flows).
- [ ] Prioritize the highest-signal product fixes as separate, governed slices (not hotfixes on main).
- [ ] Update `LAUNCH_COPY.md` "what it does not yet do" as gaps close.
- [ ] Decide whether/when account-recovery (password reset) and billing move from roadmap to a slice.

## Support monitoring
- [ ] `support@opsiq.solutions` checked at least 2–3×/day during launch week.
- [ ] Use `docs/support/SUPPORT.md` as the canonical response source.
- [ ] Log each support contact (issue type, resolution) to spot patterns.
- [ ] For account lockouts during beta, follow the manual recovery note in the support doc.

## Bug triage
- [ ] **P0 (launch-blocking):** signup broken, diagnosis 500s, dashboard won't load, health/readiness
      red, or production serving the wrong commit → see Rollback criteria.
- [ ] **P1 (must-fix soon):** a real flow works but errors intermittently or shows unsafe error text.
- [ ] **P2 (should-fix):** confusing copy, empty-state guidance, minor UI.
- [ ] **P3 (nice-to-have):** polish, roadmap items.
- [ ] For each P0/P1, capture: exact URL, steps, HTTP status, safe response snippet, deployed commit.
- [ ] Fix forward via a governed branch + CI-green merge — never weaken guardrails or quarantine.

## Smoke rerun schedule
- [ ] Pre-launch: all four smokes green.
- [ ] Launch day: diagnosis + signup smokes at launch, then ~every 4–6 hours.
- [ ] First 24h: at least 2 full smoke passes.
- [ ] First 7 days: at least 1 diagnosis smoke per day; full pass after any redeploy.
- [ ] After ANY production deploy: full four-smoke pass before considering it verified.

## Rollback criteria (trigger if any are true and not fixable in minutes)
- [ ] Signup, login, or diagnosis returns 5xx for real users.
- [ ] Dashboard fails to load the diagnosis result for new users.
- [ ] `/api/health` or `/api/readiness` red in production.
- [ ] `build-info` shows a commit that was not intended / a broken deploy.
- [ ] Data-safety concern (any cross-workspace data exposure).

**Rollback action:** redeploy the last known-good commit on Vercel (the prior healthy deployment),
re-run the four smokes, confirm `build-info` shows the good commit, then post a brief status note.
Database migrations are additive/forward-only — do **not** attempt a destructive DB rollback; consult
`docs/MIGRATION_DEPLOYMENT_RUNBOOK.md` / `docs/ROLLBACK_RUNBOOK.md` before touching the database.
